/**
 * budget-epargne.js - Module de gestion du budget et de l'épargne
 * Ce module gère la génération de l'interface et des calculs pour la section Budget & Épargne
 * TradePulse Finance Intelligence Platform
 * 
 * MODIFIÉ: Loyer inclus dans "Vie courante" + Graphique à 5 catégories
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
        
        <!-- Mode d'affichage -->
        <div class="mb-4 flex items-center justify-end">
            <span class="text-xs text-gray-400 mr-2">Mode d'affichage:</span>
            <div class="flex items-center bg-blue-800 bg-opacity-30 rounded-md overflow-hidden">
                <button id="view-detailed" class="py-1 px-3 text-xs font-medium text-blue-400 bg-blue-900 bg-opacity-30 selected">Détaillé</button>
                <button id="view-simple" class="py-1 px-3 text-xs font-medium text-gray-300">Simplifié</button>
            </div>
        </div>
        
        <!-- Vue détaillée - Dépenses vie courante (INCLUT LE LOYER) -->
        <div id="detailed-view-courante" class="mb-6">
            <h5 class="text-sm font-medium text-blue-400 mb-3 flex items-center">
                <i class="fas fa-shopping-basket mr-2"></i>
                Dépenses de la vie courante
            </h5>
            
            <div class="space-y-3 bg-blue-800 bg-opacity-20 p-3 rounded-lg">
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Loyer / Crédit immobilier</label>
                    <input type="number" id="simulation-budget-loyer" value="800" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Alimentation (courses)</label>
                    <input type="number" id="depense-alimentation" value="400" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Transports (essence, métro...)</label>
                    <input type="number" id="depense-transport" value="150" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Factures (électricité, eau...)</label>
                    <input type="number" id="depense-factures" value="150" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Abonnements fixes (téléphone, Internet...)</label>
                    <input type="number" id="depense-abonnements" value="100" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div class="pt-2 border-t border-blue-700 flex justify-between items-center">
                    <span class="text-xs text-gray-300">Total vie courante:</span>
                    <span id="total-vie-courante" class="text-sm font-medium text-blue-400">1600 €</span>
                </div>
            </div>
        </div>
        
        <!-- Vue détaillée - Loisirs & plaisirs -->
        <div id="detailed-view-loisirs" class="mb-6">
            <h5 class="text-sm font-medium text-blue-400 mb-3 flex items-center">
                <i class="fas fa-glass-cheers mr-2"></i>
                Loisirs & plaisirs
            </h5>
            
            <div class="space-y-3 bg-blue-800 bg-opacity-20 p-3 rounded-lg">
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Restaurants & cafés</label>
                    <input type="number" id="depense-restaurants" value="120" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Shopping & achats plaisir</label>
                    <input type="number" id="depense-shopping" value="100" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Abonnements loisirs (Netflix, Spotify...)</label>
                    <input type="number" id="depense-abos-loisirs" value="30" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Voyages & week-ends</label>
                    <input type="number" id="depense-voyages" value="150" min="0" class="bg-blue-900 bg-opacity-50 border border-blue-700 text-white rounded-lg p-2 w-full text-sm">
                </div>
                <div class="pt-2 border-t border-blue-700 flex justify-between items-center">
                    <span class="text-xs text-gray-300">Total loisirs:</span>
                    <span id="total-loisirs" class="text-sm font-medium text-blue-400">400 €</span>
                </div>
            </div>
        </div>
        
        <!-- Vue simplifiée -->
        <div id="simple-view" style="display: none;" class="mb-6">
            <div class="mb-4">
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Vie courante : loyer, alimentation, transports, factures...
                    <span class="ml-1 text-blue-400 cursor-help" title="Exemples : loyer/crédit, courses, électricité, essence, carte de métro, forfait téléphonique, etc.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <input type="number" id="simulation-budget-quotidien" value="1600" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
            </div>
            
            <div class="mb-4">
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Plaisirs & sorties : restaus, shopping, voyages...
                    <span class="ml-1 text-blue-400 cursor-help" title="Exemples : ciné, resto, bar, week-end, shopping, Netflix, Spotify, etc.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <input type="number" id="simulation-budget-extra" value="400" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
            </div>
        </div>
        
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Épargne ou investissement automatique
                <span class="ml-1 text-blue-400 cursor-help" title="Exemples : Livret A, PEL, virement programmé sur un PEA, assurance-vie, etc.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-invest" value="200" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <!-- NOUVELLE SECTION: Dépenses détaillées personnalisables -->
        <div class="mt-6">
            <div class="flex items-center justify-between mb-3">
                <label class="text-sm font-medium text-gray-300 flex items-center">
                    <i class="fas fa-receipt text-blue-400 mr-2"></i>
                    Dépenses variables (optionnel)
                    <span class="ml-1 text-blue-400 cursor-help" title="Ajoutez vos dépenses récurrentes spécifiques pour un budget plus précis">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <span class="text-xs text-blue-400 depense-total">(Total: 0 €)</span>
            </div>
            <div id="depenses-detaillees" class="space-y-3 mt-2">
                <!-- Les lignes de dépenses s'ajouteront ici dynamiquement -->
            </div>
            <button id="ajouter-depense" class="mt-3 py-2 px-3 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-md flex items-center transition-colors">
                <i class="fas fa-plus-circle mr-2"></i> Ajouter une dépense variable
            </button>
        </div>
        
        <!-- NOUVELLE SECTION: Objectif d'épargne -->
        <div class="mt-5 p-3 bg-blue-800 bg-opacity-30 rounded-lg">
            <label class="flex items-center text-sm font-medium text-gray-300 mb-2">
                <i class="fas fa-bullseye text-blue-400 mr-2"></i>
                Objectif d'épargne
                <span class="ml-1 text-blue-400 cursor-help" title="Définissez un montant cible à atteindre grâce à votre épargne mensuelle">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <input type="number" id="objectif-epargne" placeholder="Ex: 5000" value="5000" min="0" class="bg-blue-900 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full text-sm">
                    <p class="text-xs text-gray-400 mt-1">Montant cible (€)</p>
                </div>
                <div>
                    <select id="objectif-type" class="bg-blue-900 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full text-sm">
                        <option value="vacances">Vacances</option>
                        <option value="achat">Gros achat</option>
                        <option value="urgence">Fond d'urgence</option>
                        <option value="apport">Apport immobilier</option>
                        <option value="autre">Autre projet</option>
                    </select>
                    <p class="text-xs text-gray-400 mt-1">Type d'objectif</p>
                </div>
            </div>
            <div id="temps-objectif" class="mt-3 text-center p-2 bg-blue-900 bg-opacity-20 rounded text-sm hidden">
                <!-- Temps nécessaire pour atteindre l'objectif -->
            </div>
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
        
        <!-- Bouton d'export PDF -->
        <button id="export-budget-pdf" class="w-full mt-3 py-2 px-4 bg-transparent border border-blue-500 text-blue-400 font-medium rounded-lg hover:bg-blue-900 hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center">
            <i class="fas fa-file-export mr-2"></i> 
            Exporter en PDF
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
        
        <!-- Score global du budget -->
        <div class="mb-5 bg-blue-800 bg-opacity-30 p-3 rounded-lg flex items-center">
            <div class="w-16 h-16 rounded-full bg-blue-900 bg-opacity-50 flex items-center justify-center mr-4 budget-score-circle">
                <span id="budget-score" class="text-2xl font-bold text-blue-400">3</span>
            </div>
            <div>
                <h5 class="font-medium text-white">Score budget</h5>
                <p class="text-sm text-gray-300" id="budget-score-description">Budget équilibré</p>
                <div class="w-full bg-blue-900 h-2 rounded-full mt-1 overflow-hidden">
                    <div id="budget-score-bar" class="h-full bg-blue-400" style="width: 60%"></div>
                </div>
            </div>
        </div>
        
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
        
        <!-- Nouveau: Graphique d'évolution sur 12 mois -->
        <div class="chart-container mb-6">
            <h5 class="text-sm font-medium text-blue-400 mb-3 flex items-center">
                <i class="fas fa-chart-line mr-2"></i>
                Projection d'épargne sur 12 mois
            </h5>
            <canvas id="evolution-chart"></canvas>
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
        
        <!-- Résumé final avec recommandations d'investissement -->
        <div id="budget-summary" class="mt-5 bg-green-900 bg-opacity-10 p-4 rounded-lg border-l-4 border-green-400">
            <h5 class="text-green-400 font-medium flex items-center mb-3">
                <i class="fas fa-check-double mr-2"></i>
                Recommandations personnalisées
            </h5>
            <div id="budget-recommendations" class="text-sm text-gray-300">
                <!-- Généré dynamiquement -->
            </div>
        </div>
    `;
    
    // Ajouter les deux colonnes au conteneur
    container.appendChild(budgetInputCol);
    container.appendChild(budgetResultsCol);
    
    // Initialiser les graphiques
    initBudgetChart();
    initEvolutionChart();
    
    // Ajouter une première dépense détaillée par défaut pour l'exemple
    addDetailedExpense('Café', 2.5, 20);

    // Mettre à jour les totaux initiaux
    updateTotalVieCourante();
    updateTotalLoisirs();
}

/**
 * ✅ MODIFIÉ: Met à jour le total des dépenses vie courante (INCLUT LE LOYER)
 */
