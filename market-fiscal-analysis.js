/**
 * market-fiscal-analysis.js
 * Module d'intégration pour l'analyse de marché et la comparaison fiscale
 * Complète la page comparaison-fiscale.html
 * Version 3.0 - Corrections complètes
 */

// Constantes fiscales
const FISCAL_CONSTANTS = {
    // Taux
    PRELEVEMENTS_SOCIAUX: 0.172,
    IS_TAUX_REDUIT: 0.15,
    IS_PLAFOND_REDUIT: 42500,
    
    // Abattements
    MICRO_FONCIER_ABATTEMENT: 0.30,
    MICRO_BIC_ABATTEMENT: 0.50,
    MICRO_BIC_ABATTEMENT_71: 0.71,
    
    // Plafonds
    MICRO_FONCIER_PLAFOND: 15000,
    MICRO_BIC_PLAFOND: 72600,
    MICRO_BIC_PLAFOND_CHAMBRE: 176200,
    DEFICIT_FONCIER_MAX: 10700,
    
    // Amortissement
    LMNP_TAUX_AMORTISSEMENT_BIEN: 0.025,
    LMNP_TAUX_AMORTISSEMENT_MOBILIER: 0.10,
    LMNP_PART_MOBILIER: 0.10,
    LMNP_PART_TERRAIN: 0.10,  
    
    // Durées
    DUREE_AMORTISSEMENT_BIEN: 40,
    DUREE_AMORTISSEMENT_MOBILIER: 10
};

/**
 * UNITS_CONTRACT - Documentation des unités utilisées
 * IMPORTANT: Tout ce qui est "/ mois" doit finir ×12 avant comparaison fiscale
 */
const UNITS_CONTRACT = {
    // MENSUEL (€/mois)
    loyerHC: '€/mois',
    monthlyCharges: '€/mois',
    chargesCoproNonRecup: '€/mois',
    assurancePNO: '€/mois',
    
    // ANNUEL (€/an)
    taxeFonciere: '€/an',
    entretienAnnuel: '€/an',
    fraisGestion: '€/an',
    
    // POURCENTAGES (%)
    vacanceLocative: '%',
    gestionLocativeTaux: '%',
    tmi: '%'
};

class MarketFiscalAnalyzer {
    constructor() {
        this.simulateur = new SimulateurImmo();
        this.comparateur = new FiscalComparator(this.simulateur);
        this.propertyData = null;
        this.marketAnalysis = null;
           // Constante pour le vrai signe minus
        this.SIGN_MINUS = '−'; // U+2212 (pas un tiret simple !)
    }
    
    /**
     * Convertit une valeur en nombre, gère TOUS les formats français
     * @param {any} val - Valeur à convertir ("−1 234,56 €", "1.234,56", etc.)
     * @returns {number} - Nombre parsé ou 0
     */
    toFloat(val) {
        if (typeof val === 'number') return val || 0;
        if (!val) return 0;
        
        // 🔒 Conversion bulletproof pour format français
        const cleaned = String(val)
            .replace(/\u00A0/g, '')    // NBSP (espace insécable)
            .replace(/\u2212/g, '-')   // U+2212 (vrai minus) → tiret ASCII
            .replace(/\s/g, '')        // tous les espaces
            .replace(/[€$]/g, '')      // symboles monétaires
            .replace(/\./g, '')        // points (séparateurs de milliers)
            .replace(',', '.');        // virgule → point décimal
        
        return parseFloat(cleaned) || 0; // parseFloat plus tolérant que Number
    }
    
    /**
     * Formate un montant avec le bon signe et la bonne classe CSS
     * @param {any} value - Valeur à formater
     * @param {boolean} showSign - Afficher le signe +/−
     * @returns {object} { className, formattedValue, isPositive, numValue }
     */
    formatAmountWithClass(value, showSign = true) {
        const numValue = this.toFloat(value); // Utilise notre helper bulletproof
        const isPositive = numValue >= 0;
        const absValue = Math.abs(numValue);
        
        let formattedValue = this.formatCurrency(absValue);
        if (showSign) {
            formattedValue = (isPositive ? '+' : this.SIGN_MINUS) + formattedValue;
        }
        
        return {
            className: isPositive ? 'positive' : 'negative',
            formattedValue,
            isPositive,
            numValue,
            rawValue: numValue
        };
    }

    /**
     * Effectue l'analyse complète (marché + fiscal) - V3 CORRIGÉE
     */
    async performCompleteAnalysis(data) {
        try {
            // 1. Analyse de marché
            this.marketAnalysis = this.analyzeMarketPosition(data);
            
            // 2. Préparation des données
            const fiscalData = this.prepareFiscalData(data);
            const comparatorData = this.prepareFiscalDataForComparator(fiscalData);
            
// 3. Créer un pseudo-résultat sans tableau d'amortissement
const baseResults = {
    // Mensualité déjà calculée dans prepareFiscalData
    mensualite: comparatorData.chargeMensuelleCredit || 
                this.calculateMonthlyPayment(
                    comparatorData.loanAmount,
                    comparatorData.loanRate,
                    comparatorData.loanDuration
                ),
    
    // Pas de tableau → force la formule analytique
    tableauAmortissement: null
};

// 4. Propager la mensualité pour le comparateur
comparatorData.chargeMensuelleCredit = baseResults.mensualite;
            
            // 5. Enrichir comparatorData avec les résultats du simulateur
            comparatorData.chargeMensuelleCredit = baseResults.mensualite;
            comparatorData.tableauAmortissement = baseResults.tableauAmortissement;
            
            // 6. Comparaison des régimes avec l'adaptateur
            const fiscalResults = await this.comparateur.compareAllRegimes(comparatorData);
            
            // 7. Enrichir les résultats avec les calculs détaillés différenciés
            const params = this.getAllAdvancedParams();
            fiscalResults.forEach(regime => {
                const detailedCalc = this.getDetailedCalculations(regime, fiscalData, params, baseResults);
                
                // Remplacer par les valeurs détaillées plus précises
                regime.cashflowNetAnnuel = detailedCalc.cashflowNetAnnuel;
                regime.cashflowMensuel = detailedCalc.cashflowNetAnnuel / 12;
                regime.impotAnnuel = -(detailedCalc.totalImpots);
                regime.rendementNet = (detailedCalc.cashflowNetAnnuel / fiscalData.price) * 100;
                
                // Ajouter les détails pour le debug
                regime._detailedCalc = detailedCalc;
            });
            
            return {
                market: this.marketAnalysis,
                fiscal: fiscalResults,
                recommendations: this.generateGlobalRecommendations(this.marketAnalysis, fiscalResults)
            };
            
        } catch (error) {
            console.error('Erreur dans performCompleteAnalysis:', error);
            throw error;
        }
    }

    /**
     * Prépare les données pour le comparateur fiscal - V3 COMPLÈTE
     */
    prepareFiscalDataForComparator(rawData) {
        // Calcul du loyer brut annuel AVANT l'appel au simulateur
        const loyerMensuelTotal = rawData.loyerHC + (rawData.monthlyCharges || 50);
        const loyerBrutAnnuel = loyerMensuelTotal * 12;
        
        return {
            // Prix et financement
            prixBien: rawData.price,
            apport: rawData.apport,
            duree: rawData.loanDuration,
            taux: rawData.loanRate,
            
            // Revenus - V3: Distinction HC/CC pour plafonds
            loyerMensuel: rawData.loyerHC,
            loyerBrutHC: rawData.loyerHC * 12,                 // Pour les plafonds fiscaux
            loyerBrutCC: loyerBrutAnnuel,                      // Pour l'analyse cash-flow
            loyerBrut: loyerBrutAnnuel,                        // Compatibilité
            chargesCopro: rawData.monthlyCharges || 50,
            
            // Charges - V3: chargesNonRecuperables en ANNUEL
            taxeFonciere: rawData.taxeFonciere || 800, // Annuel
            vacanceLocative: rawData.vacanceLocative || 0,
            gestionLocativeTaux: rawData.gestionLocativeTaux || 0, // TAUX numérique
            chargesNonRecuperables: (rawData.chargesCoproNonRecup || 50) * 12, // V3: ANNUEL
            
            // Divers
            surface: rawData.surface,
            typeAchat: rawData.typeAchat,
            tmi: rawData.tmi,
            
            // Charges annuelles
            entretienAnnuel: rawData.entretienAnnuel || 500,
            assurancePNO: (rawData.assurancePNO || 15) * 12,
            
            // Calculé après le simulateur
            chargeMensuelleCredit: rawData.monthlyPayment || 0,
            
            // Travaux
            travauxRenovation: rawData.travauxRenovation || 0,
            
            // Pour compatibilité avec le simulateur
            montantEmprunt: rawData.loanAmount,
            fraisBancaires: rawData.fraisBancairesDossier + rawData.fraisBancairesCompte,
            fraisGarantie: rawData.fraisGarantie
        };
    }

    /**
     * Analyse la position sur le marché
     */
    analyzeMarketPosition(data) {
        const result = {
            hasMarketData: !!data.ville,
            priceAnalysis: {},
            rentAnalysis: {},
            globalScore: 0
        };

        if (data.ville) {
            const marketPriceM2 = data.ville.prix_m2;
            const marketRentM2 = data.ville.loyer_m2;
            
            // Analyse du prix
            const priceDiff = ((data.prixM2Paye - marketPriceM2) / marketPriceM2) * 100;
            result.priceAnalysis = {
                userPrice: data.prixM2Paye,
                marketPrice: marketPriceM2,
                difference: priceDiff,
                position: this.getPricePosition(priceDiff),
                savings: (marketPriceM2 - data.prixM2Paye) * data.surface
            };
            
            // Analyse du loyer - Comparer en CC
            const loyerCCM2 = (data.loyerActuel + data.charges) / data.surface;
            const rentDiff = ((loyerCCM2 - marketRentM2) / marketRentM2) * 100;
            result.rentAnalysis = {
                userRent: data.loyerM2Actuel,
                userRentCC: loyerCCM2,
                marketRent: marketRentM2,
                difference: rentDiff,
                position: this.getRentPosition(rentDiff),
                potential: (marketRentM2 - loyerCCM2) * data.surface
            };
            
            // Score global (0-100)
            const priceScore = Math.max(0, 50 - Math.abs(priceDiff));
            const rentScore = Math.max(0, 50 + (rentDiff / 2));
            result.globalScore = (priceScore + rentScore) / 2;
        }
        
        return result;
    }

    /**
     * Détermine la position du prix
     */
    getPricePosition(diff) {
        if (diff < -15) return 'excellent';
        if (diff < -5) return 'good';
        if (diff < 5) return 'average';
        if (diff < 15) return 'high';
        return 'overpriced';
    }

