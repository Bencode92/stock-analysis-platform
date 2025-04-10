/**
 * simulation.js - Fonctionnalités pour la page de simulation d'investissement
 * Ce script gère les interactions et les calculs du simulateur d'investissement
 * TradePulse Finance Intelligence Platform
 */

document.addEventListener('DOMContentLoaded', function() {
    // Mettre à jour la date du jour
    updateDate();
    
    // Initialiser le graphique
    createChart();
    
    // Ajouter des événements aux sliders
    document.getElementById('duration-slider').addEventListener('input', function() {
        updateDurationValue(this.value);
    });
    
    document.getElementById('return-slider').addEventListener('input', function() {
        updateReturnValue(this.value);
    });
    
    // Ajouter un événement au bouton de simulation
    document.getElementById('simulate-button').addEventListener('click', runSimulation);
    
    // Ajouter un événement au sélecteur d'enveloppe fiscale
    document.getElementById('investment-vehicle').addEventListener('change', updateTaxInfo);
    
    // Initialiser les onglets de simulation
    initSimulationTabs();
});

/**
 * Fonction pour mettre à jour la date
 */
function updateDate() {
    const now = new Date();
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = now.toLocaleDateString('fr-FR', options).toUpperCase();
    
    const currentDateElement = document.getElementById('currentDate');
    if (currentDateElement) {
        currentDateElement.textContent = formattedDate;
    }
    
    // Mettre à jour l'heure du marché
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    const marketTimeElement = document.getElementById('marketTime');
    if (marketTimeElement) {
        marketTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

/**
 * Initialise les onglets de simulation
 */
function initSimulationTabs() {
    const tabs = document.querySelectorAll('.simulation-tab');
    const contents = document.querySelectorAll('.simulation-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Supprimer la classe active de tous les onglets
            tabs.forEach(t => t.classList.remove('active'));
            
            // Cacher tous les contenus
            contents.forEach(c => c.style.display = 'none');
            
            // Ajouter la classe active à l'onglet cliqué
            tab.classList.add('active');
            
            // Afficher le contenu correspondant
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
        });
    });
    
    // Activer le premier onglet par défaut
    if (tabs.length > 0 && tabs[0].getAttribute('data-target')) {
        tabs[0].click();
    }
}

/**
 * Fonction pour mettre à jour l'affichage de la durée
 * @param {string} value - La valeur de durée sélectionnée
 */
function updateDurationValue(value) {
    const durationValueElement = document.querySelector('#duration-slider + span');
    if (durationValueElement) {
        durationValueElement.textContent = `${value} ans`;
    }
}

/**
 * Fonction pour mettre à jour l'affichage du rendement
 * @param {string} value - La valeur de rendement sélectionnée
 */
function updateReturnValue(value) {
    const returnValueElement = document.querySelector('#return-slider + span');
    if (returnValueElement) {
        returnValueElement.textContent = `${value}%`;
    }
}

/**
 * Fonction pour mettre à jour les infos fiscales
 */
function updateTaxInfo() {
    // Récupérer l'élément sélectionné
    const vehicle = document.getElementById('investment-vehicle').value;
    const taxInfoElement = document.getElementById('tax-info');
    
    if (!taxInfoElement) return;
    
    // Définir les informations fiscales pour chaque véhicule
    const taxInfo = {
        pea: {
            title: "Fiscalité du PEA",
            description: "Le Plan d'Épargne en Actions (PEA) offre une exonération d'impôt sur les plus-values après 5 ans de détention (hors prélèvements sociaux de 17,2%).",
            limit: "Plafond: 150 000€ par personne"
        },
        cto: {
            title: "Fiscalité du Compte-Titres",
            description: "Le Compte-Titres Ordinaire est soumis au Prélèvement Forfaitaire Unique (PFU) de 30% sur les plus-values (12,8% d'impôt et 17,2% de prélèvements sociaux).",
            limit: "Pas de plafond de versement"
        },
        "assurance-vie": {
            title: "Fiscalité de l'Assurance-Vie",
            description: "Après 8 ans de détention, abattement annuel de 4 600€ (9 200€ pour un couple) sur les gains, puis PFU de 30% ou barème progressif sur le reste.",
            limit: "Pas de plafond de versement"
        },
        per: {
            title: "Fiscalité du PER",
            description: "Les versements sont déductibles des revenus imposables. La fiscalité à la sortie dépend du type de sortie (capital ou rente).",
            limit: "Plafond de déductibilité fiscal annuel"
        },
        scpi: {
            title: "Fiscalité des SCPI",
            description: "Les revenus des SCPI sont soumis au PFU de 30% ou au barème progressif de l'impôt sur le revenu + prélèvements sociaux.",
            limit: "Dépend du cadre de détention (direct, assurance-vie, etc.)"
        }
    };
    
    // Mettre à jour l'affichage
    if (taxInfo[vehicle]) {
        taxInfoElement.innerHTML = `
            <h5 class="text-green-400 font-medium flex items-center mb-2">
                <i class="fas fa-chart-pie mr-2"></i>
                ${taxInfo[vehicle].title}
            </h5>
            <p class="text-sm text-gray-300 mb-1">${taxInfo[vehicle].description}</p>
            <p class="text-sm font-medium">${taxInfo[vehicle].limit}</p>
        `;
    }
}

