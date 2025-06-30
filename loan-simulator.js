/**
 * loan-simulator.js - Simulateur de prêt immobilier avec PTZ intégré
 * 
 * Implémentation des 4 chantiers PTZ :
 * 1. Situation claire lors du solde du prêt principal
 * 2. Option PTZ différé
 * 3. Couplage remboursement total ↔ inclure PTZ
 * 4. Vérifications et finitions
 */

// ====================================================================
// VARIABLES GLOBALES ET CONFIGURATION
// ====================================================================

let loanChart = null;
const loanData = {
    params: {},
    results: {},
    ptzParams: {},
    earlyRepayments: []
};

// Configuration de formatage
const formatMontant = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
};

// Debounce pour éviter les recalculs trop fréquents
const debouncedCalculateLoan = debounce(calculateLoan, 300);

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ====================================================================
// INITIALISATION DU SIMULATEUR
// ====================================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeLoanSimulator();
});

function initializeLoanSimulator() {
    console.log('🚀 Initialisation du simulateur de prêt...');
    
    // Éléments DOM principaux
    const elements = {
        // Paramètres de base
        loanAmount: document.getElementById('loan-amount'),
        interestRateSlider: document.getElementById('interest-rate-slider'),
        loanDurationSlider: document.getElementById('loan-duration-slider'),
        insuranceRateSlider: document.getElementById('insurance-rate-slider'),
        
        // PTZ
        enablePtz: document.getElementById('enable-ptz'),
        ptzFields: document.getElementById('ptz-fields'),
        ptzAmount: document.getElementById('ptz-amount'),
        ptzDurationSlider: document.getElementById('ptz-duration-slider'),
        ptzDiffereContainer: document.getElementById('ptz-differe-container'),
        ptzDiffereSlider: document.getElementById('ptz-differe-slider'),
        ptzDiffereValue: document.getElementById('ptz-differe-value'),
        ptzFirstPayment: document.getElementById('ptz-first-payment'),
        
        // Remboursements anticipés
        totalRepayment: document.getElementById('total-repayment'),
        includePtzTotal: document.getElementById('include-ptz-total'),
        ptzWarning: document.getElementById('ptz-warning'),
        
        // Boutons et actions
        calculateButton: document.getElementById('calculate-loan-button'),
        addRepaymentBtn: document.getElementById('add-repayment-btn'),
        resetRepaymentsBtn: document.getElementById('reset-repayments'),
        
        // Résultats
        ptzResume: document.getElementById('ptz-resume'),
        amortizationTable: document.getElementById('amortization-table')
    };
    
    // Vérification des éléments critiques
    if (!elements.enablePtz || !elements.calculateButton) {
        console.error('❌ Éléments DOM critiques manquants');
        return;
    }
    
    setupEventListeners(elements);
    setupPTZIntegration(elements);
    setupSliderUpdates(elements);
    initializeTooltips();
    
    console.log('✅ Simulateur de prêt initialisé avec succès');
}

// ====================================================================
// CHANTIER 1: SITUATION CLAIRE LORS DU SOLDE DU PRÊT PRINCIPAL
// ====================================================================

function toggleTotalRepaymentUI(enabled) {
    const enablePtzCheckbox = document.getElementById('enable-ptz');
    const ptzWarning = document.getElementById('ptz-warning');
    const includePtzCheckbox = document.getElementById('include-ptz-total');
    
    // Afficher/masquer l'alerte PTZ
    if (ptzWarning) {
        ptzWarning.classList.toggle('hidden', !enabled || !enablePtzCheckbox?.checked);
    }
    
    // Activer/désactiver la checkbox "Inclure PTZ"
    if (includePtzCheckbox) {
        includePtzCheckbox.disabled = !enabled || !enablePtzCheckbox?.checked;
        if (!enabled) {
            includePtzCheckbox.checked = false;
        }
    }
    
    // Déclencher un recalcul si nécessaire
    if (enabled) {
        debouncedCalculateLoan();
    }
}

