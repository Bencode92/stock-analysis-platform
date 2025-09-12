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

/** ================================
 *  Préréglages de frais par enveloppe (FR 09/2025)
 *  (valeurs typiques/conseillées — modifiables)
 *  mgmt = %/an ; entry = % sur versements ; exit = % à la sortie ; fixed = €/an
 * ================================= */
// Données marché FR (09/2025) — baselines "low-cost"
const FEE_PRESETS = {
  // Actions / enveloppes boursières
  pea:     { mgmt: 0.00, entry: 0.10, exit: 0.10, fixed: 0,
             note: `PEA courtier en ligne : 0 % sur encours ; ~0,1 % par ordre (achat/vente)` },
  'pea-pme':{ mgmt: 0.00, entry: 0.10, exit: 0.10, fixed: 0,
             note: `Identique PEA (plafonds/fiscalité à part)` },
  peac:    { mgmt: 0.70, entry: 1.00, exit: 0.00, fixed: 0,
             note: `PEAC : ~0,70 %/an ; 1 % sur versements ; transfert sortant 1 % si <5 ans` },
  cto:     { mgmt: 0.00, entry: 0.10, exit: 0.10, fixed: 0,
             note: `CTO courtier en ligne : 0 % encours ; ~0,1 % par ordre` },

  // Assurantiel
  'assurance-vie': { mgmt: 0.50, entry: 0.00, exit: 0.00, fixed: 0,
                     note: `Contrats en ligne : 0 % entrée ; 0,5–0,6 %/an sur UC` },
  per:             { mgmt: 0.70, entry: 0.00, exit: 0.00, fixed: 0,
                     note: `PER individuel en ligne : ≤0,7 %/an ; 0 % entrée/arbitrages` },

  // Pierre-papier
  'scpi-av':  { mgmt: 0.50, entry: 2.00, exit: 0.00, fixed: 0,
                note: `SCPI via AV : +0,5–0,7 %/an (contrat) ; 2–6 % d'entrée (parfois 0 %)` },
  'scpi-cto': { mgmt: 0.00, entry: 10.00, exit: 0.00, fixed: 0,
                note: `SCPI en direct : 8–12 % de souscription ; gestion prélevée sur loyers` },
  opci:       { mgmt: 1.50, entry: 3.00,  exit: 0.00, fixed: 0,
                note: `OPCI : 1–2 %/an ; 2–5 % d'entrée` },

  // Épargne réglementée
  'livret-a':     { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais réglementaire` },
  ldds:           { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais réglementaire` },
  lep:            { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais réglementaire` },
  pel:            { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais (hors transfert)` },
  cel:            { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais` },
  'livret-jeune': { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais réglementaire` },

  // Défisc / alternatifs
  'fcpi-fip':   { mgmt: 3.50, entry: 4.00, exit: 0.00, fixed: 0,
                  note: `FCPI/FIP : 3–4 %/an ; 4–5 % d'entrée` },
  'crypto-cto': { mgmt: 0.00, entry: 0.10, exit: 0.10, fixed: 0,
                  note: `Crypto : ~0,1 % maker/taker ; 0 % encours` },

  _default: { mgmt: 0, entry: 0, exit: 0, fixed: 0, note: `Aucun frais par défaut` }
};

// ============================================
// FONCTIONS DE CALCUL DU RENDEMENT ANNUALISÉ
// ============================================

/**
 * Calcul du rendement annualisé simple (CAGR) pour versement unique
 * @param {Object} params - Paramètres du calcul
 * @param {number} params.invested - Montant initial investi
 * @param {number} params.finalValue - Valeur finale obtenue
 * @param {number} params.years - Nombre d'années
 * @returns {number} Rendement annualisé (décimal)
 */
function calcCAGR({ invested, finalValue, years }) {
    if (invested === 0 || years === 0 || finalValue <= 0) return 0;
    return Math.pow(finalValue / invested, 1 / years) - 1;
}

/**
 * Taux Interne de Rendement annualisé pour versements périodiques
 * Newton-Raphson sur le taux périodique, puis conversion en taux annuel effectif.
 * @param {number} initial         Dépôt initial (t0)
 * @param {number} periodic        Versement par période (>0)
 * @param {number} periodsPerYear  52, 12, 4 ou 1
 * @param {number} years           Durée totale
 * @param {number} finalValue      Valeur finale
 * @param {number} guess           Taux annuel "nominal" pour amorcer NR  (optionnel)
 * @return {number}                Taux annuel effectif (décimal)
 */
