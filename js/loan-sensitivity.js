// loan-sensitivity.js
// Module complémentaire pour le simulateur de prêt - Analyse de sensibilité taux vs capital

(function() {
    // Référence au document pour éviter des erreurs avec "use strict"
    const doc = document;
    
    // Fonction qui calcule les équivalences entre baisse de taux et remboursement anticipé
    function calculerCapitalEquivalent(simulateur, tauxBaisseList, moisRenegociation = 1) {
        // Calcul du scénario de base
        const resultBase = simulateur.tableauAmortissement({});
        const economieBase = resultBase.totalInterets;
        
        // Pour chaque baisse de taux demandée
        const equivalents = [];
        for (const baisse of tauxBaisseList) {
            // Calculer le nouveau taux après baisse
            const tauxActuel = simulateur.tauxMensuel * 12 * 100;
            const nouveauTaux = Math.max(0.1, tauxActuel - baisse); // Minimum 0.1%
            
            // Simuler avec la baisse de taux
            const resultBaisse = simulateur.tableauAmortissement({ 
                nouveauTaux: nouveauTaux, 
                moisRenegociation: moisRenegociation,
                appliquerRenegociation: true
            });
            
            // Calculer l'économie réalisée
            const economieInterets = economieBase - resultBaisse.totalInterets;
            
            // Recherche optimisée du capital équivalent (par dichotomie)
            let min = 1000;
            let max = simulateur.capital;
            let capitalEquiv = 0;
            let economieCap = 0;
            
            // Si l'économie est négative ou nulle, pas besoin de chercher
            if (economieInterets <= 0) {
                equivalents.push({
                    baisseTaux: baisse,
                    economieInterets: economieInterets,
                    capitalEquivalent: 0,
                    pourcentageCapital: 0
                });
                continue;
            }
            
            // Recherche par dichotomie pour plus d'efficacité
            while (max - min > 1000) {
                const mid = Math.floor((min + max) / 2);
                
                const resultCap = simulateur.tableauAmortissement({
                    remboursementsAnticipes: [{ 
                        mois: moisRenegociation, 
                        montant: mid,
                        mode: 'duree' // Mode réduction de durée pour comparaison équitable
                    }]
                });
                
                economieCap = economieBase - resultCap.totalInterets;
                
                if (economieCap < economieInterets) {
                    min = mid;
                } else {
                    max = mid;
                    capitalEquiv = mid;
                }
            }
            
            // Affiner le résultat avec une recherche linéaire sur un intervalle plus petit
            for (let cap = min; cap <= max; cap += 500) {
                const resultCap = simulateur.tableauAmortissement({
                    remboursementsAnticipes: [{ 
                        mois: moisRenegociation, 
                        montant: cap,
                        mode: 'duree'
                    }]
                });
                
                economieCap = economieBase - resultCap.totalInterets;
                if (economieCap >= economieInterets) {
                    capitalEquiv = cap;
                    break;
                }
            }
            
            // Calculer le pourcentage du capital total
            const pourcentageCapital = (capitalEquiv / simulateur.capital) * 100;
            
            equivalents.push({
                baisseTaux: baisse,
                economieInterets: economieInterets,
                capitalEquivalent: capitalEquiv,
                pourcentageCapital: pourcentageCapital
            });
        }
        
        return equivalents;
    }
    
    // Fonction pour afficher le tableau de sensibilité
    function afficherTableauSensibilite(data, formatMontant) {
        // D'abord vérifier si le conteneur existe, sinon le créer
        let sensibilityContainer = doc.getElementById('sensitivity-container');
        if (!sensibilityContainer) {
            // Trouver où insérer le tableau (après le graphique)
            const chartContainer = doc.querySelector('.chart-container');
            if (!chartContainer) return;
            
            // Créer le conteneur
            sensibilityContainer = doc.createElement('div');
            sensibilityContainer.id = 'sensitivity-container';
            sensibilityContainer.className = 'mt-6 bg-blue-900 bg-opacity-20 p-4 rounded-lg';
            chartContainer.after(sensibilityContainer);
            
            // Ajouter le titre et la description
            const title = doc.createElement('h5');
            title.className = 'text-lg font-semibold mb-3 flex items-center';
            title.innerHTML = '<i class="fas fa-exchange-alt text-green-400 mr-2"></i> Équivalence baisse de taux vs remboursement anticipé';
            
            const description = doc.createElement('p');
            description.className = 'text-sm text-gray-300 mb-4';
            description.textContent = 'Ce tableau montre, pour différentes baisses de taux, le montant de capital qu\'il faudrait rembourser par anticipation pour obtenir la même économie d\'intérêts.';
            
            // Créer la structure du tableau
            const tableContainer = doc.createElement('div');
            tableContainer.className = 'overflow-auto max-h-60 bg-blue-800 bg-opacity-20 rounded-lg';
            
            const table = doc.createElement('table');
            table.className = 'min-w-full text-sm';
            
            const thead = doc.createElement('thead');
            thead.className = 'bg-blue-900 bg-opacity-50 sticky top-0';
            thead.innerHTML = `
                <tr>
                    <th class="px-3 py-2 text-left">Baisse de taux</th>
                    <th class="px-3 py-2 text-right">Économie d'intérêts</th>
                    <th class="px-3 py-2 text-right">Capital équivalent</th>
                    <th class="px-3 py-2 text-right">% du capital initial</th>
                </tr>
            `;
            
            const tbody = doc.createElement('tbody');
            tbody.id = 'sensitivity-table-body';
            
            // Assembler le tableau
            table.appendChild(thead);
            table.appendChild(tbody);
            tableContainer.appendChild(table);
            
            // Assembler le conteneur
            sensibilityContainer.appendChild(title);
            sensibilityContainer.appendChild(description);
            sensibilityContainer.appendChild(tableContainer);
        }
        
        // Remplir le tableau avec les données
        const tbody = doc.getElementById('sensitivity-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        data.forEach((row, index) => {
            const tr = doc.createElement('tr');
            tr.className = index % 2 === 0 ? 'bg-blue-800 bg-opacity-10' : 'bg-blue-900 bg-opacity-10';
            
            tr.innerHTML = `
                <td class="px-3 py-2 text-left">${row.baisseTaux.toFixed(2)}%</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.economieInterets)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capitalEquivalent)}</td>
                <td class="px-3 py-2 text-right">${row.pourcentageCapital.toFixed(1)}%</td>
            `;
            
            tbody.appendChild(tr);
        });
    }
    
    // Attendre que le document soit chargé
    document.addEventListener('DOMContentLoaded', function() {
        // Attendre un court instant pour s'assurer que le simulateur principal est chargé
        setTimeout(function() {
            // Chercher le bouton de calcul et lui ajouter un écouteur d'événements
            const calculateLoanButton = document.getElementById('calculate-loan-button');
            
            if (calculateLoanButton) {
                // Sauvegarder la fonction de clic d'origine
                const originalClickHandler = calculateLoanButton.onclick;
                
                // Redéfinir la fonction de clic
                calculateLoanButton.onclick = function(event) {
                    // Appeler d'abord la fonction d'origine si elle existe
                    if (typeof originalClickHandler === 'function') {
                        originalClickHandler.call(this, event);
                    }
                    
                    // Ensuite, ajouter notre fonctionnalité
                    try {
                        // Récupérer les valeurs nécessaires du formulaire
                        const loanAmount = parseFloat(document.getElementById('loan-amount').value);
                        const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
                        const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
                        const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
                        const moisRenegociation = parseInt(document.getElementById('renegotiation-month-slider').value);
                        
                        // Créer une instance du simulateur
                        const simulator = new LoanSimulator({
                            capital: loanAmount,
                            tauxAnnuel: interestRate,
                            dureeMois: loanDurationYears * 12,
                            assuranceAnnuelle: insuranceRate
                        });
                        
                        // Calculer les sensibilités
                        const tauxBaisseList = [0.25, 0.5, 0.75, 1.0];
                        const sensitivite = calculerCapitalEquivalent(simulator, tauxBaisseList, moisRenegociation);
                        
                        // Afficher le tableau
                        afficherTableauSensibilite(sensitivite, window.formatMontant || formatMontant);
                        
                    } catch (error) {
                        console.error("Erreur lors du calcul de sensibilité:", error);
                    }
                    
                    // Ne pas bloquer la propagation de l'événement
                    return true;
                };
            }
        }, 1000); // Attendre 1 seconde pour s'assurer que tout est chargé
    });
    
    // Fonction formatMontant de secours au cas où celle du script principal n'est pas accessible
    function formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
    }
})();