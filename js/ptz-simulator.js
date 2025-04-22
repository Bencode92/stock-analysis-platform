// Fichier JS pour simulateur de PTZ

console.log("PTZ Simulator version 1.6 chargé ! - " + new Date().toISOString());

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

// Base de données des villes directement intégrée pour un meilleur fonctionnement
const citiesDB = {
    "A bis": ["Paris", "Neuilly-sur-Seine", "Levallois-Perret", "Boulogne-Billancourt", "Saint-Mandé", "Vincennes", "Versailles", "Le Chesnay-Rocquencourt", "Chatou", "Divonne-les-Bains", "Ferney-Voltaire", "Saint-Genis-Pouilly", "Beausoleil", "Cap-d'Ail", "Puteaux", "Courbevoie", "Issy-les-Moulineaux"],
    "A": ["Lyon", "Nice", "Marseille", "Cannes", "Antibes", "Aix-en-Provence", "Bordeaux", "Toulouse", "Lille", "Rennes", "Nantes", "Grenoble", "Montpellier", "Strasbourg", "Toulon", "Annecy", "Cagnes-sur-Mer", "Menton", "Saint-Laurent-du-Var", "Villeurbanne", "Biot", "Valbonne", "Juan-les-Pins", "Vallauris", "Villeneuve-Loubet", "Hyères"],
    "B1": ["Dijon", "Metz", "Nancy", "Angers", "Le Mans", "Tours", "Orléans", "Caen", "Rouen", "Amiens", "Reims", "Saint-Étienne", "Perpignan", "Bayonne", "Chambéry", "Avignon", "Nîmes", "Pau", "La Rochelle", "Biarritz", "Brest", "Valence", "Lorient", "Vannes", "Anglet", "Aix-les-Bains", "Clermont-Ferrand"],
    "B2": ["Besançon", "Le Havre", "Poitiers", "Limoges", "Mulhouse", "Bourges", "Charleville-Mézières", "Belfort", "Colmar", "Épinal", "Cherbourg", "Troyes", "Angoulême", "Périgueux", "Agen", "Béziers", "Sète", "Niort", "Cholet", "Montélimar", "Beauvais", "Bergerac", "Alès", "Arles", "Saintes", "Montauban", "Laval"],
    "C": ["Saint-Nazaire", "Tarbes", "Cahors", "Albi", "Auch", "Périgueux", "Bergerac", "Guéret", "Aurillac", "Moulins", "Nevers", "Sens", "Vesoul", "Dole", "Lons-le-Saunier", "Auxerre", "Mâcon", "Roanne", "Châteauroux", "Vichy", "Montluçon", "Tulle", "Châtellerault", "Rochefort", "Brive-la-Gaillarde", "Rodez", "Castres", "Alençon", "Abbeville", "Verdun", "Bar-le-Duc", "Saint-Quentin", "Cambrai", "Vitry-le-François", "Sarrebourg", "Sedan"]
};

// Créer l'index de recherche une seule fois
const cityIndex = {};
let hasInitializedCityIndex = false;
// Variable globale pour stocker la ville sélectionnée
window.selectedCity = null;

function initializeCityIndex() {
    if (hasInitializedCityIndex) return;
    
    Object.entries(citiesDB).forEach(([zone, cities]) => {
        cities.forEach(city => {
            // Normaliser pour la recherche (sans accents, minuscules)
            const normalizedCity = city
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
                
            cityIndex[normalizedCity] = {
                city: city,
                zone: zone
            };
        });
    });
    
    hasInitializedCityIndex = true;
    console.log("Index de villes initialisé avec", Object.keys(cityIndex).length, "villes");
}

