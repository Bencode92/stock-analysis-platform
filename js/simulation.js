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

// Produits à taux fixes / rendement "natif" → exclus du comparateur à rendement constant
// (on le publie aussi sur globalThis pour éviter tout ReferenceError si utilisé hors module)
const NON_COMPARABLE_IDS = new Set([
  'livret-a', 'ldds', 'lep', 'pel', 'cel', 'livret-jeune',
  // (optionnel) rendements "nativement" différents du 7% marché
  'scpi-cto', 'scpi-av', 'opci'
]);

// ⇩ sécurités : expose en global si besoin (sans écraser une version existante)
(() => {
  if (typeof globalThis !== 'undefined') {
    if (!(globalThis.NON_COMPARABLE_IDS instanceof Set)) {
      globalThis.NON_COMPARABLE_IDS = NON_COMPARABLE_IDS;
    }
    if (!globalThis.FEE_PRESETS) {
      globalThis.FEE_PRESETS = FEE_PRESETS;
    }
  }
})();
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
  // Cas simples → CAGR
  if (periodic === 0 || !isFinite(periodsPerYear) || periodsPerYear <= 0) {
    return calcCAGR({ invested: initial, finalValue, years });
  }

  // ✅ nombre de périodes ENTIER (évite "Invalid array length" quand years est fractionnaire)
  const nFloat = years * periodsPerYear;
  const n = Math.max(0, Math.round(nFloat)); // ou Math.floor(nFloat)

  if (n === 0) {
    return calcCAGR({ invested: initial, finalValue, years: Math.max(1e-9, years) });
  }

  // Flux de trésorerie : dépôts périodiques + dépôt initial + valeur finale
  const cf = new Array(n + 1).fill(-periodic);
  cf[0] = -initial;
  cf[n] += finalValue;

  // Point de départ = taux périodique ≈ taux annuel / p (borné)
  let r = Math.max(-0.99, Math.min(1, guess / periodsPerYear));

  // Newton–Raphson sur le taux périodique
  for (let k = 0; k < 100; k++) {
    let f = 0, fp = 0;
    const onePlusR = 1 + r;

    for (let t = 0; t <= n; t++) {
      const v = Math.pow(onePlusR, -t);
      f  += cf[t] * v;
      fp += -t * cf[t] * v / onePlusR;
    }

    if (Math.abs(fp) < 1e-14) break;

    const step = f / fp;
    const newR = r - step;

    // Bornes de sûreté (−99% à +100% par période)
    r = Math.max(-0.99, Math.min(1, newR));

    if (Math.abs(step) < 1e-12) break; // Convergence
  }

  // Convertit le taux périodique en taux annuel effectif
  return Math.pow(1 + r, periodsPerYear) - 1;
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

// ✅ NOUVEAU : Utilitaires inflation (server first)
function getServerInflationRate() {
  const r = window.APP_CONFIG?.INFLATION?.annualRate;
  if (typeof r === 'number' && isFinite(r)) return Math.max(0, Math.min(0.15, r));
  return null;
}

function isRealTermsOn() {
  // Mode "auto" = on garde les résultats NOMINAUX (on n'active pas l'affichage constant global)
  if (window.APP_CONFIG?.INFLATION?.mode === 'auto') return false;
  return document.getElementById('real-terms-toggle')?.checked === true;
}

function getInflationRate() {
  const srv = getServerInflationRate();
  if (srv !== null) return srv; // priorise serveur (pour nos calculs complémentaires)
  const v = parseFloat(document.getElementById('inflation-rate')?.value || '2');
  return isFinite(v) ? Math.max(0, Math.min(0.15, v / 100)) : 0.02;
}