function updateTotalVieCourante() {
    const loyer = parseFloat(document.getElementById('simulation-budget-loyer').value) || 0;
    const alimentation = parseFloat(document.getElementById('depense-alimentation').value) || 0;
    const transport = parseFloat(document.getElementById('depense-transport').value) || 0;
    const factures = parseFloat(document.getElementById('depense-factures').value) || 0;
    const abonnements = parseFloat(document.getElementById('depense-abonnements').value) || 0;
    
    const total = loyer + alimentation + transport + factures + abonnements;
    
    // Mettre à jour l'affichage
    const totalElement = document.getElementById('total-vie-courante');
    if (totalElement) {
        totalElement.textContent = `${total.toLocaleString('fr-FR')} €`;
    }
    
    // Mettre à jour le champ simplifié
    const champSimplifie = document.getElementById('simulation-budget-quotidien');
    if (champSimplifie) {
        champSimplifie.value = total;
    }
    
    return total;
}

/**
 * Met à jour le total des dépenses loisirs
 */
function updateTotalLoisirs() {
    const restaurants = parseFloat(document.getElementById('depense-restaurants').value) || 0;
    const shopping = parseFloat(document.getElementById('depense-shopping').value) || 0;
    const abosLoisirs = parseFloat(document.getElementById('depense-abos-loisirs').value) || 0;
    const voyages = parseFloat(document.getElementById('depense-voyages').value) || 0;
    
    const total = restaurants + shopping + abosLoisirs + voyages;
    
    // Mettre à jour l'affichage
    const totalElement = document.getElementById('total-loisirs');
    if (totalElement) {
        totalElement.textContent = `${total.toLocaleString('fr-FR')} €`;
    }
    
    // Mettre à jour le champ simplifié
    const champSimplifie = document.getElementById('simulation-budget-extra');
    if (champSimplifie) {
        champSimplifie.value = total;
    }
    
    return total;
}

