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
        
        console.log("Valeurs récupérées:", {projectType, zone, income, householdSize, totalCost, cityName});
        
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
            projectType, zone, income, householdSize, totalCost, cityName
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
            repaymentPeriods: repaymentPeriods,
            projectType: this.projectType // Ajout du type de projet pour personnaliser l'affichage
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
    "A bis": ["Divonne-les-Bains", "Ferney-Voltaire", "Ornex", "Prévessin-Moëns", "Saint-Genis-Pouilly", "Sauverny", "Ségny", "Versonnex",
  "Beaulieu-sur-Mer", "Beausoleil", "Biot", "Cap-d'Ail", "Èze", "Roquebrune-Cap-Martin", "Roquefort-les-Pins", "Saint-Jean-Cap-Ferrat", "La Turbie", "Valbonne", "Villefranche-sur-Mer",
  "Cassis",
  "Chantilly",
  "Chamonix-Mont-Blanc", "Collonges-sous-Salève", "Saint-Julien-en-Genevois",
  "Paris",
  "Aigremont", "Bailly", "Bougival", "Buc", "Carrières-sur-Seine", "La Celle-Saint-Cloud", "Chambourcy", "Chatou", "Le Chesnay-Rocquencourt", "Croissy-sur-Seine", "L'Étang-la-Ville", "Houilles", "Jouy-en-Josas", "Louveciennes", "Maisons-Laffitte", "Mareil-Marly", "Marly-le-Roi", "Le Mesnil-le-Roi", "Noisy-le-Roi", "Le Pecq", "Rennemoulin", "Saint-Germain-en-Laye", "Vélizy-Villacoublay", "Versailles", "Le Vésinet", "Viroflay",
  "Gassin", "Ramatuelle",
  "Bièvres", "Vauhallan", "Verrières-le-Buisson",
  "Antony", "Asnières-sur-Seine", "Bagneux", "Bois-Colombes", "Boulogne-Billancourt", "Bourg-la-Reine", "Châtenay-Malabry", "Châtillon", "Chaville", "Clamart", "Clichy", "Colombes", "Courbevoie", "Fontenay-aux-Roses", "Garches", "La Garenne-Colombes", "Gennevilliers", "Issy-les-Moulineaux", "Levallois-Perret", "Malakoff", "Marnes-la-Coquette", "Meudon", "Montrouge", "Nanterre", "Neuilly-sur-Seine", "Le Plessis-Robinson", "Puteaux", "Rueil-Malmaison", "Saint-Cloud", "Sceaux", "Sèvres", "Suresnes", "Vanves", "Vaucresson", "Ville-d'Avray", "Villeneuve-la-Garenne",
  "Aubervilliers", "Bagnolet", "Les Lilas", "Montreuil", "Neuilly-Plaisance", "Pantin", "Le Pré-Saint-Gervais", "Le Raincy", "Romainville", "Saint-Denis", "Saint-Ouen-sur-Seine", "Villemomble",
  "Alfortville", "Arcueil", "Bry-sur-Marne", "Cachan", "Charenton-le-Pont", "Fontenay-sous-Bois", "Gentilly", "L'Haÿ-les-Roses", "Ivry-sur-Seine", "Joinville-le-Pont", "Le Kremlin-Bicêtre", "Maisons-Alfort", "Nogent-sur-Marne", "Le Perreux-sur-Marne", "Saint-Mandé", "Saint-Maur-des-Fossés", "Saint-Maurice", "Villejuif", "Vincennes",
  "Enghien-les-Bains"],
    "A": [ "Cessy", "Challex", "Chevry", "Collonges", "Échenevex", "Gex", "Grilly", "Péron", "Saint-Jean-de-Gonville", "Sergy", "Thoiry", "Vesancy",
  "Antibes", "Aspremont", "Auribeau-sur-Siagne", "Le Bar-sur-Loup", "Berre-les-Alpes", "Le Broc", "Cabris", "Cagnes-sur-Mer", "Cannes", "Le Cannet", "Cantaron", "Carros", "Castagniers", "Castellar", "Châteauneuf-Grasse", "Châteauneuf-Villevieille", "La Colle-sur-Loup", "Colomars", "Contes", "Drap", "Falicon", "Gattières", "La Gaude", "Gorbio", "Gourdon", "Grasse", "Levens", "Mandelieu-la-Napoule", "Menton", "Mouans-Sartoux", "Mougins", "Nice", "Opio", "Pégomas", "Peymeinade", "La Roquette-sur-Siagne", "La Roquette-sur-Var", "Le Rouret", "Sainte-Agnès", "Saint-André-de-la-Roche", "Saint-Blaise", "Saint-Jeannet", "Saint-Laurent-du-Var", "Saint-Martin-du-Var", "Saint-Paul-de-Vence", "Saint-Vallier-de-Thiey", "Sospel", "Spéracèdes", "Théoule-sur-Mer", "Le Tignet", "Tourrette-Levens", "Tourrettes-sur-Loup", "La Trinité", "Vallauris", "Vence", "Villeneuve-Loubet",
  "Aix-en-Provence", "Allauch", "Aubagne", "Auriol", "Beaurecueil", "Belcodène", "Berre-l'Étang", "Bouc-Bel-Air", "La Bouilladisse", "Cabriès", "Cadolive", "Carry-le-Rouet", "Ceyreste", "Châteauneuf-le-Rouge", "Châteauneuf-les-Martigues", "La Ciotat", "La Destrousse", "Éguilles", "Ensuès-la-Redonne", "La Fare-les-Oliviers", "Fos-sur-Mer", "Fuveau", "Gardanne", "Gémenos", "Gignac-la-Nerthe", "Gréasque", "Istres", "Lambesc", "Lançon-Provence", "Marignane", "Marseille", "Martigues", "Meyreuil", "Mimet", "Miramas", "Pélissanne", "La Penne-sur-Huveaune", "Les Pennes-Mirabeau", "Peynier", "Peypin", "Plan-de-Cuques", "Port-de-Bouc", "Le Puy-Sainte-Réparade", "Rognac", "Rognes", "Roquefort-la-Bédoule", "Roquevaire", "Rousset", "Le Rove", "Saint-Antonin-sur-Bayon", "Saint-Cannat", "Saint-Chamas", "Saint-Marc-Jaumegarde", "Saintes-Maries-de-la-Mer", "Saint-Mitre-les-Remparts", "Saint-Savournin", "Saint-Victoret", "Sausset-les-Pins", "Septèmes-les-Vallons", "Simiane-Collongue", "Le Tholonet", "Trets", "Velaux", "Venelles", "Ventabren", "Vitrolles", "Carnoux-en-Provence",
  "Blonville-sur-Mer", "Deauville", "Tourgéville", "Trouville-sur-Mer", "Villers-sur-Mer",
  "Aytré", "Châtelaillon-Plage", "Lagord", "La Rochelle", "Saint-Martin-de-Ré",
  "Le Grau-du-Roi",
  "Blagnac", "Colomiers", "Labège", "Toulouse", "L'Union",
  "Andernos-les-Bains", "Arcachon", "Arès", "Bordeaux", "Le Bouscat", "Cestas", "Gradignan", "Gujan-Mestras", "Lège-Cap-Ferret", "Léognan", "Mérignac", "Pessac", "Le Porge", "Talence", "La Teste-de-Buch",
  "Ajaccio", "Bonifacio", "Grosseto-Prugna", "Pietrosella", "Porto-Vecchio", "Propriano", "Sarrola-Carcopino",
  "Calvi", "L'Île-Rousse",
  "Assas", "Baillargues", "Castelnau-le-Lez", "Clapiers", "Le Crès", "Fabrègues", "Grabels", "Jacou", "Juvignac", "Lattes", "Lavérune", "Mauguio", "Montferrier-sur-Lez", "Montpellier", "Palavas-les-Flots", "Pérols", "Prades-le-Lez", "Saint-Clément-de-Rivière", "Saint-Gély-du-Fesc", "Saint-Jean-de-Védas", "Saint-Vincent-de-Barbeyrargues", "Saussan", "Teyran", "Vendargues", "Villeneuve-lès-Maguelone", "La Grande-Motte",
  "Rennes",
  "Claix", "Crolles", "Gières", "Meylan", "Montbonnot-Saint-Martin", "Les Deux Alpes", "Saint-Ismier", "Saint-Martin-d'Uriage", "Seyssins", "La Tronche", "Villard-de-Lans",
  "Seignosse", "Soorts-Hossegor",
  "La Baule-Escoublac", "Nantes", "Pornichet", "Le Pouliguen",
  "Bondues", "Lambersart", "Lille", "Loos", "La Madeleine", "Marcq-en-Barœul", "Mouvaux", "Saint-André-lez-Lille", "Wambrechies", "Wasquehal",
  "Aumont-en-Halatte", "Avilly-Saint-Léonard", "Belle-Église", "Boran-sur-Oise", "Bornel", "Chambly", "La Chapelle-en-Serval", "Courteuil", "Coye-la-Forêt", "Gouvieux", "Lamorlaye", "Méru", "Le Mesnil-en-Thelle", "Orry-la-Ville", "Senlis", "Vineuil-Saint-Firmin",
  "Le Touquet-Paris-Plage",
  "Anglet", "Biarritz", "Bidart", "Ciboure", "Guéthary", "Saint-Jean-de-Luz",
  "Illkirch-Graffenstaden", "Oberhausbergen", "Strasbourg",
  "Caluire-et-Cuire", "Champagne-au-Mont-d'Or", "Chaponost", "Charbonnières-les-Bains", "Craponne", "Dardilly", "Écully", "Francheville", "Lyon", "Neuville-sur-Saône", "Saint-Cyr-au-Mont-d'Or", "Saint-Didier-au-Mont-d'Or", "Sainte-Foy-lès-Lyon", "Tassin-la-Demi-Lune", "La Tour-de-Salvagny", "Villeurbanne", "Chassieu", "Jonage", "Meyzieu", "Saint-Laurent-de-Mure", "Sathonay-Camp",
  "Aix-les-Bains", "Bassens", "Le Bourget-du-Lac", "Brides-les-Bains", "Challes-les-Eaux", "Grésy-sur-Aix", "Jacob-Bellecombette", "La Motte-Servolex", "La Ravoire", "Saint-Alban-Leysse",
  "Allinges", "Allonzier-la-Caille", "Ambilly", "Andilly", "Annecy", "Annemasse", "Archamps", "Argonay", "Arthaz-Pont-Notre-Dame", "La Balme-de-Sillingy", "Beaumont", "Bluffy", "Bonne", "Bons-en-Chablais", "Bossey", "Châtel", "Chênex", "Chens-sur-Léman", "Chevrier", "La Clusaz", "Combloux", "Contamine-sur-Arve", "Cranves-Sales", "Cruseilles", "Dingy-en-Vuache", "Doussard", "Douvaine", "Duingt", "Entrevernes", "Epagny Metz-Tessy", "Étrembières", "Évian-les-Bains", "Excenevex", "Faucigny", "Feigères", "Fillinges", "Gaillard", "Les Gets", "Le Grand-Bornand", "Groisy", "Les Houches", "Juvigny", "Lucinges", "Machilly", "Marcellaz", "Massongy", "Megève", "Menthon-Saint-Bernard", "Menthonnex-en-Bornes", "Messery", "Monnetier-Mornex", "Morillon", "Morzine", "Nangy", "Nernier", "Neuvecelle", "Neydens", "Pers-Jussy", "Poisy", "Praz-sur-Arly", "Présilly", "Publier", "Reignier-Ésery", "La Roche-sur-Foron", "Rumilly", "Saint-Blaise", "Saint-Cergues", "Saint-Gervais-les-Bains", "Saint-Jorioz", "Saint-Pierre-en-Faucigny", "Sallanches", "Samoëns", "Le Sappey", "Sciez", "Sevrier", "Sillingy", "Talloires-Montmin", "Taninges", "Thônes", "Thonon-les-Bains", "Fillière", "Valleiry", "Veigy-Foncenex", "Vétraz-Monthoux", "Ville-la-Grand", "Villy-le-Bouveret", "Viry", "Viuz-en-Sallaz", "Vovray-en-Bornes", "Vulbens", "Yvoire",
  "Avon", "Bailly-Romainvilliers", "Bois-le-Roi", "Boissettes", "Boissise-la-Bertrand", "Boissise-le-Roi", "Brie-Comte-Robert", "Brou-sur-Chantereine", "Bussy-Saint-Georges", "Bussy-Saint-Martin", "Carnetin", "Cesson", "Chalifert", "Champs-sur-Marne", "Chanteloup-en-Brie", "Chelles", "Chessy", "Claye-Souilly", "Collégien", "Combs-la-Ville", "Conches-sur-Gondoire", "Condé-Sainte-Libiaire", "Couilly-Pont-aux-Dames", "Coupvray", "Courtry", "Coutevroult", "Crécy-la-Chapelle", "Crégy-lès-Meaux", "Croissy-Beaubourg", "Dammarie-les-Lys", "Dammartin-en-Goële", "Dampmart", "Émerainville", "Esbly", "Ferrières-en-Brie", "Fontainebleau", "Gouvernes", "Gretz-Armainvilliers", "Guermantes", "Héricy", "Isles-lès-Villenoy", "Jossigny", "Lagny-sur-Marne", "Lésigny", "Lieusaint", "Livry-sur-Seine", "Lognes", "Longperrier", "Magny-le-Hongre", "Meaux", "Le Mée-sur-Seine", "Melun", "Mitry-Mory", "Moissy-Cramayel", "Montévrain", "Montry", "Nandy", "Nanteuil-lès-Meaux", "Noisiel", "Ozoir-la-Ferrière", "Poincy", "Pomponne", "Pontault-Combault", "Pontcarré", "Pringy", "Quincy-Voisins", "La Rochette", "Roissy-en-Brie", "Rubelles", "Saint-Fargeau-Ponthierry", "Saint-Germain-sur-Morin", "Saint-Thibault-des-Vignes", "Samoreau", "Savigny-le-Temple", "Seine-Port", "Serris", "Servon", "Thorigny-sur-Marne", "Torcy", "Tournan-en-Brie", "Trilport", "Vaires-sur-Marne", "Vaux-le-Pénil", "Vert-Saint-Denis", "Villenoy", "Villeparisis", "Villiers-sur-Morin", "Voulangis", "Vulaines-sur-Seine",
  "Achères", "Andrésy", "Aubergenville", "Auffreville-Brasseuil", "Aulnay-sur-Mauldre", "Bazoches-sur-Guyonne", "Beynes", "Bois-d'Arcy", "Buchelay", "Carrières-sous-Poissy", "Chanteloup-les-Vignes", "Chapet", "Châteaufort", "Chavenay", "Chevreuse", "Les Clayes-sous-Bois", "Coignières", "Conflans-Sainte-Honorine", "Élancourt", "Épône", "Les Essarts-le-Roi", "Évecquemont", "La Falaise", "Feucherolles", "Flins-sur-Seine", "Follainville-Dennemont", "Fontenay-le-Fleury", "Gaillon-sur-Montcient", "Gargenville", "Guyancourt", "Hardricourt", "Houdan", "Issou", "Jouars-Pontchartrain", "Juziers", "Limay", "Les Loges-en-Josas", "Magnanville", "Magny-les-Hameaux", "Mantes-la-Jolie", "Mantes-la-Ville", "Maule", "Maurecourt", "Maurepas", "Médan", "Le Mesnil-Saint-Denis", "Les Mesnuls", "Meulan-en-Yvelines", "Mézières-sur-Seine", "Mézy-sur-Seine", "Milon-la-Chapelle", "Montesson", "Montfort-l'Amaury", "Montigny-le-Bretonneux", "Les Mureaux", "Neauphle-le-Château", "Neauphle-le-Vieux", "Nézel", "Orgeval", "Le Perray-en-Yvelines", "Plaisir", "Poissy", "Porcheville", "Le Port-Marly", "Rambouillet", "Saint-Cyr-l'École", "Saint-Lambert", "Saint-Nom-la-Bretèche", "Saint-Rémy-lès-Chevreuse", "Saint-Rémy-l'Honoré", "Sartrouville", "Tessancourt-sur-Aubette", "Toussus-le-Noble", "Trappes", "Le Tremblay-sur-Mauldre", "Triel-sur-Seine", "Vaux-sur-Seine", "Verneuil-sur-Seine", "Vernouillet", "La Verrière", "Vert", "Vieille-Église-en-Yvelines", "Villennes-sur-Seine", "Villepreux", "Villiers-Saint-Frédéric", "Voisins-le-Bretonneux",
  "Les Adrets-de-l'Estérel", "Bandol", "Le Beausset", "Belgentier", "Bormes-les-Mimosas", "La Cadière-d'Azur", "Carqueiranne", "Le Castellet", "Cavalaire-sur-Mer", "Cogolin", "La Crau", "La Croix-Valmer", "Cuers", "Évenos", "La Farlède", "Fayence", "Fréjus", "La Garde", "Grimaud", "Hyères", "Le Lavandou", "La Londe-les-Maures", "Montauroux", "Ollioules", "Le Plan-de-la-Tour", "Le Pradet", "Puget-sur-Argens", "Le Revest-les-Eaux", "Roquebrune-sur-Argens", "Saint-Cyr-sur-Mer", "Sainte-Maxime", "Saint-Raphaël", "Saint-Tropez", "Saint-Zacharie", "Sanary-sur-Mer", "La Seyne-sur-Mer", "Six-Fours-les-Plages", "Solliès-Pont", "Solliès-Toucas", "Solliès-Ville", "Toulon", "La Valette-du-Var", "Rayol-Canadel-sur-Mer", "Saint-Mandrier-sur-Mer",
  "Arpajon", "Athis-Mons", "Ballainvilliers", "Bondoufle", "Boussy-Saint-Antoine", "Brétigny-sur-Orge", "Breuillet", "Breux-Jouy", "Brunoy", "Bruyères-le-Châtel", "Bures-sur-Yvette", "Champlan", "Chilly-Mazarin", "Corbeil-Essonnes", "Le Coudray-Montceaux", "Crosne", "Dourdan", "Draveil", "Écharcon", "Égly", "Épinay-sous-Sénart", "Épinay-sur-Orge", "Étiolles", "Évry-Courcouronnes", "Fleury-Mérogis", "Fontenay-le-Vicomte", "Forges-les-Bains", "Gif-sur-Yvette", "Gometz-le-Châtel", "Grigny", "Igny", "Juvisy-sur-Orge", "Leuville-sur-Orge", "Limours", "Linas", "Lisses", "Longjumeau", "Longpont-sur-Orge", "Marcoussis", "Marolles-en-Hurepoix", "Massy", "Mennecy", "Montgeron", "Montlhéry", "Morangis", "Morsang-sur-Orge", "Morsang-sur-Seine", "La Norville", "Nozay", "Ollainville", "Ormoy", "Orsay", "Palaiseau", "Paray-Vieille-Poste", "Le Plessis-Pâté", "Quincy-sous-Sénart", "Ris-Orangis", "Saclay", "Saint-Aubin", "Sainte-Geneviève-des-Bois", "Saint-Germain-lès-Arpajon", "Saint-Germain-lès-Corbeil", "Saint-Michel-sur-Orge", "Saint-Pierre-du-Perray", "Saintry-sur-Seine", "Saint-Yon", "Saulx-les-Chartreux", "Savigny-sur-Orge", "Soisy-sur-Seine", "Tigery", "Varennes-Jarcy", "Vigneux-sur-Seine", "Villabé", "Villebon-sur-Yvette", "La Ville-du-Bois", "Villejust", "Villemoisson-sur-Orge", "Villiers-le-Bâcle", "Villiers-sur-Orge", "Viry-Châtillon", "Wissous", "Yerres", "Les Ulis",
  "Aulnay-sous-Bois", "Le Blanc-Mesnil", "Bobigny", "Bondy", "Le Bourget", "Clichy-sous-Bois", "Coubron", "La Courneuve", "Drancy", "Dugny", "Épinay-sur-Seine", "Gagny", "Gournay-sur-Marne", "L'Île-Saint-Denis", "Livry-Gargan", "Montfermeil", "Neuilly-sur-Marne", "Noisy-le-Grand", "Noisy-le-Sec", "Les Pavillons-sous-Bois", "Pierrefitte-sur-Seine", "Rosny-sous-Bois", "Sevran", "Stains", "Tremblay-en-France", "Vaujours", "Villepinte", "Villetaneuse",
  "Ablon-sur-Seine", "Boissy-Saint-Léger", "Bonneuil-sur-Marne", "Champigny-sur-Marne", "Chennevières-sur-Marne", "Chevilly-Larue", "Choisy-le-Roi", "Créteil", "Fresnes", "Limeil-Brévannes", "Mandres-les-Roses", "Marolles-en-Brie", "Noiseau", "Orly", "Ormesson-sur-Marne", "Périgny", "Le Plessis-Trévise", "La Queue-en-Brie", "Rungis", "Santeny", "Sucy-en-Brie", "Thiais", "Valenton", "Villecresnes", "Villeneuve-le-Roi", "Villeneuve-Saint-Georges", "Villiers-sur-Marne", "Vitry-sur-Seine",
  "Andilly", "Argenteuil", "Arnouville", "Auvers-sur-Oise", "Beauchamp", "Beaumont-sur-Oise", "Bernes-sur-Oise", "Bessancourt", "Bezons", "Boisemont", "Bonneuil-en-France", "Bouffémont", "Butry-sur-Oise", "Cergy", "Champagne-sur-Oise", "Cormeilles-en-Parisis", "Courdimanche", "Deuil-la-Barre", "Domont", "Eaubonne", "Écouen", "Épiais-lès-Louvres", "Éragny", "Ermont", "Ézanville", "Franconville", "Frépillon", "La Frette-sur-Seine", "Garges-lès-Gonesse", "Gonesse", "Goussainville", "Groslay", "Herblay-sur-Seine", "L'Isle-Adam", "Jouy-le-Moutier", "Margency", "Menucourt", "Mériel", "Méry-sur-Oise", "Montigny-lès-Cormeilles", "Montlignon", "Montmagny", "Montmorency", "Mours", "Nesles-la-Vallée", "Neuville-sur-Oise", "Osny", "Parmain", "Persan", "Pierrelaye", "Piscop", "Le Plessis-Bouchard", "Pontoise", "Puiseux-Pontoise", "Roissy-en-France", "Ronquerolles", "Saint-Brice-sous-Forêt", "Saint-Gratien", "Saint-Leu-la-Forêt", "Saint-Ouen-l'Aumône", "Saint-Prix", "Sannois", "Soisy-sous-Montmorency", "Taverny", "Le Thillay", "Valmondois", "Vauréal", "Villiers-Adam", "Villiers-le-Bel",
  "Le Gosier", "Saint-François",
  "Les Anses-d'Arlet", "Le Diamant", "Le Marin", "Les Trois-Îlets",
  "Les Avirons", "L'Étang-Salé", "Saint-Leu", "Saint-Paul"],
    "B1": [ "Ambérieu-en-Bugey", "Valserhône", "Beynost", "La Boisse", "Bourg-en-Bresse", "Civrieux", "Crozet", "Dagneux", "Farges", "Jassans-Riottier", "Léaz", "Massieux", "Meximieux", "Mionnay", "Miribel", "Misérieux", "Montluel", "Neyron", "Pougny", "Reyrieux", "Saint-André-de-Corcy", "Saint-Maurice-de-Beynost", "Tramoyes", "Trévoux", "Villars-les-Dombes",
  "Château-Thierry", "Villers-Cotterêts",
  "Enchastrayes", "Forcalquier", "Gréoux-les-Bains", "Manosque", "Pierrevert",
  "Briançon", "Chorges", "Embrun", "Gap", "Le Monêtier-les-Bains", "Les Orres", "Vallouise-Pelvoux", "Saint-Chaffrey", "La Salle-les-Alpes", "Vars",
  "Bendejun", "Blausasc", "Bonson", "Castillon", "Gilette", "Isola", "Peillon", "Péone", "Revest-les-Roches", "Saint-Cézaire-sur-Siagne", "Saint-Étienne-de-Tinée", "Saint-Martin-Vésubie",
  "Guilherand-Granges", "Saint-Péray",
  "Sainte-Savine", "Troyes",
  "Gruissan", "Leucate", "Port-la-Nouvelle",
  "Arles", "Aurons", "La Barben", "Barbentane", "Les Baux-de-Provence", "Cabannes", "Châteaurenard", "Cornillon-Confoux", "Cuges-les-Pins", "Eyguières", "Eyragues", "Fontvieille", "Grans", "Graveson", "Jouques", "Lamanon", "Mallemort", "Mas-Blanc-des-Alpilles", "Maussane-les-Alpilles", "Meyrargues", "Mouriès", "Noves", "Paradou", "Peyrolles-en-Provence", "Port-Saint-Louis-du-Rhône", "Puyloubier", "Rognonas", "La Roque-d'Anthéron", "Saint-Estève-Janson", "Saint-Étienne-du-Grès", "Saint-Martin-de-Crau", "Saint-Rémy-de-Provence", "Salon-de-Provence", "Sénas", "Tarascon", "Vernègues", "Coudoux",
  "Bayeux", "Blainville-sur-Orne", "Bonneville-sur-Touques", "Bretteville-sur-Odon", "Cabourg", "Caen", "Carpiquet", "Colombelles", "Cormelles-le-Royal", "Courseulles-sur-Mer", "Dives-sur-Mer", "Douvres-la-Délivrande", "Englesqueville-en-Auge", "Épron", "Fleury-sur-Orne", "Giberville", "Hermanville-sur-Mer", "Hérouville-Saint-Clair", "Honfleur", "Houlgate", "Ifs", "Louvigny", "Luc-sur-Mer", "Merville-Franceville-Plage", "Mondeville", "Ouistreham", "Pont-l'Évêque", "Saint-Arnoult", "Saint-Aubin-sur-Mer", "Saint-Germain-la-Blanche-Herbe", "Touques", "Verson",
  "Angoulême",
  "Aigrefeuille-d'Aunis", "Angoulins", "Ars-en-Ré", "Le Bois-Plage-en-Ré", "La Couarde-sur-Mer", "Dolus-d'Oléron", "Dompierre-sur-Mer", "La Flotte", "Fouras", "L'Houmeau", "Loix", "Les Mathes", "Nieul-sur-Mer", "Périgny", "Les Portes-en-Ré", "Puilboreau", "Rivedoux-Plage", "Rochefort", "Royan", "Saint-Clément-des-Baleines", "Saint-Georges-de-Didonne", "Saint-Georges-d'Oléron", "Sainte-Marie-de-Ré", "Saint-Palais-sur-Mer", "Saint-Pierre-d'Oléron", "Sainte-Soulle", "Saint-Xandre", "Salles-sur-Mer", "La Tremblade", "Vaux-sur-Mer",
  "Brive-la-Gaillarde", "Malemort", "Saint-Pantaléon-de-Larche", "Ussac",
  "Afa", "Alata", "Albitreccia", "Appietto", "Bastelicaccia", "Calcatoggio", "Cannelle", "Carbuccia", "Coti-Chiavari", "Cuttoli-Corticchiato", "Eccica-Suarella", "Giuncheto", "Lecci", "Lopigna", "Peri", "Sartène", "Serra-di-Ferro", "Sant'Andréa-d'Orcino", "Tavaco", "Valle-di-Mezzana", "Vero", "Villanova", "Zonza",
  "Algajola", "Aregno", "Bastia", "Biguglia", "Borgo", "Brando", "Calenzana", "Castellare-di-Casinca", "Corbara", "Corte", "Farinole", "Furiani", "Ghisonaccia", "Lama", "Lucciana", "Lumio", "Moncale", "Monticello", "Olcani", "Oletta", "Penta-di-Casinca", "Pietracorbara", "Pigna", "Poggio-Mezzana", "Prunelli-di-Fiumorbo", "Sorbo-Ocagnano", "Saint-Florent", "San-Martino-di-Lota", "Santa-Lucia-di-Moriani", "Santa-Maria-di-Lota", "San-Nicolao", "Santa-Reparata-di-Balagna", "Taglio-Isolaccio", "Talasani", "Venzolasca", "Vescovato", "Ville-di-Pietrabugno",
  "Ahuy", "Chenôve", "Chevigny-Saint-Sauveur", "Daix", "Dijon", "Fontaine-lès-Dijon", "Longvic", "Marsannay-la-Côte", "Neuilly-Crimolois", "Ouges", "Perrigny-lès-Dijon", "Plombières-lès-Dijon", "Quetigny", "Saint-Apollinaire", "Sennecey-lès-Dijon", "Talant",
  "Dinan", "Lamballe-Armor", "Lancieux", "Paimpol", "Perros-Guirec", "Pléneuf-Val-André", "Plérin", "Saint-Brieuc", "Saint-Quay-Portrieux",
  "Besançon", "La Cluse-et-Mijoux", "Les Fourgs", "Les Hôpitaux-Neufs", "Les Hôpitaux-Vieux", "Jougne", "Labergement-Sainte-Marie", "Villers-le-Lac", "Malbuisson", "Métabief", "Montperreux", "Morteau", "Pontarlier", "Saint-Antoine", "Touillon-et-Loutelet", "Valdahon",
  "Bourg-lès-Valence", "Chatuzange-le-Goubet", "Portes-lès-Valence", "Saint-Marcel-lès-Valence", "Valence",
  "Alizay", "Bosroumois", "Grand Bourgtheroulde", "Évreux", "Gaillon", "Gisors", "Igoville", "Louviers", "Martot", "La Chapelle-Longueville", "Saint-Marcel", "Saint-Ouen-du-Tilleul", "Vernon", "Val-de-Reuil",
  "Anet", "Barjouville", "Champhol", "Chartres", "Le Coudray", "Dreux", "Épernon", "Goussainville", "Hanches", "Lèves", "Lucé", "Luisant", "Maintenon", "Mainvilliers", "Morancez", "Vernouillet",
  "Bénodet", "Brest", "Clohars-Carnoët", "Concarneau", "Crozon", "La Forêt-Fouesnant", "Fouesnant", "Gouesnou", "Guipavas", "Landerneau", "Plougastel-Daoulas", "Plougonvelin", "Plouzané", "Pont-l'Abbé", "Quimper", "Le Relecq-Kerhuon", "Trégunc",
  "Aigues-Mortes", "Aigues-Vives", "Aimargues", "Les Angles", "Aubais", "Aubord", "Beauvoisin", "Bellegarde", "Bernis", "Bezouce", "Boissières", "Bouillargues", "Cabrières", "Caissargues", "Calvisson", "Caveirac", "Codognan", "Fourques", "Gallargues-le-Montueux", "Garons", "Générac", "Langlade", "Laudun-l'Ardoise", "Manduel", "Marguerittes", "Milhaud", "Mus", "Nages-et-Solorgues", "Nîmes", "Poulx", "Pujaut", "Redessan", "Rochefort-du-Gard", "Saint-Dionisy", "Saint-Gervasy", "Saint-Laurent-d'Aigouze", "Sommières", "Uchaud", "Uzès", "Vauvert", "Vergèze", "Vestric-et-Candiac", "Villeneuve-lès-Avignon", "Rodilhan",
  "Aucamville", "Aussonne", "Auzeville-Tolosane", "Auzielle", "Balma", "Beaupuy", "Beauzelle", "Belberaud", "Brax", "Bruguières", "Castanet-Tolosan", "Castelginest", "Castelmaurou", "Cépet", "Cornebarrieu", "Cugnaux", "Daux", "Deyme", "Eaunes", "Escalquens", "Fenouillet", "Fonbeauzard", "Fonsorbes", "Fontenilles", "Frouzins", "Gagnac-sur-Garonne", "Gratentour", "Labarthe-sur-Lèze", "Labastide-Saint-Sernin", "Lacroix-Falgarde", "Lapeyrouse-Fossat", "Launaguet", "Lauzerville", "Léguevin", "Lespinasse", "Mervilla", "Mondonville", "Montberon", "Montrabé", "Muret", "Péchabou", "Pechbonnieu", "Pechbusque", "Pibrac", "Pin-Balma", "Pinsaguel", "Pins-Justaret", "Plaisance-du-Touch", "Pompertuzat", "Portet-sur-Garonne", "Quint-Fonsegrives", "Ramonville-Saint-Agne", "Roques", "Roquettes", "Rouffiac-Tolosan", "Saint-Alban", "Saint-Geniès-Bellevue", "Saint-Jean", "Saint-Jory", "Saint-Loup-Cammas", "Saint-Orens-de-Gameville", "Saint-Sauveur", "La Salvetat-Saint-Gilles", "Saubens", "Seilh", "Seysses", "Tournefeuille", "Vieille-Toulouse", "Vigoulet-Auzil", "Villate", "Villeneuve-Tolosane",
  "L'Isle-Jourdain",
  "Ambarès-et-Lagrave", "Artigues-près-Bordeaux", "Arveyres", "Audenge", "Ayguemorte-les-Graves", "Le Barp", "Bassens", "Baurech", "Bègles", "Belin-Béliet", "Biganos", "Blanquefort", "Bonnetan", "Bouliac", "Bruges", "Cadarsac", "Cadaujac", "Cambes", "Camblanes-et-Meynac", "Canéjan", "Carbon-Blanc", "Carcans", "Carignan-de-Bordeaux", "Cénac", "Cenon", "Créon", "Eysines", "Fargues-Saint-Hilaire", "Floirac", "Le Haillan", "Hourtin", "Isle-Saint-Georges", "Izon", "La Brède", "Lacanau", "Langoiran", "Lanton", "Latresne", "Lestiac-sur-Garonne", "Libourne", "Lignan-de-Bordeaux", "Lormont", "Ludon-Médoc", "Martignas-sur-Jalle", "Martillac", "Mios", "Montussan", "Nérigean", "Paillet", "Parempuyre", "Le Pian-Médoc", "Pompignac", "Quinsac", "Saint-André-de-Cubzac", "Saint-Aubin-de-Médoc", "Saint-Caprais-de-Bordeaux", "Sainte-Eulalie", "Saint-Jean-d'Illac", "Saint-Loubès", "Saint-Médard-d'Eyrans", "Saint-Médard-en-Jalles", "Saint-Morillon", "Saint-Quentin-de-Baron", "Saint-Sulpice-et-Cameyrac", "Saint-Vincent-de-Paul", "Sallebœuf", "Salles", "Saucats", "Soulac-sur-Mer", "Tabanac", "Le Taillan-Médoc", "Le Teich", "Le Tourne", "Tresses", "Vayres", "Vendays-Montalivet", "Villenave-d'Ornon", "Yvrac", "Marcheprime",
  "Agde", "Balaruc-les-Bains", "Balaruc-le-Vieux", "Béziers", "Bouzigues", "Candillargues", "Castries", "Clermont-l'Hérault", "Combaillaux", "Cournonsec", "Cournonterral", "Frontignan", "Gigean", "Guzargues", "Lunel", "Lunel-Viel", "Marseillan", "Marsillargues", "Les Matelles", "Mèze", "Mireval", "Montbazin", "Mudaison", "Murviel-lès-Montpellier", "Pézenas", "Pignan", "Portiragnes", "Poussan", "Saint-Aunès", "Saint-Brès", "Saint-Geniès-des-Mourgues", "Saint-Georges-d'Orques", "Saint-Just", "Saint-Mathieu-de-Tréviers", "Saint-Nazaire-de-Pézan", "Sauvian", "Sérignan", "Sète", "Sussargues", "Le Triadou", "Vailhauquès", "Valras-Plage", "Vendres", "Vias", "Vic-la-Gardiole", "Villetelle",
  "Acigné", "Betton", "Bruz", "Cancale", "Cesson-Sévigné", "Chantepie", "La Chapelle-des-Fougeretz", "Chartres-de-Bretagne", "Châteaugiron", "Chavagne", "Chevaigné", "Dinard", "Gévezé", "L'Hermitage", "Melesse", "La Mézière", "Montgermont", "Mordelles", "Noyal-Châtillon-sur-Seiche", "Noyal-sur-Vilaine", "Orgères", "Pacé", "Pleurtuit", "Le Rheu", "Saint-Briac-sur-Mer", "Saint-Erblon", "Saint-Gilles", "Saint-Grégoire", "Saint-Jacques-de-la-Lande", "Saint-Lunaire", "Saint-Malo", "Saint-Méloir-des-Ondes", "Thorigné-Fouillard", "Vern-sur-Seiche", "Vezin-le-Coquet", "Vitré", "Pont-Péan",
  "Amboise", "Ballan-Miré", "Bléré", "Chambray-lès-Tours", "Chanceaux-sur-Choisille", "Fondettes", "Joué-lès-Tours", "Larçay", "Luynes", "La Membrolle-sur-Choisille", "Mettray", "Montbazon", "Montlouis-sur-Loire", "Monts", "Nazelles-Négron", "Notre-Dame-d'Oé", "Parçay-Meslay", "Pocé-sur-Cisse", "La Riche", "Rochecorbon", "Saint-Avertin", "Saint-Cyr-sur-Loire", "Saint-Genouph", "Saint-Pierre-des-Corps", "Savonnières", "Tours", "Veigné", "Vernou-sur-Brenne", "La Ville-aux-Dames", "Vouvray",
  "Les Adrets", "Anthon", "Bernin", "Biviers", "Bourgoin-Jallieu", "Bresson", "Brié-et-Angonnes", "La Buisse", "Chamagnieu", "Champagnier", "Le Champ-près-Froges", "Champ-sur-Drac", "Charvieu-Chavagneux", "Chasse-sur-Rhône", "Chavanoz", "Chirens", "Chozeau", "Chuzelles", "Corenc", "Coublevie", "Diémoz", "Domarin", "Domène", "Échirolles", "Eybens", "Fontaine", "Fontanil-Cornillon", "Froges", "Frontonas", "Goncelin", "Grenay", "Grenoble", "Herbeys", "Heyrieux", "Huez", "L'Isle-d'Abeau", "Janneyrias", "Jarrie", "Lans-en-Vercors", "Lumbin", "Luzinay", "Maubec", "Moirans", "Montchaboud", "Murianette", "Nivolas-Vermelle", "Noyarey", "La Pierre", "Poisat", "Pontcharra", "Pont-de-Chéruy", "Le Pont-de-Claix", "Renage", "Rives", "Ruy-Montceau", "Saint-Alban-de-Roche", "Saint-Égrève", "Saint-Jean-de-Moirans", "Saint-Just-Chaleyssin", "Saint-Martin-d'Hères", "Saint-Martin-le-Vinoux", "Saint-Nazaire-les-Eymes", "Saint-Nizier-du-Moucherotte", "Saint-Quentin-Fallavier", "Le Sappey-en-Chartreuse", "Sassenage", "Satolas-et-Bonce", "Seyssinet-Pariset", "Seyssuel", "Tencin", "La Terrasse", "Tignieu-Jameyzieu", "Valencin", "Varces-Allières-et-Risset", "Vaulnaveys-le-Bas", "Vaulnaveys-le-Haut", "Vaulx-Milieu", "Venon", "La Verpillière", "Le Versoud", "Veurey-Voroize", "Vienne", "Vif", "Villard-Bonnot", "Villefontaine", "Villette-d'Anthon",
    "Villette-de-Vienne", "Vizille", "Voiron", "Voreppe",
  "Les Rousses",
  "Angresse", "Azur", "Bénesse-Maremne", "Biscarrosse", "Capbreton", "Dax", "Gastes", "Labenne", "Léon", "Lit-et-Mixe", "Messanges", "Mimizan", "Moliets-et-Maa", "Ondres", "Parentis-en-Born", "Saint-André-de-Seignanx", "Saint-Geours-de-Maremne", "Saint-Julien-en-Born", "Saint-Martin-de-Seignanx", "Saint-Paul-lès-Dax", "Saint-Vincent-de-Tyrosse", "Sanguinet", "Saubion", "Soustons", "Tarnos", "Tosse", "Vielle-Saint-Girons", "Vieux-Boucau-les-Bains",
  "Saint-Priest-en-Jarez", "La Talaudière",
  "Ancenis-Saint-Géréon", "Basse-Goulaine", "Batz-sur-Mer", "La Bernerie-en-Retz", "Bouaye", "Bouguenais", "Brains", "Carquefou", "Divatte-sur-Loire", "La Chapelle-sur-Erdre", "La Chevrolière", "Clisson", "Couëron", "Le Croisic", "Donges", "Gorges", "Grandchamp-des-Fontaines", "Guérande", "La Haie-Fouassière", "Haute-Goulaine", "Indre", "Le Loroux-Bottereau", "Mauves-sur-Loire", "Mesquer", "La Montagne", "Montoir-de-Bretagne", "Les Moutiers-en-Retz", "Orvault", "Le Pellerin", "Piriac-sur-Mer", "La Plaine-sur-Mer", "Pont-Saint-Martin", "Pornic", "Port-Saint-Père", "Préfailles", "Rezé", "Saint-Aignan-Grandlieu", "Saint-André-des-Eaux", "Saint-Brevin-les-Pins", "Saint-Étienne-de-Montluc", "Saint-Herblain", "Saint-Jean-de-Boiseau", "Saint-Julien-de-Concelles", "Saint-Léger-les-Vignes", "Sainte-Luce-sur-Loire", "Saint-Mars-du-Désert", "Saint-Michel-Chef-Chef", "Saint-Nazaire", "Sainte-Pazanne", "Saint-Père-en-Retz", "Saint-Philbert-de-Grand-Lieu", "Saint-Sébastien-sur-Loire", "Sautron", "Savenay", "Les Sorinières", "Sucé-sur-Erdre", "Thouaré-sur-Loire", "Treillières", "Trignac", "La Turballe", "Vallet", "Vertou", "Vigneux-de-Bretagne",
  "Boigny-sur-Bionne", "La Chapelle-Saint-Mesmin", "Chécy", "Combleux", "Fleury-les-Aubrais", "Ingré", "Mardié", "Olivet", "Orléans", "Ormes", "Saint-Cyr-en-Val", "Saint-Denis-en-Val", "Saint-Hilaire-Saint-Mesmin", "Saint-Jean-de-Braye", "Saint-Jean-de-la-Ruelle", "Saint-Jean-le-Blanc", "Saint-Pryvé-Saint-Mesmin", "Saran", "Semoy",
  "Angers", "Avrillé", "Beaucouzé", "Bouchemaine", "Cholet", "Écouflant", "Montreuil-Juigné", "Mûrs-Erigné", "Les Ponts-de-Cé", "Saint-Barthélemy-d'Anjou", "Sainte-Gemmes-sur-Loire", "Verrières-en-Anjou", "Trélazé",
  "Cherbourg-en-Cotentin", "Donville-les-Bains", "Granville", "Saint-Pair-sur-Mer",
  "Bétheny", "Bezannes", "Cormontreuil", "Reims", "Saint-Brice-Courcelles", "Saint-Léonard", "Taissy", "Tinqueux", "Witry-lès-Reims",
  "Bonchamp-lès-Laval", "Changé", "L'Huisserie", "Laval", "Louverné", "Saint-Berthevin",
  "Jarville-la-Malgrange", "Laxou", "Longwy", "Maxéville", "Nancy", "Saint-Max", "Vandœuvre-lès-Nancy", "Villers-lès-Nancy", "Villerupt",
  "Arradon", "Arzon", "Auray", "Baden", "Bangor", "Belz", "Brech", "Carnac", "Crach", "Damgan", "Erdeven", "Étel", "Groix", "Guidel", "Hennebont", "Hœdic", "Île-d'Houat", "Kervignac", "Lanester", "Larmor-Plage", "Locmaria", "Locmariaquer", "Locmiquélic", "Lorient", "Le Palais", "Pénestin", "Plescop", "Ploemeur", "Ploeren", "Plouharnel", "Plouhinec", "Pluneret", "Port-Louis", "Quiberon", "Riantec", "Saint-Avé", "Saint-Gildas-de-Rhuys", "Saint-Philibert", "Saint-Pierre-Quiberon", "Sarzeau", "Sauzon", "Séné", "Surzur", "Theix-Noyalo", "La Trinité-sur-Mer", "Vannes",
  "Amnéville", "Audun-le-Tiche", "Le Ban-Saint-Martin", "Évrange", "Fameck", "Florange", "Guénange", "Hagen", "Hagondange", "Hettange-Grande", "Longeville-lès-Metz", "Maizières-lès-Metz", "Manom", "Marly", "Metz", "Mondelange", "Montigny-lès-Metz", "Moulins-lès-Metz", "Talange", "Terville", "Thionville", "Uckange", "Volmerange-les-Mines", "Woippy", "Yutz", "Zoufftgen",
  "Villeneuve-d'Ascq", "Anstaing", "Armentières", "Bailleul", "Baisieux", "Bersée", "Bourghelles", "Bousbecque", "Bouvines", "Bray-Dunes", "Camphin-en-Pévèle", "Capinghem", "La Chapelle-d'Armentières", "Chéreng", "Comines", "Coudekerque-Branche", "Croix", "Cysoing", "Deûlémont", "Douai", "Dunkerque", "Emmerin", "Englos", "Ennetières-en-Weppes", "Erquinghem-Lys", "Escobecques", "Faches-Thumesnil", "Faumont", "Forest-sur-Marque", "Frelinghien", "Grande-Synthe", "Gravelines", "Gruson", "Hallennes-lez-Haubourdin", "Halluin", "Haubourdin", "Hazebrouck", "Hem", "Houplines", "Lannoy", "Leers", "Lesquin", "Lezennes", "Linselles", "Lompret", "Louvil", "Lys-lez-Lannoy", "Le Maisnil", "Marquette-lez-Lille", "Mérignies", "Mons-en-Barœul", "Neuville-en-Ferrain", "Nieppe", "Noyelles-lès-Seclin", "Pérenchies", "Péronne-en-Mélantois", "Phalempin", "Prémesques", "Quesnoy-sur-Deûle", "Radinghem-en-Weppes", "Ronchin", "Roncq", "Roubaix", "Sailly-lez-Lannoy", "Sainghin-en-Mélantois", "Santes", "Seclin", "Sequedin", "Sin-le-Noble", "Templemars", "Templeuve-en-Pévèle", "Téteghem-Coudekerque-Village", "Toufflers", "Tourcoing", "Tourmignies", "Tressin", "Valenciennes", "Vendeville", "Verlinghem", "Wannehain", "Warneton", "Wattignies", "Wattrelos", "Wavrin", "Wervicq-Sud", "Willems",
  "Les Ageux", "Agnetz", "Allonne", "Angicourt", "Angy", "Apremont", "Armancourt", "Balagny-sur-Thérain", "Barbery", "Baron", "Beaurepaire", "Beauvais", "Bienville", "Blaincourt-lès-Précy", "Borest", "Brasseuse", "Brenouille", "Breuil-le-Sec", "Breuil-le-Vert", "Bury", "Cambronne-lès-Ribécourt", "Cauffry", "Chamant", "Chaumont-en-Vexin", "Choisy-au-Bac", "Cinqueux", "Cires-lès-Mello", "Clairoix", "Clermont", "Compiègne", "Cramoisy", "Creil", "Crépy-en-Valois", "Ermenonville", "Ève", "Fitz-James", "Fleurines", "Fontaine-Chaalis", "Goincourt", "Janville", "Jaux", "Lacroix-Saint-Ouen", "Laigneville", "Liancourt", "Longueil-Annel", "Machemont", "Margny-lès-Compiègne", "Maysel", "Mélicocq", "Mello", "Le Meux", "Mogneville", "Monceaux", "Monchy-Saint-Éloi", "Montagny-Sainte-Félicité", "Montataire", "Montépilloy", "Mont-l'Évêque", "Montlognon", "Montmacq", "Mortefontaine", "Mouy", "Nanteuil-le-Haudouin", "Nogent-sur-Oise", "Plailly", "Le Plessis-Belleville", "Pontarmé", "Pontpoint", "Pont-Sainte-Maxence", "Précy-sur-Oise", "Rantigny", "Raray", "Ribécourt-Dreslincourt", "Rieux", "Saint-Leu-d'Esserent", "Silly-le-Long", "Thiers-sur-Thève", "Thiverny", "Thourotte", "Tillé", "Trie-Château", "Trie-la-Ville", "Venette", "Ver-sur-Launette", "Verneuil-en-Halatte", "Versigny", "Villers-Saint-Frambourg-Ognon", "Villers-Saint-Paul", "Villers-sous-Saint-Leu",
  "Arras", "Berck", "Béthune", "Boulogne-sur-Mer", "Calais", "Camiers", "Cucq", "Étaples", "Laventie", "Lens", "Merlimont", "Neufchâtel-Hardelot", "Saint-Martin-Boulogne", "Sangatte", "Wimereux",
  "Aubière", "Beaumont", "Ceyrat", "Chamalières", "Clermont-Ferrand", "Cournon-d'Auvergne", "Romagnat", "Royat",
  "Ahetze", "Arbonne", "Arcangues", "Ascain", "Bassussarry", "Bayonne", "Biriatou", "BouCau", "Hendaye", "Jatxou", "Lahonce", "Mouguerre", "Saint-Pierre-d'Irube", "Urcuit", "Urrugne", "Ustaritz", "Villefranque",
  "Argelès-sur-Mer", "Banyuls-sur-Mer", "Le Barcarès", "Cabestany", "Canet-en-Roussillon", "Céret", "Collioure", "Elne", "Latour-Bas-Elne", "Font-Romeu-Odeillo-Via", "Perpignan", "Port-Vendres", "Saint-Cyprien", "Saint-Estève", "Saint-Laurent-de-la-Salanque", "Sainte-Marie-la-Mer", "Saleilles", "Torreilles", "Villeneuve-de-la-Raho",
  "Achenheim", "Barr", "Benfeld", "Bernolsheim", "Bischheim", "Bischwiller", "Breuschwickersheim", "Brumath", "Dingsheim", "Drusenheim", "Duppigheim", "Eckbolsheim", "Entzheim", "Ernolsheim-Bruche", "Eschau", "Fegersheim", "Gambsheim", "Geispolsheim", "Griesheim-sur-Souffel", "Haguenau", "Hangenbieten", "Herrlisheim", "Hœnheim", "Hœrdt", "Holtzheim", "Hurtigheim", "Ittenheim", "Kilstett", "Krautwiller", "Lampertheim", "Lingolsheim", "Lipsheim", "Marlenheim", "Mittelhausbergen", "Molsheim", "Mundolsheim", "Mutzig", "Niederhausbergen", "Obernai", "Oberschaeffolsheim", "Ostwald", "Pfulgriesheim", "Plobsheim", "Reichstett", "Rosheim", "Saverne", "Schiltigheim", "Schweighouse-sur-Moder", "Sélestat", "Souffelweyersheim", "Stutzheim-Offenheim", "Truchtersheim", "Vendenheim", "Wahlenheim", "La Wantzenau", "Wasselonne", "Weyersheim", "Wolfisheim",
  "Bartenheim", "Blotzheim", "Brunstatt-Didenheim", "Buschwiller", "Cernay", "Colmar", "Ensisheim", "Habsheim", "Hagenthal-le-Bas", "Hégenheim", "Hésingue", "Horbourg-Wihr", "Huningue", "Illzach", "Ingersheim", "Kaysersberg Vignoble", "Kembs", "Kingersheim", "Mulhouse", "Ribeauvillé", "Rosenau", "Rouffach", "Saint-Louis", "Sausheim", "Sierentz", "Turckheim", "Village-Neuf", "Wentzwiller", "Wittelsheim", "Wittenheim",
  "Albigny-sur-Saône", "Ambérieux", "Anse", "L'Arbresle", "Arnas", "Belleville-en-Beaujolais", "Belmont-d'Azergues", "Brignais", "Brindas", "Bron", "Bully", "Cailloux-sur-Fontaines", "Charly", "Chasselay", "Chazay-d'Azergues", "Les Chères", "Chessy", "Civrieux-d'Azergues", "Collonges-au-Mont-d'Or", "Condrieu", "Couzon-au-Mont-d'Or", "Curis-au-Mont-d'Or", "Denicé", "Dommartin", "Éveux", "Fleurieu-sur-Saône", "Fontaines-Saint-Martin", "Fontaines-sur-Saône", "Givors", "Gleizé", "Grézieu-la-Varenne", "Grigny", "Irigny", "Lacenas", "Lachassagne", "Lentilly", "Limas", "Limonest", "Lissieu", "Loire-sur-Rhône", "Lozanne", "Lucenay", "Marcilly-d'Azergues", "Marcy", "Marcy-l'Étoile", "Messimy", "Millery", "Montagny", "Morancé", "Mornant", "La Mulatière", "Orliénas", "Oullins-Pierre-Bénite", "Poleymieux-au-Mont-d'Or", "Pollionnay", "Pommiers", "Porte des Pierres Dorées", "Quincieux", "Rochetaillée-sur-Saône", "Sain-Bel", "Savigny", "Soucieu-en-Jarrest", "Sourcieux-les-Mines", "Beauvallon", "Sainte-Consorce", "Saint-Fons", "Saint-Genis-Laval", "Saint-Genis-les-Ollières", "Saint-Georges-de-Reneins", "Saint-Germain-au-Mont-d'Or", "Saint-Germain-Nuelles", "Saint-Jean-des-Vignes", "Saint-Laurent-d'Agny", "Saint-Pierre-la-Palud", "Saint-Romain-au-Mont-d'Or", "Saint-Romain-en-Gier", "Taluyers", "Thurins", "Vaugneray", "Vaulx-en-Velin", "Vénissieux", "Vernaison", "Villefranche-sur-Saône", "Vourles", "Chaponnay", "Communay", "Corbas", "Décines-Charpieu", "Feyzin", "Genas", "Genay", "Marennes", "Mions", "Montanay", "Pusignan", "Rillieux-la-Pape", "Saint-Bonnet-de-Mure", "Saint-Pierre-de-Chandieu", "Saint-Priest", "Saint-Symphorien-d'Ozon", "Sathonay-Village", "Sérézin-du-Rhône", "Simandres", "Solaize", "Ternay", "Toussieu", "Colombier-Saugnieu",
  "Le Mans",
  "Aime-la-Plagne", "Entrelacs", "Albertville", "Les Avanchers-Valmorel", "Barberaz", "Barby", "La Bâthie", "Beaufort", "La Biolle", "Bourg-Saint-Maurice", "Brison-Saint-Innocent", "Césarches", "Chambéry", "Chignin", "Cognin", "Cohennoz", "Conjux", "Crest-Voland", "Drumettaz-Clarafond", "Flumet", "Fontcouverte-la-Toussuire", "La Giettaz", "Gilly-sur-Isère", "Grignon", "Hauteluce", "La Plagne Tarentaise", "Mercury", "Méry", "Montagnole", "Montmélian", "Montvalezan", "Mouxy", "Notre-Dame-de-Bellecombe", "Pallud", "Pugny-Chatenod", "Saint-Baldoph", "Courchevel", "Saint-Cassin", "Saint François Longchamp", "Saint-Jean-d'Arvey", "Saint-Jeoire-Prieuré", "Les Belleville", "Saint-Ours", "Sonnaz", "Tignes", "Tours-en-Savoie", "Tresserve", "Trévignin", "Val-d'Isère", "Valmeinier", "Venthon", "Verel-Pragondran", "Vimines", "Viviers-du-Lac", "Voglans",
  "Abondance", "Alby-sur-Chéran", "Alex", "Amancy", "Anthy-sur-Léman", "Arâches-la-Frasse", "Arbusigny", "Arenthon", "Armoy", "Ayse", "Ballaison", "La Balme-de-Thuy", "Boëge", "Bonneville", "Boussy", "Brenthonne", "Brizon", "Burdignin", "Cercier", "Cernex", "Chainaz-les-Frasses", "Champanges", "La Chapelle-d'Abondance", "La Chapelle-Rambaud", "Chapeiry", "Charvonnex", "Châtillon-sur-Cluses", "Chaumont", "Chavannaz", "Chavanod", "Chêne-en-Semine", "Chessenaz", "Chevenoz", "Chilly", "Choisy", "Clarafond-Arcine", "Cluses", "Les Contamines-Montjoie", "Contamine-Sarzin", "Copponex", "Cordon", "Cornier", "La Côte-d'Arbroz", "Crempigny-Bonneguête", "Cuvat", "Demi-Quartier", "Desingy", "Dingy-Saint-Clair", "Domancy", "Draillant", "Éloise", "Essert-Romand", "Etaux", "Étercy", "Faverges-Seythenex", "Fessy", "Féternes", "La Forclaz", "Frangy", "Hauteville-sur-Fier", "Héry-sur-Alby", "Jonzier-Épagny", "Larringes", "Lathuile", "Loisin", "Lornay", "Lovagny", "Lugrin", "Lully", "Lyaud", "Manigod", "Marcellaz-Albanais", "Margencel", "Marignier", "Marigny-Saint-Marcel", "Marin", "Marlioz", "Marnaz", "Maxilly-sur-Léman", "Mégevette", "Meillerie", "Menthonnex-sous-Clermont", "Mésigny", "Mieussy", "Minzier", "Montagny-les-Lanches", "Montriond", "La Muraz", "Mûres", "Musièges", "Nâves-Parmelan", "Nonglard", "Novel", "Orcier", "Passy", "Peillonnex", "Perrignier", "Glières-Val-de-Borne", "Quintal", "La Rivière-Enverse", "Saint-André-de-Boëge", "Saint-Eusèbe", "Saint-Félix", "Saint-Gingolph", "Saint-Jean-d'Aulps", "Saint-Jean-de-Sixt", "Saint-Jean-de-Tholome", "Saint-Jeoire", "Saint-Laurent", "Saint-Paul-en-Chablais", "Saint-Sigismond", "Saint-Sixt", "Saint-Sylvestre", "Sales", "Sallenôves", "Savigny", "Saxel", "Scientrier", "Scionzier", "Servoz", "Sixt-Fer-à-Cheval", "Thyez", "Thollon-les-Mémises", "Thusy", "La Tour", "Usinens", "Vallières-sur-Fier", "Vallorcine", "Vanzy", "Vaulx", "Verchaix", "La Vernaz", "Vers", "Versonnex", "Veyrier-du-Lac", "Villard", "Les Villards-sur-Thônes", "Villaz", "Ville-en-Sallaz", "Villy-le-Pelloux", "Vinzier", "Viuz-la-Chiésaz", "Vougy",
  "Amfreville-la-Mi-Voie", "Belbeuf", "Bihorel", "Bonsecours", "Bois-Guillaume", "Boos", "Canteleu", "Caudebec-lès-Elbeuf", "Cauville-sur-Mer", "Cléon", "Darnétal", "Déville-lès-Rouen", "Elbeuf", "Épouville", "Fécamp", "Fontaine-la-Mallet", "Fontaine-sous-Préaux", "Fontenay", "Freneuse", "Gainneville", "Gonfreville-l'Orcher", "Grand-Couronne", "Le Grand-Quevilly", "Harfleur", "Le Havre", "Le Houlme", "Isneauville", "La Londe", "Malaunay", "Manéglise", "Maromme", "Le Mesnil-Esnard", "Montivilliers", "Mont-Saint-Aignan", "Montville", "Moulineaux", "Notre-Dame-de-Bondeville", "Franqueville-Saint-Pierre", "Notre-Dame-du-Bec", "Octeville-sur-Mer", "Oissel", "Orival", "Petit-Couronne", "Le Petit-Quevilly", "Quincampoix", "Rolleville", "Rouen", "Sainte-Adresse", "Saint-Aubin-Épinay", "Saint-Aubin-lès-Elbeuf", "Saint-Étienne-du-Rouvray", "Saint-Laurent-de-Brèvedent", "Saint-Léger-du-Bourg-Denis", "Saint-Martin-du-Bec", "Saint-Martin-du-Manoir", "Saint-Martin-du-Vivier", "Saint-Pierre-lès-Elbeuf", "Sotteville-lès-Rouen", "Sotteville-sous-le-Val", "Tourville-la-Rivière", "Turretot", "Val-de-la-Haye", "La Vaupalière",
  "Annet-sur-Marne", "Arbonne-la-Forêt", "Bagneaux-sur-Loing", "Barbizon", "Beauvoir", "Bouleurs", "Bourron-Marlotte", "Boutigny", "Cannes-Écluse", "La Celle-sur-Morin", "Cély", "Chailly-en-Bière", "Chamigny", "Champagne-sur-Seine", "La Chapelle-la-Reine", "Les Chapelles-Bourbon", "Charmentray", "Chartrettes", "Le Châtelet-en-Brie", "Châtres", "Chaumes-en-Brie", "Chevry-Cossigny", "Compans", "Coubert", "Coulommes", "Coulommiers", "Courquetaine", "Crèvecœur-en-Brie", "Darvault", "Évry-Grégy-sur-Yerre", "Faremoutiers", "Favières", "Féricy", "Férolles-Attilly", "La Ferté-sous-Jouarre", "Fleury-en-Bière", "Fontaine-le-Port", "Fontenay-Trésigny", "Gressy", "Grisy-Suisnes", "La Houssaye-en-Brie", "Jablines", "Jouarre", "Lesches", "Limoges-Fourches", "Lissy", "Liverdy-en-Brie", "Maincy", "Mareuil-lès-Meaux", "Marles-en-Brie", "Mauregard", "Le Mesnil-Amelot", "Messy", "Montereau-Fault-Yonne", "Montigny-sur-Loing", "Moret-Loing-et-Orvanne", "Mormant", "Mortcerf", "Mouroux", "Moussy-le-Neuf", "Moussy-le-Vieux", "Nangis", "Nemours", "Chauconin-Neufmontiers", "Neufmoutiers-en-Brie", "Othis", "Ozouer-le-Voulgis", "Perthes", "Le Pin", "Pommeuse", "Précy-sur-Marne", "Presles-en-Brie", "Provins", "Réau", "Recloses", "Reuil-en-Brie", "Rouilly", "Saint-Brice", "Saint-Fiacre", "Saint-Germain-Laval", "Saint-Germain-sur-École", "Saint-Mammès", "Saint-Mard", "Saint-Martin-en-Bière", "Saint-Pathus", "Saint-Pierre-lès-Nemours", "Saint-Sauveur-sur-École", "Samois-sur-Seine", "Sivry-Courtry", "Thieux", "Thomery", "Tigeaux", "Trilbardou", "Varennes-sur-Seine", "Vernou-la-Celle-sur-Seine", "Vignely", "Villeneuve-le-Comte", "Villeneuve-Saint-Denis", "Villeneuve-sous-Dammartin", "Villevaudé", "Villiers-en-Bière", "Voisenon",
  "Adainville", "Les Alluets-le-Roi", "Andelu", "Arnouville-lès-Mantes", "Auffargis", "Auteuil", "Autouillet", "Bazainville", "Bazemont", "Béhoust", "Bennecourt", "Boinville-en-Mantois", "Boissy-Mauvoisin", "Boissy-sans-Avoir", "Bonnelles", "Bonnières-sur-Seine", "Bouafle", "Bourdonné", "Breuil-Bois-Robert", "Les Bréviaires", "Brueil-en-Vexin", "Bullion", "La Celle-les-Bordes", "Cernay-la-Ville", "Choisel", "Clairefontaine-en-Yvelines", "Condé-sur-Vesgre", "Crespières", "Dampierre-en-Yvelines", "Dannemarie", "Davron", "Drocourt", "Ecquevilly", "Émancé", "Favrieux", "Flexanville", "Fontenay-Mauvoisin", "Fontenay-Saint-Père", "Freneuse", "Galluis", "Gambais", "Gambaiseuil", "Garancières", "Gazeran", "Goupillières", "Goussonville", "Grandchamp", "Gressey", "Grosrouvre", "Guernes", "Guerville", "Guitrancourt", "Hargeville", "Herbeville", "Jambville", "Jouy-Mauvoisin", "Jumeauville", "Lévis-Saint-Nom", "Limetz-Villez", "Longvilliers", "Marcq", "Mareil-le-Guyon", "Mareil-sur-Mauldre", "Maulette", "Ménerville", "Méré", "Méricourt", "Millemont", "Montainville", "Morainvilliers", "Mousseaux-sur-Seine", "Oinville-sur-Montcient", "Orgerus", "Osmoy", "Perdreauville", "Prunay-le-Temple", "La Queue-les-Yvelines", "Raizeux", "Richebourg", "Rochefort-en-Yvelines", "Rolleboise", "Rosay", "Rosny-sur-Seine", "Saint-Arnoult-en-Yvelines", "Saint-Forget", "Saint-Germain-de-la-Grange", "Saint-Hilarion", "Saint-Martin-des-Champs", "Saint-Martin-la-Garenne", "Saulx-Marchais", "Senlisse", "Septeuil", "Soindres", "Tacoignières", "Thiverval-Grignon", "Thoiry", "Vicq", "Villette", "Villiers-le-Mahieu",
  "Amiens", "Boves", "Cagny", "Camon", "Dreuil-lès-Amiens", "Dury", "Longueau", "Pont-de-Metz", "Rivery", "Saleux", "Salouël",
  "Saint-Sulpice-la-Pointe",
  "Montauban",
  "Les Arcs", "Brignoles", "Callian", "Le Cannet-des-Maures", "Carcès", "La Celle", "Cotignac", "Draguignan", "Figanières", "Flayosc", "La Garde-Freinet", "Garéoult", "Lorgues", "Le Luc", "La Môle", "La Motte", "Le Muy", "Nans-les-Pins", "Ollières", "Pierrefeu-du-Var", "Pignans", "Plan-d'Aups-Sainte-Baume", "Pourcieux", "Pourrières", "Puget-Ville", "Rocbaron", "Rougiers", "Saint-Maximin-la-Sainte-Baume", "Saint-Paul-en-Forêt", "Seillans", "Seillons-Source-d'Argens", "Signes", "Tanneron", "Taradeau", "Tourrettes", "Tourves", "Trans-en-Provence", "Le Val", "Vidauban", "Vinon-sur-Verdon",
  "Althen-des-Paluds", "Aubignan", "Avignon", "La Bastidonne", "Beaumes-de-Venise", "Bédarrides", "Bédoin", "Cadenet", "Caderousse", "Camaret-sur-Aigues", "Caromb", "Carpentras", "Caumont-sur-Durance", "Cavaillon", "Châteauneuf-de-Gadagne", "Cheval-Blanc", "Courthézon", "Entraigues-sur-la-Sorgue", "L'Isle-sur-la-Sorgue", "Jonquerettes", "Jonquières", "Lauris", "Loriol-du-Comtat", "Mazan", "Modène", "Monteux", "Morières-lès-Avignon", "Orange", "Pernes-les-Fontaines", "Pertuis", "Piolenc", "Le Pontet", "Robion", "Saint-Didier", "Saint-Saturnin-lès-Avignon", "Sarrians", "Saumane-de-Vaucluse", "Sorgues", "Taillades", "Le Thor", "La Tour-d'Aigues", "Fontaine-de-Vaucluse", "Vedène", "Velleron", "Villelaure",
  "L'Aiguillon-la-Presqu'île", "Barbâtre", "La Barre-de-Monts", "Challans", "L'Épine", "La Guérinière", "Les Herbiers", "L'Île-d'Yeu", "Jard-sur-Mer", "Longeville-sur-Mer", "Montaigu-Vendée", "Noirmoutier-en-l'Île", "Notre-Dame-de-Monts", "La Roche-sur-Yon", "Les Sables-d'Olonne", "Saint-Gilles-Croix-de-Vie", "Saint-Hilaire-de-Riez", "Saint-Jean-de-Monts", "Saint-Vincent-sur-Jard", "Talmont-Saint-Hilaire", "La Tranche-sur-Mer",
  "Poitiers",
  "Limoges",
  "Auxerre",
  "Angervilliers", "Auvernaux", "Auvers-Saint-Georges", "Avrainville", "Ballancourt-sur-Essonne", "Baulne", "Boissy-sous-Saint-Yon", "Boullay-les-Troux", "Bouray-sur-Juine", "Boutigny-sur-Essonne", "Bouville", "Brières-les-Scellés", "Briis-sous-Forges", "Cerny", "Chamarande", "Champcueil", "Chauffour-lès-Étréchy", "Cheptainville", "Chevannes", "Courances", "Courdimanche-sur-Essonne", "Courson-Monteloup", "Dannemois", "D'Huison-Longueville", "Étampes", "Étréchy", "La Ferté-Alais", "Fontenay-lès-Briis", "Gometz-la-Ville", "Guibeville", "Guigneville-sur-Essonne", "Itteville", "Janville-sur-Juine", "Janvry", "Lardy", "Leudeville", "Maisse", "Mauchamps", "Milly-la-Forêt", "Moigny-sur-École", "Les Molières", "Mondeville", "Morigny-Champigny", "Nainville-les-Roches", "Oncy-sur-École", "Orveau", "Pecqueuse", "Puiselet-le-Marais", "Roinville", "Saint-Chéron", "Saint-Cyr-sous-Dourdan", "Saint-Jean-de-Beauregard", "Saint-Maurice-Montcouronne", "Saint-Sulpice-de-Favières", "Saint-Vrain", "Sermaise", "Soisy-sur-École", "Torfou", "Valpuiseaux", "Le Val-Saint-Germain", "Vaugrigneuse", "Vayres-sur-Essonne", "Vert-le-Grand", "Vert-le-Petit", "Videlles",
  "Ableiges", "Aincourt", "Arronville", "Asnières-sur-Oise", "Attainville", "Avernes", "Baillet-en-France", "Bellefontaine", "Belloy-en-France", "Béthemont-la-Forêt", "Boissy-l'Aillerie", "Bouqueval", "Bruyères-sur-Oise", "Châtenay-en-France", "Chaumontel", "Chauvry", "Chennevières-lès-Louvres", "Commeny", "Condécourt", "Cormeilles-en-Vexin", "Courcelles-sur-Viosne", "Ennery", "Épinay-Champlâtreux", "Fontenay-en-Parisis", "Fosses", "Frémainville", "Frémécourt", "Frouville", "Génicourt", "Hédouville", "Hérouville-en-Vexin", "Jagny-sous-Bois", "Labbeville", "Lassy", "Livilliers", "Longuesse", "Louvres", "Luzarches", "Maffliers", "Magny-en-Vexin", "Mareil-en-France", "Marly-la-Ville", "Menouville", "Le Mesnil-Aubry", "Moisselles", "Montgeroult", "Montsoult", "Nerville-la-Forêt", "Nointel", "Le Perchay", "Le Plessis-Gassot", "Le Plessis-Luzarches", "Presles", "Puiseux-en-France", "Sagy", "Saint-Cyr-en-Arthies", "Saint-Martin-du-Tertre", "Saint-Witz", "Santeuil", "Seraincourt", "Seugy", "Survilliers", "Théméricourt", "Theuville", "Us", "Vallangoujard", "Vémars", "Vétheuil", "Viarmes", "Vienne-en-Arthies", "Vigny", "Villaines-sous-Bois", "Villeron", "Villiers-le-Sec",
  "Les Abymes", "Anse-Bertrand", "Baie-Mahault", "Baillif", "Basse-Terre", "Bouillante", "Capesterre-Belle-Eau", "Capesterre-de-Marie-Galante", "Gourbeyre", "La Désirade", "Deshaies", "Grand-Bourg", "Goyave", "Lamentin", "Morne-à-l'Eau", "Le Moule", "Petit-Bourg", "Petit-Canal", "Pointe-à-Pitre", "Pointe-Noire", "Port-Louis", "Saint-Claude", "Saint-Louis", "Sainte-Anne", "Sainte-Rose", "Terre-de-Bas", "Terre-de-Haut", "Trois-Rivières", "Vieux-Fort", "Vieux-Habitants",
  "L'Ajoupa-Bouillon", "Basse-Pointe", "Le Carbet", "Case-Pilote", "Ducos", "Fonds-Saint-Denis", "Fort-de-France", "Le François", "Grand'Rivière", "Gros-Morne", "Le Lamentin", "Le Lorrain", "Macouba", "Le Marigot", "Le Morne-Rouge", "Le Prêcheur", "Rivière-Pilote", "Rivière-Salée", "Le Robert", "Saint-Esprit", "Saint-Joseph", "Saint-Pierre", "Sainte-Anne", "Sainte-Luce", "Sainte-Marie", "Schœlcher", "La Trinité", "Le Vauclin", "Le Morne-Vert", "Bellefontaine",
  "Régina", "Cayenne", "Iracoubo", "Kourou", "Macouria", "Mana", "Matoury", "Saint-Georges", "Remire-Montjoly", "Roura", "Saint-Laurent-du-Maroni", "Sinnamary", "Montsinéry-Tonnegrande", "Ouanary", "Saül", "Maripasoula", "Camopi", "Grand-Santi", "Saint-Élie", "Apatou", "Awala-Yalimapo", "Papaichton",
  "Bras-Panon", "Entre-Deux", "Petite-Île", "La Plaine-des-Palmistes", "Le Port", "La Possession", "Saint-André", "Saint-Benoît", "Saint-Denis", "Saint-Joseph", "Saint-Louis", "Saint-Pierre", "Saint-Philippe", "Sainte-Marie", "Sainte-Rose", "Sainte-Suzanne", "Salazie", "Le Tampon", "Les Trois-Bassins", "Cilaos",
  "Acoua", "Bandraboua", "Bandrele", "Bouéni", "Chiconi", "Chirongui", "Dembeni", "Dzaoudzi", "Kani-Kéli", "Koungou", "Mamoudzou", "Mtsamboro", "M'Tsangamouji", "Ouangani", "Pamandzi", "Sada", "Tsingoni"],
    "B2": [ "Ars-sur-Formans", "Balan", "Beauregard", "Béligneux", "Bressolles", "Chézery-Forens", "Confort", "Frans", "Lélex", "Mijoux", "Niévroz", "Oyonnax", "Parcieux", "Péronnas", "Pérouges", "Pizay", "Rancé", "Saint-Bernard", "Sainte-Croix", "Saint-Denis-lès-Bourg", "Saint-Didier-de-Formans", "Sainte-Euphémie", "Saint-Jean-de-Thurigneux", "Saint-Just", "Saint-Laurent-sur-Saône", "Thil", "Toussieux", "Viriat",
"Athies-sous-Laon", "Belleu", "Bézu-le-Guéry", "Blesmes", "Brasles", "Brumetz", "Bussiares", "Castres", "Chambry", "Chézy-en-Orxois", "Chierry", "Contescourt", "Corcy", "Coupru", "Courchamps", "Courmelles", "Coyolles", "Crouttes-sur-Marne", "Crouy", "Cuffies", "Dallon", "Dammard", "Domptin", "Essigny-le-Petit", "Essômes-sur-Marne", "Étampes-sur-Marne", "Fayet", "La Ferté-Milon", "Fieulaine", "Fonsomme", "Fontaine-Notre-Dame", "Gandelu", "Gauchy", "Grugies", "Harly", "Hautevesnes", "Homblières", "Laon", "Largny-sur-Automne", "Lesdins", "Longpont", "Dhuys et Morin-en-Brie", "Marcy", "Marigny-en-Orxois", "Mercin-et-Vaux", "Mesnil-Saint-Laurent", "Monnes", "Montigny-l'Allier", "Montreuil-aux-Lions", "Morcourt", "Neuilly-Saint-Front", "Neuville-Saint-Amand", "Nogentel", "Omissy", "Passy-en-Valois", "Pavant", "Priez", "Remaucourt", "Rouvroy", "Saint-Gengoulph", "Saint-Quentin", "Soissons", "Vauxbuin", "Veuilly-la-Poterie", "Vichel-Nanteuil", "Viels-Maisons", "Vierzy", "Villeneuve-Saint-Germain",
"Abrest", "Bellerive-sur-Allier", "Creuzier-le-Neuf", "Creuzier-le-Vieux", "Cusset", "Désertines", "Domérat", "Hauterive", "Lavault-Sainte-Anne", "Montluçon", "Prémilhat", "Quinssaines", "Saint-Victor", "Saint-Yorre", "Serbannes", "Le Vernet", "Vichy",
"La Brillanne", "Corbières-en-Provence", "Esparron-de-Verdon", "Mane", "Les Mées", "Oraison", "Peyruis", "Saint-Martin-de-Brômes", "Sainte-Tulle", "Sisteron", "Valensole", "Villeneuve", "Volx",
"Andon", "Bézaudun-les-Alpes", "La Bollène-Vésubie", "Bouyon", "Breil-sur-Roya", "Caussols", "Cipières", "Coaraze", "Conségudes", "Courmes", "Coursegoules", "Duranus", "L'Escarène", "Escragnolles", "Les Ferres", "Gréolières", "Lantosque", "Lucéram", "Moulinet", "Peille", "La Roque-en-Provence", "Toudon", "Touët-de-l'Escarène", "Tourette-du-Château", "Utelle",
"Cornas", "Mauves", "Rochemaure", "Saint-Jean-de-Muzols", "Soyons", "Le Teil", "Tournon-sur-Rhône",
"Les Ayvelles", "Charleville-Mézières", "La Francheville", "Montcy-Notre-Dame", "Prix-lès-Mézières", "Saint-Laurent", "Villers-Semeuse", "Warcq",
"Barberey-Saint-Sulpice", "Bréviandes", "Buchères", "La Chapelle-Saint-Luc", "Creney-près-Troyes", "Lavau", "Les Noës-près-Troyes", "Pont-Sainte-Marie", "La Rivière-de-Corps", "Rosières-près-Troyes", "Saint-André-les-Vergers", "Saint-Germain", "Saint-Julien-les-Villas", "Sainte-Maure", "Saint-Parres-aux-Tertres", "Verrières", "Villechétif",
"Armissan", "Bages", "Berriac", "Carcassonne", "Cazilhac", "Coursan", "Fleury", "Narbonne", "Pennautier", "Peyriac-de-Mer", "Salles-d'Aude", "Sigean", "Vinassan",
"Luc-la-Primaube", "Le Monastère", "Olemps", "Onet-le-Château", "Rodez", "Sébazac-Concourès",
"Alleins", "Aureille", "Eygalières", "Maillane", "Mollégès", "Orgon", "Plan-d'Orgon", "Saint-Andiol", "Saint-Paul-lès-Durance", "Vauvenargues", "Verquières",
"Ablon", "Argences", "Auberville", "Authie", "Baron-sur-Odon", "Benerville-sur-Mer", "Bénouville", "Bernières-sur-Mer", "Biéville-Beuville", "Thue et Mue", "Cagny", "Cambes-en-Plaine", "Canapville", "Colleville-Montgomery", "Cresserons", "Cuverville", "Démouville", "Équemauville", "Éterville", "Fontaine-Étoupefour", "Frénouville", "Gonneville-sur-Honfleur", "Langrune-sur-Mer", "Lion-sur-Mer", "Mathieu", "Mouen", "Moult-Chicheboville", "Périers-sur-le-Dan", "Plumetot", "La Rivière-Saint-Sauveur", "Rots", "Saint-Aubin-d'Arquenay", "Saint-Contest", "Saint-Vaast-en-Auge", "Sannerville", "Tourville-sur-Odon", "Varaville", "Villerville", "Villons-les-Buissons",
"La Couronne", "Fléac", "Gond-Pontouvre", "L'Isle-d'Espagnac", "Linars", "Magnac-sur-Touvre", "Mornac", "Nersac", "Puymoyen", "Ruelle-sur-Touvre", "Saint-Michel", "Saint-Yrieix-sur-Charente", "Soyaux", "Touvre", "Trois-Palis",
"Île-d'Aix", "Arces", "Arvert", "Barzan", "Boutenac-Touvent", "Breuillet", "Breuil-Magné", "Brie-sous-Mortagne", "Chaillevette", "Le Château-d'Oléron", "Le Chay", "Chenac-Saint-Seurin-d'Uzet", "Cozes", "Échillais", "L'Éguille", "Épargnes", "Esnandes", "Étaules", "Floirac", "Fontcouverte", "Les Gonds", "Grézac", "La Jarne", "Marsilly", "Médis", "Meschers-sur-Gironde", "Mornac-sur-Seudre", "Mortagne-sur-Gironde", "Saint-Augustin", "Saint-Denis-d'Oléron", "Saint-Laurent-de-la-Prée", "Saint-Rogatien", "Saint-Sulpice-de-Royan", "Saint-Trojan-les-Bains", "Saint-Vivien", "Saintes", "Saujon", "Semussac", "Talmont-sur-Gironde", "Tonnay-Charente", "Vergeroux", "Yves", "Le Grand-Village-Plage", "La Brée-les-Bains",
"Annoix", "Arçay", "Berry-Bouy", "Bourges", "La Chapelle-Saint-Ursin", "Fussy", "Marmagne", "Morthomiers", "Plaimpied-Givaudins", "Saint-Doulchard", "Saint-Germain-du-Puy", "Saint-Just", "Saint-Michel-de-Volangis", "Le Subdray", "Trouy",
"Larche",
"Altagène", "Ambiegna", "Arbellara", "Arbori", "Argiusta-Moriccio", "Arro", "Aullène", "Azilone-Ampaza", "Azzana", "Balogna", "Bastelica", "Belvédère-Campomoro", "Bilia", "Bocognano", "Campo", "Carbini", "Cardo-Torgia", "Cargèse", "Cargiaca", "Casaglione", "Casalabriva", "Cauro", "Ciamannacce", "Coggia", "Cognocoli-Monticchi", "Conca", "Corrano", "Cozzano", "Cristinacce", "Évisa", "Figari", "Foce", "Forciolo", "Fozzano", "Frasseto", "Granace", "Grossa", "Guagno", "Guargualé", "Guitera-les-Bains", "Letia", "Levie", "Loreto-di-Tallano", "Marignana", "Mela", "Moca-Croce", "Monacia-d'Aullène", "Murzo", "Ocana", "Olivese", "Olmeto", "Olmiccia", "Orto", "Osani", "Ota", "Palneca", "Partinello", "Pastricciola", "Petreto-Bicchisano", "Piana", "Pianottoli-Caldarello", "Pila-Canale", "Poggiolo", "Quasquara", "Quenza", "Renno", "Rezza", "Rosazia", "Salice", "Sampolo", "Sari-Solenzara", "Sari-d'Orcino", "Serra-di-Scopamène", "Serriera", "Soccia", "Sollacaro", "Sorbollano", "Sotta", "San-Gavino-di-Carbini", "Sainte-Lucie-de-Tallano", "Santa-Maria-Figaniella", "Santa-Maria-Siché", "Tasso", "Tavera", "Tolla", "Ucciani", "Urbalacone", "Vico", "Viggianello", "Zérubia", "Zévaco", "Zicavo", "Zigliara", "Zoza",
"Aghione", "Aiti", "Alando", "Albertacce", "Aléria", "Altiani", "Alzi", "Ampriani", "Antisanti", "Asco", "Avapessa", "Barbaggio", "Barrettali", "Belgodère", "Bigorno", "Bisinchi", "Bustanico", "Cagnano", "Calacuccia", "Cambia", "Campana", "Campi", "Campile", "Campitello", "Canale-di-Verde", "Canari", "Canavaggia", "Carcheto-Brustico", "Carpineto", "Carticasi", "Casabianca", "Casalta", "Casamaccioli", "Casanova", "Casevecchie", "Castellare-di-Mercurio", "Castello-di-Rostino", "Castifao", "Castiglione", "Castineta", "Castirla", "Cateri", "Centuri", "Cervione", "Chiatra", "Corscia", "Costa", "Croce", "Crocicchia", "Erbajolo", "Érone", "Ersa", "Favalello", "Felce", "Feliceto", "Ficaja", "Focicchia", "Galéria", "Gavignano", "Ghisoni", "Giocatojo", "Giuncaggio", "Isolaccio-di-Fiumorbo", "Lano", "Lavatoggio", "Lento", "Linguizzetta", "Loreto-di-Casinca", "Lozzi", "Lugo-di-Nazza", "Luri", "Manso", "Matra", "Mausoléo", "Mazzola", "Meria", "Moïta", "Moltifao", "Monacia-d'Orezza", "Monte", "Montegrosso", "Morosaglia", "Morsiglia", "Muracciole", "Murato", "Muro", "Nessa", "Nocario", "Noceta", "Nonza", "Novale", "Novella", "Occhiatana", "Ogliastro", "Olmeta-di-Capocorso", "Olmeta-di-Tuda", "Olmi-Cappella", "Olmo", "Omessa", "Ortale", "Ortiporio", "Palasca", "Pancheraccia", "Parata", "Patrimonio", "Penta-Acquatella", "Perelli", "Pero-Casevecchie", "Pianello", "Piano", "Piazzali", "Piazzole", "Piedicorte-di-Gaggio", "Piedicroce", "Piedigriggio", "Piedipartino", "Pie-d'Orezza", "Pietralba", "Pietra-di-Verde", "Pietraserena", "Pietricaggio", "Pietroso", "Piève", "Pino", "Piobetta", "Pioggiola", "Poggio-di-Nazza", "Poggio-di-Venaco", "Poggio-d'Oletta", "Poggio-Marinaccio", "Polveroso", "Popolasca", "Porri", "La Porta", "Prato-di-Giovellina", "Prunelli-di-Casacconi", "Pruno", "Quercitello", "Rapaggio", "Rapale", "Riventosa", "Rogliano", "Rospigliani", "Rusio", "Rutali", "Saliceto", "Scata", "Scolca", "Sermano", "Serra-di-Fiumorbo", "Silvareccio", "Sisco", "Solaro", "Sorio", "Soveria", "Speloncato", "Stazzona", "Sant'Andréa-di-Bozio", "Sant'Andréa-di-Cotone", "Sant'Antonino", "San-Damiano", "San-Gavino-d'Ampugnani", "San-Gavino-di-Tenda", "San-Giovanni-di-Moriani", "San-Giuliano", "San-Lorenzo", "Santa-Lucia-di-Mercurio", "Santa-Maria-Poggio", "Santo-Pietro-di-Tenda", "Santo-Pietro-di-Venaco", "Santa-Reparata-di-Moriani", "Tallone", "Tarrano", "Tomino", "Tox", "Tralonca", "Urtaca", "Vallecalle", "Valle-d'Alesani", "Valle-di-Campoloro", "Valle-di-Rostino", "Valle-d'Orezza", "Vallica", "Velone-Orneto", "Venaco", "Ventiseri", "Verdèse", "Vezzani", "Vignale", "Ville-di-Paraso", "Vivario", "Volpajola", "Zalana", "Zilia", "Zuani", "San-Gavino-di-Fiumorbo", "Chisa",
    "Beaune", "Bressey-sur-Tille", "Bretenière", "Fénay", "Hauteville-lès-Dijon", "Magny-sur-Tille",
"Île-de-Bréhat", "Hillion", "Kermaria-Sulard", "Langueux", "Lannion", "Louannec", "La Méaugon", "Penvénan", "Plédran", "Plestin-les-Grèves", "Pleumeur-Bodou", "Beaussais-sur-Mer", "Ploubezre", "Ploufragan", "Ploulec'h", "Ploumilliau", "Plouzélambre", "Plufur", "Pordic", "Rospez", "Saint-Donan", "Saint-Julien", "Saint-Michel-en-Grève", "Saint-Quay-Perros", "Taden", "Trébeurden", "Trédrez-Locquémeau", "Tréduder", "Trégastel", "Trégueux", "Trélévern", "Trémel", "Trémuson", "Trévou-Tréguignec", "Yffiniac",
"Bassillac et Auberoche", "Bergerac", "Boulazac Isle Manoire", "Champcevinel", "Chancelade", "Coulounieix-Chamiers", "Cours-de-Pile", "Creysse", "La Feuillade", "Gardonne", "Ginestet", "La Force", "Lamonzie-Saint-Martin", "Lembras", "Marsac-sur-l'Isle", "Mouleydier", "Sanilhac", "Pazayac", "Périgueux", "Port-Sainte-Foy-et-Ponchapt", "Prigonrieux", "Saint-Antoine-de-Breuilh", "Saint-Germain-et-Mons", "Saint-Laurent-des-Vignes", "Saint-Nexans", "Saint-Pierre-d'Eyraud", "Saint-Sauveur", "Trélissac",
"Allenjoie", "Amagney", "Arbouans", "Audeux", "Audincourt", "Les Auxons", "Avanne-Aveney", "Badevel", "Bart", "Bavans", "Bethoncourt", "Beure", "Bourguignon", "Boussières", "Braillans", "Brognard", "Busy", "Chalèze", "Chalezeule", "Champagney", "Champoux", "Champvans-les-Moulins", "Châtillon-le-Duc", "Chaucenne", "Chemaudin et Vaux", "La Chevillotte", "Courcelles-lès-Montbéliard", "Dambenois", "Dampierre-les-Bois", "Dannemarie-sur-Crète", "Dasle", "Deluz", "Devecey", "Dommartin", "Doubs", "École-Valentin", "Étupes", "Exincourt", "Fesches-le-Châtel", "Fontain", "Franois", "Gennes", "Grand-Charmont", "Grandfontaine", "Le Gratteris", "Hérimoncourt", "Houtaud", "Larnod", "Mamirolle", "Mandeure", "Marchaux-Chaudefontaine", "Mathay", "Mazerolles-le-Salin", "Miserey-Salines", "Montbéliard", "Montfaucon", "Montferrand-le-Château", "Morre", "Nancray", "Noironte", "Nommay", "Novillars", "Osselle-Routelle", "Pelousey", "Pirey", "Pouilley-les-Vignes", "Pugey", "Rancenay", "Roche-lez-Beaupré", "Sainte-Suzanne", "Saône", "Seloncourt", "Serre-les-Sapins", "Sochaux", "Taillecourt", "Tallenay", "Thise", "Thoraise", "Torpes", "Vaire", "Valentigney", "Vandoncourt", "La Vèze", "Vieux-Charmont", "Vorges-les-Pins", "Voujeaucourt",
"Ancône", "Beaumont-lès-Valence", "Beauvallon", "Bourg-de-Péage", "Chabeuil", "Étoile-sur-Rhône", "Génissieux", "Malissard", "Montboucher-sur-Jabron", "Montéléger", "Montélier", "Montélimar", "Montmeyran", "Mours-Saint-Eusèbe", "Peyrins", "Romans-sur-Isère", "Tain-l'Hermitage",
"Acquigny", "Aigleville", "Amécourt", "Amfreville-sur-Iton", "Angerville-la-Campagne", "Arnières-sur-Iton", "Le Val d'Hazey", "Authevernes", "Aviron", "Les Baux-Sainte-Croix", "Bazincourt-sur-Epte", "Bernouville", "Beuzeville", "Bézu-la-Forêt", "Bézu-Saint-Éloi", "Bois-le-Roi", "La Boissière", "Boncourt", "Le Boulay-Morin", "Boulleville", "Bretagnolles", "Breuilpont", "Bueil", "Caugé", "Chaignes", "La Chapelle-du-Bois-des-Faulx", "Château-sur-Epte", "Chauvincourt-Provemont", "Cierrey", "Corneville-sur-Risle", "Coudray", "Courcelles-sur-Seine", "La Couture-Boussey", "Criquebeuf-sur-Seine", "Croth", "Les Damps", "Dangu", "Dardez", "Doudeauville-en-Vexin", "Vexin-sur-Epte", "Émalleville", "Épieds", "Étrépagny", "Ézy-sur-Eure", "Farceaux", "Fatouville-Grestain", "Fauville", "Fiquefleur-Équainville", "Gadencourt", "Gamaches-en-Vexin", "Garennes-sur-Eure", "Gauciel", "Gauville-la-Campagne", "Gravigny", "Guerny", "Guichainville", "L'Habit", "Hacqueville", "La Haye-le-Comte", "Hébécourt", "Hécourt", "Heudicourt", "Huest", "Incarville", "Irreville", "Ivry-la-Bataille", "Léry", "Lignerolles", "Longchamps", "Mainneville", "Manneville-la-Raoult", "Manneville-sur-Risle", "Le Manoir", "Marcilly-sur-Eure", "Martagny", "Merey", "Le Mesnil-Fuguet", "Mesnil-sous-Vienne", "Miserey", "Mouettes", "Mouflaines", "Mousseaux-Neuville", "Neaufles-Saint-Martin", "Neuilly", "La Neuve-Grange", "Nojeon-en-Vexin", "Normanville", "Noyers", "Parville", "Pinterville", "Pîtres", "Le Plessis-Grohan", "Pont-Audemer", "Pont-de-l'Arche", "Puchay", "Reuilly", "Richeville", "Sacquenville", "Saint-Aubin-sur-Gaillon", "Le Vaudreuil", "Saint-Denis-le-Ferment", "Saint-Étienne-du-Vauvray", "Saint-Germain-des-Angles", "Saint-Laurent-des-Bois", "Saint-Luc", "Saint-Maclou", "Saint-Mards-de-Blacarville", "Sainte-Marie-de-Vatimesnil", "Saint-Martin-la-Campagne", "Saint-Pierre-du-Val", "Saint-Pierre-du-Vauvray", "Saint-Sébastien-de-Morsent", "Saint-Vigor", "Sancourt", "Sassey", "Serez", "Suzay", "Le Thil", "Les Thilliers-en-Vexin", "Le Torpt", "Tourneville", "Toutainville", "La Trinité", "Le Val-David", "Les Ventes", "Vesly", "Le Vieil-Évreux", "Villegats", "Villers-en-Vexin", "Villers-sur-le-Roule", "Villiers-en-Désœuvre",
"Abondant", "Ardelu", "Aunay-sous-Auneau", "Auneau-Bleury-Saint-Symphorien", "Bailleau-Armenonville", "Barmainville", "Baudreville", "Berchères-sur-Vesgre", "Béville-le-Comte", "Boncourt", "Bouglainval", "Le Boullay-Thierry", "Boutigny-Prouais", "Bréchamps", "Broué", "Bû", "Champseru", "La Chapelle-d'Aunainville", "La Chapelle-Forainvilliers", "Charpont", "Chartainvilliers", "Châtenay", "Chaudon", "La Chaussée-d'Ivry", "Cherisy", "Coulombs", "Croisilles", "Denonville", "Droue-sur-Drouette", "Écluzelles", "Écrosnes", "Faverolles", "Gallardon", "Garancières-en-Beauce", "Gas", "Germainville", "Gilles", "Gommerville", "Gouillons", "Guainville", "Le Gué-de-Longroi", "Havelu", "Houx", "Intréville", "Léthuin", "Levainville", "Levesville-la-Chenard", "Lormaye", "Louville-la-Chenard", "Luray", "Maisons", "Marchezais", "Mérouville", "Le Mesnil-Simon", "Mévoisins", "Mézières-en-Drouais", "Moinville-la-Jeulin", "Mondonville-Saint-Jean", "Morainville", "Néron", "Neuvy-en-Beauce", "Nogent-le-Roi", "Oinville-sous-Auneau", "Ormoy", "Ouarville", "Ouerre", "Oulins", "Oysonville", "Pierres", "Les Pinthières", "Roinville", "Rouvray-Saint-Denis", "Rouvres", "Sainte-Gemme-Moronval", "Saint-Laurent-la-Gâtine", "Saint-Léger-des-Aubées", "Saint-Lubin-de-la-Haye", "Saint-Lucien", "Saint-Martin-de-Nigelles", "Saint-Ouen-Marchefroy", "Saint-Piat", "Sainville", "Santeuil", "Saussay", "Senantes", "Serazereux", "Serville", "Sorel-Moussel", "Soulaires", "Umpeau", "Vierville", "Villemeux-sur-Eure", "Villiers-le-Morhier", "Voise", "Yermenonville", "Ymeray",
"Bohars", "Clohars-Fouesnant", "Combrit", "Ergué-Gabéric", "Gouesnach", "Guengat", "Guilers", "Guilvinec", "Île-de-Batz", "Île-de-Sein", "Île-Molène", "Île-Tudy", "Loctudy", "Loperhet", "Ouessant", "Penmarch", "Pleuven", "Plobannalec-Lesconil", "Plogonnec", "Plomelin", "Plomeur", "Plonéis", "Pluguffan", "Saint-Jean-Trolimon", "Treffiagat",
"Alès", "Anduze", "Aramon", "Bagard", "Bagnols-sur-Cèze", "Beaucaire", "Boisset-et-Gaujac", "Le Cailar", "Cendras", "Clarensac", "Méjannes-lès-Alès", "Orsan", "Rousson", "Saint-Christol-lez-Alès", "Saint-Gilles", "Saint-Hilaire-de-Brethmas", "Saint-Jean-du-Pin", "Saint-Julien-les-Rosiers", "Saint-Martin-de-Valgalgues", "Saint-Nazaire", "Saint-Privat-des-Vieux", "Salindres", "Saze", "Tresques",
"Castelnau-d'Estrétefonds",
"Ambès", "Val de Virvée", "Les Billaux", "Cubzac-les-Ponts", "Lalande-de-Pomerol", "Pineuilh", "Pomerol", "Saint-Avit-Saint-Nazaire", "Saint-Denis-de-Pile", "Saint-Émilion", "Sainte-Foy-la-Grande", "Saint-Louis-de-Montferrand", "Saint-Philippe-du-Seignal", "Saint-Sulpice-de-Faleyrens",
"Bassan", "Boujan-sur-Libron", "Cers", "Corneilhan", "Lansargues", "Lieuran-lès-Béziers", "Lignan-sur-Orb", "Loupian", "Maraussan", "Montady", "Valergues", "Villeneuve-lès-Béziers",
"Bourgbarré", "Brécé", "La Chapelle-Thouarault", "Châteauneuf-d'Ille-et-Vilaine", "Cintré", "Clayes", "Corps-Nuds", "La Fresnais", "La Gouesnière", "Hirel", "Laillé", "Lillemer", "Miniac-Morvan", "Nouvoitou", "Parthenay-de-Bretagne", "Plerguer", "La Richardais", "Saint-Armel", "Saint-Benoît-des-Ondes", "Saint-Coulomb", "Saint-Guinoux", "Saint-Jouan-des-Guérets", "Saint-Père-Marc-en-Poulet", "Saint-Suliac", "Saint-Sulpice-la-Forêt", "Le Verger", "La Ville-ès-Nonais", "Le Tronchet",
"Châteauroux", "Déols", "Le Poinçonnet", "Saint-Maur",
"Cangey", "Chargé", "Civray-de-Touraine", "La Croix-en-Touraine", "Dierre", "Druye", "Limeray", "Noizay", "Saint-Étienne-de-Chigny", "Saint-Martin-le-Beau", "Saint-Ouen-les-Vignes",
"Chanas", "La Chapelle-de-la-Tour", "Chatte", "Four", "Le Grand-Lemps", "Jardin", "Le Péage-de-Roussillon", "Pont-Évêque", "Les Roches-de-Condrieu", "Roussillon", "Sablons", "Saint-Clair-de-la-Tour", "Saint-Clair-du-Rhône", "Saint-Jean-de-Soudain", "Saint-Marcellin", "Saint-Maurice-l'Exil", "Saint-Prim", "Salaise-sur-Sanne", "La Tour-du-Pin", "Vinay",
"Authume", "Baverans", "Bois-d'Amont", "Brevans", "Choisey", "Crissey", "Dole", "Foucherans", "Prémanon", "Villette-lès-Dole",
"Mont-de-Marsan", "Narrosse", "Orx", "Saint-Barthélemy", "Saint-Pierre-du-Mont", "Saint-Vincent-de-Paul", "Seyresse",
"Averdon", "Blois", "Candé-sur-Beuvron", "Cellettes", "Chailles", "La Chaussée-Saint-Victor", "Cheverny", "Chitenay", "Cormeray", "Cour-Cheverny", "Fossé", "Huisseau-sur-Cosson", "Marolles", "Menars", "Monthou-sur-Bièvre", "Les Montils", "Saint-Bohaire", "Saint-Denis-sur-Loire", "Saint-Gervais-la-Forêt", "Saint-Lubin-en-Vergonnois", "Saint-Sulpice-de-Pommeray", "Sambin", "Seur", "Valaire", "Villebarou", "Villerbon", "Vineuil",
"Andrézieux-Bouthéon", "Bonson", "Cellieu", "Le Chambon-Feugerolles", "Châteauneuf", "Chazelles-sur-Lyon", "Commelle-Vernay", "Le Coteau", "L'Étrat", "Farnay", "Firminy", "La Fouillouse", "Fraisses", "La Grand-Croix", "L'Horme", "Lorette", "Mably", "Montbrison", "Montrond-les-Bains", "Pouilly-les-Nonains", "Renaison", "La Ricamarie", "Riorges", "Rive-de-Gier", "Roanne", "Roche-la-Molière", "Saint-Alban-les-Eaux", "Saint-André-d'Apchon", "Saint-Chamond", "Saint-Étienne", "Saint-Galmier", "Saint-Genest-Lerpt", "Genilac", "Saint-Haon-le-Châtel", "Saint-Haon-le-Vieux", "Saint-Jean-Bonnefonds", "Saint-Joseph", "Saint-Léger-sur-Roanne", "Saint-Martin-la-Plaine", "Saint-Paul-en-Jarez", "Saint-Just-Saint-Rambert", "Savigneux", "Sorbiers", "Sury-le-Comtal", "La Tour-en-Jarez", "Unieux", "Veauche", "Villars", "Villerest",
"Aurec-sur-Loire", "Monistrol-sur-Loire", "Pont-Salomon", "Saint-Ferréol-d'Auroure", "Saint-Just-Malmont",
"Assérac", "Besné", "La Chapelle-des-Marais", "La Chapelle-Heulin", "Herbignac", "Mouzillon", "Nort-sur-Erdre", "Pontchâteau", "Saint-Joachim", "Saint-Lyphard", "Saint-Malo-de-Guersac", "Saint-Molf",
 "Amilly", "Andonville", "Autruy-sur-Juine", "Boisseaux", "Bou", "Cepoy", "Châlette-sur-Loing", "Chanteau", "Conflans-sur-Loing", "Corquilleroy", "Desmonts", "Erceville", "La Ferté-Saint-Aubin", "Le Malesherbois", "Marigny-les-Usages", "Montargis", "Morville-en-Beauce", "Orville", "Pannecières", "Pannes", "Paucourt", "Rouvres-Saint-Jean", "Thignonville", "Villemandeur", "Vimory",
"Agen", "Boé", "Bon-Encontre", "Brax", "Castelculier", "Colayrac-Saint-Cirq", "Estillac", "Foulayronnes", "Lafox", "Le Passage", "Pont-du-Casse", "Roquefort", "Saint-Hilaire-de-Lusignan", "Saint-Pierre-de-Clairac",
"Béhuard", "Briollay", "Cantenay-Épinard", "Chanteloup-les-Bois", "Feneu", "Les Garennes sur Loire", "Le May-sur-Èvre", "Mazières-en-Mauges", "Longuenée-en-Anjou", "Nuaillé", "Le Plessis-Grammoire", "La Romagne", "Saint-Christophe-du-Bois", "Saint-Clément-de-la-Place", "Saint-Lambert-la-Potherie", "Saint-Léger-de-Linières", "Saint-Léger-sous-Cholet", "Saint-Martin-du-Fouilloux", "Sarrigné", "Savennières", "La Séguinière", "Soulaines-sur-Aubance", "La Tessoualle", "Toutlemonde", "Trémentines", "Vezins", "Rives-du-Loir-en-Anjou",
"Agneaux", "Jullouville", "Bréville-sur-Mer", "Carolles", "Longueville", "Martinvast", "Saint-Georges-Montcocq", "Saint-Lô", "Tollevast", "Yquelon",
"Aÿ-Champagne", "Châlons-en-Champagne", "Compertrix", "Coolus", "Dizy", "Épernay", "L'Épine", "Fagnières", "Mardeuil", "Moncetz-Longevas", "Moussy", "Pierry", "Recy", "Réveillon", "Saint-Étienne-au-Temple", "Saint-Gibrien", "Saint-Martin-sur-le-Pré", "Saint-Memmie", "Sarry", "Le Vézier", "Villeneuve-la-Lionne", "Vinay", "Magenta",
"Art-sur-Meurthe", "Auboué", "Bainville-sur-Madon", "Belleville", "Blénod-lès-Pont-à-Mousson", "Bouxières-aux-Dames", "Val de Briey", "Chaligny", "Champigneulles", "Chanteheux", "Chavigny", "Cosnes-et-Romain", "Custines", "Dieulouard", "Dombasle-sur-Meurthe", "Dommartemont", "Dommartin-lès-Toul", "Écrouves", "Essey-lès-Nancy", "Eulmont", "Fléville-devant-Nancy", "Frouard", "Gondreville", "Gorcy", "Haucourt-Moulaine", "Heillecourt", "Herserange", "Homécourt", "Houdemont", "Hussigny-Godbrange", "Jœuf", "Laneuveville-devant-Nancy", "Lay-Saint-Christophe", "Lexy", "Liverdun", "Longlaville", "Ludres", "Lunéville", "Maidières", "Malleloy", "Malzéville", "Marbache", "Messein", "Mexy", "Montauville", "Mont-Saint-Martin", "Moutiers", "Neuves-Maisons", "Pompey", "Pont-à-Mousson", "Pont-Saint-Vincent", "Pulnoy", "Réhon", "Rosières-aux-Salines", "Saint-Ail", "Saint-Nicolas-de-Port", "Saulnes", "Saulxures-lès-Nancy", "Seichamps", "Thil", "Tomblaine", "Toul", "Varangéville",
"Brandérion", "Camoël", "Caudan", "Cléguer", "Elven", "Férel", "Gâvres", "Gestel", "Le Hézo", "Île-aux-Moines", "Île-d'Arz", "Inzinzac-Lochrist", "Languidic", "Larmor-Baden", "Meucon", "Monterblanc", "Plougoumelen", "Pont-Scorff", "Quéven", "Saint-Armel", "Saint-Nolff", "Sulniac", "Trédion", "Treffléan", "La Trinité-Surzur", "Le Bono",
"Achen", "Algrange", "Alsting", "Altviller", "Amanvillers", "Ancy-Dornot", "Angevillers", "Apach", "Ars-Laquenexy", "Ars-sur-Moselle", "Augny", "Aumetz", "Ay-sur-Moselle", "Behren-lès-Forbach", "Béning-lès-Saint-Avold", "Bertrange", "Betting", "Bliesbruck", "Blies-Ébersing", "Blies-Guersviller", "Boulange", "Bousbach", "Bousse", "Bronvaux", "Carling", "Châtel-Saint-Germain", "Chieulles", "Clouange", "Cocheren", "Coin-lès-Cuvry", "Coin-sur-Seille", "Creutzwald", "Cuvry", "Diebling", "Ennery", "Ernestviller", "Etting", "Etzling", "Falck", "Farébersviller", "Farschviller", "Fèves", "Féy", "Folkling", "Folschviller", "Fontoy", "Forbach", "Frauenberg", "Freyming-Merlebach", "Gandrange", "Gravelotte", "Grosbliederstroff", "Grundviller", "Guebenhouse", "Guenviller", "Basse-Ham", "Ham-sous-Varsberg", "Hambach", "Hargarten-aux-Mines", "Hauconcourt", "Havange", "Hayange", "Henriville", "Hombourg-Haut", "L'Hôpital", "Hundling", "Illange", "Ippling", "Jouy-aux-Arches", "Jussy", "Kalhausen", "Kerbach", "Knutange", "Kuntzig", "Lachambre", "Laquenexy", "Laudrefang", "Lessy", "Lixing-lès-Rouhling", "Lommerange", "Longeville-lès-Saint-Avold", "Lorry-lès-Metz", "Loupershouse", "Macheren", "Marange-Silvange", "Marieulles", "La Maxe", "Metzing", "Mey", "Montois-la-Montagne", "Morsbach", "Moyeuvre-Grande", "Moyeuvre-Petite", "Neufchef", "Neufgrange", "Nilvange", "Noisseville", "Norroy-le-Veneur", "Nouilly", "Nousseviller-Saint-Nabor", "Novéant-sur-Moselle", "Œting", "Ottange", "Peltre", "Petite-Rosselle", "Pierrevillers", "Plappeville", "Plesnois", "Porcelette", "Pouilly", "Pournoy-la-Chétive", "Puttelange-aux-Lacs", "Ranguevaux", "Rédange", "Rémelfing", "Rettel", "Richemont", "Rochonvillers", "Rombas", "Roncourt", "Rosbruck", "Rosselange", "Rouhling", "Rozérieulles", "Russange", "Rustroff", "Saint-Avold", "Saint-Julien-lès-Metz", "Sainte-Marie-aux-Chênes", "Saint-Privat-la-Montagne", "Sainte-Ruffine", "Sarralbe", "Sarreguemines", "Sarreinsming", "Saulny", "Schmittviller", "Schœneck", "Scy-Chazelles", "Seingbouse", "Semécourt", "Serémange-Erzange", "Sierck-les-Bains", "Spicheren", "Stiring-Wendel", "Tenteling", "Théding", "Trémery", "Tressange", "Valmont", "Vantoux", "Vany", "Varsberg", "Vaux", "Vernéville", "Vitry-sur-Orne", "Wiesviller", "Willerwald", "Wittring", "Wœlfling-lès-Sarreguemines", "Woustviller", "Zetting", "Diesen",
"Challuy", "Coulanges-lès-Nevers", "Fourchambault", "Garchizy", "Germigny-sur-Loire", "Nevers", "Pougues-les-Eaux", "Saincaize-Meauce", "Sermoise-sur-Loire", "Varennes-Vauzelles",
"Abscon", "Allennes-les-Marais", "Anhiers", "Aniche", "Annœullin", "Anzin", "Arleux", "Armbouts-Cappel", "Artres", "Assevent", "Attiches", "Auberchicourt", "Aubers", "Aubigny-au-Bac", "Aubry-du-Hainaut", "Auby", "Aulnoy-lez-Valenciennes", "Aulnoye-Aymeries", "Avelin", "Avesnes-le-Sec", "Awoingt", "Bachant", "Bachy", "La Bassée", "Bauvin", "Beaucamps-Ligny", "Bellaing", "Bergues", "Beuvrages", "Bierne", "Bois-Grenier", "Bouchain", "Bourbourg", "Boussières-sur-Sambre", "Boussois", "Bruay-sur-l'Escaut", "Bruille-lez-Marchiennes", "Bruille-Saint-Amand", "Brunémont", "Bugnicourt", "Cambrai", "Camphin-en-Carembault", "Cantin", "Cappelle-en-Pévèle", "Cappelle-la-Grande", "Carnin", "Cerfontaine", "Château-l'Abbaye", "Chemy", "Cobrieux", "Colleret", "Condé-sur-l'Escaut", "Courchelettes", "Craywick", "Crespin", "Cuincy", "Curgies", "Dechy", "Denain", "Douchy-les-Mines", "Écaillon", "Éclaibes", "Élesmes", "Émerchicourt", "Ennevelin", "Erchin", "Erquinghem-le-Sec", "Erre", "Escaudain", "Escaudœuvres", "Escautpont", "Esquerchin", "Estrées", "Estreux", "Famars", "Féchain", "Feignies", "Fenain", "Férin", "Ferrière-la-Grande", "Ferrière-la-Petite", "Flers-en-Escrebieux", "Flines-lès-Mortagne", "Flines-lez-Raches", "Fournes-en-Weppes", "Fresnes-sur-Escaut", "Fressain", "Fretin", "Fromelles", "Genech", "Ghyvelde", "Gœulzin", "Gondecourt", "Grand-Fort-Philippe", "Guesnain", "Hamel", "Hantay", "Hasnon", "Haspres", "Haulchin", "Hautmont", "Haveluy", "Hélesmes", "Hergnies", "Hérin", "Herlies", "Herrin", "Hordain", "Hornaing", "Houplin-Ancoisne", "Hoymille", "Illies", "Jeumont", "Lallaing", "Lambres-lez-Douai", "Lauwin-Planque", "Lecelles", "Lécluse", "Leffrinckoucke", "Leval", "Lewarde", "Lieu-Saint-Amand", "Limont-Fontaine", "Loffre", "Loon-Plage", "Lourches", "Louvroil", "Maine", "Mairieux", "Marcq-en-Ostrevent", "Marly", "Marpent", "Marquette-en-Ostrevant", "Marquillies", "Masny", "Mastaing", "Maubeuge", "Maulde", "Merville", "Méteren", "Millonfosse", "Monceau-Saint-Waast", "Monchaux-sur-Écaillon", "Moncheaux", "Monchecourt", "Mons-en-Pévèle", "Montigny-en-Ostrevent", "Mortagne-du-Nord", "Mouchin", "Neuf-Mesnil", "La Neuville", "Neuville-Saint-Rémy", "Neuville-sur-Escaut", "Nivelle", "Noyelles-sur-Selle", "Obrechies", "Odomez", "Oisy", "Onnaing", "Orchies", "Ostricourt", "Pecquencourt", "Petite-Forêt", "Pont-à-Marcq", "Pont-sur-Sambre", "Préseau", "Prouvy", "Proville", "Provin", "Quaëdypre", "Quarouble", "Quérénaing", "Quiévrechain", "Râches", "Raillencourt-Sainte-Olle", "Raimbeaucourt", "Raismes", "Recquignies", "Rieulay", "Rœulx", "Rombies-et-Marchipont", "Roost-Warendin", "Roucourt", "Rousies", "Rouvignies", "Sailly-lez-Cambrai", "Sainghin-en-Weppes", "Saint-Amand-les-Eaux", "Saint-Aybert", "Saint-Georges-sur-l'Aa", "Saint-Jans-Cappel", "Saint-Remy-du-Nord", "Saint-Saulve", "Salomé", "Saultain", "Sebourg", "La Sentinelle", "Socx", "Somain", "Steenwerck", "Thiant", "Thivencelle", "Thumeries", "Thun-Saint-Amand", "Tilloy-lez-Cambrai", "Trith-Saint-Léger", "Verchain-Maugré", "Vicq", "Vieux-Condé", "Vieux-Mesnil", "Villers-au-Tertre", "Wahagnies", "Wallers", "Wasnes-au-Bac", "Wavrechain-sous-Denain", "Wavrechain-sous-Faulx", "Waziers", "Wicres", "Zuydcoote", "Don",
  "Abbecourt", "Acy-en-Multien", "Amblainville", "Andeville", "Antilly", "Auger-Saint-Vincent", "Auneuil", "Auteuil", "Autheuil-en-Valois", "Bargny", "Beaumont-les-Nonains", "Berneuil-en-Bray", "Béthancourt-en-Valois", "Betz", "Boissy-Fresnoy", "Bonlier", "Bonneuil-en-Valois", "Boubiers", "Bouconvillers", "Bouillancy", "Boullarre", "Boursonne", "Boury-en-Vexin", "Boutencourt", "Brégy", "Cauvigny", "Chambors", "Chavençon", "Chèvreville", "Corbeil-Cerf", "Le Coudray-sur-Thelle", "Courcelles-lès-Gisors", "Crouy-en-Thelle", "Cuvergnon", "Delincourt", "La Drenne", "Dieudonné", "Duvy", "Éméville", "Énencourt-Léage", "La Corne-en-Vexin", "Éragny-sur-Epte", "Ercuis", "Esches", "Étavigny", "Fay-les-Étangs", "Feigneux", "Flavacourt", "Fleury", "Fontaine-Saint-Lucien", "Foulangues", "Fouquenies", "Montchevreuil", "Fresne-Léguillon", "Fresnoy-en-Thelle", "Fresnoy-la-Rivière", "Fresnoy-le-Luat", "Frocourt", "Gilocourt", "Glaignes", "Gondreville", "Guignecourt", "Hadancourt-le-Haut-Clocher", "Hénonville", "Herchies", "Hodenc-l'Évêque", "La Houssoye", "Ivors", "Ivry-le-Temple", "Jaméricourt", "Jonquières", "Jouy-sous-Thelle", "Juvignies", "Laboissière-en-Thelle", "Labosse", "Lachapelle-Saint-Pierre", "Lagny-le-Sec", "Lalande-en-Son", "Lattainville", "Lavilletertre", "Lévignen", "Liancourt-Saint-Pierre", "Lierville", "Loconville", "Lormaison", "Maisoncelle-Saint-Pierre", "Mareuil-sur-Ourcq", "Marolles", "Le Mesnil-Théribus", "Milly-sur-Thérain", "Monneville", "Montagny-en-Vexin", "Montjavoult", "Monts", "Le Mont-Saint-Adrien", "Morangles", "Morienval", "Mortefontaine-en-Thelle", "Neufchelles", "Neuilly-en-Thelle", "Neuville-Bosc", "Nivillers", "Noailles", "Novillers", "Ognes", "Ormoy-le-Davien", "Ormoy-Villers", "Orrouy", "Parnes", "Péroy-les-Gombries", "Pierrefitte-en-Beauvaisis", "Ponchon", "Porcheux", "Pouilly", "Puiseux-en-Bray", "Puiseux-le-Hauberger", "Rainvillers", "Réez-Fosse-Martin", "Reilly", "Rochy-Condé", "Rocquemont", "Rosières", "Rosoy-en-Multien", "Rouville", "Rouvres-en-Multien", "Russy-Bémont", "Saint-Crépin-Ibouvillers", "Sainte-Geneviève", "Saint-Germain-la-Poterie", "Saint-Jean-aux-Bois", "Saint-Léger-en-Bray", "Saint-Martin-le-Nœud", "Saint-Maximin", "Saint-Paul", "Saint-Pierre-es-Champs", "Saint-Sauveur", "Saint-Sulpice", "Savignies", "Senots", "Serans", "Sérifontaine", "Séry-Magneval", "Silly-Tillard", "Talmontiers", "Therdonne", "Thibivillers", "Thury-en-Valois", "Tourly", "Troissereux", "Trumilly", "Ully-Saint-Georges", "Valdampierre", "Varinfroy", "Vauciennes", "Vaudancourt", "Le Vaumain", "Vauomoise", "Le Vauroux", "Verderel-lès-Sauqueuse", "Vez", "Vieux-Moulin", "Villeneuve-les-Sablons", "La Villeneuve-sous-Thury", "Villers-Saint-Genest", "Les Hauts-Talican", "Warluis", "Aux Marais",
"Ablain-Saint-Nazaire", "Acheville", "Achicourt", "Agny", "Aire-sur-la-Lys", "Aix-Noulette", "Allouagne", "Angres", "Annay", "Annequin", "Annezin", "Anzin-Saint-Aubin", "Arques", "Athies", "Auchel", "Auchy-les-Mines", "Avion", "Bailleul-Sir-Berthoult", "Baincthun", "Bajus", "Barlin", "Beaumetz-lès-Loges", "Beaurains", "Bénifontaine", "Beugin", "Beuvry", "Billy-Berclau", "Billy-Montigny", "Blendecques", "Bois-Bernard", "Bouvigny-Boyeffles", "Brebières", "Bruay-la-Buissière", "Bully-les-Mines", "Burbure", "Calonne-Ricouart", "Camblain-Châtelain", "Cambrin", "Campagne-lès-Wardrecques", "Carency", "Carvin", "Cauchy-à-la-Tour", "Caucourt", "Chocques", "Clairmarais", "La Comté", "Condette", "Conteville-lès-Boulogne", "Coquelles", "Corbehem", "Coulogne", "Courcelles-lès-Lens", "Courrières", "La Couture", "Cuinchy", "Dainville", "Dannes", "Diéval", "Divion", "Dourges", "Douvrin", "Drocourt", "Drouvin-le-Marais", "Duisans", "Echinghen", "Ecquedecques", "Éleu-dit-Leauwette", "Éperlecques", "Équihen-Plage", "Essars", "Estevelles", "Estrée-Cauchy", "Étrun", "Évin-Malmaison", "Fampoux", "Farbus", "Festubert", "Feuchy", "Fouquereuil", "Fouquières-lès-Béthune", "Fouquières-lès-Lens", "Fresnicourt-le-Dolmen", "Fréthun", "Gauchin-Légal", "Gavrelle", "Givenchy-en-Gohelle", "Givenchy-lès-la-Bassée", "Gonnehem", "Gosnay", "Gouy-Servins", "Grenay", "Guînes", "Haillicourt", "Haisnes", "Hallines", "Hames-Boucres", "Harnes", "Helfaut", "Hénin-Beaumont", "Hermin", "Hersin-Coupigny", "Hesdigneul-lès-Béthune", "Hesdigneul-lès-Boulogne", "Hesdin-l'Abbé", "Hinges", "Houchin", "Houdain", "Houlle", "Hulluch", "Isbergues", "Isques", "Labeuvrière", "Labourse", "Lapugnoy", "Leforest", "Liévin", "Lillers", "Locon", "Loison-sous-Lens", "Longuenesse", "Loos-en-Gohelle", "Lorgies", "Lozinghem", "Maisnil-lès-Ruitz", "Marck", "Marles-les-Mines", "Marœuil", "Mazingarbe", "Mercatel", "Méricourt", "Meurchin", "Monchy-le-Preux", "Montigny-en-Gohelle", "Moringhem", "Moulle", "Nesles", "Neuve-Chapelle", "Neuville-Vitasse", "Nœux-les-Mines", "Noyelles-Godault", "Noyelles-lès-Vermelles", "Noyelles-sous-Lens", "Oblinghem", "Oignies", "Ourton", "Outreau", "Oye-Plage", "Pernes-lès-Boulogne", "Pittefaux", "Pont-à-Vendin", "Le Portel", "Rang-du-Fliers", "Rebreuve-Ranchicourt", "Richebourg", "Rouvroy", "Ruitz", "Sailly-Labourse", "Sains-en-Gohelle", "Sainte-Catherine", "Saint-Étienne-au-Mont", "Saint-Laurent-Blangy", "Saint-Léonard", "Saint-Martin-lez-Tatinghem", "Saint-Nicolas", "Saint-Omer", "Sallaumines", "Salperwick", "Serques", "Servins", "Souchez", "Thélus", "Tilloy-lès-Mofflaines", "Tilques", "Vaudricourt", "Vendin-lès-Béthune", "Vendin-le-Vieil", "Vermelles", "Verquigneul", "Verquin", "Verton", "Vieille-Chapelle", "Villers-au-Bois", "Vimy", "Violaines", "Vitry-en-Artois", "Wailly", "Wancourt", "Wardrecques", "Willerval", "Wimille", "Wingles", "Wizernes", "Libercourt", "La Capelle-lès-Boulogne",
"Aulnat", "Blanzat", "Cébazat", "Le Cendre", "Châteaugay", "Châtel-Guyon", "Durtol", "Enval", "Gerzat", "Lempdes", "Marsat", "Ménétrol", "Mozac", "Nohanent", "Pérignat-lès-Sarliève", "Pont-du-Château", "Riom",
"Andoins", "Angaïs", "Arbus", "Aressy", "Arros-de-Nay", "Artiguelouve", "Assat", "Aussevielle", "Baliros", "Baudreix", "Bénéjacq", "Billère", "Bizanos", "Boeil-Bezing", "Bordères", "Bordes", "Bourdettes", "Briscous", "Buros", "Cambo-les-Bains", "Coarraze", "Denguin", "Gabaston", "Gan", "Gelos", "Halsou", "Hasparren", "Idron", "Igon", "Jurançon", "Lagos", "Laroin", "Larressore", "Lée", "Lescar", "Lons", "Maucor", "Mazères-Lezons", "Meillon", "Mirepeix", "Montardon", "Morlaàs", "Narcastet", "Navailles-Angos", "Nay", "Ousse", "Pardies-Piétat", "Pau", "Poey-de-Lescar", "Rontignon", "Saint-Abit", "Saint-Jammes", "Saint-Pée-sur-Nivelle", "Sauvagnon", "Sendets", "Serres-Castet", "Serres-Morlaàs", "Siros", "Urt", "Uzos",
"Aureilhan", "Barbazan-Debat", "Bordères-sur-l'Échez", "Bours", "Chis", "Horgues", "Laloubère", "Momères", "Odos", "Orleix", "Sarrouilles", "Séméac", "Soues", "Tarbes",
"Alénya", "Bages", "Baho", "Baixas", "Bompas", "Le Boulou", "Canohès", "Cerbère", "Claira", "Corneilla-del-Vercol", "Espira-de-l'Agly", "Millas", "Montescot", "Palau-del-Vidre", "Peyrestortes", "Pézilla-la-Rivière", "Pia", "Pollestres", "Rivesaltes", "Saint-André", "Saint-Féliu-d'Amont", "Saint-Féliu-d'Avall", "Saint-Hippolyte", "Saint-Nazaire", "Le Soler", "Théza", "Thuir", "Toulouges", "Villelongue-de-la-Salanque", "Villeneuve-la-Rivière",
"Altorf", "Avolsheim", "Baldenheim", "Bernardswiller", "Bilwisheim", "Bischoffsheim", "Blaesheim", "Bœrsch", "Châtenois", "Dachstein", "Dahlenheim", "Dieffenthal", "Dinsheim-sur-Bruche", "Donnenheim", "Dorlisheim", "Duttlenheim", "Ebersheim", "Ebersmunster", "Eckwersheim", "Ergersheim", "Erstein", "Gertwiller", "Grendelbruch", "Gresswiller", "Griesheim-près-Molsheim", "Innenheim", "Kaltenhouse", "Kintzheim", "Kirchheim", "Krautergersheim", "Kriegsheim", "Marckolsheim", "Meistratzheim", "Mittelschaeffolsheim", "Mollkirch", "Mommenheim", "Mussig", "Muttersholtz", "Niedernai", "Oberhoffen-sur-Moder", "Odratzheim", "Offendorf", "Ohlungen", "Olwisheim", "Orschwiller", "Ottrott", "Rosenwiller", "Rottelsheim", "Saint-Nabor", "Scharrachbergheim-Irmstett", "Scherwiller", "Seltz", "Siltzheim", "Soultz-les-Bains", "La Vancelle", "Wangen", "Wissembourg", "Wolxheim",
"Aubure", "Baldersheim", "Beblenheim", "Bennwihr", "Bergheim", "Berrwiller", "Bitschwiller-lès-Thann", "Bollwiller", "Buhl", "Dannemarie", "Feldkirch", "Guebwiller", "Guémar", "Herrlisheim-près-Colmar", "Houssen", "Hunawihr", "Illhaeusern", "Issenheim", "Jebsheim", "Lautenbach", "Lautenbachzell", "Leimbach", "Linthal", "Lutterbach", "Mittelwihr", "Morschwiller-le-Bas", "Munster", "Ostheim", "Pfastatt", "Pulversheim", "Reiningue", "Richwiller", "Riquewihr", "Rixheim", "Rodern", "Rorschwihr", "Ruelisheim", "Sainte-Croix-en-Plaine", "Saint-Hippolyte", "Soultz-Haut-Rhin", "Staffelfelden", "Steinbach", "Sundhoffen", "Thann", "Thannenkirch", "Uffholtz", "Ungersheim", "Vieux-Thann", "Wattwiller", "Wettolsheim", "Willer-sur-Thur", "Zellenberg", "Zillisheim",
"Ampuis", "Fleurieux-sur-l'Arbresle", "Sainte-Colombe", "Saint-Cyr-sur-le-Rhône", "Saint-Romain-en-Gal", "Tupin-et-Semons",
"Châlonvillars", "Héricourt",
"Chalon-sur-Saône", "Champforgeuil", "Charnay-lès-Mâcon", "Châtenoy-en-Bresse", "Châtenoy-le-Royal", "Chevagny-les-Chevrières", "Crissey", "Fragnes-La Loyère", "Hurigny", "Lux", "Mâcon", "Oslon", "Saint-Marcel", "Saint-Rémy", "Sancé", "Varennes-lès-Mâcon", "Vinzelles",
"Aigné", "Allonnes", "Arnage", "Champagné", "Changé", "La Chapelle-Saint-Aubin", "Coulaines", "Guécélard", "Laigné-en-Belin", "La Milesse", "Moncé-en-Belin", "Mulsanne", "Rouillon", "Ruaudin", "Saint-Gervais-en-Belin", "Saint-Pavace", "Saint-Saturnin", "Sargé-lès-le-Mans", "Teloché", "Yvré-l'Évêque",
    "Allondaz", "Bourdeau", "La Chapelle-du-Mont-du-Chat", "Marthod", "Montcel", "Ontex", "Saint-Offenge", "Thénésol", "Ugine",
"Allèves", "Bernex", "Bogève", "La Chapelle-Saint-Maurice", "Cusy", "Gruffy", "Habère-Lullin", "Habère-Poche", "Leschaux", "Magland", "Mont-Saxonnex", "Nancy-sur-Cluses", "Le Reposoir", "Reyvroz", "Saint-Eustache", "Vacheresse", "Vailly",
"Arques-la-Bataille", "Les Authieux-sur-le-Port-Saint-Ouen", "Barentin", "Bolbec", "La Bouille", "Criquebeuf-en-Caux", "Dieppe", "Eu", "Flocques", "Gouy", "Hautot-sur-Seine", "Houppeville", "Incheville", "Lillebonne", "Mannevillette", "Martin-Église", "Montmain", "La Neuville-Chant-d'Oisel", "Port-Jérôme-sur-Seine", "Offranville", "Pavilly", "Ponts-et-Marais", "Quévreville-la-Poterie", "Rogerville", "Roncherolles-sur-le-Vivier", "Rouxmesnil-Bouteilles", "Sahurs", "Saint-Aubin-Celloville", "Saint-Aubin-sur-Scie", "Saint-Jacques-sur-Darnétal", "Saint-Léonard", "Saint-Pierre-de-Manneville", "Le Tréport", "Villers-Écalles", "Ymare", "Yport",
"Achères-la-Forêt", "Amillis", "Amponville", "Andrezel", "Argentières", "Armentières-en-Brie", "Arville", "Aubepierre-Ozouer-le-Repos", "Aufferville", "Augers-en-Brie", "Aulnoy", "Baby", "Balloy", "Bannost-Villegagnon", "Barbey", "Barcy", "Bassevelle", "Bazoches-lès-Bray", "Beauchery-Saint-Martin", "Beaumont-du-Gâtinais", "Bellot", "Bernay-Vilbert", "Beton-Bazoches", "Bezalles", "Blandy", "Blennes", "Boisdon", "Boissy-aux-Cailles", "Boissy-le-Châtel", "Boitron", "Bombon", "Bougligny", "Boulancourt", "Bransles", "Bray-sur-Seine", "Bréau", "La Brosse-Montceaux", "Burcy", "Bussières", "Buthiers", "Cerneux", "Cessoy-en-Montois", "Chailly-en-Brie", "Chaintreaux", "Chalautre-la-Grande", "Chalautre-la-Petite", "Chalmaison", "Chambry", "Champcenest", "Champdeuil", "Champeaux", "Changis-sur-Marne", "La Chapelle-Gauthier", "La Chapelle-Iger", "La Chapelle-Rablais", "La Chapelle-Saint-Sulpice", "La Chapelle-Moutils", "Charny", "Chartronges", "Châteaubleau", "Château-Landon", "Châtenay-sur-Seine", "Châtenoy", "Châtillon-la-Borde", "Chauffry", "Chenoise-Cucharmoy", "Chenou", "Chevrainvilliers", "Chevru", "Chevry-en-Sereine", "Choisy-en-Brie", "Citry", "Clos-Fontaine", "Cocherel", "Congis-sur-Thérouanne", "Coulombs-en-Valois", "Courcelles-en-Bassée", "Courchamp", "Courpalay", "Courtacon", "Courtomer", "Coutençon", "Crisenoy", "La Croix-en-Brie", "Crouy-sur-Ourcq", "Cuisy", "Dagny", "Dammartin-sur-Tigeaux", "Dhuisy", "Diant", "Donnemarie-Dontilly", "Dormelles", "Doue", "Douy-la-Ramée", "Échouboulains", "Les Écrennes", "Égligny", "Égreville", "Esmans", "Étrépilly", "Everly", "Faÿ-lès-Nemours", "La Ferté-Gaucher", "Flagy", "Fontaine-Fourches", "Fontains", "Fontenailles", "Forfry", "Forges", "Fouju", "Fresnes-sur-Marne", "Frétoy", "Fromont", "Fublaines", "Garentreville", "Gastins", "La Genevraye", "Germigny-l'Évêque", "Germigny-sous-Coulombs", "Gesvres-le-Chapitre", "Giremoutiers", "Gironville", "Gouaix", "La Grande-Paroisse", "Grandpuits-Bailly-Carrois", "Gravon", "Grez-sur-Loing", "Grisy-sur-Seine", "Guérard", "Guercheville", "Guignes", "Gurcy-le-Châtel", "Hautefeuille", "La Haute-Maison", "Hermé", "Hondevilliers", "Ichy", "Isles-les-Meldeuses", "Iverny", "Jaignes", "Jaulnes", "Jouy-le-Châtel", "Jouy-sur-Morin", "Juilly", "Jutigny", "Larchant", "Laval-en-Brie", "Léchelle", "Lescherolles", "Leudon-en-Brie", "Lizines", "Lizy-sur-Ourcq", "Longueville", "Lorrez-le-Bocage-Préaux", "Louan-Villegruis-Fontaine", "Luisetaines", "Lumigny-Nesles-Ormeaux", "Luzancy", "Machault", "La Madeleine-sur-Loing", "Maisoncelles-en-Brie", "Maisoncelles-en-Gâtinais", "Maison-Rouge", "Marchémoret", "Marcilly", "Les Marêts", "Marolles-en-Brie", "Marolles-sur-Seine", "Mary-sur-Marne", "Mauperthuis", "May-en-Multien", "Meigneux", "Meilleray", "Melz-sur-Seine", "Méry-sur-Marne", "Misy-sur-Yonne", "Moisenay", "Mondreville", "Mons-en-Montois", "Montceaux-lès-Meaux", "Montceaux-lès-Provins", "Montcourt-Fromonville", "Montdauphin", "Montenils", "Montereau-sur-le-Jard", "Montgé-en-Goële", "Monthyon", "Montigny-le-Guesdier", "Montigny-Lencoup", "Montmachoux", "Montolivet", "Mortery", "Mousseaux-lès-Bray", "Mouy-sur-Seine", "Nanteau-sur-Essonne", "Nanteau-sur-Lunain", "Nanteuil-sur-Marne", "Nantouillet", "Noisy-Rudignon", "Noisy-sur-École", "Nonville", "Noyen-sur-Seine", "Obsonville", "Ocquerre", "Oissery", "Orly-sur-Morin", "Les Ormes-sur-Voulzie", "Ormesson", "Paley", "Pamfou", "Paroy", "Passy-sur-Seine", "Pécy", "Penchard", "Pézarches", "Pierre-Levée", "Le Plessis-aux-Bois", "Le Plessis-Feu-Aussoux", "Le Plessis-l'Évêque", "Le Plessis-Placy", "Poigny", "Poligny", "Puisieux", "Quiers", "Rampillon", "Rebais", "Remauville", "Rouvres", "Rozay-en-Brie", "Rumont", "Rupéreux", "Saâcy-sur-Marne", "Sablonnières", "Saint-Augustin", "Sainte-Aulde", "Saint-Barthélemy", "Sainte-Colombe", "Saint-Cyr-sur-Morin", "Saint-Denis-lès-Rebais", "Saint-Germain-Laxis", "Saint-Germain-sous-Doue", "Saint-Hilliers", "Saint-Jean-les-Deux-Jumeaux", "Saint-Just-en-Brie", "Saint-Léger", "Saint-Loup-de-Naud", "Saint-Mars-Vieux-Maisons", "Saint-Martin-des-Champs", "Saint-Martin-du-Boschet", "Saint-Méry", "Saint-Mesmes", "Saint-Ouen-en-Brie", "Saint-Ouen-sur-Morin", "Saint-Rémy-de-la-Vanne", "Beautheil-Saints", "Saint-Sauveur-lès-Bray", "Saint-Siméon", "Saint-Soupplets", "Salins", "Sammeron", "Sancy", "Sancy-lès-Provins", "Savins", "Sept-Sorts", "Signy-Signets", "Sigy", "Sognolles-en-Montois", "Soignolles-en-Brie", "Soisy-Bouy", "Solers", "Souppes-sur-Loing", "Sourdun", "Tancrou", "Thénisy", "Therdonne", "Thibivillers", "Thury-en-Valois", "Tourly", "Troissereux", "Trumilly", "Ully-Saint-Georges", "Valence-en-Brie", "Vanvillé", "Varreddes", "Vaucourtois", "Le Vaudoué", "Vaudoy-en-Brie", "Vaux-sur-Lunain", "Vendrest", "Verdelot", "Verneuil-l'Étang", "Vieux-Champagne", "Villebéon", "Villecerf", "Villemaréchal", "Villemareuil", "Villemer", "Villenauxe-la-Petite", "Villeneuve-les-Bordes", "Villeneuve-sur-Bellot", "Villeroy", "Ville-Saint-Jacques", "Villiers-Saint-Georges", "Villiers-sous-Grez", "Villiers-sur-Seine", "Villuis", "Vimpelles", "Vinantes", "Vincy-Manœuvre", "Voinsles", "Voulton", "Voulx", "Vulaines-lès-Provins", "Yèbles",
"Ablis", "Allainville", "Blaru", "Boinville-le-Gaillard", "Boinvilliers", "Boissets", "La Boissière-École", "Bréval", "Chaufour-lès-Bonnières", "Civry-la-Forêt", "Courgent", "Cravent", "Dammartin-en-Serve", "Flacourt", "Flins-Neuve-Église", "Gommecourt", "La Hauteville", "Hermeray", "Notre-Dame-de-la-Mer", "Lainville-en-Vexin", "Lommoye", "Longnes", "Mittainville", "Moisson", "Mondreville", "Montalet-le-Bois", "Montchauvet", "Mulcent", "Neauphlette", "Orcemont", "Orphin", "Ontex", "Paray-Douaville", "Poigny-la-Forêt", "Ponthévrard", "Prunay-en-Yvelines", "Sailly", "Saint-Illiers-la-Ville", "Saint-Illiers-le-Bois", "Saint-Léger-en-Yvelines", "Saint-Martin-de-Bréthencourt", "Sainte-Mesme", "Sonchamp", "Le Tartre-Gaudran", "Le Tertre-Saint-Denis", "Tilly", "La Villeneuve-en-Chevrie",
    "Aiffres", "Chauray", "Niort",
"Abbeville", "Allonville", "Beauchamps", "Bertangles", "Blangy-Tronville", "Bouvaincourt-sur-Bresle", "Bovelles", "Caours", "Clairy-Saulchoix", "Creuse", "Drucat", "Estrées-sur-Noye", "Glisy", "Grand-Laviers", "Grattepanche", "Guignemicourt", "Hébécourt", "Mareuil-Caubert", "Mers-les-Bains", "Oust-Marest", "Pissy", "Poulainville", "Remiencourt", "Revelles", "Rumigny", "Sains-en-Amiénois", "Saint-Fuscien", "Saint-Sauflieu", "Saveuse", "Thézy-Glimont", "Vers-sur-Selle",
"Albi", "Arthès", "Burlats", "Cambon", "Cambounet-sur-le-Sor", "Castelnau-de-Lévis", "Castres", "Cunac", "Lescure-d'Albigeois", "Marssac-sur-Tarn", "Puygouzon", "Roquecourbe", "Saint-Juéry", "Saïx", "Le Sequestre", "Terssac", "Viviers-lès-Montagnes",
"Bressols", "Corbarieu", "Lacourt-Saint-Pierre", "Léojac", "Montbeton", "Saint-Étienne-de-Tulmont", "Saint-Nauphary", "Villemade",
"Bagnols-en-Forêt", "Besse-sur-Issole", "Callas", "Camps-la-Source", "Carnoules", "Collobrières", "Flassans-sur-Issole", "Forcalqueiret", "Gonfaron", "Les Mayons", "Méounes-lès-Montrieux", "Mons", "Néoules", "Rians", "Riboux", "La Roquebrussanne", "Sainte-Anastasie-sur-Issole", "Le Thoronet",
"Le Beaucet", "Crillon-le-Brave", "Maubec", "La Roque-sur-Pernes", "Saint-Hippolyte-le-Graveyron", "Saint-Pierre-de-Vassols", "Vacqueyras",
"Bretignolles-sur-Mer", "Le Fenouiller", "Le Perrier", "Notre-Dame-de-Riez", "Sallertaine", "Soullans",
"Béruges", "Biard", "Buxerolles", "Chasseneuil-du-Poitou", "Croutelle", "Fontaine-le-Comte", "Jaunay-Marigny", "Mignaloux-Beauvoir", "Migné-Auxances", "Montamisé", "Saint-Benoît", "Vouneuil-sous-Biard",
"Boisseuil", "Bosmie-l'Aiguille", "Chaptelat", "Condat-sur-Vienne", "Couzeix", "Feytiat", "Isle", "Le Palais-sur-Vienne", "Panazol", "Rilhac-Rancon",
"Chantraine", "Chavelot", "Dinozé", "Dogneville", "Épinal", "Les Forges", "Golbey", "Igney", "Jeuxey", "Thaon-les-Vosges",
"Appoigny", "Maillot", "Malay-le-Grand", "Monéteau", "Paron", "Saint-Clément", "Saint-Georges-sur-Baulche", "Saint-Martin-du-Tertre", "Sens",
"Andelnans", "Argiésans", "Bavilliers", "Belfort", "Bermont", "Botans", "Bourogne", "Charmois", "Châtenois-les-Forges", "Chaux", "Chèvremont", "Cravanche", "Danjoutin", "Delle", "Denney", "Dorans", "Éloie", "Essert", "Évette-Salbert", "Grandvillars", "Joncherey", "Lachapelle-sous-Chaux", "Meroux-Moval", "Méziré", "Morvillars", "Offemont", "Pérouse", "Roppe", "Sermamagny", "Sevenans", "Trévenans", "Valdoie", "Vétrigne", "Vézelois",
"Abbéville-la-Rivière", "Angerville", "Arrancourt", "Authon-la-Plaine", "Blandy", "Boigneville", "Bois-Herpin", "Boissy-la-Rivière", "Boissy-le-Cutté", "Boissy-le-Sec", "Boutervilliers", "Brouy", "Buno-Bonnevaux", "Chalo-Saint-Mars", "Chalou-Moulineux", "Champmotteux", "Chatignonville", "Corbreuse", "Fontaine-la-Rivière", "La Forêt-le-Roi", "La Forêt-Sainte-Croix", "Gironville-sur-Essonne", "Les Granges-le-Roi", "Guillerval", "Marolles-en-Beauce", "Le Mérévillois", "Mérobert", "Mespuits", "Monnerville", "Ormoy-la-Rivière", "Plessis-Saint-Benoist", "Prunay-sur-Essonne", "Pussay", "Richarville", "Roinvilliers", "Saclas", "Saint-Cyr-la-Rivière", "Saint-Escobille", "Saint-Hilaire", "Souzy-la-Briche", "Congerville-Thionville", "Villeconin", "Villeneuve-sur-Auvers",
"Ambleville", "Amenucourt", "Arthies", "Banthelu", "Le Bellay-en-Vexin", "Berville", "Bray-et-Lû", "Bréançon", "Brignancourt", "Buhy", "La Chapelle-en-Vexin", "Charmont", "Chars", "Chaussy", "Chérence", "Cléry-en-Vexin", "Épiais-Rhus", "Genainville", "Grisy-les-Plâtres", "Guiry-en-Vexin", "Haravilliers", "Haute-Isle", "Le Heaulme", "Hodent", "Marines", "Maudétour-en-Vexin", "Montreuil-sur-Epte", "Moussy", "Neuilly-en-Vexin", "Noisy-sur-Oise", "Nucourt", "Omerville", "La Roche-Guyon", "Saint-Clair-sur-Epte", "Saint-Gervais", "Villers-en-Arthies", "Wy-dit-Joli-Village"],
    "C": ["Autre"]
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
