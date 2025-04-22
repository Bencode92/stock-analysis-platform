// Correctif pour le simulateur PTZ
// À inclure après ptz-simulator.js

// Fonction pour s'assurer que le simulateur est correctement initialisé
function fixPTZSimulator() {
    console.log("Application du correctif pour le simulateur PTZ - Version de débogage");
    
    // 1. Assurer que l'index des villes est initialisé correctement
    initializeCityIndex();
    
    // 2. Récupérer des références DOM fiables
    const ptzZoneSelect = document.getElementById('ptz-zone');
    const ptzCityInput = document.getElementById('ptz-city-search');
    const ptzIncomeInput = document.getElementById('ptz-income');
    const ptzHouseholdSize = document.getElementById('ptz-household-size');
    const ptzTotalCost = document.getElementById('ptz-total-cost');
    const ptzProjectType = document.getElementById('ptz-project-type');
    const calculatePTZButton = document.getElementById('calculate-ptz-button');
    const suggestionsList = document.getElementById('city-suggestions-container');
    
    // Vérification des éléments essentiels
    if (!ptzZoneSelect || !ptzCityInput || !ptzIncomeInput || !ptzHouseholdSize || 
        !ptzTotalCost || !ptzProjectType) {
        console.error("Éléments essentiels du simulateur PTZ manquants!");
        return;
    }
    
    // 3. Remplacer complètement le gestionnaire d'événements du bouton
    if (calculatePTZButton) {
        console.log("Bouton de simulation PTZ trouvé, remplacement du gestionnaire d'événements");
        
        // Supprimer tous les anciens gestionnaires d'événements
        const newButton = calculatePTZButton.cloneNode(true);
        calculatePTZButton.parentNode.replaceChild(newButton, calculatePTZButton);
        
        // Ajouter un nouveau gestionnaire
        newButton.onclick = function(event) {
            event.preventDefault();
            console.log("Clic sur bouton PTZ avec gestionnaire corrigé");
            
            // Valider les entrées avec des messages spécifiques
            const income = parseFloat(ptzIncomeInput.value || '0');
            const totalCost = parseFloat(ptzTotalCost.value || '0');
            
            if (isNaN(income) || income <= 0) {
                alert('Veuillez entrer un revenu fiscal de référence valide supérieur à 0.');
                ptzIncomeInput.focus();
                return false;
            }
            
            if (isNaN(totalCost) || totalCost <= 0) {
                alert('Veuillez entrer un coût total de l\'opération valide supérieur à 0.');
                ptzTotalCost.focus();
                return false;
            }
            
            // Créer l'instance du simulateur avec les valeurs récupérées
            const simulator = new PTZSimulator({
                projectType: ptzProjectType.value, 
                zone: ptzZoneSelect.value, 
                income: income, 
                householdSize: parseInt(ptzHouseholdSize.value || '1'), 
                totalCost: totalCost,
                cityName: ptzCityInput.value
            });
            
            try {
                // Calculer le résultat
                const result = simulator.calculatePTZAmount();
                console.log("Résultat calculé :", result);
                
                // Forcer l'affichage avec une méthode personnalisée
                forceUpdatePTZResults(result);
                
                return true;
            } catch (error) {
                console.error("Erreur lors du calcul PTZ:", error);
                alert("Une erreur s'est produite lors du calcul: " + error.message);
                return false;
            }
        };
    } else {
        console.error("Bouton de calcul PTZ non trouvé - création d'un nouveau bouton");
        
        // Trouver le conteneur PTZ
        const ptzContainer = document.querySelector('.bg-blue-900.bg-opacity-20.p-6.rounded-lg');
        if (ptzContainer) {
            const newButton = document.createElement('button');
            newButton.id = 'calculate-ptz-button';
            newButton.className = 'loan-action-button w-full mt-6';
            newButton.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Simuler le PTZ (bouton de secours)';
            
            newButton.onclick = function(event) {
                event.preventDefault();
                simulerPTZ();
                return false;
            };
            
            ptzContainer.appendChild(newButton);
            console.log("Bouton de secours PTZ ajouté");
        }
    }
    
    // 4. Fonction pour mettre à jour directement les résultats du PTZ
    window.forceUpdatePTZResults = forceUpdatePTZResults;
    
    // 5. Configurer la recherche de villes
    if (ptzCityInput && suggestionsList) {
        // Configurer la recherche dynamique
        ptzCityInput.addEventListener('input', function() {
            const query = this.value.trim();
            if (query.length > 0) {
                const results = searchCity(query);
                console.log("Résultats de recherche de ville:", results.length, "villes trouvées");
                updateSuggestionsList(results, suggestionsList, ptzCityInput, ptzZoneSelect);
            } else {
                suggestionsList.classList.add('hidden');
            }
        });
    }
    
    console.log("Correctif du simulateur PTZ appliqué avec succès");
}