/**
 * Ajoute une nouvelle ligne de dépense détaillée
 * @param {string} nom - Nom de la dépense (optionnel)
 * @param {number} prix - Prix unitaire (optionnel)
 * @param {number} quantite - Nombre d'unités (optionnel)
 */
function addDetailedExpense(nom = '', prix = '', quantite = '') {
    const container = document.getElementById('depenses-detaillees');
    const index = container.children.length;
    const line = document.createElement('div');
    line.className = "grid grid-cols-7 gap-2 items-center depense-ligne";
    
    line.innerHTML = `
        <input type="text" placeholder="Nom" value="${nom}" class="depense-nom col-span-3 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <input type="number" placeholder="Prix" value="${prix}" class="depense-prix col-span-1 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <span class="text-center text-gray-400">×</span>
        <input type="number" placeholder="Qté" value="${quantite}" class="depense-qte col-span-1 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <button class="depense-supprimer p-1 text-red-400 hover:bg-red-900 hover:bg-opacity-20 rounded transition-colors">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(line);
    
    // Ajouter les écouteurs d'événements à la nouvelle ligne
    const inputs = line.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('change', function() {
            updateDetailedExpensesTotal();
            analyserBudget();
        });
    });
    
    // Écouteur pour le bouton de suppression
    const deleteBtn = line.querySelector('.depense-supprimer');
    deleteBtn.addEventListener('click', function() {
        line.remove();
        updateDetailedExpensesTotal();
        analyserBudget();
    });
    
    // Mettre à jour le total
    updateDetailedExpensesTotal();
}

/**
 * Met à jour le total des dépenses détaillées
 */
function updateDetailedExpensesTotal() {
    let total = 0;
    const lignes = document.querySelectorAll('.depense-ligne');
    
    lignes.forEach(ligne => {
        const prix = parseFloat(ligne.querySelector('.depense-prix').value) || 0;
        const quantite = parseInt(ligne.querySelector('.depense-qte').value) || 0;
        total += prix * quantite;
    });
    
    // Mettre à jour l'affichage du total
    const totalElement = document.querySelector('.depense-total');
    if (totalElement) {
        totalElement.textContent = `(Total: ${total.toLocaleString('fr-FR')} €)`;
    }
    
    return total;
}

/**
 * ✅ MODIFIÉ: Initialise le graphique du budget (5 catégories au lieu de 6)
 */
function initBudgetChart() {
    const ctx = document.getElementById('budget-chart');
    if (!ctx) return;
    
    const data = {
        labels: ['Vie courante', 'Loisirs', 'Épargne auto', 'Dépenses variables', 'Épargne possible'],
        datasets: [{
            data: [1600, 400, 200, 0, 400], // 1600 = loyer + vie courante
            backgroundColor: [
                'rgba(54, 162, 235, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)',
                'rgba(255, 159, 64, 0.7)'
            ],
            borderColor: [
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)'
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
 * Initialise le graphique d'évolution sur 12 mois
 */
function initEvolutionChart() {
    const ctx = document.getElementById('evolution-chart');
    if (!ctx) return;
    
    const labels = Array.from({ length: 12 }, (_, i) => `Mois ${i + 1}`);
    const dataPoints = labels.map((_, i) => (i + 1) * 400); // Basé sur une épargne de 400€/mois
    
    window.evolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Épargne cumulée',
                data: dataPoints,
                borderColor: 'rgb(59, 130, 246)',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.2)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR',
                                maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
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
 * ✅ MODIFIÉ: Initialise les écouteurs d'événements (loyer inclus dans vie courante)
 */
function initBudgetListeners() {
    // Ajouter un écouteur au bouton d'analyse du budget
    const budgetButton = document.getElementById('simulate-budget-button');
    if (budgetButton) {
        budgetButton.addEventListener('click', analyserBudget);
    }
    
    // ✅ MODIFIÉ: Ajouter des écouteurs aux champs de saisie du budget détaillé (AVEC LOYER)
    const vieCoursInputs = [
        document.getElementById('simulation-budget-loyer'), // ← ajouté
        document.getElementById('depense-alimentation'),
        document.getElementById('depense-transport'),
        document.getElementById('depense-factures'),
        document.getElementById('depense-abonnements')
    ];
    
    vieCoursInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', function() {
                updateTotalVieCourante();
                analyserBudget();
            });
        }
    });
    
    // Ajouter des écouteurs aux champs de saisie des loisirs détaillés
    const loisirsInputs = [
        document.getElementById('depense-restaurants'),
        document.getElementById('depense-shopping'),
        document.getElementById('depense-abos-loisirs'),
        document.getElementById('depense-voyages')
    ];
    
    loisirsInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', function() {
                updateTotalLoisirs();
                analyserBudget();
            });
        }
    });
    
    // Ajouter des écouteurs aux champs simples
    const simpleInputs = [
        document.getElementById('simulation-budget-quotidien'),
        document.getElementById('simulation-budget-extra'),
        document.getElementById('simulation-budget-invest'),
        document.getElementById('revenu-mensuel-input'),
        document.getElementById('objectif-epargne'),
        document.getElementById('objectif-type')
    ];
    
    simpleInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', function() {
                analyserBudget();
            });
        }
    });
    
    // Écouteurs pour les boutons de vue
    const viewDetailed = document.getElementById('view-detailed');
    const viewSimple = document.getElementById('view-simple');
    const detailedViewCourante = document.getElementById('detailed-view-courante');
    const detailedViewLoisirs = document.getElementById('detailed-view-loisirs');
    const simpleView = document.getElementById('simple-view');
    
    if (viewDetailed && viewSimple && detailedViewCourante && detailedViewLoisirs && simpleView) {
        viewDetailed.addEventListener('click', function() {
            viewDetailed.classList.add('selected');
            viewDetailed.classList.add('text-blue-400');
            viewDetailed.classList.add('bg-blue-900');
            viewDetailed.classList.add('bg-opacity-30');
            viewSimple.classList.remove('selected');
            viewSimple.classList.remove('text-blue-400');
            viewSimple.classList.remove('bg-blue-900');
            viewSimple.classList.remove('bg-opacity-30');
            
            detailedViewCourante.style.display = 'block';
            detailedViewLoisirs.style.display = 'block';
            simpleView.style.display = 'none';
            
            // Synchronisation des totaux
            updateTotalVieCourante();
            updateTotalLoisirs();
        });
        
        viewSimple.addEventListener('click', function() {
            viewSimple.classList.add('selected');
            viewSimple.classList.add('text-blue-400');
            viewSimple.classList.add('bg-blue-900');
            viewSimple.classList.add('bg-opacity-30');
            viewDetailed.classList.remove('selected');
            viewDetailed.classList.remove('text-blue-400');
            viewDetailed.classList.remove('bg-blue-900');
            viewDetailed.classList.remove('bg-opacity-30');
            
            detailedViewCourante.style.display = 'none';
            detailedViewLoisirs.style.display = 'none';
            simpleView.style.display = 'block';
        });
    }
    
    // Ajouter un écouteur spécial pour le revenu mensuel pour ajuster les valeurs suggérées
    const revenuInput = document.getElementById('revenu-mensuel-input');
    if (revenuInput) {
        revenuInput.addEventListener('change', function() {
            ajusterValeursParDefaut(parseFloat(this.value) || 3000);
        });
    }
    
    // Écouteur pour le bouton d'ajout de dépense
    const addButton = document.getElementById('ajouter-depense');
    if (addButton) {
        addButton.addEventListener('click', function() {
            addDetailedExpense();
        });
    }
    
    // Écouteur pour le bouton d'export PDF
    const exportButton = document.getElementById('export-budget-pdf');
    if (exportButton) {
        exportButton.addEventListener('click', exportBudgetToPDF);
    }
}

/**
 * Ajuste les valeurs par défaut en fonction du revenu
 * @param {number} revenu - Le revenu mensuel
 */
function ajusterValeursParDefaut(revenu) {
    // Ne rien faire si le revenu est inférieur à 500€
    if (revenu < 500) return;
    
    // Calculer des fourchettes raisonnables basées sur le revenu
    const loyerSuggere = Math.round(revenu * 0.3); // ~30% du revenu pour le logement
    
    // Dépenses vie courante
    const alimentationSuggeree = Math.round(revenu * 0.15); // ~15% pour l'alimentation
    const transportSuggere = Math.round(revenu * 0.08); // ~8% pour les transports
    const facturesSuggerees = Math.round(revenu * 0.07); // ~7% pour les factures
    const abonnementsSuggeres = Math.round(revenu * 0.05); // ~5% pour les abonnements fixes
    
    // Dépenses loisirs
    const restaurantsSuggeres = Math.round(revenu * 0.04); // ~4% pour les restaurants
    const shoppingSuggere = Math.round(revenu * 0.03); // ~3% pour le shopping
    const abosLoisirsSuggeres = Math.round(revenu * 0.01); // ~1% pour les abonnements loisirs
    const voyagesSuggeres = Math.round(revenu * 0.05); // ~5% pour les voyages
    
    // Épargne
    const investSuggere = Math.round(revenu * 0.1); // ~10% pour l'épargne/investissement
    
    // Mettre à jour les champs vie courante
    document.getElementById('depense-alimentation').value = alimentationSuggeree;
    document.getElementById('depense-transport').value = transportSuggere;
    document.getElementById('depense-factures').value = facturesSuggerees;
    document.getElementById('depense-abonnements').value = abonnementsSuggeres;
    
    // Mettre à jour les champs loisirs
    document.getElementById('depense-restaurants').value = restaurantsSuggeres;
    document.getElementById('depense-shopping').value = shoppingSuggere;
    document.getElementById('depense-abos-loisirs').value = abosLoisirsSuggeres;
    document.getElementById('depense-voyages').value = voyagesSuggeres;
    
    // Mettre à jour les autres champs
    document.getElementById('simulation-budget-loyer').value = loyerSuggere;
    document.getElementById('simulation-budget-invest').value = investSuggere;
    
    // Mettre à jour les totaux
    updateTotalVieCourante();
    updateTotalLoisirs();
    
    // Analyser le budget avec les nouvelles valeurs
    analyserBudget();
}

/**
 * Exporte le budget en PDF
 */
function exportBudgetToPDF() {
    // Ici, nous pourrions utiliser html2pdf.js ou jsPDF
    // Pour cette démo, nous affichons juste une alerte
    alert('Fonctionnalité d\'export PDF disponible prochainement');
    
    // Si html2pdf était importé:
    /*
    const element = document.querySelector('.content-wrapper');
    const opt = {
        margin: 1,
        filename: 'TradePulse-Budget.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
    */
}

/**
 * ✅ MODIFIÉ: Analyse le budget et met à jour les résultats (pas de double comptage du loyer)
 */
function analyserBudget() {
    // Récupérer les valeurs du budget
    const loyer = parseFloat(document.getElementById('simulation-budget-loyer').value) || 0;
    let quotidien, extra;
    
    // Vérifier le mode d'affichage actif
    const isDetailed = document.getElementById('detailed-view-courante').style.display !== 'none';
    
    if (isDetailed) {
        // En mode détaillé, utiliser les totaux calculés
        quotidien = updateTotalVieCourante();
        extra = updateTotalLoisirs();
    } else {
        // En mode simplifié, utiliser les valeurs directes
        quotidien = parseFloat(document.getElementById('simulation-budget-quotidien').value) || 0;
        extra = parseFloat(document.getElementById('simulation-budget-extra').value) || 0;
    }
    
    const investAuto = parseFloat(document.getElementById('simulation-budget-invest').value) || 0;
    
    // Récupérer le total des dépenses détaillées
    const totalDepensesVariables = updateDetailedExpensesTotal();
    
    // Récupérer le revenu mensuel saisi par l'utilisateur
    const revenuMensuel = parseFloat(document.getElementById('revenu-mensuel-input').value) || 3000;
    
    // ✅ MODIFIÉ: le loyer EST déjà dans "quotidien"
    const depensesTotales = quotidien + extra + investAuto + totalDepensesVariables;
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
    
    // ✅ MODIFIÉ: Mettre à jour le graphique (signature simplifiée)
    updateBudgetChart(quotidien, extra, investAuto, totalDepensesVariables, epargnePossible);
    
    // Mettre à jour le graphique d'évolution
    updateEvolutionChart(epargnePossible);
    
    // Mise à jour des conseils budgétaires
    updateBudgetAdvice(loyer, quotidien, extra, investAuto, totalDepensesVariables, revenuMensuel, tauxEpargne);
    
    // Mise à jour du temps pour atteindre l'objectif d'épargne
    updateObjectiveTime(epargnePossible);
    
    // Mettre à jour le score budget
    updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales);
    
    // Mettre à jour les recommandations
    updateRecommendations(epargnePossible, tauxEpargne, investAuto);
}

/**
 * Met à jour le temps nécessaire pour atteindre l'objectif d'épargne
 * @param {number} epargneMensuelle - Montant d'épargne mensuelle possible
 */
function updateObjectiveTime(epargneMensuelle) {
    const objectifMontant = parseFloat(document.getElementById('objectif-epargne').value) || 0;
    const objectifType = document.getElementById('objectif-type').value;
    const tempsObjectifElement = document.getElementById('temps-objectif');
    
    if (!tempsObjectifElement || objectifMontant <= 0 || epargneMensuelle <= 0) {
        if (tempsObjectifElement) tempsObjectifElement.classList.add('hidden');
        return;
    }
    
    // Calculer le nombre de mois nécessaires
    const moisNecessaires = Math.ceil(objectifMontant / epargneMensuelle);
    
    // Formatage en années et mois si nécessaire
    let tempsFormate = '';
    if (moisNecessaires > 12) {
        const annees = Math.floor(moisNecessaires / 12);
        const moisRestants = moisNecessaires % 12;
        tempsFormate = `${annees} an${annees > 1 ? 's' : ''} et ${moisRestants} mois`;
    } else {
        tempsFormate = `${moisNecessaires} mois`;
    }
    
    // Icône selon le type d'objectif
    let icone = '';
    switch (objectifType) {
        case 'vacances': icone = 'fas fa-umbrella-beach'; break;
        case 'achat': icone = 'fas fa-shopping-cart'; break;
        case 'urgence': icone = 'fas fa-shield-alt'; break;
        case 'apport': icone = 'fas fa-home'; break;
        default: icone = 'fas fa-bullseye';
    }
    
    // Mettre à jour l'affichage
    tempsObjectifElement.innerHTML = `
        <div class="flex items-center">
            <i class="${icone} text-blue-400 mr-2"></i>
            <span>À ce rythme, vous atteindrez votre objectif de 
            <strong class="text-blue-400">${objectifMontant.toLocaleString('fr-FR')} €</strong> 
            en <strong class="text-blue-400">${tempsFormate}</strong></span>
        </div>
    `;
    
    tempsObjectifElement.classList.remove('hidden');
}

/**
 * Met à jour le score budget global
 * @param {number} tauxEpargne - Taux d'épargne en pourcentage
 * @param {number} loyer - Montant du loyer/crédit
 * @param {number} revenuMensuel - Revenu mensuel
 * @param {number} depensesTotales - Total des dépenses
 */
function updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales) {
    let score = 3; // Score de base moyen
    let description = 'Budget équilibré';
    const scoreElement = document.getElementById('budget-score');
    const descriptionElement = document.getElementById('budget-score-description');
    const barreElement = document.getElementById('budget-score-bar');
    const cercleElement = document.querySelector('.budget-score-circle');
    
    if (!scoreElement || !descriptionElement || !barreElement || !cercleElement) return;
    
    // Évaluer le taux d'épargne
    if (tauxEpargne < 5) {
        score--;
        description = 'Budget très tendu';
    } else if (tauxEpargne >= 20) {
        score++;
        description = 'Budget optimisé';
    }
    
    // Évaluer le ratio logement
    const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
    if (ratioLogement > 33) {
        score--;
    } else if (ratioLogement <= 25) {
        score++;
    }
    
    // Vérifier si les dépenses dépassent les revenus
    if (depensesTotales > revenuMensuel) {
        score = 1;
        description = 'Budget déficitaire';
    } else if (tauxEpargne >= 30) {
        score = 5;
        description = 'Budget excellent';
    }
    
    // Limiter le score entre 1 et 5
    score = Math.max(1, Math.min(5, score));
    
    // Mettre à jour l'affichage
    scoreElement.textContent = score;
    descriptionElement.textContent = description;
    
    // Mettre à jour la barre de progression (score sur 5 -> pourcentage)
    const pourcentage = (score / 5) * 100;
    barreElement.style.width = `${pourcentage}%`;
    
    // Mettre à jour la couleur selon le score
    cercleElement.classList.remove('bg-red-900', 'bg-orange-900', 'bg-blue-900', 'bg-green-900');
    barreElement.classList.remove('bg-red-400', 'bg-orange-400', 'bg-blue-400', 'bg-green-400');
    scoreElement.classList.remove('text-red-400', 'text-orange-400', 'text-blue-400', 'text-green-400');
    
    if (score <= 2) {
        cercleElement.classList.add('bg-red-900');
        barreElement.classList.add('bg-red-400');
        scoreElement.classList.add('text-red-400');
    } else if (score === 3) {
        cercleElement.classList.add('bg-blue-900');
        barreElement.classList.add('bg-blue-400');
        scoreElement.classList.add('text-blue-400');
    } else {
        cercleElement.classList.add('bg-green-900');
        barreElement.classList.add('bg-green-400');
        scoreElement.classList.add('text-green-400');
    }
}

/**
 * Met à jour les recommandations personnalisées
 * @param {number} epargnePossible - Montant d'épargne mensuelle possible
 * @param {number} tauxEpargne - Taux d'épargne en pourcentage
 * @param {number} investAuto - Montant déjà investi automatiquement
 */
function updateRecommendations(epargnePossible, tauxEpargne, investAuto) {
    const recommendationsElement = document.getElementById('budget-recommendations');
    if (!recommendationsElement) return;
    
    const recommendations = [];
    
    // Recommandation basée sur l'épargne
    if (epargnePossible > 0) {
        let vehiculeRecommande = '';
        let montantRecommande = 0;
        
        if (tauxEpargne < 10) {
            // Priorité à l'épargne de précaution
            vehiculeRecommande = 'Livret A';
            montantRecommande = Math.round(epargnePossible * 0.7);
            recommendations.push(`<p class="mb-2">Priorité à la sécurité: placez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} jusqu'à constituer un fonds d'urgence de 3 mois de dépenses.</p>`);
        } else if (tauxEpargne >= 10 && tauxEpargne < 20) {
            // Mix entre sécurité et rendement
            vehiculeRecommande = 'PEA (ETF diversifiés)';
            montantRecommande = Math.round(epargnePossible * 0.6);
            recommendations.push(`<p class="mb-2">Équilibrez sécurité et rendement: investissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} pour profiter de la croissance à long terme.</p>`);
        } else {
            // Optimisation fiscale et rendement
            vehiculeRecommande = 'PEA + Assurance-vie';
            montantRecommande = Math.round(epargnePossible * 0.8);
            recommendations.push(`<p class="mb-2">Optimisez votre patrimoine: répartissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> entre ${vehiculeRecommande} pour maximiser rendement et avantages fiscaux.</p>`);
        }
    } else {
        recommendations.push(`<p class="mb-2">Votre budget est actuellement déficitaire. Concentrez-vous sur la réduction de vos dépenses non essentielles.</p>`);
    }
    
    // Recommandation sur l'investissement automatique
    if (investAuto === 0 && epargnePossible > 100) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-robot text-green-400 mr-1"></i> Mettez en place un <strong>versement automatique</strong> mensuel pour simplifier votre stratégie d'épargne.</p>`);
    } else if (investAuto > 0) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-check text-green-400 mr-1"></i> Excellent! Votre investissement automatique de ${investAuto.toLocaleString('fr-FR')} €/mois vous permet de construire votre patrimoine régulièrement.</p>`);
    }
    
    // Recommandation sur la simulation d'investissement
    recommendations.push(`<p class="mb-2"><i class="fas fa-arrow-right text-green-400 mr-1"></i> <a href="#investment-simulator" class="text-green-400 hover:underline">Simulez l'évolution de vos investissements</a> sur le long terme dans l'onglet "Simulateur d'investissement".</p>`);
    
    // Mise à jour de l'élément
    recommendationsElement.innerHTML = recommendations.join('');
}