function deflatorAt(years, infl) {
  return Math.pow(1 + infl, years);
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

// === UI Montant périodique (suffixe + rappel annuel) =====================

function freqLabelFR(freq) {
  return { weekly:'semaine', monthly:'mois', quarterly:'trimestre', annually:'an' }[freq] || 'période';
}
function periodsPerYear(freq) {
  return freq === 'weekly' ? 52 : freq === 'monthly' ? 12 : freq === 'quarterly' ? 4 : 1;
}

function updatePeriodicUI() {
  const isPeriodic = document.getElementById('periodic-investment')?.classList.contains('selected');
  const periodicContainer = document.getElementById('periodic-amount-container');
  if (periodicContainer) periodicContainer.style.display = isPeriodic ? 'block' : 'none';

  const freq = document.getElementById('investment-frequency')?.value || 'monthly';
  const label = freqLabelFR(freq);

  const amtEl = document.getElementById('periodic-investment-amount');
  const suffixEl = document.getElementById('periodic-suffix');
  const helpEl = document.getElementById('periodic-help');

  const amount = parseFloat(String(amtEl?.value ?? '0').replace(',', '.')) || 0;
  const yearly = amount * periodsPerYear(freq);

  if (suffixEl) suffixEl.textContent = '/' + (freq === 'annually' ? 'an' : label);
  if (helpEl)  helpEl.textContent = `Par ${label} • soit ${formatMoney(yearly)}/an`;

  // Afficher/masquer le sélecteur de fréquence
  const freqContainer = document.getElementById('frequency-container');
  if (freqContainer) freqContainer.style.display = isPeriodic ? 'block' : 'none';
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

// ============================================
// NOUVELLES FONCTIONNALITÉS AVANCÉES
// ============================================

// ✅ NOUVEAU : Utilitaires pour goal-seek et comparateur
function _ppyear(freq) { 
    return freq === 'weekly' ? 52 : freq === 'monthly' ? 12 : freq === 'quarterly' ? 4 : 1; 
}

function feesFromPreset(id) {
    const p = FEE_PRESETS[id] || FEE_PRESETS._default;
    return { mgmtPct: p.mgmt/100, entryPct: p.entry/100, exitPct: p.exit/100, fixedAnnual: p.fixed };
}

// ✅ NOUVEAU : Goal-seek pour versement périodique (vise STRICTEMENT le net d'impôts)
function goalSeekPeriodicForTarget({ target, years, initialDeposit, annualReturn, vehicleId, fees, frequency='monthly' }) {
  const p = _ppyear(frequency);
  const valueFor = (periodic) =>
    calculateInvestmentResults(initialDeposit, periodic, years, annualReturn,
      { vehicleId, fees, overridePeriodic:{ mode:'periodic', frequency } }
    ).afterTaxAmount;

  let lo = 0;
  // estimation haute "annuité" (brute), puis on augmente jusqu'à dépasser le net cible
  const rPer = Math.pow(1+annualReturn, 1/p)-1;
  const annuityFactor = rPer === 0 ? (years*p) : ((Math.pow(1+rPer, years*p)-1)/rPer)*(1+rPer);
  let hi = Math.max(10, (target - initialDeposit*Math.pow(1+rPer, years*p)) / Math.max(1e-9, annuityFactor));
  hi = isFinite(hi) && hi > 0 ? hi : target/(years*p);

  // 🔒 s'assurer que hi atteint le NET visé
  let vhi = valueFor(hi), guard=0;
  while (vhi < target && guard++ < 40) { hi *= 1.6; vhi = valueFor(hi); }

  // Si même énormement élevé on n'y arrive pas, on retourne la meilleure valeur trouvée
  if (vhi < target) return { periodic: hi, results: calculateInvestmentResults(initialDeposit, hi, years, annualReturn,
                          { vehicleId, fees, overridePeriodic:{ mode:'periodic', frequency } }) };

  // 🔁 bisection
  for (let k=0; k<60; k++) {
    const mid = (lo+hi)/2;
    const res = calculateInvestmentResults(initialDeposit, mid, years, annualReturn,
      { vehicleId, fees, overridePeriodic:{ mode:'periodic', frequency } }
    );
    if (Math.abs(res.afterTaxAmount - target) < 0.5) return { periodic: mid, results: res };
    if (res.afterTaxAmount < target) lo = mid; else hi = mid;
  }
  const periodic = (lo+hi)/2;
  const results = calculateInvestmentResults(initialDeposit, periodic, years, annualReturn,
    { vehicleId, fees, overridePeriodic:{ mode:'periodic', frequency } }
  );
  return { periodic, results };
}

// ✅ Goal-seek de la DURÉE pour atteindre un montant NET d'impôts donné
function goalSeekYearsForTarget({
  target,
  initialDeposit = 0,
  periodicAmount = 0,
  annualReturn,
  vehicleId,
  fees,
  frequency = 'monthly',
  maxYears = 60,
  tol = 0.5,         // tolérance sur la cible en €
  maxIter = 80       // itérations bisection max
}) {
  const mode = periodicAmount > 0 ? 'periodic' : 'unique';

  // Helper avec mémoïsation (évite de recalculer pour la même durée)
  const cache = new Map();
  const getResults = (yrs) => {
    const k = +yrs.toFixed(6); // clé stable
    if (!cache.has(k)) {
      cache.set(k, calculateInvestmentResults(
        initialDeposit,
        periodicAmount,
        yrs,
        annualReturn,
        { vehicleId, fees, overridePeriodic: { mode, frequency } }
      ));
    }
    return cache.get(k);
  };
  const valueForYears = (yrs) => getResults(yrs).afterTaxAmount;

  // Cas triviaux / garde-fous
  if (!isFinite(target) || target <= 0) {
    return { years: 0, results: getResults(0) };
  }

  // Si déjà atteint à t=0
  const v0 = valueForYears(0);
  if (v0 >= target) {
    return { years: 0, results: getResults(0) };
  }

  // Fenêtre initiale
  let lo = 0;
  let hi = Math.max(1, maxYears);

  // 🔒 Étendre la fenêtre jusqu'à couvrir la cible, bornée à 120 ans
  let guard = 0;
  let vhi = valueForYears(hi);
  while (vhi < target && hi < 120 && guard++ < 24) {
    hi = Math.min(120, hi * 1.5);
    vhi = valueForYears(hi);
  }
  if (vhi < target) {
    return {
      years: null,
      results: getResults(hi),
      unreachable: true,
      triedYears: hi
    };
  }

  // 🔁 Bisection (fonction monotone croissante en pratique)
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const vm = valueForYears(mid);

    if (Math.abs(vm - target) <= tol) {
      return { years: mid, results: getResults(mid) };
    }
    if (vm < target) lo = mid; else hi = mid;
  }

  const years = (lo + hi) / 2;
  return { years, results: getResults(years) };
}

// ✅ NOUVEAU : Fonction pour capper les versements selon le plafond
function capByPlafond({ initialDeposit, periodicAmount, years, frequency, enveloppe }) {
  const p = _ppyear(frequency);
  const plafond = enveloppe?.plafond
    ? (typeof enveloppe.plafond === 'object' ? enveloppe.plafond.solo : enveloppe.plafond)
    : Infinity;

  if (!isFinite(plafond)) {
    return { initial: initialDeposit, periodic: periodicAmount, stopAfterYears: years, investedCapped: initialDeposit + periodicAmount * p * years };
  }

  const initialCapped = Math.min(initialDeposit, plafond);
  let remaining = Math.max(0, plafond - initialCapped);

  if (periodicAmount <= 0 || remaining <= 0) {
    return { initial: initialCapped, periodic: 0, stopAfterYears: 0, investedCapped: initialCapped };
  }

  const periodsAllowed = Math.floor(remaining / periodicAmount);
  const stopAfterYears = Math.min(years, periodsAllowed / p);
  const investedCapped = initialCapped + periodicAmount * periodsAllowed;

  return { initial: initialCapped, periodic: periodicAmount, stopAfterYears, investedCapped };
}

// ✅ NOUVEAU : Comparateur d'enveloppes avec respect des plafonds
let compareChart = null;

function buildCompare() {
  const initialDeposit = parseFloat(document.getElementById('initial-investment-amount')?.value) || 0;
  const periodicAmount = document.getElementById('periodic-investment')?.classList.contains('selected')
      ? (parseFloat(document.getElementById('periodic-investment-amount')?.value) || 0)
      : 0;
  const years     = parseFloat(document.getElementById('duration-slider')?.value || 10);
  const annRet    = (parseFloat(document.getElementById('return-slider')?.value || 7) / 100); // ← rendement constant
  const frequency = document.getElementById('investment-frequency')?.value || 'monthly';

  // Référence CTO au même rendement
  const ref = calculateInvestmentResults(
    initialDeposit, periodicAmount, years, annRet,
    {
      vehicleId: 'cto',
      fees: feesFromPreset('cto'),
      overridePeriodic: { mode: periodicAmount > 0 ? 'periodic' : 'unique', frequency }
    }
  );

  // Filtre : on exclut les produits à taux fixes / non comparables
  const ids = Object.keys(FEE_PRESETS)
    .filter(k => !k.startsWith('_') && !NON_COMPARABLE_IDS.has(k));

  const rows = ids.map(id => {
      const env = getEnveloppeInfo(id);
      const cap = capByPlafond({ initialDeposit, periodicAmount, years, frequency, enveloppe: env });

      const r = calculateInvestmentResults(
        cap.initial, cap.periodic, years, annRet, // ← même rendement pour tous
        {
          vehicleId: id,
          fees: feesFromPreset(id),
          overridePeriodic: { mode: cap.periodic > 0 ? 'periodic' : 'unique', frequency },
          stopAfterYears: cap.stopAfterYears
        }
      );

      const plafond = env?.plafond ? (typeof env.plafond === 'object' ? env.plafond.solo : env.plafond) : Infinity;
      const alert = (cap.investedCapped >= plafond) ? '🧢' : '';

      return {
        id,
        label: env?.label || id,
        net: r.afterTaxAmount,
        impots: r.taxAmount,
        frais: r.feesImpact,
        deltaCto: r.afterTaxAmount - ref.afterTaxAmount,
        alert
      };
  })
  .sort((a, b) => b.net - a.net)
  .slice(0, 5);

  // Table
  const tbody = document.getElementById('compare-tbody');
  if (tbody) {
    tbody.innerHTML = rows.map((row, i) => `
      <tr class="border-b border-blue-800/40">
        <td class="px-3 py-2">
          ${row.label}
          ${i === 0 ? '<span class="ml-1 text-xs bg-green-900 bg-opacity-30 text-green-400 px-1.5 py-0.5 rounded">meilleure</span>' : ''}
        </td>
        <td class="px-3 py-2 text-right">${formatMoney(row.net)}</td>
        <td class="px-3 py-2 text-right text-amber-300">${formatMoney(row.impots)}</td>
        <td class="px-3 py-2 text-right text-blue-300">${formatMoney(row.frais)}</td>
        <td class="px-3 py-2 text-right ${row.deltaCto>=0?'text-green-400':'text-amber-300'}">
          ${(row.deltaCto>=0?'+':'') + formatMoney(row.deltaCto)}
        </td>
        <td class="px-3 py-2 text-center">${row.alert}</td>
      </tr>
    `).join('');
  }

  // Note d’info (si présente dans le DOM)
  const note = document.getElementById('compare-note');
  if (note) {
    note.textContent = `Comparaison à rendement constant ${(annRet * 100).toFixed(1)} % — produits à taux fixe exclus.`;
  }

  // Chart
  const ctx = document.getElementById('compare-chart');
  if (ctx) {
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: 'Net',    data: rows.map(r => r.net),    backgroundColor: 'rgba(0,210,110,0.7)', borderColor: 'rgba(0,210,110,1)', borderWidth: 1, stack: 'S' },
          { label: 'Impôts', data: rows.map(r => r.impots), backgroundColor: 'rgba(255,71,87,0.7)', borderColor: 'rgba(255,71,87,1)', borderWidth: 1, stack: 'S' },
          { label: 'Frais',  data: rows.map(r => r.frais),  backgroundColor: 'rgba(33,150,243,0.7)', borderColor: 'rgba(33,150,243,1)', borderWidth: 1, stack: 'S' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => formatMoney(v) } } },
        plugins: { legend: { position: 'top' } }
      }
    });
  }
}

