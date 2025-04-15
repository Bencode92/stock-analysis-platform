// Fichier JS pour simulateur de PTZ

class PTZSimulator {
    constructor({
        projectType,
        zone,
        income,
        householdSize,
        totalCost,
        cityName = null
    }) {
        this.projectType = projectType;
        this.zone = zone;
        this.income = income;
        this.householdSize = householdSize;
        this.totalCost = totalCost;
        this.cityName = cityName;
        
        // Plafonds de revenus selon zone et nombre de personnes
        this.incomeLimits = {
            'A': [49000, 73500, 88200, 102900, 117600, 132300, 147000, 161700],
            'B1': [34500, 51750, 62100, 72450, 82800, 93150, 103500, 113850],
            'B2': [31500, 47250, 56700, 66150, 75600, 85050, 94500, 103950],
            'C': [28500, 42750, 51300, 59850, 68400, 76950, 85500, 94050]
        };
        
        // Coûts maximum pris en compte pour le calcul du PTZ
        this.maxCosts = {
            'A': [120000, 168000, 210000, 252000, 294000],
            'B1': [110000, 154000, 187000, 231000, 275000],
            'B2': [110000, 165000, 198000, 231000, 264000],
            'C': [100000, 150000, 180000, 210000, 240000]
        };
        
        // Pourcentages de financement selon la tranche de revenus (pour le neuf, depuis avril 2025)
        this.financingRates = {
            'tranche1': 0.5, // 50%
            'tranche2': 0.4, // 40%
            'tranche3': 0.4, // 40%
            'tranche4': 0.2  // 20%
        };
        
        // Coefficients pour déterminer la tranche de revenus
        this.coefficients = [1, 1.5, 1.8, 2.1, 2.4, 2.4, 2.4, 2.4];
        
        // Seuils de tranches selon les zones (revenu divisé par le coefficient familial)
        this.incomeBrackets = {
            'B2': [18000, 22500, 27000, 31500],
            'C': [15000, 19500, 24000, 28500]
        };
    }
    
    // Vérifier l'éligibilité
    checkEligibility() {
        // Vérification de la zone selon le type de projet
        if (this.projectType === 'ancien' && (this.zone === 'A' || this.zone === 'B1')) {
            return {
                eligible: false,
                reason: "Pour un logement ancien avec travaux, seules les zones B2 et C sont éligibles."
            };
        }
        
        // Vérification des revenus
        const index = Math.min(this.householdSize - 1, 7); // Pour indexer le tableau des plafonds
        if (this.income > this.incomeLimits[this.zone][index]) {
            return {
                eligible: false,
                reason: `Vos revenus dépassent le plafond de ${this.incomeLimits[this.zone][index].toLocaleString('fr-FR')} € pour votre situation.`
            };
        }
        
        return { eligible: true };
    }
    
    // Déterminer la tranche de revenus
    getIncomeBracket() {
        // Calculer le coefficient familial
        const coefIndex = Math.min(this.householdSize - 1, 7);
        const coefficient = this.coefficients[coefIndex];
        
        // Diviser le revenu par le coefficient
        const adjustedIncome = this.income / coefficient;
        
        // Déterminer la tranche selon la zone
        const thresholds = this.zone === 'C' ? this.incomeBrackets.C : this.incomeBrackets.B2;
        
        if (adjustedIncome <= thresholds[0]) {
            return {
                bracket: 'tranche1',
                adjustedIncome: adjustedIncome,
                coefficient: coefficient
            };
        } else if (adjustedIncome <= thresholds[1]) {
            return {
                bracket: 'tranche2',
                adjustedIncome: adjustedIncome,
                coefficient: coefficient
            };
        } else if (adjustedIncome <= thresholds[2]) {
            return {
                bracket: 'tranche3',
                adjustedIncome: adjustedIncome,
                coefficient: coefficient
            };
        } else {
            return {
                bracket: 'tranche4',
                adjustedIncome: adjustedIncome,
                coefficient: coefficient
            };
        }
    }
    