function updatePtzSummary() {
    const enablePTZ = document.getElementById('enable-ptz')?.checked;
    const ptzParams = gatherPtzParams();
    const resume = document.getElementById('ptz-resume');
    
    if (!enablePTZ || !ptzParams.enabled || !resume) {
        if (resume) resume.classList.add('hidden');
        return;
    }
    
    const mensualitePTZ = ptzParams.montant / ptzParams.dureeMois;
    const results = loanData.results;
    
    if (results && results.dureeReelle) {
        const capitalRestant = ptzParams.montant - (mensualitePTZ * Math.max(0, results.dureeReelle - ptzParams.differeMois));
        const moisRestants = Math.max(0, ptzParams.dureeMois - results.dureeReelle);
        
        const resumeText = document.getElementById('ptz-resume-text');
        if (resumeText) {
            resumeText.innerHTML = `PTZ restant : ${formatMontant(capitalRestant)} 
                <span class="text-xs block mt-1">
                    ${moisRestants} mois restants • ${formatMontant(mensualitePTZ)}/mois
                </span>`;
        }
        
        resume.classList.remove('hidden');
    }
    
    // Ajouter le libellé du différé
    updatePtzDiffereInfo(ptzParams);
}

function updatePtzDiffereInfo(ptzParams) {
    const differeInfo = document.getElementById('ptz-first-payment');
    if (differeInfo && ptzParams) {
        const premierPaiement = ptzParams.differeMois + 1;
        differeInfo.textContent = premierPaiement;
    }
}

function addPtzRowToAmortizationTable(dureeReelle, ptzParams) {
    const tableBody = document.getElementById('amortization-table');
    if (!tableBody || !ptzParams.enabled) return;
    
    // Supprimer les anciennes lignes PTZ
    tableBody.querySelectorAll('.ptz-row').forEach(row => row.remove());
    
    if (dureeReelle < ptzParams.dureeMois) {
        const mensualitePTZ = ptzParams.montant / ptzParams.dureeMois;
        const capitalRestant = ptzParams.montant - (mensualitePTZ * Math.max(0, dureeReelle - ptzParams.differeMois));
        
        const trPtz = document.createElement('tr');
        trPtz.className = 'bg-amber-900 bg-opacity-10 italic ptz-row';
        trPtz.innerHTML = `
            <td colspan="2" class="px-3 py-2 text-amber-400">
                <i class="fas fa-info-circle mr-1"></i>PTZ restant
            </td>
            <td class="px-3 py-2 text-right text-amber-400">${formatMontant(capitalRestant)}</td>
            <td colspan="3" class="px-3 py-2 text-xs text-amber-300">
                Prêt à taux zéro continue • ${Math.max(0, ptzParams.dureeMois - dureeReelle)} mois
            </td>
        `;
        tableBody.appendChild(trPtz);
    }
}

// ====================================================================
// CHANTIER 2: OPTION PTZ DIFFÉRÉ
// ====================================================================

function setupPTZDiffereIntegration(elements) {
    const { ptzDiffereSlider, ptzDiffereValue, ptzDiffereContainer, enablePtz, ptzDurationSlider } = elements;
    
    if (!ptzDiffereSlider || !ptzDiffereValue) return;
    
    // Afficher/masquer le container différé selon l'état PTZ
    if (enablePtz && ptzDiffereContainer) {
        enablePtz.addEventListener('change', function() {
            ptzDiffereContainer.classList.toggle('hidden', !this.checked);
            if (this.checked) {
                updatePtzDiffereConstraints();
            }
        });
    }
    
    // Mise à jour de la valeur affichée
    ptzDiffereSlider.addEventListener('input', function() {
        const value = parseInt(this.value);
        ptzDiffereValue.textContent = `${value} mois`;
        updatePtzDiffereInfo({ differeMois: value });
        debouncedCalculateLoan();
    });
    
    // Mise à jour des contraintes lors du changement de durée PTZ
    if (ptzDurationSlider) {
        ptzDurationSlider.addEventListener('input', function() {
            updatePtzDiffereConstraints();
        });
    }
}

function updatePtzDiffereConstraints() {
    const ptzDurationSlider = document.getElementById('ptz-duration-slider');
    const ptzDiffereSlider = document.getElementById('ptz-differe-slider');
    const loanDurationSlider = document.getElementById('loan-duration-slider');
    
    if (!ptzDurationSlider || !ptzDiffereSlider || !loanDurationSlider) return;
    
    const ptzDurationYears = parseInt(ptzDurationSlider.value);
    const loanDurationYears = parseInt(loanDurationSlider.value);
    
    // Le différé ne peut pas dépasser la durée PTZ - 12 mois minimum de remboursement
    const maxDiffere = Math.min(
        (ptzDurationYears * 12) - 12,  // Maximum PTZ - 1 an
        loanDurationYears * 12         // ou durée du prêt principal
    );
    
    ptzDiffereSlider.max = Math.max(0, maxDiffere);
    
    // Ajuster la valeur actuelle si nécessaire
    if (parseInt(ptzDiffereSlider.value) > maxDiffere) {
        ptzDiffereSlider.value = maxDiffere;
        const ptzDiffereValue = document.getElementById('ptz-differe-value');
        if (ptzDiffereValue) {
            ptzDiffereValue.textContent = `${maxDiffere} mois`;
        }
    }
}

