/**
 * simulation.js - Fonctionnalités pour la page de simulation d'investissement
 * Ce script gère les interactions et les calculs du simulateur d'investissement
 * TradePulse Finance Intelligence Platform
 */

// Import des données fiscales depuis fiscal-enveloppes.js
import { enveloppes, TAXES, netAfterFlatTax, round2 } from './fiscal-enveloppes.js';

// Créer un cache pour les performances
const enveloppesCache = new Map();
enveloppes.forEach(env => {
    enveloppesCache.set(env.id, env);
});

// Fonction pour récupérer les infos d'une enveloppe
function getEnveloppeInfo(enveloppeId) {
    return enveloppesCache.get(enveloppeId) || null;
}

// Fonction utilitaire pour formater les montants
function formatMoney(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
    }).format(amount);
}

// Fonction pour afficher un tooltip
function showTooltip(message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'fixed bottom-4 right-4 bg-green-900 bg-opacity-90 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fadeIn';
    tooltip.textContent = message;
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
        tooltip.classList.add('animate-fadeOut');
        setTimeout(() => tooltip.remove(), 300);
    }, 3000);
}

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
    document.getElementById('investment-vehicle').addEventListener('change', function() {
        updateTaxInfo();
        updateReturnSuggestions();
        
        // Relancer la simulation si déjà des résultats
        if (document.querySelector('.result-value').textContent !== '') {
            runSimulation();
        }
    });
    
    // Initialiser les onglets de simulation
    initSimulationTabs();

    // Initialiser les listeners pour le calculateur fiscal si la section existe
    initFiscalCalculator();
    
    // Écouter le changement sur les éléments de budget dans le simulateur
    const simulationBudgetInputs = [
        document.getElementById('simulation-budget-loyer'),
        document.getElementById('simulation-budget-quotidien'),
        document.getElementById('simulation-budget-extra'),
        document.getElementById('simulation-budget-invest')
    ];
    
    simulationBudgetInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', function() {
                if (document.querySelector('.result-value').textContent !== '') {
                    runSimulation();
                }
            });
        }
    });
});

/**
 * Calcul fiscal exact avec tranches progressives et optimisation PER
 * @param {Object} params - Paramètres du calcul
 * @param {number} params.brutAnnuel - Salaire brut annuel
 * @param {number} params.tauxNeutre - Taux de charges sociales (ex: 0.22 pour 22%)
 * @param {number} params.perPourcentage - Pourcentage du salaire net versé au PER (ex: 0.1 pour 10%)
 * @returns {Object} Résultats de la simulation fiscale
 */
