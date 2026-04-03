/**
 * ============================================
 * 🚀 SIMULATEUR DE PRÊT REFACTORISÉ - v2.3.10
 * ============================================
 * 
 * Plan d'action implémenté :
 * ✅ Étape 1 : Cash Flow centralisé (this.cashFlows)
 * ✅ Étape 2 : Calcul TAEG via IRR/Newton-Raphson  
 * ✅ Étape 3 : Intégration PTZ comme "sous-prêt"
 * ✅ Étape 4 : Validations & debug helpers
 * ✅ Étape 5 : Compatibilité UI existante
 * 🔧 v2.1 : 4 corrections critiques TAEG Newton-Raphson
 * 🔧 v2.1.1 : 3 retouches conformité Banque de France
 * 🔧 v2.1.2 : Fix TAEG -21% → multi-seeds + bissection
 * 🔧 v2.1.3 : Correction frais tenue compte affichage UI
 * 🔧 v2.1.4 : Correction incohérences mensualité et TAEG
 * 🔧 v2.1.5 : Correction coût global total - inclusion tenue de compte
 * 🚀 v2.2.0 : Amélioration renégociation avec bascule mensualité claire
 * 🔧 v2.2.1 : Fix affichage dual mensualité initiale/renégociée
 * 🆕 v2.3.0 : 4 Chantiers PTZ - Clarification remboursement total, PTZ différé, couplage inclure PTZ
 * 🆕 v2.3.1 : Ajout fonction updateMensualitePTZDisplay pour affichage dual crédit/PTZ
 * 🔧 v2.3.2 : Restauration gestionnaire remboursements anticipés manquant
 * 🔧 v2.3.3 : Fix PTZ différé - ajout conditionnel mensualité PTZ selon période
 * 🔧 v2.3.4 : Fix calcul coût total - inclusion assurance dans montantTotal
 * 🔧 v2.3.5 : Fix TAEG renégociation - Reconstruction des flux de trésorerie post-renégociation
 * 🔧 v2.3.6 : Fix TAEG explosion - Correction tenue de compte + PTZ dans mensualiteGlobale et flux reconstruction
 * 🔧 v2.3.7 : Fix TAEG critique - Capital PTZ flux initial + limite durée mensualités PTZ
 * 🔧 v2.3.8 : Fix scope issue - Exposition renderRepaymentsList et calculateLoan au scope global
 * 🔧 v2.3.9 : Fix indemnités mode "Réduire la mensualité" - stockage dans tableau + slider spécifique
 * 🔧 v2.3.10 : Fix fraisRenego=0 fallback - utilise ?? au lieu de || pour préserver 0
 * 
 * Architecture : Flux de trésorerie centralisés pour calculs financiers conformes
 */

// ==========================================
// 📄 IMPORT PDF EXPORT
// ==========================================
import { activateLoanExportButton, createLoanExportButton } from '../loan-pdf.js';
window.activateLoanExportButton = activateLoanExportButton;
window.createLoanExportButton = createLoanExportButton;

// ==========================================
// 🔧 CONSTANTES ET UTILITAIRES FINANCIERS
// ==========================================

// 🔧 CORRECTION 1: Signes cohérents pour IRR
const FLUX_ENTREE = -1;  // On REÇOIT l'argent ⇒ flux négatif pour l'IRR
const FLUX_SORTIE = 1;   // On PAYE ⇒ flux positif
const IRR_PRECISION = 1e-6;  // Précision pour calcul IRR
const IRR_MAX_ITERATIONS = 100;  // Limite itérations Newton-Raphson

/**
 * ==========================================
 * 💰 MOTEUR DE CALCUL IRR (Newton-Raphson)
 * ==========================================
 */
class IRRCalculator {
    /**
     * Calcule le taux de rendement interne via Newton-Raphson robuste
     * @param {number[]} cashFlows - Flux de trésorerie [initial, flux1, flux2, ...]
     * @param {number} initialGuess - Estimation initiale (défaut: 0.05)
     * @returns {number} IRR en décimal (ex: 0.03 pour 3%)
     */
    static calculate(cashFlows, initialGuess = 0.05) {
        if (!this.validateCashFlows(cashFlows)) {
            throw new Error('Flux de trésorerie invalides pour calcul IRR');
        }

        const tryNewton = (guess) => {
            let rate = guess;
            for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
                const { npv, npvDerivative: d } = this.calculateNPVAndDerivative(cashFlows, rate);
                if (Math.abs(npv) < IRR_PRECISION) return rate;     // convergé
                if (Math.abs(d) < IRR_PRECISION) break;             // pente trop plate
                rate -= npv / d;
                if (rate <= -0.99) break;                           // protège des dépassements
            }
            return null;                                          // échec
        };

        /* ➋ 1) on essaie Newton avec plusieurs seeds "plausibles"       */
        const seeds = [0.05, 0.02, 0.01, 0.005, 0.001];
        for (const s of seeds) {
            const r = tryNewton(s);
            if (r !== null && r > 0) return r;                     // première racine > 0 trouvée
        }

        /* ➌ 2) fallback : bissection sur [0 ; 1]                      */
        let low = 0, high = 1, npvLow = this.calculateNPVAndDerivative(cashFlows, low).npv;
        for (let i = 0; i < 50; i++) {
            const mid = (low + high) / 2;
            const npvMid = this.calculateNPVAndDerivative(cashFlows, mid).npv;
            if (Math.abs(npvMid) < IRR_PRECISION) return mid;
            (npvMid * npvLow > 0) ? (low = mid) : (high = mid);
        }
        throw new Error("IRR non trouvée dans l'intervalle 0-100 % annuel");
    }

    /**
     * Calcule NPV et sa dérivée pour Newton-Raphson
     */
    static calculateNPVAndDerivative(cashFlows, rate) {
        let npv = 0;
        let npvDerivative = 0;
        
        for (let t = 0; t < cashFlows.length; t++) {
            const denominator = Math.pow(1 + rate, t);
            npv += cashFlows[t] / denominator;
            
            if (t > 0) {
                npvDerivative -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
            }
        }
        
        return { npv, npvDerivative };
    }

    /**
     * 🔧 v2.1.1: Validation adaptée aux nouveaux signes avec commentaire clarifié
     */
    static validateCashFlows(cashFlows) {
        if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
            return false;
        }
        
        // Le flux initial doit être négatif (on **reçoit** l'argent côté emprunteur,
        // mais c'est une **sortie** de trésorerie dans la convention IRR)
        if (cashFlows[0] >= 0) {
            return false;
        }
        
        // Il doit y avoir au moins un flux positif (rentrée d'argent)
        if (cashFlows.slice(1).every(f => f <= 0)) {
            return false;
        }
        
        return true;
    }
}

/**
 * ==========================================
 * 🏠 GESTIONNAIRE PTZ (Sous-prêt) v2.3.0
 * ==========================================
 */
class PTZManager {
    constructor(params = {}) {
        this.montant = params.montant || 0;
        this.dureeMois = params.dureeMois || 0;
        this.differeMois = params.differeMois || 0; // 🆕 v2.3.0: Chantier 2
        this.enabled = params.enabled || false;
    }

    /**
     * Génère les flux de trésorerie PTZ avec différé
     * @returns {number[]} Flux PTZ sur la durée totale
     */
    generateCashFlows(dureeTotale) {
        if (!this.enabled || this.montant <= 0) {
            return Array(dureeTotale + 1).fill(0);
        }

        const flows = Array(dureeTotale + 1).fill(0);
        
        // Flux initial : entrée de capital PTZ
        flows[0] = FLUX_ENTREE * this.montant;
        
        // Mensualités PTZ (capital seulement, pas d'intérêts)
        // dureeMois = durée TOTALE du PTZ, remboursement effectif = dureeMois - differeMois
        const dureeRemboursement = this.dureeMois - this.differeMois;
        const mensualitePTZ = dureeRemboursement > 0 ? this.montant / dureeRemboursement : 0;

        // 🆕 v2.3.0: Prise en compte du différé
        for (let mois = this.differeMois + 1; mois <= Math.min(this.dureeMois, dureeTotale); mois++) {
            flows[mois] = FLUX_SORTIE * mensualitePTZ;
        }
        
        return flows;
    }

    /**
     * 🆕 v2.3.0: Calcule le capital PTZ restant à un mois donné
     */
    getCapitalRestantAt(mois) {
        if (!this.enabled || this.montant <= 0) return 0;
        
        const dureeRemboursement = this.dureeMois - this.differeMois;
        const mensualitePTZ = dureeRemboursement > 0 ? this.montant / dureeRemboursement : 0;
        const moisEffectifsPayes = Math.max(0, mois - this.differeMois);
        const capitalRembourse = Math.min(mensualitePTZ * moisEffectifsPayes, this.montant);
        
        return Math.max(0, this.montant - capitalRembourse);
    }

    /**
     * Valide les paramètres PTZ avec différé
     */
    validate(montantTotal, dureePretPrincipal) {
        const errors = [];
        
        if (this.montant > montantTotal * 0.5) {
            errors.push(`PTZ ne peut dépasser 50% du coût total (max: ${this.formatMontant(montantTotal * 0.5)})`);
        }
        
        if (this.dureeMois > dureePretPrincipal) {
            errors.push(`Durée PTZ ne peut dépasser celle du prêt principal (${Math.floor(dureePretPrincipal/12)} ans)`);
        }

        // 🆕 v2.3.0: Validation du différé
        const diffMax = this.dureeMois - 12;
        if (this.differeMois > diffMax) {
            this.differeMois = diffMax;
            console.warn(`Différé PTZ réduit à ${diffMax} mois`);
        }
        
        if (this.differeMois > dureePretPrincipal) {
            this.differeMois = dureePretPrincipal;
            console.warn(`Différé PTZ ne peut dépasser la durée du prêt principal`);
        }
        
        return errors;
    }

    formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
    }
}

/**
 * ==========================================
 * 🏦 SIMULATEUR DE PRÊT PRINCIPAL - v2.3.10
 * ==========================================
 */
class LoanSimulator {
    constructor(params) {
        // Paramètres de base
        this.capital = params.capital;
        this.tauxAnnuel = params.tauxAnnuel;
        this.tauxMensuel = params.tauxAnnuel / 100 / 12;
        this.dureeMois = params.dureeMois;
        this.assuranceMensuelle = (params.assuranceAnnuelle || 0) / 100 / 12;
        this.indemnitesMois = params.indemnitesMois || 12;
        this.assuranceSurCapitalInitial = params.assuranceSurCapitalInitial || false;

        // 🆕 v2.1.3: Séparation frais fixes / récurrents
        this.fraisDossier = params.fraisDossier || 2000;                    // fixes
        this.fraisGarantie = this.calculateFraisGarantie(params);           // fixes
        this.fraisTenueCompteFix = params.fraisTenueCompte || 710;          // fixe, MAIS étalé
        this.fraisTenueMensuel = this.fraisTenueCompteFix / this.dureeMois; // ↖️

        // 🚀 NOUVEAU : Flux de trésorerie centralisés
        this.cashFlows = [];
        this.tableauAmortissementCache = null;
        
        // Gestionnaire PTZ
        this.ptzManager = new PTZManager();
        
        // Debug mode
        this.debugMode = false;
    }

    /**
     * ==========================================
     * 🔧 MÉTHODES DE CALCUL CORE
     * ==========================================
     */

