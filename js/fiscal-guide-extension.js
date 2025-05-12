// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 1.1 - Mai 2025

document.addEventListener('DOMContentLoaded', function() {
    console.log("fiscal-guide-extension.js: Initialisation...");
    
    // Attendre explicitement que l'événement du simulateur fiscal soit déclenché
    document.addEventListener('simulationsFiscalesReady', function() {
        console.log("fiscal-guide-extension.js: SimulationsFiscales détecté, initialisation...");
        
        // Attendre encore un peu que l'interface soit générée par fiscal-guide.js
        setTimeout(function() {
            console.log("fiscal-guide-extension.js: Tentative d'initialisation des extensions...");
            initGuideFiscalExtension();
        }, 1000);
    });
    
    // Attendre également l'événement de l'onglet Guide fiscal
    const guideTab = document.querySelector('.tab-item:nth-child(3)');
    if (guideTab) {
        guideTab.addEventListener('click', function() {
            console.log("fiscal-guide-extension.js: Onglet Guide fiscal cliqué");
            setTimeout(function() {
                initGuideFiscalExtension();
            }, 500);
        });
    }
});

function initGuideFiscalExtension() {
    console.log("fiscal-guide-extension.js: Initialisation des extensions du guide fiscal");
    
    // Vérifier si le simulateur existe dans le DOM
    if (!document.getElementById('fiscal-simulator')) {
        console.log("fiscal-guide-extension.js: Simulateur fiscal non trouvé dans le DOM");
        return;
    }
    
    console.log("fiscal-guide-extension.js: Simulateur fiscal trouvé, initialisation des extensions");
    
    // Ajouter des fonctionnalités avancées au simulateur
    enhanceSimulator();
    
    // Ajouter des graphiques de comparaison
    setupComparisonCharts();
    
    // Ajouter des conseils personnalisés
    setupPersonalizedAdvice();
}

// Améliorer le simulateur avec des fonctionnalités supplémentaires
function enhanceSimulator() {
    console.log("fiscal-guide-extension.js: Amélioration de l'interface du simulateur");
    
    // Ajouter un bouton pour générer des rapports PDF
    addPdfReportButton();
    
    // Ajouter un bouton pour sauvegarder les simulations
    addSaveSimulationButton();
    
    // Améliorer l'interface utilisateur
    enhanceUserInterface();
}

// Ajouter un bouton pour générer un rapport PDF
function addPdfReportButton() {
    // Vérifier si le conteneur du simulateur existe
    const simulatorContainer = document.getElementById('fiscal-simulator');
    if (!simulatorContainer) {
        console.log("fiscal-guide-extension.js: Conteneur du simulateur non trouvé");
        return;
    }
    
    // Vérifier si le bouton existe déjà
    if (document.getElementById('generate-pdf-btn')) return;
    
    // Trouver l'emplacement du bouton de comparaison
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) {
        console.log("fiscal-guide-extension.js: Bouton de comparaison non trouvé");
        return;
    }
    
    console.log("fiscal-guide-extension.js: Ajout du bouton d'export PDF");
    
    // Créer le bouton de génération PDF
    const pdfBtn = document.createElement('button');
    pdfBtn.id = 'generate-pdf-btn';
    pdfBtn.className = 'bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline ml-2';
    pdfBtn.innerHTML = '<i class="fas fa-file-pdf mr-2"></i> Export PDF';
    
    // Ajouter un gestionnaire d'événement
    pdfBtn.addEventListener('click', generatePdfReport);
    
    // Insérer le bouton après le bouton de comparaison
    compareBtn.parentNode.insertBefore(pdfBtn, compareBtn.nextSibling);
}

// Fonction pour générer un rapport PDF
function generatePdfReport() {
    alert('Fonctionnalité d\'export PDF en cours de développement');
    console.log('Génération PDF demandée');
    // Ici viendrait le code pour générer un PDF avec jsPDF ou une autre bibliothèque
}

