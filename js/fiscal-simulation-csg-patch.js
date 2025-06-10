// Patch pour corriger la CSG non déductible dans EI et EURL à l'IR
// À intégrer dans fiscal-simulation.js

// Fonction utilitaire pour calculer la CSG non déductible
function calculerCSGNonDeductible(cotisationsSociales) {
    // La CSG représente environ 9.7% des cotisations TNS
    // Dont 2.4% non déductible et 6.8% déductible
    // Sur un taux de cotisations de 30%, cela représente environ :
    const tauxCSGDansCotisations = 0.097 / 0.30; // ~32.3% des cotisations
    const tauxCSGNonDeductible = 0.024 / 0.097; // ~24.7% de la CSG
    
    const csgTotale = cotisationsSociales * tauxCSGDansCotisations;
    const csgNonDeductible = csgTotale * tauxCSGNonDeductible;
    
    return Math.round(csgNonDeductible);
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculerCSGNonDeductible };
}

// Instructions d'intégration :
// 1. Ajouter la fonction calculerCSGNonDeductible au début de fiscal-simulation.js
// 2. Modifier simulerEI() pour inclure le calcul de CSG non déductible
// 3. Modifier simulerEURL() partie IR pour inclure le calcul de CSG non déductible
// 4. Ajouter l'affichage dans showCalculationDetails() de fiscal-guide.js

console.log("Patch CSG non déductible chargé - À intégrer dans fiscal-simulation.js");