function validatePtzDiffere(ptzParams, loanDurationYears) {
    const diffMax = (ptzParams.dureeAnnees * 12) - 12;
    
    if (ptzParams.differeMois > diffMax) {
        console.warn(`⚠️ Différé PTZ trop élevé, ajusté de ${ptzParams.differeMois} à ${diffMax} mois`);
        ptzParams.differeMois = diffMax;
    }
    
    if (ptzParams.differeMois > (loanDurationYears * 12)) {
        const maxDiffere = loanDurationYears * 12;
        console.warn(`⚠️ Différé PTZ > durée prêt, ajusté à ${maxDiffere} mois`);
        ptzParams.differeMois = maxDiffere;
    }
    
    return ptzParams;
}

// ====================================================================
// CHANTIER 3: COUPLAGE REMBOURSEMENT TOTAL ↔ INCLURE PTZ
// ====================================================================

function setupTotalRepaymentPTZCoupling(elements) {
    const { totalRepayment, includePtzTotal, ptzWarning } = elements;
    
    if (!totalRepayment) return;
    
    totalRepayment.addEventListener('change', function() {
        const isTotal = this.checked;
        toggleTotalRepaymentUI(isTotal);
        
        // Recalculer automatiquement si remboursement total activé
        if (isTotal) {
            debouncedCalculateLoan();
        }
    });
    
    if (includePtzTotal) {
        includePtzTotal.addEventListener('change', function() {
            debouncedCalculateLoan();
        });
    }
}

function calculateTotalRepaymentAmount(mois, ptzParams, isTotal, includePTZ) {
    let montant = 0;
    
    if (isTotal) {
        // Calcul du capital restant du prêt principal
        const results = loanData.results;
        if (results && results.schedule && results.schedule[mois - 1]) {
            montant = results.schedule[mois - 1].capitalRestant;
        }
        
        // Ajouter le PTZ si demandé
        if (includePTZ && ptzParams?.enabled) {
            const mensualitePTZ = ptzParams.montant / ptzParams.dureeMois;
            const debutPTZ = ptzParams.differeMois + 1;
            
            if (mois > debutPTZ) {
                const remboursementDejaFait = mensualitePTZ * (mois - debutPTZ);
                const ptzRestant = Math.max(0, ptzParams.montant - remboursementDejaFait);
                montant += ptzRestant;
            } else {
                // PTZ pas encore commencé, inclure la totalité
                montant += ptzParams.montant;
            }
        }
    }
    
    return Math.max(0, montant);
}

// ====================================================================
// MOTEUR DE CALCUL PRINCIPAL
// ====================================================================

function calculateLoan() {
    try {
        const params = gatherLoanParams();
        const ptzParams = gatherPtzParams();
        
        // Validation des paramètres
        if (!validateParams(params, ptzParams)) {
            console.error('❌ Paramètres invalides');
            return;
        }
        
        // Calcul du prêt principal
        const results = calculateLoanSchedule(params, ptzParams);
        
        // Stockage des résultats
        loanData.params = params;
        loanData.ptzParams = ptzParams;
        loanData.results = results;
        
        // Mise à jour de l'interface
        updateResults(results, ptzParams);
        updateAmortizationTable(results, ptzParams);
        updateChart(results);
        updatePtzSummary();
        
        // Activation du bouton PDF
        activatePDFExport();
        
        console.log('✅ Calcul du prêt terminé', { params, ptzParams, results });
        
    } catch (error) {
        console.error('❌ Erreur lors du calcul:', error);
        showErrorMessage('Erreur lors du calcul du prêt. Vérifiez vos paramètres.');
    }
}

function gatherLoanParams() {
    return {
        montant: parseFloat(document.getElementById('loan-amount')?.value) || 200000,
        taux: parseFloat(document.getElementById('interest-rate-slider')?.value) || 3.09,
        dureeAnnees: parseInt(document.getElementById('loan-duration-slider')?.value) || 25,
        tauxAssurance: parseFloat(document.getElementById('insurance-rate-slider')?.value) || 0.14,
        assuranceCapitalInitial: document.getElementById('assurance-capital-initial')?.checked || false,
        fraisDossier: parseFloat(document.getElementById('frais-dossier')?.value) || 2000,
        fraisGarantie: parseFloat(document.getElementById('frais-garantie')?.value) || 0,
        fraisTenueCompte: parseFloat(document.getElementById('frais-tenue-compte')?.value) || 710,
        // Renégociation
        nouveauTaux: parseFloat(document.getElementById('new-interest-rate-slider')?.value) || 2.3,
        moisRenegociation: parseInt(document.getElementById('renegotiation-month-slider')?.value) || 36,
        appliquerRenegociation: document.getElementById('apply-renegotiation')?.checked || false
    };
}