// Fonction de recherche de ville optimisée - commence dès la première lettre
function searchCity(query) {
    // S'assurer que l'index est initialisé
    if (!hasInitializedCityIndex) {
        initializeCityIndex();
    }
    
    // Normaliser la requête (supprimer accents et mettre en minuscules)
    const normalizedQuery = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    
    // Recherche active dès la première lettre
    if (normalizedQuery.length < 1) return [];
    
    const results = [];
    
    // Recherche avec l'index
    Object.entries(cityIndex).forEach(([key, data]) => {
        // Critères de correspondance - priorité aux débuts de mots
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
    
    // Trier les résultats par pertinence
    results.sort((a, b) => {
        // Priorité 1: Commence par la requête
        if (a.startsWithMatch && !b.startsWithMatch) return -1;
        if (!a.startsWithMatch && b.startsWithMatch) return 1;
        
        // Priorité 2: Correspondance exacte
        if (a.exactMatch && !b.exactMatch) return -1;
        if (!a.exactMatch && b.exactMatch) return 1;
        
        // Priorité 3: Ordre alphabétique
        return a.city.localeString ? a.city.localeCompare(b.city) : 0;
    });
    
    return results.slice(0, 10); // Limiter à 10 résultats pour plus de clarté
}

// Fonction pour mettre à jour l'interface utilisateur avec les résultats
function updatePTZResults(result) {
    console.log("Mise à jour des résultats PTZ:", result);
    
    // 1. Trouver ou créer le conteneur de résultats
    let resultsContainer = document.querySelector('#ptz-results-container');
    
    // Si le conteneur n'existe pas, essayons de le trouver autrement ou de le créer
    if (!resultsContainer) {
        console.log("Conteneur #ptz-results-container non trouvé, recherche d'alternatives...");
        
        // Essayer de trouver la colonne de droite
        const rightColumn = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.gap-6.mt-8 > div:nth-child(2)');
        
        if (rightColumn) {
            console.log("Colonne droite trouvée, création du conteneur de résultats");
            
            // Vidons d'abord cette colonne
            rightColumn.innerHTML = '';
            
            // Créer un conteneur de résultats
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'ptz-results-container';
            rightColumn.appendChild(resultsContainer);
        } else {
            // Dernière tentative - chercher n'importe quelle zone de résultats
            resultsContainer = document.querySelector('[class*="simulation-content"][style*="display: block"] > .grid > div:nth-child(2)');
            
            if (resultsContainer) {
                console.log("Zone de résultats alternative trouvée");
                resultsContainer.innerHTML = ''; // Vider le conteneur
            } else {
                console.error("Impossible de trouver ou créer un conteneur de résultats!");
                alert("Erreur: Impossible d'afficher les résultats. Veuillez rafraîchir la page.");
                return;
            }
        }
    }
    
    // 2. Afficher les résultats appropriés
    if (!result.eligible) {
        resultsContainer.innerHTML = `
            <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                <p>${result.reason}</p>
            </div>
        `;
        return;
    }
    
    // 3. Afficher les résultats d'éligibilité
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
    
    // 4. Afficher le bouton d'intégration au prêt principal
    const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
    if (integratePTZButton) {
        integratePTZButton.classList.remove('hidden');
        integratePTZButton.setAttribute('data-ptz-amount', result.amount);
        integratePTZButton.setAttribute('data-ptz-duration', result.repaymentPeriods.totalDuration);
        integratePTZButton.setAttribute('data-ptz-deferral', result.repaymentPeriods.deferralPeriod);
    }
    
    console.log("Résultats PTZ affichés avec succès");
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

// Fonction pour mettre à jour la liste des suggestions
function updateSuggestionsList(results, suggestionsList, ptzCityInput, ptzZoneSelect) {
    if (!suggestionsList) return;
    
    // Vider la liste existante
    suggestionsList.innerHTML = '';
    
    if (results.length > 0) {
        // Afficher les suggestions avec une animation d'apparition
        suggestionsList.classList.remove('hidden');
        suggestionsList.style.animation = 'fadeIn 0.2s ease-in-out';
        
        // Récupérer la requête pour la mise en surbrillance
        const query = ptzCityInput.value.toLowerCase().trim();
        
        // Ajouter chaque résultat à la liste avec une apparence améliorée
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'city-suggestion';
            item.tabIndex = 0; // Pour permettre le focus via clavier
            
            // Mise en évidence des correspondances
            if (result.startsWithMatch) {
                item.classList.add('selected');
            }
            
            // Contenu de l'élément avec mise en surbrillance de la partie recherchée
            const cityName = result.city;
            let cityNameWithHighlight = cityName;
            
            if (query.length > 0) {
                const normalizedCityName = cityName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                
                const index = normalizedCityName.indexOf(normalizedQuery);
                if (index >= 0) {
                    const before = cityName.substring(0, index);
                    const match = cityName.substring(index, index + query.length);
                    const after = cityName.substring(index + query.length);
                    cityNameWithHighlight = `${before}<span class="city-suggestion-highlight">${match}</span>${after}`;
                }
            }
            
            // Créer la partie gauche avec le nom de la ville
            const leftPart = document.createElement('div');
            leftPart.className = 'city-suggestion-name';
            leftPart.innerHTML = cityNameWithHighlight;
            
            // Créer la partie droite avec la zone
            const rightPart = document.createElement('div');
            rightPart.className = 'city-zone-tag';
            rightPart.innerHTML = `Zone ${result.zone}`;
            
            // Assembler l'élément
            item.appendChild(leftPart);
            item.appendChild(rightPart);
            
            // Gestionnaire de clic pour sélectionner la ville
            item.addEventListener('click', function() {
                selectCity(result, ptzCityInput, ptzZoneSelect);
            });
            
            // Gestionnaire de touche pour la navigation au clavier
            item.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    selectCity(result, ptzCityInput, ptzZoneSelect);
                }
            });
            
            suggestionsList.appendChild(item);
        });
    } else {
        // Afficher un message "Aucun résultat" si la recherche ne donne rien
        if (ptzCityInput.value.trim().length > 0) {
            suggestionsList.classList.remove('hidden');
            suggestionsList.innerHTML = '<div class="p-3 text-gray-400 text-center italic">Aucun résultat trouvé</div>';
        } else {
            suggestionsList.classList.add('hidden');
        }
    }
}