/**
 * Fonction pour exécuter la simulation
 */
function runSimulation() {
    // Animation du bouton
    const button = document.getElementById('simulate-button');
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Calcul en cours...';
    button.disabled = true;
    
    // Simuler un délai pour l'effet visuel
    setTimeout(() => {
        // Récupérer les données du formulaire
        const amount = parseFloat(document.getElementById('investment-amount').value);
        const years = parseInt(document.getElementById('duration-slider').value);
        const annualReturn = parseFloat(document.getElementById('return-slider').value) / 100;
        
        // Calcul des résultats
        const results = calculateInvestmentResults(amount, years, annualReturn);
        
        // Mettre à jour le graphique
        updateSimulationChart(amount, years, annualReturn);
        
        // Mettre à jour les résultats affichés
        updateResultsDisplay(results);
        
        // Restaurer le bouton
        button.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Lancer la simulation';
        button.disabled = false;
    }, 800);
}

/**
 * Calcule les résultats d'investissement
 * @param {number} initialAmount - Montant initial investi
 * @param {number} years - Nombre d'années
 * @param {number} annualReturn - Rendement annuel (en décimal)
 * @returns {Object} Résultats de la simulation
 */
function calculateInvestmentResults(initialAmount, years, annualReturn) {
    // Calcul du capital final
    const finalAmount = initialAmount * Math.pow(1 + annualReturn, years);
    
    // Calcul des gains
    const gains = finalAmount - initialAmount;
    
    // Calcul du montant après impôts (exemple avec PEA après 5 ans: 17.2% de prélèvements sociaux)
    const taxRate = 0.172;
    const afterTaxAmount = initialAmount + (gains * (1 - taxRate));
    
    // Calcul du montant des impôts
    const taxAmount = gains * taxRate;
    
    return {
        initialAmount,
        finalAmount,
        gains,
        afterTaxAmount,
        taxAmount,
        years,
        annualReturn
    };
}

/**
 * Met à jour l'affichage des résultats
 * @param {Object} results - Résultats de la simulation
 */
function updateResultsDisplay(results) {
    // Formater les valeurs monétaires
    const formatter = new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR',
        maximumFractionDigits: 2
    });
    
    // Mettre à jour les valeurs affichées
    const resultElements = document.querySelectorAll('.result-value');
    if (resultElements.length >= 4) {
        resultElements[0].textContent = formatter.format(results.finalAmount);
        resultElements[1].textContent = formatter.format(results.initialAmount);
        resultElements[2].textContent = formatter.format(results.gains);
        resultElements[3].textContent = formatter.format(results.afterTaxAmount);
    }
    
    // Mettre à jour le message d'adéquation
    updateProfileAdequacy(results);
}

/**
 * Met à jour le message d'adéquation au profil
 * @param {Object} results - Résultats de la simulation
 */