    // Calculer le montant du PTZ
    calculatePTZAmount() {
        const eligibility = this.checkEligibility();
        if (!eligibility.eligible) {
            return {
                eligible: false,
                reason: eligibility.reason,
                amount: 0
            };
        }
        
        // Déterminer la tranche de revenus
        const incomeBracket = this.getIncomeBracket();
        
        // Déterminer le coût maximum pris en compte
        const costIndex = Math.min(this.householdSize - 1, 4);
        const maxCost = this.maxCosts[this.zone][costIndex];
        
        // Limiter le coût pris en compte
        const consideredCost = Math.min(this.totalCost, maxCost);
        
        // Déterminer le pourcentage de financement selon la tranche
        const percentageFinancing = this.financingRates[incomeBracket.bracket];
        
        // Calculer le montant maximum du PTZ
        const ptzAmount = consideredCost * percentageFinancing;
        
        // Déterminer les périodes de remboursement (durée totale et différé)
        const repaymentPeriods = this.getRepaymentPeriods(incomeBracket.bracket);
        
        return {
            eligible: true,
            amount: ptzAmount,
            consideredCost: consideredCost,
            maxCost: maxCost,
            percentageFinancing: percentageFinancing * 100,
            adjustedIncome: incomeBracket.adjustedIncome,
            incomeBracket: incomeBracket.bracket,
            coefficient: incomeBracket.coefficient,
            repaymentPeriods: repaymentPeriods
        };
    }
    
    // Déterminer les périodes de remboursement selon la tranche de revenus
    getRepaymentPeriods(bracket) {
        // Selon la réglementation PTZ 2025
        switch(bracket) {
            case 'tranche1':
                return {
                    totalDuration: 25,   // 25 ans
                    deferralPeriod: 15   // dont 15 ans de différé
                };
            case 'tranche2':
                return {
                    totalDuration: 22,   // 22 ans
                    deferralPeriod: 10   // dont 10 ans de différé
                };
            case 'tranche3':
                return {
                    totalDuration: 20,   // 20 ans
                    deferralPeriod: 5    // dont 5 ans de différé
                };
            case 'tranche4':
                return {
                    totalDuration: 15,   // 15 ans
                    deferralPeriod: 0    // pas de différé
                };
            default:
                return {
                    totalDuration: 20,
                    deferralPeriod: 0
                };
        }
    }
    