// Fonction pour sélectionner une ville et mettre à jour la zone géographique
function selectCity(result, ptzCityInput, ptzZoneSelect) {
    if (!ptzCityInput) return;
    
    // Mettre à jour la valeur de l'input
    ptzCityInput.value = result.city;
    
    // Stocker la ville et sa zone dans une variable globale pour pouvoir y accéder ailleurs
    window.selectedCity = {
        name: result.city,
        zone: result.zone
    };
    
    // Mettre à jour la zone géographique
    if (ptzZoneSelect) {
        // Convertir la zone pour correspondre aux options du select
        let zoneValue = result.zone;
        if (result.zone === "A bis") {
            zoneValue = "A"; // Car dans le select nous avons "Zone A ou A bis"
        }
        
        // AJOUT: Log pour débogage
        console.log("Mise à jour de la zone à:", zoneValue);
        
        // Mise à jour du select de zone
        for (let i = 0; i < ptzZoneSelect.options.length; i++) {
            const option = ptzZoneSelect.options[i];
            if (option.value === zoneValue) {
                ptzZoneSelect.selectedIndex = i;
                ptzZoneSelect.dispatchEvent(new Event('change')); // Déclencher l'événement change
                break;
            }
        }
    }
    
    // Afficher un message de confirmation
    const zoneInfoElement = document.getElementById('ptz-zone-info');
    if (zoneInfoElement) {
        zoneInfoElement.textContent = `Ville trouvée: ${result.city} (Zone ${result.zone})`;
        zoneInfoElement.classList.remove('hidden');
        
        // Animation pour retour visuel
        zoneInfoElement.style.animation = 'pulse 0.5s';
        zoneInfoElement.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        setTimeout(() => {
            zoneInfoElement.style.backgroundColor = '';
        }, 1000);
    }
    
    // Masquer la liste des suggestions
    const suggestionsList = document.getElementById('city-suggestions-container');
    if (suggestionsList) {
        suggestionsList.classList.add('hidden');
    }
}