function calculFiscalExact(params) {
    // Paramètres par défaut
    const data = {
        brutAnnuel: params.brutAnnuel || 50000,
        tauxNeutre: params.tauxNeutre || 0.22,
        perPourcentage: params.perPourcentage || 0.08
    };
    
    // 1. Calcul du net annuel (sans PER)
    const netAnnuel = data.brutAnnuel * (1 - data.tauxNeutre);
    
    // 2. Calcul du montant versé au PER
    const montantPER = netAnnuel * data.perPourcentage;
    
    // 3. Calcul du revenu imposable sans PER
    const revenuImposableSansPER = netAnnuel;
    
    // 4. Calcul du revenu imposable avec PER (déduction fiscale)
    const revenuImposableAvecPER = netAnnuel - montantPER;
    
    // 5. Tranches d'imposition 2024 (France)
    const tranches = [
        { limite: 11294, taux: 0 },
        { limite: 28797, taux: 0.11 },
        { limite: 82341, taux: 0.30 },
        { limite: 177106, taux: 0.41 },
        { limite: Infinity, taux: 0.45 }
    ];
    
    // 6. Calcul de l'impôt par tranches sans PER
    let impotSansPER = 0;
    let revenuRestant = revenuImposableSansPER;
    
    for (let i = 0; i < tranches.length; i++) {
        const trancheActuelle = tranches[i];
        const tranchePrecedente = i > 0 ? tranches[i-1].limite : 0;
        
        // Montant imposable dans cette tranche
        const montantDansLaTranche = Math.min(
            Math.max(0, revenuRestant - tranchePrecedente),
            trancheActuelle.limite - tranchePrecedente
        );
        
        // Impôt pour cette tranche
        impotSansPER += montantDansLaTranche * trancheActuelle.taux;
        
        // Mise à jour du revenu restant
        revenuRestant -= montantDansLaTranche;
        
        // Si plus de revenu à imposer, on sort de la boucle
        if (revenuRestant <= 0) break;
    }
    
    // 7. Calcul de l'impôt par tranches avec PER
    let impotAvecPER = 0;
    revenuRestant = revenuImposableAvecPER;
    
    for (let i = 0; i < tranches.length; i++) {
        const trancheActuelle = tranches[i];
        const tranchePrecedente = i > 0 ? tranches[i-1].limite : 0;
        
        // Montant imposable dans cette tranche
        const montantDansLaTranche = Math.min(
            Math.max(0, revenuRestant - tranchePrecedente),
            trancheActuelle.limite - tranchePrecedente
        );
        
        // Impôt pour cette tranche
        impotAvecPER += montantDansLaTranche * trancheActuelle.taux;
        
        // Mise à jour du revenu restant
        revenuRestant -= montantDansLaTranche;
        
        // Si plus de revenu à imposer, on sort de la boucle
        if (revenuRestant <= 0) break;
    }
    
    // 8. Calcul de l'économie d'impôt grâce au PER
    const economieImpot = impotSansPER - impotAvecPER;
    
    // 9. Calcul du patrimoine total (net d'impôt + montant PER)
    const patrimoineTotal = (netAnnuel - impotAvecPER) + montantPER;
    
    // 10. Calcul du net disponible après impôt sans PER
    const netDisponibleSansPER = netAnnuel - impotSansPER;
    
    // 11. Calcul du net disponible après impôt avec PER (sans le montant versé au PER)
    const netDisponibleAvecPER = netAnnuel - impotAvecPER - montantPER;
    
    // 12. Calcul du taux d'imposition effectif
    const tauxEffectifSansPER = (impotSansPER / netAnnuel) * 100;
    const tauxEffectifAvecPER = (impotAvecPER / netAnnuel) * 100;
    
    // Retourner les résultats
    return {
        brutAnnuel: data.brutAnnuel,
        netAnnuel: netAnnuel,
        montantPER: montantPER,
        revenuImposableSansPER: revenuImposableSansPER,
        revenuImposableAvecPER: revenuImposableAvecPER,
        impotSansPER: impotSansPER,
        impotAvecPER: impotAvecPER,
        economieImpot: economieImpot,
        patrimoineTotal: patrimoineTotal,
        netDisponibleSansPER: netDisponibleSansPER,
        netDisponibleAvecPER: netDisponibleAvecPER,
        tauxEffectifSansPER: tauxEffectifSansPER,
        tauxEffectifAvecPER: tauxEffectifAvecPER
    };
}

/**
 * Initialise le calculateur fiscal
 */