    /**
     * Détermine la position du loyer
     */
    getRentPosition(diff) {
        if (diff > 15) return 'excellent';
        if (diff > 5) return 'good';
        if (diff > -5) return 'average';
        if (diff > -15) return 'low';
        return 'underpriced';
    }

    /**
     * Récupère tous les paramètres avancés du formulaire - VERSION COMPLÈTE
     */
    getAllAdvancedParams() {
        return {
            // Communs
            fraisBancairesDossier: parseFloat(document.getElementById('frais-bancaires-dossier')?.value) || 900,
            fraisBancairesCompte: parseFloat(document.getElementById('frais-bancaires-compte')?.value) || 150,
            fraisGarantie: parseFloat(document.getElementById('frais-garantie')?.value) || 1.3709,
            taxeFonciere: parseFloat(document.getElementById('taxeFonciere')?.value) || 800,
            vacanceLocative: parseFloat(document.getElementById('vacanceLocative')?.value ?? 0),
            gestionLocativeTaux: parseFloat(document.getElementById('gestionLocative')?.value) || 0,
            // NOUVEAU : Séparer travaux et entretien
            travauxRenovation: parseFloat(document.getElementById('travaux-renovation')?.value) || 0,
            entretienAnnuel: parseFloat(document.getElementById('entretien-annuel')?.value) || 500,
            assurancePNO: parseFloat(document.getElementById('assurance-pno')?.value) || 15,
            // NOUVEAU : Charges de copropriété non récupérables
            chargesCoproNonRecup: parseFloat(document.getElementById('charges-copro-non-recup')?.value) || 50,
            
            // Spécifiques classique
            fraisNotaireTaux: parseFloat(document.getElementById('frais-notaire-taux')?.value) || 8,
            commissionImmo: parseFloat(document.getElementById('commission-immo')?.value) || 4,
            
            // Spécifiques enchères - BASE
            droitsEnregistrement: parseFloat(document.getElementById('droits-enregistrement')?.value) || 5.70,
            coefMutation: parseFloat(document.getElementById('coef-mutation')?.value) || 2.37,
            honorairesAvocat: parseFloat(document.getElementById('honoraires-avocat')?.value) || 1500,
            fraisFixes: parseFloat(document.getElementById('frais-fixes')?.value) || 50,
            
            // NOUVEAU : Enchères - Émoluments par tranches
            emolumentsTranche1: parseFloat(document.getElementById('emoluments-tranche1')?.value) || 7,
            emolumentsTranche2: parseFloat(document.getElementById('emoluments-tranche2')?.value) || 3,
            emolumentsTranche3: parseFloat(document.getElementById('emoluments-tranche3')?.value) || 2,
            emolumentsTranche4: parseFloat(document.getElementById('emoluments-tranche4')?.value) || 1,
            
            // NOUVEAU : Enchères - Autres frais détaillés
            honorairesAvocatCoef: parseFloat(document.getElementById('honoraires-avocat-coef')?.value) || 0.25,
            tvaHonoraires: parseFloat(document.getElementById('tva-honoraires')?.value) || 20,
            publiciteFonciere: parseFloat(document.getElementById('publicite-fonciere')?.value) || 0.10,
            avocatPorterEnchere: parseFloat(document.getElementById('avocat-porter-enchere')?.value) || 300,
            suiviDossier: parseFloat(document.getElementById('suivi-dossier')?.value) || 1200,
            cautionMisePrix: parseFloat(document.getElementById('caution-mise-prix')?.value) || 5,
            cautionRestituee: document.getElementById('caution-restituee')?.checked ?? true
        };
    }

    /**
     * Calcule les intérêts annuels avec précision - V3
     */
calculateAnnualInterests(inputData, baseResults, year = 1) {
    // 1️⃣ Cas idéal : on dispose du tableau d'amortissement précis
    if (baseResults?.tableauAmortissement?.length >= 12) {
        const start = (year - 1) * 12;
        const end = Math.min(year * 12, baseResults.tableauAmortissement.length);
        return baseResults.tableauAmortissement
            .slice(start, end)
            .reduce((sum, m) => sum + (m.interets || 0), 0);
    }

    // 2️⃣ Approximation analytique avec formule actuarielle (sans tableau)
    const r = (inputData.loanRate / 100) / 12;  // taux mensuel
    const M = this.calculateMonthlyPayment(
        inputData.loanAmount,
        inputData.loanRate,
        inputData.loanDuration
    );
    
    const n0 = (year - 1) * 12;  // nombre de mois déjà écoulés
    const n1 = Math.min(year * 12, inputData.loanDuration * 12);  // fin d'année
    
    // Formule actuarielle exacte du capital restant dû après n mensualités
    const CRD = (n) => {
        if (n === 0) return inputData.loanAmount;
        if (n >= inputData.loanDuration * 12) return 0;
        
        return inputData.loanAmount * Math.pow(1 + r, n) - 
               M * (Math.pow(1 + r, n) - 1) / r;
    };
    
    // Capital restant dû au début et à la fin de l'année
    const crdStart = CRD(n0);
    const crdEnd = CRD(n1);
    
    // Méthode des trapèzes : moyenne du CRD × taux annuel
    const capitalMoyen = (crdStart + crdEnd) / 2;
    return capitalMoyen * (inputData.loanRate / 100);
}
    /**
     * Calcule les charges réelles déductibles
     */
    calculateRealCharges(inputData, params, interetsAnnuels) {
        return interetsAnnuels + 
               params.taxeFonciere + 
               (params.chargesCoproNonRecup * 12) + 
               (params.assurancePNO * 12) + 
               params.entretienAnnuel;
    }

    /**
     * Calcule tous les détails pour un régime donné - V3 DIFFÉRENCIÉE
     */
    getDetailedCalculations(regime, inputData, params, baseResults) {
        const loyerHC = inputData.loyerHC;
        const loyerAnnuelBrut = loyerHC * 12;
        const vacanceAmount = loyerAnnuelBrut * (inputData.vacanceLocative / 100);
        const loyerNetVacance = loyerAnnuelBrut - vacanceAmount;
        const fraisGestion = params.gestionLocativeTaux > 0 ? loyerNetVacance * (params.gestionLocativeTaux / 100) : 0;
        const revenusNets = loyerNetVacance - fraisGestion;
        
        // Calcul des intérêts annuels précis
        const interetsAnnuels = this.calculateAnnualInterests(inputData, baseResults);
        const mensualite = inputData.monthlyPayment;
        const mensualiteAnnuelle = mensualite * 12;
        const capitalAnnuel = mensualiteAnnuelle - interetsAnnuels;
        
        // IMPORTANT: Différencier selon le régime
        let chargesDeductibles = 0;
        let baseImposable = 0;
        let impotRevenu = 0;
        let prelevementsSociaux = 0;
        let amortissementBien = 0;
        let amortissementMobilier = 0;
        let amortissementTravaux = 0;
        
        switch(regime.nom) {
            case 'Micro-foncier':
                // 30% d'abattement forfaitaire
                chargesDeductibles = revenusNets * FISCAL_CONSTANTS.MICRO_FONCIER_ABATTEMENT;
                baseImposable = revenusNets * (1 - FISCAL_CONSTANTS.MICRO_FONCIER_ABATTEMENT);
                impotRevenu = baseImposable * (inputData.tmi / 100);
                prelevementsSociaux = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
                break;
                
            case 'Location nue au réel':
                // Toutes les charges sont déductibles
                chargesDeductibles = this.calculateRealCharges(inputData, params, interetsAnnuels);
                baseImposable = Math.max(0, revenusNets - chargesDeductibles);
                impotRevenu = baseImposable * (inputData.tmi / 100);
                prelevementsSociaux = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
                break;
                
            case 'LMNP Micro-BIC':
                // 50% d'abattement forfaitaire
                chargesDeductibles = revenusNets * FISCAL_CONSTANTS.MICRO_BIC_ABATTEMENT;
                baseImposable = revenusNets * (1 - FISCAL_CONSTANTS.MICRO_BIC_ABATTEMENT);
                impotRevenu = baseImposable * (inputData.tmi / 100);
                prelevementsSociaux = 0; // Pas de PS en LMNP
                break;
                
        case 'LMNP au réel':
            // 1. Charges réelles
            chargesDeductibles = this.calculateRealCharges(inputData, params, interetsAnnuels);

            // 2. Amortissements
            const baseAmortissable = inputData.price * 
                (1 - FISCAL_CONSTANTS.LMNP_PART_TERRAIN - FISCAL_CONSTANTS.LMNP_PART_MOBILIER);

            amortissementBien = baseAmortissable * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;
            
            amortissementMobilier = inputData.price * 
                FISCAL_CONSTANTS.LMNP_PART_MOBILIER * 
                FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_MOBILIER;

            // 🆕 Amortissement des travaux capitalisés
            amortissementTravaux = (inputData.travauxRenovation || 0) * 
                FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;

            const totalDeductionsLMNP = chargesDeductibles + 
                amortissementBien + 
                amortissementMobilier + 
                amortissementTravaux;

            // 3. Fiscalité
            baseImposable = Math.max(0, revenusNets - totalDeductionsLMNP);
            impotRevenu = baseImposable * (inputData.tmi / 100);
            prelevementsSociaux = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;  // 🆕 PS à 17,2%
            
            break;
                
            case 'SCI à l\'IS':
                // IS à 15% jusqu'à 42500€
                chargesDeductibles = this.calculateRealCharges(inputData, params, interetsAnnuels);
                baseImposable = Math.max(0, revenusNets - chargesDeductibles);
                
                if (baseImposable <= FISCAL_CONSTANTS.IS_PLAFOND_REDUIT) {
                    impotRevenu = baseImposable * FISCAL_CONSTANTS.IS_TAUX_REDUIT;
                } else {
                    impotRevenu = FISCAL_CONSTANTS.IS_PLAFOND_REDUIT * FISCAL_CONSTANTS.IS_TAUX_REDUIT +
                                 (baseImposable - FISCAL_CONSTANTS.IS_PLAFOND_REDUIT) * 0.25;
                }
                prelevementsSociaux = 0;
                break;
                
            default:
                // Défaut : comme location nue au réel
                chargesDeductibles = this.calculateRealCharges(inputData, params, interetsAnnuels);
                baseImposable = Math.max(0, revenusNets - chargesDeductibles);
                impotRevenu = baseImposable * (inputData.tmi / 100);
                prelevementsSociaux = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
        }
        
        const totalImpots = impotRevenu + prelevementsSociaux;
        
        // Cash-flow net - V3: Correction double comptabilisation
      // ✅ APRÈS (avec UNIQUEMENT les champs existants)
const chargesCashAnnuel =
    params.taxeFonciere +
    params.entretienAnnuel +
    (params.assurancePNO * 12) +
    (params.chargesCoproNonRecup * 12);

const cashflowNetAnnuel = 
    revenusNets - 
    chargesCashAnnuel -    // ← LA correction
    totalImpots - 
    mensualiteAnnuelle;
        
        return {
            // Revenus
            loyerHC,
            loyerAnnuelBrut,
            vacanceLocative: inputData.vacanceLocative,
            vacanceAmount,
            gestionLocative: params.gestionLocativeTaux,
            fraisGestion,
            revenusNets,
            
     // Charges
        interetsAnnuels,
        tauxAmortissement: amortissementBien > 0 
            ? FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN * 100 
            : 0,
        amortissementBien,
        amortissementMobilier,
        amortissementTravaux,  // 🆕 Maintenant accessible car déclaré avant le switch
        chargesCopro: (inputData.chargesRecuperables || 0) * 12,  // 🆕 Sécurisé
        chargesCoproNonRecup: params.chargesCoproNonRecup * 12,
        entretienAnnuel: params.entretienAnnuel,
        taxeFonciere: params.taxeFonciere,
        assurancePNO: params.assurancePNO * 12,
        totalCharges: chargesDeductibles + 
            amortissementBien + 
            amortissementMobilier + 
            amortissementTravaux,  // 🆕 Inclus dans le total
            
            // Fiscalité
            baseImposable,
            impotRevenu,
            prelevementsSociaux,
            totalImpots,
            
            // Cash-flow
            capitalAnnuel,
            mensualiteAnnuelle,
            cashflowNetAnnuel,
            
            // Autres infos utiles
            regime: regime.nom,
            abattementApplique: regime.nom.includes('Micro') ? chargesDeductibles : 0,
            chargesReelles: this.calculateRealCharges(inputData, params, interetsAnnuels)
        };
    }