function updateProfileAdequacy(results) {
    const adequacyElement = document.getElementById('profile-adequacy');
    if (!adequacyElement) return;
    
    // Logique d'évaluation (exemple simplifié)
    let adequacyScore = 5; // Par défaut
    let adequacyMessages = [];
    
    // Vérification du véhicule d'investissement
    const vehicle = document.getElementById('investment-vehicle').value;
    
    // Évaluer l'adéquation en fonction de la durée et du véhicule
    if (vehicle === 'pea' && results.years < 5) {
        adequacyScore--;
        adequacyMessages.push("Le PEA est plus avantageux fiscalement après 5 ans de détention.");
    } else if (vehicle === 'pea') {
        adequacyMessages.push("Le PEA est parfaitement adapté pour un investissement de cette durée.");
    }
    
    // Vérification du montant (PEA plafonné à 150 000€)
    if (vehicle === 'pea' && results.initialAmount > 150000) {
        adequacyScore--;
        adequacyMessages.push("Attention: votre montant dépasse le plafond du PEA (150 000€).");
    } else if (vehicle === 'pea') {
        adequacyMessages.push("Votre montant d'investissement est inférieur au plafond du PEA (150 000€).");
    }
    
    // Vérification du rendement
    if (results.annualReturn > 0.15) {
        adequacyScore--;
        adequacyMessages.push("Un rendement annuel supérieur à 15% est très optimiste.");
    } else if (results.annualReturn >= 0.06 && results.annualReturn <= 0.1) {
        adequacyMessages.push("Un rendement de " + (results.annualReturn * 100) + "% correspond aux performances historiques moyennes des indices boursiers.");
    }
    
    // Mettre à jour l'affichage
    const adequacyText = adequacyElement.querySelector('.adequacy-score');
    const adequacyList = adequacyElement.querySelector('.adequacy-list');
    
    if (adequacyText) {
        adequacyText.textContent = `Adéquation: ${adequacyScore}/5`;
    }
    
    if (adequacyList) {
        adequacyList.innerHTML = adequacyMessages.map(msg => `<li>${msg}</li>`).join('');
    }
}

/**
 * Fonction pour créer le graphique initial
 */
function createChart() {
    const ctx = document.getElementById('investment-chart');
    if (!ctx) return;
    
    const years = 10;
    const labels = Array.from({length: years + 1}, (_, i) => i === 0 ? 'Départ' : `Année ${i}`);
    const investedValues = [1000];
    const totalValues = [1000];
    
    let total = 1000;
    for (let i = 1; i <= years; i++) {
        total *= 1.07;
        investedValues.push(1000);
        totalValues.push(total);
    }
    
    window.investmentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Capital total',
                    data: totalValues,
                    borderColor: '#00FF87',
                    backgroundColor: 'rgba(0, 255, 135, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#00FF87',
                    pointBorderColor: '#00FF87',
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Montant investi',
                    data: investedValues,
                    borderColor: '#2196f3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#2196f3',
                    pointBorderColor: '#2196f3',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 33, 64, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(0, 255, 135, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
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
                },
                legend: {
                    position: 'top'
                }
            },
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
            }
        }
    });
}

/**
 * Fonction pour mettre à jour le graphique de simulation
 * @param {number} initialAmount - Montant initial investi
 * @param {number} years - Nombre d'années
 * @param {number} annualReturn - Rendement annuel (en décimal)
 */
function updateSimulationChart(initialAmount, years, annualReturn) {
    if (!window.investmentChart) return;
    
    // Générer les nouvelles données
    const labels = Array.from({length: years + 1}, (_, i) => i === 0 ? 'Départ' : `Année ${i}`);
    const investedValues = [initialAmount];
    const totalValues = [initialAmount];
    
    let total = initialAmount;
    for (let i = 1; i <= years; i++) {
        total *= (1 + annualReturn);
        investedValues.push(initialAmount);
        totalValues.push(total);
    }
    
    // Mettre à jour le graphique
    window.investmentChart.data.labels = labels;
    window.investmentChart.data.datasets[0].data = totalValues;
    window.investmentChart.data.datasets[1].data = investedValues;
    window.investmentChart.update();
}

/**
 * Conversion entre versement unique et périodique
 * @param {string} mode - Mode de versement ('unique' ou 'periodique')
 */
function toggleInvestmentMode(mode) {
    const uniqueButton = document.getElementById('unique-investment');
    const periodicButton = document.getElementById('periodic-investment');
    const frequencySelect = document.getElementById('investment-frequency');
    const frequencyContainer = document.getElementById('frequency-container');
    
    if (!uniqueButton || !periodicButton || !frequencyContainer) return;
    
    if (mode === 'unique') {
        uniqueButton.classList.add('selected');
        periodicButton.classList.remove('selected');
        frequencyContainer.style.display = 'none';
    } else {
        uniqueButton.classList.remove('selected');
        periodicButton.classList.add('selected');
        frequencyContainer.style.display = 'block';
    }
    
    // Si une simulation est déjà active, la mettre à jour
    if (document.querySelector('.results-container').style.display !== 'none') {
        runSimulation();
    }
}