// ✅ NOUVEAU : Système de scénarios
const SC_KEY = 'tp_invest_scenarios_v1';

function readScenarioParams(){
    const initialDeposit = parseFloat(document.getElementById('initial-investment-amount')?.value)||0;
    const periodicOn = document.getElementById('periodic-investment')?.classList.contains('selected');
    const periodicAmount = periodicOn ? (parseFloat(document.getElementById('periodic-investment-amount')?.value)||0) : 0;
    const frequency = document.getElementById('investment-frequency')?.value || 'monthly';
    const years = parseInt(document.getElementById('duration-slider')?.value || 10);
    const annualReturn = parseFloat(document.getElementById('return-slider')?.value || 7)/100;
    const vehicleId = document.getElementById('investment-vehicle')?.value || 'pea';
    const fees = readFeeParams();
    return { initialDeposit, periodicAmount, frequency, years, annualReturn, vehicleId, fees };
}

function saveScenario(){
    const p = readScenarioParams();
    const r = calculateInvestmentResults(p.initialDeposit, p.periodicAmount, p.years, p.annualReturn,
              { vehicleId:p.vehicleId, fees:p.fees, overridePeriodic:{ mode: p.periodicAmount>0?'periodic':'unique', frequency:p.frequency }});
    const item = {
        ts: Date.now(),
        label: getEnveloppeInfo(p.vehicleId)?.label || p.vehicleId,
        vehicleId: p.vehicleId,
        net: r.afterTaxAmount,
        frais: r.feesImpact,
        impots: r.taxAmount,
        irr: r.annualizedReturn,
        years: p.years,
        initial: p.initialDeposit,
        periodic: p.periodicAmount,
        frequency: p.frequency
    };
    let arr = JSON.parse(localStorage.getItem(SC_KEY) || '[]');
    arr.unshift(item);
    arr = arr.slice(0,3); // 2–3 scénarios
    localStorage.setItem(SC_KEY, JSON.stringify(arr));
    renderScenarioTable();
    showTooltip('Scénario sauvegardé');
}

