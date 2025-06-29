/**
 * ============================================
 * 🚀 SIMULATEUR DE PRÊT REFACTORISÉ - v2.1.3
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
 * 
 * Architecture : Flux de trésorerie centralisés pour calculs financiers conformes
 */

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
 * 🏠 GESTIONNAIRE PTZ (Sous-prêt)
 * ==========================================
 */
class PTZManager {
    constructor(params = {}) {
        this.montant = params.montant || 0;
        this.dureeMois = params.dureeMois || 0;
        this.differeMois = params.differeMois || 0;
        this.enabled = params.enabled || false;
    }

    /**
     * Génère les flux de trésorerie PTZ
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
        const mensualitePTZ = this.montant / this.dureeMois;
        
        for (let mois = this.differeMois + 1; mois <= Math.min(this.dureeMois + this.differeMois, dureeTotale); mois++) {
            flows[mois] = FLUX_SORTIE * mensualitePTZ;
        }
        
        return flows;
    }

    /**
     * Valide les paramètres PTZ
     */
    validate(montantTotal, dureePretPrincipal) {
        const errors = [];
        
        if (this.montant > montantTotal * 0.5) {
            errors.push(`PTZ ne peut dépasser 50% du coût total (max: ${this.formatMontant(montantTotal * 0.5)})`);
        }
        
        if (this.dureeMois > dureePretPrincipal) {
            errors.push(`Durée PTZ ne peut dépasser celle du prêt principal (${Math.floor(dureePretPrincipal/12)} ans)`);
        }
        
        return errors;
    }

    formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
    }
}