    // Calculer les échéances de remboursement du PTZ
    calculateRepaymentSchedule(loanAmount, mainLoanRate) {
        const result = this.calculatePTZAmount();
        if (!result.eligible) {
            return {
                eligible: false,
                reason: result.reason
            };
        }
        
        const ptzAmount = result.amount;
        const repaymentPeriods = result.repaymentPeriods;
        
        // 1. Remboursement du prêt principal
        const mainLoanMonthlyRate = mainLoanRate / 100 / 12;
        const mainLoanDuration = repaymentPeriods.totalDuration * 12;
        const mainLoanMonthlyPayment = loanAmount * mainLoanMonthlyRate / (1 - Math.pow(1 + mainLoanMonthlyRate, -mainLoanDuration));
        
        // 2. Remboursement du PTZ (après période de différé)
        const ptzRepaymentDuration = (repaymentPeriods.totalDuration - repaymentPeriods.deferralPeriod) * 12;
        const ptzMonthlyPayment = ptzAmount / ptzRepaymentDuration;
        
        // 3. Construire le tableau d'amortissement
        let schedule = [];
        let mainLoanRemainingCapital = loanAmount;
        let ptzRemainingCapital = ptzAmount;
        
        for (let month = 1; month <= mainLoanDuration; month++) {
            // Calcul pour le prêt principal
            const mainLoanInterest = mainLoanRemainingCapital * mainLoanMonthlyRate;
            const mainLoanPrincipal = mainLoanMonthlyPayment - mainLoanInterest;
            mainLoanRemainingCapital -= mainLoanPrincipal;
            
            // Calcul pour le PTZ
            let ptzPayment = 0;
            let ptzPrincipal = 0;
            
            // Si on a dépassé la période de différé, on commence à rembourser le PTZ
            if (month > repaymentPeriods.deferralPeriod * 12) {
                ptzPayment = ptzMonthlyPayment;
                ptzPrincipal = ptzPayment;
                ptzRemainingCapital -= ptzPrincipal;
            }
            
            // Mensualité totale
            const totalMonthly = mainLoanMonthlyPayment + ptzPayment;
            
            schedule.push({
                month,
                mainLoanPayment: mainLoanMonthlyPayment,
                mainLoanInterest,
                mainLoanPrincipal,
                mainLoanRemainingCapital,
                ptzPayment,
                ptzPrincipal,
                ptzRemainingCapital,
                totalMonthly
            });
        }
        
        // 4. Calculer les totaux et le coût global
        const totalPayments = schedule.reduce((sum, row) => sum + row.totalMonthly, 0);
        const totalInterest = schedule.reduce((sum, row) => sum + row.mainLoanInterest, 0);
        const totalCost = totalPayments - loanAmount - ptzAmount;
        
        return {
            eligible: true,
            schedule,
            mainLoanAmount: loanAmount,
            ptzAmount,
            totalPayments,
            totalInterest,
            totalCost,
            firstMonthlyPayment: schedule[0].totalMonthly,
            afterDeferralMonthlyPayment: schedule[repaymentPeriods.deferralPeriod * 12]?.totalMonthly || schedule[0].totalMonthly,
            savingsFromPTZ: loanAmount * mainLoanMonthlyRate / (1 - Math.pow(1 + mainLoanMonthlyRate, -mainLoanDuration)) * mainLoanDuration - totalPayments
        };
    }
}

/**
 * Crée un index optimisé pour la recherche de villes par préfixe
 * @param {Object} citiesDB - Base de données des villes
 * @return {Object} Index optimisé
 */
function createCityIndex(citiesDB) {
    const index = {};
    
    // Parcourir toutes les zones
    for (const [zone, cities] of Object.entries(citiesDB)) {
        // Ajouter chaque ville à l'index
        cities.forEach(city => {
            // Normaliser le nom (retirer les accents, mettre en minuscules)
            const normalizedCity = city
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            
            // Indexer par préfixe (3 premières lettres)
            const prefix = normalizedCity.substring(0, 3);
            
            if (!index[prefix]) {
                index[prefix] = [];
            }
            
            // Stocker la ville et sa zone
            index[prefix].push({
                city: city,
                zone: zone,
                normalized: normalizedCity
            });
        });
    }
    
    return index;
}

/**
 * Recherche une ville dans l'index
 * @param {string} query - Requête de recherche
 * @param {Object} cityIndex - Index des villes
 * @return {Array} Résultats de recherche
 */
function searchCity(query, cityIndex) {
    // Normaliser la requête
    const normalizedQuery = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    
    if (normalizedQuery.length < 2) return [];
    
    // Obtenir le préfixe pour l'index
    const prefix = normalizedQuery.substring(0, Math.min(3, normalizedQuery.length));
    const results = [];
    
    // Si le préfixe existe dans l'index
    if (cityIndex[prefix]) {
        // Filtrer les résultats qui correspondent à la requête
        cityIndex[prefix].forEach(item => {
            if (item.normalized.includes(normalizedQuery)) {
                // Vérifier si la ville commence par la requête (priorité plus élevée)
                const exactMatch = item.normalized === normalizedQuery;
                const startsWithMatch = item.normalized.startsWith(normalizedQuery);
                
                results.push({
                    city: item.city,
                    zone: item.zone,
                    exactMatch: exactMatch,
                    startsWithMatch: startsWithMatch
                });
            }
        });
    }
    
    // Trier les résultats : exactMatch > startsWithMatch > autres
    results.sort((a, b) => {
        if (a.exactMatch && !b.exactMatch) return -1;
        if (!a.exactMatch && b.exactMatch) return 1;
        if (a.startsWithMatch && !b.startsWithMatch) return -1;
        if (!a.startsWithMatch && b.startsWithMatch) return 1;
        return a.city.localeCompare(b.city);
    });
    
    // Limiter le nombre de résultats
    return results.slice(0, 10);
}