function clearScenarios(){
    localStorage.removeItem(SC_KEY);
    renderScenarioTable();
}

function renderScenarioTable(){
    const tbody = document.getElementById('scenario-tbody');
    if (!tbody) return;
    const arr = JSON.parse(localStorage.getItem(SC_KEY) || '[]');
    if (!arr.length) { 
        tbody.innerHTML = `<tr><td colspan="9" class="px-3 py-3 text-center text-gray-400">Aucun scénario sauvegardé</td></tr>`; 
        return; 
    }
    // meilleur = net max
    const bestNet = Math.max(...arr.map(x=>x.net));
    tbody.innerHTML = arr.map(x=>`
        <tr class="border-b border-blue-800/40">
            <td class="px-3 py-2">${x.label}</td>
            <td class="px-3 py-2 text-right">${formatMoney(x.net)}</td>
            <td class="px-3 py-2 text-right text-blue-300">${formatMoney(x.frais)}</td>
            <td class="px-3 py-2 text-right text-amber-300">${formatMoney(x.impots)}</td>
            <td class="px-3 py-2 text-right">${(x.irr*100).toFixed(2)}%</td>
            <td class="px-3 py-2 text-right">${x.years}</td>
            <td class="px-3 py-2 text-right">${formatMoney(x.initial)}</td>
            <td class="px-3 py-2 text-right">${formatMoney(x.periodic)}/${freqLabelFR(x.frequency)}</td>
            <td class="px-3 py-2 text-center">${x.net===bestNet? '🏆' : ''}</td>
        </tr>
    `).join('');
}

// ✅ NOUVEAU : KPI intelligents
function computeKPIs(params, results) {
  // Recalcule CTO de référence avec mêmes params
  const refCTO = calculateInvestmentResults(
    params.initialDeposit, params.periodicAmount, params.years, params.annualReturn,
    { vehicleId: 'cto' }
  );

  const deltaCto = results.afterTaxAmount - refCTO.afterTaxAmount;
  const feesPct  = results.finalAmount > 0 ? (results.feesImpact / results.finalAmount) * 100 : 0;

  // IRR vs nominal
  const irrPct = (results.annualizedReturn || 0) * 100;
  const nominalPct = (results.annualReturn || 0) * 100;
  const irrLabel = `${irrPct.toFixed(2)}% (${nominalPct.toFixed(1)}%)`;

  // Plafond restant
  let plafondRestant = null;
  if (results.enveloppe?.plafond) {
    const p = typeof results.enveloppe.plafond === 'object' ? results.enveloppe.plafond.solo : results.enveloppe.plafond;
    plafondRestant = Math.max(0, p - results.investedTotal);
  }

  return { deltaCto, feesPct, irrLabel, plafondRestant };
}

function updateKPICards(kpis) {
  const fmtEur = (x) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(x);
  const feeColor = kpis.feesPct > 10 ? 'text-red-400' : (kpis.feesPct > 5 ? 'text-yellow-300' : 'text-green-400');

  const elDelta = document.getElementById('kpi-delta-cto');
  if (elDelta) { 
    elDelta.textContent = (kpis.deltaCto>=0?'+':'') + fmtEur(kpis.deltaCto); 
    elDelta.className = `text-xl font-bold ${kpis.deltaCto>=0?'text-green-400':'text-amber-300'}`;
    elDelta.title = 'Gain/perte net(te) vs CTO, fiscalité incluse';
  }

  const elFees = document.getElementById('kpi-fees-pct');
  if (elFees) { 
    elFees.textContent = `${kpis.feesPct.toFixed(1)} %`; 
    elFees.className = `text-xl font-bold ${feeColor}`;
    elFees.title = '⚠️ >10% élevé, 5–10% modéré, <5% ok';
  }

  const elIrr = document.getElementById('kpi-irr');
  if (elIrr) elIrr.textContent = kpis.irrLabel;

  const elPlaf = document.getElementById('kpi-plafond');
  if (elPlaf) elPlaf.textContent = kpis.plafondRestant==null ? '—' : fmtEur(kpis.plafondRestant);
}

