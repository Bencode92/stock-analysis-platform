// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.0 - Mai 2025

/**
 * Utilitaires de calculs fiscaux et sociaux pour la simulation des différents statuts
 * Ces fonctions factorielles permettent d'harmoniser les calculs à travers tous les statuts
 */
class FiscalUtils {
    
    /**
     * Barèmes de l'impôt sur le revenu 2025
     * @returns {Array} Tableau des tranches d'imposition
     */
    static getBaremeIR2025() {
        return [
            { limite: 11294, taux: 0 },
            { limite: 28797, taux: 11 },
            { limite: 82341, taux: 30 },
            { limite: 177106, taux: 41 },
            { limite: Infinity, taux: 45 }
        ];
    }
    
    /**
     * Calcule l'impôt sur le revenu en appliquant les tranches progressives
     * @param {number} revenuImposable - Revenu imposable
     * @param {number} tmi - Taux marginal d'imposition (pour mode simplifié)
     * @param {boolean} modeExpert - Utiliser les tranches progressives si true
     * @returns {number} Montant de l'impôt arrondi
     */
    static calculIR(revenuImposable, tmi = 30, modeExpert = false) {
        if (!modeExpert) {
            // Mode simple: application directe du TMI
            return Math.round(revenuImposable * (tmi / 100));
        }
        
        // Mode expert: calcul par tranches progressives
        const bareme = this.getBaremeIR2025();
        let impot = 0;
        let revenuRestant = revenuImposable;
        let tranchePrecedente = 0;
        
        for (const tranche of bareme) {
            const assiette = Math.min(revenuRestant, tranche.limite - tranchePrecedente);
            impot += assiette * (tranche.taux / 100);
            revenuRestant -= assiette;
            tranchePrecedente = tranche.limite;
            
            if (revenuRestant <= 0) break;
        }
        
        return Math.round(impot);
    }
    
    /**
     * Calcule l'impôt sur les sociétés
     * @param {number} resultat - Résultat fiscal
     * @returns {Object} Montant de l'IS et taux appliqué
     */
    static calculIS(resultat) {
        const limiteReduit = 42500;
        const tauxReduit = 0.15;
        const tauxNormal = 0.25;
        
        if (resultat <= limiteReduit) {
            return {
                montant: Math.round(resultat * tauxReduit),
                taux: tauxReduit * 100,
                detail: `${resultat}€ × ${tauxReduit * 100}%`
            };
        } else {
            const isReduit = Math.round(limiteReduit * tauxReduit);
            const isNormal = Math.round((resultat - limiteReduit) * tauxNormal);
            return {
                montant: isReduit + isNormal,
                taux: ((isReduit + isNormal) / resultat) * 100,
                detail: `${limiteReduit}€ × ${tauxReduit * 100}% + ${(resultat - limiteReduit)}€ × ${tauxNormal * 100}%`
            };
        }
    }
    
    /**
     * Calcule le prélèvement forfaitaire unique (flat tax) sur les dividendes
     * @param {number} dividendes - Montant des dividendes
     * @returns {Object} Détail des prélèvements
     */
    static calculPFU(dividendes) {
        const tauxPS = 0.172; // Prélèvements sociaux
        const tauxIR = 0.128; // Partie IR du PFU
        const tauxTotal = 0.30; // PFU complet
        
        const ps = Math.round(dividendes * tauxPS);
        const ir = Math.round(dividendes * tauxIR);
        
        return {
            ps: ps,
            ir: ir,
            total: ps + ir,
            net: dividendes - ps - ir
        };
    }
    
    /**
     * Calcule les cotisations sociales TNS (travailleur non salarié)
     * @param {number} revenu - Assiette des cotisations
     * @returns {number} Montant des cotisations
     */
    static calculCotisationsTNS(revenu) {
        // Taux simplifié pour 2025
        const tauxCotisations = 0.45;
        return Math.round(revenu * tauxCotisations);
    }
    
    /**
     * Calcule les charges sociales pour assimilé salarié
     * @param {number} remuneration - Rémunération brute
     * @returns {Object} Détail des charges patronales et salariales
     */
    static calculChargesAssimileSalarie(remuneration) {
        const tauxPatronales = 0.55;
        const tauxSalariales = 0.22;
        
        const chargesPatronales = Math.round(remuneration * tauxPatronales);
        const chargesSalariales = Math.round(remuneration * tauxSalariales);
        
        return {
            patronales: chargesPatronales,
            salariales: chargesSalariales,
            total: chargesPatronales + chargesSalariales,
            tauxEffectif: ((chargesPatronales + chargesSalariales) / remuneration) * 100
        };
    }
    
    /**
     * Trouve le ratio optimal de rémunération/dividendes pour minimiser la charge fiscale
     * @param {Object} params - Paramètres de simulation
     * @param {Function} simuler - Fonction de simulation à utiliser
     * @returns {Object} Résultat avec ratio optimal
     */
    static optimiserRatioRemuneration(params, simuler) {
        // Tester différents ratios entre 0.1 et 1.0 par pas de 0.05
        let meilleurRatio = 0.7; // Valeur par défaut
        let meilleurNet = 0;
        let meilleurResultat = null;
        
        for (let ratio = 0.1; ratio <= 1.0; ratio += 0.05) {
            const paramsTest = {...params, tauxRemuneration: ratio};
            const resultat = simuler(paramsTest);
            
            if (resultat.compatible && resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
                meilleurResultat = resultat;
            }
        }
        
        return {
            ratio: meilleurRatio,
            net: meilleurNet,
            resultat: meilleurResultat
        };
    }
    
    /**
     * Calcule les prélèvements sociaux sur revenus du capital
     * @param {number} revenu - Montant du revenu
     * @returns {number} Montant des prélèvements sociaux
     */
    static calculPrelevementsSociaux(revenu) {
        const taux = 0.172; // 17.2% en 2025
        return Math.round(revenu * taux);
    }
}

// Exposer la classe au niveau global
window.FiscalUtils = FiscalUtils;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module FiscalUtils chargé et disponible globalement");
    // Déclencher un événement pour signaler que les utilitaires fiscaux sont prêts
    document.dispatchEvent(new CustomEvent('fiscalUtilsReady'));
});