// Ajouter un bouton pour sauvegarder les simulations
function addSaveSimulationButton() {
    // Vérifier si le conteneur du simulateur existe
    const simulatorContainer = document.getElementById('fiscal-simulator');
    if (!simulatorContainer) return;
    
    // Vérifier si le bouton existe déjà
    if (document.getElementById('save-simulation-btn')) return;
    
    // Trouver l'emplacement du bouton de comparaison
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) return;
    
    console.log("fiscal-guide-extension.js: Ajout du bouton de sauvegarde");
    
    // Créer le bouton de sauvegarde
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-simulation-btn';
    saveBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline ml-2';
    saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Sauvegarder';
    
    // Ajouter un gestionnaire d'événement
    saveBtn.addEventListener('click', saveSimulation);
    
    // Insérer le bouton après le bouton de génération PDF
    const pdfBtn = document.getElementById('generate-pdf-btn');
    if (pdfBtn) {
        pdfBtn.parentNode.insertBefore(saveBtn, pdfBtn.nextSibling);
    } else {
        compareBtn.parentNode.insertBefore(saveBtn, compareBtn.nextSibling);
    }
}

// Fonction pour sauvegarder une simulation
function saveSimulation() {
    // Récupérer les paramètres de simulation
    const ca = document.getElementById('sim-ca').value;
    const marge = document.getElementById('sim-marge').value;
    const salaire = document.getElementById('sim-salaire').value;
    const tmi = document.getElementById('sim-tmi').value;
    
    // Créer un objet avec les paramètres
    const simulation = {
        ca: ca,
        marge: marge,
        salaire: salaire,
        tmi: tmi,
        date: new Date().toISOString(),
        resultats: getSimulationResults()
    };
    
    // Convertir en JSON
    const simulationJson = JSON.stringify(simulation);
    
    // Sauvegarder dans localStorage
    const savedSimulations = JSON.parse(localStorage.getItem('fiscalSimulations') || '[]');
    savedSimulations.push(simulation);
    localStorage.setItem('fiscalSimulations', JSON.stringify(savedSimulations));
    
    // Afficher un message de confirmation
    showNotification('Simulation sauvegardée avec succès!', 'success');
}

// Fonction pour récupérer les résultats de simulation
function getSimulationResults() {
    const resultats = [];
    const rows = document.querySelectorAll('#sim-results-body tr:not(.ratio-row):not([class*="bg-blue-900"])');
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
            resultats.push({
                statut: cells[0].textContent.trim(),
                brut: cells[1].textContent.trim(),
                charges: cells[2].textContent.trim(),
                impots: cells[3].textContent.trim(),
                dividendes: cells[4].textContent.trim(),
                ratio: cells[5].textContent.trim(),
                net: cells[6].textContent.trim()
            });
        }
    });
    
    return resultats;
}

// Améliorer l'interface utilisateur
function enhanceUserInterface() {
    console.log("fiscal-guide-extension.js: Amélioration de l'interface utilisateur");
    
    // Ajouter un mode sombre/clair
    addDarkModeToggle();
    
    // Ajouter une option pour masquer/afficher les colonnes
    addColumnToggle();
}

// Ajouter un switch pour le mode sombre/clair
function addDarkModeToggle() {
    // Vérifier si le switch existe déjà
    if (document.getElementById('dark-mode-toggle')) return;
    
    // Trouver l'emplacement pour ajouter le switch
    const headerContainer = document.querySelector('.header-container') || document.querySelector('header');
    if (!headerContainer) return;
    
    console.log("fiscal-guide-extension.js: Ajout du toggle mode sombre/clair");
    
    // Créer le switch
    const darkModeToggle = document.createElement('div');
    darkModeToggle.id = 'dark-mode-toggle';
    darkModeToggle.className = 'fixed top-4 right-4 z-10';
    darkModeToggle.innerHTML = `
        <button class="p-2 bg-blue-900 bg-opacity-70 hover:bg-blue-800 rounded-full text-white focus:outline-none">
            <i class="fas fa-moon"></i>
        </button>
    `;
    
    // Ajouter un gestionnaire d'événement
    darkModeToggle.querySelector('button').addEventListener('click', toggleDarkMode);
    
    // Ajouter à la page
    document.body.appendChild(darkModeToggle);
}