// ✅ NOUVEAU : Résumé en 1 phrase déplacé dans bloc d'adéquation + pouvoir d'achat
function updateStory(params, results, deltaCtoNominal) {
  const fmt = (x) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(x);
  const adequacyOneLiner = document.getElementById('adequacy-one-liner');
  const storyAbove = document.getElementById('result-story'); // on le vide/masque

  // Base nominale
  const sign = deltaCtoNominal >= 0 ? '+' : '';
  let line = `Sur ${results.years} ans, à ${(params.annualReturn*100).toFixed(1)}% brut, `
           + `${results.enveloppe?.label || results.vehicleId} vous laisserait ${fmt(results.afterTaxAmount)} net, `
           + `soit ${sign}${fmt(deltaCtoNominal)} par rapport au CTO, `
           + `après ${fmt(results.feesImpact)} de frais et ${fmt(results.taxAmount)} d'impôts.`;

  // Ajout "pouvoir d'achat" (toujours, en utilisant l'inflation serveur si dispo)
  const infl = getInflationRate();                    // 0.02 = 2%/an par ex.
  const d = Math.pow(1 + infl, results.years);        // déflateur
  const netReel = results.afterTaxAmount / d;         // € constants
  // CTO de référence pour le delta réel
  const refCTO = calculateInvestmentResults(
    params.initialDeposit, params.periodicAmount, params.years, params.annualReturn, { vehicleId: 'cto' }
  );
  const ctoReel = refCTO.afterTaxAmount / d;
  const deltaCtoReel = netReel - ctoReel;
  const pertePouvoirAchat = results.afterTaxAmount - netReel;

  line += ` <br><span class="text-xs text-gray-400">Pouvoir d'achat : ≈ ${fmt(netReel)} d'aujourd'hui `
       +  `(Δ vs CTO : ${(deltaCtoReel>=0?'+':'')}${fmt(deltaCtoReel)} ; `
       +  `écart nominal→réel : −${fmt(Math.abs(pertePouvoirAchat))} ; `
       +  `inflation ${(infl*100).toFixed(1)}%/an)</span>`;

  if (adequacyOneLiner) adequacyOneLiner.innerHTML = line;
  if (storyAbove) { storyAbove.textContent = ''; storyAbove.classList.add('hidden'); }
}

// ✅ NOUVEAU : Appliquer l'inflation à l'affichage (pas au calcul)
function applyInflationDisplay(results) {
  if (!isRealTermsOn()) {
    // On ré-affiche juste les valeurs nominales
    updateResultsDisplay(results);
    return;
  }
  const infl = getInflationRate();
  const d = deflatorAt(results.years, infl);

  // Clone léger
  const real = { ...results };
  real.finalAmount      = Math.max(0, results.finalAmount / d);
  real.afterTaxAmount   = Math.max(0, results.afterTaxAmount / d);
  real.gains            = Math.max(0, results.gains / d);
  real.feesImpact       = Math.max(0, results.feesImpact / d);

  updateResultsDisplay(real);

  // Mentionner "€ constants"
  const story = document.getElementById('result-story');
  if (story) {
    story.insertAdjacentHTML('beforeend', ` <span class="ml-1 text-xs text-gray-400">(affiché en € constants, ${ (infl*100).toFixed(1) }%/an)</span>`);
  }
}

// Exposer les fonctions globalement pour l'utiliser depuis l'interface
window.resetFeesToPreset = resetFeesToPreset;
window.setAllFeesZero = setAllFeesZero;