function gatherPtzParams() {
    const enabled = document.getElementById('enable-ptz')?.checked || false;
    
    if (!enabled) {
        return { enabled: false };
    }
    
    const dureeAnnees = parseInt(document.getElementById('ptz-duration-slider')?.value) || 20;
    const differeMois = parseInt(document.getElementById('ptz-differe-slider')?.value) || 0;
    
    return {
        enabled: true,
        montant: parseFloat(document.getElementById('ptz-amount')?.value) || 50000,
        dureeAnnees,
        dureeMois: dureeAnnees * 12,
        differeMois,
        tauxInteret: 0 // PTZ = 0% d'intérêt
    };
}

function validateParams(params, ptzParams) {
    // Validations de base
    if (params.montant <= 0 || params.dureeAnnees <= 0 || params.taux < 0) {
        return false;
    }
    
    // Validation PTZ
    if (ptzParams.enabled) {
        if (ptzParams.montant <= 0 || ptzParams.dureeAnnees <= 0) {
            return false;
        }
        
        // Validation du différé
        validatePtzDiffere(ptzParams, params.dureeAnnees);
    }
    
    return true;
}

function calculateLoanSchedule(params, ptzParams) {
    const tauxMensuel = params.taux / 100 / 12;
    const nbMois = params.dureeAnnees * 12;
    
    // Calcul de la mensualité du prêt principal
    const mensualiteCapitalInterets = (params.montant * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -nbMois));
    
    // Calcul de l'assurance mensuelle
    let assuranceMensuelle;
    if (params.assuranceCapitalInitial) {
        assuranceMensuelle = (params.montant * params.tauxAssurance / 100) / 12;
    }
    
    // Mensualité totale prêt principal
    const mensualitePrincipal = mensualiteCapitalInterets + (params.assuranceCapitalInitial ? assuranceMensuelle : 0);
    
    // Mensualité PTZ
    const mensualitePTZ = ptzParams.enabled ? ptzParams.montant / ptzParams.dureeMois : 0;
    
    // Génération du planning d'amortissement
    const schedule = [];
    let capitalRestant = params.montant;
    let totalInterets = 0;
    let totalAssurance = 0;
    let dureeReelle = nbMois;
    
    for (let mois = 1; mois <= nbMois; mois++) {
        const interets = capitalRestant * tauxMensuel;
        const capitalRembourse = mensualiteCapitalInterets - interets;
        
        // Assurance (sur capital restant si pas sur capital initial)
        const assurance = params.assuranceCapitalInitial ? 
            assuranceMensuelle : 
            (capitalRestant * params.tauxAssurance / 100) / 12;
        
        capitalRestant -= capitalRembourse;
        totalInterets += interets;
        totalAssurance += assurance;
        
        // Mensualité PTZ pour ce mois
        const ptzActive = ptzParams.enabled && mois > ptzParams.differeMois;
        const mensualitePTZMois = ptzActive ? mensualitePTZ : 0;
        
        // Mensualité totale (principal + PTZ)
        const mensualiteTotale = mensualiteCapitalInterets + assurance + mensualitePTZMois;
        
        schedule.push({
            mois,
            mensualiteTotal: mensualiteTotale,
            mensualitePrincipal: mensualiteCapitalInterets + assurance,
            mensualitePTZ: mensualitePTZMois,
            capital: capitalRembourse,
            interets,
            assurance,
            capitalRestant: Math.max(0, capitalRestant),
            ptzActif: ptzActive
        });
        
        // Arrêt si capital entièrement remboursé
        if (capitalRestant <= 0.01) {
            dureeReelle = mois;
            break;
        }
    }
    
    // Calculs de synthèse
    const fraisTotaux = params.fraisDossier + params.fraisGarantie + params.fraisTenueCompte;
    const coutTotal = params.montant + totalInterets + totalAssurance + fraisTotaux;
    const taeg = calculateTAEG(params.montant, mensualitePrincipal, nbMois, fraisTotaux);
    
    return {
        mensualitePrincipal,
        mensualitePTZ,
        mensualiteTotale: mensualitePrincipal + (ptzParams.enabled ? mensualitePTZ : 0),
        totalInterets,
        totalAssurance,
        fraisTotaux,
        coutTotal,
        taeg,
        dureeReelle,
        schedule
    };
}

