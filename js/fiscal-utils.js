// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.4 - Correction formule cotisations TNS

const CSG_CRDS_IMPOSABLE = 0.029;    // 2,4% CSG non déductible + 0,5% CRDS = 2,9%

class FiscalUtils {
    // Calcul d'IR par tranches progressives
    static calculateProgressiveIR(revenuImposable) {
        // Garde-fou: pas d'IR négatif
        if (revenuImposable <= 0) return 0;
        
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
    
    // Optimisation du ratio rémunération/dividendes - VERSION CORRIGÉE
    static optimiserRatioRemuneration(params, simulationFunc) {
        // UTILISER les paramètres min/max passés
        const ratioMin = params.ratioMin ?? 0;
        const ratioMax = params.ratioMax ?? 1;
        const favoriserDividendes = params.favoriserDividendes || false;
        
        let meilleurRatio = favoriserDividendes ? ratioMin : (ratioMin + ratioMax) / 2;
        let meilleurNet = 0;
        
        // Tester différents ratios entre ratioMin et ratioMax
        for(let ratio = ratioMin; ratio <= ratioMax + 1e-9; ratio += 0.05) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // Affiner autour du meilleur résultat
        const deb = Math.max(ratioMin, meilleurRatio - 0.04);
        const fin = Math.min(ratioMax, meilleurRatio + 0.04);
        
        for(let ratio = deb; ratio <= fin + 1e-9; ratio += 0.01) {
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
        // Garde-fou: pas de cotisations négatives
        if (rem <= 0) return 0;
        
        const PASS = 47100;              // Plafond annuel SS 2025
        const trancheA = Math.min(rem, PASS) * 0.28;   // maladie + vieillesse de base
        const trancheB = Math.max(0, rem - PASS) * 0.17;
        const csg = rem * 0.092;
        const crds = rem * 0.005;
        return Math.round(trancheA + trancheB + csg + crds);
    }
    
    // Calcul des cotisations TNS sur bénéfice brut - CORRECTION: formule simplifiée
    static cotisationsTNSSurBenefice(beneficeBrut) {
        // Garde-fou: pas de cotisations négatives
        if (beneficeBrut <= 0) return 0;
        
        // CORRECTION: Calcul simple et direct - 45% du bénéfice
        // Plus de formule étrange avec division par (1 + tauxGlobal)
        const tauxGlobal = 0.45;
        return Math.round(beneficeBrut * tauxGlobal);
    }
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(dividendes, capitalSocial) {
        // Garde-fou: pas de cotisations négatives
        if (dividendes <= 0) return 0;
        
        // Calcul précis avec les tranches 2025
        const PASS = 47100;
        const base = Math.max(0, dividendes - 0.10 * capitalSocial);
        const partA = Math.min(base, PASS) * 0.28;
        const partB = Math.max(0, base - PASS) * 0.1775;
        return Math.round(partA + partB);
    }
    
    // Calcul des charges salariales - TAUX CORRIGÉS pour SASU
    static calculChargesSalariales(remuneration, options = {}) {
        // Garde-fou: pas de charges négatives
        if (remuneration <= 0) {
            return {
                patronales: 0,
                salariales: 0,
                total: 0
            };
        }
        
        const { secteur = "Tous", taille = "<50" } = options;
        
        // Taux réels 2025 pour assimilé salarié
        // Total ~77% (22% salariales + 55% patronales)
        return {
            patronales: Math.round(remuneration * 0.55), // Corrigé de 0.45 à 0.55
            salariales: Math.round(remuneration * 0.22),
            total: Math.round(remuneration * 0.77)       // Corrigé de 0.67 à 0.77
        };
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        // Garde-fou: pas de PFU négatif
        if (dividendes <= 0) return 0;
        
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches avec paramètres additionnels
    static calculIS(resultat, params = {}) {
        // FIX CRITIQUE: Pas d'IS négatif si déficit
        if (resultat <= 0) return 0;
        
        const seuil = 42500;
        const okTauxReduit = resultat <= seuil 
            && (params.ca ?? Infinity) < 10000000
            && (params.capitalEstLibere ?? true)
            && (params.detentionPersPhysiques75 ?? true);
        return Math.round(resultat * (okTauxReduit ? 0.15 : 0.25));
    }
    
    // Création de données pour le graphique d'optimisation
    static genererDonneesGraphiqueOptimisation(params, simulationFunc) {
        const ratioMin = params.ratioMin ?? 0;
        const ratioMax = params.ratioMax ?? 1;
        const donnees = [];
        
        // Générer les données entre ratioMin et ratioMax
        const step = (ratioMax - ratioMin) / 20; // 20 points
        
        for(let ratio = ratioMin; ratio <= ratioMax + 1e-9; ratio += step) {
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
    console.log("Module FiscalUtils chargé (v1.4 avec correction formule cotisations TNS)");
    document.dispatchEvent(new CustomEvent('fiscalUtilsReady'));
});