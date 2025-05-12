// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.1 - Mai 2025 - Mise à jour des taux 2025

const CSG_CRDS_IMPOSABLE = 0.029;    // 2,4% CSG non déductible + 0,5% CRDS = 2,9%

// SMIC annuel 2025 pour les calculs de plages
const SMIC_ANNUEL_2025 = 21060;

// Table paramétrable des charges sociales SASU (2025)
const CHARGES_SASU_2025 = [
    // Tous secteurs, différentes tailles
    { secteur: "Tous", taille: "<50", plage: "<1.6", tauxPatronal: 0.28, tauxSalarial: 0.21, description: "Réduction générale maximale" },
    { secteur: "Tous", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.33, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Tous", taille: "<50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.21, description: "Taux pleins" },
    { secteur: "Tous", taille: ">=50", plage: "<1.6", tauxPatronal: 0.32, tauxSalarial: 0.21, description: "FNAL majoré, réduction max" },
    { secteur: "Tous", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.36, tauxSalarial: 0.21, description: "FNAL majoré, réduction part." },
    { secteur: "Tous", taille: ">=50", plage: ">2.5", tauxPatronal: 0.43, tauxSalarial: 0.21, description: "FNAL majoré, taux pleins" },
    
    // Commerce
    { secteur: "Commerce", taille: "<50", plage: "<1.6", tauxPatronal: 0.28, tauxSalarial: 0.21, description: "AT faible, famille réduit" },
    { secteur: "Commerce", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.33, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Commerce", taille: "<50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.22, description: "Taux pleins" },
    { secteur: "Commerce", taille: ">=50", plage: "<1.6", tauxPatronal: 0.32, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Commerce", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.36, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Commerce", taille: ">=50", plage: ">2.5", tauxPatronal: 0.43, tauxSalarial: 0.22, description: "Taux pleins" },
    
    // Industrie
    { secteur: "Industrie", taille: "<50", plage: "<1.6", tauxPatronal: 0.30, tauxSalarial: 0.21, description: "AT moyen, famille réduit" },
    { secteur: "Industrie", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.35, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Industrie", taille: ">=50", plage: "<1.6", tauxPatronal: 0.34, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Industrie", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.38, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Industrie", taille: ">=50", plage: ">2.5", tauxPatronal: 0.45, tauxSalarial: 0.22, description: "FNAL majoré, taux pleins" },
    
    // Services
    { secteur: "Services", taille: "<50", plage: "<1.6", tauxPatronal: 0.29, tauxSalarial: 0.21, description: "AT très faible" },
    { secteur: "Services", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.33, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Services", taille: "<50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.21, description: "Taux pleins" },
    { secteur: "Services", taille: ">=50", plage: "<1.6", tauxPatronal: 0.32, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Services", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.36, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Services", taille: ">=50", plage: ">2.5", tauxPatronal: 0.43, tauxSalarial: 0.22, description: "FNAL majoré, taux pleins" }
];

class FiscalUtils {
    // Calcul d'IR par tranches progressives
    static calculateProgressiveIR(revenuImposable) {
        const tranches = [
            { max: 11497, taux: 0   },  // Mise à jour barème 2025
            { max: 29315, taux: 0.11},
            { max: 83823, taux: 0.30},
            { max: 180294, taux: 0.41},
            { max: Infinity, taux: 0.45}
        ];
        
        let impot = 0;
        let min = 0;
        for (const t of tranches) {
            const taxable = Math.max(0, Math.min(revenuImposable - min, t.max - min));
            impot += taxable * t.taux;
            min = t.max;
        }
        
        return Math.round(impot);
    }
    
    // Optimisation du ratio rémunération/dividendes
    static optimiserRatioRemuneration(params, simulationFunc) {
        let meilleurRatio = 0.5;
        let meilleurNet = 0;
        
        // Tester différents ratios de 0% à 100% par pas de 5%
        for(let ratio = 0.0; ratio <= 1.0; ratio += 0.05) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // Affiner autour du meilleur résultat
        for(let ratio = Math.max(0.01, meilleurRatio-0.04); 
            ratio <= Math.min(0.99, meilleurRatio+0.04); 
            ratio += 0.01) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // Calculer le résultat final avec le ratio optimal
        const resultatFinal = simulationFunc({...params, tauxRemuneration: meilleurRatio});
        resultatFinal.ratioOptimise = meilleurRatio;
        
        return {
            ratio: meilleurRatio,
            net: meilleurNet,
            resultat: resultatFinal
        };
    }
    
    // Calcul des cotisations TNS avec barème progressif
    static calculCotisationsTNS(rem) {
        const PASS = 47100;              // Plafond annuel SS 2025
        const trancheA = Math.min(rem, PASS) * 0.28;   // maladie + vieillesse de base
        const trancheB = Math.max(0, rem - PASS) * 0.17;
        const csg = rem * 0.092;
        const crds = rem * 0.005;
        return Math.round(trancheA + trancheB + csg + crds);
    }
    
    // Calcul des cotisations TNS sur bénéfice brut (formule fermée)
    static cotisationsTNSSurBenefice(beneficeBrut) {
        const tauxGlobal = 0.45;
        return Math.round(beneficeBrut * tauxGlobal / (1 + tauxGlobal));
    }
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(dividendes, capitalSocial) {
        // Calcul précis avec les tranches 2025
        const PASS = 47100;
        const base = Math.max(0, dividendes - 0.10 * capitalSocial);
        const partA = Math.min(base, PASS) * 0.28;
        const partB = Math.max(0, base - PASS) * 0.1775;
        return Math.round(partA + partB);
    }
    
    // Calcul des charges salariales avec table paramétrable
    static calculChargesSalariales(remuneration, params = {}) {
        // Paramètres optionnels avec valeurs par défaut
        const secteur = params.secteur || "Tous";
        const taille = params.taille || "<50";
        
        // Déterminer la plage de salaire par rapport au SMIC
        const ratio = remuneration / SMIC_ANNUEL_2025;
        let plage = ratio < 1.6 ? "<1.6" : (ratio <= 2.5 ? "1.6-2.5" : ">2.5");
        
        // Rechercher les taux dans la table
        let tauxPatronal = 0.45; // Valeur par défaut
        let tauxSalarial = 0.22; // Valeur par défaut
        
        // Recherche du taux le plus spécifique possible
        for (const ligne of CHARGES_SASU_2025) {
            if ((ligne.secteur === secteur || ligne.secteur === "Tous") &&
                (ligne.taille === taille) &&
                ligne.plage === plage) {
                tauxPatronal = ligne.tauxPatronal;
                tauxSalarial = ligne.tauxSalarial;
                break;
            }
        }
        
        return {
            patronales: Math.round(remuneration * tauxPatronal),
            salariales: Math.round(remuneration * tauxSalarial),
            total: Math.round(remuneration * (tauxPatronal + tauxSalarial))
        };
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches avec paramètres additionnels
    static calculIS(resultat, params = {}) {
        const seuil = 42500;
        const okTauxReduit = resultat <= seuil 
            && (params.ca ?? Infinity) < 10000000
            && (params.capitalEstLibere ?? true)
            && (params.detentionPersPhysiques75 ?? true);
        return Math.round(resultat * (okTauxReduit ? 0.15 : 0.25));
    }
    
    // Création de données pour le graphique d'optimisation
    static genererDonneesGraphiqueOptimisation(params, simulationFunc) {
        const donnees = [];
        for(let ratio = 0.05; ratio <= 1; ratio += 0.05) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simulationFunc(paramsTest);
            donnees.push({
                ratio: Math.round(ratio * 100),
                revenuNet: resultat.revenuNetTotal,
                repartition: {
                    remuneration: resultat.salaireNetApresIR || resultat.revenuNetSalaire || 0,
                    dividendes: resultat.dividendesNets || 0
                }
            });
        }
        return donnees;
    }
}

// Exposer la classe au niveau global
window.FiscalUtils = FiscalUtils;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module FiscalUtils chargé et disponible globalement");
    document.dispatchEvent(new CustomEvent('fiscalUtilsReady'));
});