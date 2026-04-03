// Fichier JS pour simulateur de PTZ

console.log("PTZ Simulator version 2.0 chargé ! - " + new Date().toISOString());

// IMPORTANT: Définir simulerPTZ immédiatement pour qu'elle soit disponible dès le chargement du script
window.simulerPTZ = function() {
    console.log("Simulation PTZ en cours - Version avec support HLM amélioré");
    
    try {
        // Récupérer les valeurs du formulaire avec vérification de présence d'élément
        const projectTypeElem = document.getElementById('ptz-project-type');
        const zoneElem = document.getElementById('ptz-zone');
        const incomeElem = document.getElementById('ptz-income');
        const householdSizeElem = document.getElementById('ptz-household-size');
        const totalCostElem = document.getElementById('ptz-total-cost');
        const citySearchElem = document.getElementById('ptz-city-search');
        
        // Récupérer les valeurs avec valeurs par défaut sécurisées
        const projectType = projectTypeElem ? projectTypeElem.value : 'neuf';
        const zone = zoneElem ? zoneElem.value : 'A';
        const income = incomeElem ? parseFloat(incomeElem.value || '0') : 0;
        const householdSize = householdSizeElem ? parseInt(householdSizeElem.value || '1') : 1;
        const totalCost = totalCostElem ? parseFloat(totalCostElem.value || '0') : 0;
        const cityName = citySearchElem ? citySearchElem.value : null;
        const housingTypeElem = document.getElementById('ptz-housing-type');
        const housingType = housingTypeElem ? housingTypeElem.value : 'collectif';

        console.log("Valeurs récupérées:", {projectType, zone, income, householdSize, totalCost, cityName, housingType});
        
        // Valider les entrées avec des messages spécifiques
        if (isNaN(income)) {
            alert('Le revenu fiscal de référence doit être un nombre valide.');
            if (incomeElem) incomeElem.focus();
            return false;
        }
        
        if (isNaN(totalCost)) {
            alert('Le coût total de l\'opération doit être un nombre valide.');
            if (totalCostElem) totalCostElem.focus();
            return false;
        }
        
        if (income <= 0) {
            alert('Le revenu fiscal de référence doit être supérieur à 0.');
            if (incomeElem) incomeElem.focus();
            return false;
        }
        
        if (totalCost <= 0) {
            alert('Le coût total de l\'opération doit être supérieur à 0.');
            if (totalCostElem) totalCostElem.focus();
            return false;
        }
        
        // Vérifications spécifiques selon le type de projet
        if (projectType === 'ancien') {
            // Pour les logements anciens avec travaux, vérifier que le coût des travaux représente au moins 25% du coût total
            // Cette vérification pourrait être implémentée avec un champ supplémentaire mais nous l'ignorons pour l'instant
        } else if (projectType === 'social') {
            // Vérifications spécifiques pour les logements sociaux (HLM)
            // Ici, nous pourrions ajouter des vérifications d'éligibilité spécifiques aux logements sociaux
        }
        
        // Créer l'instance du simulateur et calculer
        const simulator = new PTZSimulator({
            projectType, zone, income, householdSize, totalCost, cityName, housingType
        });
        
        const result = simulator.calculatePTZAmount();
        console.log("Résultat du calcul:", result);
        
        // Afficher les résultats avec le support amélioré pour HLM
        updatePTZResults(result);
        
        // Mettre en évidence le bouton d'intégration au prêt principal après une simulation réussie
        const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
        if (integratePTZButton && !integratePTZButton.classList.contains('hidden')) {
            integratePTZButton.classList.add('pulse-animation');
            setTimeout(() => {
                integratePTZButton.classList.remove('pulse-animation');
            }, 1500);
        }
        
        console.log("Simulation PTZ terminée avec succès!");
        return true;
    } catch (error) {
        console.error("Erreur lors de la simulation:", error);
        alert("Une erreur s'est produite lors de la simulation: " + error.message);
        return false;
    }
};

class PTZSimulator {
    constructor({
        projectType,
        zone,
        income,
        householdSize,
        totalCost,
        cityName = null,
        housingType = 'collectif'
    }) {
        this.projectType = projectType;
        this.zone = zone;
        this.income = income;
        this.householdSize = householdSize;
        this.totalCost = totalCost;
        this.cityName = cityName;
        this.housingType = housingType;
        
        // Plafonds de revenus selon zone et nombre de personnes
        this.incomeLimits = {
            'A': [49000, 73500, 88200, 102900, 117600, 132300, 147000, 161700],
            'B1': [34500, 51750, 62100, 72450, 82800, 93150, 103500, 113850],
            'B2': [31500, 47250, 56700, 66150, 75600, 85050, 94500, 103950],
            'C': [28500, 42750, 51300, 59850, 68400, 76950, 85500, 94050]
        };
        
        // Coûts maximum pris en compte pour le calcul du PTZ (décret n°2025-299, depuis 01/04/2025)
        this.maxCosts = {
            'A': [150000, 225000, 270000, 315000, 360000],
            'B1': [135000, 202500, 243000, 283500, 324000],
            'B2': [110000, 165000, 198000, 231000, 264000],
            'C': [100000, 150000, 180000, 210000, 240000]
        };
        
        // Quotités de financement selon la tranche de revenus (décret n°2025-299, depuis 01/04/2025)
        // Appartement neuf / ancien avec travaux
        this.financingRatesCollectif = {
            'tranche1': 0.5, // 50%
            'tranche2': 0.4, // 40%
            'tranche3': 0.4, // 40%
            'tranche4': 0.2  // 20%
        };
        // Maison individuelle neuve (quotités réduites — objectif ZAN)
        this.financingRatesMaison = {
            'tranche1': 0.3, // 30%
            'tranche2': 0.2, // 20%
            'tranche3': 0.2, // 20%
            'tranche4': 0.1  // 10%
        };
        
        // Coefficients pour déterminer la tranche de revenus
        this.coefficients = [1, 1.5, 1.8, 2.1, 2.4, 2.4, 2.4, 2.4];
        
        // Seuils de tranches selon les zones (revenu divisé par le coefficient familial)
        // Chaque zone a ses propres seuils (décret n°2025-299)
        this.incomeBrackets = {
            'A': [25000, 31000, 37000, 49000],
            'B1': [21500, 26000, 30000, 34500],
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
        
        // Déterminer la tranche selon la zone (chaque zone a ses propres seuils)
        const thresholds = this.incomeBrackets[this.zone] || this.incomeBrackets.B2;
        
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
        
        // Déterminer le pourcentage de financement selon la tranche ET le type de logement
        // Maison individuelle neuve : quotités réduites (30/20/20/10%)
        // Appartement neuf / ancien avec travaux / social : quotités standard (50/40/40/20%)
        const isMaisonNeuve = this.projectType === 'neuf' && (this.housingType === 'maison' || this.housingType === 'individual');
        const rates = isMaisonNeuve ? this.financingRatesMaison : this.financingRatesCollectif;
        const percentageFinancing = rates[incomeBracket.bracket];
        
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
            repaymentPeriods: repaymentPeriods,
            projectType: this.projectType // Ajout du type de projet pour personnaliser l'affichage
        };
    }
    