document.addEventListener('DOMContentLoaded', function() {
  // ✅ Masquer les contrôles inflation si mode auto
  if (window.APP_CONFIG?.INFLATION?.mode === 'auto') {
    document.getElementById('inflation-controls')?.classList.add('hidden');
  }

  // Mise à jour date + graphique
  updateDate();
  createChart();

  // Sliders durée / rendement
  document.getElementById('duration-slider')?.addEventListener('input', function () {
    updateDurationValue(this.value);
  });
  document.getElementById('return-slider')?.addEventListener('input', function () {
    updateReturnValue(this.value);
  });

  // Bouton simulation
  document.getElementById('simulate-button')?.addEventListener('click', runSimulation);

  // Changement d’enveloppe
  document.getElementById('investment-vehicle')?.addEventListener('change', function () {
    updateTaxInfo();
    updateReturnSuggestions();
    updateFeeSuggestionsByVehicle(); // respecte modifications utilisateur
    if (document.querySelector('.result-value')?.textContent !== '') runSimulation();
  });

  // Toggle unique / périodique
  const uniqueBtn   = document.getElementById('unique-investment');
  const periodicBtn = document.getElementById('periodic-investment');
  if (uniqueBtn && periodicBtn) {
    uniqueBtn.addEventListener('click', () => {
      toggleInvestmentMode('unique');
      checkPlafondLimits();
      updateFixedFeeTooltip();
    });
    periodicBtn.addEventListener('click', () => {
      toggleInvestmentMode('periodic');
      checkPlafondLimits();
      updateFixedFeeTooltip();
    });
  }

  // Changement de fréquence (principal)
  const frequencySelect = document.getElementById('investment-frequency');
  if (frequencySelect) {
    frequencySelect.addEventListener('change', function () {
      updateFixedFeeTooltip();
      if (document.querySelector('.result-value')?.textContent !== '') runSimulation();
    });
  }

  // 🔗 Sync fréquence "Objectifs" <-> fréquence principale
  const gf = document.getElementById('goal-frequency');
  const mf = document.getElementById('investment-frequency');
  if (gf && mf) {
    gf.value = mf.value || 'monthly';                // init
    mf.addEventListener('change', e => { gf.value = e.target.value; }); // sync continu
  }

  // Inflation + presets 5/7/10
  document.getElementById('real-terms-toggle')?.addEventListener('change', () => runSimulation());
  document.getElementById('inflation-rate')?.addEventListener('input', () => runSimulation());
  document.querySelectorAll('#sensi-row [data-sensi]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = parseFloat(btn.getAttribute('data-sensi'));
      const slider = document.getElementById('return-slider');
      if (slider) { slider.value = v; updateReturnValue(v); }
      runSimulation();
    });
  });

  // 🔁 (REMPLACE L’ANCIEN) — Handler "Objectifs > Calculer"
  document.getElementById('goal-run')?.addEventListener('click', () => {
    const target       = Math.max(1, parseFloat(document.getElementById('goal-target')?.value) || 0);
    const years        = parseFloat(document.getElementById('duration-slider')?.value || 10);
    const annualReturn = parseFloat(document.getElementById('return-slider')?.value || 7) / 100;
    const vehicleId    = document.getElementById('investment-vehicle')?.value || 'pea';
    const fees         = readFeeParams();
    const mode         = document.getElementById('goal-mode')?.value || 'periodic-for-target';

    // Respecte le mode de l'UI (pas de périodique si "Unique" sélectionné)
    const isPeriodicUI   = document.getElementById('periodic-investment')?.classList.contains('selected');
    const frequency      = (document.getElementById('goal-frequency')?.value ||
                            document.getElementById('investment-frequency')?.value || 'monthly');
    const initialDeposit = parseFloat(document.getElementById('initial-investment-amount')?.value) || 0;

    const periodicInputEl = document.getElementById('periodic-investment-amount');
    const periodicUI      = isPeriodicUI ? (parseFloat(periodicInputEl?.value) || 0) : 0;

    let html = '';

    if (mode === 'periodic-for-target') {
      // Cherche le versement périodique nécessaire (en tenant compte du dépôt initial)
      const { periodic, results } = goalSeekPeriodicForTarget({
        target, years, initialDeposit, annualReturn, vehicleId, fees, frequency
      });
      const initialPart = initialDeposit > 0 ? ` (avec ${formatMoney(initialDeposit)} au départ)` : '';
      html = `Pour atteindre <b>${formatMoney(target)}</b> en ${years} ans (net d'impôts),
              il faut environ <b>${formatMoney(periodic)}</b> par ${freqLabelFR(frequency)}${initialPart}
              via ${results.enveloppe?.label}.`;
    } else {
      // Cherche la durée nécessaire avec les MONTANTS ACTUELS de l’UI
      const { years: y, results, unreachable, triedYears } = goalSeekYearsForTarget({
        target,
        initialDeposit,
        periodicAmount: periodicUI, // = 0 si mode unique
        annualReturn,
        vehicleId,
        fees,
        frequency
      });

      const initialPart = initialDeposit > 0 ? ` (avec ${formatMoney(initialDeposit)} au départ)` : '';

      if (unreachable) {
        const labelFreq = isPeriodicUI && periodicUI > 0 ? '/' + freqLabelFR(frequency) : '';
        html = `Avec <b>${formatMoney(periodicUI)}</b>${labelFreq}, l'objectif <b>${formatMoney(target)}</b>
                n'est pas atteignable en ${triedYears} ans. Augmentez le versement, la durée ou le rendement.`;
      } else {
        if (isPeriodicUI && periodicUI > 0) {
          html = `Avec <b>${formatMoney(periodicUI)}</b> par ${freqLabelFR(frequency)}${initialPart},
                  il faut environ <b>${y.toFixed(1)} ans</b> pour atteindre <b>${formatMoney(target)}</b>
                  (net via ${results.enveloppe?.label}).`;
        } else {
          html = `Sans versements périodiques${initialPart}, il faut environ <b>${y.toFixed(1)} ans</b>
                  pour atteindre <b>${formatMoney(target)}</b> (net via ${results.enveloppe?.label}).`;
        }
      }
    }

    document.getElementById('goal-result').innerHTML = html;
  });

  // Micro-UX Objectifs
  document.getElementById('goal-mode')?.addEventListener('change', (e) => {
    document.getElementById('goal-frequency-wrap').style.display =
      (e.target.value === 'periodic-for-target') ? 'block' : 'none';
  });

  // Scénarios
  document.getElementById('scenario-save')?.addEventListener('click', saveScenario);
  document.getElementById('scenario-clear')?.addEventListener('click', clearScenarios);

  // Comparateur
  document.querySelector('[data-target="envelope-compare"]')?.addEventListener('click', buildCompare);
  ['investment-vehicle','investment-frequency','periodic-investment-amount','initial-investment-amount','duration-slider','return-slider']
    .forEach(id => document.getElementById(id)?.addEventListener('input', () => {
      if (document.querySelector('.simulation-tab.active')?.getAttribute('data-target') === 'envelope-compare') {
        buildCompare();
      }
    }));

  // Onglets + calculateur fiscal
  initSimulationTabs();
  initFiscalCalculator();

  // Budget → relance si résultats déjà affichés
  [
    document.getElementById('simulation-budget-loyer'),
    document.getElementById('simulation-budget-quotidien'),
    document.getElementById('simulation-budget-extra'),
    document.getElementById('simulation-budget-invest')
  ].forEach(input => {
    if (input) {
      input.addEventListener('change', function () {
        if (document.querySelector('.result-value')?.textContent !== '') runSimulation();
      });
    }
  });

  // UI frais : boutons utilitaires + tooltips
  addFeeResetButton();
  setTimeout(() => { updateFixedFeeTooltip(); }, 500);

  // UI périodique : init + listeners
  setTimeout(() => { updatePeriodicUI(); }, 100);
  document.getElementById('investment-frequency')?.addEventListener('change', updatePeriodicUI);
  document.getElementById('periodic-investment-amount')?.addEventListener('input', updatePeriodicUI);
  document.getElementById('periodic-investment')?.addEventListener('click', () => setTimeout(updatePeriodicUI, 0));
  document.getElementById('unique-investment')?.addEventListener('click', () => setTimeout(updatePeriodicUI, 0));

  // Table des scénarios
  renderScenarioTable();
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
 * MODIFIÉE : Séparation montant initial et montant périodique + hook comparateur
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
        
        // ✅ NOUVEAU : KPIs + Story (sur valeurs nominales)
        const kpis = computeKPIs({ initialDeposit, periodicAmount, years, annualReturn }, results);
        updateKPICards(kpis);
        updateStory({ initialDeposit, periodicAmount, years, annualReturn }, results, kpis.deltaCto);

        // ✅ NOUVEAU : € constants : ré-affiche les résultats + graphe si toggle ON
        if (isRealTermsOn()) {
          applyInflationDisplay(results);
        } else {
          updateResultsDisplay(results); // nominal
        }
        
        // Calculer et mettre à jour les résultats du budget
        updateBudgetResults(results, years);
        
        // Restaurer le bouton
        button.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Lancer la simulation';
        button.disabled = false;
        
        // ✅ NOUVEAU : Auto-refresh du comparateur après simulation
        setTimeout(buildCompare, 0);
    }, 800);
}