    /**
     * Construit le tableau détaillé complet
     */
  buildDetailedTable(regime, inputData) {
    const params = this.getAllAdvancedParams(); // ⚠️ GARDE CETTE LIGNE !
    const calc = regime._detailedCalc;           // ✅ Utilise le calcul existant
        
        return `
            <table class="detailed-comparison-table" role="table">
                <caption class="sr-only">Détail complet des calculs fiscaux pour le régime ${regime.nom}</caption>
                <thead>
                    <tr>
                        <th colspan="3">📊 DÉTAIL COMPLET - ${regime.nom.toUpperCase()}</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.buildCoutInitialSection(inputData, params)}
                    ${this.buildRevenusSection(calc, params)}
                    ${this.buildChargesSection(calc, params)}
                    ${this.buildFiscaliteSection(calc, inputData)}
                    ${this.buildCashflowSection(calc, inputData)}
                    ${this.buildIndicateursSection(calc, inputData)}
                </tbody>
            </table>
        `;
    }

    /**
     * Construit la section coût initial de l'opération
     */
   buildCoutInitialSection(inputData, params, coutTotalProjet = null) {
        // Calcul des frais selon le type d'achat
        let fraisAcquisition = 0;
        let detailFrais = [];
        
        if (inputData.typeAchat === 'encheres') {
            // Frais pour vente aux enchères
            const droitsEnregistrement = inputData.price * (params.droitsEnregistrement / 100);
            const emoluments = this.calculateEmoluments(inputData.price, params);
            const honorairesAvocat = params.honorairesAvocat;
            const fraisDivers = params.fraisFixes + params.avocatPorterEnchere + params.suiviDossier;
            
            fraisAcquisition = droitsEnregistrement + emoluments + honorairesAvocat + fraisDivers;
            
            detailFrais = [
                { label: "Droits d'enregistrement", value: droitsEnregistrement, formula: `${params.droitsEnregistrement}% du prix` },
                { label: "Émoluments du poursuivant", value: emoluments, formula: "Selon barème" },
                { label: "Honoraires avocat", value: honorairesAvocat, formula: "Forfait" },
                { label: "Frais divers (admin, suivi...)", value: fraisDivers, formula: "Frais fixes" }
            ];
        } else {
            // Frais pour achat classique
            const fraisNotaire = inputData.price * (params.fraisNotaireTaux / 100);
            const commission = inputData.price * (params.commissionImmo / 100);
            
            fraisAcquisition = fraisNotaire + commission;
            
            detailFrais = [
                { label: "Frais de notaire", value: fraisNotaire, formula: `${params.fraisNotaireTaux}% du prix` },
                { label: "Commission immobilière", value: commission, formula: `${params.commissionImmo}% du prix` }
            ];
        }
        
        // Ajouter les frais bancaires
        const fraisBancaires = params.fraisBancairesDossier + params.fraisBancairesCompte + 
                              (inputData.loanAmount * params.fraisGarantie / 100);
        
        detailFrais.push({ 
            label: "Frais bancaires totaux", 
            value: fraisBancaires, 
            formula: "Dossier + compte + garantie" 
        });
        
        const coutTotalOperation = coutTotalProjet || inputData.coutTotalAcquisition || 
    (inputData.price + inputData.travauxRenovation + fraisAcquisition + fraisBancaires);
        
        return `
            <tr class="section-header">
                <td colspan="3"><strong>💰 COÛT INITIAL DE L'OPÉRATION</strong></td>
            </tr>
            <tr>
                <td>Prix d'achat du bien</td>
                <td class="text-right">${this.formatCurrency(inputData.price)}</td>
                <td class="formula">Prix négocié</td>
            </tr>
            ${inputData.travauxRenovation > 0 ? `
            <tr>
                <td>Travaux de rénovation</td>
                <td class="text-right">${this.formatCurrency(inputData.travauxRenovation)}</td>
                <td class="formula">Travaux initiaux</td>
            </tr>
            ` : ''}
            ${detailFrais.map(frais => `
            <tr>
                <td>${frais.label}</td>
                <td class="text-right">${this.formatCurrency(frais.value)}</td>
                <td class="formula">${frais.formula}</td>
            </tr>
            `).join('')}
            <tr class="total-row">
                <td><strong>Coût total de l'opération</strong></td>
                <td class="text-right"><strong>${this.formatCurrency(coutTotalOperation)}</strong></td>
                <td class="formula"><strong>Investissement total</strong></td>
            </tr>
            <tr>
                <td>Apport personnel</td>
                <td class="text-right">${this.formatCurrency(inputData.apport)}</td>
                <td class="formula">${((inputData.apport / coutTotalOperation) * 100).toFixed(1)}% du total</td>
            </tr>
            <tr>
                <td>Montant emprunté</td>
                <td class="text-right">${this.formatCurrency(inputData.loanAmount)}</td>
                <td class="formula">${((inputData.loanAmount / coutTotalOperation) * 100).toFixed(1)}% du total</td>
            </tr>
        `;
    }

    /**
     * Calcule les émoluments pour les enchères
     */
    calculateEmoluments(price, params) {
        let emoluments = 0;
        
        // Tranche 1 : 0 à 6 500 €
        if (price > 0) {
            emoluments += Math.min(price, 6500) * (params.emolumentsTranche1 / 100);
        }
        
        // Tranche 2 : 6 500 à 23 500 €
        if (price > 6500) {
            emoluments += Math.min(price - 6500, 17000) * (params.emolumentsTranche2 / 100);
        }
        
        // Tranche 3 : 23 500 à 83 500 €
        if (price > 23500) {
            emoluments += Math.min(price - 23500, 60000) * (params.emolumentsTranche3 / 100);
        }
        
        // Tranche 4 : Au-delà de 83 500 €
        if (price > 83500) {
            emoluments += (price - 83500) * (params.emolumentsTranche4 / 100);
        }
        
        return emoluments;
    }
    // 🆕 AJOUTEZ LA NOUVELLE FONCTION ICI (juste après l'accolade fermante)
/**
 * Calcule tous les frais d'acquisition (classique ou enchères)
 */
calculateFraisAcquisition(prix, typeAchat, params) {
if (typeAchat === 'encheres') {
    const droits = prix * (params.droitsEnregistrement / 100);
    const emoluments = this.calculateEmoluments(prix, params);
    const honoraires = params.honorairesAvocat;
    const publiciteFonciere = prix * (params.publiciteFonciere / 100);  // 🆕
    const tvaHonoraires = honoraires * (params.tvaHonoraires / 100);    // 🆕
    const fraisDivers = params.fraisFixes + params.avocatPorterEnchere + params.suiviDossier;
    
    return droits + emoluments + honoraires + tvaHonoraires + publiciteFonciere + fraisDivers;
    } else {
        const fraisNotaire = prix * (params.fraisNotaireTaux / 100);
        const commission = prix * (params.commissionImmo / 100);
        return fraisNotaire + commission;
    }
}