    calculerMensualite() {
        const { capital, tauxMensuel, dureeMois } = this;
        if (tauxMensuel === 0) return capital / dureeMois;
        return capital * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));
    }

    calculateFraisGarantie(params) {
        if (params.fraisGarantie !== null && params.fraisGarantie !== undefined) {
            return params.fraisGarantie;
        }

        const { capital } = this;
        const typeGarantie = params.typeGarantie || 'caution';

        switch(typeGarantie) {
            case 'hypotheque':
                return Math.max(capital * 0.015, 800);
            case 'ppd':
                return Math.max(capital * 0.01, 500);
            case 'caution':
            default:
                return capital * 0.013709; // Crédit Logement
        }
    }

    /**
     * ==========================================
     * 💰 GÉNÉRATION DES FLUX DE TRÉSORERIE v2.3.10
     * ==========================================
     */
    
    generateBaseCashFlows() {
        const mensualite = this.calculerMensualite();

        const flows = Array(this.dureeMois + 1).fill(0);
        
        // 🆕 v2.1.3: Flux initial avec seulement frais fixes (pas la tenue de compte)
        const fraisInitiauxFixes = this.fraisDossier + this.fraisGarantie;
        // 🟢 on NE met PAS fraisTenueCompteFix ici : il est déjà ventilé mensuellement
        flows[0] = FLUX_ENTREE * (this.capital - fraisInitiauxFixes);
        
        // Flux mensuels : mensualité + assurance + tenue de compte (déjà incluse v2.1.1)
        for (let mois = 1; mois <= this.dureeMois; mois++) {
            const capitalRestant = this.getCapitalRestantAt(mois - 1);
            const assurance = this.assuranceSurCapitalInitial ? 
                this.capital * this.assuranceMensuelle : 
                capitalRestant * this.assuranceMensuelle;
            
            flows[mois] = FLUX_SORTIE * (mensualite + assurance + this.fraisTenueMensuel);
        }
        
        return flows;
    }

    /**
     * 🔧 v2.1.1: getCapitalRestantAt recalcule la mensualité avec le taux courant
     */
    getCapitalRestantAt(mois, tauxMensuelCourant = null) {
        const taux = tauxMensuelCourant ?? this.tauxMensuel;

        // ➜ mensualité re-calculée avec le taux passé
        const mensualiteCourante = taux === 0
            ? this.capital / this.dureeMois
            : this.capital * taux / (1 - Math.pow(1 + taux, -this.dureeMois));

        let capitalRestant = this.capital;

        for (let m = 1; m <= mois && capitalRestant > 0; m++) {
            const interets = capitalRestant * taux;
            const capitalAmorti = Math.min(mensualiteCourante - interets, capitalRestant);
            capitalRestant -= capitalAmorti;
        }
        return Math.max(0, capitalRestant);
    }

    /**
     * ==========================================
     * 📊 TABLEAU D'AMORTISSEMENT v2.3.10
     * ==========================================
     */

    tableauAmortissement(options = {}) {
        const {
            remboursementAnticipe = 0,
            moisAnticipe = null,
            nouveauTaux = null,
            moisRenegociation = null,
            modeRemboursement = 'duree',
            moisAReduire = 0,
            remboursementsAnticipes = [],
            appliquerRenegociation = true,
            ptzParams = null
        } = options;

        // Configuration PTZ si fournie
        if (ptzParams) {
            this.ptzManager = new PTZManager(ptzParams);
        }

        // Gestion rétrocompatibilité
        let remboursements = [...remboursementsAnticipes];
        if (remboursementAnticipe > 0 && moisAnticipe !== null) {
            const existant = remboursements.find(r => r.mois === moisAnticipe);
            if (!existant) {
                remboursements.push({
                    montant: remboursementAnticipe,
                    mois: moisAnticipe,
                    nouveauTaux: nouveauTaux
                });
            }
        }

        // Génération des flux de trésorerie INITIAUX
        this.cashFlows = this.generateBaseCashFlows();
        
        // Ajout des flux PTZ si activé
        if (this.ptzManager.enabled) {
            const ptzFlows = this.ptzManager.generateCashFlows(this.dureeMois);
            for (let i = 0; i < this.cashFlows.length; i++) {
                this.cashFlows[i] += ptzFlows[i];
            }
        }

        // Génération du tableau détaillé avec renégociation
        const tableauResult = this.generateDetailedTable(remboursements, {
            nouveauTaux,
            moisRenegociation,
            modeRemboursement,
            appliquerRenegociation
        });

        // ✨ CORRECTION CRITIQUE v2.3.7: Reconstruction des flux de trésorerie post-renégociation avec capital PTZ
        if (appliquerRenegociation && moisRenegociation && nouveauTaux !== null) {
            console.log('🔄 v2.3.10: Reconstruction des flux de trésorerie avec renégociation + capital PTZ...');
            
            // 🔧 CORRECTIF 1: Inclure le capital PTZ dans le flux initial reconstruction
            const fraisInitiauxFixes = this.fraisDossier + this.fraisGarantie;
            const ptzCap = this.ptzManager.enabled ? this.ptzManager.montant : 0;
            this.cashFlows = [FLUX_ENTREE * (this.capital + ptzCap - fraisInitiauxFixes)];
            
            // 🔧 v2.3.10: Reconstruire flux mensuels avec PTZ intégré via ajoutePTZ corrigé
            tableauResult.tableau.forEach(row => {
                // mensualiteGlobale inclut maintenant : crédit + assurance + tenue de compte (v2.3.6)
                const fluxAvecPTZ = ajoutePTZ(row.mensualiteGlobale, row.mois, this.ptzManager);
                this.cashFlows.push(FLUX_SORTIE * fluxAvecPTZ);
            });
            
            console.log(`📊 v2.3.10: Flux reconstruits: ${this.cashFlows.length} périodes avec renégociation + PTZ + capital PTZ inclus`);
        }

        // 🆕 v2.2.1: Calcul scénario de base pour économie d'intérêts exacte
        let baseInterets = 0;
        let mensualiteAvantRenego = null;
        let mensualiteApresRenego = null;
        
        if (options.appliquerRenegociation && options.moisRenegociation) {
            // Rejouer le même prêt sans renégociation
            const baseTable = this.generateDetailedTable(remboursements, {
                ...options,
                appliquerRenegociation: false
            });
            baseInterets = baseTable.tableau.reduce((s, r) => s + r.interets, 0);
            
            // Récupérer les mensualités avant/après renégociation
            mensualiteAvantRenego = tableauResult.mensualiteAvantRenego;
            mensualiteApresRenego = tableauResult.mensualiteApresRenego;
        }

        // Calculs financiers avec données d'économie exacte
        const results = this.calculateFinancialMetrics(tableauResult.tableau, {
            baseInterets,
            mensualiteAvantRenego,
            mensualiteApresRenego
        });
        
        // Calcul TAEG via IRR v2.3.10
        try {
            const taegPrecis = this.calculateTAEG();
            results.taeg = taegPrecis * 100; // Conversion en pourcentage
            console.log(`💎 v2.3.10: TAEG corrigé: ${results.taeg.toFixed(2)}% (fraisRenego=0 fix)`);
        } catch (error) {
            console.warn('TAEG non calculable via IRR:', error.message);
            results.taeg = this.tauxAnnuel * 1.1; // Fallback approximatif
        }

        // Debug si activé
        if (this.debugMode) {
            this.debugCashFlows();
            this.validateResults(results);
        }

        // Cache des résultats
        this.tableauAmortissementCache = { tableau: tableauResult.tableau, ...results };

        return {
            tableau: tableauResult.tableau,
            ...results,
            remboursementsAnticipes: remboursements,
            moisRenegociation,
            appliquerRenegociation,
            dernierRemboursement: this.getDernierRemboursement(remboursements)
        };
    }

    generateDetailedTable(remboursements, options) {
        let mensualite = this.calculerMensualite();
        let capitalRestant = this.capital;
        let tableau = [];
        let tauxMensuel = this.tauxMensuel;
        let totalInterets = 0;
        let totalAssurance = 0;
        let totalCapitalAmorti = 0;
        let capitalInitial = this.capital;
        let indemnites = 0;
        let dureeFinale = this.dureeMois;

        // 🆕 v2.2.1: Variables pour capturer les mensualités avant/après renégociation
        let mensualiteAvantRenego = null;
        let mensualiteApresRenego = null;

        for (let mois = 1; mois <= dureeFinale; mois++) {
            // 🆕 v2.3.9: FIX CRITIQUE - Variable pour stocker les indemnités de la ligne
            let indemnitesPourLaLigne = 0;

            // 🆕 v2.2.1: Capturer mensualité avant renégociation
            if (mois === options.moisRenegociation - 1 && options.appliquerRenegociation) {
                const assuranceAvant = this.assuranceSurCapitalInitial ? 
                    capitalInitial * this.assuranceMensuelle : 
                    capitalRestant * this.assuranceMensuelle;
                mensualiteAvantRenego = mensualite + assuranceAvant;
            }

            // Renégociation de taux
            if (options.appliquerRenegociation && 
                options.moisRenegociation === mois && 
                options.nouveauTaux !== null) {
                tauxMensuel = options.nouveauTaux / 100 / 12;
                mensualite = capitalRestant * tauxMensuel / 
                    (1 - Math.pow(1 + tauxMensuel, -(dureeFinale - mois + 1)));
            }

            let interets = capitalRestant * tauxMensuel;
            let assurance = this.assuranceSurCapitalInitial ? 
                capitalInitial * this.assuranceMensuelle : 
                capitalRestant * this.assuranceMensuelle;
            let capitalAmorti = mensualite - interets;

            // 🆕 v2.2.1: Capturer mensualité après renégociation
            if (mois === options.moisRenegociation && options.appliquerRenegociation) {
                mensualiteApresRenego = mensualite + assurance;
            }

            // Gestion remboursements anticipés
            const remboursementCourant = remboursements.find(r => r.mois === mois);
            
            if (remboursementCourant) {
                const { montant, moisAReduire: reduction } = remboursementCourant;
                
                if (montant === 0 && reduction > 0 && options.modeRemboursement === 'duree') {
                    // Mode réduction de durée
                    const resteAvant = dureeFinale - mois + 1;
                    const resteApres = Math.max(1, resteAvant - reduction);
                    dureeFinale -= reduction;
                    
                    mensualite = capitalRestant * tauxMensuel / 
                        (1 - Math.pow(1 + tauxMensuel, -resteApres));
                    capitalAmorti = 0;
                } else if (montant > 0) {
                    // Remboursement partiel/total
                    const indemniteStandard = montant * tauxMensuel * this.indemnitesMois;
                    const plafond3Pourcent = montant * 0.03;
                    const plafond6Mois = mensualite * 6;
                    const indemnitesCourantes = Math.min(indemniteStandard, 
                        Math.min(plafond3Pourcent, plafond6Mois));
                    indemnites += indemnitesCourantes;

                    // 🆕 v2.3.9: FIX CRITIQUE - Stocker les indemnités pour cette ligne
                    indemnitesPourLaLigne = indemnitesCourantes;

                    if (capitalRestant <= montant) {
                        // Remboursement total
                        const mensualiteGlobale = capitalRestant + interets + assurance + this.fraisTenueMensuel;
                        
                        tableau.push({
                            mois,
                            interets,
                            capitalAmorti: capitalRestant,
                            assurance,
                            mensualite: capitalRestant + interets, // crédit seul
                            mensualiteGlobale, // 🔧 v2.3.6: crédit + assurance + tenue de compte
                            capitalRestant: 0,
                            remboursementAnticipe: capitalRestant,
                            indemnites: indemnitesPourLaLigne // 🆕 v2.3.9: Utilise la variable
                        });

                        totalInterets += interets;
                        totalAssurance += assurance;
                        totalCapitalAmorti += capitalRestant;
                        break;
                    } else {
                        // Remboursement partiel
                        capitalRestant -= montant;
                        
                        if (options.modeRemboursement === 'mensualite') {
                            mensualite = capitalRestant * tauxMensuel / 
                                (1 - Math.pow(1 + tauxMensuel, -(this.dureeMois - mois + 1)));
                        }
                    }
                }
            }

            capitalRestant -= capitalAmorti;
            if (capitalRestant < 0) capitalRestant = 0;

            totalInterets += interets;
            totalAssurance += assurance;
            totalCapitalAmorti += capitalAmorti;

            // 🔧 v2.3.6: FIX CRITIQUE - mensualiteGlobale inclut maintenant la tenue de compte
            const mensualiteGlobale = mensualite + assurance + this.fraisTenueMensuel;

            tableau.push({
                mois,
                interets,
                capitalAmorti,
                assurance,
                mensualite, // crédit seul (SANS assurance)
                mensualiteGlobale, // 🔧 v2.3.6: crédit + assurance + tenue de compte
                capitalRestant,
                remboursementAnticipe: remboursementCourant?.montant || 0,
                indemnites: indemnitesPourLaLigne // 🆕 v2.3.9: FIX - Utilise la variable au lieu de 0
            });

            if (capitalRestant <= 0) break;
        }

        return {
            tableau,
            mensualiteAvantRenego,
            mensualiteApresRenego
        };
    }

    /**
     * ==========================================
     * 💎 CALCUL TAEG PRÉCIS VIA IRR v2.3.10
     * ==========================================
     */

    calculateTAEG() {
        if (!this.cashFlows || this.cashFlows.length < 2) {
            throw new Error('Flux de trésorerie non générés');
        }

        // Conversion des flux mensuels en taux annuel
        const irrMensuel = IRRCalculator.calculate(this.cashFlows);
        const taegAnnuel = Math.pow(1 + irrMensuel, 12) - 1;
        
        return taegAnnuel;
    }

    /**
     * 🔧 v2.3.10: Calcul financier avec capital PTZ corrigé
     */
    calculateFinancialMetrics(tableau, extra = {}) {
        const mensualiteInitiale = this.calculerMensualite();
        const dureeInitiale = this.dureeMois;
        const dureeReelle = tableau.length;
        
        const totalInterets = tableau.reduce((sum, row) => sum + row.interets, 0);
        const totalAssurance = tableau.reduce((sum, row) => sum + row.assurance, 0);
        const totalCapitalAmorti = tableau.reduce((sum, row) => sum + row.capitalAmorti, 0);
        const indemnites = tableau.reduce((sum, row) => sum + (row.indemnites || 0), 0);
        
        // 🔧 v2.3.6: CORRECTION CRITIQUE - mensualiteGlobale inclut maintenant la tenue de compte
        const montantTotal = tableau.reduce((sum, row) => sum + row.mensualiteGlobale, 0);
        
        // 🆕 v2.1.3: Séparation des frais pour affichage correct
        const totalTenueCompte = this.fraisTenueCompteFix;   // somme des 2,36 € x 300
        const totalFraisFixes = this.fraisDossier + this.fraisGarantie;
        const totalFraisAffiches = totalFraisFixes + totalTenueCompte; // ✅ 4 355 €
        
        // 🔧 v2.3.6: CORRECTION - montantTotal inclut désormais la tenue de compte, évite double comptabilisation
        const coutGlobalTotal = montantTotal            // toutes les mensualités (crédit + assurance + tenue mensuelle déjà dedans)
                             + indemnites              // pénalités éventuelles
                             + totalFraisFixes;        // dossier + garantie (tenue déjà dans montantTotal)
        
        // 🔧 CORRECTION 4: Calcul assurance corrigé pour economiesMensualites
        const assuranceInitiale = this.assuranceSurCapitalInitial 
            ? this.capital * this.assuranceMensuelle
            : (this.capital - mensualiteInitiale + this.capital * this.tauxMensuel) * this.assuranceMensuelle;
        
        const mensualiteInitialeTotale = mensualiteInitiale + assuranceInitiale;
        
        const economiesMensualites = (dureeInitiale - dureeReelle) * mensualiteInitialeTotale;
        const economiesInterets = (this.capital * this.tauxMensuel * dureeInitiale) - totalInterets;

        // 🆕 v2.1.4: Exposition de l'assurance du 1er mois
        const assuranceInitialeTableau = tableau[0]?.assurance || assuranceInitiale;

        return {
            mensualiteInitiale,
            assuranceInitiale: assuranceInitialeTableau, // ← NEW (on la renvoie)
            indemnites,
            totalInterets,
            totalAssurance,
            totalCapitalAmorti,
            capitalInitial: this.capital,
            totalPaye: montantTotal + indemnites,
            dureeReelle,
            dureeInitiale,
            economiesMensualites,
            economiesInterets,
            totalFraisFixes,          // pour le détail "frais dossier + garantie"
            totalTenueCompte,         // pour l'info bulles
            totalFraisAffiches,       // affiche "Frais annexes" = 4 355 €
            coutGlobalTotal,          // 🔧 v2.3.6: maintenant avec tenue de compte incluse correctement
            pretSoldeAvantTerme: dureeReelle < dureeInitiale,
            gainTemps: dureeInitiale - dureeReelle,
            // 🆕 v2.2.1: Nouvelles propriétés pour renégociation
            mensualiteAvantRenego: extra.mensualiteAvantRenego,
            mensualiteApresRenego: extra.mensualiteApresRenego,
            economieMensualiteRenego: extra.mensualiteAvantRenego && extra.mensualiteApresRenego ? 
                extra.mensualiteAvantRenego - extra.mensualiteApresRenego : 0,
            economieInteretsExact: extra.baseInterets ? extra.baseInterets - totalInterets : 0,
            assuranceMensuelle: this.assuranceMensuelle
        };
    }

    /**
     * ==========================================
     * 🔍 DEBUG & VALIDATION v2.3.10
     * ==========================================
     */

    debugCashFlows() {
        console.group('💰 Analyse des flux de trésorerie (v2.3.10)');
        console.table(this.cashFlows.map((flux, index) => ({
            periode: index === 0 ? 'Initial' : `Mois ${index}`,
            flux: this.formatMontant(flux),
            type: index === 0 ? 'Capital net reçu (-)' : 
                  flux > 0 ? 'Sortie mensualité (+)' : 'Entrée',
            cumul: this.formatMontant(this.cashFlows.slice(0, index + 1)
                .reduce((sum, f) => sum + f, 0))
        })));
        console.groupEnd();
    }

    validateResults(results) {
        const taegCalcule = results.taeg;
        const taegAttendu = this.tauxAnnuel * 1.1;
        
        if (Math.abs(taegCalcule - taegAttendu) > 0.5) {
            console.warn(`⚠️ TAEG suspect: ${taegCalcule.toFixed(2)}% vs ${taegAttendu.toFixed(2)}% attendu`);
        }

        if (results.totalCapitalAmorti < this.capital * 0.95) {
            console.warn(`⚠️ Capital amorti insuffisant: ${this.formatMontant(results.totalCapitalAmorti)} vs ${this.formatMontant(this.capital)} initial`);
        }

        console.log('✅ Validation terminée (v2.3.10 - fraisRenego=0 fix)');
    }

    /**
     * ==========================================
     * 🔄 COMPATIBILITÉ UI EXISTANTE
     * ==========================================
     */

    // Getters pour maintenir la compatibilité
    get totalInterest() {
        return this.tableauAmortissementCache?.totalInterets || 0;
    }

    get totalCost() {
        return this.tableauAmortissementCache?.coutGlobalTotal || 0;
    }

    get monthlyPayment() {
        return this.tableauAmortissementCache?.mensualiteInitiale || this.calculerMensualite();
    }

    getDernierRemboursement(remboursements) {
        if (!remboursements?.length) return 0;
        return Math.max(...remboursements.map(r => r.mois));
    }

    formatMontant(montant, decimales = 0) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        }).format(montant);
    }

    /**
     * ==========================================
     * 📈 MÉTHODES POUR GRAPHIQUES
     * ==========================================
     */

    getComparisonChartData() {
        // Adapter les données pour Chart.js existant
        if (!this.tableauAmortissementCache) return null;
        
        const { tableau } = this.tableauAmortissementCache;
        
        return {
            labels: tableau.map((_, i) => `Mois ${i + 1}`),
            datasets: [{
                label: 'Capital restant',
                data: tableau.map(row => row.capitalRestant),
                borderColor: 'rgba(52, 211, 153, 1)',
                backgroundColor: 'rgba(52, 211, 153, 0.1)',
                fill: true
            }]
        };
    }

    getAmortissementData() {
        if (!this.tableauAmortissementCache) return null;
        
        const { tableau } = this.tableauAmortissementCache;
        
        return {
            labels: tableau.map(row => `Mois ${row.mois}`),
            datasets: [
                {
                    label: 'Capital amorti',
                    data: tableau.map(row => row.capitalAmorti),
                    borderColor: 'rgba(34, 197, 94, 1)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)'
                },
                {
                    label: 'Intérêts',
                    data: tableau.map(row => row.interets),
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                }
            ]
        };
    }

    getEvolutionValeurData(appreciationAnnuelle = 2) {
        if (!this.tableauAmortissementCache) return null;
        
        const { tableau } = this.tableauAmortissementCache;
        const tauxMensuel = appreciationAnnuelle / 100 / 12;
        
        return {
            labels: tableau.map(row => `Mois ${row.mois}`),
            datasets: [{
                label: 'Valeur du bien',
                data: tableau.map((row, index) => 
                    this.capital * Math.pow(1 + tauxMensuel, index + 1)
                ),
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
            }]
        };
    }

    getCoutsPieChartData() {
        if (!this.tableauAmortissementCache) return null;
        
        const data = this.tableauAmortissementCache;
        
        return {
            classique: {
                labels: ['Capital', 'Intérêts', 'Assurance', 'Frais'],
                datasets: [{
                    data: [
                        data.capitalInitial,
                        data.totalInterets,
                        data.totalAssurance,
                        data.totalFraisAffiches  // 🆕 v2.1.3: utilise totalFraisAffiches
                    ],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(168, 85, 247, 0.8)'
                    ]
                }]
            }
        };
    }
}

