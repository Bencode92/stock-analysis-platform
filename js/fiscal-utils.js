// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.1 - Mai 2025 - Mise à jour des taux 2025

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
        
        // Tester différents ratios de 0% à 90% par pas de 5%
        for(let ratio = 0.0; ratio <= 0.9; ratio += 0.05) {
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
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(dividendes, capitalSocial) {
        const base = Math.max(0, dividendes - 0.10 * capitalSocial);
        return Math.round(base * 0.45); // taux global 2025
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
    
    // Calcul IS selon tranches
    static calculIS(resultat) {
        const seuil = 42500;
        const tauxIS = resultat <= seuil ? 0.15 : 0.25;
        return Math.round(resultat * tauxIS);
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