/**
 * ✅ MODIFIÉ: Met à jour le graphique du budget (signature simplifiée)
 */
function updateBudgetChart(vieCourante, extra, investAuto, depensesVariables, epargne) {
    if (!window.budgetChart) return;
    
    window.budgetChart.data.datasets[0].data = [vieCourante, extra, investAuto, depensesVariables, epargne];
    window.budgetChart.update();
}

/**
 * Met à jour le graphique d'évolution sur 12 mois
 * @param {number} epargneMensuelle - Montant d'épargne mensuelle
 */
function updateEvolutionChart(epargneMensuelle) {
    if (!window.evolutionChart) return;
    
    const dataPoints = Array.from({ length: 12 }, (_, i) => (i + 1) * epargneMensuelle);
    window.evolutionChart.data.datasets[0].data = dataPoints;
    window.evolutionChart.update();
}

/**
 * Met à jour les conseils budgétaires en fonction des données
 */
function updateBudgetAdvice(loyer, quotidien, extra, investAuto, depensesVariables, revenuMensuel, tauxEpargne) {
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
    
    // Évaluer les dépenses variables
    if (depensesVariables > 0) {
        const ratioVariables = (depensesVariables / revenuMensuel) * 100;
        if (ratioVariables > 20) {
            conseils.push(`Vos dépenses variables représentent ${Math.round(ratioVariables)}% de vos revenus. Analyser ces postes pourrait vous aider à optimiser votre budget.`);
        }
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