/**
 * Calcule les résultats d'investissement avec fiscalité et frais.
 * ✅ Supporte les overrides (mode périodique/fréquence) et l'arrêt des versements (stopAfterYears).
 *
 * @param {number} initialDeposit  Montant initial versé au départ
 * @param {number} periodicAmount  Montant des versements périodiques
 * @param {number} years           Nombre d'années (peut être fractionnaire)
 * @param {number} annualReturn    Rendement annuel (décimal, ex: 0.07 pour 7%)
 * @param {Object} [opts]          Options
 * @param {string} [opts.vehicleId]              ID de l’enveloppe (sinon lu depuis l’UI)
 * @param {Object} [opts.fees]                   Frais { mgmtPct, entryPct, exitPct, fixedAnnual }
 * @param {Object} [opts.overridePeriodic]       { mode:'periodic'|'unique', frequency:'weekly'|'monthly'|'quarterly'|'annually' }
 * @param {number} [opts.stopAfterYears]         Durée (en années) après laquelle les versements cessent
 * @returns {{
 *   initialDeposit:number, periodicTotal:number, investedTotal:number,
 *   finalAmount:number, gains:number, afterTaxAmount:number, taxAmount:number,
 *   feesImpact:number, annualizedReturn:number, years:number, annualReturn:number,
 *   vehicleId:string, enveloppe:Object|null
 * }}
 */