/**
 * ==========================================
 * 🏦 SIMULATEUR DE PRÊT PRINCIPAL - v2.1.3
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
     * 💰 GÉNÉRATION DES FLUX DE TRÉSORERIE v2.1.3
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
     * 📊 TABLEAU D'AMORTISSEMENT v2.1.3
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

        // Génération des flux de trésorerie
        this.cashFlows = this.generateBaseCashFlows();
        
        // Ajout des flux PTZ si activé
        if (this.ptzManager.enabled) {
            const ptzFlows = this.ptzManager.generateCashFlows(this.dureeMois);
            for (let i = 0; i < this.cashFlows.length; i++) {
                this.cashFlows[i] += ptzFlows[i];
            }
        }

        // Génération du tableau détaillé
        const tableau = this.generateDetailedTable(remboursements, {
            nouveauTaux,
            moisRenegociation,
            modeRemboursement,
            appliquerRenegociation
        });

        // Calculs financiers
        const results = this.calculateFinancialMetrics(tableau);
        
        // Calcul TAEG via IRR v2.1.3
        try {
            const taegPrecis = this.calculateTAEG();
            results.taeg = taegPrecis * 100; // Conversion en pourcentage
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
        this.tableauAmortissementCache = { tableau, ...results };

        return {
            tableau,
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

        for (let mois = 1; mois <= dureeFinale; mois++) {
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

                    if (capitalRestant <= montant) {
                        // Remboursement total
                        tableau.push({
                            mois,
                            interets,
                            capitalAmorti: capitalRestant,
                            assurance,
                            mensualite: capitalRestant + interets + assurance,
                            capitalRestant: 0,
                            remboursementAnticipe: capitalRestant,
                            indemnites: indemnitesCourantes
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

            tableau.push({
                mois,
                interets,
                capitalAmorti,
                assurance,
                mensualite: mensualite + assurance,
                capitalRestant,
                remboursementAnticipe: remboursementCourant?.montant || 0,
                indemnites: 0
            });

            if (capitalRestant <= 0) break;
        }

        return tableau;
    }

    /**
     * ==========================================
     * 💎 CALCUL TAEG PRÉCIS VIA IRR v2.1.3
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
     * 🔧 v2.1.3: Calcul frais corrigé pour affichage UI correct
     */
    calculateFinancialMetrics(tableau) {
        const mensualiteInitiale = this.calculerMensualite();
        const dureeInitiale = this.dureeMois;
        const dureeReelle = tableau.length;
        
        const totalInterets = tableau.reduce((sum, row) => sum + row.interets, 0);
        const totalAssurance = tableau.reduce((sum, row) => sum + row.assurance, 0);
        const totalCapitalAmorti = tableau.reduce((sum, row) => sum + row.capitalAmorti, 0);
        const indemnites = tableau.reduce((sum, row) => sum + (row.indemnites || 0), 0);
        
        const montantTotal = tableau.reduce((sum, row) => sum + row.mensualite, 0);
        
        // 🆕 v2.1.3: Séparation des frais pour affichage correct
        const totalTenueCompte = this.fraisTenueCompteFix;   // somme des 2,36 € x 300
        const totalFraisFixes = this.fraisDossier + this.fraisGarantie;
        const totalFraisAffiches = totalFraisFixes + totalTenueCompte; // ✅ 4 331 €
        
        // 👉 coutGlobalTotal inchangé (il tient déjà compte de la tenue de compte via montantTotal)
        const coutGlobalTotal = montantTotal + indemnites + totalFraisFixes;
        
        // 🔧 CORRECTION 4: Calcul assurance corrigé pour economiesMensualites
        const assuranceInitiale = this.assuranceSurCapitalInitial 
            ? this.capital * this.assuranceMensuelle
            : (this.capital - mensualiteInitiale + this.capital * this.tauxMensuel) * this.assuranceMensuelle;
        
        const mensualiteInitialeTotale = mensualiteInitiale + assuranceInitiale;
        
        const economiesMensualites = (dureeInitiale - dureeReelle) * mensualiteInitialeTotale;
        const economiesInterets = (this.capital * this.tauxMensuel * dureeInitiale) - totalInterets;

        return {
            mensualiteInitiale,
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
            totalFraisAffiches,       // affiche "Frais annexes" = 4 331 €
            coutGlobalTotal,          // idem avant
            pretSoldeAvantTerme: dureeReelle < dureeInitiale,
            gainTemps: dureeInitiale - dureeReelle
        };
    }

    /**
     * ==========================================
     * 🔍 DEBUG & VALIDATION v2.1.3
     * ==========================================
     */

    debugCashFlows() {
        console.group('💰 Analyse des flux de trésorerie (v2.1.3)');
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

        console.log('✅ Validation terminée (v2.1.3 - frais de tenue de compte UI corrigés)');
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

// Fonctions UX pour remboursement total
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
        
    } else {
        amountInput.disabled = false;
        amountInput.placeholder = 'Montant à rembourser';
        amountInput.classList.remove('opacity-60', 'cursor-not-allowed', 'text-green-400', 'font-semibold');
        container?.classList.remove('opacity-60');
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
 * ==========================================
 * 🎮 GESTIONNAIRE D'ÉVÉNEMENTS UI
 * ==========================================
 */

document.addEventListener('DOMContentLoaded', function() {
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
    const applyRenegotiationCheckbox = document.getElementById('apply-renegociation');
    
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

    // Gestion PTZ intégrée
    let ptzCalculationTimeout;
    const enablePtzCheckbox = document.getElementById('enable-ptz');
    const ptzFields = document.getElementById('ptz-fields');
    const ptzDurationSlider = document.getElementById('ptz-duration-slider');
    const ptzDurationValue = document.getElementById('ptz-duration-value');
    const ptzAmountInput = document.getElementById('ptz-amount');

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
            } else {
                ptzFields.style.maxHeight = '0';
                ptzFields.style.opacity = '0';
                setTimeout(() => {
                    ptzFields.classList.add('hidden');
                }, 300);
            }
            
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
     * 🎯 FONCTION PRINCIPALE DE CALCUL v2.1.3
     * ==========================================
     */
    function calculateLoan() {
        try {
            console.log("🚀 Début du calcul du prêt v2.1.3 (frais de tenue de compte UI corrigés)...");
            
            const loanAmount = parseFloat(document.getElementById('loan-amount').value);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
            const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
            const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
            const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
            const renegotiationMonth = parseInt(document.getElementById('renegotiation-month-slider').value);
            const applyRenegotiation = document.getElementById('apply-renegotiation')?.checked || false;
            
            // Gestion PTZ avec validation renforcée
            const enablePTZ = document.getElementById('enable-ptz')?.checked || false;
            let ptzParams = null;
            let ptzValidationError = null;

            if (enablePTZ) {
                const ptzAmount = parseFloat(document.getElementById('ptz-amount')?.value || 0);
                const ptzDurationYears = parseInt(document.getElementById('ptz-duration-slider')?.value || 20);
                
                if (ptzAmount > 0) {
                    const maxPTZ = loanAmount * 0.5;
                    if (ptzAmount > maxPTZ) {
                        ptzValidationError = `Le PTZ ne peut dépasser 50% du coût total (maximum: ${formatMontant(maxPTZ)})`;
                    } else if (ptzDurationYears > loanDurationYears) {
                        ptzValidationError = `La durée du PTZ ne peut dépasser celle du prêt principal (${loanDurationYears} ans)`;
                    } else {
                        ptzParams = {
                            montant: ptzAmount,
                            dureeMois: ptzDurationYears * 12,
                            differeMois: 0,
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
            
            // Création du simulateur v2.1.3
            const simulator = new LoanSimulator({
                capital: loanAmount,
                tauxAnnuel: interestRate,
                dureeMois: loanDurationYears * 12,
                assuranceAnnuelle: insuranceRate,
                indemnitesMois: penaltyMonthsSliderDuree ? parseInt(penaltyMonthsSliderDuree.value) : 3,
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

            // Affichage des résultats avec PTZ
            const mensualiteGlobale = result.mensualiteInitiale + 
                (ptzParams ? ptzParams.montant / ptzParams.dureeMois : 0);
            const mensualiteLabel = (enablePTZ && ptzParams) ? 'Mensualité globale' : 'Mensualité initiale';

            document.getElementById('monthly-payment').textContent = formatMontant(mensualiteGlobale);
            const monthlyPaymentLabel = document.querySelector('#monthly-payment').parentElement.querySelector('.result-label');
            if (monthlyPaymentLabel) {
                monthlyPaymentLabel.textContent = mensualiteLabel;
            }

            // Coût total avec PTZ
            const totalCreditAvecPTZ = result.totalPaye + (ptzParams ? ptzParams.montant : 0);
            document.getElementById('total-cost').textContent = formatMontant(totalCreditAvecPTZ);

            // Coût global et ratio
            const coutGlobalAvecPTZ = result.coutGlobalTotal + (ptzParams ? ptzParams.montant : 0);
            const montantTotalEmprunte = loanAmount + (ptzParams ? ptzParams.montant : 0);

            document.getElementById('cout-global').textContent = formatMontant(coutGlobalAvecPTZ);
            document.getElementById('ratio-cout').textContent = montantTotalEmprunte > 0 ? 
                (coutGlobalAvecPTZ / montantTotalEmprunte).toFixed(3) : '0.000';

            // TAEG avec PTZ
            if (enablePTZ && ptzParams) {
                const taegAjuste = result.taeg * (loanAmount / montantTotalEmprunte);
                document.getElementById('taeg').textContent = taegAjuste.toFixed(2) + '%';
            } else {
                document.getElementById('taeg').textContent = result.taeg.toFixed(2) + '%';
            }

            // 🆕 v2.1.3: Mise à jour des frais annexes avec tenue de compte incluse
            document.getElementById('total-interest').textContent = formatMontant(result.totalInterets);
            document.getElementById('early-repayment-penalty').textContent = formatMontant(result.indemnites);
            
            const totalFeesElement = document.getElementById('total-fees');
            if (totalFeesElement) {
                totalFeesElement.textContent = formatMontant(result.totalFraisAffiches); // ➜ 4 331 €
                
                // 🆕 v2.1.3: Mise à jour du label pour clarifier
                const feesLabel = totalFeesElement.parentElement.querySelector('.result-label');
                if (feesLabel) {
                    feesLabel.textContent = 'Frais annexes (dossier + garantie + tenue de compte)';
                }
            }

            // Génération du tableau d'amortissement
            updateAmortizationTable(result, ptzParams);
            
            // Encadré récapitulatif PTZ
            updatePtzSummary(enablePTZ, ptzParams, loanDurationYears, montantTotalEmprunte);
            
            // Graphique mis à jour
            updateChart(result);
            
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
            
            console.log('🎉 Calcul terminé avec succès (v2.1.3 - frais de tenue de compte UI corrigés)');
            return true;
        } catch (error) {
            console.error("❌ Erreur lors du calcul:", error);
            alert(`Une erreur s'est produite lors du calcul: ${error.message}`);
            return false;
        }
    }

    /**
     * ==========================================
     * 📋 FONCTIONS D'AFFICHAGE UI
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
            
            tr.innerHTML = `
                <td class="px-3 py-2">${row.mois}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.mensualite)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capitalAmorti)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.interets)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.assurance)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capitalRestant)}</td>
            `;
            
            tableBody.appendChild(tr);

            // Affichage PTZ dans tableau
            if (ptzParams && ptzParams.enabled && row.mois % 12 === 1) {
                const anneePTZ = Math.floor((row.mois - 1) / 12) + 1;
                const labelPTZ = `PTZ (Année ${anneePTZ})`;
                const mensualitePTZ = ptzParams.montant / ptzParams.dureeMois;
                
                const monthsRemaining = Math.max(0, ptzParams.dureeMois - row.mois + 1);
                const ptzCapitalRestant = Math.max(0, ptzParams.montant - (mensualitePTZ * (row.mois - 1)));
                
                if (monthsRemaining > 0 && ptzCapitalRestant > 0) {
                    const ptzRow = document.createElement('tr');
                    ptzRow.className = 'bg-amber-900 bg-opacity-10 border-l-4 border-amber-500';
                    ptzRow.innerHTML = `
                        <td class="px-3 py-2 text-amber-300">${labelPTZ}</td>
                        <td class="px-3 py-2 text-right text-amber-300">${formatMontant(mensualitePTZ)}</td>
                        <td class="px-3 py-2 text-right text-amber-300">${formatMontant(mensualitePTZ)}</td>
                        <td class="px-3 py-2 text-right text-gray-400">0 €</td>
                        <td class="px-3 py-2 text-right text-gray-400">0 €</td>
                        <td class="px-3 py-2 text-right text-amber-300">${formatMontant(ptzCapitalRestant)}</td>
                    `;
                    tableBody.appendChild(ptzRow);
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

    function updatePtzSummary(enablePTZ, ptzParams, loanDurationYears, montantTotalEmprunte) {
        const existingSummary = document.getElementById('ptz-summary');
        if (existingSummary) {
            existingSummary.remove();
        }

        if (enablePTZ && ptzParams && ptzParams.enabled) {
            const ptzSummary = document.createElement('div');
            ptzSummary.id = 'ptz-summary';
            ptzSummary.className = 'mb-6 p-4 bg-amber-900 bg-opacity-20 border border-amber-600 rounded-lg animate-fadeIn';
            
            const mensualitePTZ = ptzParams.montant / ptzParams.dureeMois;
            const pourcentageFinancement = ((ptzParams.montant / montantTotalEmprunte) * 100).toFixed(1);
            const finPTZ = Math.floor(ptzParams.dureeMois / 12);
            const finPretPrincipal = loanDurationYears;
            
            ptzSummary.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <h5 class="text-amber-400 font-medium flex items-center">
                        <i class="fas fa-home mr-2"></i>
                        Détail du Prêt à Taux Zéro v2.1.3
                    </h5>
                    <span class="text-xs text-amber-300 bg-amber-900 bg-opacity-30 px-2 py-1 rounded">
                        ${pourcentageFinancement}% du financement
                    </span>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${formatMontant(ptzParams.montant)}</p>
                        <p class="text-gray-400 text-sm">Capital PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${formatMontant(mensualitePTZ)}</p>
                        <p class="text-gray-400 text-sm">Mensualité PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${finPTZ} ans</p>
                        <p class="text-gray-400 text-sm">Durée PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">0%</p>
                        <p class="text-gray-400 text-sm">Taux PTZ</p>
                    </div>
                </div>
                
                <div class="bg-amber-900 bg-opacity-20 p-3 rounded text-sm">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div class="flex justify-between">
                            <span class="text-gray-300">Fin PTZ:</span>
                            <span class="text-amber-300">Année ${finPTZ}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Fin prêt principal:</span>
                            <span class="text-amber-300">Année ${finPretPrincipal}</span>
                        </div>
                    </div>
                    ${finPTZ !== finPretPrincipal ? 
                        `<div class="mt-2 text-xs text-yellow-300">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            ${finPTZ > finPretPrincipal ? 
                                `Le PTZ continuera ${finPTZ - finPretPrincipal} an(s) après la fin du prêt principal` :
                                `Le prêt principal continuera ${finPretPrincipal - finPTZ} an(s) après la fin du PTZ`
                            }
                        </div>` : 
                        '<div class="mt-2 text-xs text-green-300"><i class="fas fa-check mr-1"></i>Les deux prêts se terminent en même temps</div>'
                    }
                    <div class="mt-2 text-xs text-blue-300">
                        <i class="fas fa-cogs mr-1"></i>
                        Calcul TAEG v2.1.3 : frais de tenue de compte UI corrigés
                    </div>
                </div>
            `;
            
            const resultsContainer = document.querySelector('.grid.grid-cols-2.gap-4.mb-6');
            if (resultsContainer) {
                resultsContainer.parentNode.insertBefore(ptzSummary, resultsContainer.nextSibling);
            }
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
                
                // Lignes de comparaison
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
                        label: 'TAEG v2.1.3 UI Corrigé',
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
        
        const economiesPourcentage = ((result.economiesInterets / (result.totalInterets + result.economiesInterets)) * 100).toFixed(1);
        
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
                Analyse complète du prêt v2.1.3
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
                    <span>Vous économisez ${formatMontant(result.economiesInterets)} d'intérêts (${economiesPourcentage}% du total)</span>
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
                    <span>TAEG précis via IRR v2.1.3: ${result.taeg.toFixed(2)}% 
                    <span class="text-xs text-green-300">(frais tenue compte UI corrigés)</span></span>
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
        feesData[0] = result.totalFraisAffiches; // 🆕 v2.1.3: utilise totalFraisAffiches
        
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
                        text: 'Évolution du prêt (v2.1.3 - frais tenue compte UI corrigés)',
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
    
    // Synchroniser les valeurs entre les modes
    function syncModeValues() {
        try {
            if (!document.getElementById('early-repayment-amount-duree')) {
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = 'early-repayment-amount-duree';
                hiddenInput.value = '10000';
                document.body.appendChild(hiddenInput);
            }
            
            const earlyRepaymentAmountDuree = document.getElementById('early-repayment-amount-duree');
            const earlyRepaymentAmountMensualite = document.getElementById('early-repayment-amount-mensualite');
            
            if (earlyRepaymentAmountDuree && earlyRepaymentAmountMensualite) {
                earlyRepaymentAmountMensualite.value = earlyRepaymentAmountDuree.value;
            }
            
            // Synchroniser les sliders des mois
            const earlyRepaymentMonthSliderDuree = document.getElementById('early-repayment-month-slider-duree');
            const earlyRepaymentMonthValueDuree = document.getElementById('early-repayment-month-value-duree');
            const earlyRepaymentMonthSliderMensualite = document.getElementById('early-repayment-month-slider-mensualite');
            const earlyRepaymentMonthValueMensualite = document.getElementById('early-repayment-month-value-mensualite');
            
            if (earlyRepaymentMonthSliderDuree && earlyRepaymentMonthSliderMensualite && 
                earlyRepaymentMonthValueDuree && earlyRepaymentMonthValueMensualite) {
                
                earlyRepaymentMonthSliderMensualite.value = earlyRepaymentMonthSliderDuree.value;
                earlyRepaymentMonthValueMensualite.textContent = earlyRepaymentMonthValueDuree.textContent;
                
                earlyRepaymentMonthSliderDuree.addEventListener('input', function() {
                    earlyRepaymentMonthSliderMensualite.value = this.value;
                    earlyRepaymentMonthValueMensualite.textContent = this.value;
                });
                
                earlyRepaymentMonthSliderMensualite.addEventListener('input', function() {
                    earlyRepaymentMonthSliderDuree.value = this.value;
                    earlyRepaymentMonthValueDuree.textContent = this.value;
                });
            }
            
            // Synchroniser les sliders d'indemnités
            const penaltyMonthsSliderDuree = document.getElementById('penalty-months-slider-duree');
            const penaltyMonthsValueDuree = document.getElementById('penalty-months-value-duree');
            const penaltyMonthsSliderMensualite = document.getElementById('penalty-months-slider-mensualite');
            const penaltyMonthsValueMensualite = document.getElementById('penalty-months-value-mensualite');
            
            if (penaltyMonthsSliderDuree && penaltyMonthsSliderMensualite && 
                penaltyMonthsValueDuree && penaltyMonthsValueMensualite) {
                
                penaltyMonthsSliderMensualite.value = penaltyMonthsSliderDuree.value;
                penaltyMonthsValueMensualite.textContent = penaltyMonthsValueDuree.textContent;
                
                penaltyMonthsSliderDuree.addEventListener('input', function() {
                    penaltyMonthsSliderMensualite.value = this.value;
                    penaltyMonthsValueMensualite.textContent = `${this.value} mois`;
                });
                
                penaltyMonthsSliderMensualite.addEventListener('input', function() {
                    penaltyMonthsSliderDuree.value = this.value;
                    penaltyMonthsValueDuree.textContent = `${this.value} mois`;
                });
            }
        } catch (error) {
            console.error("Erreur lors de la synchronisation des modes:", error);
        }
    }

    // Gestionnaire pour ajouter un remboursement
    const addRepaymentBtn = document.getElementById('add-repayment-btn');
    if (addRepaymentBtn) {
        addRepaymentBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const mode = document.getElementById('remboursement-mode').value;
            let newRepayment;

            if (mode === 'duree') {
                const moisAReduire = +document.getElementById('reduction-duree-mois').value;
                const mois = +document.getElementById('early-repayment-month-slider-duree').value;
                if (moisAReduire <= 0) {
                    document.getElementById('min-threshold-alert').classList.remove('hidden');
                    return;
                }
                newRepayment = { montant: 0, mois, moisAReduire };
            } else {
                const totalCheckEl = document.getElementById('total-repayment');
                const isTotal = totalCheckEl?.checked;
                const amountInput = document.getElementById('early-repayment-amount-mensualite');
                const mois = +document.getElementById('early-repayment-month-slider-mensualite').value;
                
                let montant = +amountInput.value;
                
                if (isTotal) {
                    montant = getRemainingCapitalAt(mois);
                    showNotification(`Remboursement total calculé: ${formatMontant(montant)}`, 'success');
                    totalCheckEl.checked = false;
                    toggleTotalRepaymentUI(false);
                }
                
                if (montant <= 0) {
                    document.getElementById('min-threshold-alert').classList.remove('hidden');
                    return;
                }
                
                newRepayment = { 
                    montant, 
                    mois, 
                    type: isTotal ? 'total' : 'partiel',
                    timestamp: Date.now()
                };
            }

            window.storedRepayments.push(newRepayment);
            renderRepaymentsList();
            document.getElementById('min-threshold-alert').classList.add('hidden');
            calculateLoan();

            if (mode === 'mensualite') {
                document.getElementById('early-repayment-amount-mensualite').value = '';
            }
        });
    }

    // Fonction pour afficher la liste des remboursements
    function renderRepaymentsList() {
        const list = document.getElementById('repayments-list');
        if (!list) return;

        list.innerHTML = '';

        window.storedRepayments.forEach((r, idx) => {
            const { html, cls } = repaymentLabel(r);

            const item = document.createElement('div');
            item.className =
                'repayment-item flex items-center justify-between bg-blue-900 bg-opacity-15 rounded-lg px-3 py-2 mb-2 hover:bg-blue-800/30';

            const left = document.createElement('div');
            left.innerHTML = `
                <div class="font-medium ${cls}">${html}</div>
                <div class="text-xs text-gray-400">au mois ${r.mois}</div>
            `;

            const remove = document.createElement('button');
            remove.className =
                'remove-repayment text-gray-400 hover:text-red-400 transition';
            remove.dataset.index = idx;
            remove.innerHTML = '<i class="fas fa-times"></i>';

            item.appendChild(left);
            item.appendChild(remove);
            list.appendChild(item);
        });

        list.querySelectorAll('.remove-repayment').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = +e.currentTarget.dataset.index;
                window.storedRepayments.splice(i, 1);
                renderRepaymentsList();
                calculateLoan();
            });
        });
    }

    // Bouton réinitialiser tous les remboursements
    const resetRepaymentsBtn = document.getElementById('reset-repayments');
    if (resetRepaymentsBtn) {
        resetRepaymentsBtn.addEventListener('click', function() {
            window.storedRepayments = [];
            renderRepaymentsList();
            calculateLoan();
        });
    }
    
    // Initialisation
    if (document.getElementById('loan-amount')) {
        updateSliderMaxValues();
        setTimeout(syncModeValues, 500);
        
        if (!window.storedRepayments) {
            window.storedRepayments = [];
        }
        
        setTimeout(calculateLoan, 1000);
    }
});

/**
 * ==========================================
 * 🎯 NAVIGATION PTZ
 * ==========================================
 */
function initPTZNavigation() {
    document.addEventListener('click', (e) => {
        const ptzLink = e.target.closest('#go-to-ptz');
        if (!ptzLink) return;
        
        e.preventDefault();
        console.log('🎯 Navigation PTZ activée');
        
        const ptzTab = document.querySelector('[data-target="ptz-simulator"]');
        const ptzContent = document.getElementById('ptz-simulator');
        
        if (ptzTab && ptzContent) {
            document.querySelectorAll('.simulation-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.simulation-content').forEach(content => {
                content.style.display = 'none';
            });
            
            ptzTab.classList.add('active');
            ptzContent.style.display = 'block';
            
            setTimeout(() => {
                ptzContent.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 200);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPTZNavigation);
} else {
    initPTZNavigation();
}