// Fonction pour forcer la mise à jour des résultats
function forceUpdatePTZResults(result) {
    console.log("Mise à jour forcée des résultats PTZ:", result);
    
    // Rechercher le conteneur de résultats
    let resultsContainer = document.getElementById('ptz-results-container');
    
    // Si le conteneur n'existe pas, le créer
    if (!resultsContainer) {
        console.log("Création d'un nouveau conteneur de résultats PTZ");
        
        // Trouver la colonne de droite (résultats)
        const rightColumn = document.querySelector('#ptz-simulator .grid.grid-cols-1.md\\:grid-cols-2.gap-6 > div:nth-child(2)');
        
        if (rightColumn) {
            // Vider la colonne
            rightColumn.innerHTML = '';
            
            // Créer le conteneur de résultats
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'ptz-results-container';
            rightColumn.appendChild(resultsContainer);
        } else {
            console.error("Impossible de trouver la colonne pour les résultats PTZ");
            alert("Erreur: Impossible d'afficher les résultats. L'interface est incorrecte.");
            return;
        }
    }
    
    // Gérer le cas non éligible
    if (!result.eligible) {
        resultsContainer.innerHTML = `
            <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                <p>${result.reason}</p>
            </div>
        `;
        return;
    }
    
    // Personnaliser selon le type de projet
    let projectTypeInfo = '';
    let projectTypeDetails = '';
    
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
        projectTypeInfo = `
            <div class="result-card bg-blue-700 bg-opacity-30">
                <p class="result-value">Logement neuf</p>
                <p class="result-label">Type de projet</p>
            </div>
        `;
    }
    
    // Créer le contenu HTML des résultats
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
            ${projectTypeInfo}
        </div>
        
        <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-blue-500 mb-6">
            <h5 class="text-lg font-semibold text-blue-400 mb-2">Détails du calcul</h5>
            <ul class="space-y-2">
                <li><span class="text-gray-400">Coût total de l'opération:</span> ${result.consideredCost.toLocaleString('fr-FR')} € (sur un maximum de ${result.maxCost.toLocaleString('fr-FR')} €)</li>
                <li><span class="text-gray-400">Tranche de revenus:</span> ${result.incomeBracket.replace('tranche', 'Tranche ')}</li>
                <li><span class="text-gray-400">Revenu ajusté:</span> ${Math.round(result.adjustedIncome).toLocaleString('fr-FR')} € (coefficient: ${result.coefficient})</li>
                ${projectTypeDetails}
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
    
    // Afficher le bouton d'intégration au prêt principal
    const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
    if (integratePTZButton) {
        integratePTZButton.classList.remove('hidden');
        integratePTZButton.setAttribute('data-ptz-amount', result.amount);
        integratePTZButton.setAttribute('data-ptz-duration', result.repaymentPeriods.totalDuration);
        integratePTZButton.setAttribute('data-ptz-deferral', result.repaymentPeriods.deferralPeriod);
        integratePTZButton.setAttribute('data-ptz-type', result.projectType);
    }
    
    console.log("Résultats PTZ affichés avec succès");
}

// Appliquer le correctif dès que la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log("Document chargé, application du correctif PTZ...");
    
    // Petit délai pour s'assurer que tous les scripts sont chargés
    setTimeout(fixPTZSimulator, 500);
    
    // S'assurer que les onglets fonctionnent
    const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
    if (ptzTab) {
        ptzTab.addEventListener('click', function() {
            console.log("Onglet PTZ cliqué, réinitialisation du correctif");
            setTimeout(fixPTZSimulator, 200);
        });
    }
});
