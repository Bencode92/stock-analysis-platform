// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.8 - Correction du calcul progressif de l'IS

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
    
    // NOUVEAU: Détermine la tranche marginale d'imposition (barème 2025)
    static getTMI(revenuImposable) {
        const BAREME = [
            { max: 11497,  taux: 0  },
            { max: 26037,  taux: 11 },
            { max: 74545,  taux: 30 },
            { max: 160336, taux: 41 },
            { max: Infinity, taux: 45 }
        ];
        for (const tr of BAREME) {
            if (revenuImposable <= tr.max) return tr.taux;
        }
        return 45;      // Sécurité
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
    
    // Calcul des cotisations TNS : approximation 30 % du BRUT
    static calculCotisationsTNS(rem) {
        if (rem <= 0) return 0;          // garde-fou
        return Math.round(rem * 0.30);   // ≈ 45 % du NET
    }
    
    // Calcul des cotisations TNS sur bénéfice brut - CORRECTION: formule simplifiée
    static cotisationsTNSSurBenefice(beneficeBrut) {
        // Garde-fou: pas de cotisations négatives
        if (beneficeBrut <= 0) return 0;
        
        // TNS ≈ 30 % du bénéfice brut (≈ 45 % du net)
        const tauxGlobal = 0.30;
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
    
    // MODIFIÉ: Choix optimal entre PFU et barème progressif pour dividendes
    static choisirFiscaliteDividendes(dividendes, tmi = null, revenuImposable = 0) {
        // Garde-fou
        if (dividendes <= 0) return { 
            methode: 'PFU', 
            impotIR: 0, 
            prevSoc: 0, 
            total: 0,
            economie: 0
        };
        
        // Si aucun TMI fourni, on le déduit du revenu imposable global
        if (tmi === null || isNaN(tmi)) {
            tmi = FiscalUtils.getTMI(revenuImposable);
        }
        
        // Calcul PFU : 12,8% IR + 17,2% PS = 30%
        const impotPFU = Math.round(dividendes * 0.128);
        const prevSocPFU = Math.round(dividendes * 0.172);
        const totalPFU = impotPFU + prevSocPFU;
        
        // Calcul barème progressif : abattement 40% puis IR au TMI + 17,2% PS
        const baseIR = dividendes * 0.60; // Après abattement de 40%
        const impotProgressif = Math.round(baseIR * (tmi / 100));
        const prevSocProg = Math.round(dividendes * 0.172);
        const totalProgressif = impotProgressif + prevSocProg;
        
        // Retourner la méthode la plus avantageuse
        if (totalPFU <= totalProgressif) {
            return {
                methode: 'PFU',
                impotIR: impotPFU,
                prevSoc: prevSocPFU,
                total: totalPFU,
                economie: totalProgressif - totalPFU,
                details: {
                    tauxEffectif: (totalPFU / dividendes * 100).toFixed(1),
                    baseImposable: dividendes
                }
            };
        } else {
            return {
                methode: 'PROGRESSIF',
                impotIR: impotProgressif,
                prevSoc: prevSocProg,
                total: totalProgressif,
                economie: totalPFU - totalProgressif,
                abattement: Math.round(dividendes * 0.40),
                details: {
                    tauxEffectif: (totalProgressif / dividendes * 100).toFixed(1),
                    baseImposable: baseIR,
                    tmiApplique: tmi
                }
            };
        }
    }
    
    // CORRECTION: Calcul IS progressif selon le barème 2025
    static calculIS(resultat, params = {}) {
        // FIX CRITIQUE: Pas d'IS négatif si déficit
        if (resultat <= 0) return 0;
        
        const seuil = 42500;
        
        // Vérifier les conditions pour le taux réduit
        const conditionsTauxReduit = (params.ca ?? Infinity) < 10000000
            && (params.capitalEstLibere ?? true)
            && (params.detentionPersPhysiques75 ?? true);
        
        if (!conditionsTauxReduit) {
            // Si les conditions ne sont pas remplies, tout à 25%
            return Math.round(resultat * 0.25);
        }
        
        // CALCUL PROGRESSIF : 15% jusqu'à 42 500€, puis 25% au-delà
        if (resultat <= seuil) {
            // Tout à 15%
            return Math.round(resultat * 0.15);
        } else {
            // 15% sur les premiers 42 500€ + 25% sur le reste
            const impotTranche1 = seuil * 0.15;              // 6 375€
            const impotTranche2 = (resultat - seuil) * 0.25;
            return Math.round(impotTranche1 + impotTranche2);
        }
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
    console.log("Module FiscalUtils chargé (v1.8 - Calcul progressif IS corrigé)");
    document.dispatchEvent(new CustomEvent('fiscalUtilsReady'));
});
