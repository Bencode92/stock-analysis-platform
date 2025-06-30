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
        const later