function initFiscalCalculator() {
    // Vérifier si les éléments du formulaire fiscal existent
    const brutAnnuelInput = document.getElementById('brut-annuel');
    const tauxChargesInput = document.getElementById('taux-charges');
    const perPourcentageInput = document.getElementById('per-pourcentage');
    const calculerBtnFiscal = document.getElementById('calculer-fiscal');
    
    // Si les éléments n'existent pas, sortir de la fonction
    if (!brutAnnuelInput || !tauxChargesInput || !perPourcentageInput || !calculerBtnFiscal) {
        return;
    }
    
    // Fonction pour mettre à jour la prévisualisation
    function updateFiscalPreview() {
        try {
            const brutAnnuel = parseFloat(brutAnnuelInput.value) || 50000;
            const tauxCharges = parseFloat(tauxChargesInput.value) || 22;
            const perPourcentage = parseFloat(perPourcentageInput.value) || 8;
            
            const simulation = calculFiscalExact({
                brutAnnuel: brutAnnuel,
                tauxNeutre: tauxCharges / 100,
                perPourcentage: perPourcentage / 100
            });
            
            // Mettre à jour les résultats en temps réel
            document.getElementById('net-annuel-preview').textContent = Math.round(simulation.netAnnuel).toLocaleString('fr-FR') + ' €';
            document.getElementById('impot-sans-per-preview').textContent = Math.round(simulation.impotSansPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('impot-avec-per-preview').textContent = Math.round(simulation.impotAvecPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('economie-impot-preview').textContent = Math.round(simulation.economieImpot).toLocaleString('fr-FR') + ' €';
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la prévisualisation fiscale:', error);
        }
    }
    
    // Ajouter les écouteurs d'événement pour la mise à jour en temps réel
    brutAnnuelInput.addEventListener('input', updateFiscalPreview);
    tauxChargesInput.addEventListener('input', updateFiscalPreview);
    perPourcentageInput.addEventListener('input', updateFiscalPreview);
    
    // Ajouter un écouteur d'événement pour le bouton de calcul
    calculerBtnFiscal.addEventListener('click', function() {
        try {
            const brutAnnuel = parseFloat(brutAnnuelInput.value) || 50000;
            const tauxCharges = parseFloat(tauxChargesInput.value) || 22;
            const perPourcentage = parseFloat(perPourcentageInput.value) || 8;
            
            // Calculer les résultats fiscaux
            const simulation = calculFiscalExact({
                brutAnnuel: brutAnnuel,
                tauxNeutre: tauxCharges / 100,
                perPourcentage: perPourcentage / 100
            });
            
            // Mettre à jour l'interface avec les résultats
            document.getElementById('brut-annuel-result').textContent = simulation.brutAnnuel.toLocaleString('fr-FR') + ' €';
            document.getElementById('net-annuel-result').textContent = Math.round(simulation.netAnnuel).toLocaleString('fr-FR') + ' €';
            document.getElementById('montant-per-result').textContent = Math.round(simulation.montantPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('impot-sans-per').textContent = Math.round(simulation.impotSansPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('impot-avec-per').textContent = Math.round(simulation.impotAvecPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('economie-impot').textContent = Math.round(simulation.economieImpot).toLocaleString('fr-FR') + ' €';
            document.getElementById('patrimoine-total').textContent = Math.round(simulation.patrimoineTotal).toLocaleString('fr-FR') + ' €';
            document.getElementById('net-disponible-sans-per').textContent = Math.round(simulation.netDisponibleSansPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('net-disponible-avec-per').textContent = Math.round(simulation.netDisponibleAvecPER).toLocaleString('fr-FR') + ' €';
            document.getElementById('taux-effectif-sans-per').textContent = simulation.tauxEffectifSansPER.toFixed(2) + ' %';
            document.getElementById('taux-effectif-avec-per').textContent = simulation.tauxEffectifAvecPER.toFixed(2) + ' %';
            
            // Afficher la section des résultats si elle est masquée
            const resultatsSection = document.getElementById('resultats-fiscaux');
            if (resultatsSection) {
                resultatsSection.style.display = 'block';
            }
            
            // Créer un graphique comparatif si la section graphique existe
            updateFiscalChart(simulation);
        } catch (error) {
            console.error('Erreur lors du calcul fiscal:', error);
        }
    });
    
    // Effectuer un calcul initial pour afficher des résultats par défaut
    updateFiscalPreview();
}

/**
 * Met à jour le graphique comparatif fiscal
 * @param {Object} simulation - Résultats de la simulation fiscale
 */
function updateFiscalChart(simulation) {
    const ctx = document.getElementById('fiscal-chart');
    if (!ctx) return;
    
    // Détruire le graphique existant s'il y en a un
    if (window.fiscalChart) {
        window.fiscalChart.destroy();
    }
    
    // Données pour le graphique
    const data = {
        labels: ['Sans PER', 'Avec PER'],
        datasets: [
            {
                label: 'Impôt',
                data: [
                    Math.round(simulation.impotSansPER),
                    Math.round(simulation.impotAvecPER)
                ],
                backgroundColor: 'rgba(255, 71, 87, 0.7)',
                borderColor: 'rgba(255, 71, 87, 1)',
                borderWidth: 1
            },
            {
                label: 'Net disponible',
                data: [
                    Math.round(simulation.netDisponibleSansPER),
                    Math.round(simulation.netDisponibleAvecPER)
                ],
                backgroundColor: 'rgba(0, 210, 110, 0.7)',
                borderColor: 'rgba(0, 210, 110, 1)',
                borderWidth: 1
            },
            {
                label: 'Montant PER',
                data: [
                    0,
                    Math.round(simulation.montantPER)
                ],
                backgroundColor: 'rgba(33, 150, 243, 0.7)',
                borderColor: 'rgba(33, 150, 243, 1)',
                borderWidth: 1
            }
        ]
    };
    
    // Options du graphique
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                stacked: true,
                ticks: {
                    callback: function(value) {
                        return value.toLocaleString('fr-FR') + ' €';
                    }
                }
            },
            x: {
                stacked: true
            }
        },
        plugins: {
            legend: {
                position: 'top',
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        label += parseFloat(context.raw).toLocaleString('fr-FR') + ' €';
                        return label;
                    }
                }
            }
        }
    };
    
    // Créer le graphique
    window.fiscalChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: options
    });
}

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
 * Fonction pour mettre à jour les infos fiscales avec les vraies données
 */