function calculateTAEG(capital, mensualite, nbMois, frais) {
    // Calcul TAEG simplifié par approximation
    const montantFinance = capital + frais;
    const totalRembourse = mensualite * nbMois;
    const tauxEffectif = (totalRembourse / montantFinance - 1) / (nbMois / 12);
    return tauxEffectif * 100;
}

// ====================================================================
// MISE À JOUR DE L'INTERFACE
// ====================================================================

function updateResults(results, ptzParams) {
    // Mise à jour des valeurs principales
    updateElement('monthly-payment', formatMontant(results.mensualiteTotale));
    updateElement('total-interest', formatMontant(results.totalInterets));
    updateElement('total-cost', formatMontant(results.coutTotal));
    updateElement('total-fees', formatMontant(results.fraisTotaux));
    updateElement('taeg', results.taeg.toFixed(2) + '%');
    updateElement('cout-global', formatMontant(results.coutTotal));
    updateElement('ratio-cout', (results.coutTotal / loanData.params.montant).toFixed(2));
    
    // Mise à jour du résumé PTZ
    updatePtzSummary();
}

function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function updateAmortizationTable(results, ptzParams) {
    const tableBody = document.getElementById('amortization-table');
    if (!tableBody) return;
    
    // Vider le tableau
    tableBody.innerHTML = '';
    
    // Remplir avec les données (première année + points clés)
    const schedule = results.schedule;
    const maxRows = 24; // Limiter l'affichage
    
    schedule.slice(0, maxRows).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-3 py-2 text-center">${row.mois}</td>
            <td class="px-3 py-2 text-right">${formatMontant(row.mensualiteTotal)}</td>
            <td class="px-3 py-2 text-right">${formatMontant(row.capital)}</td>
            <td class="px-3 py-2 text-right">${formatMontant(row.interets)}</td>
            <td class="px-3 py-2 text-right">${formatMontant(row.assurance)}</td>
            <td class="px-3 py-2 text-right">${formatMontant(row.capitalRestant)}</td>
        `;
        
        // Marquer les lignes avec PTZ actif
        if (row.ptzActif) {
            tr.classList.add('bg-amber-900', 'bg-opacity-5');
        }
        
        tableBody.appendChild(tr);
    });
    
    // Ajouter la ligne PTZ restant si nécessaire
    addPtzRowToAmortizationTable(results.dureeReelle, ptzParams);
}

function updateChart(results) {
    const ctx = document.getElementById('loan-chart')?.getContext('2d');
    if (!ctx) return;
    
    // Détruire l'ancien graphique
    if (loanChart) {
        loanChart.destroy();
    }
    
    // Préparer les données
    const labels = results.schedule.slice(0, 60).map(row => `M${row.mois}`); // 5 premières années
    const capitalData = results.schedule.slice(0, 60).map(row => row.capital);
    const interestData = results.schedule.slice(0, 60).map(row => row.interets);
    
    // Créer le nouveau graphique
    loanChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Capital remboursé',
                    data: capitalData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true
                },
                {
                    label: 'Intérêts',
                    data: interestData,
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Évolution Capital vs Intérêts',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    ticks: { 
                        color: '#fff',
                        callback: function(value) {
                            return formatMontant(value);
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });
}

// ====================================================================
// CONFIGURATION DES ÉVÉNEMENTS
// ====================================================================

function setupEventListeners(elements) {
    // Bouton de calcul principal
    if (elements.calculateButton) {
        elements.calculateButton.addEventListener('click', calculateLoan);
    }
    
    // Paramètres de base
    [elements.loanAmount, elements.interestRateSlider, elements.loanDurationSlider, elements.insuranceRateSlider]
        .filter(Boolean)
        .forEach(element => {
            element.addEventListener('input', debouncedCalculateLoan);
        });
    
    // Événements PTZ
    setupPTZIntegration(elements);
    setupPTZDiffereIntegration(elements);
    setupTotalRepaymentPTZCoupling(elements);
    
    // Bouton de réinitialisation
    if (elements.resetRepaymentsBtn) {
        elements.resetRepaymentsBtn.addEventListener('click', resetAllRepayments);
    }
}

function setupPTZIntegration(elements) {
    const { enablePtz, ptzFields, ptzAmount, ptzDurationSlider } = elements;
    
    if (!enablePtz || !ptzFields) return;
    
    // Activation/désactivation du PTZ
    enablePtz.addEventListener('change', function() {
        const isEnabled = this.checked;
        
        if (isEnabled) {
            ptzFields.classList.remove('hidden');
            ptzFields.style.maxHeight = '400px';
            ptzFields.style.opacity = '1';
        } else {
            ptzFields.style.maxHeight = '0';
            ptzFields.style.opacity = '0';
            setTimeout(() => ptzFields.classList.add('hidden'), 300);
        }
        
        // Afficher/masquer le container différé
        const ptzDiffereContainer = document.getElementById('ptz-differe-container');
        if (ptzDiffereContainer) {
            ptzDiffereContainer.classList.toggle('hidden', !isEnabled);
        }
        
        debouncedCalculateLoan();
    });
    
    // Paramètres PTZ
    [ptzAmount, ptzDurationSlider]
        .filter(Boolean)
        .forEach(element => {
            element.addEventListener('input', debouncedCalculateLoan);
        });
}

function setupSliderUpdates(elements) {
    // Mise à jour des valeurs affichées des sliders
    const sliders = [
        { slider: elements.interestRateSlider, display: 'interest-rate-value', suffix: '%' },
        { slider: elements.loanDurationSlider, display: 'loan-duration-value', suffix: ' ans' },
        { slider: elements.insuranceRateSlider, display: 'insurance-rate-value', suffix: '%' },
        { slider: elements.ptzDurationSlider, display: 'ptz-duration-value', suffix: ' ans' }
    ];
    
    sliders.forEach(({ slider, display, suffix }) => {
        if (slider && document.getElementById(display)) {
            slider.addEventListener('input', function() {
                document.getElementById(display).textContent = this.value + suffix;
            });
        }
    });
}

// ====================================================================
// CHANTIER 4: VÉRIFICATIONS ET FINITIONS
// ====================================================================

function resetAllRepayments() {
    loanData.earlyRepayments = [];
    const repaymentsList = document.getElementById('repayments-list');
    if (repaymentsList) {
        repaymentsList.innerHTML = '';
    }
    
    // Décocher les options de remboursement
    const totalRepayment = document.getElementById('total-repayment');
    const includePtzTotal = document.getElementById('include-ptz-total');
    
    if (totalRepayment) totalRepayment.checked = false;
    if (includePtzTotal) includePtzTotal.checked = false;
    
    toggleTotalRepaymentUI(false);
    debouncedCalculateLoan();
    
    showSuccessMessage('Tous les remboursements anticipés ont été réinitialisés.');
}

function initializeTooltips() {
    // Initialiser les tooltips pour les icônes d'aide
    document.querySelectorAll('.loan-option-info').forEach(icon => {
        icon.addEventListener('mouseenter', function() {
            const title = this.getAttribute('title');
            if (title) {
                showTooltip(this, title);
            }
        });
        
        icon.addEventListener('mouseleave', function() {
            hideTooltip();
        });
    });
}

function showTooltip(element, text) {
    // Implémentation simple de tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'loan-tooltip';
    tooltip.textContent = text;
    tooltip.style.cssText = `
        position: absolute;
        background: rgba(1, 42, 74, 0.95);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        max-width: 250px;
        z-index: 1000;
        border: 1px solid rgba(0, 255, 135, 0.3);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    
    // Supprimer après 3 secondes
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    }, 3000);
}

function hideTooltip() {
    document.querySelectorAll('.loan-tooltip').forEach(tooltip => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    });
}

function showSuccessMessage(message) {
    console.log('✅', message);
    // Ajouter une notification visuelle si nécessaire
}

function showErrorMessage(message) {
    console.error('❌', message);
    // Ajouter une notification d'erreur visuelle si nécessaire
}

function activatePDFExport() {
    const exportBtn = document.getElementById('export-loan-pdf');
    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        exportBtn.title = 'Télécharger la synthèse PDF complète';
    }
}

// ====================================================================
// UTILITAIRES D'EXPORT
// ====================================================================

// Rendre les fonctions principales accessibles globalement
window.calculateLoan = calculateLoan;
window.loanData = loanData;

// Export des fonctions pour l'intégration avec le PDF
window.getLoanDataForPDF = function() {
    return {
        ...loanData,
        generatedAt: new Date()
    };
};

console.log('📊 Module loan-simulator.js chargé avec succès');