    /**
     * Construit la section revenus
     */
    buildRevenusSection(calc, params) {
        return `
            <tr class="section-header">
                <td colspan="3"><strong>💰 REVENUS LOCATIFS</strong></td>
            </tr>
            <tr>
                <td>Loyer mensuel HC</td>
                <td class="text-right">${this.formatCurrency(calc.loyerHC)}</td>
                <td class="formula">Loyer hors charges</td>
            </tr>
            <tr>
                <td>Loyer annuel brut</td>
                <td class="text-right">${this.formatCurrency(calc.loyerAnnuelBrut)}</td>
                <td class="formula">= ${calc.loyerHC} × 12 mois</td>
            </tr>
            <tr>
                <td>Vacance locative (${calc.vacanceLocative}%)</td>
                <td class="text-right negative">-${this.formatCurrency(calc.vacanceAmount)}</td>
                <td class="formula">= ${this.formatNumber(calc.loyerAnnuelBrut)} × ${calc.vacanceLocative}%</td>
            </tr>
${calc.fraisGestion > 0 ? `
<tr>
    <td>Frais de gestion (${params.gestionLocativeTaux}%)</td>
    <td class="text-right negative">-${this.formatCurrency(calc.fraisGestion)}</td>
    <td class="formula">= Loyer net × ${params.gestionLocativeTaux}%</td>
</tr>
` : ''}
            <tr class="total-row">
                <td><strong>Revenus locatifs nets</strong></td>
                <td class="text-right"><strong>${this.formatCurrency(calc.revenusNets)}</strong></td>
                <td></td>
            </tr>
        `;
    }

/**
 * Construit la section charges (triées par impact)
 */
buildChargesSection(calc, params) {
    const charges = [];
    
    // Pour les régimes micro, afficher l'abattement forfaitaire
    if (calc.regime.includes('Micro')) {
        charges.push({
            label: `Abattement forfaitaire (${calc.regime === 'Micro-foncier' ? '30%' : '50%'})`,
            value: calc.abattementApplique,
            formula: 'Sur revenus nets'
        });
    } else {
        // Pour les régimes réels, détailler toutes les charges
        charges.push(
            { label: "Intérêts d'emprunt", value: calc.interetsAnnuels, formula: "Selon échéancier" },
            calc.amortissementBien > 0 ? { label: "Amortissement bien", value: calc.amortissementBien, formula: `${calc.tauxAmortissement}% × valeur` } : null,
            calc.amortissementMobilier > 0 ? { label: "Amortissement mobilier", value: calc.amortissementMobilier, formula: "10% × 10% du prix" } : null,
            
            // 🆕 LIGNE AJOUTÉE : Amortissement des travaux
            calc.amortissementTravaux > 0 ? { 
                label: "Amortissement travaux", 
                value: calc.amortissementTravaux, 
                formula: "2.5% × coût travaux" 
            } : null,
            
            { label: "Taxe foncière", value: calc.taxeFonciere, formula: "Paramètre avancé" },
            // { label: "Charges copro récupérables", value: calc.chargesCopro, formula: "12 × charges mensuelles" }, // Commenté car non déductible
            calc.chargesCoproNonRecup > 0 ? { label: "Charges copro non récupérables", value: calc.chargesCoproNonRecup, formula: `${params.chargesCoproNonRecup} × 12` } : null,
            { label: "Assurance PNO", value: calc.assurancePNO, formula: `${params.assurancePNO} × 12` },
            { label: "Entretien annuel", value: calc.entretienAnnuel, formula: "Budget annuel" }
        );
    }
    
    const validCharges = charges.filter(Boolean).sort((a, b) => b.value - a.value);
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>📉 CHARGES DÉDUCTIBLES</strong></td>
        </tr>
        ${validCharges.map(charge => `
        <tr>
            <td>${charge.label}</td>
            <td class="text-right negative">-${this.formatCurrency(charge.value)}</td>
            <td class="formula">${charge.formula}</td>
        </tr>
        `).join('')}
        ${calc.regime.includes('Micro') && calc.chargesReelles > calc.abattementApplique ? `
        <tr class="warning-row">
            <td colspan="3" style="color: #f59e0b; font-style: italic;">
                ⚠️ Charges réelles (${this.formatCurrency(calc.chargesReelles)}) > Abattement (${this.formatCurrency(calc.abattementApplique)})
                → Le régime réel serait plus avantageux
            </td>
        </tr>
        ` : ''}
        <tr class="total-row">
            <td><strong>Total charges déductibles</strong></td>
            <td class="text-right negative"><strong>-${this.formatCurrency(calc.totalCharges)}</strong></td>
            <td></td>
        </tr>
    `;
}

    /**
     * Construit la section fiscalité
     */
    buildFiscaliteSection(calc, inputData) {
        return `
            <tr class="section-header">
                <td colspan="3"><strong>📊 CALCUL FISCAL</strong></td>
            </tr>
            <tr>
                <td>Revenus nets</td>
                <td class="text-right">${this.formatCurrency(calc.revenusNets)}</td>
                <td class="formula">Après vacance et gestion</td>
            </tr>
            <tr>
                <td>- Charges déductibles</td>
                <td class="text-right negative">-${this.formatCurrency(calc.totalCharges)}</td>
                <td class="formula">Total ci-dessus</td>
            </tr>
            <tr>
                <td><strong>Base imposable</strong></td>
                <td class="text-right"><strong>${this.formatCurrency(calc.baseImposable)}</strong></td>
                <td class="formula">= Max(0, revenus - charges)</td>
            </tr>
            <tr>
                <td>Impôt sur le revenu ${calc.regime === 'SCI à l\'IS' ? '(IS)' : `(TMI ${inputData.tmi}%)`}</td>
                <td class="text-right negative">-${this.formatCurrency(calc.impotRevenu)}</td>
                <td class="formula">${calc.regime === 'SCI à l\'IS' ? 'Barème IS' : `= Base × ${inputData.tmi}%`}</td>
            </tr>
            ${calc.prelevementsSociaux > 0 ? `
            <tr>
                <td>Prélèvements sociaux (17.2%)</td>
                <td class="text-right negative">-${this.formatCurrency(calc.prelevementsSociaux)}</td>
                <td class="formula">Sauf LMNP et SCI IS</td>
            </tr>
            ` : ''}
            <tr class="total-row">
                <td><strong>Total impôts</strong></td>
                <td class="text-right negative"><strong>-${this.formatCurrency(calc.totalImpots)}</strong></td>
                <td></td>
            </tr>
        `;
    }

    /**
     * Construit la section cash-flow
     */
buildCashflowSection(calc, inputData) {
    const mensualiteAnnuelle = inputData.monthlyPayment * 12;
    
    // Recalculer les charges cash pour l'affichage
const chargesCashAnnuel = 
    calc.taxeFonciere +
    calc.chargesCoproNonRecup +
    calc.entretienAnnuel +
    calc.assurancePNO;
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>💰 CASH-FLOW</strong></td>
        </tr>
        <tr>
            <td>Revenus nets après impôts</td>
            <td class="text-right positive">+${this.formatCurrency(calc.revenusNets - calc.totalImpots)}</td>
            <td class="formula">= Revenus - impôts</td>
        </tr>
        <tr>
            <td>Charges cash annuelles</td>
            <td class="text-right negative">-${this.formatCurrency(chargesCashAnnuel)}</td>
            <td class="formula">TF + copro + entretien + PNO${calc.fraisGestion ? ' + gestion' : ''}</td>
        </tr>
        <tr>
            <td>Mensualité crédit (capital + intérêts)</td>
            <td class="text-right negative">-${this.formatCurrency(mensualiteAnnuelle)}</td>
            <td class="formula">= ${this.formatNumber(inputData.monthlyPayment)} × 12</td>
        </tr>
        <tr>
            <td>Dont remboursement capital</td>
            <td class="text-right">-${this.formatCurrency(calc.capitalAnnuel)}</td>
            <td class="formula">Enrichissement</td>
        </tr>
        <tr class="total-row ${calc.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
            <td><strong>Cash-flow net annuel</strong></td>
            <td class="text-right"><strong>${this.formatCurrency(calc.cashflowNetAnnuel)}</strong></td>
            <td><strong>${calc.cashflowNetAnnuel >= 0 ? 'Bénéfice' : 'Déficit'}</strong></td>
        </tr>
        <tr>
            <td>Cash-flow mensuel moyen</td>
            <td class="text-right ${calc.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                ${this.formatCurrency(calc.cashflowNetAnnuel / 12)}
            </td>
            <td class="formula">= Annuel ÷ 12</td>
        </tr>
    `;
}

