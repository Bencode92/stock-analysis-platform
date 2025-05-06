// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.0 - Mai 2025

class FiscalUtils {
    // Calcul d'IR par tranches progressives
    static calculateProgressiveIR(revenuImposable) {
        const tranches = [
            { max: 11294, taux: 0 },
            { max: 28797, taux: 0.11 },
            { max: 82341, taux: 0.30 },
            { max: 177106, taux: 0.41 },
            { max: Infinity, taux: 0.45 }
        ];
        
        let impot = 0;
        let reste = revenuImposable;
        
        for(let i = 0; i < tranches.length; i++) {
            const min = i > 0 ? tranches[i-1].max + 1 : 0;
            const montantTranche = Math.min(Math.max(0, reste), tranches[i].max - min);
            impot += montantTranche * tranches[i].taux;
            reste -= montantTranche;
            if(reste <= 0) break;
        }
        
        return Math.round(impot);
    }
    
    // Optimisation du ratio rémunération/dividendes
    static optimiserRatioRemuneration(params, simulationFunc) {
        let meilleurRatio = 0.5;
        let meilleurNet = 0;
        
        // Tester différents ratios de 10% à 90% par pas de 5%
        for(let ratio = 0.1; ratio <= 0.9; ratio += 0.05) {
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
    
    // Calcul des cotisations TNS
    static calculCotisationsTNS(remuneration) {
        return Math.round(remuneration * 0.45);
    }
    
    // Calcul des charges salariales
    static calculChargesSalariales(remuneration) {
        return {
            patronales: Math.round(remuneration * 0.55),
            salariales: Math.round(remuneration * 0.22),
            total: Math.round(remuneration * 0.77)
        };
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches
    static calculIS(resultat) {
        const tauxIS = resultat <= 42500 ? 0.15 : 0.25;
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