function updateTaxInfo() {
    const vehicleId = document.getElementById('investment-vehicle').value;
    const taxInfoElement = document.getElementById('tax-info');
    
    if (!taxInfoElement) return;
    
    const enveloppe = getEnveloppeInfo(vehicleId);
    if (!enveloppe) return;
    
    // Construire le HTML avec les vraies données
    let html = `
        <h5 class="text-green-400 font-medium flex items-center mb-2">
            <i class="fas fa-chart-pie mr-2"></i>
            ${enveloppe.label} - ${enveloppe.type}
        </h5>
    `;
    
    // Afficher le plafond
    if (enveloppe.plafond) {
        const plafondText = typeof enveloppe.plafond === 'object' 
            ? `Solo: ${formatMoney(enveloppe.plafond.solo)} / Couple: ${formatMoney(enveloppe.plafond.couple)}`
            : `Plafond: ${formatMoney(enveloppe.plafond)}`;
        html += `<p class="text-sm font-medium text-blue-300">${plafondText}</p>`;
    }
    
    // Afficher la fiscalité
    if (enveloppe.seuil) {
        html += `<p class="text-sm text-gray-300 mb-1">
            <strong>Avant ${enveloppe.seuil} ans:</strong> ${enveloppe.fiscalite.avant || enveloppe.fiscalite.texte}
        </p>`;
        html += `<p class="text-sm text-gray-300 mb-1">
            <strong>Après ${enveloppe.seuil} ans:</strong> ${enveloppe.fiscalite.apres || 'Avantages fiscaux'}
        </p>`;
    } else {
        html += `<p class="text-sm text-gray-300 mb-1">${enveloppe.fiscalite.texte || 'Fiscalité standard'}</p>`;
    }
    
    taxInfoElement.innerHTML = html;
}

/**
 * Ajouter un sélecteur de rendement basé sur l'enveloppe
 */
function updateReturnSuggestions() {
    const vehicleId = document.getElementById('investment-vehicle').value;
    const returnSlider = document.getElementById('return-slider');
    
    // Rendements suggérés par type d'enveloppe
    const suggestedReturns = {
        'livret-a': 2.4,
        'ldds': 2.4,
        'lep': 3.5,
        'pel': 1.75,
        'cel': 1.5,
        'livret-jeune': 2.7,
        'assurance-vie': 2.5, // Fonds euros
        'scpi-cto': 4.7,
        'scpi-av': 4,
        'pea': 8,
        'pea-pme': 6,
        'cto': 8,
        'per': 3.5,
        'fcpi-fip': 5,
        'crypto-cto': 15
    };
    
    if (suggestedReturns[vehicleId]) {
        returnSlider.value = suggestedReturns[vehicleId];
        updateReturnValue(suggestedReturns[vehicleId]);
        
        // Afficher une info bulle
        showTooltip(`Rendement suggéré pour ${getEnveloppeInfo(vehicleId).label}: ${suggestedReturns[vehicleId]}%`);
    }
}

/**
 * Fonction pour suggérer le meilleur véhicule
 */
