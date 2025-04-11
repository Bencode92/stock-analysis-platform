/**
 * budget-epargne.js - Module de gestion du budget et de l'épargne
 * Ce module gère la génération de l'interface et des calculs pour la section Budget & Épargne
 * TradePulse Finance Intelligence Platform
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser l'onglet Budget
    initBudgetPlanner();
});

/**
 * Initialise et génère le contenu de l'onglet Budget
 */
function initBudgetPlanner() {
    // Cibler l'onglet Budget
    const budgetPlanner = document.getElementById('budget-planner');
    if (!budgetPlanner) return;
    
    // Vider le contenu actuel
    budgetPlanner.innerHTML = '';
    
    // Créer le conteneur pour Budget & Épargne
    let budgetGrid = document.createElement('div');
    budgetGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6 mt-8';
    
    // Ajouter le conteneur à l'onglet Budget
    budgetPlanner.appendChild(budgetGrid);
    
    // Générer l'interface Budget & Épargne
    generateBudgetInterface(budgetGrid);
    
    // Initialiser les écouteurs d'événements
    initBudgetListeners();
    
    // Analyser le budget avec les valeurs par défaut
    setTimeout(() => {
        analyserBudget();
    }, 500);
}

/**
 * Génère l'interface utilisateur pour la section Budget & Épargne
 * @param {HTMLElement} container - Le conteneur où ajouter l'interface
 */
function generateBudgetInterface(container) {
    // Créer la première colonne - Saisie du budget
    const budgetInputCol = document.createElement('div');
    budgetInputCol.className = 'bg-blue-900 bg-opacity-20 p-6 rounded-lg';
    budgetInputCol.innerHTML = `
        <h4 class="text-xl font-semibold mb-4 flex items-center">
            <i class="fas fa-wallet text-blue-400 mr-2"></i>
            Budget Mensuel & Épargne
        </h4>
        
        <!-- Entrées de budget -->
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Loyer / Crédit immobilier
                <span class="ml-1 text-blue-400 cursor-help" title="Votre dépense mensuelle pour votre logement (loyer ou mensualité de crédit).">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-loyer" value="800" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Dépenses quotidiennes
                <span class="ml-1 text-blue-400 cursor-help" title="Vos dépenses mensuelles courantes: alimentation, transport, factures, etc.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-quotidien" value="1200" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Loisirs & Extra
                <span class="ml-1 text-blue-400 cursor-help" title="Vos dépenses non essentielles: sorties, abonnements, vacances, etc.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-extra" value="400" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Investissement mensuel
                <span class="ml-1 text-blue-400 cursor-help" title="Le montant que vous souhaitez automatiquement investir chaque mois.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-invest" value="200" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <div class="mt-4 mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Revenu mensuel estimé
                <span class="ml-1 text-blue-400 cursor-help" title="Votre revenu mensuel net après impôts.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="revenu-mensuel-input" value="3000" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <button id="simulate-budget-button" class="w-full mt-6 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-blue-500/30 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center">
            <i class="fas fa-calculator mr-2"></i> 
            Analyser mon budget
        </button>
    `;
    
    // Créer la deuxième colonne - Résultats du budget
    const budgetResultsCol = document.createElement('div');
    budgetResultsCol.className = 'bg-blue-900 bg-opacity-20 p-6 rounded-lg';
    budgetResultsCol.innerHTML = `
        <h4 class="text-xl font-semibold mb-4 flex items-center">
            <i class="fas fa-piggy-bank text-blue-400 mr-2"></i>
            Analyse du budget
        </h4>
        
        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-revenu-mensuel">3 000,00 €</p>
                <p class="text-gray-400 text-sm">Revenu mensuel</p>
            </div>
            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-depenses-totales">2 600,00 €</p>
                <p class="text-gray-400 text-sm">Dépenses totales</p>
            </div>
            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-epargne-possible">400,00 €</p>
                <p class="text-gray-400 text-sm">Épargne possible</p>
            </div>
            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-taux-epargne">13,3%</p>
                <p class="text-gray-400 text-sm">Taux d'épargne</p>
            </div>
        </div>
        
        <div class="chart-container mb-6">
            <canvas id="budget-chart"></canvas>
        </div>
        
        <div id="budget-advice" class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-blue-400">
            <h5 class="text-blue-400 font-medium flex items-center mb-2">
                <i class="fas fa-lightbulb mr-2"></i>
                Conseils budgétaires
            </h5>
            <div class="advice-score bg-blue-900 bg-opacity-20 text-blue-400 inline-block px-2 py-1 rounded text-sm font-medium mb-2">
                Évaluation: 3/5
            </div>
            <ul class="advice-list text-sm text-gray-300 space-y-1 pl-4">
                <li>Un taux d'épargne optimal se situe généralement entre 15% et 25% de vos revenus.</li>
                <li>Vos dépenses de logement représentent environ 30% de votre budget, ce qui est raisonnable.</li>
                <li>Envisagez d'automatiser votre épargne pour atteindre plus facilement vos objectifs.</li>
            </ul>
        </div>
    `;
    
    // Ajouter les deux colonnes au conteneur
    container.appendChild(budgetInputCol);
    container.appendChild(budgetResultsCol);
    
    // Initialiser le graphique du budget
    initBudgetChart();
}