    /**
     * Construit la section indicateurs
     * ───────────────────────────────────────────────────────────
     * 1. Cash-on-Cash        = Cash-flow net annuel / Apport
     * 2. Rendement net réel  = Revenus nets / Coût total du projet
     * 3. Taux de couverture  = Revenus nets / Mensualités de crédit
     */
buildIndicateursSection(calc, inputData) {
    // Récupération des constantes fiscales
    const PS = FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX || 0.172;
    
    // Calcul du coût total du projet
    const coutTotalProjet = inputData.coutTotalAcquisition || 
                           (inputData.price + (inputData.travauxRenovation || 0) + (inputData.price * 0.10));
    
    // Mensualité annuelle
    const mensualiteAnnuelle = inputData.monthlyPayment * 12;
    
    /* 1️⃣ Cash-on-Cash return (gérer apport = 0) */
    const cashOnCash = inputData.apport > 0 
        ? (calc.cashflowNetAnnuel / inputData.apport) * 100 
        : null;
        
    /* 2️⃣ Rendement net sur coût total (loyers - charges non récupérables) */
const revenuNetReel = calc.revenusNets
    - calc.taxeFonciere
    - calc.chargesCoproNonRecup
    - calc.entretienAnnuel
    - calc.assurancePNO;
const rendementNetReel = (revenuNetReel / coutTotalProjet) * 100;
    
/* 3️⃣ Taux de couverture du crédit (DSCR) */
const dscr = mensualiteAnnuelle > 0
    ? (revenuNetReel / mensualiteAnnuelle)
    : 1;
const tauxCouverture = dscr * 100;
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>📈 INDICATEURS DE PERFORMANCE</strong></td>
        </tr>
        <tr>
            <td>Cash-on-Cash return</td>
            <td class="text-right ${cashOnCash !== null && cashOnCash >= 0 ? 'positive' : 'negative'}">
                ${cashOnCash !== null ? cashOnCash.toFixed(2) + '%' : '—'}
            </td>
            <td class="formula">${cashOnCash !== null ? '= Cash-flow / Apport' : 'Pas d\'apport'}</td>
        </tr>
        <tr>
            <td>Rendement net sur coût total</td>
            <td class="text-right ${rendementNetReel >= 0 ? 'positive' : 'negative'}">
                ${rendementNetReel.toFixed(2)}%
            </td>
            <td class="formula">= Revenus nets / Coût total</td>
        </tr>
        <tr>
            <td>Taux de couverture du crédit</td>
            <td class="text-right ${tauxCouverture >= 100 ? 'positive' : 'negative'}">
                ${tauxCouverture.toFixed(0)}%
            </td>
            <td class="formula">= Revenus nets / Mensualités</td>
        </tr>
    `;
}

/**
 * Prépare les données pour la comparaison fiscale - VERSION COMPLÈTE
 */
prepareFiscalData() {
    // Récupérer les données de ville sélectionnée
    const villeData = window.villeSearchManager?.getSelectedVilleData();
    
    // SIMPLIFICATION : Toujours HC + charges
    const loyerHC = parseFloat(document.getElementById('monthlyRent')?.value) || 0;
    const charges = parseFloat(document.getElementById('monthlyCharges')?.value) || 50;
    const loyerCC = loyerHC + charges;
    
    // Récupérer tous les paramètres avancés
    const allParams = this.getAllAdvancedParams();
    
    console.log('💰 Calcul des loyers:', {
        loyerHC,
        charges,
        loyerCC
    });
    
    // Récupérer TOUS les paramètres du formulaire
    const formData = {
        // Localisation
        city: villeData?.ville || document.getElementById('propertyCity')?.value || '',
        department: villeData?.departement || document.getElementById('propertyDepartment')?.value || '',
        
        // Détails du bien
        propertyType: document.getElementById('propertyType')?.value || 'appartement',
        surface: parseFloat(document.getElementById('propertySurface')?.value) || 0,
        price: parseFloat(document.getElementById('propertyPrice')?.value) || 0,
        monthlyRent: loyerHC, // Toujours HC pour les calculs fiscaux
        
        // Financement
        apport: parseFloat(document.getElementById('apport')?.value) || 0,
        loanRate: parseFloat(document.getElementById('loanRate')?.value) || 2.5,
        loanDuration: parseInt(document.getElementById('loanDuration')?.value) || 20,
        
        // Fiscal
        tmi: parseFloat(document.getElementById('tmi')?.value) || 30,
        
        // Charges
        monthlyCharges: charges,
        taxeFonciere: allParams.taxeFonciere,
        
        // NOUVEAU : Séparer travaux et entretien
        travauxRenovation: allParams.travauxRenovation,
        entretienAnnuel: allParams.entretienAnnuel,
        
        // NOUVEAU : Charges de copropriété non récupérables
        chargesCoproNonRecup: allParams.chargesCoproNonRecup,
        
        // Paramètres avancés
       gestionLocativeTaux: allParams.gestionLocativeTaux,
      vacanceLocative: parseFloat(document.getElementById('vacanceLocative')?.value ?? 0),
        
        // Mode d'achat
        typeAchat: document.querySelector('input[name="type-achat"]:checked')?.value || 'classique',
        
        // NOUVEAU : Tous les paramètres avancés
        ...allParams
    };
    
// 🆕 Calcul des frais d'acquisition
const fraisAcquisition = this.calculateFraisAcquisition(
    formData.price,
    formData.typeAchat,
    allParams
);

// 🆕 Calcul analytique de l'emprunt (comme dans immo-simulation.js)
const fraisDossier = allParams.fraisBancairesDossier;
const fraisCompte = allParams.fraisBancairesCompte;
const tauxGarantie = allParams.fraisGarantie / 100;

// Coût hors frais bancaires
const coutHorsFraisB = formData.price + allParams.travauxRenovation + fraisAcquisition;

// Formule analytique pour l'emprunt
const loanAmount = (coutHorsFraisB - formData.apport + fraisDossier + fraisCompte) 
                 / (1 - tauxGarantie);

// Frais bancaires réels
const fraisBancaires = fraisDossier + fraisCompte + (loanAmount * tauxGarantie);

// Coût total final
const coutTotalFinal = coutHorsFraisB + fraisBancaires;

// Calcul de la mensualité
const monthlyPayment = this.calculateMonthlyPayment(
    loanAmount, 
    formData.loanRate, 
    formData.loanDuration
);

// GARDEZ ces deux lignes qui étaient déjà là
const yearlyRent = loyerHC * 12 * (1 - formData.vacanceLocative / 100);
const yearlyCharges = charges * 12;
    
    // Ajouter les frais de gestion si applicable
    const gestionFees = formData.gestionLocativeTaux > 0 ? 
    yearlyRent * (formData.gestionLocativeTaux / 100) : 0;
    
    // Stocker dans la console pour debug
    console.log('📊 Données fiscales préparées:', formData);
    console.log('🏙️ Ville sélectionnée:', villeData);
  console.log('💸 Coût total acquisition:', coutTotalFinal);
    console.log('🏛️ Paramètres enchères:', {
        emoluments: [formData.emolumentsTranche1, formData.emolumentsTranche2, formData.emolumentsTranche3, formData.emolumentsTranche4],
        honorairesCoef: formData.honorairesAvocatCoef,
        tvaHonoraires: formData.tvaHonoraires,
        cautionRestituee: formData.cautionRestituee
    });
    
    // Format compatible avec le comparateur fiscal existant
return {
    typeAchat: formData.typeAchat,
    prixBien: formData.price,
    surface: formData.surface,
    apport: formData.apport,
    duree: formData.loanDuration,
    taux: formData.loanRate,
    loyerMensuel: loyerHC,
    tmi: formData.tmi,
    chargesCopro: charges,
    
    // Données étendues pour l'affichage
    ...formData,
    loyerHC: loyerHC,
    loyerCC: loyerCC,
    chargesRecuperables: charges,
    loanAmount,
    monthlyPayment,
    yearlyRent,
    yearlyCharges,
    gestionFees,
    
      // 🆕 Ajout du booléen gestionLocative
    gestionLocative: allParams.gestionLocativeTaux > 0,
    
    // 🆕 REMPLACEZ par ces 3 lignes :
    coutTotalAcquisition: coutTotalFinal,  // Utiliser la bonne variable !
    fraisAcquisition: fraisAcquisition,
    fraisBancaires: fraisBancaires,
    
    timestamp: new Date().toISOString()
};
}


    /**
     * Génère des recommandations globales
     */
    generateGlobalRecommendations(marketAnalysis, fiscalResults) {
        const recommendations = [];
        
        // Recommandations basées sur l'analyse de marché
        if (marketAnalysis.hasMarketData) {
            if (marketAnalysis.priceAnalysis.position === 'excellent') {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-trophy',
                    title: 'Excellent prix d\'achat',
                    description: `Vous avez acheté ${Math.abs(marketAnalysis.priceAnalysis.difference).toFixed(0)}% en dessous du marché, soit une économie de ${this.formatNumber(Math.abs(marketAnalysis.priceAnalysis.savings))}€.`
                });
            } else if (marketAnalysis.priceAnalysis.position === 'overpriced') {
                recommendations.push({
                    type: 'warning',
                    icon: 'fa-exclamation-triangle',
                    title: 'Prix d\'achat élevé',
                    description: `Vous avez payé ${marketAnalysis.priceAnalysis.difference.toFixed(0)}% au-dessus du marché. L'optimisation fiscale est cruciale pour compenser.`
                });
            }
            
            if (marketAnalysis.rentAnalysis.position === 'low' || marketAnalysis.rentAnalysis.position === 'underpriced') {
                recommendations.push({
                    type: 'info',
                    icon: 'fa-chart-line',
                    title: 'Potentiel d\'augmentation du loyer',
                    description: `Votre loyer pourrait être augmenté de ${this.formatNumber(Math.abs(marketAnalysis.rentAnalysis.potential))}€/mois pour atteindre le prix du marché.`
                });
            }
        }
        
        // Recommandations fiscales
        if (fiscalResults && fiscalResults.length > 0) {
            const bestRegime = fiscalResults[0];
            const worstRegime = fiscalResults[fiscalResults.length - 1];
            const savings = bestRegime.cashflowNetAnnuel - worstRegime.cashflowNetAnnuel;
            
            recommendations.push({
                type: 'primary',
                icon: 'fa-balance-scale',
                title: `Régime optimal : ${bestRegime.nom}`,
                description: `Ce régime vous permet d'économiser ${this.formatNumber(savings)}€/an par rapport au régime le moins avantageux.`
            });
            
            if (bestRegime.cashflowNetAnnuel > 0) {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-coins',
                    title: 'Investissement rentable',
                    description: `Avec le régime ${bestRegime.nom}, vous générez ${this.formatNumber(bestRegime.cashflowNetAnnuel)}€/an de cash-flow net après impôts.`
                });
            }
        }
        
        // Score global et recommandation finale
        if (marketAnalysis.globalScore > 75) {
            recommendations.push({
                type: 'success',
                icon: 'fa-star',
                title: 'Excellent investissement global',
                description: 'Votre investissement est bien positionné sur le marché. L\'optimisation fiscale le rendra encore plus rentable.'
            });
        } else if (marketAnalysis.globalScore < 40) {
            recommendations.push({
                type: 'warning',
                icon: 'fa-info-circle',
                title: 'Optimisation nécessaire',
                description: 'Votre investissement nécessite une attention particulière. Le choix du bon régime fiscal est crucial pour sa rentabilité.'
            });
        }
        
        return recommendations;
    }

    /**
     * Formate un nombre
     */
    formatNumber(num) {
        return new Intl.NumberFormat('fr-FR', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(Math.round(num));
    }

    /**
     * Formate une devise
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    }

    /**
     * Calcul de mensualité de prêt
     */
    calculateMonthlyPayment(loanAmount, annualRate, years) {
        const monthlyRate = annualRate / 100 / 12;
        const numPayments = years * 12;
        
        if (monthlyRate === 0) return loanAmount / numPayments;
        
        return loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments) / 
               (Math.pow(1 + monthlyRate, numPayments) - 1);
    }

/**
 * Génère le HTML pour afficher les résultats fiscaux améliorés - VERSION COMPLÈTE
 */
