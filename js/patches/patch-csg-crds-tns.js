// patch-csg-crds-tns.js - Correctif pour la réintégration CSG/CRDS non déductible des TNS
// Ce fichier contient les modifications à appliquer dans fiscal-simulation.js

// IMPORTANT: Ces modifications doivent être intégrées dans fiscal-simulation.js
// pour corriger le calcul de l'impôt sur le revenu des dirigeants TNS

/*
PROBLÈME IDENTIFIÉ:
Pour les dirigeants TNS (EURL IS, SARL gérant majoritaire, SELARL, SCA),
la CSG/CRDS non déductible (2,9% de la rémunération brute) n'est pas réintégrée
dans la base imposable pour le calcul de l'impôt sur le revenu.

IMPACT:
- L'IR est sous-estimé car calculé sur une base trop faible
- Pour une rémunération de 2.77M€, cela représente 80k€ de base imposable manquante
- L'erreur peut représenter plusieurs dizaines de milliers d'euros d'impôt

SOLUTION:
Réintégrer systématiquement la CSG/CRDS non déductible dans la base imposable
pour tous les statuts TNS avant le calcul de l'IR.
*/

// Exemple de correction pour la méthode simulerEURL (à adapter pour IS = true)
// Dans la section EURL à l'IS :

/*
// Calcul des cotisations TNS
const cotisationsSociales = FiscalUtils.calculCotisationsTNS(remuneration);
const remunerationNetteSociale = remuneration - cotisationsSociales;

// AJOUT CRITIQUE: Réintégration CSG/CRDS non déductible
const csgNonDeductible = Math.round(remuneration * CSG_CRDS_IMPOSABLE); // 2.9%
const baseImposableIR = remunerationNetteSociale + csgNonDeductible;

// Calcul de l'IR sur la BASE IMPOSABLE (et non sur le net social)
const impotRevenu = modeExpert 
    ? FiscalUtils.calculateProgressiveIR(baseImposableIR)
    : Math.round(baseImposableIR * tmiActuel / 100);
*/

// Modifications similaires nécessaires pour:
// - simulerSARL (quand gerantMajoritaire = true)
// - simulerSELARL
// - simulerSCA

// Dans le retour de chaque fonction, ajouter:
/*
return {
    // ... propriétés existantes ...
    csgNonDeductible,      // Nouveau: montant CSG non déductible
    baseImposableIR,       // Nouveau: base imposable incluant CSG
    // ... autres propriétés ...
};
*/

// TESTS DE VALIDATION
function validateCSGIntegration() {
    const testCases = [
        {
            statut: 'EURL IS',
            remuneration: 2772000,
            expected: {
                cotisationsTNS: 831600,
                revenuNetSocial: 1940400,
                csgNonDeductible: 80388,
                baseImposableIR: 2020788
            }
        }
    ];
    
    console.log("Validation de l'intégration CSG/CRDS:");
    testCases.forEach(test => {
        console.log(`\n${test.statut}:`);
        console.log(`- Rémunération: ${test.remuneration.toLocaleString()}€`);
        console.log(`- CSG non déductible attendue: ${test.expected.csgNonDeductible.toLocaleString()}€`);
        console.log(`- Base imposable attendue: ${test.expected.baseImposableIR.toLocaleString()}€`);
    });
}

// Export pour référence
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateCSGIntegration };
}