function calcIRR({ initial, periodic, periodsPerYear, years, finalValue, guess = 0.07 }) {
    if (periodic === 0 || periodsPerYear === 0) {
        return calcCAGR({ invested: initial, finalValue, years });
    }

    const n  = years * periodsPerYear;
    const cf = Array(n + 1).fill(-periodic);
    cf[0] = -initial;
    cf[n] += finalValue;

    // Point de départ = taux périodique ≈ taux annuel / p
    let r = guess / periodsPerYear;

    for (let k = 0; k < 100; k++) {
        let f = 0, fp = 0;
        for (let t = 0; t <= n; t++) {
            const v = Math.pow(1 + r, -t);
            f  += cf[t] * v;
            fp += -t * cf[t] * v / (1 + r);
        }
        if (Math.abs(fp) < 1e-12) break;

        const newR = r - f / fp;
        r = Math.max(-0.99, Math.min(1, newR));   // Borne entre −99% et +100% /période

        if (Math.abs(newR - r) < 1e-10) break;    // Convergence
    }

    return Math.pow(1 + r, periodsPerYear) - 1;   // Taux annuel effectif
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

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

/**
 * Génère un tooltip explicatif pour les frais fixes selon la fréquence
 * @returns {string} Texte du tooltip avec exemple de calcul
 */
function getFixedFeeTooltip() {
    const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
    const isPeriodicMode = document.getElementById('periodic-investment')?.classList.contains('selected');
    
    // Si pas en mode périodique, tooltip simple
    if (!isPeriodicMode) {
        return `Frais fixes prélevés chaque fin d'année sur le capital. Ex: 120€/an pendant 10 ans = 1200€ total`;
    }
    
    const periods = { weekly: 52, monthly: 12, quarterly: 4, annually: 1 };
    const p = periods[frequency];
    const frequencyLabels = { 
        weekly: 'semaine', 
        monthly: 'mois', 
        quarterly: 'trimestre', 
        annually: 'année' 
    };
    
    const label = frequencyLabels[frequency];
    
    // Exemples concrets selon la fréquence
    const example = frequency === 'weekly' ? 120 : 
                   frequency === 'monthly' ? 120 : 
                   frequency === 'quarterly' ? 120 : 120;
    
    const examplePerPeriod = (example / p).toFixed(2);
    
    return `Frais fixes annuels répartis sur chaque ${label}. Ex: ${example}€/an = ${examplePerPeriod}€ par ${label} pendant toute la durée d'investissement`;
}

/**
 * Met à jour le tooltip des frais fixes dynamiquement
 */
function updateFixedFeeTooltip() {
    const fixedFeeElement = document.getElementById('fixed-fee');
    if (fixedFeeElement) {
        const tooltipIcon = fixedFeeElement.parentElement?.querySelector('.loan-option-info, .cursor-help i');
        if (tooltipIcon) {
            tooltipIcon.title = getFixedFeeTooltip();
            tooltipIcon.setAttribute('title', getFixedFeeTooltip());
        }
    }
}

// ============================================
// GESTION DES FRAIS
// ============================================

/**
 * Fonction utilitaire pour parser les nombres avec gestion virgule/point
 * @param {string} id - ID de l'élément à lire
 * @returns {number} Valeur numérique
 */
function parseNumeric(id) {
    const value = (document.getElementById(id)?.value ?? '0').toString().replace(',', '.');
    return parseFloat(value) || 0;
}

/**
 * Lecture des paramètres de frais depuis l'interface
 * @returns {Object} Paramètres de frais
 */
function readFeeParams() {
    const mgmt = parseNumeric('mgmt-fee');     // %/an
    const entry = parseNumeric('entry-fee');  // % des versements
    const exit = parseNumeric('exit-fee');    // % du capital final
    const fixed = parseNumeric('fixed-fee');  // € / an
    return { mgmtPct: mgmt/100, entryPct: entry/100, exitPct: exit/100, fixedAnnual: fixed };
}

/**
 * Vérifie si l'utilisateur a modifié les champs de frais
 * @returns {boolean} true si au moins un champ a été modifié par l'utilisateur
 */
function hasUserModifiedFees() {
    const mgmt = parseNumeric('mgmt-fee');
    const entry = parseNumeric('entry-fee');
    const exit = parseNumeric('exit-fee');
    const fixed = parseNumeric('fixed-fee');
    
    // Considérer comme "modifié" si au moins une valeur n'est pas 0
    return mgmt !== 0 || entry !== 0 || exit !== 0 || fixed !== 0;
}

/**
 * Applique les préréglages de frais selon l'enveloppe sélectionnée
 * @param {boolean} forceApply - Force l'application même si l'utilisateur a modifié les valeurs
 */
function updateFeeSuggestionsByVehicle(forceApply = false) {
    const vehicleId = document.getElementById('investment-vehicle')?.value;
    if (!vehicleId) return;

    // Récupérer les éléments DOM
    const mgmtInput = document.getElementById('mgmt-fee');
    const entryInput = document.getElementById('entry-fee');
    const exitInput = document.getElementById('exit-fee');
    const fixedInput = document.getElementById('fixed-fee');

    if (!mgmtInput || !entryInput || !exitInput || !fixedInput) return;

    // Vérifier si l'utilisateur a déjà modifié les frais
    const userHasModified = hasUserModifiedFees();
    
    // Si l'utilisateur a modifié et qu'on ne force pas, ne rien faire
    if (userHasModified && !forceApply) {
        return;
    }

    // Récupérer le préréglage pour cette enveloppe
    const preset = FEE_PRESETS[vehicleId] || FEE_PRESETS['_default'];
    
    // Appliquer les valeurs
    mgmtInput.value = preset.mgmt.toFixed(2);
    entryInput.value = preset.entry.toFixed(2);
    exitInput.value = preset.exit.toFixed(2);
    fixedInput.value = preset.fixed.toString();

    // Afficher une notification informative
    const enveloppe = getEnveloppeInfo(vehicleId);
    const enveloppeLabel = enveloppe ? enveloppe.label : vehicleId;
    
    if (preset.note && preset !== FEE_PRESETS['_default']) {
        showTooltip(`Frais suggérés appliqués pour ${enveloppeLabel}`);
        
        // Optionnel : afficher la note dans une info-bulle plus détaillée
        setTimeout(() => {
            const noteTooltip = document.createElement('div');
            noteTooltip.className = 'fixed bottom-16 right-4 bg-blue-900 bg-opacity-90 text-white px-3 py-2 rounded-lg shadow-lg z-40 text-sm max-w-xs';
            noteTooltip.innerHTML = `💡 ${preset.note}`;
            document.body.appendChild(noteTooltip);
            
            setTimeout(() => {
                noteTooltip.classList.add('animate-fadeOut');
                setTimeout(() => noteTooltip.remove(), 300);
            }, 4000);
        }, 500);
    } else if (preset === FEE_PRESETS['_default']) {
        showTooltip(`Frais remis à zéro pour ${enveloppeLabel}`);
    }

    // Mettre à jour le tooltip des frais fixes après modification
    updateFixedFeeTooltip();
}

/**
 * Force l'application des préréglages de frais (bouton de reset)
 */
function resetFeesToPreset() {
    updateFeeSuggestionsByVehicle(true);
}

/**
 * Met tous les frais à zéro (bouton zéro frais)
 */
function setAllFeesZero() {
    ['mgmt-fee','entry-fee','exit-fee','fixed-fee'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '0';
    });
    runSimulation();
    showTooltip('Tous les frais ont été remis à zéro');
    updateFixedFeeTooltip(); // Mettre à jour le tooltip après modification
}