generateFiscalResultsHTML(fiscalResults, inputData) {
    const bestRegime = fiscalResults.reduce((a, b) => 
        a.cashflowNetAnnuel > b.cashflowNetAnnuel ? a : b
    );
     // Utilisation du helper pour formater les montants avec conversion robuste
    const cashflowMensuel = this.formatAmountWithClass(bestRegime.cashflowMensuel);
    const cashflowAnnuel = this.formatAmountWithClass(bestRegime.cashflowNetAnnuel);
    
    // Calcul des charges déductibles approximatives
    const chargesDeductibles = inputData.yearlyCharges + inputData.taxeFonciere + 
        (inputData.loanAmount * inputData.loanRate / 100) + inputData.gestionFees + 
        inputData.entretienAnnuel + (inputData.chargesCoproNonRecup * 12); // NOUVEAU : Ajouter charges non récup
    
    const baseImposable = Math.max(0, inputData.yearlyRent - chargesDeductibles);
    const impotEstime = baseImposable * inputData.tmi / 100;
    
    return `
        <!-- Résumé du bien -->
        <div class="property-summary">
            <h3>📊 Résumé de votre investissement</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="label">🏛️ Type d'acquisition:</span>
                    <span class="value">${inputData.typeAchat === 'encheres' ? 'Vente aux enchères' : 'Achat classique'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">📍 Localisation:</span>
                    <span class="value">${inputData.city || 'Non renseignée'} ${inputData.department ? `(${inputData.department})` : ''}</span>
                </div>
                <div class="summary-item">
                    <span class="label">🏠 Type de bien:</span>
                    <span class="value">${inputData.propertyType} - ${inputData.surface}m²</span>
                </div>
                <div class="summary-item">
                    <span class="label">💰 Prix d'achat:</span>
                    <span class="value">${this.formatCurrency(inputData.price)}</span>
                </div>
                ${inputData.travauxRenovation > 0 ? `
                <div class="summary-item">
                    <span class="label">🔨 Travaux de rénovation:</span>
                    <span class="value">${this.formatCurrency(inputData.travauxRenovation)}</span>
                </div>
                <div class="summary-item">
                    <span class="label">💸 Coût total d'acquisition:</span>
                    <span class="value" style="font-weight: bold; color: #00bfff;">
                        ${this.formatCurrency(inputData.coutTotalAcquisition)}
                    </span>
                </div>
                ` : ''}
                <div class="summary-item">
                    <span class="label">🏦 Financement:</span>
                    <span class="value">${inputData.loanRate}% sur ${inputData.loanDuration} ans</span>
                </div>
                <div class="summary-item">
                    <span class="label">💵 Loyer mensuel:</span>
                    <span class="value">${this.formatCurrency(inputData.loyerCC)} CC</span>
                </div>
                <div class="summary-item">
                    <span class="label">📊 Votre TMI:</span>
                    <span class="value">${inputData.tmi}%</span>
                </div>
                <div class="summary-item">
                    <span class="label">🔧 Entretien annuel:</span>
                    <span class="value">${this.formatCurrency(inputData.entretienAnnuel)}/an</span>
                </div>
                <div class="summary-item">
                    <span class="label">🏢 Charges copro non récup.:</span>
                    <span class="value">${this.formatCurrency(inputData.chargesCoproNonRecup)}/mois</span>
                </div>
            </div>
            ${inputData.gestionLocative || inputData.vacanceLocative > 5 || inputData.travauxRenovation > 0 || 
              inputData.typeAchat === 'encheres' ? `
                <div class="parameter-modified" style="margin-top: 10px; padding: 10px; background: rgba(255, 193, 7, 0.1); border-radius: 5px;">
                    <i class="fas fa-info-circle" style="color: #ffc107;"></i>
                    Paramètres avancés modifiés : 
                    ${inputData.gestionLocative ? 'Gestion locative (8%)' : ''}
                    ${inputData.vacanceLocative > 5 ? ` Vacance locative (${inputData.vacanceLocative}%)` : ''}
                    ${inputData.travauxRenovation > 0 ? ` Travaux initiaux (${this.formatCurrency(inputData.travauxRenovation)})` : ''}
                    ${inputData.typeAchat === 'encheres' ? ' Frais enchères personnalisés' : ''}
                </div>
            ` : ''}
        </div>

        <!-- Meilleur régime -->
        <div class="best-regime-card">
            <h3>🏆 Meilleur régime fiscal : ${bestRegime.nom}</h3>
<div class="regime-benefits">
    <div class="benefit-item">
        <h4>💸 Cash-flow mensuel</h4>
        <p class="amount ${bestRegime.cashflowMensuel >= 0 ? 'positive' : 'negative'}">
            ${bestRegime.cashflowMensuel >= 0 ? '+' : ''}${this.formatCurrency(bestRegime.cashflowMensuel)}
        </p>
    </div>
    
    <div class="benefit-item">
        <h4>📊 Rendement brut / coût total</h4>
        <p class="amount neutral">
            ${(((inputData.yearlyRent || inputData.loyerHC * 12) / 
                (inputData.coutTotalAcquisition || inputData.price)) * 100).toFixed(2)} %
        </p>
    </div>
</div>
            
   <!-- Détail du calcul -->
<div class="fiscal-calculation-details">
    <h4>📋 Détail du calcul avec vos données</h4>
    <table class="calculation-table mini-recap">
        <tr>
            <td>Investissement total</td>
            <td class="text-right">
                ${this.formatCurrency(inputData.coutTotalAcquisition || inputData.price)}
            </td>
        </tr>
        
        <tr>
            <td>Apport / Emprunt</td>
            <td class="text-right">
                ${this.formatCurrency(inputData.apport)}
                &nbsp;/&nbsp;
                ${this.formatCurrency(inputData.loanAmount)}
            </td>
        </tr>
        
        <tr>
            <td>Loyer net annuel (HC)</td>
            <td class="text-right positive">
                +${this.formatCurrency(inputData.yearlyRent)}
            </td>
        </tr>
        
        <tr>
            <td>Charges déductibles</td>
            <td class="text-right negative">
                ${this.SIGN_MINUS}${this.formatCurrency(chargesDeductibles)}
            </td>
        </tr>
        
        <tr>
            <td>Impôts (IR&nbsp;+&nbsp;PS)</td>
            <td class="text-right negative">
                ${this.SIGN_MINUS}${this.formatCurrency(Math.abs(bestRegime.impotAnnuel))}
            </td>
        </tr>
        
        <tr>
            <td>Mensualités crédit (12&nbsp;mois)
                <br><span class="hint">
                    ${this.formatCurrency(inputData.monthlyPayment)}/mois
                </span>
            </td>
            <td class="text-right negative">
                ${this.SIGN_MINUS}${this.formatCurrency(inputData.monthlyPayment * 12)}
            </td>
        </tr>
        
        <tr class="total-row">
            <td><strong>Cash-flow net annuel</strong>
                <br><span class="hint ${bestRegime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                    ${bestRegime.cashflowNetAnnuel >= 0 ? '+' : this.SIGN_MINUS}${this.formatCurrency(Math.abs(bestRegime.cashflowNetAnnuel / 12))}/mois
                </span>
            </td>
            <td class="text-right ${bestRegime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                <strong>${bestRegime.cashflowNetAnnuel >= 0 ? '+' : this.SIGN_MINUS}${this.formatCurrency(Math.abs(bestRegime.cashflowNetAnnuel))}</strong>
            </td>
        </tr>
    </table>
                
                <!-- NOUVEAU : Bouton pour afficher le détail -->
                <button class="btn-expand-table" 
                        id="btn-fiscal-detail"
                        type="button"
                        role="button"
                        aria-expanded="false"
                        aria-controls="detailed-fiscal-table"
                        style="margin: 20px auto; background: rgba(0, 191, 255, 0.1); border: 1px solid rgba(0, 191, 255, 0.3); color: #00bfff; padding: 10px 20px; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-chevron-down" aria-hidden="true"></i> 
                    <span>Voir le détail complet</span>
                </button>
            </div>
        </div>
        
<!-- NOUVEAU : Tableau détaillé (caché par défaut) -->
<div id="detailed-fiscal-table" class="detailed-table-container" style="display: none; margin-top: 20px; animation: slideDown 0.3s ease;">
    ${this.buildDetailedTable(bestRegime, inputData)}
</div>

<!-- Tableau comparatif -->
<div class="comparison-table">
    <h3>📊 Comparaison des régimes fiscaux</h3>
    <table>
        <thead>
            <tr>
                <th>Régime</th>
                <th>Cash-flow mensuel</th>
                <th>Cash-flow annuel</th>
                <th>Impôt annuel</th>
                <th>cash-flow/coût total</th>
            </tr>
        </thead>
        <tbody>
            ${fiscalResults.map(regime => {
                // Calcul du rendement NET sur coût total
                const rendementNet = (regime.cashflowNetAnnuel / 
                                     (inputData.coutTotalAcquisition || inputData.price)) * 100;
                
                return `
                <tr class="${regime.nom === bestRegime.nom ? 'best-regime' : ''}">
                    <td>
                        <i class="fas ${regime.icone || 'fa-home'}"></i>
                        ${regime.nom}
                    </td>
                    <td class="${regime.cashflowMensuel > 0 ? 'positive' : 'negative'}">
                        ${this.formatCurrency(regime.cashflowMensuel)}
                    </td>
                    <td class="${regime.cashflowNetAnnuel > 0 ? 'positive' : 'negative'}">
                        ${this.formatCurrency(regime.cashflowNetAnnuel)}
                    </td>
                    <td>${this.formatCurrency(Math.abs(regime.impotAnnuel))}</td>
                    <td class="${rendementNet > 0 ? 'positive' : 'negative'}">
                        ${rendementNet.toFixed(2)}%
                    </td>
                </tr>
                `;
            }).join('')}
        </tbody>
    </table>
</div>

        <!-- Graphiques de comparaison -->
        <div class="charts-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 30px 0;">
            <div class="chart-wrapper">
                <h4 style="text-align: center; color: #e2e8f0;">Cash-flow net annuel par régime</h4>
                <canvas id="fiscal-cashflow-chart" style="height: 300px;"></canvas>
            </div>
            <div class="chart-wrapper">
                <h4 style="text-align: center; color: #e2e8f0;">Rendement net par régime</h4>
                <canvas id="fiscal-rendement-chart" style="height: 300px;"></canvas>
            </div>
        </div>

  <!-- Script pour le debug uniquement (le toggle est géré ailleurs) -->
        <script>
            // Debug data
            window.lastAnalysisData = {
                input: ${JSON.stringify(inputData)},
                results: ${JSON.stringify(fiscalResults)},
                timestamp: new Date()
            };
            console.log('✅ Analyse terminée. Tapez debugFiscalAnalysis() pour voir les détails.');
            
            // Fonction de debug globale
            window.debugFiscalAnalysis = function() {
                if (!window.lastAnalysisData) {
                    console.log('❌ Aucune analyse disponible.');
                    return;
                }
                
                const data = window.lastAnalysisData;
                console.group('🔍 Debug Analyse Fiscale');
                console.log('📅 Date:', data.timestamp);
                console.log('📥 Données entrées:', data.input);
                console.log('📊 Résultats:', data.results);
                console.log('🏆 Meilleur régime:', data.results.reduce((a, b) => 
                    a.cashflowNetAnnuel > b.cashflowNetAnnuel ? a : b
                ));
                console.groupEnd();
            };
            
            // Fonction de debug pour voir les différences
            window.debugFiscalDifferences = function() {
                if (!window.lastAnalysisData) {
                    console.log('❌ Aucune analyse disponible.');
                    return;
                }
                
                const data = window.lastAnalysisData;
                console.group('🔍 Comparaison des méthodes de calcul');
                
                data.results.forEach(regime => {
                    console.group('📊 ' + regime.nom);
                    console.log('Calcul détaillé:', {
                        cashflowMensuel: regime.cashflowMensuel,
                        cashflowAnnuel: regime.cashflowNetAnnuel
                    });
                    
                    if (regime._detailedCalc) {
                        console.log('Détails complets:', regime._detailedCalc);
                    }
                    console.groupEnd();
                });
                
                console.groupEnd();
            };
        </script>
    `;
}

    /**
     * Génère le tableau de comparaison détaillé
     */
    generateDetailedComparisonTable(classique, encheres, modeActuel) {
        const data = modeActuel === 'classique' ? classique : encheres;
        const compareData = modeActuel === 'classique' ? encheres : classique;
        
        return `
            <table class="detailed-comparison-table">
                <thead>
                    <tr>
                        <th>Critère</th>
                        <th>${modeActuel === 'classique' ? 'Achat Classique' : 'Vente aux Enchères'}</th>
                        <th>${modeActuel === 'classique' ? 'Vente aux Enchères' : 'Achat Classique'}</th>
                        <th>Différence</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- COÛTS D'ACQUISITION -->
                    <tr class="section-header">
                        <td colspan="4"><strong>COÛTS D'ACQUISITION</strong></td>
                    </tr>
                    <tr>
                        <td>Prix d'achat</td>
                        <td>${this.formatNumber(data.prixAchat)} €</td>
                        <td>${this.formatNumber(compareData.prixAchat)} €</td>
                        <td class="${data.prixAchat < compareData.prixAchat ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.prixAchat - compareData.prixAchat)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Frais de notaire / Droits</td>
                        <td>${this.formatNumber(data.fraisNotaire || data.droitsEnregistrement)} €</td>
                        <td>${this.formatNumber(compareData.fraisNotaire || compareData.droitsEnregistrement)} €</td>
                        <td class="${(data.fraisNotaire || data.droitsEnregistrement) < (compareData.fraisNotaire || compareData.droitsEnregistrement) ? 'positive' : 'negative'}">
                            ${this.formatNumber((data.fraisNotaire || data.droitsEnregistrement) - (compareData.fraisNotaire || compareData.droitsEnregistrement))} €
                        </td>
                    </tr>
                    <tr>
                        <td>Commission / Honoraires avocat</td>
                        <td>${this.formatNumber(data.commission || data.honorairesAvocat)} €</td>
                        <td>${this.formatNumber(compareData.commission || compareData.honorairesAvocat)} €</td>
                        <td class="${(data.commission || data.honorairesAvocat) < (compareData.commission || compareData.honorairesAvocat) ? 'positive' : 'negative'}">
                            ${this.formatNumber((data.commission || data.honorairesAvocat) - (compareData.commission || compareData.honorairesAvocat))} €
                        </td>
                    </tr>
                    <tr>
                        <td>Travaux de rénovation</td>
                        <td>${this.formatNumber(data.travaux)} €</td>
                        <td>${this.formatNumber(compareData.travaux)} €</td>
                        <td class="${data.travaux < compareData.travaux ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.travaux - compareData.travaux)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Frais bancaires</td>
                        <td>${this.formatNumber(data.fraisBancaires)} €</td>
                        <td>${this.formatNumber(compareData.fraisBancaires)} €</td>
                        <td class="${data.fraisBancaires < compareData.fraisBancaires ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.fraisBancaires - compareData.fraisBancaires)} €
                        </td>
                    </tr>
                    <tr class="total-row">
                        <td><strong>Budget total nécessaire</strong></td>
                        <td><strong>${this.formatNumber(data.coutTotal)} €</strong></td>
                        <td><strong>${this.formatNumber(compareData.coutTotal)} €</strong></td>
                        <td class="${data.coutTotal < compareData.coutTotal ? 'positive' : 'negative'}">
                            <strong>${this.formatNumber(data.coutTotal - compareData.coutTotal)} €</strong>
                        </td>
                    </tr>
                    
                    <!-- FINANCEMENT -->
                    <tr class="section-header">
                        <td colspan="4"><strong>FINANCEMENT</strong></td>
                    </tr>
                    <tr>
                        <td>Votre apport personnel</td>
                        <td>${this.formatNumber(data.coutTotal - data.emprunt)} €</td>
                        <td>${this.formatNumber(compareData.coutTotal - compareData.emprunt)} €</td>
                        <td>0 €</td>
                    </tr>
                    <tr>
                        <td>Montant emprunté</td>
                        <td>${this.formatNumber(data.emprunt)} €</td>
                        <td>${this.formatNumber(compareData.emprunt)} €</td>
                        <td class="${data.emprunt < compareData.emprunt ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.emprunt - compareData.emprunt)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Remboursement mensuel</td>
                        <td>${this.formatNumber(data.mensualite)} €/mois</td>
                        <td>${this.formatNumber(compareData.mensualite)} €/mois</td>
                        <td class="${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.mensualite - compareData.mensualite)} €
                        </td>
                    </tr>
                    
                    <!-- REVENUS LOCATIFS -->
                    <tr class="section-header">
                        <td colspan="4"><strong>REVENUS LOCATIFS</strong></td>
                    </tr>
                    <tr>
                        <td>Surface que vous pouvez acheter</td>
                        <td>${data.surface.toFixed(1)} m²</td>
                        <td>${compareData.surface.toFixed(1)} m²</td>
                        <td class="${data.surface > compareData.surface ? 'positive' : 'negative'}">
                            ${(data.surface - compareData.surface).toFixed(1)} m²
                        </td>
                    </tr>
                    <tr>
                        <td>Loyer mensuel (avant charges)</td>
                        <td>${this.formatNumber(data.loyerBrut)} €</td>
                        <td>${this.formatNumber(compareData.loyerBrut)} €</td>
                        <td class="${data.loyerBrut > compareData.loyerBrut ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.loyerBrut - compareData.loyerBrut)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Provision logement vide</td>
                        <td>-${this.formatNumber(data.loyerBrut - data.loyerNet)} €</td>
                        <td>-${this.formatNumber(compareData.loyerBrut - compareData.loyerNet)} €</td>
                        <td>${this.formatNumber((data.loyerBrut - data.loyerNet) - (compareData.loyerBrut - compareData.loyerNet))} €</td>
                    </tr>
                    <tr>
                        <td>Loyer net mensuel</td>
                        <td>${this.formatNumber(data.loyerNet)} €</td>
                        <td>${this.formatNumber(compareData.loyerNet)} €</td>
                        <td class="${data.loyerNet > compareData.loyerNet ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.loyerNet - compareData.loyerNet)} €
                        </td>
                    </tr>
                    
                    <!-- VOS DÉPENSES MENSUELLES -->
                    <tr class="section-header">
                        <td colspan="4"><strong>VOS DÉPENSES MENSUELLES</strong></td>
                    </tr>
                    <tr>
                        <td>Remboursement du prêt</td>
                        <td>-${this.formatNumber(data.mensualite)} €</td>
                        <td>-${this.formatNumber(compareData.mensualite)} €</td>
                        <td class="${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}">
                            ${this.formatNumber(compareData.mensualite - data.mensualite)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Taxe foncière (par mois)</td>
                        <td>-${this.formatNumber(data.taxeFonciere / 12)} €</td>
                        <td>-${this.formatNumber(compareData.taxeFonciere / 12)} €</td>
                        <td class="${data.taxeFonciere < compareData.taxeFonciere ? 'positive' : 'negative'}">
                            ${this.formatNumber((compareData.taxeFonciere - data.taxeFonciere) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Charges de copropriété</td>
                        <td>-${this.formatNumber(data.chargesNonRecuperables / 12)} €</td>
                        <td>-${this.formatNumber(compareData.chargesNonRecuperables / 12)} €</td>
                        <td class="${data.chargesNonRecuperables < compareData.chargesNonRecuperables ? 'positive' : 'negative'}">
                            ${this.formatNumber((compareData.chargesNonRecuperables - data.chargesNonRecuperables) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Budget entretien</td>
                        <td>-${this.formatNumber(data.entretienAnnuel / 12)} €</td>
                        <td>-${this.formatNumber(compareData.entretienAnnuel / 12)} €</td>
                        <td class="${data.entretienAnnuel < compareData.entretienAnnuel ? 'positive' : 'negative'}">
                            ${this.formatNumber((compareData.entretienAnnuel - data.entretienAnnuel) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Assurance propriétaire</td>
                        <td>-${this.formatNumber(data.assurancePNO / 12)} €</td>
                        <td>-${this.formatNumber(compareData.assurancePNO / 12)} €</td>
                        <td>${this.formatNumber((compareData.assurancePNO - data.assurancePNO) / 12)} €</td>
                    </tr>
                    <tr class="total-row">
                        <td><strong>Total de vos dépenses</strong></td>
                        <td><strong>-${this.formatNumber(data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12)} €</strong></td>
                        <td><strong>-${this.formatNumber(compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12)} €</strong></td>
                        <td><strong>${this.formatNumber((compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12) - (data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12))} €</strong></td>
                    </tr>
                    
                    <!-- RÉSULTAT -->
                    <tr class="section-header">
                        <td colspan="4"><strong>RÉSULTAT</strong></td>
                    </tr>
                    <tr>
                        <td>Cash-flow avant impôts</td>
                        <td class="${data.cashFlow >= 0 ? 'positive' : 'negative'}">${this.formatNumber(data.cashFlow)} €</td>
                        <td class="${compareData.cashFlow >= 0 ? 'positive' : 'negative'}">${this.formatNumber(compareData.cashFlow)} €</td>
                        <td class="${data.cashFlow > compareData.cashFlow ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.cashFlow - compareData.cashFlow)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Gain annuel après impôts théorique</td>
                        <td class="${data.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}">${this.formatNumber(data.cashFlowAnnuel)} €</td>
                        <td class="${compareData.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}">${this.formatNumber(compareData.cashFlowAnnuel)} €</td>
                        <td class="${data.cashFlowAnnuel > compareData.cashFlowAnnuel ? 'positive' : 'negative'}">
                            ${this.formatNumber(data.cashFlowAnnuel - compareData.cashFlowAnnuel)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Rendement de votre investissement</td>
                        <td class="${data.rendementNet >= 0 ? 'positive' : 'negative'}">${data.rendementNet.toFixed(2)} %</td>
                        <td class="${compareData.rendementNet >= 0 ? 'positive' : 'negative'}">${compareData.rendementNet.toFixed(2)} %</td>
                        <td class="${data.rendementNet > compareData.rendementNet ? 'positive' : 'negative'}">
                            ${(data.rendementNet - compareData.rendementNet).toFixed(2)} %
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    /**
     * Génère les cartes de définition
     */
    generateDefinitionCards() {
        const definitions = [
            {
                title: "Cash-flow",
                icon: "fa-coins",
                description: "Le cash-flow représente l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges (crédit, taxes, entretien, etc.). Un cash-flow positif signifie que l'investissement s'autofinance."
            },
            {
                title: "TMI (Taux Marginal d'Imposition)",
                icon: "fa-percentage",
                description: "C'est le taux d'imposition qui s'applique à la tranche la plus élevée de vos revenus. Plus votre TMI est élevé, plus les régimes avec déductions fiscales deviennent intéressants."
            },
            {
                title: "LMNP (Loueur Meublé Non Professionnel)",
                icon: "fa-bed",
                description: "Régime fiscal pour la location meublée permettant d'amortir le bien et le mobilier. Très avantageux car les amortissements réduisent voire annulent l'impôt sur les loyers."
            },
            {
                title: "Déficit foncier",
                icon: "fa-chart-line",
                description: "Lorsque vos charges dépassent vos revenus locatifs, vous créez un déficit déductible de vos autres revenus (jusqu'à 10 700€/an), ce qui réduit votre impôt global."
            },
            {
                title: "Amortissement",
                icon: "fa-clock",
                description: "Déduction comptable représentant la perte de valeur du bien dans le temps. En LMNP, vous pouvez amortir 2-3% du bien par an, réduisant ainsi votre base imposable."
            },
            {
                title: "Rendement",
                icon: "fa-chart-pie",
                description: "Rentabilité de votre investissement calculée en divisant le cash-flow annuel net par le prix total du bien. Plus ce pourcentage est élevé, plus votre investissement est rentable."
            }
        ];
        
        return definitions.map(def => `
            <div class="definition-card">
                <div class="definition-icon">
                    <i class="fas ${def.icon}"></i>
                </div>
                <h4 class="definition-title">${def.title}</h4>
                <p class="definition-text">${def.description}</p>
            </div>
        `).join('');
    }

    /**
     * Génère une carte de régime fiscal
     */
    generateRegimeCard(regime, isBest) {
        return `
            <div class="regime-result ${isBest ? 'best' : ''}">
                <div class="regime-header">
                    <div class="regime-name">
                        <i class="fas ${regime.icone || 'fa-home'}"></i>
                        ${regime.nom}
                    </div>
                    ${isBest ? '<div class="regime-badge">Meilleur choix</div>' : ''}
                </div>
                
                <div class="regime-metrics">
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow mensuel</div>
                        <div class="metric-value ${regime.cashflowMensuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowMensuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Impôt annuel</div>
                        <div class="metric-value negative">
                            ${this.formatNumber(Math.abs(regime.impotAnnuel))} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow net annuel</div>
                        <div class="metric-value ${regime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowNetAnnuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Rendement net</div>
                        <div class="metric-value neutral">
                            ${regime.rendementNet.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                ${regime.avantages && regime.avantages.length > 0 ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <strong style="color: #94a3b8; font-size: 0.9em;">Avantages :</strong>
                        <ul style="margin-top: 10px; list-style: none; padding: 0;">
                            ${regime.avantages.map(a => `<li style="color: #e2e8f0; font-size: 0.9em; margin-top: 5px;">✓ ${a}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Crée les graphiques de comparaison fiscale avec lazy loading - V3
     */
    createFiscalCharts(fiscalResults) {
        // Utiliser lazy loading si disponible
        if (typeof lazyLoadCharts === 'function') {
            lazyLoadCharts('.charts-container', fiscalResults);
        } else {
            // Fallback : création directe
            this._createChartsDirectly(fiscalResults);
        }
    }
    
    /**
     * Création directe des graphiques (fallback ou après lazy load)
     */
    _createChartsDirectly(fiscalResults) {
        // Graphique des cash-flows
        const ctxCashflow = document.getElementById('fiscal-cashflow-chart')?.getContext('2d');
        if (ctxCashflow) {
            new Chart(ctxCashflow, {
                type: 'bar',
                data: {
                    labels: fiscalResults.map(r => r.nom),
                    datasets: [{
                        label: 'Cash-flow net annuel',
                        data: fiscalResults.map(r => r.cashflowNetAnnuel),
                        backgroundColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(0, 191, 255, 0.7)'),
                        borderColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(0, 191, 255, 1)'),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#94a3b8',
                                callback: (value) => this.formatNumber(value) + ' €'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
        
        // Graphique des rendements
        const ctxRendement = document.getElementById('fiscal-rendement-chart')?.getContext('2d');
        if (ctxRendement) {
            new Chart(ctxRendement, {
                type: 'line',
                data: {
                    labels: fiscalResults.map(r => r.nom),
                    datasets: [{
                        label: 'Rendement net',
                        data: fiscalResults.map(r => r.rendementNet),
                        borderColor: 'rgba(0, 191, 255, 1)',
                        backgroundColor: 'rgba(0, 191, 255, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 6,
                        pointBackgroundColor: fiscalResults.map((r, i) => i === 0 ? '#22c55e' : '#00bfff'),
                        pointBorderColor: '#0a0f1e',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#94a3b8',
                                callback: (value) => value.toFixed(1) + '%'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
    }
}

/**
 * Fonction de lazy loading pour les graphiques - V3
 */
function lazyLoadCharts(selector, fiscalResults) {
    const el = document.querySelector(selector);
    if (!el) return;
    
    const obs = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting) {
            // Si Chart.js n'est pas déjà chargé
            if (typeof Chart === 'undefined') {
                // Import dynamique
                await import('https://cdn.jsdelivr.net/npm/chart.js');
            }
            
            // Créer les graphiques
            const analyzer = window.analyzer || new MarketFiscalAnalyzer();
            analyzer._createChartsDirectly(fiscalResults);
            
            // Déconnecter l'observer
            obs.disconnect();
        }
    }, { rootMargin: '200px' }); // Charger 200px avant d'être visible
    
    obs.observe(el);
}

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = MarketFiscalAnalyzer;
} else {
    window.MarketFiscalAnalyzer = MarketFiscalAnalyzer;
    window.lazyLoadCharts = lazyLoadCharts; // Export la fonction de lazy loading
}

// Helpers de debug V3 avec tests unitaires
window.debugFiscalPipeline = function() {
    const analyzer = window.analyzer || new MarketFiscalAnalyzer();
    
    // Données de test
    const testData = {
        price: 200000,
        surface: 60,
        loyerHC: 800,
        monthlyCharges: 50,
        apport: 40000,
        loanRate: 3.5,
        loanDuration: 20,
        tmi: 30,
        typeAchat: 'classique',
        vacanceLocative: 0,
        taxeFonciere: 800,
        gestionLocativeTaux: 0,
        chargesCoproNonRecup: 50,
        entretienAnnuel: 500,
        assurancePNO: 15
    };
    
    console.group('🔍 Debug Pipeline Fiscal V3');
    
    // 1. Test prepareFiscalData (sans DOM)
    const fiscalData = {
        ...testData,
        yearlyRent: testData.loyerHC * 12,
        loanAmount: testData.price - testData.apport,
        monthlyPayment: analyzer.calculateMonthlyPayment(160000, 3.5, 20)
    };
    console.log('1️⃣ Fiscal Data simulée:', fiscalData);
    
    // 2. Test adaptation
    const comparatorData = analyzer.prepareFiscalDataForComparator(fiscalData);
    console.log('2️⃣ Comparator Data:', comparatorData);
    console.log('   - loyerBrutHC:', comparatorData.loyerBrutHC);
    console.log('   - loyerBrutCC:', comparatorData.loyerBrutCC);
    console.log('   - chargesNonRecuperables annuel:', comparatorData.chargesNonRecuperables);
    
    // 3. Tests unitaires
    console.group('3️⃣ Tests unitaires');
    
    // Test Micro-foncier
    const microFoncierCalc = analyzer.getDetailedCalculations(
        { nom: 'Micro-foncier' }, 
        fiscalData, 
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    const abattementTest = microFoncierCalc.baseImposable / (fiscalData.loyerHC * 12);
    console.log('✓ Micro-foncier abattement 30%:', 
        Math.abs(abattementTest - 0.70) < 0.01 ? '✅ PASS' : '❌ FAIL', 
        `(${abattementTest.toFixed(2)} vs 0.70 attendu)`
    );
    
    // Test LMNP base imposable jamais négative
    const lmnpCalc = analyzer.getDetailedCalculations(
        { nom: 'LMNP au réel' }, 
        { ...fiscalData, loyerHC: 100 }, // Très faible loyer
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    console.log('✓ LMNP base imposable >= 0:', 
        lmnpCalc.baseImposable >= 0 ? '✅ PASS' : '❌ FAIL',
        `(${lmnpCalc.baseImposable})`
    );
    
    // Test SCI IS taux réduit
    const sciCalc = analyzer.getDetailedCalculations(
        { nom: 'SCI à l\'IS' }, 
        { ...fiscalData, loyerHC: 3000 }, 
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    const tauxEffectif = sciCalc.impotRevenu / sciCalc.baseImposable;
    console.log('✓ SCI IS taux 15% si < 42500€:', 
        Math.abs(tauxEffectif - 0.15) < 0.01 ? '✅ PASS' : '❌ FAIL',
        `(${(tauxEffectif * 100).toFixed(1)}% vs 15% attendu)`
    );
    
    console.groupEnd();
    
    // 4. Vérifier chaque régime
    console.log('4️⃣ Test par régime:');
    ['Micro-foncier', 'Location nue au réel', 'LMNP Micro-BIC', 'LMNP au réel', 'SCI à l\'IS'].forEach(regimeName => {
        const regime = { nom: regimeName };
        const calc = analyzer.getDetailedCalculations(regime, fiscalData, analyzer.getAllAdvancedParams(), {});
        console.log(`${regimeName}:`, {
            baseImposable: calc.baseImposable,
            totalImpots: calc.totalImpots,
            cashflow: calc.cashflowNetAnnuel,
            chargesDeductibles: calc.totalCharges
        });
    });
    
    console.groupEnd();
};

// Nouvelle fonction de test pour vérifier les calculs
window.testFiscalCalculations = function() {
    console.group('🧪 Tests de calculs fiscaux');
    
    const analyzer = new MarketFiscalAnalyzer();
    let passed = 0;
    let failed = 0;
    
    // Test 1: Mensualité de prêt
    const mensualite = analyzer.calculateMonthlyPayment(160000, 3.5, 20);
    const expectedMensualite = 928.37; // Valeur attendue
    if (Math.abs(mensualite - expectedMensualite) < 1) {
        console.log('✅ Test mensualité: PASS');
        passed++;
    } else {
        console.log('❌ Test mensualité: FAIL', mensualite, 'vs', expectedMensualite);
        failed++;
    }
    
    // Test 2: Charges non récupérables annuelles
    const testData = { chargesCoproNonRecup: 50 };
    const adapted = analyzer.prepareFiscalDataForComparator(testData);
    if (adapted.chargesNonRecuperables === 600) { // 50 * 12
        console.log('✅ Test charges annuelles: PASS');
        passed++;
    } else {
        console.log('❌ Test charges annuelles: FAIL', adapted.chargesNonRecuperables);
        failed++;
    }
    
    console.log(`\n📊 Résultats: ${passed} PASS, ${failed} FAIL`);
    console.groupEnd();
};