    // Déterminer les périodes de remboursement selon la tranche de revenus
    getRepaymentPeriods(bracket) {
        // Selon la réglementation PTZ 2026 (décret n°2025-299, en vigueur depuis 01/04/2025)
        switch(bracket) {
            case 'tranche1':
                return {
                    totalDuration: 25,   // 25 ans
                    deferralPeriod: 10   // dont 10 ans de différé
                };
            case 'tranche2':
                return {
                    totalDuration: 20,   // 20 ans
                    deferralPeriod: 8    // dont 8 ans de différé
                };
            case 'tranche3':
                return {
                    totalDuration: 15,   // 15 ans
                    deferralPeriod: 2    // dont 2 ans de différé
                };
            case 'tranche4':
                return {
                    totalDuration: 10,   // 10 ans
                    deferralPeriod: 0    // pas de différé
                };
            default:
                return {
                    totalDuration: 15,
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

// Base de données des villes — source : data.gouv.fr, arrêté du 5 septembre 2025
// 34 875 communes, seules A bis / A / B1 sont stockées (B2/C = fallback)
const citiesDB = {
    "A bis": [
        "Aigremont", "Antony", "Arcueil", "Asnières-sur-Seine", "Aubervilliers", "Bagneux", "Bagnolet", "Bailly", "Beaulieu-sur-Mer", "Beausoleil", "Biot", "Bièvres", "Bois-Colombes", "Bougival", "Boulogne-Billancourt",
        "Bourg-la-Reine", "Bry-sur-Marne", "Buc", "Cachan", "Cap-d'Ail", "Carrières-sur-Seine", "Cassis", "Cessy", "Challex", "Chambourcy", "Chamonix-Mont-Blanc", "Chantilly", "Charenton-le-Pont", "Chatou", "Chaville",
        "Chevry", "Châtenay-Malabry", "Châtillon", "Clamart", "Clichy", "Collonges-sous-Salève", "Colombes", "Courbevoie", "Croissy-sur-Seine", "Demi-Quartier", "Divonne-les-Bains", "Enghien-les-Bains", "Ferney-Voltaire", "Fontenay-aux-Roses", "Fontenay-sous-Bois",
        "Garches", "Gassin", "Gennevilliers", "Gentilly", "Gex", "Grilly", "Houilles", "Issy-les-Moulineaux", "Ivry-sur-Seine", "Joinville-le-Pont", "Jouy-en-Josas", "L'Haÿ-les-Roses", "L'Étang-la-Ville", "La Celle-Saint-Cloud", "La Clusaz",
        "La Garenne-Colombes", "La Turbie", "Le Chesnay-Rocquencourt", "Le Kremlin-Bicêtre", "Le Mesnil-le-Roi", "Le Pecq", "Le Perreux-sur-Marne", "Le Plessis-Robinson", "Le Pré-Saint-Gervais", "Le Raincy", "Le Vésinet", "Les Houches", "Les Lilas", "Levallois-Perret", "Louveciennes",
        "Maisons-Alfort", "Maisons-Laffitte", "Malakoff", "Mareil-Marly", "Marly-le-Roi", "Marnes-la-Coquette", "Megève", "Meudon", "Montreuil", "Montrouge", "Nanterre", "Neuilly-Plaisance", "Neuilly-sur-Seine", "Nogent-sur-Marne", "Noisy-le-Roi",
        "Ornex", "Pantin", "Paris", "Pougny", "Prévessin-Moëns", "Puteaux", "Ramatuelle", "Rennemoulin", "Romainville", "Roquebrune-Cap-Martin", "Roquefort-les-Pins", "Rueil-Malmaison", "Saint-Cloud", "Saint-Denis", "Saint-Genis-Pouilly",
        "Saint-Germain-en-Laye", "Saint-Jean-Cap-Ferrat", "Saint-Julien-en-Genevois", "Saint-Mandé", "Saint-Maur-des-Fossés", "Saint-Maurice", "Saint-Ouen-sur-Seine", "Sauverny", "Sceaux", "Suresnes", "Sèvres", "Ségny", "Valbonne", "Vanves", "Vaucresson",
        "Vauhallan", "Verrières-le-Buisson", "Versailles", "Versonnex", "Ville-d'Avray", "Villefranche-sur-Mer", "Villejuif", "Villemomble", "Villeneuve-la-Garenne", "Vincennes", "Viroflay", "Vélizy-Villacoublay", "Èze"
    ],
    "A": [
        "Ablon-sur-Seine", "Achères", "Aime-la-Plagne", "Aix-en-Provence", "Aix-les-Bains", "Ajaccio", "Albitreccia", "Alfortville", "Allauch", "Allinges", "Allonzier-la-Caille", "Amancy", "Ambilly", "Andernos-les-Bains", "Andilly",
        "Andilly", "Andrésy", "Anglet", "Annecy", "Annemasse", "Anthy-sur-Léman", "Antibes", "Arcachon", "Archamps", "Argenteuil", "Argonay", "Arnouville", "Arpajon", "Ars-en-Ré", "Arthaz-Pont-Notre-Dame",
        "Arâches-la-Frasse", "Arès", "Aspremont", "Assas", "Athis-Mons", "Aubagne", "Aubergenville", "Auffreville-Brasseuil", "Aulnay-sous-Bois", "Aulnay-sur-Mauldre", "Aumont-en-Halatte", "Auribeau-sur-Siagne", "Auriol", "Auvers-sur-Oise", "Avilly-Saint-Léonard",
        "Avon", "Aytré", "Baillargues", "Bailly-Romainvilliers", "Ballainvilliers", "Ballaison", "Bandol", "Bassens", "Bastelicaccia", "Bazoches-sur-Guyonne", "Beauchamp", "Beaumont", "Beaumont-sur-Oise", "Beaurecueil", "Belcodène",
        "Belgentier", "Belle-Église", "Bernes-sur-Oise", "Berre-l'Étang", "Berre-les-Alpes", "Bessancourt", "Beynes", "Bezons", "Biarritz", "Bidart", "Blagnac", "Blonville-sur-Mer", "Bluffy", "Bobigny", "Bois-d'Arcy",
        "Bois-le-Roi", "Boisemont", "Boissettes", "Boissise-la-Bertrand", "Boissise-le-Roi", "Boissy-Saint-Léger", "Bondoufle", "Bondues", "Bondy", "Bonifacio", "Bonne", "Bonneuil-en-France", "Bonneuil-sur-Marne", "Bons-en-Chablais", "Boran-sur-Oise",
        "Bordeaux", "Bormes-les-Mimosas", "Bornel", "Bossey", "Bouc-Bel-Air", "Bouffémont", "Bourg-Saint-Maurice", "Boussy-Saint-Antoine", "Bozel", "Breuillet", "Breux-Jouy", "Briançon", "Brides-les-Bains", "Brie-Comte-Robert", "Brignais",
        "Brindas", "Brou-sur-Chantereine", "Brunoy", "Bruyères-le-Châtel", "Brétigny-sur-Orge", "Buchelay", "Bures-sur-Yvette", "Bussy-Saint-Georges", "Bussy-Saint-Martin", "Butry-sur-Oise", "Cabourg", "Cabris", "Cabriès", "Cadolive", "Cagnes-sur-Mer",
        "Caluire-et-Cuire", "Calvi", "Cannes", "Cantaron", "Carnetin", "Carnoux-en-Provence", "Carqueiranne", "Carrières-sous-Poissy", "Carros", "Carry-le-Rouet", "Castagniers", "Castellar", "Castelnau-le-Lez", "Cavalaire-sur-Mer", "Cergy",
        "Cesson", "Cestas", "Ceyreste", "Chalifert", "Challes-les-Eaux", "Chambly", "Champagne-au-Mont-d'Or", "Champagne-sur-Oise", "Champigny-sur-Marne", "Champlan", "Champs-sur-Marne", "Chanteloup-en-Brie", "Chanteloup-les-Vignes", "Chapet", "Chaponost",
        "Charbonnières-les-Bains", "Charvonnex", "Chassieu", "Chavenay", "Chelles", "Chennevières-sur-Marne", "Chens-sur-Léman", "Chessy", "Chevilly-Larue", "Chevreuse", "Chevrier", "Chilly-Mazarin", "Choisy-le-Roi", "Châteaufort", "Châteauneuf-Grasse",
        "Châteauneuf-Villevieille", "Châteauneuf-le-Rouge", "Châteauneuf-les-Martigues", "Châtel", "Châtelaillon-Plage", "Chênex", "Ciboure", "Claix", "Clapiers", "Claye-Souilly", "Clichy-sous-Bois", "Cogolin", "Coignières", "Collonges", "Collonges-au-Mont-d'Or",
        "Collégien", "Colomars", "Colomiers", "Combloux", "Combs-la-Ville", "Conches-sur-Gondoire", "Condé-Sainte-Libiaire", "Conflans-Sainte-Honorine", "Contamine-sur-Arve", "Contes", "Corbeil-Essonnes", "Cormeilles-en-Parisis", "Coubron", "Coudoux", "Couilly-Pont-aux-Dames",
        "Coupvray", "Courchevel", "Courdimanche", "Courteuil", "Courtry", "Coutevroult", "Coye-la-Forêt", "Cranves-Sales", "Craponne", "Croissy-Beaubourg", "Crolles", "Crosne", "Crozet", "Cruseilles", "Crécy-la-Chapelle",
        "Crégy-lès-Meaux", "Créteil", "Cuers", "Cuvat", "Dammarie-les-Lys", "Dammartin-en-Goële", "Dampmart", "Dardilly", "Deauville", "Deuil-la-Barre", "Dingy-en-Vuache", "Domont", "Dourdan", "Doussard", "Douvaine",
        "Drancy", "Drap", "Draveil", "Dugny", "Duingt", "Eaubonne", "Ensuès-la-Redonne", "Entrevernes", "Epagny Metz-Tessy", "Ermont", "Esbly", "Excenevex", "Eybens", "Fabrègues", "Falicon",
        "Farges", "Faucigny", "Fayence", "Feigères", "Ferrières-en-Brie", "Feucherolles", "Fillinges", "Fillière", "Fleury-Mérogis", "Flins-sur-Seine", "Follainville-Dennemont", "Fontainebleau", "Fontaines-sur-Saône", "Fontenay-le-Fleury", "Fontenay-le-Vicomte",
        "Forges-les-Bains", "Fos-sur-Mer", "Francheville", "Franconville", "Fresnes", "Fréjus", "Frépillon", "Fuveau", "Gagny", "Gaillard", "Gaillon-sur-Montcient", "Gardanne", "Gargenville", "Garges-lès-Gonesse", "Gattières",
        "Genas", "Gif-sur-Yvette", "Gignac-la-Nerthe", "Gières", "Gometz-le-Châtel", "Gonesse", "Gorbio", "Gourdon", "Gournay-sur-Marne", "Goussainville", "Gouvernes", "Gouvieux", "Grabels", "Gradignan", "Grans",
        "Grasse", "Grenoble", "Gretz-Armainvilliers", "Grigny", "Grimaud", "Groisy", "Groslay", "Grosseto-Prugna", "Gréasque", "Grésy-sur-Aix", "Grézieu-la-Varenne", "Guermantes", "Gujan-Mestras", "Guyancourt", "Guéthary",
        "Gémenos", "Hardricourt", "Herblay-sur-Seine", "Houdan", "Houlgate", "Huez", "Hyères", "Héricy", "Igny", "Illkirch-Graffenstaden", "Isles-lès-Villenoy", "Issou", "Istres", "Jacob-Bellecombette", "Jacou",
        "Jonage", "Jossigny", "Jouars-Pontchartrain", "Jouy-le-Moutier", "Juvignac", "Juvigny", "Juvisy-sur-Orge", "Juziers", "L'Isle-Adam", "L'Union", "L'Étang-Salé", "L'Île-Rousse", "L'Île-Saint-Denis", "La Balme-de-Sillingy", "La Baule-Escoublac",
        "La Bouilladisse", "La Cadière-d'Azur", "La Chapelle-en-Serval", "La Ciotat", "La Colle-sur-Loup", "La Couarde-sur-Mer", "La Courneuve", "La Crau", "La Croix-Valmer", "La Destrousse", "La Falaise", "La Fare-les-Oliviers", "La Farlède", "La Flotte", "La Frette-sur-Seine",
        "La Garde", "La Gaude", "La Grande-Motte", "La Londe-les-Maures", "La Madeleine", "La Motte-Servolex", "La Norville", "La Penne-sur-Huveaune", "La Plagne Tarentaise", "La Queue-en-Brie", "La Ravoire", "La Roche-sur-Foron", "La Rochelle", "La Rochette", "La Roquette-sur-Siagne",
        "La Roquette-sur-Var", "La Seyne-sur-Mer", "La Teste-de-Buch", "La Tour", "La Tour-de-Salvagny", "La Trinité", "La Tronche", "La Valette-du-Var", "La Verrière", "La Ville-du-Bois", "Labège", "Lagny-sur-Marne", "Lagord", "Lambersart", "Lambesc",
        "Lamorlaye", "Lançon-Provence", "Lattes", "Lavérune", "Le Bar-sur-Loup", "Le Beausset", "Le Blanc-Mesnil", "Le Bois-Plage-en-Ré", "Le Bourget", "Le Bourget-du-Lac", "Le Bouscat", "Le Broc", "Le Cannet", "Le Castellet", "Le Coudray-Montceaux",
        "Le Crès", "Le Diamant", "Le Gosier", "Le Grand-Bornand", "Le Grau-du-Roi", "Le Lavandou", "Le Marin", "Le Mesnil-Saint-Denis", "Le Mesnil-en-Thelle", "Le Monêtier-les-Bains", "Le Mée-sur-Seine", "Le Perray-en-Yvelines", "Le Plan-de-la-Tour", "Le Plessis-Bouchard", "Le Plessis-Pâté",
        "Le Plessis-Trévise", "Le Port-Marly", "Le Pouliguen", "Le Pradet", "Le Puy-Sainte-Réparade", "Le Revest-les-Eaux", "Le Rouret", "Le Rove", "Le Sappey", "Le Teich", "Le Thillay", "Le Tholonet", "Le Tignet", "Le Touquet-Paris-Plage", "Le Tremblay-sur-Mauldre",
        "Lentilly", "Les Adrets-de-l'Estérel", "Les Allues", "Les Anses-d'Arlet", "Les Avirons", "Les Belleville", "Les Clayes-sous-Bois", "Les Contamines-Montjoie", "Les Deux Alpes", "Les Essarts-le-Roi", "Les Gets", "Les Loges-en-Josas", "Les Mesnuls", "Les Mureaux", "Les Pavillons-sous-Bois",
        "Les Pennes-Mirabeau", "Les Portes-en-Ré", "Les Trois-Îlets", "Les Ulis", "Leuville-sur-Orge", "Levens", "Lieusaint", "Lille", "Limay", "Limeil-Brévannes", "Limonest", "Limours", "Linas", "Lisses", "Livry-Gargan",
        "Livry-sur-Seine", "Lognes", "Loix", "Longjumeau", "Longperrier", "Longpont-sur-Orge", "Loos", "Lucinges", "Lyon", "Lège-Cap-Ferret", "Léognan", "Lésigny", "Machilly", "Magnanville", "Magny-le-Hongre",
        "Magny-les-Hameaux", "Mandelieu-la-Napoule", "Mandres-les-Roses", "Manigod", "Mantes-la-Jolie", "Mantes-la-Ville", "Marcellaz", "Marcoussis", "Marcq-en-Barœul", "Marcy-l'Étoile", "Margency", "Marignane", "Marolles-en-Brie", "Marolles-en-Hurepoix", "Marseille",
        "Martigues", "Massongy", "Massy", "Mauguio", "Maule", "Maurecourt", "Maurepas", "Meaux", "Melun", "Mennecy", "Menthon-Saint-Bernard", "Menthonnex-en-Bornes", "Menton", "Menucourt", "Messery",
        "Meulan-en-Yvelines", "Meylan", "Meyreuil", "Meyzieu", "Milon-la-Chapelle", "Mimet", "Miramas", "Mitry-Mory", "Moissy-Cramayel", "Monnetier-Mornex", "Montauroux", "Montbonnot-Saint-Martin", "Montesson", "Montfermeil", "Montferrier-sur-Lez",
        "Montfort-l'Amaury", "Montgeron", "Montigny-le-Bretonneux", "Montigny-lès-Cormeilles", "Montlhéry", "Montlignon", "Montmagny", "Montmorency", "Montpellier", "Montriond", "Montry", "Montévrain", "Morangis", "Morillon", "Morsang-sur-Orge",
        "Morsang-sur-Seine", "Morzine", "Mouans-Sartoux", "Mougins", "Mours", "Mouvaux", "Médan", "Mériel", "Mérignac", "Méru", "Méry-sur-Oise", "Mézières-sur-Seine", "Mézy-sur-Seine", "Nandy", "Nangy",
        "Nantes", "Nanteuil-lès-Meaux", "Neauphle-le-Château", "Neauphle-le-Vieux", "Nernier", "Nesles-la-Vallée", "Neuilly-sur-Marne", "Neuvecelle", "Neuville-sur-Oise", "Neuville-sur-Saône", "Neydens", "Nice", "Noiseau", "Noisiel", "Noisy-le-Grand",
        "Noisy-le-Sec", "Nozay", "Nézel", "Oberhausbergen", "Ollainville", "Ollioules", "Opio", "Orgeval", "Orly", "Ormesson-sur-Marne", "Ormoy", "Orry-la-Ville", "Orsay", "Osny", "Oullins-Pierre-Bénite",
        "Ozoir-la-Ferrière", "Palaiseau", "Palavas-les-Flots", "Paray-Vieille-Poste", "Parmain", "Perrignier", "Pers-Jussy", "Persan", "Pessac", "Peymeinade", "Peynier", "Peypin", "Pierrelaye", "Pietrosella", "Piscop",
        "Plaisir", "Plan-de-Cuques", "Poincy", "Poissy", "Poisy", "Pomponne", "Pontault-Combault", "Pontcarré", "Pontoise", "Porcheville", "Pornichet", "Port-de-Bouc", "Porto-Vecchio", "Prades-le-Lez", "Praz-sur-Arly",
        "Pringy", "Propriano", "Présilly", "Publier", "Puget-sur-Argens", "Puiseux-Pontoise", "Pégomas", "Pélissanne", "Périgny", "Pérols", "Péron", "Quincy-Voisins", "Quincy-sous-Sénart", "Rambouillet", "Rayol-Canadel-sur-Mer",
        "Reignier-Ésery", "Rennes", "Ris-Orangis", "Rivedoux-Plage", "Rognac", "Rognes", "Roissy-en-Brie", "Roissy-en-France", "Ronquerolles", "Roquebrune-sur-Argens", "Roquefort-la-Bédoule", "Roquevaire", "Rosny-sous-Bois", "Rousset", "Rubelles",
        "Rumilly", "Rungis", "Saclay", "Saint-Alban-Leysse", "Saint-André-de-la-Roche", "Saint-André-lez-Lille", "Saint-Antonin-sur-Bayon", "Saint-Aubin", "Saint-Blaise", "Saint-Blaise", "Saint-Brice-sous-Forêt", "Saint-Cannat", "Saint-Cergues", "Saint-Chaffrey", "Saint-Chamas",
        "Saint-Clément-de-Rivière", "Saint-Clément-des-Baleines", "Saint-Cyr-au-Mont-d'Or", "Saint-Cyr-l'École", "Saint-Cyr-sur-Mer", "Saint-Didier-au-Mont-d'Or", "Saint-Fargeau-Ponthierry", "Saint-François", "Saint-Genis-Laval", "Saint-Genis-les-Ollières", "Saint-Germain-lès-Arpajon", "Saint-Germain-lès-Corbeil", "Saint-Germain-sur-Morin", "Saint-Gervais-les-Bains", "Saint-Gratien",
        "Saint-Gély-du-Fesc", "Saint-Ismier", "Saint-Jean-de-Gonville", "Saint-Jean-de-Luz", "Saint-Jean-de-Sixt", "Saint-Jean-de-Védas", "Saint-Jeannet", "Saint-Jorioz", "Saint-Lambert", "Saint-Laurent-de-Mure", "Saint-Laurent-du-Var", "Saint-Leu", "Saint-Leu-la-Forêt", "Saint-Mandrier-sur-Mer", "Saint-Marc-Jaumegarde",
        "Saint-Martin-d'Uriage", "Saint-Martin-de-Ré", "Saint-Martin-du-Var", "Saint-Michel-sur-Orge", "Saint-Mitre-les-Remparts", "Saint-Nom-la-Bretèche", "Saint-Ouen-l'Aumône", "Saint-Paul", "Saint-Paul-de-Vence", "Saint-Pierre-du-Perray", "Saint-Pierre-en-Faucigny", "Saint-Prix", "Saint-Raphaël", "Saint-Romain-au-Mont-d'Or", "Saint-Rémy-l'Honoré",
        "Saint-Rémy-lès-Chevreuse", "Saint-Savournin", "Saint-Thibault-des-Vignes", "Saint-Tropez", "Saint-Vallier-de-Thiey", "Saint-Victoret", "Saint-Vincent-de-Barbeyrargues", "Saint-Yon", "Saint-Zacharie", "Saint-Égrève", "Sainte-Agnès", "Sainte-Foy-lès-Lyon", "Sainte-Geneviève-des-Bois", "Sainte-Marie-de-Ré", "Sainte-Maxime",
        "Saintes-Maries-de-la-Mer", "Saintry-sur-Seine", "Sallanches", "Samoreau", "Samoëns", "Sanary-sur-Mer", "Sannois", "Santeny", "Sarcelles", "Sarrola-Carcopino", "Sartrouville", "Sathonay-Camp", "Saulx-les-Chartreux", "Saussan", "Sausset-les-Pins",
        "Savigny-le-Temple", "Savigny-sur-Orge", "Sciez", "Seignosse", "Seine-Port", "Senlis", "Septèmes-les-Vallons", "Sergy", "Serris", "Servon", "Servoz", "Sevran", "Sevrier", "Seyssins", "Sillingy",
        "Simiane-Collongue", "Six-Fours-les-Plages", "Soisy-sous-Montmorency", "Soisy-sur-Seine", "Solliès-Pont", "Solliès-Toucas", "Solliès-Ville", "Soorts-Hossegor", "Sospel", "Spéracèdes", "Stains", "Strasbourg", "Sucy-en-Brie", "Talence", "Talloires-Montmin",
        "Taninges", "Tassin-la-Demi-Lune", "Taverny", "Tessancourt-sur-Aubette", "Teyran", "Thiais", "Thoiry", "Thonon-les-Bains", "Thorigny-sur-Marne", "Théoule-sur-Mer", "Thônes", "Tigery", "Tignes", "Torcy", "Toulon",
        "Toulouse", "Tourgéville", "Tournan-en-Brie", "Tourrette-Levens", "Tourrettes-sur-Loup", "Toussus-le-Noble", "Trappes", "Tremblay-en-France", "Trets", "Triel-sur-Seine", "Trilport", "Trouville-sur-Mer", "Vaires-sur-Marne", "Val-d'Isère", "Valenton",
        "Vallauris", "Valleiry", "Valmondois", "Varennes-Jarcy", "Vaudherland", "Vaugneray", "Vaujours", "Vauréal", "Vaux-le-Pénil", "Vaux-sur-Seine", "Veigy-Foncenex", "Velaux", "Vence", "Vendargues", "Venelles",
        "Ventabren", "Verneuil-sur-Seine", "Vernouillet", "Vert", "Vert-Saint-Denis", "Vesancy", "Veyrier-du-Lac", "Vieille-Église-en-Yvelines", "Vigneux-sur-Seine", "Villabé", "Villard-de-Lans", "Villaz", "Ville-la-Grand", "Villebon-sur-Yvette", "Villecresnes",
        "Villejust", "Villemoisson-sur-Orge", "Villeneuve-Loubet", "Villeneuve-Saint-Georges", "Villeneuve-le-Roi", "Villeneuve-lès-Maguelone", "Villennes-sur-Seine", "Villenoy", "Villeparisis", "Villepinte", "Villepreux", "Villers-sur-Mer", "Villetaneuse", "Villeurbanne", "Villiers-Adam",
        "Villiers-Saint-Frédéric", "Villiers-le-Bel", "Villiers-le-Bâcle", "Villiers-sur-Marne", "Villiers-sur-Morin", "Villiers-sur-Orge", "Villy-le-Bouveret", "Villy-le-Pelloux", "Vineuil-Saint-Firmin", "Viry", "Viry-Châtillon", "Vitrolles", "Vitry-sur-Seine", "Viuz-en-Sallaz", "Voisins-le-Bretonneux",
        "Voulangis", "Vovray-en-Bornes", "Vulaines-sur-Seine", "Vulbens", "Vétraz-Monthoux", "Wambrechies", "Wasquehal", "Wissous", "Yerres", "Yvoire", "Écharcon", "Échenevex", "Écouen", "Écully", "Égly",
        "Éguilles", "Élancourt", "Émerainville", "Épiais-lès-Louvres", "Épinay-sous-Sénart", "Épinay-sur-Orge", "Épinay-sur-Seine", "Épône", "Éragny", "Étiolles", "Étrembières", "Évecquemont", "Évenos", "Évian-les-Bains", "Évry-Courcouronnes",
        "Ézanville"
    ],
    "B1": [
        "Abbeville", "Ableiges", "Ablis", "Abondance", "Achenheim", "Acigné", "Acoua", "Adainville", "Afa", "Agde", "Agneaux", "Agnetz", "Ahetze", "Ahuy", "Aigrefeuille-d'Aunis",
        "Aigues-Mortes", "Aigues-Vives", "Aimargues", "Aincourt", "Alata", "Albertville", "Albi", "Albigny-sur-Saône", "Alby-sur-Chéran", "Alex", "Algajola", "Algrange", "Alizay", "Allevard", "Allonne",
        "Althen-des-Paluds", "Ambarès-et-Lagrave", "Amboise", "Ambérieu-en-Bugey", "Ambérieux", "Amfreville-la-Mi-Voie", "Amiens", "Amnéville", "Ancenis-Saint-Géréon", "Andelu", "Anet", "Angers", "Angervilliers", "Angicourt", "Angoulins",
        "Angoulême", "Angresse", "Angy", "Annet-sur-Marne", "Anse", "Anse-Bertrand", "Anstaing", "Anthon", "Apatou", "Appietto", "Apremont", "Arbonne", "Arbonne-la-Forêt", "Arbusigny", "Arcangues",
        "Aregno", "Arenthon", "Argelès-sur-Mer", "Arles", "Armancourt", "Armentières", "Armoy", "Arnas", "Arnouville-lès-Mantes", "Arques", "Arques-la-Bataille", "Arradon", "Arras", "Arronville", "Artigues-près-Bordeaux",
        "Arveyres", "Arzon", "Ascain", "Asnières-sur-Oise", "Attainville", "Aubais", "Auberville", "Aubignan", "Aubière", "Aubord", "Aucamville", "Audenge", "Audun-le-Tiche", "Auffargis", "Auneau-Bleury-Saint-Symphorien",
        "Auray", "Aureille", "Aurons", "Aussonne", "Auterive", "Auteuil", "Autouillet", "Autrans-Méaudre en Vercors", "Auvernaux", "Auvers-Saint-Georges", "Auxerre", "Auzeville-Tolosane", "Auzielle", "Avernes", "Avignon",
        "Avrainville", "Avrillé", "Awala-Yalimapo", "Ayse", "Azur", "Baden", "Bagneaux-sur-Loing", "Baie-Mahault", "Baillet-en-France", "Bailleul", "Baillif", "Baisieux", "Balagny-sur-Thérain", "Balaruc-le-Vieux", "Balaruc-les-Bains",
        "Ballan-Miré", "Ballancourt-sur-Essonne", "Balma", "Bandraboua", "Bandrele", "Bangor", "Banyuls-sur-Mer", "Barbentane", "Barberaz", "Barbery", "Barbizon", "Barby", "Barbâtre", "Barentin", "Barjouville",
        "Barneville-la-Bertran", "Baron", "Barr", "Bartenheim", "Basse-Goulaine", "Basse-Pointe", "Basse-Terre", "Bassens", "Bassussarry", "Bastia", "Batz-sur-Mer", "Baulne", "Baurech", "Bayeux", "Bayonne",
        "Bazainville", "Bazemont", "Bazus", "Beaucouzé", "Beaufort", "Beaulieu", "Beaumes-de-Venise", "Beaumont", "Beaupuy", "Beaurepaire", "Beauvais", "Beauvallon", "Beauvoir", "Beauvoisin", "Beauzelle",
        "Belberaud", "Belbeuf", "Bellefontaine", "Bellefontaine", "Bellegarde", "Belleville-en-Beaujolais", "Belloy-en-France", "Belmont-d'Azergues", "Belz", "Bendejun", "Benerville-sur-Mer", "Benfeld", "Bennecourt", "Berck", "Bergues",
        "Bernin", "Bernis", "Bernolsheim", "Bersée", "Bertrange", "Besançon", "Bessan", "Betton", "Beynost", "Bezannes", "Bezouce", "Bienville", "Biganos", "Biguglia", "Bihorel",
        "Billère", "Binic-Étables-sur-Mer", "Biriatou", "Biscarrosse", "Bischheim", "Bischwiller", "Biviers", "Bizanos", "Biéville-Beuville", "Blaincourt-lès-Précy", "Blainville-sur-Orne", "Blanquefort", "Blausasc", "Blotzheim", "Bléré",
        "Bohars", "Boigny-sur-Bionne", "Boinville-en-Mantois", "Bois-Guillaume", "Boissières", "Boissy-Mauvoisin", "Boissy-l'Aillerie", "Boissy-sans-Avoir", "Boissy-sous-Saint-Yon", "Bonchamp-lès-Laval", "Bonnelles", "Bonnetan", "Bonneville", "Bonneville-sur-Touques", "Bonnières-sur-Seine",
        "Bonsecours", "Bonson", "Boos", "Borest", "Borgo", "Bosroumois", "Bouafle", "Bouaye", "Boucau", "Bouchemaine", "Bouguenais", "Bouillante", "Bouillargues", "Bouleurs", "Bouliac",
        "Boullay-les-Troux", "Bouloc", "Boulogne-sur-Mer", "Bouqueval", "Bouray-sur-Juine", "Bourbourg", "Bourdonné", "Bourg-Saint-Christophe", "Bourg-en-Bresse", "Bourg-lès-Valence", "Bourghelles", "Bourgoin-Jallieu", "Bourron-Marlotte", "Bousbecque", "Bousse",
        "Boussy", "Boutigny", "Boutigny-sur-Essonne", "Bouville", "Bouvines", "Bouzigues", "Bouéni", "Boves", "Boëge", "Brains", "Brando", "Bras-Panon", "Brasseuse", "Brax", "Bray-Dunes",
        "Brech", "Brenouille", "Brenthonne", "Bressey-sur-Tille", "Bresson", "Brest", "Bretenière", "Bretignolles-sur-Mer", "Bretteville-sur-Odon", "Breuil-Bois-Robert", "Breuil-le-Sec", "Breuil-le-Vert", "Breuschwickersheim", "Brignoles", "Briis-sous-Forges",
        "Brison-Saint-Innocent", "Brive-la-Gaillarde", "Brizon", "Brières-les-Scellés", "Brié-et-Angonnes", "Bron", "Brueil-en-Vexin", "Bruges", "Bruguières", "Brumath", "Brunstatt-Didenheim", "Bruyères-sur-Oise", "Bruz", "Bullion", "Bully",
        "Burdignin", "Bury", "Buschwiller", "Bègles", "Bédarrides", "Bédoin", "Béhoust", "Bénesse-Maremne", "Bénodet", "Béthemont-la-Forêt", "Bétheny", "Béthune", "Béziers", "Cabannes", "Cabestany",
        "Cabrières", "Cadarsac", "Cadaujac", "Cadenet", "Caderousse", "Caen", "Cagny", "Cailloux-sur-Fontaines", "Caissargues", "Calais", "Calcatoggio", "Calenzana", "Callian", "Calvisson", "Camaret-sur-Aigues",
        "Cambes", "Camblanes-et-Meynac", "Cambo-les-Bains", "Cambrai", "Cambronne-lès-Ribécourt", "Camiers", "Camon", "Camopi", "Camphin-en-Pévèle", "Canapville", "Cancale", "Candillargues", "Canet-en-Roussillon", "Cannelle", "Cannes-Écluse",
        "Canteleu", "Canéjan", "Capbreton", "Capesterre-Belle-Eau", "Capesterre-de-Marie-Galante", "Capinghem", "Cappelle-la-Grande", "Carbon-Blanc", "Carbonne", "Carbuccia", "Carcans", "Carcès", "Cargèse", "Carignan-de-Bordeaux", "Carnac",
        "Caromb", "Carpentras", "Carpiquet", "Carquefou", "Carvin", "Casaglione", "Case-Pilote", "Castanet-Tolosan", "Castelginest", "Castellare-di-Casinca", "Castelmaurou", "Castelnau-d'Estrétefonds", "Castillon", "Castries", "Caudan",
        "Caudebec-lès-Elbeuf", "Cauffry", "Caumont-sur-Durance", "Cauville-sur-Mer", "Cavaillon", "Caveirac", "Cayenne", "Cenon", "Cercier", "Cernay", "Cernay-la-Ville", "Cernex", "Cerny", "Cervens", "Cesson-Sévigné",
        "Ceyrat", "Chailly-en-Bière", "Chainaz-les-Frasses", "Challans", "Chamagnieu", "Chamalières", "Chamant", "Chamarande", "Chambray-lès-Tours", "Chambéry", "Chamigny", "Champ-sur-Drac", "Champagne-sur-Seine", "Champagnier", "Champanges",
        "Champcueil", "Champhol", "Chanceaux-sur-Choisille", "Changé", "Chantepie", "Chapeiry", "Chaponnay", "Charleville-Mézières", "Charly", "Charmentray", "Chartres", "Chartres-de-Bretagne", "Chartrettes", "Charvieu-Chavagneux", "Chasse-sur-Rhône",
        "Chasselay", "Chatuzange-le-Goubet", "Chauconin-Neufmontiers", "Chauffour-lès-Étréchy", "Chaumes-en-Brie", "Chaumes-en-Retz", "Chaumont", "Chaumont-en-Vexin", "Chaumontel", "Chauvry", "Chavagne", "Chavannaz", "Chavanod", "Chavanoz", "Chazay-d'Azergues",
        "Chennevières-lès-Louvres", "Chenôve", "Cheptainville", "Cherbourg-en-Cotentin", "Chessenaz", "Chessy", "Chevaigné", "Cheval-Blanc", "Chevannes", "Chevenoz", "Chevigny-Saint-Sauveur", "Chevry-Cossigny", "Chiconi", "Chignin", "Chilly",
        "Chirens", "Chirongui", "Choisel", "Choisy", "Choisy-au-Bac", "Cholet", "Chorges", "Chozeau", "Chuzelles", "Château-Thierry", "Château-Thébaud", "Châteaugiron", "Châteauneuf-de-Gadagne", "Châteaurenard", "Châteauroux-les-Alpes",
        "Châtenay-en-France", "Châtillon-sur-Cluses", "Châtres", "Chécy", "Chéreng", "Chêne-en-Semine", "Cilaos", "Cinqueux", "Cires-lès-Mello", "Civrieux", "Civrieux-d'Azergues", "Clairefontaine-en-Yvelines", "Clairoix", "Clarafond-Arcine", "Clermont",
        "Clermont-Ferrand", "Clermont-l'Hérault", "Clermont-le-Fort", "Clisson", "Clohars-Carnoët", "Cluses", "Cléon", "Codognan", "Coggia", "Cognin", "Cohennoz", "Colleville-Montgomery", "Collioure", "Colmar", "Colombelles",
        "Colombier-Saugnieu", "Combaillaux", "Combleux", "Comines", "Commeny", "Communay", "Compans", "Compiègne", "Concarneau", "Condrieu", "Condé-sur-Vesgre", "Condécourt", "Congénies", "Contamine-Sarzin", "Copponex",
        "Corbara", "Corbas", "Corcelles-les-Monts", "Cordon", "Corenc", "Cormeilles-en-Vexin", "Cormelles-le-Royal", "Cormontreuil", "Cornebarrieu", "Cornier", "Cornillon-Confoux", "Corronsac", "Corte", "Coti-Chiavari", "Cotignac",
        "Coubert", "Coublevie", "Coudekerque-Branche", "Coulaines", "Coulommes", "Coulommiers", "Courances", "Courcelles-sur-Viosne", "Courdimanche-sur-Essonne", "Cournon-d'Auvergne", "Cournonsec", "Cournonterral", "Courquetaine", "Courseulles-sur-Mer", "Courson-Monteloup",
        "Courthézon", "Coutras", "Couzon-au-Mont-d'Or", "Couëron", "Crach", "Cramoisy", "Creil", "Crempigny-Bonneguête", "Crespières", "Crest-Voland", "Cricquebœuf", "Croix", "Crozon", "Crèvecœur-en-Brie", "Créon",
        "Crépy-en-Valois", "Cucq", "Cuges-les-Pins", "Cugnaux", "Curis-au-Mont-d'Or", "Cusy", "Cuttoli-Corticchiato", "Cysoing", "Cébazat", "Cély", "Cénac", "Cépet", "Céret", "Césarches", "D'Huison-Longueville",
        "Dagneux", "Dainville", "Daix", "Damgan", "Dampierre-en-Yvelines", "Dannemarie", "Dannemois", "Darnétal", "Darvault", "Daux", "Davron", "Dax", "Dembeni", "Denicé", "Deshaies",
        "Desingy", "Deyme", "Dieppe", "Dijon", "Dinan", "Dinard", "Dingsheim", "Dingy-Saint-Clair", "Divatte-sur-Loire", "Dives-sur-Mer", "Diémoz", "Dolus-d'Oléron", "Domancy", "Domarin", "Dommartin",
        "Dommartin", "Dompierre-sur-Mer", "Domène", "Donges", "Donneville", "Donville-les-Bains", "Douai", "Doubs", "Douvres-la-Délivrande", "Draguignan", "Draillant", "Dreuil-lès-Amiens", "Dreux", "Drocourt", "Drumettaz-Clarafond",
        "Drusenheim", "Drémil-Lafage", "Ducos", "Dunkerque", "Duppigheim", "Dury", "Dzaoudzi", "Décines-Charpieu", "Déville-lès-Rouen", "Eaunes", "Eccica-Suarella", "Eckbolsheim", "Ecquevilly", "Elbeuf", "Elne",
        "Embrun", "Emmerin", "Enchastrayes", "Englesqueville-en-Auge", "Englos", "Ennery", "Ennetières-en-Weppes", "Ensisheim", "Entraigues-sur-la-Sorgue", "Entre-Deux", "Entrelacs", "Entzheim", "Erdeven", "Ermenonville", "Ernolsheim-Bruche",
        "Erquinghem-Lys", "Erstein", "Escalquens", "Eschau", "Essert-Romand", "Essey-lès-Nancy", "Esvres", "Etaux", "Eygalières", "Eyguières", "Eyragues", "Eysines", "Faches-Thumesnil", "Fameck", "Faremoutiers",
        "Fargues-Saint-Hilaire", "Farinole", "Faverges-Seythenex", "Favières", "Favrieux", "Fegersheim", "Fenouillet", "Fessy", "Feyzin", "Figanières", "Fitz-James", "Flavignerot", "Flayosc", "Fleurieu-sur-Saône", "Fleurieux-sur-l'Arbresle",
        "Fleurines", "Fleury", "Fleury-en-Bière", "Fleury-les-Aubrais", "Fleury-sur-Orne", "Flexanville", "Floirac", "Florange", "Florensac", "Flourens", "Flumet", "Fonbeauzard", "Fondettes", "Fonds-Saint-Denis", "Fonsorbes",
        "Font-Romeu-Odeillo-Via", "Fontaine", "Fontaine-Chaalis", "Fontaine-de-Vaucluse", "Fontaine-la-Mallet", "Fontaine-le-Port", "Fontaine-lès-Dijon", "Fontaine-sous-Préaux", "Fontaines-Saint-Martin", "Fontanil-Cornillon", "Fontcouverte-la-Toussuire", "Fontenay", "Fontenay-Mauvoisin", "Fontenay-Saint-Père", "Fontenay-Trésigny",
        "Fontenay-en-Parisis", "Fontenay-lès-Briis", "Fontenilles", "Fontvieille", "Forcalquier", "Forest-sur-Marque", "Fort-de-France", "Fosses", "Fouesnant", "Fouras", "Fourques", "Fourquevaux", "Frangy", "Franqueville-Saint-Pierre", "Frelinghien",
        "Freneuse", "Freneuse", "Froges", "Frontignan", "Fronton", "Frontonas", "Frouville", "Frouzins", "Frémainville", "Frémécourt", "Furiani", "Fécamp", "Fénay", "Féricy", "Férolles-Attilly",
        "Féternes", "Gagnac-sur-Garonne", "Gaillon", "Gainneville", "Gallargues-le-Montueux", "Galluis", "Gambais", "Gambaiseuil", "Gambsheim", "Gandrange", "Gap", "Garancières", "Garidech", "Garons", "Garéoult",
        "Gastes", "Gauré", "Gazeran", "Geispolsheim", "Gelos", "Genay", "Ghisonaccia", "Giberville", "Gigean", "Gignac", "Gilette", "Gilley", "Gilly-sur-Isère", "Gisors", "Giuncheto",
        "Givors", "Gleizé", "Glières-Val-de-Borne", "Goincourt", "Gometz-la-Ville", "Goncelin", "Gonfreville-l'Orcher", "Gonneville-sur-Mer", "Gorges", "Gouesnou", "Goupillières", "Gourbeyre", "Goussainville", "Goussonville", "Goyave",
        "Goyrans", "Grand Bourgtheroulde", "Grand'Combe-Châteleu", "Grand'Rivière", "Grand-Aigueblanche", "Grand-Bourg", "Grand-Couronne", "Grand-Santi", "Grandchamp", "Grandchamp-des-Fontaines", "Grande-Synthe", "Granville", "Gratentour", "Gravelines", "Graveson",
        "Grenade", "Grenay", "Gressey", "Gressy", "Griesheim-sur-Souffel", "Grignon", "Grigny-sur-Rhône", "Grisy-Suisnes", "Groix", "Gros-Morne", "Grosrouvre", "Gruissan", "Gruson", "Gréoux-les-Bains", "Guebwiller",
        "Guernes", "Guerville", "Guibeville", "Guidel", "Guigneville-sur-Essonne", "Guilers", "Guilherand-Granges", "Guipavas", "Guitrancourt", "Guzargues", "Guénange", "Guérande", "Gâvres", "Gémil", "Génicourt",
        "Générac", "Gévezé", "Habsheim", "Hagen", "Hagenthal-le-Bas", "Hagondange", "Haguenau", "Hallennes-lez-Haubourdin", "Halluin", "Hanches", "Hangenbieten", "Harfleur", "Hargeville", "Haubourdin", "Haute-Goulaine",
        "Hauteluce", "Hauteville-lès-Dijon", "Hauteville-sur-Fier", "Hazebrouck", "Hem", "Hendaye", "Hennebont", "Herbeville", "Herbeys", "Herbignac", "Herlies", "Hermanville-sur-Mer", "Herrlisheim", "Herserange", "Hettange-Grande",
        "Heyrieux", "Holtzheim", "Honfleur", "Horbourg-Wihr", "Houplines", "Hourtin", "Houtaud", "Huningue", "Hurtigheim", "Hédouville", "Hégenheim", "Héric", "Hérouville-Saint-Clair", "Hérouville-en-Vexin", "Héry-sur-Alby",
        "Hésingue", "Hœdic", "Hœnheim", "Hœrdt", "Idron", "Ifs", "Igoville", "Illies", "Illzach", "Indre", "Ingersheim", "Ingré", "Iracoubo", "Irigny", "Isle-Saint-Georges",
        "Isneauville", "Isola", "Ittenheim", "Itteville", "Izon", "Jablines", "Jagny-sous-Bois", "Jambville", "Janneyrias", "Janville", "Janville-sur-Juine", "Janvry", "Jard-sur-Mer", "Jarrie", "Jarville-la-Malgrange",
        "Jassans-Riottier", "Jatxou", "Jaux", "Jonquerettes", "Jonquières", "Jons", "Jonzier-Épagny", "Jouarre", "Jougne", "Jouques", "Jouy-Mauvoisin", "Joué-lès-Tours", "Jumeauville", "Junas", "Jurançon",
        "Kani-Kéli", "Kaysersberg Vignoble", "Kembs", "Kervignac", "Kilstett", "Kingersheim", "Knutange", "Koungou", "Kourou", "Krautwiller", "L'Aiguillon-la-Presqu'île", "L'Ajoupa-Bouillon", "L'Arbresle", "L'Hermitage", "L'Houmeau",
        "L'Huisserie", "L'Isle-Jourdain", "L'Isle-d'Abeau", "L'Isle-sur-la-Sorgue", "L'Épine", "La Balme-de-Thuy", "La Barben", "La Barre-de-Monts", "La Bassée", "La Bastidonne", "La Bernerie-en-Retz", "La Biolle", "La Boisse", "La Brée-les-Bains", "La Buisse",
        "La Bâthie", "La Celle", "La Celle-les-Bordes", "La Celle-sur-Morin", "La Chapelle-Longueville", "La Chapelle-Rambaud", "La Chapelle-Saint-Luc", "La Chapelle-Saint-Mesmin", "La Chapelle-d'Abondance", "La Chapelle-d'Armentières", "La Chapelle-des-Fougeretz", "La Chapelle-la-Reine", "La Chapelle-sur-Erdre", "La Chevrolière", "La Cluse-et-Mijoux",
        "La Côte-d'Arbroz", "La Désirade", "La Ferté-Alais", "La Ferté-Saint-Aubin", "La Ferté-sous-Jouarre", "La Forclaz", "La Forêt-Fouesnant", "La Garde-Freinet", "La Giettaz", "La Guérinière", "La Haie-Fouassière", "La Houssaye-en-Brie", "La Jarrie", "La Londe", "La Membrolle-sur-Choisille",
        "La Montagne", "La Motte", "La Mulatière", "La Muraz", "La Mézière", "La Môle", "La Pierre", "La Plaine-des-Palmistes", "La Plaine-sur-Mer", "La Possession", "La Queue-les-Yvelines", "La Riche", "La Rivière-Enverse", "La Roche-sur-Yon", "La Roque-d'Anthéron",
        "La Salle-les-Alpes", "La Salvetat-Saint-Gilles", "La Terrasse", "La Tour-d'Aigues", "La Tranche-sur-Mer", "La Tremblade", "La Trinité", "La Trinité-sur-Mer", "La Turballe", "La Vaupalière", "La Vernaz", "La Verpillière", "La Ville-aux-Dames", "La Wantzenau", "Labarthe-sur-Lèze",
        "Labastide-Saint-Sernin", "Labbeville", "Labenne", "Labergement-Sainte-Marie", "Lacanau", "Lacenas", "Lachassagne", "Lacroix-Falgarde", "Lacroix-Saint-Ouen", "Lagnieu", "Lahonce", "Laigneville", "Lama", "Lamanon", "Lamballe-Armor",
        "Lamentin", "Lampertheim", "Lancieux", "Landerneau", "Lanester", "Langlade", "Langoiran", "Langrune-sur-Mer", "Langueux", "Lannoy", "Lans-en-Vercors", "Lansargues", "Lanton", "Lanvallay", "Lapeyrouse-Fossat",
        "Lardy", "Larmor-Plage", "Larressore", "Larringes", "Larçay", "Lassy", "Lathuile", "Latour-Bas-Elne", "Latresne", "Laudun-l'Ardoise", "Launaguet", "Lauris", "Lauzerville", "Laval", "Laventie",
        "Laxou", "Le Ban-Saint-Martin", "Le Barcarès", "Le Barp", "Le Bignon", "Le Biot", "Le Bourg-d'Oisans", "Le Cannet-des-Maures", "Le Carbet", "Le Champ-près-Froges", "Le Château-d'Oléron", "Le Châtelet-en-Brie", "Le Coudray", "Le Creusot", "Le Croisic",
        "Le Crotoy", "Le François", "Le Grand-Quevilly", "Le Grand-Village-Plage", "Le Haillan", "Le Havre", "Le Houlme", "Le Lamentin", "Le Loroux-Bottereau", "Le Lorrain", "Le Luc", "Le Maisnil", "Le Mans", "Le Marigot", "Le Mesnil-Amelot",
        "Le Mesnil-Aubry", "Le Mesnil-Esnard", "Le Meux", "Le Morne-Rouge", "Le Morne-Vert", "Le Moule", "Le Muy", "Le Palais", "Le Pellerin", "Le Perchay", "Le Petit-Quevilly", "Le Pian-Médoc", "Le Pin", "Le Plessis-Belleville", "Le Plessis-Gassot",
        "Le Plessis-Luzarches", "Le Pont-de-Claix", "Le Pontet", "Le Porge", "Le Port", "Le Prêcheur", "Le Relecq-Kerhuon", "Le Rheu", "Le Robert", "Le Sappey-en-Chartreuse", "Le Taillan-Médoc", "Le Tampon", "Le Thor", "Le Tourne", "Le Triadou",
        "Le Tréport", "Le Val", "Le Val d'Hazey", "Le Val-Saint-Germain", "Le Vauclin", "Le Versoud", "Lecci", "Leers", "Lens", "Les Abymes", "Les Adrets", "Les Ageux", "Les Alluets-le-Roi", "Les Angles", "Les Arcs",
        "Les Avanchers-Valmorel", "Les Baux-de-Provence", "Les Bréviaires", "Les Chapelles-Bourbon", "Les Chères", "Les Fins", "Les Fourgs", "Les Herbiers", "Les Hôpitaux-Neufs", "Les Hôpitaux-Vieux", "Les Matelles", "Les Mathes", "Les Molières", "Les Moutiers-en-Retz", "Les Noës-près-Troyes",
        "Les Orres", "Les Ponts-de-Cé", "Les Rousses", "Les Sables-d'Olonne", "Les Sorinières", "Les Trois-Bassins", "Les Villards-sur-Thônes", "Lescar", "Lesches", "Lespinasse", "Lesquin", "Lestiac-sur-Garonne", "Leucate", "Leudeville", "Lezennes",
        "Liancourt", "Libourne", "Liffré", "Lignan-de-Bordeaux", "Lillebonne", "Limas", "Limetz-Villez", "Limoges", "Limoges-Fourches", "Lingolsheim", "Linselles", "Lion-sur-Mer", "Lipsheim", "Lissieu", "Lissy",
        "Lit-et-Mixe", "Liverdy-en-Brie", "Livilliers", "Liévin", "Locmaria", "Locmariaquer", "Locmiquélic", "Loire-sur-Rhône", "Loisin", "Lompret", "Longeville-lès-Metz", "Longeville-sur-Mer", "Longueau", "Longueil-Annel", "Longuenesse",
        "Longuesse", "Longvic", "Longvilliers", "Longwy", "Lons", "Loon-Plage", "Lopigna", "Lorgues", "Lorient", "Loriol-du-Comtat", "Lormont", "Lornay", "Louverné", "Louviers", "Louvigny",
        "Louvil", "Louvres", "Lovagny", "Loyettes", "Lozanne", "Luc-sur-Mer", "Lucciana", "Lucenay", "Lucé", "Ludon-Médoc", "Lugrin", "Luisant", "Lully", "Lumbin", "Lumio",
        "Lunel", "Lunel-Viel", "Luynes", "Luzarches", "Luzinay", "Lyaud", "Lys-lez-Lannoy", "Lèves", "Léaz", "Léguevin", "Léon", "Lévis-Saint-Nom", "M'Tsangamouji", "Machecoul-Saint-Même", "Machemont",
        "Macouba", "Macouria", "Maffliers", "Magny-en-Vexin", "Magny-sur-Tille", "Maincy", "Maintenon", "Mainvilliers", "Maisse", "Maizières-lès-Metz", "Malaunay", "Malbuisson", "Malemort", "Mallemort", "Malzéville",
        "Mamoudzou", "Mana", "Manduel", "Manom", "Manosque", "Manéglise", "Marcellaz-Albanais", "Marcheprime", "Marchezais", "Marcilly-d'Azergues", "Marcq", "Marcy", "Mardié", "Mareil-en-France", "Mareil-le-Guyon",
        "Mareil-sur-Mauldre", "Marennes", "Mareuil-lès-Meaux", "Margencel", "Margny-lès-Compiègne", "Marguerittes", "Marignier", "Marigny-Saint-Marcel", "Marin", "Marines", "Maripasoula", "Marlenheim", "Marles-en-Brie", "Marlioz", "Marly",
        "Marly", "Marly-la-Ville", "Marnaz", "Maromme", "Marquette-lez-Lille", "Marsannay-la-Côte", "Marseillan", "Marsillargues", "Marsilly", "Martignas-sur-Jalle", "Martillac", "Martot", "Mas-Blanc-des-Alpilles", "Massieux", "Mathieu",
        "Matoury", "Maubec", "Mauchamps", "Maulette", "Mauregard", "Maussane-les-Alpilles", "Mauves-sur-Loire", "Maxilly-sur-Léman", "Maxéville", "Maysel", "Mazan", "Meillerie", "Melesse", "Mello", "Menouville",
        "Menthonnex-sous-Clermont", "Mercury", "Merlimont", "Mervilla", "Merville", "Merville-Franceville-Plage", "Mesquer", "Messanges", "Messimy", "Messy", "Mettray", "Metz", "Meximieux", "Meyrargues", "Mieussy",
        "Milhaud", "Millemont", "Millery", "Milly-la-Forêt", "Mimizan", "Minzier", "Mionnay", "Mions", "Mios", "Mireval", "Miribel", "Misérieux", "Mittelhausbergen", "Modène", "Mogneville",
        "Moigny-sur-École", "Moirans", "Moisselles", "Moliets-et-Maa", "Molsheim", "Moncale", "Monceaux", "Monchy-Saint-Éloi", "Mondelange", "Mondeville", "Mondeville", "Mondonville", "Mondouzil", "Mons", "Mons-en-Barœul",
        "Mont-Saint-Aignan", "Mont-Saint-Martin", "Mont-l'Évêque", "Montagnac", "Montagnole", "Montagny", "Montagny-Sainte-Félicité", "Montagny-les-Lanches", "Montaigu-Vendée", "Montainville", "Montanay", "Montargis", "Montarnaud", "Montataire", "Montauban",
        "Montbazin", "Montbazon", "Montberon", "Montceau-les-Mines", "Montchaboud", "Montereau-Fault-Yonne", "Monteux", "Montgermont", "Montgeroult", "Montgiscard", "Monticello", "Montigny-lès-Metz", "Montigny-sur-Loing", "Montivilliers", "Montlaur",
        "Montlebon", "Montlognon", "Montlouis-sur-Loire", "Montluel", "Montmacq", "Montmélian", "Montoir-de-Bretagne", "Montperreux", "Montrabé", "Montreuil-Juigné", "Monts", "Montsinéry-Tonnegrande", "Montsoult", "Montussan", "Montvalezan",
        "Montville", "Montélimar", "Montépilloy", "Morainvilliers", "Morancez", "Morancé", "Mordelles", "Moret-Loing-et-Orvanne", "Morigny-Champigny", "Morières-lès-Avignon", "Mormant", "Mornant", "Morne-à-l'Eau", "Mortcerf", "Morteau",
        "Mortefontaine", "Mouguerre", "Moulineaux", "Moulins-lès-Metz", "Mouriès", "Mouroux", "Mousseaux-sur-Seine", "Moussy-le-Neuf", "Moussy-le-Vieux", "Mouthe", "Mouxy", "Mouy", "Mtsamboro", "Mudaison", "Mulhouse",
        "Mundolsheim", "Muret", "Murianette", "Murles", "Murviel-lès-Montpellier", "Mus", "Musièges", "Mutzig", "Mèze", "Mégevette", "Mélicocq", "Ménerville", "Méricourt", "Méry", "Méré",
        "Mésigny", "Métabief", "Mûres", "Mûrs-Erigné", "Nages-et-Solorgues", "Nainville-les-Roches", "Nancy", "Nangis", "Nans-les-Pins", "Nanteuil-le-Haudouin", "Narbonne", "Nazelles-Négron", "Nemours", "Nerville-la-Forêt", "Neufchâtel-Hardelot",
        "Neufmoutiers-en-Brie", "Neuilly-Crimolois", "Neuville-en-Ferrain", "Neyron", "Niederhausbergen", "Nieppe", "Nieul-sur-Mer", "Nilvange", "Nivolas-Vermelle", "Nogent-sur-Oise", "Nogent-sur-Seine", "Nointel", "Noirmoutier-en-l'Île", "Nonglard", "Nort-sur-Erdre",
        "Notre-Dame-d'Oé", "Notre-Dame-de-Bellecombe", "Notre-Dame-de-Bondeville", "Notre-Dame-de-Monts", "Notre-Dame-du-Bec", "Novel", "Noves", "Noyal-Châtillon-sur-Seiche", "Noyal-sur-Vilaine", "Noyarey", "Noyelles-lès-Seclin", "Nâves-Parmelan", "Nérigean", "Nîmes", "Obernai",
        "Oberschaeffolsheim", "Octeville-sur-Mer", "Offranville", "Oinville-sur-Montcient", "Oissel", "Oletta", "Olivet", "Ollières", "Oncy-sur-École", "Ondres", "Orange", "Orchies", "Orcier", "Orgerus", "Orgères",
        "Orival", "Orliénas", "Orléans", "Ormes", "Orvault", "Orveau", "Osmoy", "Ostwald", "Othis", "Ouanary", "Ouangani", "Ouessant", "Ouges", "Ouistreham", "Ozouer-le-Voulgis",
        "Pacé", "Paillet", "Paimpol", "Pallud", "Pamandzi", "Papaichton", "Paradou", "Parempuyre", "Parentis-en-Born", "Parçay-Meslay", "Passy", "Pau", "Pechbonnieu", "Pechbusque", "Pecqueuse",
        "Peillon", "Peillonnex", "Pennedepie", "Penta-di-Casinca", "Perdreauville", "Peri", "Pernes-les-Fontaines", "Perpignan", "Perrigny-lès-Dijon", "Perros-Guirec", "Perthes", "Pertuis", "Petit-Bourg", "Petit-Canal", "Petit-Couronne",
        "Petite-Île", "Peyrolles-en-Provence", "Pfulgriesheim", "Phalempin", "Piana", "Pibrac", "Pierrefeu-du-Var", "Pierrevert", "Pigna", "Pignan", "Pignans", "Pin-Balma", "Pins-Justaret", "Pinsaguel", "Piolenc",
        "Piriac-sur-Mer", "Plailly", "Plaisance-du-Touch", "Plan-d'Aups-Sainte-Baume", "Plescop", "Pleurtuit", "Plobsheim", "Ploemeur", "Ploeren", "Plombières-lès-Dijon", "Plougastel-Daoulas", "Plougonvelin", "Plouharnel", "Plouhinec", "Plouzané",
        "Plumetot", "Pluneret", "Pléneuf-Val-André", "Plérin", "Pocé-sur-Cisse", "Poggio-Mezzana", "Pointe-Noire", "Pointe-à-Pitre", "Poisat", "Poitiers", "Poleymieux-au-Mont-d'Or", "Pollionnay", "Pommeuse", "Pommiers", "Pompertuzat",
        "Pompignac", "Pont-Péan", "Pont-Saint-Martin", "Pont-Sainte-Marie", "Pont-Sainte-Maxence", "Pont-de-Chéruy", "Pont-de-Metz", "Pont-l'Abbé", "Pont-l'Évêque", "Pont-Évêque", "Pontarlier", "Pontarmé", "Pontcharra", "Pontchâteau", "Pontpoint",
        "Pornic", "Port-Jérôme-sur-Seine", "Port-Louis", "Port-Louis", "Port-Saint-Louis-du-Rhône", "Port-Saint-Père", "Port-Vendres", "Port-la-Nouvelle", "Porte des Pierres Dorées", "Porte-de-Savoie", "Portes-lès-Valence", "Portet-sur-Garonne", "Portiragnes", "Poulx", "Pourcieux",
        "Pourrières", "Poussan", "Presles", "Presles-en-Brie", "Provins", "Prunay-le-Temple", "Prunelli-di-Fiumorbo", "Précy-sur-Marne", "Précy-sur-Oise", "Préfailles", "Prémanon", "Prémesques", "Puget-Ville", "Pugny-Chatenod", "Puilboreau",
        "Puiselet-le-Marais", "Puiseux-en-France", "Pujaut", "Pusignan", "Puy-Saint-Vincent", "Puyloubier", "Péchabou", "Pénestin", "Péone", "Pérenchies", "Périers-sur-le-Dan", "Périgny", "Péronne-en-Mélantois", "Pérouges", "Pézenas",
        "Quesnoy-sur-Deûle", "Quetigny", "Quiberon", "Quimper", "Quincampoix", "Quincieux", "Quinsac", "Quint-Fonsegrives", "Quintal", "Quéven", "Radinghem-en-Weppes", "Raizeux", "Ramonville-Saint-Agne", "Rantigny", "Raray",
        "Rebigue", "Recloses", "Redessan", "Reichstett", "Reims", "Remire-Montjoly", "Renage", "Restinclières", "Rethel", "Reuil-en-Brie", "Revest-les-Roches", "Reyrieux", "Rezé", "Riantec", "Ribeauvillé",
        "Ribécourt-Dreslincourt", "Richebourg", "Richemont", "Rieux", "Rillieux-la-Pape", "Rivery", "Rives", "Rivière-Pilote", "Rivière-Salée", "Robion", "Rocbaron", "Rochecorbon", "Rochefort", "Rochefort-du-Gard", "Rochefort-en-Yvelines",
        "Rochetaillée-sur-Saône", "Rodilhan", "Rognonas", "Roinville", "Rolleboise", "Rolleville", "Romagnat", "Rombas", "Ronchin", "Roncq", "Roquemaure", "Roques", "Roquettes", "Rosay", "Rosenau",
        "Rosheim", "Rosières-près-Troyes", "Rosny-sur-Seine", "Roubaix", "Rouen", "Rouffach", "Rouffiac-Tolosan", "Rougiers", "Rouilly", "Roura", "Royan", "Royat", "Rully", "Ruy-Montceau", "Réau",
        "Régina", "Sada", "Sagy", "Sailly-lez-Lannoy", "Sain-Bel", "Sainghin-en-Mélantois", "Saint François Longchamp", "Saint-Aignan-Grandlieu", "Saint-Alban", "Saint-Alban-de-Roche", "Saint-Amand-les-Eaux", "Saint-André", "Saint-André-de-Boëge", "Saint-André-de-Corcy", "Saint-André-de-Sangonis",
        "Saint-André-de-Seignanx", "Saint-André-des-Eaux", "Saint-André-les-Vergers", "Saint-Antoine", "Saint-Apollinaire", "Saint-Arnoult", "Saint-Arnoult-en-Yvelines", "Saint-Aubin-d'Arquenay", "Saint-Aubin-de-Médoc", "Saint-Aubin-lès-Elbeuf", "Saint-Aubin-sur-Mer", "Saint-Aubin-Épinay", "Saint-Aunès", "Saint-Avertin", "Saint-Avé",
        "Saint-Baldoph", "Saint-Barthélemy-d'Anjou", "Saint-Benoît", "Saint-Berthevin", "Saint-Bonnet-de-Mure", "Saint-Brevin-les-Pins", "Saint-Briac-sur-Mer", "Saint-Brice", "Saint-Brice-Courcelles", "Saint-Brieuc", "Saint-Brès", "Saint-Caprais-de-Bordeaux", "Saint-Cassin", "Saint-Chéron", "Saint-Claude",
        "Saint-Contest", "Saint-Cyprien", "Saint-Cyr-en-Arthies", "Saint-Cyr-en-Val", "Saint-Cyr-sous-Dourdan", "Saint-Cyr-sur-Loire", "Saint-Cézaire-sur-Siagne", "Saint-Denis", "Saint-Denis-d'Oléron", "Saint-Denis-en-Val", "Saint-Didier", "Saint-Dionisy", "Saint-Drézéry", "Saint-Erblon", "Saint-Esprit",
        "Saint-Estève", "Saint-Estève-Janson", "Saint-Eusèbe", "Saint-Fiacre", "Saint-Florent", "Saint-Fons", "Saint-Forget", "Saint-Félix", "Saint-Geniès-Bellevue", "Saint-Geniès-des-Mourgues", "Saint-Genouph", "Saint-Georges", "Saint-Georges-d'Oléron", "Saint-Georges-d'Orques", "Saint-Georges-de-Didonne",
        "Saint-Georges-de-Reneins", "Saint-Geours-de-Maremne", "Saint-Germain-Laval", "Saint-Germain-Nuelles", "Saint-Germain-au-Mont-d'Or", "Saint-Germain-de-la-Grange", "Saint-Germain-la-Blanche-Herbe", "Saint-Germain-sur-École", "Saint-Gervasy", "Saint-Gildas-de-Rhuys", "Saint-Gilles", "Saint-Gilles-Croix-de-Vie", "Saint-Gingolph", "Saint-Grégoire", "Saint-Herblain",
        "Saint-Hilaire-Saint-Mesmin", "Saint-Hilaire-de-Riez", "Saint-Hilarion", "Saint-Jacques-de-la-Lande", "Saint-Jean", "Saint-Jean-d'Arvey", "Saint-Jean-d'Aulps", "Saint-Jean-d'Illac", "Saint-Jean-de-Beauregard", "Saint-Jean-de-Boiseau", "Saint-Jean-de-Bournay", "Saint-Jean-de-Braye", "Saint-Jean-de-Moirans", "Saint-Jean-de-Monts", "Saint-Jean-de-Tholome",
        "Saint-Jean-de-la-Ruelle", "Saint-Jean-des-Vignes", "Saint-Jean-le-Blanc", "Saint-Jeoire", "Saint-Jeoire-Prieuré", "Saint-Jory", "Saint-Joseph", "Saint-Joseph", "Saint-Jouan-des-Guérets", "Saint-Julien-de-Concelles", "Saint-Julien-en-Born", "Saint-Julien-les-Villas", "Saint-Just", "Saint-Just-Chaleyssin", "Saint-Lary-Soulan",
        "Saint-Laurent", "Saint-Laurent-Blangy", "Saint-Laurent-d'Agny", "Saint-Laurent-d'Aigouze", "Saint-Laurent-de-Brèvedent", "Saint-Laurent-de-la-Salanque", "Saint-Laurent-du-Maroni", "Saint-Laurent-en-Grandvaux", "Saint-Leu-d'Esserent", "Saint-Loubès", "Saint-Louis", "Saint-Louis", "Saint-Louis", "Saint-Loup-Cammas", "Saint-Lunaire",
        "Saint-Léger-du-Bourg-Denis", "Saint-Léger-les-Vignes", "Saint-Léonard", "Saint-Malo", "Saint-Mammès", "Saint-Marcel", "Saint-Marcel-lès-Valence", "Saint-Mard", "Saint-Mars-du-Désert", "Saint-Martin-Boulogne", "Saint-Martin-Vésubie", "Saint-Martin-d'Hères", "Saint-Martin-de-Crau", "Saint-Martin-de-Queyrières", "Saint-Martin-de-Seignanx",
        "Saint-Martin-des-Champs", "Saint-Martin-du-Bec", "Saint-Martin-du-Manoir", "Saint-Martin-du-Tertre", "Saint-Martin-du-Vivier", "Saint-Martin-en-Bière", "Saint-Martin-la-Garenne", "Saint-Martin-le-Vinoux", "Saint-Martin-lez-Tatinghem", "Saint-Mathieu-de-Tréviers", "Saint-Maurice-Montcouronne", "Saint-Maurice-de-Beynost", "Saint-Maurice-de-Gourdans", "Saint-Max", "Saint-Maximin-la-Sainte-Baume",
        "Saint-Michel-Chef-Chef", "Saint-Morillon", "Saint-Médard-d'Eyrans", "Saint-Médard-en-Jalles", "Saint-Méloir-des-Ondes", "Saint-Nazaire", "Saint-Nazaire-de-Pézan", "Saint-Nazaire-les-Eymes", "Saint-Nicolas", "Saint-Nizier-du-Moucherotte", "Saint-Omer", "Saint-Orens-de-Gameville", "Saint-Ouen-du-Tilleul", "Saint-Ours", "Saint-Pair-sur-Mer",
        "Saint-Palais-sur-Mer", "Saint-Pantaléon-de-Larche", "Saint-Pathus", "Saint-Paul-en-Chablais", "Saint-Paul-en-Forêt", "Saint-Paul-et-Valmalle", "Saint-Paul-lès-Dax", "Saint-Philbert-de-Grand-Lieu", "Saint-Philibert", "Saint-Philippe", "Saint-Pierre", "Saint-Pierre", "Saint-Pierre-Quiberon", "Saint-Pierre-d'Irube", "Saint-Pierre-d'Oléron",
        "Saint-Pierre-de-Chandieu", "Saint-Pierre-des-Corps", "Saint-Pierre-la-Palud", "Saint-Pierre-lès-Elbeuf", "Saint-Pierre-lès-Nemours", "Saint-Priest", "Saint-Pryvé-Saint-Mesmin", "Saint-Père-en-Retz", "Saint-Pée-sur-Nivelle", "Saint-Péray", "Saint-Quay-Portrieux", "Saint-Quentin", "Saint-Quentin-Fallavier", "Saint-Quentin-de-Baron", "Saint-Renan",
        "Saint-Romain-en-Gier", "Saint-Rémy-de-Provence", "Saint-Saturnin-lès-Avignon", "Saint-Saulve", "Saint-Sauveur", "Saint-Sauveur", "Saint-Sauveur-sur-École", "Saint-Sigismond", "Saint-Sixt", "Saint-Sulpice-de-Favières", "Saint-Sulpice-et-Cameyrac", "Saint-Sulpice-la-Pointe", "Saint-Sylvestre", "Saint-Symphorien-d'Ozon", "Saint-Sébastien-sur-Loire",
        "Saint-Trojan-les-Bains", "Saint-Vaast-en-Auge", "Saint-Valery-sur-Somme", "Saint-Vincent-de-Paul", "Saint-Vincent-de-Tyrosse", "Saint-Vincent-sur-Jard", "Saint-Vrain", "Saint-Witz", "Saint-Xandre", "Saint-Yrieix-sur-Charente", "Saint-Élie", "Saint-Étienne-de-Montluc", "Saint-Étienne-de-Tinée", "Saint-Étienne-du-Grès", "Saint-Étienne-du-Rouvray",
        "Sainte-Adresse", "Sainte-Anne", "Sainte-Anne", "Sainte-Catherine", "Sainte-Consorce", "Sainte-Eulalie", "Sainte-Foy-Tarentaise", "Sainte-Foy-d'Aigrefeuille", "Sainte-Gemmes-sur-Loire", "Sainte-Luce", "Sainte-Luce-sur-Loire", "Sainte-Marie", "Sainte-Marie", "Sainte-Marie-la-Mer", "Sainte-Pazanne",
        "Sainte-Rose", "Sainte-Rose", "Sainte-Savine", "Sainte-Soulle", "Sainte-Suzanne", "Salazie", "Saleilles", "Sales", "Saleux", "Sallebœuf", "Sallenôves", "Salles", "Salles-sur-Mer", "Salon-de-Provence", "Salouël",
        "Samois-sur-Seine", "San-Martino-di-Lota", "Sangatte", "Sanguinet", "Sant'Andréa-d'Orcino", "Santa-Lucia-di-Moriani", "Santa-Maria-di-Lota", "Santa-Reparata-di-Balagna", "Santes", "Santeuil", "Saran", "Sarrians", "Sartène", "Sarzeau", "Sassenage",
        "Sathonay-Village", "Satolas-et-Bonce", "Saubens", "Saubion", "Saucats", "Saujon", "Saulx-Marchais", "Saumane-de-Vaucluse", "Sausheim", "Sautron", "Sauveterre", "Sauvian", "Sauzon", "Savenay", "Saverne",
        "Savigny", "Savigny", "Savonnières", "Saxel", "Saül", "Schiltigheim", "Schweighouse-sur-Moder", "Schœlcher", "Scientrier", "Scionzier", "Seclin", "Sedan", "Seilh", "Seillans", "Seillons-Source-d'Argens",
        "Semoy", "Senlisse", "Sennecey-lès-Dijon", "Septeuil", "Sequedin", "Seraincourt", "Sermaise", "Serra-di-Ferro", "Seugy", "Seysses", "Seyssinet-Pariset", "Seyssuel", "Seytroux", "Sierentz", "Sigean",
        "Signes", "Silly-le-Long", "Simandres", "Sin-le-Noble", "Sinnamary", "Sivry-Courtry", "Sixt-Fer-à-Cheval", "Soindres", "Soissons", "Soisy-sur-École", "Solaize", "Sommières", "Sonnaz", "Sorbo-Ocagnano", "Sorgues",
        "Sotteville-lès-Rouen", "Sotteville-sous-le-Val", "Soucieu-en-Jarrest", "Souffelweyersheim", "Soulac-sur-Mer", "Soullans", "Sourcieux-les-Mines", "Soustons", "Stutzheim-Offenheim", "Sucé-sur-Erdre", "Survilliers", "Surzur", "Sussargues", "Sète", "Séez",
        "Sélestat", "Sénas", "Séné", "Sérignan", "Sérézin-du-Rhône", "Tabanac", "Tacoignières", "Taglio-Isolaccio", "Taillades", "Taissy", "Talange", "Talant", "Talasani", "Talmont-Saint-Hilaire", "Taluyers",
        "Tanneron", "Taradeau", "Tarascon", "Tarnos", "Tavaco", "Templemars", "Templeuve-en-Pévèle", "Tencin", "Ternay", "Terre-de-Bas", "Terre-de-Haut", "Terville", "Theix-Noyalo", "Theuville", "Thiers-sur-Thève",
        "Thieux", "Thionville", "Thiverny", "Thiverval-Grignon", "Thoiry", "Thollon-les-Mémises", "Thomery", "Thorigné-Fouillard", "Thouaré-sur-Loire", "Thourotte", "Thurins", "Thusy", "Thyez", "Théméricourt", "Tigeaux",
        "Tignieu-Jameyzieu", "Tillé", "Tinqueux", "Tomblaine", "Torfou", "Torreilles", "Tosse", "Toufflers", "Touillon-et-Loutelet", "Touques", "Tourcoing", "Tourmignies", "Tournefeuille", "Tourrettes", "Tours",
        "Tours-en-Savoie", "Tourves", "Tourville-la-Rivière", "Toussieu", "Tramoyes", "Trans-en-Provence", "Treillières", "Tresserve", "Tresses", "Tressin", "Trie-Château", "Trie-la-Ville", "Trignac", "Trilbardou", "Trois-Rivières",
        "Troyes", "Truchtersheim", "Trégueux", "Trégunc", "Trélazé", "Trévignin", "Trévoux", "Tsingoni", "Turckheim", "Turretot", "Téteghem-Coudekerque-Village", "Uchaud", "Uckange", "Urcuit", "Urrugne",
        "Us", "Usinens", "Ussac", "Ustaritz", "Uzès", "Vailhauquès", "Val-Cenis", "Val-de-Reuil", "Val-de-la-Haye", "Valdahon", "Valence", "Valenciennes", "Valencin", "Valergues", "Vallangoujard",
        "Valle-di-Mezzana", "Vallet", "Vallières-sur-Fier", "Valloire", "Vallorcine", "Vallouise-Pelvoux", "Valmeinier", "Valpuiseaux", "Valras-Plage", "Valserhône", "Vandœuvre-lès-Nancy", "Vannes", "Vanzy", "Varaville", "Varces-Allières-et-Risset",
        "Varennes-sur-Seine", "Vars", "Vaugrigneuse", "Vaulnaveys-le-Bas", "Vaulnaveys-le-Haut", "Vaulx", "Vaulx-Milieu", "Vaulx-en-Velin", "Vauvenargues", "Vauvert", "Vauville", "Vaux-sur-Mer", "Vayres", "Vayres-sur-Essonne", "Vedène",
        "Veigné", "Velleron", "Vendenheim", "Vendeville", "Vendres", "Venette", "Venon", "Venthon", "Venzolasca", "Ver-sur-Launette", "Verberie", "Verchaix", "Verel-Pragondran", "Vergèze", "Verlinghem",
        "Vern-sur-Seiche", "Vernaison", "Verneuil-en-Halatte", "Vernon", "Vernou-la-Celle-sur-Seine", "Vernou-sur-Brenne", "Vernouillet", "Vernègues", "Vero", "Verrières-en-Anjou", "Vers", "Versigny", "Verson", "Versonnex", "Vert-le-Grand",
        "Vert-le-Petit", "Vertou", "Vescovato", "Vestric-et-Candiac", "Veurey-Voroize", "Vezin-le-Coquet", "Viarmes", "Vias", "Vic-la-Gardiole", "Vico", "Vicq", "Vidauban", "Videlles", "Vieille-Toulouse", "Vielle-Saint-Girons",
        "Vienne", "Vienne-en-Arthies", "Vieux-Boucau-les-Bains", "Vieux-Fort", "Vieux-Habitants", "Vif", "Vignely", "Vigneux-de-Bretagne", "Vigny", "Vigoulet-Auzil", "Village-Neuf", "Villaines-sous-Bois", "Villanova", "Villard", "Villard-Bonnot",
        "Villars-les-Dombes", "Villate", "Ville-di-Pietrabugno", "Ville-en-Sallaz", "Villefontaine", "Villefranche-sur-Saône", "Villefranque", "Villelaure", "Villemoirieu", "Villemur-sur-Tarn", "Villenave-d'Ornon", "Villeneuve-Saint-Denis", "Villeneuve-Tolosane", "Villeneuve-d'Ascq", "Villeneuve-de-la-Raho",
        "Villeneuve-le-Comte", "Villeneuve-lès-Avignon", "Villeneuve-sous-Dammartin", "Villeron", "Villers-Cotterêts", "Villers-Saint-Frambourg-Ognon", "Villers-Saint-Paul", "Villers-le-Lac", "Villers-lès-Nancy", "Villers-sous-Saint-Leu", "Villerupt", "Villerville", "Villetelle", "Villette", "Villette-d'Anthon",
        "Villette-de-Vienne", "Villevaudé", "Villeveyrac", "Villiers-en-Bière", "Villiers-le-Mahieu", "Villiers-le-Sec", "Vimines", "Vinon-sur-Verdon", "Vinzier", "Vitré", "Viuz-la-Chiésaz", "Viviers-du-Lac", "Vizille", "Voglans", "Voiron",
        "Voisenon", "Volmerange-les-Mines", "Voreppe", "Vougy", "Vourles", "Vouvray", "Vémars", "Vénissieux", "Vétheuil", "Wahlenheim", "Wannehain", "Wasselonne", "Wattignies", "Wattrelos", "Wentzwiller",
        "Wervicq-Sud", "Weyersheim", "Willems", "Wimereux", "Wintzenheim", "Witry-lès-Reims", "Wittelsheim", "Wittenheim", "Woippy", "Wolfisheim", "Yutz", "Yvrac", "Zonza", "Zoufftgen", "Ève",
        "Échirolles", "Écouflant", "Éloise", "Émancé", "Éperlecques", "Épernon", "Épinay-Champlâtreux", "Épouville", "Épron", "Équemauville", "Étampes", "Étaples", "Étel", "Étercy", "Étréchy",
        "Éveux", "Évrange", "Évreux", "Évry-Grégy-sur-Yerre", "Île-Molène", "Île-aux-Moines", "Île-d'Aix", "Île-d'Arz", "Île-d'Houat", "Île-d'Yeu", "Île-de-Batz", "Île-de-Bréhat", "Île-de-Sein"
    ],
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

// Fonction améliorée pour mettre à jour l'interface utilisateur avec les résultats
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
    
    // 2. Afficher les résultats appropriés en cas de non-éligibilité
    if (!result.eligible) {
        resultsContainer.innerHTML = `
            <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                <p>${result.reason}</p>
            </div>
        `;
        return;
    }
    
    // 3. Personnaliser certains éléments selon le type de projet
    let projectTypeInfo = '';
    let projectTypeDetails = '';
    
    // Adapter les informations selon le type de projet
    if (result.projectType === 'social') {
        projectTypeInfo = `
            <div class="result-card bg-blue-700 bg-opacity-30">
                <p class="result-value">Logement social</p>
                <p class="result-label">Type de projet</p>
            </div>
        `;
        projectTypeDetails = `
            <li class="bg-blue-900 bg-opacity-30 p-2 rounded-lg">
                <span class="text-white font-medium">Information HLM:</span> 
                Le PTZ permet aux locataires d'acquérir leur logement social avec des conditions avantageuses.
            </li>
        `;
    } else if (result.projectType === 'ancien') {
        projectTypeInfo = `
            <div class="result-card bg-blue-700 bg-opacity-30">
                <p class="result-value">Logement ancien avec travaux</p>
                <p class="result-label">Type de projet</p>
            </div>
        `;
        projectTypeDetails = `
            <li class="bg-blue-900 bg-opacity-30 p-2 rounded-lg">
                <span class="text-white font-medium">Travaux obligatoires:</span> 
                Les travaux doivent représenter au minimum 25% du coût total de l'opération.
            </li>
        `;
    } else {
        // Type neuf
        projectTypeInfo = `
            <div class="result-card bg-blue-700 bg-opacity-30">
                <p class="result-value">Logement neuf</p>
                <p class="result-label">Type de projet</p>
            </div>
        `;
    }
    
    // Calcul de la mensualité PTZ (nouvelle fonctionnalité)
    const dureeRemboursementMois = (result.repaymentPeriods.totalDuration - result.repaymentPeriods.deferralPeriod) * 12;
    const mensualitePTZ = dureeRemboursementMois > 0 ? (result.amount / dureeRemboursementMois).toFixed(2) : 0;
    
    // 3. Afficher les résultats d'éligibilité avec les personnalisations
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
            <div class="result-card bg-green-700 bg-opacity-30">
                <p class="result-value">${mensualitePTZ.replace('.', ',')} €</p>
                <p class="result-label">Mensualité PTZ</p>
            </div>
            ${projectTypeInfo}
        </div>
        
        <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-blue-500 mb-6">
            <h5 class="text-lg font-semibold text-blue-400 mb-2">Détails du calcul</h5>
            <ul class="space-y-2">
                <li><span class="text-gray-400">Coût total de l'opération:</span> ${result.consideredCost.toLocaleString('fr-FR')} € (sur un maximum de ${result.maxCost.toLocaleString('fr-FR')} €)</li>
                <li><span class="text-gray-400">Tranche de revenus:</span> ${result.incomeBracket.replace('tranche', 'Tranche ')}</li>
                <li><span class="text-gray-400">Revenu ajusté:</span> ${Math.round(result.adjustedIncome).toLocaleString('fr-FR')} € (coefficient: ${result.coefficient})</li>
                ${projectTypeDetails}
                <li><span class="text-gray-400">Calcul mensualité PTZ:</span> ${result.amount.toLocaleString('fr-FR')} € ÷ ${dureeRemboursementMois} mois = ${mensualitePTZ.replace('.', ',')} €/mois</li>
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
        integratePTZButton.setAttribute('data-ptz-type', result.projectType);
        integratePTZButton.setAttribute('data-ptz-monthly', mensualitePTZ);
    }
    
    console.log("Résultats PTZ affichés avec succès pour le type de projet:", result.projectType);
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
        <tr class="bg-green-800 bg-opacity-20">
            <td class="px-4 py-2 font-medium">Avantage principal</td>
            <td class="px-4 py-2 text-center">Accès simplifié à la propriété neuve</td>
            <td class="px-4 py-2 text-center">Revitalisation des zones rurales</td>
            <td class="px-4 py-2 text-center">Permet aux locataires HLM de devenir propriétaires</td>
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

// Fonction optimisée pour configurer les contrôles du nombre de personnes dans le foyer
function setupHouseholdControls() {
    const increaseHouseholdBtn = document.getElementById('increase-household');
    const decreaseHouseholdBtn = document.getElementById('decrease-household');
    const householdSizeInput = document.getElementById('ptz-household-size');
    const householdDescription = document.getElementById('household-description');
    
    if (increaseHouseholdBtn && decreaseHouseholdBtn && householdSizeInput && householdDescription) {
        // Réinitialiser les gestionnaires d'événements existants
        const newIncreaseBtn = increaseHouseholdBtn.cloneNode(true);
        const newDecreaseBtn = decreaseHouseholdBtn.cloneNode(true);
        increaseHouseholdBtn.parentNode.replaceChild(newIncreaseBtn, increaseHouseholdBtn);
        decreaseHouseholdBtn.parentNode.replaceChild(newDecreaseBtn, decreaseHouseholdBtn);
        
        // Ajouter de nouveaux gestionnaires
        newIncreaseBtn.addEventListener('click', function() {
            let currentValue = parseInt(householdSizeInput.value);
            if (!isNaN(currentValue)) {
                householdSizeInput.value = currentValue + 1;
                updateHouseholdDescription(currentValue + 1);
            }
        });
        
        newDecreaseBtn.addEventListener('click', function() {
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
        
        // Mettre à jour la description initiale
        updateHouseholdDescription(parseInt(householdSizeInput.value) || 1);
    }
}

// Fonction pour mettre à jour la description du nombre de personnes
function updateHouseholdDescription(count) {
    const householdDescription = document.getElementById('household-description');
    if (householdDescription) {
        if (count === 1) {
            householdDescription.textContent = "1 personne";
        } else {
            householdDescription.textContent = count + " personnes";
        }
    }
}

// Fonction optimisée pour configurer le bouton de simulation
function setupPtzSimulationButton() {
    // Récupérer la référence au bouton de différentes manières
    let ptzButton = document.getElementById('calculate-ptz-button');
    
    if (!ptzButton) {
        // Recherche alternative dans le contenu du simulateur PTZ
        const ptzSimulator = document.getElementById('ptz-simulator');
        if (ptzSimulator) {
            ptzButton = ptzSimulator.querySelector('button[id="calculate-ptz-button"]') ||
                       ptzSimulator.querySelector('button:has(i.fa-play-circle)') ||
                       ptzSimulator.querySelector('button');
        }
    }
    
    if (ptzButton) {
        console.log("Bouton PTZ trouvé, application de correctifs...");
        
        // CORRECTION: Utiliser un gestionnaire direct sans cloner le bouton
        ptzButton.onclick = function(event) {
            event.preventDefault();
            console.log("Clic sur bouton PTZ avec le gestionnaire corrigé");
            simulerPTZ();
            return false;
        };
        
        // CORRECTION: Forcer l'ID
        if (!ptzButton.id) ptzButton.id = 'calculate-ptz-button';
        
        console.log("Correctif du bouton PTZ appliqué avec succès");
    } else {
        console.error("Bouton PTZ non trouvé");
    }
    
    // Adapter l'interface en fonction du type de projet sélectionné actuellement
    updateUIForProjectType();
}

// Fonction pour mettre à jour l'interface en fonction du type de projet sélectionné
function updateUIForProjectType() {
    const projectTypeSelect = document.getElementById('ptz-project-type');
    const zoneSelect = document.getElementById('ptz-zone');
    
    if (!projectTypeSelect) return;
    
    const projectType = projectTypeSelect.value;
    
    // Écouter les changements du type de projet
    projectTypeSelect.addEventListener('change', function() {
        const newProjectType = this.value;
        console.log("Type de projet changé:", newProjectType);

        // Afficher/masquer le sélecteur type de logement (maison/appart) selon le type de projet
        const housingTypeWrap = document.getElementById('ptz-housing-type-wrap');
        if (housingTypeWrap) {
            housingTypeWrap.style.display = (newProjectType === 'neuf') ? 'block' : 'none';
        }

        // Adapter l'interface en fonction du type de projet
        if (newProjectType === 'social') {
            // Pour les logements sociaux, mettre en évidence l'option
            this.classList.add('bg-blue-600');
            setTimeout(() => this.classList.remove('bg-blue-600'), 500);
            
            // Afficher un conseil pour les logements sociaux
            const zoneInfoElement = document.getElementById('ptz-zone-info');
            if (zoneInfoElement) {
                zoneInfoElement.innerHTML = `<strong>Logement social:</strong> Le PTZ permet aux locataires HLM d'acquérir leur logement dans des conditions avantageuses.`;
                zoneInfoElement.classList.remove('hidden');
                zoneInfoElement.style.animation = 'pulse 0.5s';
            }
        } else if (newProjectType === 'ancien') {
            // Pour les logements anciens, vérifier la zone
            if (zoneSelect && (zoneSelect.value === 'A' || zoneSelect.value === 'B1')) {
                alert("Pour un logement ancien avec travaux, seules les zones B2 et C sont éligibles.");
                // Mettre en évidence les options de zone valides
                for (let i = 0; i < zoneSelect.options.length; i++) {
                    if (zoneSelect.options[i].value === 'B2' || zoneSelect.options[i].value === 'C') {
                        zoneSelect.options[i].style.color = 'green';
                    } else {
                        zoneSelect.options[i].style.color = '';
                    }
                }
            }
        } else {
            // Réinitialiser les styles pour les autres types
            if (zoneSelect) {
                for (let i = 0; i < zoneSelect.options.length; i++) {
                    zoneSelect.options[i].style.color = '';
                }
            }
        }
    });
    
    // Déclencher l'événement change initial pour configurer l'interface au chargement
    const event = new Event('change');
    projectTypeSelect.dispatchEvent(event);
}

// Fonction principale pour initialiser le simulateur PTZ
function initPTZSimulator() {
    console.log("Initialisation du simulateur PTZ avec support HLM amélioré");
    
    // Initialiser l'index de villes
    initializeCityIndex();
    
    // Éléments du formulaire
    const ptzCityInput = document.getElementById('ptz-city-search');
    const ptzZoneSelect = document.getElementById('ptz-zone');
    const suggestionsList = document.getElementById('city-suggestions-container');
    
    // Configurer la recherche de villes
    if (ptzCityInput && suggestionsList) {
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
    }
    
    // Configurer les contrôles de household
    setupHouseholdControls();
    
    // Générer le tableau comparatif
    generatePTZComparisonTable();
    
    // CORRECTION: Configurer le bouton de simulation directement ici
    const ptzButton = document.getElementById('calculate-ptz-button');
    if (ptzButton) {
        console.log("Attachement direct de la fonction simulerPTZ au bouton");
        ptzButton.onclick = function(e) {
            e.preventDefault();
            simulerPTZ();
            return false;
        };
    }
    
    // S'assurer que le tableau de comparaison est à jour avec les données actuelles
    setTimeout(generatePTZComparisonTable, 500);
    
    console.log("Initialisation du simulateur PTZ terminée avec succès");
}

// Exposer explicitement la fonction dans la portée globale
window.initPTZSimulator = initPTZSimulator;

// Initialiser quand la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM chargé, initialisation du simulateur PTZ...");
    
    // Initialiser immédiatement
    initPTZSimulator();
    
    // CORRECTION: Attacher directement la fonction au bouton
    const ptzButton = document.getElementById('calculate-ptz-button');
    if (ptzButton) {
        console.log("Attachement direct au bouton depuis l'événement DOMContentLoaded");
        ptzButton.onclick = function(e) {
            e.preventDefault();
            simulerPTZ();
            return false;
        };
    }
    
    // Vérifier si l'onglet PTZ est déjà actif et initialiser
    const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
    if (ptzTab && ptzTab.classList.contains('active')) {
        console.log("L'onglet PTZ est actif au chargement, initialisation immédiate");
        initPTZSimulator();
    }
});

// Rendre disponible globalement si en mode non-module
if (typeof window !== 'undefined') {
    // Ces définitions sont redondantes mais assurent que la fonction est accessible de n'importe où
    window.PTZSimulator = PTZSimulator;
    window.initPTZSimulator = initPTZSimulator;
    window.searchCity = searchCity;
    window.simulerPTZ = simulerPTZ;
}

// SUPPRESSION de l'instruction export qui causait le problème