// Navigation au clavier dans les suggestions de villes
function setupKeyboardNavigation(ptzCityInput, suggestionsList) {
    if (!ptzCityInput || !suggestionsList) return;
    
    ptzCityInput.addEventListener('keydown', function(e) {
        if (suggestionsList.classList.contains('hidden')) return;
        
        const suggestions = suggestionsList.querySelectorAll('.city-suggestion');
        if (suggestions.length === 0) return;
        
        const currentFocus = document.activeElement;
        const isInSuggestionsList = currentFocus.classList && currentFocus.classList.contains('city-suggestion');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!isInSuggestionsList) {
                    // Focus sur le premier élément de la liste
                    suggestions[0].focus();
                    suggestions[0].classList.add('selected');
                } else {
                    // Focus sur l'élément suivant
                    const currentIndex = Array.from(suggestions).indexOf(currentFocus);
                    if (currentIndex < suggestions.length - 1) {
                        currentFocus.classList.remove('selected');
                        suggestions[currentIndex + 1].focus();
                        suggestions[currentIndex + 1].classList.add('selected');
                    }
                }
                break;
                
            case 'ArrowUp':
                if (isInSuggestionsList) {
                    e.preventDefault();
                    const currentIndex = Array.from(suggestions).indexOf(currentFocus);
                    currentFocus.classList.remove('selected');
                    if (currentIndex > 0) {
                        // Focus sur l'élément précédent
                        suggestions[currentIndex - 1].focus();
                        suggestions[currentIndex - 1].classList.add('selected');
                    } else {
                        // Retour au champ de recherche
                        ptzCityInput.focus();
                    }
                }
                break;
                
            case 'Enter':
                if (!isInSuggestionsList && suggestions.length > 0) {
                    // Sélectionner le premier élément si on est dans l'input
                    e.preventDefault();
                    suggestions[0].click();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                suggestionsList.classList.add('hidden');
                ptzCityInput.focus();
                break;
        }
    });
}

// Fonction simplifiée et corrigée pour simuler un PTZ
function simulerPTZ() {
    console.log("Simulation PTZ en cours...");
    
    try {
        // Récupérer les valeurs du formulaire
        const projectType = document.getElementById('ptz-project-type')?.value || 'neuf';
        const zone = document.getElementById('ptz-zone')?.value || 'A';
        const income = parseFloat(document.getElementById('ptz-income')?.value || '0');
        const householdSize = parseInt(document.getElementById('ptz-household-size')?.value || '1');
        const totalCost = parseFloat(document.getElementById('ptz-total-cost')?.value || '0');
        const cityName = document.getElementById('ptz-city-search')?.value || null;
        
        console.log("Valeurs récupérées:", {projectType, zone, income, householdSize, totalCost, cityName});
        
        // Valider les entrées
        if (isNaN(income) || isNaN(householdSize) || isNaN(totalCost) || income <= 0 || totalCost <= 0) {
            alert('Veuillez remplir correctement tous les champs du formulaire.');
            return false;
        }
        
        // Créer l'instance du simulateur et calculer
        const simulator = new PTZSimulator({
            projectType, zone, income, householdSize, totalCost, cityName
        });
        
        const result = simulator.calculatePTZAmount();
        console.log("Résultat du calcul:", result);
        
        // Afficher les résultats
        updatePTZResults(result);
        
        console.log("Simulation PTZ terminée avec succès!");
        return true;
    } catch (error) {
        console.error("Erreur lors de la simulation:", error);
        alert("Une erreur s'est produite: " + error.message);
        return false;
    }
}

