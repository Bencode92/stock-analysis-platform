// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.1 - Mai 2025 - Mise à jour des taux 2025

// Constantes globales pour les taux de charges
const CSG_CRDS_IMPOSABLE = 0.029;    // 2,4% CSG non déductible + 0,5% CRDS
// Exposer la constante au niveau global pour qu'elle soit accessible dans fiscal-simulation.js
window.CSG_CRDS_IMPOSABLE = CSG_CRDS_IMPOSABLE;

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
        
        // Déterminer si c'est un statut TNS (pour le seuil minimum de ratio)
        const isTNS = ['eurlIS', 'sarl', 'selarl', 'sca'].includes(params.typeEntreprise);
        const capitalSocial = params.capitalSocial || 1;
        
        // Ratio minimum pour éviter que les dividendes ne dépassent trop le seuil de 10% du capital
        let ratioMinimum = params.ratioMin || 0;
        if (isTNS && params.ca > 0) {
            // Calculer le ratio minimum qui limite les dividendes (approx.)
            const margeEffective = params.tauxMarge ?? (params.tauxFrais ? (1 - params.tauxFrais) : 0.3);
            const resultatEstime = params.ca * margeEffective; 
            const dividendesMax = 0.10 * capitalSocial;
            const minRatioForTax = Math.max(0, 1 - (dividendesMax / (resultatEstime * 0.85))); // 0.85 pour tenir compte de l'IS
            
            // Prendre le plus grand entre le ratio min défini et celui calculé
            ratioMinimum = Math.max(ratioMinimum, minRatioForTax);
        }
        
        // Tester différents ratios de ratioMinimum à 100% par pas de 5%
        for(let ratio = Math.max(ratioMinimum, 0.0); ratio <= 1.0; ratio += 0.05) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // Affiner autour du meilleur résultat
        for(let ratio = Math.max(ratioMinimum, Math.max(0.01, meilleurRatio-0.04)); 
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
    
    // Calcul des cotisations TNS sur bénéfice (formule fermée plus précise)
    static cotisationsTNSSurBenefice(beneficeBrut) {
        const tauxGlobal = 0.45;
        return Math.round(beneficeBrut * tauxGlobal / (1 + tauxGlobal));
    }
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(dividendes, capitalSocial) {
        const base = Math.max(0, dividendes - 0.10 * capitalSocial);
        // Utiliser 75% du taux normal des cotisations TNS (exclut certaines cotisations)
        return Math.round(this.cotisationsTNSSurBenefice(base) * 0.75);
    }
    
    // Calcul des charges salariales
    static calculChargesSalariales(remuneration) {
        // Taux moyens 2025 - peuvent varier selon secteur, allègements et part des charges plafonnées
        return {
            patronales: Math.round(remuneration * 0.45),
            salariales: Math.round(remuneration * 0.22),
            total: Math.round(remuneration * 0.67)
        };
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches et conditions d'éligibilité au taux réduit
    static calculIS(resultat, params = {}) {
        const seuil = 42750; // Seuil revalorisé 2025
        const okTauxReduit = resultat <= seuil
          && (params.ca ?? Infinity) < 10_000_000
          && (params.capitalEstLibere !== false)
          && (params.detentionPersPhysiques75 !== false);
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