function calculateInvestmentResults(initialDeposit, periodicAmount, years, annualReturn, opts = {}) {
  // --- Helper : FV d'une série de versements "ordinaires" (fin de période)
  // k = nombre de versements effectués ; n = horizon total (en périodes)
  function fvSeries(ratePerPeriod, payment, k, n) {
    if (payment <= 0 || k <= 0) return 0;
    if (!isFinite(ratePerPeriod) || Math.abs(ratePerPeriod) < 1e-12) {
      // Taux ~ 0 => pas de capitalisation
      return payment * k;
    }
    // FV à l'horizon n d'une annuité "ordinaire" stoppée après k versements :
    // payment * ((1+r)^k - 1)/r * (1+r)^(n - k)
    return payment * ((Math.pow(1 + ratePerPeriod, k) - 1) / ratePerPeriod) * Math.pow(1 + ratePerPeriod, (n - k));
  }

  const vehicleId = opts.vehicleId || document.getElementById('investment-vehicle')?.value || 'pea';
  const enveloppe = getEnveloppeInfo(vehicleId);

  // Frais : overrides (comparateur) ou UI
  const fees = opts.fees || readFeeParams();

  // Overrides explicites pour le mode périodique / fréquence
  const override = opts.overridePeriodic || null;
  const isPeriodicMode = override
    ? (override.mode === 'periodic')
    : document.getElementById('periodic-investment')?.classList.contains('selected');

  const frequency = override?.frequency || (document.getElementById('investment-frequency')?.value || 'monthly');
  const p = (frequency === 'weekly') ? 52 : (frequency === 'monthly') ? 12 : (frequency === 'quarterly') ? 4 : 1;

  // Stop des versements (plafond) éventuel
  const stopAfterYears = (typeof opts.stopAfterYears === 'number')
    ? Math.max(0, Math.min(years, opts.stopAfterYears))
    : years;

  const k = Math.max(0, Math.round(stopAfterYears * p)); // nb de périodes AVEC versements
  const n = Math.max(0, Math.round(years * p));          // horizon total en périodes

  // --- Versements bruts investis
  const periodicTotal = isPeriodicMode ? periodicAmount * k : 0;
  const investedTotal = initialDeposit + periodicTotal;

  // Versements nets après frais d'entrée
  const initialNet  = initialDeposit * (1 - fees.entryPct);
  const periodicNet = isPeriodicMode ? periodicAmount * (1 - fees.entryPct) : 0;

  // Taux périodique effectif (garantit (1+rPer)^p = 1+annualReturn)
  const rPer = Math.pow(1 + annualReturn, 1 / p) - 1;

  // --- Capital final SANS frais (référence pour mesurer l'impact des frais)
  let finalNoFees = initialDeposit * Math.pow(1 + rPer, n);
  if (isPeriodicMode && periodicAmount > 0 && k > 0) {
    // série ordinaire (fin de période)
    finalNoFees += fvSeries(rPer, periodicAmount, k, n);
  }

  // Raccourci "zéro frais"
  const noFees = fees.mgmtPct === 0 && fees.entryPct === 0 && fees.exitPct === 0 && fees.fixedAnnual === 0;

  let finalWithFees;
  if (noFees) {
    finalWithFees = finalNoFees;
  } else {
    // --- Capital final AVEC frais ---
    // Gestion (%/an) proratisée par période
    const fPer = fees.mgmtPct / p;
    const rNetPer = ((1 + rPer) * (1 - fPer)) - 1;

    // 1) Croissance du dépôt initial net
    finalWithFees = initialNet * Math.pow(1 + rNetPer, n);

    // 2) Valeur future des versements périodiques nets (série ordinaire), stoppés après k périodes
    if (isPeriodicMode && periodicNet > 0 && k > 0) {
      finalWithFees += fvSeries(rNetPer, periodicNet, k, n);
    }

    // 3) Frais fixes annuels (prélevés fin d'année) capitalisés jusqu'à l'horizon
    if (fees.fixedAnnual > 0) {
      let fixedFV = 0;
      for (let year = 1; year <= Math.max(1, Math.round(years)); year++) {
        const periodsRemaining = (Math.round(years) - year) * p;
        fixedFV += fees.fixedAnnual * Math.pow(1 + rNetPer, periodsRemaining);
      }
      finalWithFees -= fixedFV;
    }

    // 4) Frais de sortie (en % du capital final)
    if (fees.exitPct > 0) {
      finalWithFees *= (1 - fees.exitPct);
    }
  }

  const finalAmount = round2(finalWithFees);
  const gains = round2(finalAmount - investedTotal);

  // Impact des frais (référence sans frais – avec frais)
  let feesImpact = round2(finalNoFees - finalWithFees);
  if (Math.abs(feesImpact) < 0.01) feesImpact = 0;

  // Rendement annualisé (IRR si versements périodiques sinon CAGR)
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

  // Fiscalité sur le gain
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
 * MODIFIÉE : Prend maintenant initialDeposit et periodicAmount séparés + courbe "sans frais" + inflation
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

    // ✅ NOUVEAU : € constants (déflateur année par année)
    if (isRealTermsOn()) {
      const infl = getInflationRate();
      const deflateSeries = (arr) => arr.map((v, idx) => v / deflatorAt(idx, infl));
      // idx = année
      window.investmentChart.data.datasets[0].data = deflateSeries(totalValues);
      window.investmentChart.data.datasets[1].data = deflateSeries(investedValues);

      const idxNF = window.investmentChart.data.datasets.findIndex(d => d.label === 'Capital total (sans frais)');
      if (idxNF !== -1) window.investmentChart.data.datasets[idxNF].data = deflateSeries(totalNoFees);
    } else {
      // Nominal
      window.investmentChart.data.datasets[0].data = totalValues;
      window.investmentChart.data.datasets[1].data = investedValues;
    }

    // Injecter/mettre à jour le dataset pointillé "sans frais"
    const labelNoFees = 'Capital total (sans frais)';
    const idx = window.investmentChart.data.datasets.findIndex(d => d.label === labelNoFees);
    const noFeesData = isRealTermsOn() ? 
      totalNoFees.map((v, i) => v / deflatorAt(i, getInflationRate())) : 
      totalNoFees;
    const noFeesDataset = {
        label: labelNoFees,
        data: noFeesData,
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

    const initialAmountContainer = document.getElementById('initial-amount-container'); // <-- ID HTML actuel
    const periodicAmountContainer = document.getElementById('periodic-amount-container');
    
    if (mode === 'unique') {
        // Versement unique actif
        uniqueButton.classList.add('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        uniqueButton.classList.remove('text-gray-300');
        
        periodicButton.classList.remove('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        periodicButton.classList.add('text-gray-300');
        
        frequencyContainer.style.display = 'none';
        if (initialAmountContainer) initialAmountContainer.style.display = 'block';
        if (periodicAmountContainer) periodicAmountContainer.style.display = 'none';
        
    } else if (mode === 'periodic') {
        // Versement périodique actif
        periodicButton.classList.add('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        periodicButton.classList.remove('text-gray-300');
        
        uniqueButton.classList.remove('selected', 'text-green-400', 'bg-green-900', 'bg-opacity-30');
        uniqueButton.classList.add('text-gray-300');
        
        frequencyContainer.style.display = 'block';
        if (initialAmountContainer) initialAmountContainer.style.display = 'block'; // on garde le dépôt initial visible
        if (periodicAmountContainer) periodicAmountContainer.style.display = 'block';
    }
    
    // Met à jour l'UI périodique (suffixe + aide/an) et relance si déjà simulé
    updatePeriodicUI();
    const hasResults = document.querySelector('.result-value')?.textContent?.trim();
    if (hasResults) runSimulation();
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
        // ✅ CORRECTIF : ID corrigé pour mode unique
        amount = parseFloat(document.getElementById('initial-investment-amount')?.value) || 1000;
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