// Fonction simplifiée pour initialiser le simulateur PTZ
function initPTZSimulator() {
    console.log("Initialisation du simulateur PTZ avec code optimisé");
    
    // Initialiser l'index de villes
    initializeCityIndex();
    
    // Éléments du formulaire
    const ptzCityInput = document.getElementById('ptz-city-search');
    const ptzZoneSelect = document.getElementById('ptz-zone');
    const zoneInfoElement = document.getElementById('ptz-zone-info');
    
    // NOUVEAU: Préparer la colonne de droite pour l'affichage des résultats
    const rightColumn = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.gap-6.mt-8 > div:nth-child(2)');
    if (rightColumn) {
        // Vérifier si le conteneur de résultats existe déjà
        if (!document.getElementById('ptz-results-container')) {
            console.log("Préparation de la colonne de droite pour les résultats");
            
            // Sauvegarder le contenu original pour le réutiliser si nécessaire
            if (!rightColumn.hasAttribute('data-original-content')) {
                rightColumn.setAttribute('data-original-content', rightColumn.innerHTML);
            }
            
            // Créer le conteneur de résultats
            const resultsContainer = document.createElement('div');
            resultsContainer.id = 'ptz-results-container';
            
            // Message d'attente
            resultsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-8">
                    <svg class="animate-pulse w-16 h-16 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-lg text-gray-300">Veuillez renseigner les paramètres et cliquer sur "Simuler le PTZ" pour obtenir une estimation de votre prêt à taux zéro.</p>
                </div>
            `;
            
            // Remplacer le contenu de la colonne
            rightColumn.innerHTML = '';
            rightColumn.appendChild(resultsContainer);
        }
    }
    
    // Configurer l'autocomplétion pour la recherche de villes
    if (ptzCityInput) {
        // Trouver ou créer le conteneur de suggestions
        let suggestionsList = document.getElementById('city-suggestions-container');
        if (suggestionsList) {
            // Configurer la navigation au clavier
            setupKeyboardNavigation(ptzCityInput, suggestionsList);
            
            // Événement input pour la recherche dynamique
            ptzCityInput.addEventListener('input', function() {
                const query = this.value.trim();
                const results = searchCity(query);
                updateSuggestionsList(results, suggestionsList, ptzCityInput, ptzZoneSelect);
            });
            
            // Afficher les suggestions au clic dans le champ
            ptzCityInput.addEventListener('click', function() {
                if (this.value.trim().length > 0) {
                    const results = searchCity(this.value);
                    updateSuggestionsList(results, suggestionsList, ptzCityInput, ptzZoneSelect);
                }
            });
            
            // Masquer les suggestions au clic ailleurs
            document.addEventListener('click', function(e) {
                if (e.target !== ptzCityInput && !suggestionsList.contains(e.target)) {
                    suggestionsList.classList.add('hidden');
                }
            });
        } else {
            console.log("Conteneur de suggestions non trouvé");
        }
        
        // Afficher l'élément d'information sur la zone dès le début
        if (zoneInfoElement && zoneInfoElement.classList.contains('hidden')) {
            zoneInfoElement.classList.remove('hidden');
        }
    }
    
    // Trouver le bouton PTZ et lui attacher un gestionnaire d'événement direct
    const ptzButton = document.querySelector('button[id="calculate-ptz-button"]') || 
                     document.querySelector('button:has(.fa-play-circle)') ||
                     document.querySelector('button:has(.fas.fa-play-circle)');
    
    if (ptzButton) {
        console.log("Bouton PTZ trouvé:", ptzButton);
        
        // Supprimer les gestionnaires d'événements existants
        const newButton = ptzButton.cloneNode(true);
        ptzButton.parentNode.replaceChild(newButton, ptzButton);
        
        // Ajouter un nouveau gestionnaire
        newButton.addEventListener('click', function(event) {
            event.preventDefault();
            console.log("Clic sur bouton de simulation PTZ");
            simulerPTZ();
            return false;
        });
        
        console.log("✅ Gestionnaire d'événement installé avec succès sur le bouton PTZ");
    } else {
        console.error("⚠️ Bouton de simulation PTZ non trouvé");
    }
    
    // Gérer les boutons d'augmentation et diminution du nombre de personnes
    const increaseHouseholdBtn = document.getElementById('increase-household');
    const decreaseHouseholdBtn = document.getElementById('decrease-household');
    const householdSizeInput = document.getElementById('ptz-household-size');
    const householdDescription = document.getElementById('household-description');
    
    if (increaseHouseholdBtn && decreaseHouseholdBtn && householdSizeInput && householdDescription) {
        increaseHouseholdBtn.addEventListener('click', function() {
            let currentValue = parseInt(householdSizeInput.value);
            if (!isNaN(currentValue)) {
                householdSizeInput.value = currentValue + 1;
                updateHouseholdDescription(currentValue + 1);
            }
        });
        
        decreaseHouseholdBtn.addEventListener('click', function() {
            let currentValue = parseInt(householdSizeInput.value);
            if (!isNaN(currentValue) && currentValue > 1) {
                householdSizeInput.value = currentValue - 1;
                updateHouseholdDescription(currentValue - 1);
            }
        });
        
        householdSizeInput.addEventListener('change', function() {
            let currentValue = parseInt(this.value);
            if (!isNaN(currentValue) && currentValue >= 1) {
                updateHouseholdDescription(currentValue);
            } else {
                this.value = 1;
                updateHouseholdDescription(1);
            }
        });
        
        function updateHouseholdDescription(count) {
            if (count === 1) {
                householdDescription.textContent = "1 personne";
            } else {
                householdDescription.textContent = count + " personnes";
            }
        }
    }
    
    // Générer le tableau comparatif
    generatePTZComparisonTable();
}

// Solution alternative directe - ajouter un clic forcé au bouton
function fixSimulateurPTZ() {
    // Essayer de trouver le bouton de simulation PTZ par différentes méthodes
    let ptzButton = document.querySelector('button[id="calculate-ptz-button"]');
    
    if (!ptzButton) {
        // Recherche alternative par contenu
        const allButtons = Array.from(document.querySelectorAll('button'));
        ptzButton = allButtons.find(button => {
            return button.textContent.includes('Simuler le PTZ') || 
                  button.innerHTML.includes('fa-play-circle');
        });
    }
    
    if (ptzButton) {
        console.log("Bouton PTZ trouvé pour correction:", ptzButton);
        
        // Supprimer tous les gestionnaires d'événements existants (solution radicale)
        const newButton = ptzButton.cloneNode(true);
        ptzButton.parentNode.replaceChild(newButton, ptzButton);
        
        // Ajouter un nouveau gestionnaire d'événement direct
        newButton.addEventListener('click', function(event) {
            event.preventDefault();
            console.log("Clic sur bouton de simulation PTZ via fonction de correction");
            
            // Forcer l'affichage visible
            const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
            if (ptzTab && !ptzTab.classList.contains('active')) {
                ptzTab.click();
            }
            
            setTimeout(() => {
                simulerPTZ();
            }, 100);
            
            return false;
        });
        
        console.log("✅ Solution de correction appliquée avec succès au bouton PTZ");
    } else {
        console.error("⚠️ Impossible de trouver le bouton pour appliquer la correction");
    }
}

// Fonction de secours pour forcer la simulation en urgence
window.forcerSimulationPTZ = function() {
    console.log("Forçage manuel de la simulation PTZ");
    return simulerPTZ();
};

// NOUVEAU: Fonction de recherche directe du bouton et application de l'événement
function trouverEtFixerBouton() {
    let boutonTrouve = false;
    
    // Méthode 1: Par ID
    let ptzButton = document.getElementById('calculate-ptz-button');
    if (ptzButton) {
        boutonTrouve = true;
    }
    
    // Méthode 2: Par texte contenu
    if (!boutonTrouve) {
        const allButtons = Array.from(document.querySelectorAll('button'));
        ptzButton = allButtons.find(b => b.textContent.includes('Simuler le PTZ'));
        if (ptzButton) {
            boutonTrouve = true;
        }
    }
    
    // Méthode 3: Par icône
    if (!boutonTrouve) {
        ptzButton = document.querySelector('button:has(.fa-play-circle)');
        if (ptzButton) {
            boutonTrouve = true;
        }
    }
    
    // Méthode 4: Par parent
    if (!boutonTrouve) {
        const ptzSimulator = document.getElementById('ptz-simulator');
        if (ptzSimulator) {
            ptzButton = ptzSimulator.querySelector('button');
            if (ptzButton) {
                boutonTrouve = true;
            }
        }
    }
    
    // Méthode 5: Recherche profonde dans le DOM
    if (!boutonTrouve) {
        document.querySelectorAll('button').forEach(button => {
            if (button.innerHTML.includes('Simuler') && button.innerHTML.includes('PTZ')) {
                ptzButton = button;
                boutonTrouve = true;
            }
        });
    }
    
    // Si on a trouvé le bouton, on applique la correction
    if (boutonTrouve && ptzButton) {
        console.log("Bouton 'Simuler le PTZ' trouvé:", ptzButton);
        
        // Supprimer les gestionnaires existants
        const newButton = ptzButton.cloneNode(true);
        ptzButton.parentNode.replaceChild(newButton, ptzButton);
        
        // Appliquer le gestionnaire direct
        newButton.addEventListener('click', function(event) {
            event.preventDefault();
            console.log("Clic forcé sur bouton PTZ");
            simulerPTZ();
            return false;
        });
        
        console.log("✅ Correction appliquée avec succès");
        return true;
    }
    
    console.error("❌ Aucun bouton 'Simuler le PTZ' trouvé");
    return false;
}

// Initialiser quand la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM chargé, initialisation du simulateur PTZ...");
    
    // Utiliser un délai pour s'assurer que tous les éléments sont chargés
    setTimeout(function() {
        initPTZSimulator();
        
        // Pour être certain que le bouton est bien corrigé
        setTimeout(trouverEtFixerBouton, 300);
    }, 500);
});

// S'assurer que le simulateur est initialisé après le chargement complet
window.addEventListener('load', function() {
    console.log("Fenêtre chargée, vérification du simulateur PTZ...");
    setTimeout(function() {
        fixSimulateurPTZ();
        
        // Double vérification après un peu plus de temps
        setTimeout(trouverEtFixerBouton, 800);
    }, 400);
});

// Attacher la fonction de correction au clic de l'onglet PTZ
window.setTimeout(function() {
    const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
    if (ptzTab) {
        console.log("Onglet PTZ trouvé, ajout d'un gestionnaire supplémentaire");
        ptzTab.addEventListener('click', function() {
            setTimeout(function() {
                initPTZSimulator();
                setTimeout(trouverEtFixerBouton, 300);
            }, 200);
        });
    }
}, 600);

// Approche radicale: injecter un script inline pour intercepter tous les clics
window.setTimeout(function() {
    const script = document.createElement('script');
    script.textContent = `
        // Intercepter tous les clics sur le document
        document.addEventListener('click', function(event) {
            // Vérifier si l'élément cliqué est un bouton qui concerne le PTZ
            if (event.target.tagName === 'BUTTON' && 
                (event.target.textContent.includes('Simuler le PTZ') || 
                 event.target.id === 'calculate-ptz-button')) {
                console.log("Clic intercepté sur le bouton PTZ");
                event.preventDefault();
                window.forcerSimulationPTZ();
                return false;
            }
            
            // Vérifier si un parent est le bouton PTZ (pour l'icône)
            let parent = event.target.parentElement;
            for (let i = 0; i < 3; i++) {
                if (parent && parent.tagName === 'BUTTON' && 
                    (parent.textContent.includes('Simuler le PTZ') || 
                     parent.id === 'calculate-ptz-button')) {
                    console.log("Clic intercepté sur un enfant du bouton PTZ");
                    event.preventDefault();
                    window.forcerSimulationPTZ();
                    return false;
                }
                if (parent) parent = parent.parentElement;
            }
        }, true);
    `;
    document.head.appendChild(script);
}, 1000);

// Forcer la vérification au focus de la fenêtre
window.addEventListener('focus', function() {
    setTimeout(trouverEtFixerBouton, 200);
});

// Exporter les fonctions nécessaires
export { PTZSimulator, initPTZSimulator, searchCity };