// Fonction pour basculer le mode sombre/clair
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    
    // Mettre à jour l'icône
    const icon = document.querySelector('#dark-mode-toggle i');
    if (icon) {
        if (body.classList.contains('dark-mode')) {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }
    
    // Sauvegarder la préférence
    localStorage.setItem('darkMode', body.classList.contains('dark-mode'));
}

// Ajouter une option pour masquer/afficher les colonnes
function addColumnToggle() {
    // Vérifier si le conteneur de résultats existe
    const resultsContainer = document.getElementById('sim-results-container');
    if (!resultsContainer) {
        console.log("fiscal-guide-extension.js: Conteneur de résultats non trouvé");
        return;
    }
    
    // Vérifier si l'option existe déjà
    if (document.getElementById('column-toggle')) return;
    
    console.log("fiscal-guide-extension.js: Ajout du toggle de colonnes");
    
    // Créer le toggle
    const columnToggle = document.createElement('div');
    columnToggle.id = 'column-toggle';
    columnToggle.className = 'mb-4 p-2 bg-blue-900 bg-opacity-30 rounded-lg';
    columnToggle.innerHTML = `
        <div class="text-sm font-medium mb-2">Colonnes affichées :</div>
        <div class="flex flex-wrap gap-2">
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" class="mr-1 column-checkbox" data-column="1" checked> Brut
            </label>
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" class="mr-1 column-checkbox" data-column="2" checked> Charges
            </label>
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" class="mr-1 column-checkbox" data-column="3" checked> Impôts
            </label>
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" class="mr-1 column-checkbox" data-column="4" checked> Dividendes
            </label>
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" class="mr-1 column-checkbox" data-column="5" checked> Ratio
            </label>
        </div>
    `;
    
    // Insérer avant le tableau de résultats
    resultsContainer.insertBefore(columnToggle, resultsContainer.firstChild);
    
    // Ajouter les gestionnaires d'événements
    document.querySelectorAll('.column-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', toggleColumn);
    });
}

// Fonction pour masquer/afficher une colonne
function toggleColumn(event) {
    const checkbox = event.target;
    const columnIndex = parseInt(checkbox.getAttribute('data-column'));
    const table = document.getElementById('sim-results');
    
    if (!table) return;
    
    // Sélectionner les cellules de la colonne
    const cells = table.querySelectorAll(`tr > :nth-child(${columnIndex + 1})`);
    
    // Masquer/afficher les cellules
    cells.forEach(cell => {
        cell.style.display = checkbox.checked ? '' : 'none';
    });
}

// Configurer les graphiques de comparaison
function setupComparisonCharts() {
    console.log("fiscal-guide-extension.js: Configuration des graphiques de comparaison");
    
    // Trouver l'emplacement pour ajouter les graphiques
    const resultsContainer = document.getElementById('sim-results-container');
    if (!resultsContainer) {
        console.log("fiscal-guide-extension.js: Conteneur de résultats non trouvé pour graphiques");
        return;
    }
    
    // Vérifier si le conteneur de graphiques existe déjà
    if (document.getElementById('charts-container')) return;
    
    // Créer le conteneur de graphiques
    const chartsContainer = document.createElement('div');
    chartsContainer.id = 'charts-container';
    chartsContainer.className = 'mt-8 bg-blue-900 bg-opacity-30 p-4 rounded-lg';
    chartsContainer.innerHTML = `
        <h3 class="text-xl font-bold text-green-400 mb-4">Graphiques de comparaison</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-blue-900 bg-opacity-50 p-4 rounded-lg">
                <h4 class="text-lg font-medium text-blue-300 mb-3">Comparaison des revenus nets</h4>
                <div id="net-income-chart" class="h-64"></div>
            </div>
            <div class="bg-blue-900 bg-opacity-50 p-4 rounded-lg">
                <h4 class="text-lg font-medium text-blue-300 mb-3">Répartition charges/impôts</h4>
                <div id="expenses-chart" class="h-64"></div>
            </div>
        </div>
    `;
    
    // Ajouter après le tableau de résultats
    resultsContainer.parentNode.insertBefore(chartsContainer, resultsContainer.nextSibling);
    
    // Ajouter un gestionnaire d'événement pour mettre à jour les graphiques après la comparaison
    const compareBtn = document.getElementById('sim-compare-btn');
    if (compareBtn) {
        console.log("fiscal-guide-extension.js: Bouton de comparaison trouvé pour les graphiques");
        compareBtn.addEventListener('click', function() {
            // Attendre que les résultats soient mis à jour
            setTimeout(updateCharts, 1000);
        });
    }
    
    // Initialiser les graphiques vides
    initCharts();
}

