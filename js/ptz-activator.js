/**
 * Script d'activation du simulateur PTZ
 * Ce script force l'initialisation du simulateur et corrige l'affichage des résultats
 */

(function() {
    console.log("PTZ Activator v1.2 chargé !");
    
    /**
     * Force l'initialisation complète du simulateur PTZ
     */
    function activatePTZSimulator() {
        console.log("Activation forcée du simulateur PTZ en cours...");
        
        // S'assurer que les scripts PTZ sont bien chargés
        if (typeof PTZSimulator !== 'function') {
            console.error("PTZSimulator non trouvé. Vérifiez que ptz-simulator.js est bien chargé.");
            return;
        }
        
        // Récupérer les références aux éléments DOM essentiels
        const calculateButton = document.getElementById('calculate-ptz-button');
        const resultsContainer = document.getElementById('ptz-results-container');
        const ptzProjectType = document.getElementById('ptz-project-type');
        const ptzZone = document.getElementById('ptz-zone');
        const ptzIncome = document.getElementById('ptz-income');
        const ptzHouseholdSize = document.getElementById('ptz-household-size');
        const ptzTotalCost = document.getElementById('ptz-total-cost');
        const ptzCitySearch = document.getElementById('ptz-city-search');
        const citySuggestions = document.getElementById('city-suggestions-container');
        
        // Initialiser l'index des villes si la fonction existe
        if (typeof initializeCityIndex === 'function') {
            initializeCityIndex();
        }
        
        // Nettoyer et recréer les gestionnaires d'événements pour le bouton de calcul
        if (calculateButton) {
            const newButton = calculateButton.cloneNode(true);
            calculateButton.parentNode.replaceChild(newButton, calculateButton);
            
            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Vérifier que les champs requis sont remplis
                const income = parseFloat(ptzIncome.value || '0');
                const totalCost = parseFloat(ptzTotalCost.value || '0');
                
                if (isNaN(income) || income <= 0) {
                    alert("Veuillez entrer un revenu fiscal de référence valide.");
                    ptzIncome.focus();
                    return;
                }
                
                if (isNaN(totalCost) || totalCost <= 0) {
                    alert("Veuillez entrer un coût total d'opération valide.");
                    ptzTotalCost.focus();
                    return;
                }
                
                // Créer une instance du simulateur et calculer le résultat
                const simulator = new PTZSimulator({
                    projectType: ptzProjectType.value,
                    zone: ptzZone.value,
                    income: income,
                    householdSize: parseInt(ptzHouseholdSize.value || '1'),
                    totalCost: totalCost,
                    cityName: ptzCitySearch.value
                });
                
                // Calculer le PTZ
                const result = simulator.calculatePTZAmount();
                console.log("Résultat du calcul:", result);
                
                // Mettre à jour l'affichage des résultats avec la fonction du module original
                if (typeof updatePTZResults === 'function') {
                    updatePTZResults(result);
                } else {
                    // Fonction de secours si updatePTZResults n'est pas disponible
                    displayPTZResults(result, resultsContainer);
                }
                
                // Afficher le bouton d'intégration
                const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
                if (integratePTZButton) {
                    integratePTZButton.classList.remove('hidden');
                    integratePTZButton.setAttribute('data-ptz-amount', result.amount);
                    integratePTZButton.setAttribute('data-ptz-duration', result.repaymentPeriods.totalDuration);
                    integratePTZButton.setAttribute('data-ptz-deferral', result.repaymentPeriods.deferralPeriod);
                }
            });
        }
        
        // Configurer la recherche de villes
        if (ptzCitySearch && citySuggestions) {
            ptzCitySearch.addEventListener('input', function() {
                const query = this.value.trim();
                if (query.length > 0 && typeof searchCity === 'function') {
                    const results = searchCity(query);
                    updateCitySuggestions(results, citySuggestions, ptzCitySearch, ptzZone);
                } else {
                    citySuggestions.classList.add('hidden');
                }
            });
            
            // Masquer les suggestions au clic en dehors
            document.addEventListener('click', function(e) {
                if (e.target !== ptzCitySearch && !citySuggestions.contains(e.target)) {
                    citySuggestions.classList.add('hidden');
                }
            });
        }
        
        // Configurer les contrôles +/- pour le nombre de personnes
        const increaseHouseholdBtn = document.getElementById('increase-household');
        const decreaseHouseholdBtn = document.getElementById('decrease-household');
        const householdDescription = document.getElementById('household-description');
        
        if (increaseHouseholdBtn && decreaseHouseholdBtn && ptzHouseholdSize) {
            increaseHouseholdBtn.addEventListener('click', function() {
                let currentValue = parseInt(ptzHouseholdSize.value) || 1;
                ptzHouseholdSize.value = currentValue + 1;
                updateHouseholdDescription(currentValue + 1);
            });
            
            decreaseHouseholdBtn.addEventListener('click', function() {
                let currentValue = parseInt(ptzHouseholdSize.value) || 1;
                if (currentValue > 1) {
                    ptzHouseholdSize.value = currentValue - 1;
                    updateHouseholdDescription(currentValue - 1);
                }
            });
            
            // Mettre à jour la description initiale
            updateHouseholdDescription(parseInt(ptzHouseholdSize.value) || 1);
        }
        
        // Générer le tableau comparatif si la fonction existe
        if (typeof generatePTZComparisonTable === 'function') {
            generatePTZComparisonTable();
        }
        
        console.log("Activation du simulateur PTZ terminée avec succès");
    }
    
    /**
     * Met à jour la description du nombre de personnes
     */
    function updateHouseholdDescription(count) {
        const householdDescription = document.getElementById('household-description');
        if (householdDescription) {
            householdDescription.textContent = count === 1 ? "1 personne" : count + " personnes";
        }
    }
    
    /**
     * Met à jour la liste des suggestions de villes
     */
    function updateCitySuggestions(results, suggestionsList, cityInput, zoneSelect) {
        if (!suggestionsList) return;
        
        // Vider la liste
        suggestionsList.innerHTML = '';
        
        if (results.length > 0) {
            // Afficher la liste
            suggestionsList.classList.remove('hidden');
            
            // Ajouter chaque résultat
            results.forEach(result => {
                const item = document.createElement('div');
                item.className = 'city-suggestion';
                
                // Partie gauche (nom de ville)
                const leftPart = document.createElement('div');
                leftPart.className = 'city-suggestion-name';
                leftPart.textContent = result.city;
                
                // Partie droite (zone)
                const rightPart = document.createElement('div');
                rightPart.className = 'city-zone-tag';
                rightPart.textContent = `Zone ${result.zone}`;
                
                // Assembler
                item.appendChild(leftPart);
                item.appendChild(rightPart);
                
                // Gestionnaire de clic
                item.addEventListener('click', function() {
                    selectCity(result, cityInput, zoneSelect);
                    suggestionsList.classList.add('hidden');
                });
                
                suggestionsList.appendChild(item);
            });
        } else if (cityInput.value.trim().length > 0) {
            // Message "Aucun résultat"
            suggestionsList.classList.remove('hidden');
            suggestionsList.innerHTML = '<div class="p-3 text-gray-400 text-center italic">Aucun résultat trouvé</div>';
        } else {
            suggestionsList.classList.add('hidden');
        }
    }
    
    /**
     * Sélectionne une ville et met à jour la zone
     */
    function selectCity(result, cityInput, zoneSelect) {
        if (!cityInput || !zoneSelect) return;
        
        // Mettre à jour l'input
        cityInput.value = result.city;
        
        // Mettre à jour la zone
        let zoneValue = result.zone;
        if (result.zone === "A bis") {
            zoneValue = "A"; // Car dans le select nous avons "Zone A ou A bis"
        }
        
        // Parcourir les options du select pour trouver la correspondance
        for (let i = 0; i < zoneSelect.options.length; i++) {
            if (zoneSelect.options[i].value === zoneValue) {
                zoneSelect.selectedIndex = i;
                break;
            }
        }
        
        // Afficher un message de confirmation
        const zoneInfoElement = document.getElementById('ptz-zone-info');
        if (zoneInfoElement) {
            zoneInfoElement.textContent = `Ville trouvée: ${result.city} (Zone ${result.zone})`;
        }
    }
    
    /**
     * Fonction de secours pour afficher les résultats PTZ
     */
    function displayPTZResults(result, container) {
        if (!container) return;
        
        // Cas non éligible
        if (!result.eligible) {
            container.innerHTML = `
                <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                    <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                    <p>${result.reason}</p>
                </div>
            `;
            return;
        }
        
        // Personnalisation selon le type de projet
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
        
        // Créer le HTML des résultats
        container.innerHTML = `
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
    }
    
    // Activer le simulateur au chargement de la page
    document.addEventListener('DOMContentLoaded', function() {
        // Petit délai pour s'assurer que tous les éléments sont chargés
        setTimeout(activatePTZSimulator, 500);
        
        // Configuration de l'activation lors du clic sur l'onglet PTZ
        const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
        if (ptzTab) {
            ptzTab.addEventListener('click', function() {
                // Délai court pour laisser le DOM se mettre à jour
                setTimeout(activatePTZSimulator, 300);
            });
        }
    });
    
    // S'assurer que l'activation se fait aussi après le chargement complet
    window.addEventListener('load', function() {
        setTimeout(activatePTZSimulator, 800);
    });
    
    // Exposer la fonction d'activation globalement pour utilisation d'urgence
    window.activatePTZSimulator = activatePTZSimulator;
})();