/**
 * Initialise le graphique du budget
 */
function initBudgetChart() {
    const ctx = document.getElementById('budget-chart');
    if (!ctx) return;
    
    const data = {
        labels: ['Loyer', 'Quotidien', 'Extra', 'Investissement', 'Épargne'],
        datasets: [{
            data: [800, 1200, 400, 200, 400],
            backgroundColor: [
                'rgba(255, 99, 132, 0.7)',
                'rgba(54, 162, 235, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)'
            ],
            borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)'
            ],
            borderWidth: 1
        }]
    };
    
    window.budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR' 
                            }).format(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Initialise les écouteurs d'événements pour le module budget
 */
function initBudgetListeners() {
    // Ajouter un écouteur au bouton d'analyse du budget
    const budgetButton = document.getElementById('simulate-budget-button');
    if (budgetButton) {
        budgetButton.addEventListener('click', analyserBudget);
    }
    
    // Ajouter des écouteurs aux champs de saisie du budget
    const budgetInputs = [
        document.getElementById('simulation-budget-loyer'),
        document.getElementById('simulation-budget-quotidien'),
        document.getElementById('simulation-budget-extra'),
        document.getElementById('simulation-budget-invest'),
        document.getElementById('revenu-mensuel-input')
    ];
    
    budgetInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', function() {
                analyserBudget();
            });
        }
    });
}

/**
 * Analyse le budget et met à jour les résultats
 */
function analyserBudget() {
    // Récupérer les valeurs du budget
    const loyer = parseFloat(document.getElementById('simulation-budget-loyer').value) || 0;
    const quotidien = parseFloat(document.getElementById('simulation-budget-quotidien').value) || 0;
    const extra = parseFloat(document.getElementById('simulation-budget-extra').value) || 0;
    const investAuto = parseFloat(document.getElementById('simulation-budget-invest').value) || 0;
    
    // Récupérer le revenu mensuel saisi par l'utilisateur
    const revenuMensuel = parseFloat(document.getElementById('revenu-mensuel-input').value) || 3000;
    
    // Calculer les totaux du budget
    const depensesTotales = loyer + quotidien + extra + investAuto;
    const epargnePossible = Math.max(0, revenuMensuel - depensesTotales);
    const tauxEpargne = revenuMensuel > 0 ? (epargnePossible / revenuMensuel) * 100 : 0;
    
    // Formater les valeurs monétaires
    const formatter = new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR',
        maximumFractionDigits: 2
    });
    
    // Mettre à jour l'affichage du budget
    document.getElementById('simulation-revenu-mensuel').textContent = formatter.format(revenuMensuel);
    document.getElementById('simulation-depenses-totales').textContent = formatter.format(depensesTotales);
    document.getElementById('simulation-epargne-possible').textContent = formatter.format(epargnePossible);
    document.getElementById('simulation-taux-epargne').textContent = tauxEpargne.toFixed(1) + '%';
    
    // Mettre à jour le graphique
    updateBudgetChart(loyer, quotidien, extra, investAuto, epargnePossible);
    
    // Mise à jour des conseils budgétaires
    updateBudgetAdvice(loyer, quotidien, extra, investAuto, revenuMensuel, tauxEpargne);
}