function suggestBestVehicle(amount, duration, objective = 'growth') {
    const suggestions = [];
    
    enveloppes.forEach(env => {
        let score = 0;
        let reasons = [];
        
        // Vérifier le plafond
        if (!env.plafond || 
            (typeof env.plafond === 'number' && amount <= env.plafond) ||
            (typeof env.plafond === 'object' && amount <= env.plafond.couple)) {
            score += 20;
        } else {
            reasons.push(`Montant dépasse le plafond`);
            score -= 10;
        }
        
        // Vérifier la durée vs seuil fiscal
        if (env.seuil && duration >= env.seuil) {
            score += 30;
            reasons.push(`Durée optimale (≥${env.seuil} ans)`);
        } else if (env.seuil && duration < env.seuil) {
            score -= 20;
            reasons.push(`Durée trop courte (<${env.seuil} ans)`);
        }
        
        // Bonus selon l'objectif
        if (objective === 'growth' && ['pea', 'cto', 'assurance-vie'].includes(env.id)) {
            score += 15;
        } else if (objective === 'safety' && ['livret-a', 'ldds', 'pel'].includes(env.id)) {
            score += 15;
        } else if (objective === 'retirement' && env.id === 'per') {
            score += 25;
            reasons.push('Idéal pour la retraite');
        }
        
        // Calculer le gain net estimé
        if (env.fiscalite.calcGainNet) {
            const estimatedGain = amount * Math.pow(1 + 0.07, duration) - amount;
            const netGain = env.fiscalite.calcGainNet({
                gain: estimatedGain,
                duree: duration,
                tmi: 0.30
            });
            const efficiency = netGain / estimatedGain;
            score += efficiency * 20;
        }
        
        suggestions.push({
            enveloppe: env,
            score,
            reasons,
            recommended: score > 40
        });
    });
    
    // Trier par score décroissant
    suggestions.sort((a, b) => b.score - a.score);
    
    return suggestions.slice(0, 3); // Top 3
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
        
        // Calculer et mettre à jour les résultats du budget
        updateBudgetResults(results, years);
        
        // Restaurer le bouton
        button.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Lancer la simulation';
        button.disabled = false;
    }, 800);
}

/**
 * Calcule les résultats d'investissement avec la vraie fiscalité
 * @param {number} initialAmount - Montant initial investi
 * @param {number} years - Nombre d'années
 * @param {number} annualReturn - Rendement annuel (en décimal)
 * @returns {Object} Résultats de la simulation
 */
function calculateInvestmentResults(initialAmount, years, annualReturn) {
    const vehicleId = document.getElementById('investment-vehicle').value;
    const enveloppe = getEnveloppeInfo(vehicleId);
    
    // Mode de versement
    const isPeriodicMode = document.getElementById('periodic-investment')?.classList.contains('selected');
    const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
    
    let totalInvested = initialAmount;
    let finalAmount = initialAmount;
    
    if (isPeriodicMode) {
        // Calcul pour versements périodiques
        const periodsPerYear = frequency === 'monthly' ? 12 : frequency === 'quarterly' ? 4 : 1;
        const totalPeriods = years * periodsPerYear;
        const periodRate = annualReturn / periodsPerYear;
        
        // Formule de la valeur future d'une annuité
        finalAmount = initialAmount * ((Math.pow(1 + periodRate, totalPeriods) - 1) / periodRate) * (1 + periodRate);
        totalInvested = initialAmount * totalPeriods;
    } else {
        // Versement unique
        finalAmount = initialAmount * Math.pow(1 + annualReturn, years);
    }
    
    const gains = finalAmount - totalInvested;
    
    // Calculer le net après impôts selon l'enveloppe
    let afterTaxAmount = finalAmount;
    let taxAmount = 0;
    
    if (enveloppe && enveloppe.fiscalite.calcGainNet) {
        // Utiliser la fonction de calcul spécifique
        const netGain = enveloppe.fiscalite.calcGainNet({
            gain: gains,
            duree: years,
            tmi: 0.30, // TMI par défaut, pourrait être un paramètre
            primesVerseesAvantRachat: 0, // Pour assurance-vie
            estCouple: false, // Pourrait être un paramètre
        });
        
        afterTaxAmount = totalInvested + netGain;
        taxAmount = gains - netGain;
    } else {
        // Fallback sur le calcul simple
        const taxRate = years >= 5 ? TAXES.PRL_SOC : TAXES.PFU_TOTAL;
        taxAmount = gains * taxRate;
        afterTaxAmount = finalAmount - taxAmount;
    }
    
    return {
        initialAmount: totalInvested,
        finalAmount: round2(finalAmount),
        gains: round2(gains),
        afterTaxAmount: round2(afterTaxAmount),
        taxAmount: round2(taxAmount),
        years,
        annualReturn,
        vehicleId,
        enveloppe
    };
}

