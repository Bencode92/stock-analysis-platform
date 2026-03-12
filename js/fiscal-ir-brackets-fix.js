/**
 * fiscal-ir-brackets-fix.js
 * Corrige les tranches IR dans fiscal-simulation.js
 * 
 * BUG : fiscal-simulation.js utilise les tranches 2023 (11497/26037/74545/160336)
 * FIX : tranches IR 2025 revenus 2024 (11497/29315/83823/180294)
 * 
 * Ce fichier DOIT être chargé APRÈS fiscal-simulation.js
 * Les fonctions globales sont écrasées avec les bonnes valeurs.
 */

// Correction 1 : calculerTMI — utilisée comme fallback dans SimulationsFiscales
window.calculerTMI = function(revenuImposable) {
    if (revenuImposable <= 11497) return 0;
    if (revenuImposable <= 29315) return 11;
    if (revenuImposable <= 83823) return 30;
    if (revenuImposable <= 180294) return 41;
    return 45;
};

// Correction 2 : calculateProgressiveIRFallback — utilisée quand FiscalUtils absent
window.calculateProgressiveIRFallback = function(revenuImposable) {
    const tranches = [
        { max: 11497, taux: 0 },
        { max: 29315, taux: 0.11 },
        { max: 83823, taux: 0.30 },
        { max: 180294, taux: 0.41 },
        { max: Infinity, taux: 0.45 }
    ];
    
    let impot = 0;
    let resteImposable = revenuImposable;
    
    for (let i = 0; i < tranches.length; i++) {
        const tranche = tranches[i];
        const minTranche = i === 0 ? 0 : tranches[i-1].max;
        const maxTranche = tranche.max;
        
        if (resteImposable > 0) {
            const montantDansTranche = Math.min(resteImposable, maxTranche - minTranche);
            impot += montantDansTranche * tranche.taux;
            resteImposable -= montantDansTranche;
        }
    }
    
    return Math.round(impot);
};

console.log('IR brackets fix loaded: 11497/29315/83823/180294 (IR 2025)');