/**
 * ==========================================
 * 🛠️ FONCTIONS UTILITAIRES EXISTANTES
 * ==========================================
 */

// Formater les nombres en euros
function formatMontant(montant) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
}

// Helper pour calculer le capital restant dû
function getRemainingCapitalAt(month) {
    try {
        const loanAmount = +document.getElementById('loan-amount').value;
        const rate = +document.getElementById('interest-rate-slider').value / 100 / 12;
        const duration = +document.getElementById('loan-duration-slider').value * 12;
        
        // Gestion PTZ si activé
        const ptzEnabled = document.getElementById('enable-ptz')?.checked;
        let ptzAmount = 0;
        if (ptzEnabled) {
            ptzAmount = +document.getElementById('ptz-amount').value || 0;
        }
        
        const principalLoan = loanAmount - ptzAmount;
        
        if (principalLoan <= 0 || rate <= 0 || duration <= 0) {
            return 0;
        }
        
        const monthlyPayment = principalLoan * rate / (1 - Math.pow(1 + rate, -duration));
        let remainingCapital = principalLoan;
        
        for (let m = 1; m < month && remainingCapital > 0; m++) {
            const interest = remainingCapital * rate;
            const principal = Math.min(monthlyPayment - interest, remainingCapital);
            remainingCapital -= principal;
        }
        
        return Math.max(0, remainingCapital + ptzAmount);
    } catch (error) {
        console.error("Erreur lors du calcul du capital restant:", error);
        return 0;
    }
}