/**
 * Met à jour le graphique du budget
 */
function updateBudgetChart(loyer, quotidien, extra, investAuto, epargne) {
    if (!window.budgetChart) return;
    
    window.budgetChart.data.datasets[0].data = [loyer, quotidien, extra, investAuto, epargne];
    window.budgetChart.update();
}

/**
 * Met à jour les conseils budgétaires en fonction des données
 */
function updateBudgetAdvice(loyer, quotidien, extra, investAuto, revenuMensuel, tauxEpargne) {
    const adviceElement = document.getElementById('budget-advice');
    const adviceList = document.querySelector('#budget-advice .advice-list');
    const adviceScore = document.querySelector('#budget-advice .advice-score');
    
    if (!adviceElement || !adviceList || !adviceScore) return;
    
    // Calculer un score d'adéquation budgétaire
    let score = 3; // Score de base moyen
    const conseils = [];
    
    // Évaluer le taux d'épargne
    if (tauxEpargne < 5) {
        score--;
        conseils.push("Votre taux d'épargne est faible. Essayez de réduire certaines dépenses non essentielles.");
    } else if (tauxEpargne >= 20) {
        score++;
        conseils.push("Excellent taux d'épargne! Vous êtes sur la bonne voie pour atteindre vos objectifs financiers.");
    } else {
        conseils.push("Un taux d'épargne optimal se situe généralement entre 15% et 25% de vos revenus.");
    }
    
    // Évaluer la part du logement
    const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
    if (ratioLogement > 33) {
        score--;
        conseils.push("Vos dépenses de logement dépassent 33% de vos revenus, ce qui peut limiter votre capacité d'épargne.");
    } else if (ratioLogement <= 25) {
        score++;
        conseils.push("Vos dépenses de logement sont bien maîtrisées (moins de 25% de vos revenus).");
    } else {
        conseils.push(`Vos dépenses de logement représentent environ ${Math.round(ratioLogement)}% de votre budget, ce qui est raisonnable.`);
    }
    
    // Conseil sur l'investissement automatique
    if (investAuto > 0) {
        const ratioInvest = (investAuto / revenuMensuel) * 100;
        conseils.push(`Vous investissez automatiquement ${Math.round(ratioInvest)}% de vos revenus, ce qui est une excellente habitude.`);
    } else {
        conseils.push("Envisagez d'automatiser votre épargne pour atteindre plus facilement vos objectifs.");
    }
    
    // Limiter le score entre 1 et 5
    score = Math.max(1, Math.min(5, score));
    
    // Mettre à jour le score
    adviceScore.textContent = `Évaluation: ${score}/5`;
    
    // Mettre à jour la liste des conseils
    adviceList.innerHTML = conseils.map(conseil => `<li>${conseil}</li>`).join('');
    
    // Ajuster la couleur du score selon l'évaluation
    adviceScore.className = 'advice-score inline-block px-2 py-1 rounded text-sm font-medium mb-2';
    if (score >= 4) {
        adviceScore.classList.add('bg-green-900', 'bg-opacity-20', 'text-green-400');
    } else if (score <= 2) {
        adviceScore.classList.add('bg-red-900', 'bg-opacity-20', 'text-red-400');
    } else {
        adviceScore.classList.add('bg-blue-900', 'bg-opacity-20', 'text-blue-400');
    }
}