// Variables pour stocker les données des villes et l'index
let citiesDB = {};
let cityIndex = {};
let citiesLoaded = false;

// Fonction pour charger la base de données des villes de manière asynchrone
async function loadCitiesDatabase() {
    if (citiesLoaded) return true;
    
    try {
        const response = await fetch('/data/cities-zones-ptz.json');
        if (!response.ok) throw new Error('Erreur de chargement des données des villes');
        
        citiesDB = await response.json();
        cityIndex = createCityIndex(citiesDB);
        citiesLoaded = true;
        console.log('Base de données des villes chargée avec succès');
        return true;
    } catch (error) {
        console.error('Erreur lors du chargement de la base de villes:', error);
        return false;
    }
}

// Fonction pour mettre à jour l'interface utilisateur avec les résultats
function updatePTZResults(result) {
    const resultsContainer = document.querySelector('#ptz-results-container');
    if (!resultsContainer) return;
    
    if (!result.eligible) {
        resultsContainer.innerHTML = `
            <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                <p>${result.reason}</p>
            </div>
        `;
        return;
    }
    
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
            <p>
                <strong>Conseil:</strong> Pour voir l'impact exact sur vos mensualités, utilisez la fonction de simulation complète
                qui intègre le PTZ à votre prêt principal.
            </p>
        </div>
    `;
}

// Fonction pour générer le tableau comparatif des types de PTZ
function generatePTZComparisonTable() {
    const comparisonTable = document.querySelector('#ptz-comparison-table tbody');
    if (!comparisonTable) return;
    
    comparisonTable.innerHTML = `
        <tr class="bg-blue-800 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Zones éligibles</td>
            <td class="px-4 py-2 text-center">Toutes zones depuis avril 2025</td>
            <td class="px-4 py-2 text-center">Uniquement B2 et C</td>
            <td class="px-4 py-2 text-center">Toutes zones</td>
        </tr>
        <tr class="bg-blue-900 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Obligation de travaux</td>
            <td class="px-4 py-2 text-center">Non</td>
            <td class="px-4 py-2 text-center">Oui (min. 25% du coût total)</td>
            <td class="px-4 py-2 text-center">Non</td>
        </tr>
        <tr class="bg-blue-800 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Plafonds de revenus</td>
            <td class="px-4 py-2 text-center">Variable selon zone<br>(ex: 49 000€ à 161 700€ en zone A/A bis)</td>
            <td class="px-4 py-2 text-center">Plus bas<br>(31 500€ à 103 950€ en zone B2)</td>
            <td class="px-4 py-2 text-center">Identiques au neuf</td>
        </tr>
        <tr class="bg-blue-900 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Propriété antérieure</td>
            <td class="px-4 py-2 text-center">Pas propriétaire depuis 2 ans (sauf exceptions)</td>
            <td class="px-4 py-2 text-center">Idem</td>
            <td class="px-4 py-2 text-center">Idem</td>
        </tr>
        <tr class="bg-blue-800 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Durée max de remboursement</td>
            <td class="px-4 py-2 text-center">25 ans</td>
            <td class="px-4 py-2 text-center">25 ans</td>
            <td class="px-4 py-2 text-center">25 ans</td>
        </tr>
        <tr class="bg-blue-900 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Différé possible</td>
            <td class="px-4 py-2 text-center">Oui</td>
            <td class="px-4 py-2 text-center">Oui</td>
            <td class="px-4 py-2 text-center">Oui</td>
        </tr>
        <tr class="bg-blue-800 bg-opacity-10">
            <td class="px-4 py-2 font-medium">Usage retraite</td>
            <td class="px-4 py-2 text-center">Possible (départ max 6 ans après achat)</td>
            <td class="px-4 py-2 text-center">Possible (idem)</td>
            <td class="px-4 py-2 text-center">Possible (idem)</td>
        </tr>
    `;
}

// Fonction pour initialiser et configurer le simulateur PTZ
async function initPTZSimulator() {
    // Chargement de la base de données des villes
    await loadCitiesDatabase();
    
    // Éléments du formulaire PTZ
    const ptzProjectTypeSelect = document.getElementById('ptz-project-type');
    const ptzZoneSelect = document.getElementById('ptz-zone');
    const ptzCityInput = document.getElementById('ptz-city-search');
    const ptzIncomeInput = document.getElementById('ptz-income');
    const ptzHouseholdSizeInput = document.getElementById('ptz-household-size');
    const ptzTotalCostInput = document.getElementById('ptz-total-cost');
    const calculatePTZButton = document.getElementById('calculate-ptz-button');
    
    // Gestion de l'autocomplétion des villes
    if (ptzCityInput) {
        // Création du conteneur de suggestions
        const suggestionsList = document.createElement('div');
        suggestionsList.className = 'city-suggestions bg-blue-800 bg-opacity-30 rounded-lg mt-1 absolute w-full z-10 max-h-60 overflow-y-auto';
        suggestionsList.style.display = 'none';
        
        // Ajouter la liste après l'input
        ptzCityInput.parentNode.style.position = 'relative';
        ptzCityInput.parentNode.insertBefore(suggestionsList, ptzCityInput.nextSibling);
        
        // Gérer la saisie dans le champ
        ptzCityInput.addEventListener('input', function() {
            const query = this.value.trim();
            
            if (query.length < 2) {
                suggestionsList.style.display = 'none';
                return;
            }
            
            // Rechercher les villes correspondantes
            if (citiesLoaded) {
                const results = searchCity(query, cityIndex);
                
                if (results.length > 0) {
                    // Afficher les suggestions
                    suggestionsList.innerHTML = '';
                    results.forEach(result => {
                        const item = document.createElement('div');
                        item.className = 'city-suggestion p-2 hover:bg-blue-700 cursor-pointer text-white';
                        if (result.exactMatch) {
                            item.classList.add('bg-blue-700', 'bg-opacity-50', 'font-medium');
                        }
                        
                        item.innerHTML = `${result.city} <span class="text-green-400">(Zone ${result.zone})</span>`;
                        
                        // Au clic sur une suggestion
                        item.addEventListener('click', function() {
                            ptzCityInput.value = result.city;
                            
                            // Mettre à jour la zone PTZ
                            if (ptzZoneSelect) {
                                // Ajuster la valeur pour correspondre aux options disponibles
                                let zoneValue = result.zone.replace(' bis', '');
                                ptzZoneSelect.value = zoneValue;
                            }
                            
                            // Afficher un message de confirmation
                            const zoneInfoElement = document.getElementById('ptz-zone-info');
                            if (zoneInfoElement) {
                                zoneInfoElement.textContent = `Ville trouvée: ${result.city} (Zone ${result.zone})`;
                                zoneInfoElement.classList.remove('hidden');
                                zoneInfoElement.classList.add('text-green-400');
                            }
                            
                            suggestionsList.style.display = 'none';
                        });
                        
                        suggestionsList.appendChild(item);
                    });
                    suggestionsList.style.display = 'block';
                } else {
                    // Afficher "Aucun résultat"
                    suggestionsList.innerHTML = '<div class="no-results p-2">Aucun résultat trouvé</div>';
                    suggestionsList.style.display = 'block';
                }
            } else {
                // Afficher le chargement
                suggestionsList.innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Chargement...</div>';
                suggestionsList.style.display = 'block';
                
                // Essayer de charger la base de données
                loadCitiesDatabase().then(success => {
                    if (success) {
                        // Relancer la recherche
                        ptzCityInput.dispatchEvent(new Event('input'));
                    } else {
                        // Afficher une erreur
                        suggestionsList.innerHTML = '<div class="no-results p-2 text-red-400">Erreur de chargement des données</div>';
                    }
                });
            }
        });
        
        // Masquer les suggestions au clic ailleurs
        document.addEventListener('click', function(e) {
            if (e.target !== ptzCityInput && !suggestionsList.contains(e.target)) {
                suggestionsList.style.display = 'none';
            }
        });
        
        // Navigation au clavier
        ptzCityInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                suggestionsList.style.display = 'none';
            } else if (e.key === 'ArrowDown' && suggestionsList.style.display !== 'none') {
                // Sélectionner le premier élément
                const firstItem = suggestionsList.querySelector('.city-suggestion');
                if (firstItem) {
                    firstItem.focus();
                    firstItem.classList.add('selected');
                }
                e.preventDefault();
            }
        });
        
        // Navigation clavier dans la liste
        suggestionsList.addEventListener('keydown', function(e) {
            const selected = suggestionsList.querySelector('.city-suggestion.selected');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selected) {
                    // Passer au suivant
                    const next = selected.nextElementSibling;
                    if (next && next.classList.contains('city-suggestion')) {
                        selected.classList.remove('selected');
                        next.classList.add('selected');
                        next.focus();
                    }
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selected) {
                    // Passer au précédent
                    const prev = selected.previousElementSibling;
                    if (prev && prev.classList.contains('city-suggestion')) {
                        selected.classList.remove('selected');
                        prev.classList.add('selected');
                        prev.focus();
                    } else {
                        // Revenir à l'input
                        selected.classList.remove('selected');
                        ptzCityInput.focus();
                    }
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selected) {
                    // Simuler un clic
                    selected.click();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                suggestionsList.style.display = 'none';
                ptzCityInput.focus();
            }
        });
    }
    
    // Calculer le PTZ au clic sur le bouton
    if (calculatePTZButton) {
        calculatePTZButton.addEventListener('click', function() {
            // Récupérer les valeurs du formulaire
            const projectType = ptzProjectTypeSelect ? ptzProjectTypeSelect.value : 'neuf';
            const zone = ptzZoneSelect ? ptzZoneSelect.value : 'A';
            const income = parseFloat(ptzIncomeInput ? ptzIncomeInput.value : 0);
            const householdSize = parseInt(ptzHouseholdSizeInput ? ptzHouseholdSizeInput.value : 1);
            const totalCost = parseFloat(ptzTotalCostInput ? ptzTotalCostInput.value : 0);
            const cityName = ptzCityInput ? ptzCityInput.value : null;
            
            // Valider les entrées
            if (isNaN(income) || isNaN(householdSize) || isNaN(totalCost) || income <= 0 || totalCost <= 0) {
                alert('Veuillez remplir correctement tous les champs du formulaire.');
                return;
            }
            
            // Créer l'instance du simulateur et calculer
            const simulator = new PTZSimulator({
                projectType,
                zone,
                income,
                householdSize,
                totalCost,
                cityName
            });
            
            const result = simulator.calculatePTZAmount();
            
            // Afficher les résultats
            updatePTZResults(result);
            
            // Si disponible, mettre à jour le bouton pour intégrer le PTZ au prêt principal
            const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
            if (integratePTZButton && result.eligible) {
                integratePTZButton.classList.remove('hidden');
                integratePTZButton.setAttribute('data-ptz-amount', result.amount);
                integratePTZButton.setAttribute('data-ptz-duration', result.repaymentPeriods.totalDuration);
                integratePTZButton.setAttribute('data-ptz-deferral', result.repaymentPeriods.deferralPeriod);
            }
        });
    }
    
    // Intégrer le PTZ au simulateur de prêt principal
    const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
    if (integratePTZButton) {
        integratePTZButton.addEventListener('click', function() {
            const ptzAmount = parseFloat(this.getAttribute('data-ptz-amount') || 0);
            const ptzDuration = parseInt(this.getAttribute('data-ptz-duration') || 0);
            const ptzDeferral = parseInt(this.getAttribute('data-ptz-deferral') || 0);
            
            // Récupérer les valeurs du simulateur de prêt principal
            const loanAmount = parseFloat(document.getElementById('loan-amount')?.value || 0);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider')?.value || 0);
            
            if (ptzAmount > 0 && loanAmount > 0) {
                // Créer un simulateur PTZ pour le calcul d'amortissement complet
                const simulator = new PTZSimulator({
                    projectType: document.getElementById('ptz-project-type')?.value || 'neuf',
                    zone: document.getElementById('ptz-zone')?.value || 'A',
                    income: parseFloat(document.getElementById('ptz-income')?.value || 0),
                    householdSize: parseInt(document.getElementById('ptz-household-size')?.value || 1),
                    totalCost: parseFloat(document.getElementById('ptz-total-cost')?.value || 0)
                });
                
                // Calculer le tableau d'amortissement combiné
                const repaymentSchedule = simulator.calculateRepaymentSchedule(loanAmount, interestRate);
                
                // Afficher les résultats dans une nouvelle section
                const combinedResultsContainer = document.getElementById('combined-loan-ptz-results');
                if (combinedResultsContainer) {
                    combinedResultsContainer.innerHTML = `
                        <div class="bg-green-900 bg-opacity-20 p-6 rounded-lg mt-6">
                            <h4 class="text-xl font-semibold mb-4 flex items-center">
                                <i class="fas fa-check-circle text-green-400 mr-2"></i>
                                Simulation avec PTZ intégré
                            </h4>
                            
                            <div class="grid grid-cols-2 gap-4 mb-6">
                                <div class="result-card">
                                    <p class="result-value">${repaymentSchedule.firstMonthlyPayment.toLocaleString('fr-FR')} €</p>
                                    <p class="result-label">Mensualité initiale</p>
                                </div>
                                <div class="result-card">
                                    <p class="result-value">${repaymentSchedule.afterDeferralMonthlyPayment.toLocaleString('fr-FR')} €</p>
                                    <p class="result-label">Mensualité après différé</p>
                                </div>
                                <div class="result-card">
                                    <p class="result-value">${repaymentSchedule.totalInterest.toLocaleString('fr-FR')} €</p>
                                    <p class="result-label">Total des intérêts</p>
                                </div>
                                <div class="result-card">
                                    <p class="result-value">${repaymentSchedule.savingsFromPTZ.toLocaleString('fr-FR')} €</p>
                                    <p class="result-label">Économie réalisée</p>
                                </div>
                            </div>
                            
                            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-green-400">
                                <h5 class="text-lg font-semibold text-green-400 mb-2">Avantages du PTZ dans votre projet</h5>
                                <ul class="space-y-2">
                                    <li class="flex items-start">
                                        <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                                        <span>Financement à 0% d'intérêt pour ${ptzAmount.toLocaleString('fr-FR')} € (${Math.round(ptzAmount * 100 / (loanAmount + ptzAmount))}% du financement total)</span>
                                    </li>
                                    <li class="flex items-start">
                                        <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                                        <span>Différé de remboursement de ${ptzDeferral} ans</span>
                                    </li>
                                    <li class="flex items-start">
                                        <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                                        <span>Économie totale de ${repaymentSchedule.savingsFromPTZ.toLocaleString('fr-FR')} € sur la durée du prêt</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    `;
                    
                    combinedResultsContainer.classList.remove('hidden');
                }
            }
        });
    }
    
    // Générer le tableau comparatif
    generatePTZComparisonTable();
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page de simulation
    const ptzSimulatorTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
    if (ptzSimulatorTab) {
        // Ajouter un événement pour initialiser le simulateur PTZ lorsque l'onglet est activé
        ptzSimulatorTab.addEventListener('click', function() {
            setTimeout(initPTZSimulator, 100);
        });
        
        // Si l'URL contient #ptz-simulator, activer l'onglet
        if (window.location.hash === '#ptz-simulator') {
            ptzSimulatorTab.click();
        }
    }
});

export { PTZSimulator, initPTZSimulator };