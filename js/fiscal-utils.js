// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.2 - Mai 2025 - Mise à jour des taux 2025 et précision des calculs

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
    
    // Taux de CFP selon le code APE
    static tauxCFP(codeApe) {
        const secteur = codeApe?.slice(0,2) ?? '';
        if (['47','45','46','56','41','42','43'].includes(secteur)) return 0.001;  // commerce
        if (['10','20','25','28','33'].includes(secteur))        return 0.003;  // artisanat
        return 0.002;                                                             // libéral par défaut
    }

    // Vérification d'éligibilité au versement libératoire
    static vflEligible(rfrN2, ca, plafondCA) {
        return rfrN2 !== undefined && rfrN2 <= 27_478 && ca <= plafondCA; // seuil 2025 déclarant seul
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
    
    // Calcul des cotisations TNS avec barème détaillé
    static cotiTNS(revenuNet) {
        const PASS = 47_100;                       // 2025
        const malVieBase  = Math.min(revenuNet, PASS) * 0.172;
        const malVieSup   = Math.max(0, revenuNet - PASS) * 0.07;
        const allocFam    = revenuNet * 0.035;
        const csg         = revenuNet * 0.092;
        const crds        = revenuNet * 0.005;
        return Math.round(malVieBase + malVieSup + allocFam + csg + crds);
    }
    
    // Calcul des cotisations TNS sur bénéfice (formule fermée plus précise) - conservé pour compatibilité
    static cotisationsTNSSurBenefice(beneficeBrut) {
        return this.cotiTNS(beneficeBrut);
    }
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(div, capitalSocial) {
        const base = Math.max(0, div - 0.10 * capitalSocial);
        return this.cotiTNS(base);          // taux plein, sans abattement
    }
    
    // Calcul des charges assimilé salarié détaillées avec allègement Fillon
    static chargesAssimileSalarie(brut) {
        const PASS = 47_100;
        const retraiteBasePat = Math.min(brut, PASS) * 0.08;
        const retraiteBaseSal = Math.min(brut, PASS) * 0.068;
        // ajustez / complétez avec retraite compl., chômage, maladie, etc.
        const csgCRDS         = brut * 0.098;
        const fillon          = brut < 1.6*PASS ? - brut * 0.281 * ( (1.6*PASS - brut) / (1.6*PASS - 1.0*PASS) ) : 0;
        const patTot = Math.max(0, brut*0.28 + retraiteBasePat + fillon);
        const salTot = Math.round(retraiteBaseSal + csgCRDS + brut*0.02); // autres lignes
        return { patronales: Math.round(patTot), salariales: salTot };
    }
    
    // Calcul des charges salariales (conservé pour compatibilité)
    static calculChargesSalariales(remuneration) {
        return this.chargesAssimileSalarie(remuneration);
    }
    
    // Coefficient ACRE selon l'année de début d'activité
    static coefACRE(anneeDebut) {
        const diff = new Date().getFullYear() - anneeDebut;
        return diff === 0 ? 0.25 : diff === 1 ? 0.5 : diff === 2 ? 0.75 : 1;
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches et conditions d'éligibilité au taux réduit
    static calculIS(bn, {ca=0, capitalEstLibere=true, detentionPersPhysiques75=true}={}) {
        const seuil15 = 42_750, seuil3_3 = 763_000;
        const part15  = Math.min(bn, seuil15);
        const part25  = Math.max(0, bn - seuil15);
        const taux15ok = ca < 10_000_000 && capitalEstLibere && detentionPersPhysiques75;
        const isBrut  = part15*(taux15ok?0.15:0.25) + part25*0.25;
        // contribution sociale
        const css = (bn > seuil3_3 && ca >= 7_630_000) ? Math.round(isBrut * 0.033) : 0;
        return Math.round(isBrut + css);
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