// Initialiser les graphiques
function initCharts() {
    console.log("fiscal-guide-extension.js: Initialisation des graphiques");
    
    // Vérifier si la bibliothèque Chart.js est disponible
    if (typeof Chart === 'undefined') {
        console.log("fiscal-guide-extension.js: Chart.js non disponible, tentative de chargement");
        // Charger Chart.js dynamiquement
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = function() {
            console.log('Chart.js chargé avec succès');
            createInitialCharts();
        };
        document.head.appendChild(script);
    } else {
        console.log("fiscal-guide-extension.js: Chart.js disponible, création des graphiques");
        createInitialCharts();
    }
}

// Créer les graphiques initiaux
function createInitialCharts() {
    // Graphique des revenus nets
    const netIncomeCtx = document.getElementById('net-income-chart');
    if (netIncomeCtx) {
        console.log("fiscal-guide-extension.js: Création du graphique de revenus nets");
        window.netIncomeChart = new Chart(netIncomeCtx, {
            type: 'bar',
            data: {
                labels: ['Micro', 'EI', 'EURL', 'SASU', 'SARL'],
                datasets: [{
                    label: 'Revenu net',
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(0, 255, 135, 0.5)',
                    borderColor: 'rgba(0, 255, 135, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
    } else {
        console.log("fiscal-guide-extension.js: Élément pour graphique de revenus nets non trouvé");
    }
    
    // Graphique des charges et impôts
    const expensesCtx = document.getElementById('expenses-chart');
    if (expensesCtx) {
        console.log("fiscal-guide-extension.js: Création du graphique de charges et impôts");
        window.expensesChart = new Chart(expensesCtx, {
            type: 'doughnut',
            data: {
                labels: ['Net', 'Charges sociales', 'Impôts'],
                datasets: [{
                    data: [70, 20, 10],
                    backgroundColor: [
                        'rgba(0, 255, 135, 0.7)',
                        'rgba(59, 130, 246, 0.7)',
                        'rgba(251, 113, 133, 0.7)'
                    ],
                    borderColor: [
                        'rgba(0, 255, 135, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(251, 113, 133, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
    } else {
        console.log("fiscal-guide-extension.js: Élément pour graphique de charges non trouvé");
    }
}

// Mettre à jour les graphiques avec les données actuelles
function updateCharts() {
    console.log("fiscal-guide-extension.js: Mise à jour des graphiques");
    
    // Récupérer les données des résultats
    const rows = document.querySelectorAll('#sim-results-body tr:not(.ratio-row):not([class*="bg-blue-900"])');
    if (rows.length === 0) {
        console.log("fiscal-guide-extension.js: Aucune ligne de résultat trouvée pour les graphiques");
        return;
    }
    
    const chartData = {
        labels: [],
        nets: [],
        charges: [],
        impots: []
    };
    
    // Limiter à 5-7 résultats pour la lisibilité
    const maxRows = Math.min(7, rows.length);
    console.log(`fiscal-guide-extension.js: Utilisation de ${maxRows} lignes pour les graphiques`);
    
    for (let i = 0; i < maxRows; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 7) {
            // Extraire le nom du statut (sans les icônes et badges)
            const statutText = cells[0].textContent.trim().replace(/^\s*[^\w]+\s*/, '');
            chartData.labels.push(statutText.split(' ')[0]); // Prendre juste le premier mot
            
            // Extraire les valeurs numériques
            const netText = cells[6].textContent.trim().replace(/[^\d]/g, '');
            const chargesText = cells[2].textContent.trim().replace(/[^\d]/g, '');
            const impotsText = cells[3].textContent.trim().replace(/[^\d]/g, '');
            
            chartData.nets.push(parseInt(netText, 10) || 0);
            chartData.charges.push(parseInt(chargesText, 10) || 0);
            chartData.impots.push(parseInt(impotsText, 10) || 0);
        }
    }
    
    console.log("fiscal-guide-extension.js: Données extraites pour les graphiques", chartData);
    
    // Mettre à jour le graphique des revenus nets
    if (window.netIncomeChart) {
        window.netIncomeChart.data.labels = chartData.labels;
        window.netIncomeChart.data.datasets[0].data = chartData.nets;
        window.netIncomeChart.update();
        console.log("fiscal-guide-extension.js: Graphique des revenus nets mis à jour");
    } else {
        console.log("fiscal-guide-extension.js: Graphique des revenus nets non disponible");
    }
    
    // Mettre à jour le graphique des charges et impôts
    if (window.expensesChart) {
        // Utiliser les données du meilleur statut (premier rang)
        if (chartData.nets.length > 0) {
            const totalNet = chartData.nets[0];
            const totalCharges = chartData.charges[0];
            const totalImpots = chartData.impots[0];
            const total = totalNet + totalCharges + totalImpots;
            
            // Calculer les pourcentages
            const netPercent = Math.round((totalNet / total) * 100);
            const chargesPercent = Math.round((totalCharges / total) * 100);
            const impotsPercent = Math.round((totalImpots / total) * 100);
            
            window.expensesChart.data.datasets[0].data = [netPercent, chargesPercent, impotsPercent];
            window.expensesChart.update();
            console.log("fiscal-guide-extension.js: Graphique des charges et impôts mis à jour");
        }
    } else {
        console.log("fiscal-guide-extension.js: Graphique des charges et impôts non disponible");
    }
}

// Configurer les conseils personnalisés
function setupPersonalizedAdvice() {
    console.log("fiscal-guide-extension.js: Configuration des conseils personnalisés");
    
    // Trouver l'emplacement pour ajouter les conseils
    const resultsContainer = document.getElementById('sim-results-container');
    if (!resultsContainer) {
        console.log("fiscal-guide-extension.js: Conteneur de résultats non trouvé pour conseils");
        return;
    }
    
    // Vérifier si la section de conseils existe déjà
    if (document.getElementById('advice-container')) return;
    
    // Créer la section de conseils
    const adviceContainer = document.createElement('div');
    adviceContainer.id = 'advice-container';
    adviceContainer.className = 'mt-8 bg-green-900 bg-opacity-30 p-6 rounded-lg';
    adviceContainer.innerHTML = `
        <h3 class="text-xl font-bold text-green-400 mb-4">Conseils personnalisés</h3>
        <div id="advice-content" class="text-gray-200">
            <p class="mb-4"><i class="fas fa-info-circle text-blue-400 mr-2"></i>Lancez une simulation pour obtenir des conseils personnalisés basés sur votre situation.</p>
        </div>
    `;
    
    // Trouver charts-container s'il existe, sinon ajouter à la fin
    const chartsContainer = document.getElementById('charts-container');
    if (chartsContainer) {
        chartsContainer.parentNode.insertBefore(adviceContainer, chartsContainer.nextSibling);
    } else {
        resultsContainer.parentNode.appendChild(adviceContainer);
    }
    
    // Ajouter un gestionnaire d'événement pour mettre à jour les conseils après la comparaison
    const compareBtn = document.getElementById('sim-compare-btn');
    if (compareBtn) {
        compareBtn.addEventListener('click', function() {
            // Attendre que les résultats soient mis à jour
            setTimeout(updateAdvice, 1000);
        });
    }
}

// Mettre à jour les conseils personnalisés
function updateAdvice() {
    console.log("fiscal-guide-extension.js: Mise à jour des conseils personnalisés");
    
    const adviceContent = document.getElementById('advice-content');
    if (!adviceContent) {
        console.log("fiscal-guide-extension.js: Conteneur de conseils non trouvé");
        return;
    }
    
    // Récupérer les données des résultats
    const rows = document.querySelectorAll('#sim-results-body tr:not(.ratio-row):not([class*="bg-blue-900"])');
    if (rows.length === 0) {
        console.log("fiscal-guide-extension.js: Aucune ligne de résultat trouvée pour les conseils");
        return;
    }
    
    // Récupérer les paramètres de simulation
    const ca = parseFloat(document.getElementById('sim-ca').value) || 0;
    const marge = parseFloat(document.getElementById('sim-marge').value) || 0;
    const salaire = parseFloat(document.getElementById('sim-salaire').value) || 0;
    
    // Récupérer le meilleur statut (premier rang)
    const topRow = rows[0];
    const topCells = topRow.querySelectorAll('td');
    if (topCells.length < 7) {
        console.log("fiscal-guide-extension.js: Structure de ligne de résultat incorrecte");
        return;
    }
    
    const topStatut = topCells[0].textContent.trim().replace(/^\s*[^\w]+\s*/, '');
    const topNet = topCells[6].textContent.trim();
    
    console.log(`fiscal-guide-extension.js: Meilleur statut: ${topStatut}, Net: ${topNet}`);
    
    // Générer des conseils adaptés
    let adviceHtml = '';
    
    if (ca < 30000) {
        adviceHtml += `
            <div class="advice-section mb-4">
                <h4 class="text-lg font-semibold text-green-400 mb-2">Analyse pour CA faible (${ca}€)</h4>
                <p class="mb-2"><i class="fas fa-check text-green-500 mr-2"></i>Avec un CA de ${ca}€, <strong>${topStatut}</strong> est le statut le plus avantageux financièrement, vous permettant de conserver ${topNet} nets.</p>
                <p class="mb-2"><i class="fas fa-lightbulb text-yellow-400 mr-2"></i>Pour les petits CA, la micro-entreprise est souvent avantageuse grâce à sa simplicité administrative et ses charges réduites.</p>
                <p><i class="fas fa-arrow-right text-blue-400 mr-2"></i>Considérez les opportunités futures de développement avant de choisir votre statut juridique.</p>
            </div>
        `;
    } else if (ca < 70000) {
        adviceHtml += `
            <div class="advice-section mb-4">
                <h4 class="text-lg font-semibold text-green-400 mb-2">Analyse pour CA moyen (${ca}€)</h4>
                <p class="mb-2"><i class="fas fa-check text-green-500 mr-2"></i>Avec un CA de ${ca}€, <strong>${topStatut}</strong> est le statut le plus avantageux, vous permettant de conserver ${topNet} nets.</p>
                <p class="mb-2"><i class="fas fa-lightbulb text-yellow-400 mr-2"></i>À ce niveau d'activité, l'optimisation fiscale peut justifier des structures plus complexes comme une SASU ou EURL à l'IS.</p>
                <p><i class="fas fa-arrow-right text-blue-400 mr-2"></i>Pensez à équilibrer rémunération et dividendes si vous optez pour une structure à l'IS.</p>
            </div>
        `;
    } else {
        adviceHtml += `
            <div class="advice-section mb-4">
                <h4 class="text-lg font-semibold text-green-400 mb-2">Analyse pour CA élevé (${ca}€)</h4>
                <p class="mb-2"><i class="fas fa-check text-green-500 mr-2"></i>Avec un CA de ${ca}€, <strong>${topStatut}</strong> est le statut le plus avantageux, vous permettant de conserver ${topNet} nets.</p>
                <p class="mb-2"><i class="fas fa-lightbulb text-yellow-400 mr-2"></i>Pour les CA élevés, les structures à l'IS (SASU, SAS) permettent généralement de meilleures optimisations via les dividendes.</p>
                <p><i class="fas fa-arrow-right text-blue-400 mr-2"></i>Consultez un expert-comptable pour des stratégies d'optimisation plus poussées (épargne salariale, etc.).</p>
            </div>
        `;
    }
    
    // Ajouter des conseils sur le ratio rémunération/dividendes
    if (topStatut.includes('SASU') || topStatut.includes('SAS') || topStatut.includes('EURL à l\'IS')) {
        // Ratio optimal
        const ratioText = topCells[5].textContent.trim();
        const optimalRatio = parseInt(ratioText, 10) || 0;
        
        adviceHtml += `
            <div class="advice-section mb-4">
                <h4 class="text-lg font-semibold text-green-400 mb-2">Optimisation rémunération/dividendes</h4>
                <p class="mb-2"><i class="fas fa-calculator text-purple-400 mr-2"></i>Le ratio optimal pour ${topStatut} est de ${optimalRatio}% en rémunération et ${100-optimalRatio}% en dividendes.</p>
                ${optimalRatio < 30 ? 
                '<p class="mb-2"><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i><strong>Attention</strong> : un ratio de rémunération très faible peut être considéré comme une rémunération anormale par l\'administration fiscale.</p>' : ''}
                ${optimalRatio > 70 ? 
                '<p class="mb-2"><i class="fas fa-info-circle text-blue-400 mr-2"></i>Votre optimisation privilégie la rémunération, ce qui maximise vos droits sociaux (retraite, maladie) mais augmente vos charges.</p>' : ''}
            </div>
        `;
    }
    
    // Ajouter des conseils spécifiques selon le secteur d'activité
    adviceHtml += `
        <div class="advice-section">
            <h4 class="text-lg font-semibold text-green-400 mb-2">Autres considérations</h4>
            <ul class="space-y-2">
                <li><i class="fas fa-shield-alt text-blue-400 mr-2"></i><strong>Protection du patrimoine</strong> : Les structures sociétaires (SASU, SAS, SARL) offrent une meilleure protection du patrimoine personnel.</li>
                <li><i class="fas fa-users text-blue-400 mr-2"></i><strong>Associés</strong> : Si vous prévoyez d'intégrer des associés, privilégiez les structures adaptées (SAS, SARL).</li>
                <li><i class="fas fa-chart-line text-blue-400 mr-2"></i><strong>Évolutivité</strong> : Pensez à la croissance future de votre activité dans le choix de votre statut.</li>
            </ul>
            <p class="mt-4 italic text-gray-400">Pour une analyse complète adaptée à votre situation spécifique, consultez un expert-comptable.</p>
        </div>
    `;
    
    // Mettre à jour le contenu
    adviceContent.innerHTML = adviceHtml;
    console.log("fiscal-guide-extension.js: Conseils personnalisés mis à jour");
}

// Fonction utilitaire pour afficher des notifications
function showNotification(message, type = 'info') {
    // Vérifier si le conteneur de notifications existe
    let notificationContainer = document.getElementById('notification-container');
    
    if (!notificationContainer) {
        // Créer le conteneur
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2';
        document.body.appendChild(notificationContainer);
    }
    
    // Créer la notification
    const notification = document.createElement('div');
    
    // Définir la classe en fonction du type
    let typeClass = 'bg-blue-600';
    let icon = 'fas fa-info-circle';
    
    if (type === 'success') {
        typeClass = 'bg-green-600';
        icon = 'fas fa-check-circle';
    } else if (type === 'error') {
        typeClass = 'bg-red-600';
        icon = 'fas fa-exclamation-circle';
    } else if (type === 'warning') {
        typeClass = 'bg-yellow-600';
        icon = 'fas fa-exclamation-triangle';
    }
    
    notification.className = `${typeClass} text-white p-3 rounded-lg shadow-lg flex items-center max-w-md notification-item opacity-0 transform translate-x-4`;
    notification.innerHTML = `<i class="${icon} mr-2"></i> ${message}`;
    
    // Ajouter au conteneur
    notificationContainer.appendChild(notification);
    
    // Animation d'entrée
    setTimeout(() => {
        notification.style.transition = 'all 0.3s ease-out';
        notification.classList.remove('opacity-0', 'translate-x-4');
    }, 10);
    
    // Disparition après 5 secondes
    setTimeout(() => {
        notification.classList.add('opacity-0', 'translate-x-4');
        setTimeout(() => {
            if (notification.parentNode) {
                notificationContainer.removeChild(notification);
            }
        }, 300);
    }, 5000);
}