// Exposer les fonctions globalement pour l'utiliser depuis l'interface
window.resetFeesToPreset = resetFeesToPreset;
window.setAllFeesZero = setAllFeesZero;

document.addEventListener('DOMContentLoaded', function() {
    // Mettre à jour la date du jour
    updateDate();
    
    // Initialiser le graphique
    createChart();
    
    // Ajouter des événements aux sliders
    document.getElementById('duration-slider')?.addEventListener('input', function() {
        updateDurationValue(this.value);
    });
    
    document.getElementById('return-slider')?.addEventListener('input', function() {
        updateReturnValue(this.value);
    });
    
    // Ajouter un événement au bouton de simulation
    document.getElementById('simulate-button')?.addEventListener('click', runSimulation);
    
    // Ajouter un événement au sélecteur d'enveloppe fiscale
    document.getElementById('investment-vehicle')?.addEventListener('change', function() {
        updateTaxInfo();
        updateReturnSuggestions();
        updateFeeSuggestionsByVehicle(); // Application automatique (respecte les modifications utilisateur)
        
        // Relancer la simulation si déjà des résultats
        if (document.querySelector('.result-value')?.textContent !== '') {
            runSimulation();
        }
    });
    
    // AJOUT : Gestion du changement de mode d'investissement (unique/périodique)
    const uniqueBtn = document.getElementById('unique-investment');
    const periodicBtn = document.getElementById('periodic-investment');
    
    if (uniqueBtn && periodicBtn) {
        uniqueBtn.addEventListener('click', () => {
            toggleInvestmentMode('unique');
            checkPlafondLimits(); // Garde l'alerte plafond
            updateFixedFeeTooltip(); // Mettre à jour le tooltip selon le mode
        });
        
        periodicBtn.addEventListener('click', () => {
            toggleInvestmentMode('periodic'); // Utilisation cohérente du terme 'periodic'
            checkPlafondLimits(); // Garde l'alerte plafond
            updateFixedFeeTooltip(); // Mettre à jour le tooltip selon le mode
        });
    }

    // ✅ NOUVEAU : Listener pour le changement de fréquence
    const frequencySelect = document.getElementById('investment-frequency');
    if (frequencySelect) {
        frequencySelect.addEventListener('change', function() {
            updateFixedFeeTooltip();
            // Relancer la simulation si déjà des résultats
            if (document.querySelector('.result-value')?.textContent !== '') {
                runSimulation();
            }
        });
    }
    
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
                if (document.querySelector('.result-value')?.textContent !== '') {
                    runSimulation();
                }
            });
        }
    });

    // NOUVEAU : Ajouter un bouton de reset des frais près des champs de frais
    addFeeResetButton();

    // ✅ NOUVEAU : Initialiser le tooltip des frais fixes
    setTimeout(() => {
        updateFixedFeeTooltip();
    }, 500); // Petit délai pour s'assurer que le DOM est entièrement chargé
});

/**
 * Ajoute un bouton de reset des frais à l'interface
 */
function addFeeResetButton() {
    const feesContainer = document.querySelector('#mgmt-fee')?.closest('.mb-4');
    if (!feesContainer) return;

    // Vérifier si les boutons n'existent pas déjà
    if (document.getElementById('reset-fees-btn')) return;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'mt-2 flex gap-2';

    const resetButton = document.createElement('button');
    resetButton.id = 'reset-fees-btn';
    resetButton.type = 'button';
    resetButton.className = 'px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors';
    resetButton.innerHTML = '<i class="fas fa-refresh mr-1"></i> Frais suggérés';
    resetButton.title = 'Remet les frais aux valeurs suggérées pour cette enveloppe';
    
    resetButton.addEventListener('click', function() {
        resetFeesToPreset();
        // Relancer la simulation si elle est active
        if (document.querySelector('.result-value')?.textContent !== '') {
            setTimeout(runSimulation, 100);
        }
    });

    const zeroButton = document.createElement('button');
    zeroButton.id = 'zero-fees-btn';
    zeroButton.type = 'button';
    zeroButton.className = 'px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors';
    zeroButton.innerHTML = '<i class="fas fa-times mr-1"></i> Zéro frais';
    zeroButton.title = 'Met tous les frais à zéro';
    
    zeroButton.addEventListener('click', setAllFeesZero);

    buttonsContainer.appendChild(resetButton);
    buttonsContainer.appendChild(zeroButton);
    feesContainer.appendChild(buttonsContainer);
}

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
    const vehicleId = document.getElementById('investment-vehicle')?.value;
    const taxInfoElement = document.getElementById('tax-info');
    
    if (!taxInfoElement || !vehicleId) return;
    
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
    const vehicleId = document.getElementById('investment-vehicle')?.value;
    const returnSlider = document.getElementById('return-slider');
    
    if (!vehicleId || !returnSlider) return;
    
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
        const enveloppe = getEnveloppeInfo(vehicleId);
        if (enveloppe) {
            showTooltip(`Rendement suggéré pour ${enveloppe.label}: ${suggestedReturns[vehicleId]}%`);
        }
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
 * MODIFIÉE : Séparation montant initial et montant périodique
 */