/**
 * Calcule et met à jour les résultats du budget
 * @param {Object} results - Résultats de la simulation d'investissement
 * @param {number} years - Nombre d'années
 */
function updateBudgetResults(results, years) {
    // Récupérer les données du budget
    const budgetLoyer = parseFloat(document.getElementById('simulation-budget-loyer')?.value) || 1000;
    const budgetQuotidien = parseFloat(document.getElementById('simulation-budget-quotidien')?.value) || 1200;
    const budgetExtra = parseFloat(document.getElementById('simulation-budget-extra')?.value) || 500;
    const budgetInvest = parseFloat(document.getElementById('simulation-budget-invest')?.value) || 300;
    
    // Calculer les totaux du budget
    const depensesTotales = budgetLoyer + budgetQuotidien + budgetExtra + budgetInvest;
    const revenuMensuel = (results.afterTaxAmount / years) / 12; // Revenu mensuel estimé
    const epargnePossible = Math.max(0, revenuMensuel - depensesTotales);
    const tauxEpargne = revenuMensuel > 0 ? (epargnePossible / revenuMensuel) * 100 : 0;
    
    // Formater les valeurs monétaires
    const formatter = new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR',
        maximumFractionDigits: 2
    });
    
    // Mettre à jour l'affichage du budget si les éléments existent
    const revenuElement = document.getElementById('simulation-revenu-mensuel');
    const depensesElement = document.getElementById('simulation-depenses-totales');
    const epargneElement = document.getElementById('simulation-epargne-possible');
    const tauxElement = document.getElementById('simulation-taux-epargne');
    
    if (revenuElement) revenuElement.textContent = formatter.format(revenuMensuel);
    if (depensesElement) depensesElement.textContent = formatter.format(depensesTotales);
    if (epargneElement) epargneElement.textContent = formatter.format(epargnePossible);
    if (tauxElement) tauxElement.textContent = tauxEpargne.toFixed(1) + '%';
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
 * Met à jour le message d'adéquation au profil avec analyse intelligente
 * @param {Object} results - Résultats de la simulation
 */
function updateProfileAdequacy(results) {
    const adequacyElement = document.getElementById('profile-adequacy');
    if (!adequacyElement) return;
    
    const suggestions = suggestBestVehicle(
        results.initialAmount,
        results.years,
        'growth' // Objectif par défaut
    );
    
    const currentVehicle = suggestions.find(s => s.enveloppe.id === results.vehicleId);
    const bestVehicle = suggestions[0];
    
    let adequacyScore = currentVehicle ? Math.round(currentVehicle.score / 20) : 3;
    adequacyScore = Math.min(5, Math.max(1, adequacyScore));
    
    let adequacyMessages = [];
    
    // Messages sur le véhicule actuel
    if (currentVehicle) {
        adequacyMessages = adequacyMessages.concat(currentVehicle.reasons);
    }
    
    // Suggérer une alternative si meilleure
    if (bestVehicle && bestVehicle.enveloppe.id !== results.vehicleId && bestVehicle.score > (currentVehicle?.score || 0)) {
        adequacyMessages.push(
            `💡 Alternative suggérée: ${bestVehicle.enveloppe.label} pourrait être plus avantageux`
        );
    }
    
    // Ajouter des conseils généraux
    if (results.enveloppe?.plafond && results.initialAmount > results.enveloppe.plafond * 0.8) {
        adequacyMessages.push(
            `⚠️ Vous approchez du plafond. Pensez à diversifier sur d'autres enveloppes.`
        );
    }
    
    // Mettre à jour l'affichage
    const adequacyText = adequacyElement.querySelector('.adequacy-score');
    const adequacyList = adequacyElement.querySelector('.adequacy-list');
    
    if (adequacyText) {
        adequacyText.textContent = `Adéquation: ${adequacyScore}/5`;
        adequacyText.className = `adequacy-score bg-${adequacyScore >= 4 ? 'green' : adequacyScore >= 3 ? 'yellow' : 'red'}-900 bg-opacity-20 text-${adequacyScore >= 4 ? 'green' : adequacyScore >= 3 ? 'yellow' : 'red'}-400 inline-block px-2 py-1 rounded text-sm font-medium mb-2`;
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
    if (document.querySelector('.results-container') && document.querySelector('.results-container').style.display !== 'none') {
        runSimulation();
    }
}