// 🆕 v2.3.0: CHANTIER 1 - Fonction pour basculer l'interface de remboursement total
function toggleTotalRepaymentUI(enabled) {
    const amountInput = document.getElementById('early-repayment-amount-mensualite');
    const container = amountInput?.closest('.parameter-row');
    
    if (!amountInput) return;
    
    if (enabled) {
        amountInput.value = '';
        amountInput.disabled = true;
        amountInput.placeholder = 'Calculé automatiquement...';
        amountInput.classList.add('opacity-60', 'cursor-not-allowed');
        container?.classList.add('opacity-60', 'transition-opacity', 'duration-300');
        
        const mois = +document.getElementById('early-repayment-month-slider-mensualite').value;
        const previewAmount = getRemainingCapitalAt(mois);
        
        showNotification(`Capital restant au mois ${mois}: ${formatMontant(previewAmount)}`, 'info');
        
        // 🆕 v2.3.0: CHANTIER 1 - Afficher/masquer l'alerte PTZ
        const enablePtzCheckbox = document.getElementById('enable-ptz');
        const ptzWarning = document.getElementById('ptz-warning');
        if (ptzWarning) {
            ptzWarning.classList.toggle('hidden', !enablePtzCheckbox?.checked);
        }
        
    } else {
        amountInput.disabled = false;
        amountInput.placeholder = 'Montant à rembourser';
        amountInput.classList.remove('opacity-60', 'cursor-not-allowed', 'text-green-400', 'font-semibold');
        container?.classList.remove('opacity-60');
        
        // Masquer l'alerte PTZ quand remboursement total désactivé
        const ptzWarning = document.getElementById('ptz-warning');
        if (ptzWarning) {
            ptzWarning.classList.add('hidden');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 ${
        type === 'success' ? 'bg-green-900 text-green-200 border border-green-600' :
        type === 'error' ? 'bg-red-900 text-red-200 border border-red-600' :
        'bg-blue-900 text-blue-200 border border-blue-600'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation' : 'info'}-circle mr-2"></i>
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Helper pour formater l'affichage des remboursements
function repaymentLabel(r) {
    if (r.type === 'total') {
        return {
            html: `<i class="fas fa-flag-checkered mr-1 text-emerald-400"></i>Remboursement total`,
            cls: 'text-emerald-300 font-semibold'
        };
    }
    if (r.montant && r.montant > 0) {
        return {
            html: `<i class="fas fa-euro-sign mr-1 text-emerald-400"></i>${formatMontant(r.montant)}`,
            cls: 'text-emerald-300'
        };
    }
    return {
        html: `<i class="fas fa-clock mr-1 text-amber-400"></i>– ${r.moisAReduire} mois`,
        cls: 'text-amber-300'
    };
}

/**
 * 🔧 v2.3.10: UTILITAIRE CENTRAL PTZ DIFFÉRÉ (CORRIGÉ)
 * CORRECTIF 2: Limiter la mensualité PTZ à sa vraie durée
 * @param {number} mensu - mensualité crédit+assurance+tenue
 * @param {number} mois  - mois concerné (1, 2, …)
 * @param {Object|null} ptz - params PTZ ou null
 * @returns {number}
 */
function ajoutePTZ(mensu, mois, ptz) {
    if (!ptz?.enabled || ptz.montant <= 0) return mensu;
    const debut = ptz.differeMois + 1;     // ex. 1
    const fin = ptz.differeMois + ptz.dureeMois; // ex. 240
    return (mois >= debut && mois <= fin) 
        ? mensu + ptz.montant / (ptz.dureeMois - (ptz.differeMois || 0)) 
        : mensu;
}

/**
 * ==========================================
 * 🎮 GESTIONNAIRE D'ÉVÉNEMENTS UI v2.3.10
 * ==========================================
 */

document.addEventListener('DOMContentLoaded', function() {
    // 🔧 v2.3.2: Initialisation état global pour remboursements anticipés
    window.storedRepayments ??= [];

    // Références aux éléments HTML
    const interestRateSlider = document.getElementById('interest-rate-slider');
    const interestRateValue = document.getElementById('interest-rate-value');
    const loanDurationSlider = document.getElementById('loan-duration-slider');
    const loanDurationValue = document.getElementById('loan-duration-value');
    const insuranceRateSlider = document.getElementById('insurance-rate-slider');
    const insuranceRateValue = document.getElementById('insurance-rate-value');
    const newInterestRateSlider = document.getElementById('new-interest-rate-slider');
    const newInterestRateValue = document.getElementById('new-interest-rate-value');
    const calculateLoanButton = document.getElementById('calculate-loan-button');
    
    // Nouvelles références pour le mois de renégociation
    const renegotiationMonthSlider = document.getElementById('renegotiation-month-slider');
    const renegotiationMonthValue = document.getElementById('renegotiation-month-value');
    
    // Nouvelles références pour les sections de mode de remboursement
    const modeDureeBtn = document.getElementById('mode-duree');
    const modeMensualiteBtn = document.getElementById('mode-mensualite');
    const sectionDuree = document.getElementById('section-reduire-duree');
    const sectionMensualite = document.getElementById('section-reduire-mensualite');
    
    // Nouvelle référence pour la case "Appliquer la renégociation"
    const applyRenegotiationCheckbox = document.getElementById('apply-renegotiation');
    
    // Nouvelles références pour les sliders de chaque mode
    const earlyRepaymentMonthSliderDuree = document.getElementById('early-repayment-month-slider-duree');
    const earlyRepaymentMonthValueDuree = document.getElementById('early-repayment-month-value-duree');
    const penaltyMonthsSliderDuree = document.getElementById('penalty-months-slider-duree');
    const penaltyMonthsValueDuree = document.getElementById('penalty-months-value-duree');
    
    const earlyRepaymentMonthSliderMensualite = document.getElementById('early-repayment-month-slider-mensualite');
    const earlyRepaymentMonthValueMensualite = document.getElementById('early-repayment-month-value-mensualite');
    const penaltyMonthsSliderMensualite = document.getElementById('penalty-months-slider-mensualite');
    const penaltyMonthsValueMensualite = document.getElementById('penalty-months-value-mensualite');

    // Classes Tailwind pour gestion moderne des boutons
    const ACTIVE = ['text-green-400', 'bg-green-900', 'bg-opacity-30', 'transition-colors', 'duration-200'];
    const INACTIVE = ['text-white', 'transition-colors', 'duration-200'];

    function switchModeButton(on, off) {
        on.classList.add(...ACTIVE);
        on.classList.remove(...INACTIVE);
        on.setAttribute('aria-pressed', 'true');

        off.classList.add(...INACTIVE);
        off.classList.remove(...ACTIVE);
        off.setAttribute('aria-pressed', 'false');
    }

    // 🆕 v2.3.0: CHANTIER 2 - Gestion PTZ intégrée avec différé
    let ptzCalculationTimeout;
    const enablePtzCheckbox = document.getElementById('enable-ptz');
    const ptzFields = document.getElementById('ptz-fields');
    const ptzDurationSlider = document.getElementById('ptz-duration-slider');
    const ptzDurationValue = document.getElementById('ptz-duration-value');
    const ptzAmountInput = document.getElementById('ptz-amount');

    // 🆕 v2.3.0: CHANTIER 2 - Nouveaux éléments pour PTZ différé
    const ptzDiffereContainer = document.getElementById('ptz-differe-container');
    const ptzDiffereSlider = document.getElementById('ptz-differe-slider');
    const ptzDiffereValue = document.getElementById('ptz-differe-value');

    function debouncedCalculateLoan() {
        clearTimeout(ptzCalculationTimeout);
        ptzCalculationTimeout = setTimeout(() => {
            if (document.getElementById('monthly-payment').textContent !== '0 €') {
                calculateLoan();
            }
        }, 300);
    }

    // Toggle des champs PTZ avec animation
    if (enablePtzCheckbox && ptzFields) {
        enablePtzCheckbox.addEventListener('change', function() {
            if (this.checked) {
                ptzFields.classList.remove('hidden');
                ptzFields.style.maxHeight = '400px';
                ptzFields.style.opacity = '1';
                
                const mainLoanDuration = parseInt(loanDurationSlider.value);
                ptzDurationSlider.max = mainLoanDuration;
                if (parseInt(ptzDurationSlider.value) > mainLoanDuration) {
                    ptzDurationSlider.value = mainLoanDuration;
                    ptzDurationValue.textContent = `${mainLoanDuration} ans`;
                }

                // 🆕 v2.3.0: CHANTIER 2 - Afficher/masquer le conteneur différé PTZ
                if (ptzDiffereContainer) {
                    ptzDiffereContainer.classList.toggle('hidden', !this.checked);
                }
            } else {
                ptzFields.style.maxHeight = '0';
                ptzFields.style.opacity = '0';
                setTimeout(() => {
                    ptzFields.classList.add('hidden');
                }, 300);

                // Masquer le conteneur différé PTZ
                if (ptzDiffereContainer) {
                    ptzDiffereContainer.classList.add('hidden');
                }
            }
            
            debouncedCalculateLoan();
        });
    }

    // 🆕 v2.3.0: CHANTIER 2 - Wire du slider PTZ différé
    if (ptzDiffereSlider && ptzDiffereValue) {
        ptzDiffereSlider.addEventListener('input', function() {
            ptzDiffereValue.textContent = `${this.value} mois`;
            debouncedCalculateLoan();
        });
    }

    // Validation PTZ
    function validatePtzAmount() {
        const loanAmount = parseFloat(document.getElementById('loan-amount').value || 0);
        const ptzAmount = parseFloat(ptzAmountInput.value || 0);
        const validationMessage = document.getElementById('ptz-validation-message');
        
        if (ptzAmount > 0 && loanAmount > 0) {
            const maxPTZ = loanAmount * 0.5;
            const percentage = (ptzAmount / loanAmount * 100).toFixed(1);
            
            if (ptzAmount > maxPTZ) {
                validationMessage.textContent = `⚠️ Maximum autorisé: ${formatMontant(maxPTZ)} (50%)`;
                validationMessage.classList.remove('hidden');
                ptzAmountInput.classList.add('border-red-500');
                return false;
            } else if (ptzAmount > maxPTZ * 0.8) {
                validationMessage.textContent = `ℹ️ ${percentage}% du coût total (max 50%)`;
                validationMessage.classList.remove('hidden');
                validationMessage.classList.remove('text-red-400');
                validationMessage.classList.add('text-yellow-400');
                ptzAmountInput.classList.remove('border-red-500');
                return true;
            }
        }
        
        validationMessage.classList.add('hidden');
        ptzAmountInput.classList.remove('border-red-500');
        return true;
    }

    // Event listeners pour sliders
    if (ptzDurationSlider && ptzDurationValue) {
        ptzDurationSlider.addEventListener('input', function() {
            ptzDurationValue.textContent = `${this.value} ans`;
            
            // 🆕 v2.3.0: CHANTIER 2 - Mettre à jour le max du slider différé
            if (ptzDiffereSlider) {
                const maxDiffere = Math.max(0, this.value * 12 - 12);
                ptzDiffereSlider.max = maxDiffere;
                if (parseInt(ptzDiffereSlider.value) > maxDiffere) {
                    ptzDiffereSlider.value = maxDiffere;
                    ptzDiffereValue.textContent = `${maxDiffere} mois`;
                }
            }
            
            debouncedCalculateLoan();
        });
    }

    if (ptzAmountInput) {
        ptzAmountInput.addEventListener('input', function() {
            validatePtzAmount();
            debouncedCalculateLoan();
        });
    }

    // Gestion remboursement total
    const totalRepaymentCheckbox = document.getElementById('total-repayment');
    if (totalRepaymentCheckbox) {
        totalRepaymentCheckbox.addEventListener('change', function(e) {
            toggleTotalRepaymentUI(e.target.checked);
        });
    }

    if (earlyRepaymentMonthSliderMensualite) {
        earlyRepaymentMonthSliderMensualite.addEventListener('input', function(e) {
            if (totalRepaymentCheckbox?.checked) {
                const mois = +e.target.value;
                const amount = getRemainingCapitalAt(mois);
                showNotification(`Capital restant: ${formatMontant(amount)}`, 'info');
            }
        });
    }

    // Fonction pour mettre à jour les valeurs maximales des sliders
    function updateSliderMaxValues() {
        try {
            const loanDurationYears = parseInt(loanDurationSlider.value);
            const loanDurationMonths = loanDurationYears * 12;
            
            if (renegotiationMonthSlider) {
                renegotiationMonthSlider.max = loanDurationMonths;
                if (parseInt(renegotiationMonthSlider.value) > loanDurationMonths) {
                    renegotiationMonthSlider.value = loanDurationMonths;
                    renegotiationMonthValue.textContent = loanDurationMonths;
                }
            }
            
            if (earlyRepaymentMonthSliderDuree) {
                earlyRepaymentMonthSliderDuree.max = loanDurationMonths;
                if (parseInt(earlyRepaymentMonthSliderDuree.value) > loanDurationMonths) {
                    earlyRepaymentMonthSliderDuree.value = loanDurationMonths;
                    earlyRepaymentMonthValueDuree.textContent = loanDurationMonths;
                }
            }
            
            if (earlyRepaymentMonthSliderMensualite) {
                earlyRepaymentMonthSliderMensualite.max = loanDurationMonths;
                if (parseInt(earlyRepaymentMonthSliderMensualite.value) > loanDurationMonths) {
                    earlyRepaymentMonthSliderMensualite.value = loanDurationMonths;
                    earlyRepaymentMonthValueMensualite.textContent = loanDurationMonths;
                }
            }

            if (enablePtzCheckbox?.checked && ptzDurationSlider) {
                ptzDurationSlider.max = loanDurationYears;
                if (parseInt(ptzDurationSlider.value) > loanDurationYears) {
                    ptzDurationSlider.value = loanDurationYears;
                    ptzDurationValue.textContent = `${loanDurationYears} ans`;
                }

                // 🆕 v2.3.0: CHANTIER 2 - Mise à jour max différé PTZ
                if (ptzDiffereSlider) {
                    const maxDiffere = Math.max(0, loanDurationMonths - 12);
                    ptzDiffereSlider.max = maxDiffere;
                    if (parseInt(ptzDiffereSlider.value) > maxDiffere) {
                        ptzDiffereSlider.value = maxDiffere;
                        ptzDiffereValue.textContent = `${maxDiffere} mois`;
                    }
                }
            }
            
            console.log(`Valeurs max des sliders mises à jour : ${loanDurationMonths} mois`);
        } catch (error) {
            console.error("Erreur lors de la mise à jour des valeurs max des sliders:", error);
        }
    }

    // Event listeners pour les sliders de base
    if (interestRateSlider && interestRateValue) {
        interestRateSlider.addEventListener('input', function() {
            interestRateValue.textContent = `${this.value}%`;
        });
    }
    
    if (loanDurationSlider && loanDurationValue) {
        loanDurationSlider.addEventListener('input', function() {
            loanDurationValue.textContent = `${this.value} ans`;
            updateSliderMaxValues();
        });
    }
    
    if (insuranceRateSlider && insuranceRateValue) {
        insuranceRateSlider.addEventListener('input', function() {
            insuranceRateValue.textContent = `${this.value}%`;
        });
    }
    
    // Gestion du slider du mois de renégociation
    if (renegotiationMonthSlider && renegotiationMonthValue) {
        renegotiationMonthSlider.addEventListener('input', function() {
            renegotiationMonthValue.textContent = this.value;
        });
    }
    
    // Gestion des sliders pour mode "durée"
    if (earlyRepaymentMonthSliderDuree && earlyRepaymentMonthValueDuree) {
        earlyRepaymentMonthSliderDuree.addEventListener('input', function() {
            earlyRepaymentMonthValueDuree.textContent = this.value;
        });
    }
    
    if (penaltyMonthsSliderDuree && penaltyMonthsValueDuree) {
        penaltyMonthsSliderDuree.addEventListener('input', function() {
            penaltyMonthsValueDuree.textContent = `${this.value} mois`;
        });
    }
    
    // Gestion des sliders pour mode "mensualité"
    if (earlyRepaymentMonthSliderMensualite && earlyRepaymentMonthValueMensualite) {
        earlyRepaymentMonthSliderMensualite.addEventListener('input', function() {
            earlyRepaymentMonthValueMensualite.textContent = this.value;
        });
    }
    
    if (penaltyMonthsSliderMensualite && penaltyMonthsValueMensualite) {
        penaltyMonthsSliderMensualite.addEventListener('input', function() {
            penaltyMonthsValueMensualite.textContent = `${this.value} mois`;
        });
    }
    
    if (newInterestRateSlider && newInterestRateValue) {
        newInterestRateSlider.addEventListener('input', function() {
            newInterestRateValue.textContent = `${this.value}%`;
        });
    }
    
    // Gestion moderne des boutons de mode
    if (modeDureeBtn && modeMensualiteBtn && sectionDuree && sectionMensualite) {
        modeDureeBtn.addEventListener('click', () => {
            document.getElementById('remboursement-mode').value = 'duree';
            switchModeButton(modeDureeBtn, modeMensualiteBtn);
            sectionDuree.classList.remove('hidden');
            sectionMensualite.classList.add('hidden');
        });

        modeMensualiteBtn.addEventListener('click', () => {
            document.getElementById('remboursement-mode').value = 'mensualite';
            switchModeButton(modeMensualiteBtn, modeDureeBtn);
            sectionMensualite.classList.remove('hidden');
            sectionDuree.classList.add('hidden');
        });

        switchModeButton(modeDureeBtn, modeMensualiteBtn);
    }
    
    if (applyRenegotiationCheckbox) {
        applyRenegotiationCheckbox.addEventListener('change', function() {
            calculateLoan();
        });
    }

    /**
     * ==========================================
     * 🎯 FONCTION PRINCIPALE DE CALCUL v2.3.10
     * ==========================================
     */
    function calculateLoan() {
        try {
            console.log("🚀 Début du calcul du prêt v2.3.10 (fraisRenego=0 fix)...");
            
            const loanAmount = parseFloat(document.getElementById('loan-amount').value);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
            const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
            const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
            const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
            const renegotiationMonth = parseInt(document.getElementById('renegotiation-month-slider').value);
            const applyRenegotiation = document.getElementById('apply-renegotiation')?.checked || false;
            
            // 🆕 v2.3.0: CHANTIER 2 - Gestion PTZ avec différé
            const enablePTZ = document.getElementById('enable-ptz')?.checked || false;
            let ptzParams = null;
            let ptzValidationError = null;

            if (enablePTZ) {
                const ptzAmount = parseFloat(document.getElementById('ptz-amount')?.value || 0);
                const ptzDurationYears = parseInt(document.getElementById('ptz-duration-slider')?.value || 20);
                const ptzDiffereMois = parseInt(document.getElementById('ptz-differe-slider')?.value || 0); // NOUVEAU
                
                if (ptzAmount > 0) {
                    const maxPTZ = loanAmount * 0.5;
                    if (ptzAmount > maxPTZ) {
                        ptzValidationError = `Le PTZ ne peut dépasser 50% du coût total (maximum: ${formatMontant(maxPTZ)})`;
                    } else if (ptzDurationYears > loanDurationYears) {
                        ptzValidationError = `La durée du PTZ ne peut dépasser celle du prêt principal (${loanDurationYears} ans)`;
                    } else {
                        // 🆕 v2.3.0: CHANTIER 2 - Validation du différé
                        const diffMax = ptzDurationYears * 12 - 12;
                        const differeFinal = Math.min(ptzDiffereMois, diffMax, loanDurationYears * 12);
                        
                        if (ptzDiffereMois > diffMax) {
                            console.warn(`Différé PTZ ajusté de ${ptzDiffereMois} à ${differeFinal} mois`);
                        }

                        ptzParams = {
                            montant: ptzAmount,
                            dureeMois: ptzDurationYears * 12,
                            differeMois: differeFinal, // 🆕 v2.3.0: CHANTIER 2
                            enabled: true
                        };
                    }
                }
            }

            if (ptzValidationError) {
                alert(`⚠️ Erreur PTZ: ${ptzValidationError}`);
                return;
            }

            console.log('💎 PTZ configuré:', ptzParams);
            
            // Récupération des paramètres de frais
            const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
            const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
            
            const fraisGarantieInput = document.getElementById('frais-garantie');
            let fraisGarantie = null;
            if (fraisGarantieInput) {
                fraisGarantie = Math.round(loanAmount * 0.013709);
                fraisGarantieInput.value = fraisGarantie;
            }
            
            const typeGarantie = document.getElementById('type-garantie')?.value || 'caution';
            const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
            const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';
            const remboursementsAnticipes = window.storedRepayments || [];
            
            console.log("📋 Remboursements anticipés:", remboursementsAnticipes);
            console.log("🔄 Appliquer renégociation:", applyRenegotiation);
            
            // 🆕 v2.3.9: BONUS - Slider spécifique pour les indemnités selon le mode
            const indemnitesMois = modeRemboursement === 'mensualite'
                ? parseInt(penaltyMonthsSliderMensualite?.value || 3)
                : parseInt(penaltyMonthsSliderDuree?.value || 3);
            
            // Création du simulateur v2.3.10
            const simulator = new LoanSimulator({
                capital: loanAmount,
                tauxAnnuel: interestRate,
                dureeMois: loanDurationYears * 12,
                assuranceAnnuelle: insuranceRate,
                indemnitesMois: indemnitesMois, // 🆕 v2.3.9: Utilise le slider spécifique
                fraisDossier: fraisDossier,
                fraisTenueCompte: fraisTenueCompte,
                fraisGarantie: fraisGarantie,
                typeGarantie: typeGarantie,
                assuranceSurCapitalInitial: assuranceSurCapitalInitial
            });

            // Activation du mode debug si nécessaire
            if (window.location.search.includes('debug=true')) {
                simulator.debugMode = true;
                console.log('🔍 Mode debug activé');
            }

            // Calcul avec intégration PTZ
            const result = simulator.tableauAmortissement({
                nouveauTaux: newInterestRate,
                moisRenegociation: renegotiationMonth,
                modeRemboursement: modeRemboursement,
                remboursementsAnticipes: remboursementsAnticipes,
                appliquerRenegociation: applyRenegotiation,
                ptzParams: ptzParams
            });

            console.log("📊 Résultats calculés:", result);

            // 🆕 v2.3.4: NOUVELLE LOGIQUE - Ajout PTZ conditionnel selon période
            const fraisTenueMensuelCalc = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710) / (loanDurationYears * 12);
const mensualiteBase = result.tableau?.[0]?.mensualiteGlobale || (result.mensualiteInitiale + result.assuranceInitiale);
            
            let mensualiteRenego = mensualiteBase; // valeur par défaut
            if (applyRenegotiation && renegotiationMonth && result.mensualiteApresRenego) {
                const rowAfter = result.tableau.find(r => r.mois === renegotiationMonth + 1);
                if (rowAfter) {
                    mensualiteRenego = rowAfter.mensualiteGlobale;
                }
            }
            
            /* -------- PTZ & mensualités globales --------------------------------- */

            // ➊  Toujours calculer la part PTZ
            const debutPTZ = ptzParams?.enabled ? ptzParams.differeMois + 1 : Infinity;
            // Mensualité PTZ = montant / durée de remboursement effective (hors différé)
            const mensuPTZ = ptzParams?.enabled ? ptzParams.montant / (ptzParams.dureeMois - (ptzParams.differeMois || 0)) : 0;

            /* ➋  Mensualité "base" (crédit + assurance + PTZ, même si différé) */
            const mensualiteBasePTZ = mensualiteBase + mensuPTZ;

            /* ➌  Mensualité renégociée :  
                  – sans PTZ si la renégociation intervient **avant** le début du PTZ  
                  – avec PTZ sinon                                              */
            const mensualiteRenegoPTZ =
                    (renegotiationMonth >= debutPTZ) ? mensualiteRenego + mensuPTZ
                                                     : mensualiteRenego;
            
            // 🆕 v2.2.1: Stocker les deux valeurs dans result pour usage ultérieur
            result.mensualiteBaseGlobale = mensualiteBasePTZ;
            result.mensualiteRenegoGlobale = mensualiteRenegoPTZ;
            
            // 🆕 v2.2.1: Mise à jour UI avec deux tuiles distinctes
            updateMensualiteDisplay(mensualiteBasePTZ, mensualiteRenegoPTZ, applyRenegotiation, renegotiationMonth);

            // 🆕 v2.3.1: NOUVELLE FONCTION - Affichage dual crédit/PTZ
           updateMensualitePTZDisplay(result, ptzParams, Infinity);

            // Coût total avec PTZ
            const totalCreditAvecPTZ = result.totalPaye + (ptzParams ? ptzParams.montant : 0);
            document.getElementById('total-cost').textContent = formatMontant(totalCreditAvecPTZ);

            // Coût global et ratio
            const coutGlobalAvecPTZ = result.coutGlobalTotal + (ptzParams ? ptzParams.montant : 0);
            const montantTotalEmprunte = loanAmount + (ptzParams ? ptzParams.montant : 0);

            document.getElementById('cout-global').textContent = formatMontant(coutGlobalAvecPTZ);
            document.getElementById('ratio-cout').textContent = montantTotalEmprunte > 0 ? 
                (coutGlobalAvecPTZ / montantTotalEmprunte).toFixed(3) : '0.000';

            // 🔧 v2.3.10: TAEG corrigé avec fraisRenego=0 fix
            document.getElementById('taeg').textContent = result.taeg.toFixed(2) + '%';

            // 🆕 v2.2.1: Mise à jour des frais annexes avec tenue de compte incluse
            document.getElementById('total-interest').textContent = formatMontant(result.totalInterets);
            document.getElementById('early-repayment-penalty').textContent = formatMontant(result.indemnites);
            
            const totalFeesElement = document.getElementById('total-fees');
            if (totalFeesElement) {
                totalFeesElement.textContent = formatMontant(result.totalFraisAffiches); // ➜ 4 355 €
                
                // 🆕 v2.2.1: Mise à jour du label pour clarifier
                const feesLabel = totalFeesElement.parentElement.querySelector('.result-label');
                if (feesLabel) {
                    feesLabel.textContent = 'Frais annexes (dossier + garantie + tenue de compte)';
                }
            }

            // Génération du tableau d'amortissement
            updateAmortizationTable(result, ptzParams);
            
            // 🆕 v2.3.0: CHANTIER 1 - Encadré récapitulatif PTZ avec résumé
            updatePtzSummary(enablePTZ, ptzParams, loanDurationYears, montantTotalEmprunte, result);
            
            // Graphique mis à jour
            updateChart(result);

            // Donut répartition coût + mois de basculement
            updateCostDonut(result);
            updatePivotMonth(result);

            // Jauge économies cumulées
            updateSavingsGauge(result);

            // Taux d'endettement
            const mensuGlobale = result.mensualiteBaseGlobale || mensualiteBasePTZ;
            updateDebtRatio(mensuGlobale);

            // Comparaison assurance banque vs déléguée
            updateInsuranceComparison(result);

            // Résumé des économies
            updateSavingsSummary(result, modeRemboursement);
            
            // Tableau de comparaison
            updateComparisonTable(result, modeRemboursement);
            
            // Activation export PDF
            window.lastLoanResult = result;
            if (window.activateLoanExportButton) {
                window.activateLoanExportButton();
                console.log('✅ Bouton PDF activé');
            }
                // 📊 Génération du tableau de sensibilité
    const sensitivityPayload = generateSensitivityTable();
    renderSensitivityTable(sensitivityPayload);
            console.log('🎉 Calcul terminé avec succès (v2.3.10 - fraisRenego=0 fix)');
            return true;
        } catch (error) {
            console.error("❌ Erreur lors du calcul:", error);
            alert(`Une erreur s'est produite lors du calcul: ${error.message}`);
            return false;
        }
    }

    /**
     * ==========================================
     * 🆕 v2.2.1: NOUVELLE FONCTION D'AFFICHAGE DUAL MENSUALITÉ
     * ==========================================
     */
    function updateMensualiteDisplay(mensualiteBase, mensualiteRenego, applyRenegotiation, renegotiationMonth) {
        const monthlyPaymentElement = document.getElementById('monthly-payment');
        const monthlyPaymentCard = monthlyPaymentElement.parentElement;
        
        // Supprimer toute tuile de renégociation existante
        const existingRenegoCard = document.getElementById('monthly-payment-renego-card');
        if (existingRenegoCard) {
            existingRenegoCard.remove();
        }
        
        // Mise à jour de la tuile initiale
        monthlyPaymentElement.textContent = formatMontant(mensualiteBase);
        const initialLabel = monthlyPaymentCard.querySelector('.result-label');
        if (initialLabel) {
            initialLabel.textContent = 'Mensualité initiale (crédit + assurance + tenue)';
        }
        
        // Si renégociation activée et différente, créer une seconde tuile
        if (applyRenegotiation && renegotiationMonth && Math.abs(mensualiteRenego - mensualiteBase) > 0.01) {
            const renegoCard = document.createElement('div');
            renegoCard.id = 'monthly-payment-renego-card';
            renegoCard.className = 'result-card bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500';
            
            renegoCard.innerHTML = `
                <p id="monthly-payment-renego" class="result-value text-white">${formatMontant(mensualiteRenego)}</p>
                <p class="result-label text-blue-100">Mensualité après renégociation M${renegotiationMonth}</p>
                <div class="mt-2 text-xs text-blue-200 flex items-center">
                    <i class="fas fa-arrow-down mr-1"></i>
                    Économie: ${formatMontant(mensualiteBase - mensualiteRenego)}/mois
                </div>
            `;
            
            // Insérer après la tuile initiale
            monthlyPaymentCard.parentNode.insertBefore(renegoCard, monthlyPaymentCard.nextSibling);
            
            // Animation d'apparition
            setTimeout(() => {
                renegoCard.style.transform = 'translateY(0)';
                renegoCard.style.opacity = '1';
            }, 100);
        }
    }

    /**
     * ==========================================
     * 🆕 v2.3.4: FONCTION AFFICHAGE DUAL CRÉDIT/PTZ AVEC DIFFÉRÉ
     * ==========================================
     */
    function updateMensualitePTZDisplay(result, ptz, moisCourant = 1) {
        // Cartes + éléments DOM
        const cardMain = document.getElementById('monthly-payment-main');
        const valueMain = cardMain?.querySelector('.result-value');
        const cardCombined = document.getElementById('monthly-payment-combined');
        const valueComb = cardCombined?.querySelector('.result-value');
        const badgeComb = document.getElementById('ptz-start-badge');

        if (!cardMain || !valueMain) return;

        // 1) Mensualité crédit seul (crédit + assurance + tenue) - v2.3.10: utilise mensualiteGlobale
        const mensuCredit = result.tableau?.[0]?.mensualiteGlobale || (result.mensualiteInitiale + result.assuranceInitiale);
        valueMain.textContent = formatMontant(mensuCredit);

        // 2) Si le PTZ est activé et a un montant > 0
        if (ptz && ptz.enabled && ptz.montant > 0 && cardCombined && valueComb) {
            const debutPTZ  = ptz.differeMois + 1;
            const mensuPTZ  = ptz.montant / (ptz.dureeMois - (ptz.differeMois || 0));
            const mensuTotal = mensuCredit + mensuPTZ;

            if (moisCourant >= debutPTZ) {
                valueComb.textContent = formatMontant(mensuTotal);
                if (badgeComb) {
                    badgeComb.textContent = `+${formatMontant(mensuPTZ)} à partir du mois ${debutPTZ}`;
                }
                cardCombined.classList.remove('hidden');
            } else {
                cardCombined.classList.add('hidden');
            }
        } else if (cardCombined) {
            // Pas de PTZ : on masque la carte combinée
            cardCombined.classList.add('hidden');
        }
    }

    /**
     * ==========================================
     * 📋 FONCTIONS D'AFFICHAGE UI v2.3.10
     * ==========================================
     */

    function updateAmortizationTable(result, ptzParams) {
        const tableBody = document.getElementById('amortization-table');
        tableBody.innerHTML = '';

        const displayRows = Math.min(result.tableau.length, 120);
        
        for (let i = 0; i < displayRows; i++) {
            const row = result.tableau[i];
            const tr = document.createElement('tr');
            
            if (row.remboursementAnticipe > 0) {
                tr.classList.add('bg-green-900', 'bg-opacity-20');
            } else if (i + 1 === result.moisRenegociation && result.appliquerRenegociation) {
                tr.classList.add('bg-blue-500', 'bg-opacity-20');
            } else {
                tr.classList.add(i % 2 === 0 ? 'bg-blue-800' : 'bg-blue-900', 'bg-opacity-10');
            }
            
            // 🔧 v2.3.6: Affichage mensualiteGlobale (inclut maintenant tenue de compte)
            tr.innerHTML = `
                <td class="px-3 py-2">${row.mois}</td>
                <td class="px-3 py-2 text-right">
                    ${formatMontant(row.mensualiteGlobale)}
                </td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capitalAmorti)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.interets)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.assurance)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capitalRestant)}</td>
            `;
            
            tableBody.appendChild(tr);

            // 🆕 v2.3.0: CHANTIER 1 - Ligne PTZ restant après remboursement total
            if (i + 1 === result.dureeReelle && ptzParams?.enabled && row.capitalRestant === 0) {
                const ptzRemaining = ptzParams.montant - (ptzParams.montant/ptzParams.dureeMois)*result.dureeReelle;
                if (ptzRemaining > 0) {
                    const trPtz = document.createElement('tr');
                    trPtz.className = 'bg-amber-900 bg-opacity-10 italic';
                    trPtz.innerHTML = `
                         <td colspan="2" class="px-3 py-2 text-amber-300">PTZ restant</td>
                         <td class="px-3 py-2 text-right text-amber-300">${formatMontant(ptzRemaining)}</td>
                         <td colspan="3" class="px-3 py-2 text-gray-400">PTZ continue jusqu'à M${ptzParams.dureeMois}</td>`;
                    tableBody.appendChild(trPtz);
                }
            }
        }
        
        if (result.tableau.length > 120) {
            const trInfo = document.createElement('tr');
            trInfo.classList.add('bg-blue-900', 'bg-opacity-50');
            trInfo.innerHTML = `
                <td colspan="6" class="px-3 py-2 text-center">
                    <i class="fas fa-info-circle mr-2"></i>
                    Affichage limité aux 120 premiers mois pour des raisons de performance.
                    Durée totale du prêt: ${result.dureeReelle} mois.
                </td>
            `;
            tableBody.appendChild(trInfo);
        }
    }
    
    function buildPtzSummaryHtml(ptz, loanYears, montantTotal, result) {
    if (!ptz || !ptz.enabled) return '';
    
    const mensualitePTZ = ptz.montant / (ptz.dureeMois - (ptz.differeMois || 0));
    const pourcentage = ((ptz.montant / montantTotal) * 100).toFixed(1);
    const finPTZ = Math.floor(ptz.dureeMois / 12);
    
    return `<div id="ptz-summary" class="mb-6 p-4 bg-amber-900 bg-opacity-20 border border-amber-600 rounded-lg">
        <h5 class="text-amber-400 font-medium">
            <i class="fas fa-home mr-2"></i>Détail du PTZ (${pourcentage}% financement)
        </h5>
        <p>Capital: ${formatMontant(ptz.montant)} • Durée: ${finPTZ} ans • Mensualité: ${formatMontant(mensualitePTZ)}</p>
    </div>`;
}

    // 🆕 v2.3.0: CHANTIER 1 - Fonction updatePtzSummary avec résumé PTZ
 function updatePtzSummary(enablePTZ, ptzParams, loanYears, montantTotal, result, injectToDom = false) {
    // Supprime l'ancien
    const existing = document.getElementById('ptz-summary');
    if (existing) existing.remove();
    
    // Génère le HTML
    const html = buildPtzSummaryHtml(ptzParams, loanYears, montantTotal, result);
    
    // Stocke pour PDF
    window.lastPtzSummaryHTML = html;
    
    // Injecte seulement si demandé
    if (injectToDom && html) {
        const container = document.querySelector('.grid.grid-cols-2.gap-4.mb-6');
        if (container) container.insertAdjacentHTML('afterend', html);
    }
}

    function updateComparisonTable(result, modeRemboursement) {
        const compareCheckbox = document.getElementById('compare-scenarios');
        const comparisonTable = document.getElementById('comparison-table');
        const comparisonTableBody = document.getElementById('comparison-table-body');
        
        if (compareCheckbox && comparisonTable && comparisonTableBody) {
            if (compareCheckbox.checked) {
                comparisonTable.classList.remove('hidden');
                
                // Calculer scénario de base sans remboursement
                const simulator = new LoanSimulator({
                    capital: result.capitalInitial,
                    tauxAnnuel: document.getElementById('interest-rate-slider').value,
                    dureeMois: result.dureeInitiale,
                    assuranceAnnuelle: document.getElementById('insurance-rate-slider').value,
                    fraisDossier: parseFloat(document.getElementById('frais-dossier')?.value || 2000),
                    fraisTenueCompte: parseFloat(document.getElementById('frais-tenue-compte')?.value || 710),
                    assuranceSurCapitalInitial: document.getElementById('assurance-capital-initial')?.checked || false
                });
                
                const baseResult = simulator.tableauAmortissement({});
                
                const moisRef = result.dernierRemboursement + 1;
                const ligneRef = result.tableau.find(r => r.mois === moisRef);
                const mensualiteApres = ligneRef ? ligneRef.mensualite : result.mensualiteInitiale;
                
                comparisonTableBody.innerHTML = '';
                
                // 🔧 v2.3.10: Comparaisons avec TAEG corrigé
                const comparisons = [
                    {
                        label: 'Durée du prêt',
                        base: `${baseResult.dureeReelle} mois`,
                        current: `${result.dureeReelle} mois`,
                        diff: `-${baseResult.dureeReelle - result.dureeReelle} mois`,
                        positive: true
                    },
                    {
                        label: 'Coût total',
                        base: formatMontant(baseResult.totalPaye),
                        current: formatMontant(result.totalPaye),
                        diff: `-${formatMontant(baseResult.totalPaye - result.totalPaye)}`,
                        positive: true
                    },
                    {
                        label: 'Total des intérêts',
                        base: formatMontant(baseResult.totalInterets),
                        current: formatMontant(result.totalInterets),
                        diff: `-${formatMontant(baseResult.totalInterets - result.totalInterets)}`,
                        positive: true
                    },
                    {
                        label: 'Mensualité',
                        base: formatMontant(baseResult.mensualiteInitiale),
                        current: formatMontant(mensualiteApres),
                        diff: formatMontant(baseResult.mensualiteInitiale - mensualiteApres),
                        positive: modeRemboursement === 'mensualite'
                    },
                    {
                        label: 'TAEG v2.3.10 Corrigé',
                        base: `${baseResult.taeg.toFixed(2)}%`,
                        current: `${result.taeg.toFixed(2)}%`,
                        diff: `-${Math.max(0, (baseResult.taeg - result.taeg)).toFixed(2)}%`,
                        positive: true
                    },
                    {
                        label: 'Frais supplémentaires',
                        base: '0 €',
                        current: formatMontant(result.indemnites),
                        diff: `+${formatMontant(result.indemnites)}`,
                        positive: false
                    },
                    {
                        label: 'Coût global total',
                        base: formatMontant(baseResult.coutGlobalTotal),
                        current: formatMontant(result.coutGlobalTotal),
                        diff: `-${formatMontant(baseResult.coutGlobalTotal - result.coutGlobalTotal)}`,
                        positive: true
                    }
                ];

                // 🆕 v2.2.1: Ajout ligne renégociation si applicable
                if (result.mensualiteAvantRenego && result.mensualiteApresRenego) {
                    comparisons.splice(4, 0, {
                        label: `Diff. mensualité à M${result.moisRenegociation}`,
                        base: formatMontant(result.mensualiteAvantRenego),
                        current: formatMontant(result.mensualiteApresRenego),
                        diff: `-${formatMontant(result.economieMensualiteRenego)}`,
                        positive: true
                    });
                }

                comparisons.forEach((comp, index) => {
                    const tr = document.createElement('tr');
                    tr.classList.add(index % 2 === 0 ? 'bg-blue-800' : 'bg-blue-900', 'bg-opacity-10');
                    if (index === comparisons.length - 1) {
                        tr.classList.add('font-bold', 'bg-green-900', 'bg-opacity-10');
                    }
                    
                    const diffClass = comp.positive ? 'text-green-400' : 'text-amber-400';
                    
                    tr.innerHTML = `
                        <td class="px-3 py-2 font-medium">${comp.label}</td>
                        <td class="px-3 py-2 text-right">${comp.base}</td>
                        <td class="px-3 py-2 text-right">${comp.current}</td>
                        <td class="px-3 py-2 text-right ${diffClass}">${comp.diff}</td>
                    `;
                    comparisonTableBody.appendChild(tr);
                });
                
            } else {
                comparisonTable.classList.add('hidden');
            }
        }
    }
    
    function updateSavingsSummary(result, modeRemboursement) {
        const loanSimulatorTab = document.getElementById('loan-simulator');
        if (!loanSimulatorTab || loanSimulatorTab.style.display === 'none') {
            return;
        }
        
        let savingsSummary = document.getElementById('savings-summary');
        
        if (!savingsSummary) {
            savingsSummary = document.createElement('div');
            savingsSummary.id = 'savings-summary';
            savingsSummary.className = 'bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-green-400 mt-6';
            
            const chartContainer = loanSimulatorTab.querySelector('.chart-container');
            if (chartContainer) {
                chartContainer.after(savingsSummary);
            }
        }
        
        // 🆕 v2.2.1: Utilisation économie exacte d'intérêts
        const economiesPourcentage = result.economieInteretsExact > 0 ? 
            ((result.economieInteretsExact / (result.totalInterets + result.economieInteretsExact)) * 100).toFixed(1) :
            ((result.economiesInterets / (result.totalInterets + result.economiesInterets)) * 100).toFixed(1);
        
        let modeText = '';
        if (modeRemboursement === 'duree') {
            modeText = `Réduction de la durée du prêt de ${result.dureeInitiale - result.dureeReelle} mois`;
        } else {
            const mensualiteInitiale = result.mensualiteInitiale;
            const mensualiteFinale = result.tableau[result.tableau.length - 1].mensualite;
            const difference = mensualiteInitiale - mensualiteFinale;
            modeText = `Réduction de la mensualité de ${formatMontant(difference)} (${formatMontant(mensualiteInitiale)} → ${formatMontant(mensualiteFinale)})`;
        }
        
        let renégociationText = '';
        if (result.appliquerRenegociation && result.moisRenegociation) {
            renégociationText = `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Renégociation au mois ${result.moisRenegociation} : taux passant de ${document.getElementById('interest-rate-slider').value}% à ${document.getElementById('new-interest-rate-slider').value}%</span>
                </li>
            `;
            
            // 🆕 v2.2.1: Affichage bascule mensualité si disponible
            if (result.mensualiteAvantRenego && result.mensualiteApresRenego) {
                renégociationText += `
                    <li class="flex items-start bg-green-900 bg-opacity-30 p-2 rounded-lg my-2">
                        <i class="fas fa-euro-sign text-green-400 mr-2 mt-1"></i>
                        <span><strong>💸 Économie immédiate :</strong> ${formatMontant(result.mensualiteAvantRenego)} ➜ ${formatMontant(result.mensualiteApresRenego)} 
                        (<span class="text-green-300">-${formatMontant(result.economieMensualiteRenego)}</span>/mois)</span>
                    </li>
                `;
            }
        } else if (result.moisRenegociation) {
            renégociationText = `
                <li class="flex items-start">
                    <i class="fas fa-times-circle text-amber-400 mr-2 mt-1"></i>
                    <span>Renégociation désactivée : le taux initial de ${document.getElementById('interest-rate-slider').value}% est conservé sur toute la durée du prêt</span>
                </li>
            `;
        }
        
        let htmlContent = `
            <h5 class="text-green-400 font-medium flex items-center mb-2">
                <i class="fas fa-piggy-bank mr-2"></i>
                Analyse complète du prêt v2.3.10
                <span class="ml-2 text-xs bg-green-900 bg-opacity-30 px-2 py-1 rounded">IRR ${result.taeg.toFixed(3)}%</span>
            </h5>
            <ul class="text-sm text-gray-300 space-y-2 pl-4">
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Coût total du crédit : ${formatMontant(result.coutGlobalTotal)} 
                    (capital + intérêts + assurance + frais)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Vous économisez ${formatMontant(result.economieInteretsExact > 0 ? result.economieInteretsExact : result.economiesInterets)} d'intérêts (${economiesPourcentage}% du total)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>${modeText}</span>
                </li>
                ${renégociationText}`;
                
        if (result.pretSoldeAvantTerme) {
            const gainTemps = result.gainTemps;
            const annees = Math.floor(gainTemps / 12);
            const mois = gainTemps % 12;
            
            let texteGain = '';
            if (annees > 0) {
                texteGain += `${annees} an${annees > 1 ? 's' : ''}`;
            }
            if (mois > 0) {
                texteGain += `${annees > 0 ? ' et ' : ''}${mois} mois`;
            }
            
            htmlContent += `
                <li class="flex items-start bg-green-900 bg-opacity-30 p-2 rounded-lg my-2">
                    <i class="fas fa-award text-green-400 mr-2 mt-1"></i>
                    <span><strong>Prêt soldé avant terme!</strong> Vous gagnez ${texteGain} sur la durée initiale.</span>
                </li>`;
        }
        
        htmlContent += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Indemnités de remboursement anticipé: ${formatMontant(result.indemnites)} 
                    (plafonnées légalement à 6 mois d'intérêts ou 3% du capital remboursé)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>TAEG précis via IRR v2.3.10: ${result.taeg.toFixed(2)}% 
                    <span class="text-xs text-green-300">(fraisRenego=0 fix)</span></span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Frais annexes: ${formatMontant(result.totalFraisAffiches)} 
                    <span class="text-xs text-blue-300">(dossier + garantie + tenue compte)</span></span>
                </li>`;
        
        if (result.remboursementsAnticipes && result.remboursementsAnticipes.length > 0) {
            htmlContent += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Remboursements anticipés: ${result.remboursementsAnticipes.length}</span>
                </li>`;
        }
        
        htmlContent += `</ul>`;
        savingsSummary.innerHTML = htmlContent;
    }

    // ==========================================
    // 📊 DONUT RÉPARTITION DU COÛT
    // ==========================================
    let costDonutChart;
    function updateCostDonut(result) {
        const section = document.getElementById('cost-breakdown-section');
        const ctx = document.getElementById('cost-donut-chart')?.getContext('2d');
        if (!section || !ctx || !result) return;

        const capital = result.capitalInitial || 0;
        const interets = result.totalInterets || 0;
        const assurance = result.totalAssurance || 0;
        const frais = result.totalFraisAffiches || 0;
        const indemnites = result.indemnites || 0;

        if (costDonutChart) costDonutChart.destroy();
        costDonutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Capital', 'Intérêts', 'Assurance', 'Frais', 'Indemnités RA'],
                datasets: [{
                    data: [capital, interets, assurance, frais, indemnites],
                    backgroundColor: ['#00d26e', '#ff4757', '#3b82f6', '#a855f7', '#f59e0b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, padding: 8 } },
                    tooltip: { callbacks: { label: (c) => `${c.label}: ${formatMontant(c.raw)}` } }
                }
            }
        });

        // Ratio au centre
        const ratio = capital > 0 ? ((capital + interets + assurance + frais + indemnites) / capital).toFixed(3) : '0';
        document.getElementById('donut-ratio').textContent = ratio;
        section.classList.remove('hidden');
    }

    // ==========================================
    // 🔄 MOIS DE BASCULEMENT
    // ==========================================
    function updatePivotMonth(result) {
        const el = document.getElementById('pivot-month-text');
        if (!el || !result.tableau || result.tableau.length === 0) return;

        let pivotMonth = null;
        for (const row of result.tableau) {
            if (row.capital > row.interets) { pivotMonth = row.mois; break; }
        }

        if (pivotMonth) {
            const years = Math.floor(pivotMonth / 12);
            const months = pivotMonth % 12;
            const timeLabel = years > 0 ? `${years} an${years > 1 ? 's' : ''} ${months > 0 ? months + ' mois' : ''}` : `${months} mois`;
            el.innerHTML = `À partir du <span class="text-yellow-400 font-bold">mois ${pivotMonth}</span> (${timeLabel}), vous remboursez <span class="text-green-400 font-semibold">plus de capital que d'intérêts</span>.<br><span class="text-xs text-gray-400">Avant ce point, la majorité de votre mensualité va à la banque.</span>`;
        } else {
            el.innerHTML = `<span class="text-green-400">Dès le premier mois</span>, vous remboursez plus de capital que d'intérêts.`;
        }
    }

    // ==========================================
    // 💰 JAUGE ÉCONOMIES CUMULÉES
    // ==========================================
    function updateSavingsGauge(result) {
        const gauge = document.getElementById('savings-gauge');
        const content = document.getElementById('savings-gauge-content');
        if (!gauge || !content) return;

        const items = [];
        // Économie renégociation
        if (result.economieInteretsExact > 0) {
            items.push({ label: 'Renégociation', amount: Math.round(result.economieInteretsExact), color: 'bg-blue-500' });
        }
        // Économie RA (gain temps × mensualité)
        if (result.gainTemps > 0) {
            const econRA = Math.round(result.gainTemps * (result.mensualiteInitiale + (result.assuranceInitiale || 0)));
            items.push({ label: 'Remb. anticipé', amount: econRA, color: 'bg-green-500' });
        }
        // Économie assurance déléguée
        const delegRate = parseFloat(document.getElementById('delegated-insurance-rate')?.value) || 0.10;
        if (result.totalAssurance > 0 && delegRate < (result.assuranceMensuelle * 12 * 100)) {
            let coutDeleg = 0;
            for (const row of (result.tableau || [])) coutDeleg += (row.capitalRestant || 0) * (delegRate / 100 / 12);
            const econAssurance = Math.round(result.totalAssurance - coutDeleg);
            if (econAssurance > 0) items.push({ label: 'Assurance déléguée', amount: econAssurance, color: 'bg-purple-500' });
        }

        if (items.length === 0) { gauge.classList.add('hidden'); return; }

        const total = items.reduce((s, i) => s + i.amount, 0);
        const maxAmount = Math.max(...items.map(i => i.amount));

        let html = items.map(i => `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-gray-300">${i.label}</span>
                    <span class="text-white font-semibold">${formatMontant(i.amount)}</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2">
                    <div class="${i.color} rounded-full h-2 transition-all" style="width:${(i.amount / maxAmount * 100).toFixed(0)}%"></div>
                </div>
            </div>`).join('');

        html += `<div class="mt-3 pt-2 border-t border-gray-600 flex justify-between items-center">
            <span class="text-sm text-gray-300">Total économisé</span>
            <span class="text-green-400 font-bold text-lg">${formatMontant(total)}</span>
        </div>`;

        content.innerHTML = html;
        gauge.classList.remove('hidden');
    }

    // ==========================================
    // 🛡️ TAUX D'ENDETTEMENT
    // ==========================================
    function updateDebtRatio(mensualiteTotale) {
        const incomeInput = document.getElementById('debt-ratio-income');
        const resultDiv = document.getElementById('debt-ratio-result');
        const valueEl = document.getElementById('debt-ratio-value');
        const fillEl = document.getElementById('debt-ratio-fill');
        const labelEl = document.getElementById('debt-ratio-label');
        if (!incomeInput || !resultDiv) return;

        const income = parseFloat(incomeInput.value) || 0;
        if (income <= 0) { resultDiv.classList.add('hidden'); return; }

        const ratio = (mensualiteTotale / income) * 100;
        const clamped = Math.min(ratio, 100);

        valueEl.textContent = ratio.toFixed(1) + '%';
        fillEl.style.width = clamped + '%';

        if (ratio <= 33) {
            fillEl.className = 'h-2 rounded-full bg-green-400 transition-all';
            valueEl.className = 'text-lg font-bold text-green-400';
            labelEl.textContent = 'Conforme HCSF (≤ 33%)';
        } else if (ratio <= 35) {
            fillEl.className = 'h-2 rounded-full bg-yellow-400 transition-all';
            valueEl.className = 'text-lg font-bold text-yellow-400';
            labelEl.textContent = 'Limite haute — dérogation possible';
        } else {
            fillEl.className = 'h-2 rounded-full bg-red-400 transition-all';
            valueEl.className = 'text-lg font-bold text-red-400';
            labelEl.textContent = '⚠️ Refus probable — au-dessus de 35%';
        }
        resultDiv.classList.remove('hidden');
    }

    // Listener revenu pour recalcul en temps réel
    document.getElementById('debt-ratio-income')?.addEventListener('input', () => {
        if (window.lastLoanResult) {
            const mensu = window.lastLoanResult.mensualiteBaseGlobale || window.lastLoanResult.mensualiteInitiale + (window.lastLoanResult.assuranceInitiale || 0);
            updateDebtRatio(mensu);
        }
    });

    // ==========================================
    // 💡 COMPARAISON ASSURANCE BANQUE vs DÉLÉGUÉE
    // ==========================================
    function updateInsuranceComparison(result) {
        const container = document.getElementById('insurance-comparison');
        if (!container || !result || !result.tableau || result.tableau.length === 0) return;

        const tauxBanqueAnnuel = result.assuranceMensuelle ? result.assuranceMensuelle * 12 * 100 : 0;
        const tauxDelegueInput = document.getElementById('delegated-insurance-rate');
        const tauxDelegueAnnuel = tauxDelegueInput ? parseFloat(tauxDelegueInput.value) || 0.10 : 0.10;
        const tauxDelegueMensuel = tauxDelegueAnnuel / 100 / 12;

        // Coût banque = déjà calculé
        const coutBanque = result.totalAssurance || 0;

        // Coût délégué : toujours sur CRD (capital restant dû)
        let coutDelegue = 0;
        for (const row of result.tableau) {
            coutDelegue += (row.capitalRestant || 0) * tauxDelegueMensuel;
        }
        coutDelegue = Math.round(coutDelegue);

        const economie = Math.round(coutBanque - coutDelegue);
        const economiePct = coutBanque > 0 ? Math.round((economie / coutBanque) * 100) : 0;
        const mensualiteBanque = Math.round(coutBanque / result.tableau.length);
        const mensualiteDelegue = Math.round(coutDelegue / result.tableau.length);

        // Mise à jour de l'affichage
        document.getElementById('insurance-bank-rate').textContent = tauxBanqueAnnuel.toFixed(2) + '%';
        document.getElementById('insurance-bank-cost').textContent = formatMontant(coutBanque);
        document.getElementById('insurance-bank-monthly').textContent = formatMontant(mensualiteBanque) + '/mois';
        document.getElementById('insurance-delegated-cost').textContent = formatMontant(coutDelegue);
        document.getElementById('insurance-delegated-monthly').textContent = formatMontant(mensualiteDelegue) + '/mois';

        // Couleurs conditionnelles : vert si économie, rouge si plus cher
        const isPositive = economie > 0;
        const costColor = isPositive ? 'text-green-400' : 'text-red-400';
        const bankCostColor = isPositive ? 'text-red-400' : 'text-green-400';

        // Couleur du coût délégué
        const delegatedCostEl = document.getElementById('insurance-delegated-cost');
        if (delegatedCostEl) {
            delegatedCostEl.className = `text-xl font-bold ${costColor}`;
        }
        // Couleur du coût banque (inverse)
        const bankCostEl = document.getElementById('insurance-bank-cost');
        if (bankCostEl) {
            bankCostEl.className = `text-xl font-bold ${bankCostColor}`;
        }

        const savingsEl = document.getElementById('insurance-savings');
        const savingsPctEl = document.getElementById('insurance-savings-pct');
        if (savingsEl) {
            const boldEl = savingsEl.querySelector('.font-bold');
            if (boldEl) {
                boldEl.textContent = formatMontant(Math.abs(economie));
                boldEl.className = `font-bold text-lg ${costColor}`;
            }
            const labelEl = savingsEl.querySelector('.text-sm');
            if (labelEl) {
                labelEl.textContent = isPositive ? " d'économie potentielle" : " plus cher que votre banque";
            }
            savingsEl.className = isPositive
                ? 'text-center p-2 bg-green-900 bg-opacity-20 rounded-lg'
                : 'text-center p-2 bg-red-900 bg-opacity-20 rounded-lg';
        }
        if (savingsPctEl) {
            savingsPctEl.textContent = isPositive ? `(−${economiePct}%)` : `(+${Math.abs(economiePct)}%)`;
            savingsPctEl.className = `text-sm font-semibold ml-1 ${costColor}`;
        }

        container.classList.remove('hidden');
    }

    // Listener recalcul en temps réel quand on modifie le taux délégué
    document.getElementById('delegated-insurance-rate')?.addEventListener('input', () => {
        if (window.lastLoanResult) updateInsuranceComparison(window.lastLoanResult);
    });

    // Graphique d'amortissement
    let loanChart;

    function updateChart(result) {
        const ctx = document.getElementById('loan-chart')?.getContext('2d');
        if (!ctx) return;
        
        if (loanChart) {
            loanChart.destroy();
        }
        
        const capitalData = [];
        const interestData = [];
        const insuranceData = [];
        const labels = [];
        
        const sampleRate = Math.max(1, Math.floor(result.tableau.length / 40));
        
        for (let i = 0; i < result.tableau.length; i += sampleRate) {
            const row = result.tableau[i];
            labels.push(`Mois ${row.mois}`);
            capitalData.push(row.capitalRestant);
            
            let cumulativeInterest = 0;
            let cumulativeInsurance = 0;
            
            for (let j = 0; j <= i; j++) {
                cumulativeInterest += result.tableau[j].interets;
                cumulativeInsurance += result.tableau[j].assurance;
            }
            
            interestData.push(cumulativeInterest);
            insuranceData.push(cumulativeInsurance);
        }
        
        const feesData = Array(labels.length).fill(0);
        feesData[0] = result.totalFraisAffiches; // 🆕 v2.2.1: utilise totalFraisAffiches
        
        loanChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Capital restant',
                        data: capitalData,
                        borderColor: 'rgba(52, 211, 153, 1)',
                        backgroundColor: 'rgba(52, 211, 153, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Intérêts cumulés',
                        data: interestData,
                        borderColor: 'rgba(239, 68, 68, 0.8)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Assurance cumulée',
                        data: insuranceData,
                        borderColor: 'rgba(59, 130, 246, 0.8)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Frais annexes (complets)',
                        data: feesData,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        backgroundColor: 'rgba(153, 102, 255, 0.1)',
                        fill: true,
                        pointRadius: feesData.map((v, i) => i === 0 ? 6 : 0),
                        pointBackgroundColor: 'rgba(153, 102, 255, 1)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Évolution du prêt (v2.3.10 - fraisRenego=0 fix)',
                        color: 'rgba(255, 255, 255, 0.9)'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatMontant(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            callback: function(value) {
                                return formatMontant(value);
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
        
        // Marquer les remboursements anticipés
        if (result.remboursementsAnticipes && result.remboursementsAnticipes.length > 0) {
            result.remboursementsAnticipes.forEach(rembours => {
                const remboursementIndex = Math.floor(rembours.mois / sampleRate);
                
                if (remboursementIndex < labels.length) {
                    const dataset = loanChart.data.datasets[0];
                    dataset.pointBackgroundColor = dataset.pointBackgroundColor || Array(dataset.data.length).fill('transparent');
                    dataset.pointRadius = dataset.pointRadius || Array(dataset.data.length).fill(0);
                    
                    dataset.pointBackgroundColor[remboursementIndex] = 'rgba(52, 211, 153, 1)';
                    dataset.pointRadius[remboursementIndex] = 5;
                }
            });
        }
        
        // Marquer la renégociation
        if (result.moisRenegociation && result.appliquerRenegociation) {
            const renegotiationIndex = Math.floor(result.moisRenegociation / sampleRate);
            
            if (renegotiationIndex < labels.length) {
                const dataset = loanChart.data.datasets[1];
                dataset.pointBackgroundColor = dataset.pointBackgroundColor || Array(dataset.data.length).fill('transparent');
                dataset.pointRadius = dataset.pointRadius || Array(dataset.data.length).fill(0);
                
                dataset.pointBackgroundColor[renegotiationIndex] = 'rgba(59, 130, 246, 1)';
                dataset.pointRadius[renegotiationIndex] = 5;
            }
        }
        
        loanChart.update();
    }

    // Event listener pour le calcul
    if (calculateLoanButton) {
        calculateLoanButton.addEventListener('click', calculateLoan);
    }
    
    // Fonction pour vérifier le remboursement total
    window.checkTotalRepayment = function(montant) {
        try {
            const loanAmount = parseFloat(document.getElementById('loan-amount').value);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider').value) / 100 / 12;
            const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
            const currentMonth = parseInt(document.getElementById('early-repayment-month-slider-mensualite').value);
            
            const mensualite = loanAmount * interestRate / (1 - Math.pow(1 + interestRate, -(loanDurationYears * 12)));
            let capitalRestant = loanAmount;
            
            for (let i = 1; i < currentMonth; i++) {
                const interetMois = capitalRestant * interestRate;
                capitalRestant -= (mensualite - interetMois);
            }
            
            const notice = document.getElementById('total-repayment-notice');
            if (notice && montant >= capitalRestant * 0.95) {
                notice.classList.remove('hidden');
            } else if (notice) {
                notice.classList.add('hidden');
            }
        } catch (error) {
            console.error("Erreur lors de la vérification du remboursement total:", error);
        }
    };

    // 🔧 v2.3.2: GESTIONNAIRE POUR AJOUTER UN REMBOURSEMENT (RESTAURÉ)
    const addRepaymentBtn = document.getElementById('add-repayment-btn');
    if (addRepaymentBtn) {
        addRepaymentBtn.addEventListener('click', function (e) {
            e.preventDefault();

            const mode = document.getElementById('remboursement-mode').value;
            let newRepayment;

            if (mode === 'duree') {
                const moisAReduire = +document.getElementById('reduction-duree-mois').value;
                const mois = +document.getElementById('early-repayment-month-slider-duree').value;
                if (moisAReduire <= 0) return;
                newRepayment = { montant: 0, mois, moisAReduire };
            } else {
                const totalChk = document.getElementById('total-repayment').checked;
                const mois = +document.getElementById('early-repayment-month-slider-mensualite').value;
                let montant = +document.getElementById('early-repayment-amount-mensualite').value;
                if (totalChk) montant = getRemainingCapitalAt(mois);
                if (montant <= 0) return;
                newRepayment = { montant, mois, type: totalChk ? 'total' : 'partiel', timestamp: Date.now() };
            }

            window.storedRepayments.push(newRepayment);
            renderRepaymentsList();
            calculateLoan();
        });
    } else {
        console.warn('🔧 v2.3.10: Bouton add-repayment-btn non trouvé');
    }

    // 🔧 v2.3.2: FONCTION POUR AFFICHER LA LISTE DES REMBOURSEMENTS (RESTAURÉE)
    function renderRepaymentsList() {
        const list = document.getElementById('repayments-list');
        if (!list) return;

        list.innerHTML = '';

        window.storedRepayments.forEach((repayment, index) => {
            const item = document.createElement('div');
            item.className = 'repayment-item';
            
            const label = repaymentLabel(repayment);
            
            item.innerHTML = `
                <div class="repayment-item-header">
                    <div class="${label.cls}">
                        ${label.html}
                        <span class="text-gray-400 ml-2">- Mois ${repayment.mois}</span>
                    </div>
                    <button class="remove-repayment" data-index="${index}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            
            list.appendChild(item);
        });

        // Attacher les événements de suppression
        list.querySelectorAll('.remove-repayment').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                window.storedRepayments.splice(index, 1);
                renderRepaymentsList();
                calculateLoan();
            });
        });
    }

    // 🔧 v2.3.2: BOUTON RESET REMBOURSEMENTS (RESTAURÉ)
    const resetRepaymentsBtn = document.getElementById('reset-repayments');
    if (resetRepaymentsBtn) {
        resetRepaymentsBtn.addEventListener('click', function() {
            if (confirm('Êtes-vous sûr de vouloir supprimer tous les remboursements anticipés ?')) {
                window.storedRepayments = [];
                renderRepaymentsList();
                calculateLoan();
                showNotification('Tous les remboursements ont été supprimés', 'success');
            }
        });
    }

    // 🔧 v2.3.10: EXPOSITION AU SCOPE GLOBAL pour compatibilité
    window.renderRepaymentsList = renderRepaymentsList;
    window.calculateLoan = calculateLoan;

    // Initialisation
    updateSliderMaxValues();
    renderRepaymentsList();
// ============================================
// 📊 TABLEAU DE SENSIBILITÉ TAUX v1.1
// ============================================

/**
 * Calcule les IRA conformes à la réglementation
 * Plafond : min(6 mois d'intérêts sur capital remboursé, 3% du CRD avant remboursement)
 */
function computeIRA({ montantRembourse, capitalRestantAvant, tauxAnnuel, indemnitesMois }) {
    const r = (tauxAnnuel / 100) / 12;
    const moisInterets = Math.min(Math.max(indemnitesMois || 6, 0), 6);
    const plafondInterets = montantRembourse * r * moisInterets;
    const plafond3pcCRD = 0.03 * capitalRestantAvant;
    return Math.min(plafondInterets, plafond3pcCRD);
}

/**
 * Calcule la mensualité crédit seul
 */
function mensualiteCreditSensi(capital, tauxAnnuel, dureeMois) {
    const r = (tauxAnnuel / 100) / 12;
    if (dureeMois <= 0) return 0;
    if (Math.abs(r) < 1e-12) return capital / dureeMois;
    return capital * r / (1 - Math.pow(1 + r, -dureeMois));
}

/**
 * 🔧 v2.3.10: Récupère les paramètres pour le tableau de sensibilité
 * FIX: fraisRenego=0 ne fallback plus à 800
 */
function getSensitivityParams() {
    const mode = document.getElementById('remboursement-mode')?.value || 'duree';
    const applyReneg = document.getElementById('apply-renegotiation')?.checked || false;
    const moisRenego = +document.getElementById('renegotiation-month-slider')?.value || 1;
    const moisRepayment = (mode === 'mensualite')
        ? +document.getElementById('early-repayment-month-slider-mensualite')?.value
        : +document.getElementById('early-repayment-month-slider-duree')?.value;
    const moisRef = applyReneg ? moisRenego : (moisRepayment || 1);
    const indemnitesMois = (mode === 'mensualite')
        ? +document.getElementById('penalty-months-slider-mensualite')?.value
        : +document.getElementById('penalty-months-slider-duree')?.value;
    const tauxRef = applyReneg
        ? +document.getElementById('new-interest-rate-slider')?.value
        : +document.getElementById('interest-rate-slider')?.value;
    
    // 🔧 v2.3.10: FIX CRITIQUE - utilise ?? au lieu de || pour préserver 0
    const fraisRenegoEl = document.getElementById('frais-renego');
    const fraisRenegoRaw = fraisRenegoEl ? fraisRenegoEl.value : '';
    const fraisRenegoNum = Number(fraisRenegoRaw);
    const fraisRenego = (fraisRenegoRaw === '' || Number.isNaN(fraisRenegoNum)) ? 800 : fraisRenegoNum;
    
    return { moisRef, indemnitesMois, fraisRenego, tauxRef };
}

/**
 * Calcule le remboursement anticipé équivalent (formule fermée)
 */
function equivalentRepaymentClosedForm(crd, tauxRef, dureeRestante, mensualiteCible, params) {
    const { assuranceMensuelle, assuranceSurCI, capitalInitial, fraisTenueMensuel, ptz, moisRef } = params;
    const r = (tauxRef / 100) / 12;
    const A = (Math.abs(r) < 1e-12) ? 1 / dureeRestante : r / (1 - Math.pow(1 + r, -dureeRestante));
    const assuranceFixe = assuranceSurCI ? capitalInitial * assuranceMensuelle : 0;
    const moisEffet = moisRef + 1;
    const ptzMensuel = (ptz?.enabled && ptz.montant > 0 && 
                        moisEffet >= ptz.differeMois + 1 && 
                        moisEffet <= ptz.differeMois + ptz.dureeMois)
        ? ptz.montant / (ptz.dureeMois - (ptz.differeMois || 0)) : 0;
    const constantes = fraisTenueMensuel + assuranceFixe + ptzMensuel;
    const k = assuranceSurCI ? 0 : assuranceMensuelle;
    if (mensualiteCible <= constantes) return { R: null, capitalCible: null, reason: 'Non atteignable' };
    if (Math.abs(A + k) < 1e-12) return { R: null, capitalCible: null, reason: 'Non atteignable' };
    const capitalCible = (mensualiteCible - constantes) / (A + k);
    const capitalCibleClamped = Math.max(0, Math.min(capitalCible, crd));
    const R = Math.max(0, crd - capitalCibleClamped);
    return { R, capitalCible: capitalCibleClamped, reason: null };
}

/**
 * Génère le tableau de sensibilité à partir du dernier résultat
 */
function generateSensitivityTable() {
    const result = window.lastLoanResult;
    if (!result?.tableau?.length) return null;
    const { moisRef, indemnitesMois, fraisRenego, tauxRef } = getSensitivityParams();
    if (!Number.isFinite(moisRef) || moisRef < 1 || moisRef > result.tableau.length) return null;
    
    const idxAvant = moisRef - 2;
    const capitalRestantAvant = (idxAvant >= 0) ? result.tableau[idxAvant].capitalRestant : result.capitalInitial;
    const dureeRestante = result.tableau.length - (moisRef - 1);
    if (capitalRestantAvant <= 0 || dureeRestante <= 0) return null;
    
    const assuranceMensuelle = parseFloat(document.getElementById('insurance-rate-slider')?.value || 0) / 100 / 12;
    const assuranceSurCI = document.getElementById('assurance-capital-initial')?.checked || false;
    const capitalInitial = parseFloat(document.getElementById('loan-amount')?.value || 0);
    const fraisTenueMensuel = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710) / (result.dureeInitiale || result.tableau.length);
    
    const enablePTZ = document.getElementById('enable-ptz')?.checked || false;
    let ptz = null;
    if (enablePTZ) {
        const ptzAmount = parseFloat(document.getElementById('ptz-amount')?.value || 0);
        const ptzDurationYears = parseInt(document.getElementById('ptz-duration-slider')?.value || 20);
        const ptzDiffereMois = parseInt(document.getElementById('ptz-differe-slider')?.value || 0);
        if (ptzAmount > 0) {
            ptz = { enabled: true, montant: ptzAmount, dureeMois: ptzDurationYears * 12, differeMois: ptzDiffereMois };
        }
    }
    
    const equivParams = { assuranceMensuelle, assuranceSurCI, capitalInitial, fraisTenueMensuel, ptz, moisRef };
    const rows = [];
    const start = Math.max(0.10, tauxRef - 1.0);
    const step = 0.20;
    const moisEffet = moisRef + 1;
    const MrefCredit = mensualiteCreditSensi(capitalRestantAvant, tauxRef, dureeRestante);
    const assuranceRef = assuranceSurCI ? capitalInitial * assuranceMensuelle : capitalRestantAvant * assuranceMensuelle;
    const ptzMensuelRef = (ptz?.enabled && ptz.montant > 0 && moisEffet >= ptz.differeMois + 1 && moisEffet <= ptz.differeMois + ptz.dureeMois)
        ? ptz.montant / (ptz.dureeMois - (ptz.differeMois || 0)) : 0;
    const Mref = MrefCredit + assuranceRef + fraisTenueMensuel + ptzMensuelRef;
    
    for (let i = 0; i < 11; i++) {
        const taux = +(start + i * step).toFixed(2);
        const Mcredit = mensualiteCreditSensi(capitalRestantAvant, taux, dureeRestante);
        const assurance = assuranceSurCI ? capitalInitial * assuranceMensuelle : capitalRestantAvant * assuranceMensuelle;
        const M = Mcredit + assurance + fraisTenueMensuel + ptzMensuelRef;
        const delta = M - Mref;
        
        let R = 0, reason = null;
        if (delta < -0.01) {
            const equiv = equivalentRepaymentClosedForm(capitalRestantAvant, tauxRef, dureeRestante, M, equivParams);
            R = equiv.R || 0;
            reason = equiv.reason;
        }
        
        const ira = (R > 0) ? computeIRA({ montantRembourse: R, capitalRestantAvant, tauxAnnuel: tauxRef, indemnitesMois }) : 0;
        const coutTotal = (R > 0) ? (R + ira + fraisRenego) : 0;
        
        let breakEven = null;
        if (delta < -0.01 && R > 0) {
            const economie = -delta;
            const coutIRAFrais = ira + fraisRenego;
            breakEven = Math.ceil(coutIRAFrais / economie);
            if (breakEven > dureeRestante) breakEven = 'Non rentable';
        }
        
        rows.push({ taux, mensualite: M, delta, remboursementEquiv: R, ira, fraisRenego, coutTotal, breakEven, reason, isRef: Math.abs(taux - tauxRef) < 0.01 });
    }
    return { rows, meta: { moisRef, capitalRestantAvant, dureeRestante, tauxRef, moisEffet } };
}

/**
 * Affiche le tableau de sensibilité
 */
function renderSensitivityTable(payload) {
    const body = document.getElementById('sensitivity-table-body');
    if (!body) return;
    if (!payload?.rows?.length) {
        body.innerHTML = `<tr><td colspan="7" class="px-3 py-4 text-gray-400 italic text-center">Tableau indisponible.</td></tr>`;
        return;
    }
    const { rows } = payload;
    body.innerHTML = rows.map(r => {
        const rowClass = r.isRef ? 'font-semibold bg-green-500 bg-opacity-20 border-l-4 border-green-400' : '';
        const deltaCls = r.delta < -0.01 ? 'text-green-400' : (r.delta > 0.01 ? 'text-red-400' : 'text-gray-300');
        let breakEvenDisplay = '—';
        if (r.breakEven !== null) {
            if (typeof r.breakEven === 'string') {
                breakEvenDisplay = `<span class="text-red-400">${r.breakEven}</span>`;
            } else {
                const annees = Math.floor(r.breakEven / 12);
                const mois = r.breakEven % 12;
                breakEvenDisplay = annees > 0 ? `${annees}a ${mois}m` : `${r.breakEven} mois`;
            }
        }
        let rembDisplay = '—';
        if (r.reason) rembDisplay = `<span class="text-amber-400 text-xs">${r.reason}</span>`;
        else if (r.remboursementEquiv > 0) rembDisplay = formatMontant(r.remboursementEquiv);
        return `<tr class="${rowClass}">
            <td class="px-3 py-2">${r.taux.toFixed(2)}%</td>
            <td class="px-3 py-2 text-right">${formatMontant(r.mensualite)}</td>
            <td class="px-3 py-2 text-right ${deltaCls}">${r.isRef ? 'Réf.' : (r.delta > 0 ? '+' : '') + formatMontant(r.delta)}</td>
            <td class="px-3 py-2 text-right">${rembDisplay}</td>
            <td class="px-3 py-2 text-right">${r.ira > 0 ? formatMontant(r.ira) : '—'}</td>
            <td class="px-3 py-2 text-right">${r.coutTotal > 0 ? formatMontant(r.coutTotal) : '—'}</td>
            <td class="px-3 py-2 text-right">${breakEvenDisplay}</td>
        </tr>`;
    }).join('');
}

// Wire : événement sur le champ frais renégo
const fraisRenegoInput = document.getElementById('frais-renego');
if (fraisRenegoInput) {
    fraisRenegoInput.addEventListener('change', function() {
        if (window.lastLoanResult) {
            const payload = generateSensitivityTable();
            renderSensitivityTable(payload);
        }
    });
}

// Exposer les fonctions au scope global
window.generateSensitivityTable = generateSensitivityTable;
window.renderSensitivityTable = renderSensitivityTable;

console.log('✅ Module Sensibilité Taux v1.1 chargé (fraisRenego=0 fix)');
    console.log('✅ Simulateur de prêt v2.3.10 initialisé (fraisRenego=0 fix)');
});