function runSimulation() {
    // Animation du bouton
    const button = document.getElementById('simulate-button');
    if (!button) return;
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Calcul en cours...';
    button.disabled = true;
    
    // Simuler un délai pour l'effet visuel
    setTimeout(() => {
        // ✅ NOUVEAU : Détection du mode périodique CORRIGÉE
        const isPeriodicMode = document.getElementById('periodic-investment')
                              ?.classList.contains('selected');

        // ✅ NOUVEAU : Lecture sécurisée du montant initial
        const initialDeposit = parseFloat(
            document.getElementById('initial-investment-amount')?.value
        ) || 0;

        // ✅ NOUVEAU : Lecture sécurisée du montant périodique
        const periodicInput = document.getElementById('periodic-investment-amount');
        const periodicAmount = (isPeriodicMode && periodicInput) ? 
                              parseFloat(periodicInput.value) || 0 : 0;
        
        const years = parseInt(document.getElementById('duration-slider')?.value || 10);
        const annualReturn = parseFloat(document.getElementById('return-slider')?.value || 7) / 100;
        
        // Calcul des résultats avec les nouveaux paramètres
        const results = calculateInvestmentResults(initialDeposit, periodicAmount, years, annualReturn);
        
        // Mettre à jour le graphique avec les nouveaux paramètres
        updateSimulationChart(initialDeposit, periodicAmount, years, annualReturn);
        
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
 * Calcule les résultats d'investissement avec la vraie fiscalité et les frais
 * MODIFIÉE : Correction de l'incohérence de capitalisation avec taux périodique effectif + prélèvement annuel des frais fixes
 * @param {number} initialDeposit - Montant initial versé au départ
 * @param {number} periodicAmount - Montant des versements périodiques
 * @param {number} years - Nombre d'années
 * @param {number} annualReturn - Rendement annuel (en décimal)
 * @returns {Object} Résultats de la simulation
 */
function calculateInvestmentResults(initialDeposit, periodicAmount, years, annualReturn) {
    const vehicleId = document.getElementById('investment-vehicle')?.value || 'pea';
    const enveloppe = getEnveloppeInfo(vehicleId);

    const fees = readFeeParams();
    const isPeriodicMode = document.getElementById('periodic-investment')?.classList.contains('selected');
    const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
    const p = (frequency === 'weekly') ? 52 : (frequency === 'monthly') ? 12 : (frequency === 'quarterly') ? 4 : 1;
    const n = years * p;

    // Versements bruts (ce que l'utilisateur paie)
    const periodicTotal = isPeriodicMode ? periodicAmount * p * years : 0;
    const investedTotal = initialDeposit + periodicTotal;

    // Versements nets après frais d'entrée
    const initialNet  = initialDeposit * (1 - fees.entryPct);
    const periodicNet = isPeriodicMode ? periodicAmount * (1 - fees.entryPct) : 0;

    // ✅ CORRECTIF : Taux périodique effectif — garantit (1+rPer)^p = (1+annualReturn)
    const rPer = Math.pow(1 + annualReturn, 1 / p) - 1;

    // ✅ CORRECTIF : Capital final SANS frais — même base de capitalisation que "AVEC frais"
    let finalNoFees = initialDeposit * Math.pow(1 + rPer, n);
    if (isPeriodicMode && periodicAmount > 0) {
        finalNoFees += periodicAmount * ((Math.pow(1 + rPer, n) - 1) / rPer) * (1 + rPer);
    }

    // ✅ Raccourci "zéro frais"
    const noFees = fees.mgmtPct === 0 && fees.entryPct === 0 && fees.exitPct === 0 && fees.fixedAnnual === 0;

    let finalWithFees;
    if (noFees) {
        finalWithFees = finalNoFees; // pas d'écart possible
    } else {
        // --- Capital final AVEC frais ---
        // Taux net avec frais de gestion (proratisé par période)
        const fPer = fees.mgmtPct / p;
        const rNetPer = ((1 + rPer) * (1 - fPer)) - 1;

        // 1) Croissance du dépôt initial (net entrée) au taux net
        finalWithFees = initialNet * Math.pow(1 + rNetPer, n);

        // 2) Annuité des versements périodiques (nets)
        if (isPeriodicMode && periodicNet > 0) {
            finalWithFees += periodicNet * ((Math.pow(1 + rNetPer, n) - 1) / rNetPer) * (1 + rNetPer);
        }

        // ✅ CORRECTIF : 3) Frais fixes annuels (prélevés chaque fin d'année)
        if (fees.fixedAnnual > 0) {
            let fixedImpact = 0;
            for (let year = 1; year <= years; year++) {
                // Prélèvement en fin d'année, actualisé jusqu'à la fin
                const periodsRemaining = (years - year) * p;
                const presentValue = fees.fixedAnnual * Math.pow(1 + rNetPer, periodsRemaining);
                fixedImpact += presentValue;
            }
            finalWithFees -= fixedImpact;
        }

        // 4) Frais de sortie à la fin
        if (fees.exitPct > 0) {
            finalWithFees *= (1 - fees.exitPct);
        }
    }

    const finalAmount = round2(finalWithFees);
    const gains = round2(finalAmount - investedTotal);

    // Impact des frais – sans bruit numérique
    let feesImpact = round2(finalNoFees - finalWithFees);
    if (Math.abs(feesImpact) < 0.01) feesImpact = 0; // tue les centimes résiduels

    // Rendement annualisé (IRR si périodique)
    let annualizedReturn;
    if (periodicTotal === 0) {
        annualizedReturn = calcCAGR({ invested: initialDeposit, finalValue: finalAmount, years });
    } else {
        annualizedReturn = calcIRR({
            initial: initialDeposit,
            periodic: isPeriodicMode ? periodicAmount : 0,
            periodsPerYear: p,
            years,
            finalValue: finalAmount,
            guess: annualReturn
        });
    }

    // Fiscalité sur le gain net (inchangé)
    let afterTaxAmount = finalAmount;
    let taxAmount = 0;
    if (gains > 0) {
        if (enveloppe && enveloppe.fiscalite.calcGainNet) {
            const netGain = enveloppe.fiscalite.calcGainNet({
                gain: gains,
                duree: years,
                tmi: 0.30,
                primesVerseesAvantRachat: 0,
                estCouple: false,
            });
            afterTaxAmount = investedTotal + netGain;
            taxAmount = round2(gains - netGain);
        } else {
            const taxRate = years >= 5 ? TAXES.PRL_SOC : TAXES.PFU_TOTAL;
            taxAmount = round2(gains * taxRate);
            afterTaxAmount = round2(finalAmount - taxAmount);
        }
    }

    return {
        initialDeposit,
        periodicTotal,
        investedTotal,
        finalAmount,
        gains,
        afterTaxAmount,
        taxAmount,
        feesImpact,
        annualizedReturn,
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
 * MODIFIÉE : Utilise les nouveaux IDs HTML pour l'affichage séparé + affichage du rendement annualisé + impact des frais
 * @param {Object} results - Résultats de la simulation
 */
function updateResultsDisplay(results) {
    // Formater les valeurs monétaires
    const formatter = new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    // ✅ NOUVEAU : Affichage par ID spécifique avec valeurs par défaut
    const resultFinal = document.getElementById('result-final');
    const resultInitial = document.getElementById('result-initial'); 
    const resultPeriodic = document.getElementById('result-periodic');
    const resultGain = document.getElementById('result-gain');
    const resultAfterTax = document.getElementById('result-after-tax');
    const resultFeesImpact = document.getElementById('result-fees-impact'); // NOUVEAU
    
    if (resultFinal) resultFinal.textContent = formatter.format(results.finalAmount || 0);
    if (resultInitial) resultInitial.textContent = formatter.format(results.initialDeposit || 0);
    if (resultPeriodic) resultPeriodic.textContent = formatter.format(results.periodicTotal || 0);
    if (resultGain) resultGain.textContent = formatter.format(results.gains || 0);
    if (resultAfterTax) resultAfterTax.textContent = formatter.format(results.afterTaxAmount || 0);
    if (resultFeesImpact) resultFeesImpact.textContent = formatter.format(results.feesImpact || 0); // NOUVEAU
    
    // ✅ NOUVEAU : Affichage du rendement annualisé
    const resultAnnualized = document.getElementById('result-annualized-return');
    if (resultAnnualized) {
        const pct = Number.isFinite(results.annualizedReturn)
                   ? results.annualizedReturn * 100
                   : NaN;
        const displayPct = isFinite(pct) && pct < 100 ? pct.toFixed(2) : '—';
        
        // Ajouter un indicateur de performance
        let performanceIcon = '';
        let performanceClass = '';
        const nominalReturn = results.annualReturn * 100;
        
        if (pct > nominalReturn + 0.5) {
            performanceIcon = ' 📈';
            performanceClass = 'text-green-400';
        } else if (pct < nominalReturn - 0.5) {
            performanceIcon = ' 📉';
            performanceClass = 'text-orange-400';
        } else {
            performanceClass = 'text-blue-400';
        }
        
        resultAnnualized.innerHTML = `
            <span class="${performanceClass}">
                ${displayPct} %${performanceIcon}
            </span>
        `;
        
        // Tooltip explicatif
        resultAnnualized.title = `Rendement annualisé réel tenant compte de tous les versements (vs ${nominalReturn.toFixed(1)}% nominal)`;
    }
    
    // ✅ FALLBACK : Garder l'ancien système pour compatibilité
    const resultElements = document.querySelectorAll('.result-value');
    if (resultElements.length >= 4 && !resultFinal) {
        // Si les nouveaux IDs n'existent pas, utiliser l'ancien système
        resultElements[0].textContent = formatter.format(results.finalAmount);
        resultElements[1].textContent = formatter.format(results.investedTotal); // Total pour compatibilité
        resultElements[2].textContent = formatter.format(results.gains);
        resultElements[3].textContent = formatter.format(results.afterTaxAmount);
    }
    
    // Mettre à jour le message d'adéquation
    updateProfileAdequacy(results);
}

/**
 * Met à jour le message d'adéquation au profil avec analyse intelligente
 * MODIFIÉE : Inclut l'analyse du rendement annualisé et de l'impact des frais
 * @param {Object} results - Résultats de la simulation
 */
function updateProfileAdequacy(results) {
    const adequacyElement = document.getElementById('profile-adequacy');
    if (!adequacyElement) return;
    
    const suggestions = suggestBestVehicle(
        results.investedTotal, // Utilise le total pour l'analyse
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
    
    // ✅ NOUVEAU : Analyse du rendement annualisé
    const annualizedPct = results.annualizedReturn * 100;
    const nominalPct = results.annualReturn * 100;
    const difference = annualizedPct - nominalPct;
    
    if (Math.abs(difference) > 0.5) {
        if (difference > 0) {
            adequacyMessages.push(`🎯 Vos versements réguliers améliorent le rendement global`);
        } else {
            adequacyMessages.push(`📊 L'étalement des versements lisse les performances dans le temps`);
        }
    }

    // ✅ NOUVEAU : Analyse de l'impact des frais
    if (results.feesImpact > 0) {
        const impactPct = (results.feesImpact / results.finalAmount) * 100;
        if (impactPct > 10) {
            adequacyScore = Math.max(1, adequacyScore - 1);
            adequacyMessages.push(`⚠️ Impact des frais élevé (${impactPct.toFixed(1)}% du capital final)`);
        } else if (impactPct > 5) {
            adequacyMessages.push(`💰 Impact des frais modéré (${impactPct.toFixed(1)}% du capital final)`);
        } else {
            adequacyMessages.push(`✅ Impact des frais faible (${impactPct.toFixed(1)}% du capital final)`);
        }
    }
    
    if (results.vehicleId === 'pea' && annualizedPct >= 7) {
        adequacyMessages.push(`📈 Excellent rendement annualisé pour un PEA sur cette durée`);
    } else if (results.vehicleId === 'assurance-vie' && annualizedPct >= 4) {
        adequacyMessages.push(`✅ Performance annualisée satisfaisante pour une assurance-vie`);
    } else if (annualizedPct < 2) {
        adequacyScore = Math.max(1, adequacyScore - 1);
        adequacyMessages.push(`⚠️ Rendement annualisé faible, considérez d'autres options`);
    }
    
    // Suggérer une alternative si meilleure
    if (bestVehicle && bestVehicle.enveloppe.id !== results.vehicleId && bestVehicle.score > (currentVehicle?.score || 0)) {
        adequacyMessages.push(
            `💡 Alternative suggérée: ${bestVehicle.enveloppe.label} pourrait être plus avantageux`
        );
    }
    
    // Ajouter des conseils généraux
    if (results.enveloppe?.plafond && results.investedTotal > results.enveloppe.plafond * 0.8) {
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
 * MODIFIÉE : Prend maintenant initialDeposit et periodicAmount séparés + courbe "sans frais"
 * @param {number} initialDeposit - Montant initial versé au départ
 * @param {number} periodicAmount - Montant des versements périodiques
 * @param {number} years - Nombre d'années
 * @param {number} annualReturn - Rendement annuel (en décimal)
 */
function updateSimulationChart(initialDeposit, periodicAmount, years, annualReturn) {
    if (!window.investmentChart) return;
    
    const isPeriodicMode = document.getElementById('periodic-investment')?.classList.contains('selected');
    const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
    
    // Générer les nouvelles données
    const labels = Array.from({length: years + 1}, (_, i) => i === 0 ? 'Départ' : `Année ${i}`);
    const investedValues = [];
    const totalValues = [];
    
    // ✅ CORRECTIF : Utilisation cohérente du taux périodique effectif pour le graphique
    const periodsPerYear = frequency === 'weekly' ? 52 : 
                          frequency === 'monthly' ? 12 : 
                          frequency === 'quarterly' ? 4 : 1;
    const periodRate = Math.pow(1 + annualReturn, 1 / periodsPerYear) - 1;
    
    if (isPeriodicMode && periodicAmount > 0) {
        // Pour versements périodiques avec montant initial
        for (let year = 0; year <= years; year++) {
            if (year === 0) {
                investedValues.push(initialDeposit);
                totalValues.push(initialDeposit);
            } else {
                const totalInvested = initialDeposit + (periodicAmount * periodsPerYear * year);
                const periods = year * periodsPerYear;
                
                // Valeur du dépôt initial après croissance
                const initialGrowth = initialDeposit * Math.pow(1 + periodRate, periods);
                
                // Valeur des versements périodiques
                const periodicGrowth = periodicAmount * ((Math.pow(1 + periodRate, periods) - 1) / periodRate) * (1 + periodRate);
                
                const total = initialGrowth + periodicGrowth;
                
                investedValues.push(totalInvested);
                totalValues.push(total);
            }
        }
    } else {
        // Pour versement unique (seulement montant initial)
        for (let i = 0; i <= years; i++) {
            if (i === 0) {
                investedValues.push(initialDeposit);
                totalValues.push(initialDeposit);
            } else {
                const total = initialDeposit * Math.pow(1 + annualReturn, i);
                investedValues.push(initialDeposit);
                totalValues.push(total);
            }
        }
    }

    // ✅ NOUVEAU : Série "sans frais" pour comparaison visuelle
    const totalNoFees = [];
    {
        const p = periodsPerYear;
        const rPer = Math.pow(1 + annualReturn, 1 / p) - 1;
        for (let y = 0; y <= years; y++) {
            const n = y * p;
            let val = initialDeposit * Math.pow(1 + rPer, n);
            if (isPeriodicMode && periodicAmount > 0) {
                val += periodicAmount * ((Math.pow(1 + rPer, n) - 1) / rPer) * (1 + rPer);
            }
            totalNoFees.push(val);
        }
    }

    // Injecter/mettre à jour le dataset pointillé
    const labelNoFees = 'Capital total (sans frais)';
    const idx = window.investmentChart.data.datasets.findIndex(d => d.label === labelNoFees);
    const noFeesDataset = {
        label: labelNoFees,
        data: totalNoFees,
        borderColor: '#94a3b8',
        backgroundColor: 'transparent',
        borderDash: [6,4],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.3
    };
    if (idx === -1) {
        window.investmentChart.data.datasets.push(noFeesDataset);
    } else {
        window.investmentChart.data.datasets[idx] = noFeesDataset;
    }
    
    // Mettre à jour le graphique
    window.investmentChart.data.labels = labels;
    window.investmentChart.data.datasets[0].data = totalValues;
    window.investmentChart.data.datasets[1].data = investedValues;
    window.investmentChart.update();
}

/**
 * Conversion entre versement unique et périodique
 * @param {string} mode - Mode de versement ('unique' ou 'periodic')
 */
function toggleInvestmentMode(mode) {
    const uniqueButton = document.getElementById('unique-investment');
    const periodicButton = document.getElementById('periodic-investment');
    const frequencyContainer = document.getElementById('frequency-container');
    
    if (!uniqueButton || !periodicButton || !frequencyContainer) return;
    
    if (mode === 'unique') {
        // Versement unique actif
        uniqueButton.classList.add('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        uniqueButton.classList.remove('text-gray-300');
        
        periodicButton.classList.remove('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        periodicButton.classList.add('text-gray-300');
        
        frequencyContainer.style.display = 'none';
        
        // Gestion de l'affichage des montants si les conteneurs existent
        const uniqueAmountContainer = document.getElementById('unique-amount-container');
        const periodicAmountContainer = document.getElementById('periodic-amount-container');
        if (uniqueAmountContainer) uniqueAmountContainer.style.display = 'block';
        if (periodicAmountContainer) periodicAmountContainer.style.display = 'none';
        
    } else if (mode === 'periodic') {
        // Versement périodique actif
        periodicButton.classList.add('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        periodicButton.classList.remove('text-gray-300');
        
        uniqueButton.classList.remove('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        uniqueButton.classList.add('text-gray-300');
        
        frequencyContainer.style.display = 'block';
        
        // Gestion de l'affichage des montants si les conteneurs existent
        const uniqueAmountContainer = document.getElementById('unique-amount-container');
        const periodicAmountContainer = document.getElementById('periodic-amount-container');
        if (uniqueAmountContainer) uniqueAmountContainer.style.display = 'none';
        if (periodicAmountContainer) periodicAmountContainer.style.display = 'block';
    }
    
    // Si une simulation est déjà active, la mettre à jour
    const resultValue = document.querySelector('.result-value')?.textContent;
    if (resultValue && resultValue !== '') {
        runSimulation();
    }
}

// Rendre la fonction globale pour être accessible depuis le HTML
window.toggleInvestmentMode = toggleInvestmentMode;

// ============================================
// GESTION DES PLAFONDS - OPTION 1+4+2
// ============================================

/**
 * Vérifie les plafonds et affiche une alerte discrète
 * Seulement quand on dépasse ou ≥ 80% du plafond
 */
function checkPlafondLimits() {
    const vehicleId = document.getElementById('investment-vehicle')?.value;
    const isPeriodicMode = document.getElementById('periodic-investment')?.classList.contains('selected');
    const years = parseInt(document.getElementById('duration-slider')?.value || 10);
    const enveloppe = getEnveloppeInfo(vehicleId);
    
    // Récupérer le bon montant selon le mode
    let amount;
    if (isPeriodicMode) {
        const periodicAmountElement = document.getElementById('periodic-investment-amount');
        if (periodicAmountElement) {
            amount = parseFloat(periodicAmountElement.value) || 100;
        } else {
            amount = parseFloat(document.getElementById('investment-amount')?.value) || 100;
        }
    } else {
        amount = parseFloat(document.getElementById('investment-amount')?.value) || 1000;
    }
    
    if (!enveloppe || !enveloppe.plafond) {
        // Masquer l'alerte si elle existe
        const alertElement = document.getElementById('plafond-alert');
        if (alertElement) alertElement.style.display = 'none';
        return;
    }
    
    // Calculer le montant total selon le mode
    let totalAmount = amount;
    if (isPeriodicMode) {
        const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
        const periodsPerYear = frequency === 'weekly' ? 52 : 
                              frequency === 'monthly' ? 12 : 
                              frequency === 'quarterly' ? 4 : 1;
        totalAmount = amount * periodsPerYear * years;
    }
    
    // Récupérer le plafond applicable (TODO: gérer couple/solo via une checkbox)
    const plafond = typeof enveloppe.plafond === 'object' 
        ? enveloppe.plafond.solo 
        : enveloppe.plafond;
    
    // Créer/mettre à jour l'alerte
    let alertElement = document.getElementById('plafond-alert');
    if (!alertElement) {
        alertElement = document.createElement('div');
        alertElement.id = 'plafond-alert';
        alertElement.className = 'mt-3 p-3 rounded-lg flex items-start gap-2 transition-all duration-300';
        
        // Trouver le bon conteneur parent selon le mode
        const parentElement = isPeriodicMode && document.getElementById('periodic-amount-container')
            ? document.getElementById('periodic-amount-container')
            : document.getElementById('investment-amount')?.parentElement;
        
        if (parentElement) {
            parentElement.appendChild(alertElement);
        }
    }
    
    const percentage = (totalAmount / plafond) * 100;
    
    if (totalAmount > plafond) {
        // Dépassement - Alerte rouge
        const excess = totalAmount - plafond;
        alertElement.innerHTML = `
            <i class="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
            <div class="flex-1 text-sm">
                <span class="text-red-400 font-medium">Plafond dépassé de ${formatMoney(excess)}</span>
                <span class="text-gray-400 ml-2">(limite : ${formatMoney(plafond)})</span>
            </div>
        `;
        alertElement.className = 'mt-3 p-3 rounded-lg flex items-start gap-2 bg-red-900 bg-opacity-20 border border-red-600 animate-fadeIn';
        alertElement.style.display = 'flex';
    } else if (percentage >= 80) {
        // Proche du plafond - Alerte jaune
        const remaining = plafond - totalAmount;
        alertElement.innerHTML = `
            <i class="fas fa-info-circle text-yellow-500 mt-0.5"></i>
            <div class="flex-1 text-sm">
                <span class="text-yellow-400">Il reste ${formatMoney(remaining)}</span>
                <span class="text-gray-400 ml-2">(${Math.round(percentage)}% du plafond)</span>
            </div>
        `;
        alertElement.className = 'mt-3 p-3 rounded-lg flex items-start gap-2 bg-yellow-900 bg-opacity-20 border border-yellow-600 animate-fadeIn';
        alertElement.style.display = 'flex';
    } else {
        // Sous les 80% - Masquer l'alerte avec fade out
        if (alertElement.style.display !== 'none') {
            alertElement.classList.add('animate-fadeOut');
            setTimeout(() => {
                alertElement.style.display = 'none';
                alertElement.classList.remove('animate-fadeOut');
            }, 300);
        }
    }
}

/**
 * Ajoute une ligne de plafond au graphique
 * La ligne reste visible même si on est en dessous
 */
function addPlafondLineToChart() {
    if (!window.investmentChart) return;
    
    const vehicleId = document.getElementById('investment-vehicle')?.value;
    const enveloppe = getEnveloppeInfo(vehicleId);
    
    // Supprimer l'ancienne ligne de plafond si elle existe
    const plafondDatasetIndex = window.investmentChart.data.datasets.findIndex(
        ds => ds.label && ds.label.includes('Plafond')
    );
    if (plafondDatasetIndex !== -1) {
        window.investmentChart.data.datasets.splice(plafondDatasetIndex, 1);
    }
    
    if (enveloppe && enveloppe.plafond) {
        const plafond = typeof enveloppe.plafond === 'object' 
            ? enveloppe.plafond.solo 
            : enveloppe.plafond;
        
        const years = parseInt(document.getElementById('duration-slider')?.value || 10);
        
        // Ajouter la ligne de plafond
        window.investmentChart.data.datasets.push({
            label: `Plafond ${enveloppe.label}`,
            data: Array(years + 1).fill(plafond),
            borderColor: 'rgba(255, 71, 87, 0.8)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [8, 4],
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            order: -1 // Pour être derrière les autres courbes
        });
    }
    
    window.investmentChart.update();
}

/**
 * Affiche un badge récapitulatif si dépassement
 * Avec conseils de diversification
 */
function showPlafondBadgeInResults(results) {
    const resultsContainer = document.querySelector('.bg-blue-900.bg-opacity-20.p-6.rounded-lg:last-child');
    if (!resultsContainer) return;
    
    // Supprimer l'ancien badge s'il existe
    const oldBadge = document.getElementById('plafond-results-badge');
    if (oldBadge) oldBadge.remove();
    
    if (!results.enveloppe || !results.enveloppe.plafond) return;
    
    const plafond = typeof results.enveloppe.plafond === 'object' 
        ? results.enveloppe.plafond.solo 
        : results.enveloppe.plafond;
    
    // Calculer le montant total investi
    const totalInvested = results.investedTotal;
    
    if (totalInvested > plafond) {
        const excess = totalInvested - plafond;
        
        const badge = document.createElement('div');
        badge.id = 'plafond-results-badge';
        badge.className = 'mb-4 p-4 bg-red-900 bg-opacity-20 border border-red-600 rounded-lg animate-fadeIn';
        badge.innerHTML = `
            <div class="flex items-start gap-3">
                <i class="fas fa-exclamation-triangle text-red-500 text-xl mt-1"></i>
                <div class="flex-1">
                    <h5 class="text-red-400 font-semibold mb-2">
                        ⚠️ Dépassement du plafond de ${formatMoney(excess)}
                    </h5>
                    <p class="text-sm text-gray-300 mb-3">
                        Le ${results.enveloppe.label} est limité à ${formatMoney(plafond)}. 
                        Votre simulation porte sur ${formatMoney(totalInvested)}.
                    </p>
                    <div class="bg-blue-900 bg-opacity-30 p-3 rounded">
                        <p class="text-sm text-blue-300 font-medium mb-2">
                            💡 Conseils de diversification :
                        </p>
                        <ul class="text-sm text-gray-300 space-y-1 ml-4">
                            <li>• Placez ${formatMoney(plafond)} sur votre ${results.enveloppe.label}</li>
                            <li>• Investissez les ${formatMoney(excess)} restants sur :</li>
                            <li class="ml-4">→ Assurance-vie (sans plafond, fiscalité dégressive)</li>
                            <li class="ml-4">→ CTO (flexibilité totale, flat tax 30%)</li>
                            ${results.enveloppe.id === 'pea' ? '<li class="ml-4">→ PEA‑PME (plafond additionnel de 225k€)</li>' : ''}
                        </ul>
                    </div>
            </div>
        `;
        
        resultsContainer.insertBefore(badge, resultsContainer.firstChild);
    }
}

// Modifier la fonction updateSimulationChart existante pour ajouter la ligne de plafond
const originalUpdateChart = updateSimulationChart;
updateSimulationChart = function(initialDeposit, periodicAmount, years, annualReturn) {
    // Appeler la fonction originale
    originalUpdateChart.call(this, initialDeposit, periodicAmount, years, annualReturn);
    // Ajouter la ligne de plafond
    addPlafondLineToChart();
};

// Modifier la fonction updateResultsDisplay existante pour ajouter le badge
const originalUpdateResults = updateResultsDisplay;
updateResultsDisplay = function(results) {
    // Appeler la fonction originale
    originalUpdateResults.call(this, results);
    // Ajouter le badge si nécessaire
    showPlafondBadgeInResults(results);
};

// Event listeners pour la gestion des plafonds
document.addEventListener('DOMContentLoaded', function() {
    // Listeners pour l'alerte temps réel
    const inputs = [
        'investment-amount',
        'periodic-investment-amount',
        'initial-investment-amount',
        'duration-slider',
        'investment-frequency'
    ];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', checkPlafondLimits);
            element.addEventListener('change', checkPlafondLimits);
        }
    });
    
    // Listener pour le changement d'enveloppe
    const vehicleSelect = document.getElementById('investment-vehicle');
    if (vehicleSelect) {
        vehicleSelect.addEventListener('change', function() {
            checkPlafondLimits();
            // Redessiner le graphe si déjà visible
            if (window.investmentChart) {
                addPlafondLineToChart();
            }
        });
    }
    
    // Listener pour le mode d'investissement
    ['unique-investment', 'periodic-investment'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                setTimeout(checkPlafondLimits, 100);
            });
        }
    });
});

// Fonction placeholder pour l'optimisation automatique
window.toggleOptimizationMode = function() {
    showTooltip('Optimisation automatique en cours de développement...');
};
