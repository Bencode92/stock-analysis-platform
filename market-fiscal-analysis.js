/**
 * market-fiscal-analysis.js
 * Module d'intégration pour l'analyse de marché et la comparaison fiscale
 * Complète la page comparaison-fiscale.html
 */

class MarketFiscalAnalyzer {
    constructor() {
        this.simulateur = new SimulateurImmo();
        this.comparateur = new FiscalComparator(this.simulateur);
        this.propertyData = null;
        this.marketAnalysis = null;
    }

    /**
     * Effectue l'analyse complète (marché + fiscal)
     */
    async performCompleteAnalysis(data) {
        // 1. Analyse de marché
        this.marketAnalysis = this.analyzeMarketPosition(data);
        
        // 2. Préparation des données pour la comparaison fiscale
        const fiscalData = this.prepareFiscalData(data);
        
        // 3. Comparaison des régimes fiscaux
        const fiscalResults = await this.comparateur.compareAllRegimes(fiscalData);
        
        return {
            market: this.marketAnalysis,
            fiscal: fiscalResults,
            recommendations: this.generateGlobalRecommendations(this.marketAnalysis, fiscalResults)
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
     * Calcule tous les détails pour un régime donné
     */
    getDetailedCalculations(regime, inputData, params) {
        const loyerHC = inputData.loyerHC;
        const loyerAnnuelBrut = loyerHC * 12;
        const vacanceAmount = loyerAnnuelBrut * (inputData.vacanceLocative / 100);
        const loyerNetVacance = loyerAnnuelBrut - vacanceAmount;
        const fraisGestion = params.gestionLocativeTaux > 0 ? loyerNetVacance * (params.gestionLocativeTaux / 100) : 0;
        const revenusNets = loyerNetVacance - fraisGestion;
        
        // Calcul des intérêts annuels (approximation)
        const tauxMensuel = inputData.loanRate / 100 / 12;
        const nombreMensualites = inputData.loanDuration * 12;
        const mensualite = inputData.monthlyPayment;
        const interetsAnnuels = mensualite * 12 - (inputData.loanAmount / inputData.loanDuration);
        
        // Amortissement selon le régime
        const tauxAmortissement = regime.nom.includes('LMNP') ? 2.5 : 0;
        const amortissementBien = tauxAmortissement > 0 ? inputData.price * tauxAmortissement / 100 : 0;
        const amortissementMobilier = regime.nom.includes('LMNP') && regime.nom.includes('meublé') ? 
            inputData.price * 0.1 * 0.1 : 0; // 10% du prix en mobilier, amorti à 10%
        
        // NOUVEAU : Utiliser entretienAnnuel au lieu de travaux
        const entretienAnnuel = params.entretienAnnuel || 500;
        
        // Charges de copropriété
        const chargesCopro = inputData.chargesRecuperables * 12;
        // NOUVEAU : Ajouter les charges non récupérables
        const chargesCoproNonRecup = params.chargesCoproNonRecup * 12;
        
        // Total charges déductibles
        const totalCharges = interetsAnnuels + amortissementBien + amortissementMobilier + 
            params.taxeFonciere + chargesCopro + chargesCoproNonRecup + (params.assurancePNO * 12) + 
            entretienAnnuel + fraisGestion;
        
        // Base imposable et impôts
        const baseImposable = Math.max(0, revenusNets - totalCharges);
        const impotRevenu = baseImposable * (inputData.tmi / 100);
        const prelevementsSociaux = regime.nom.includes('LMNP') ? 0 : baseImposable * 0.172;
        const totalImpots = impotRevenu + prelevementsSociaux;
        
        // Cash-flow
        const capitalAnnuel = (mensualite * 12) - interetsAnnuels;
        const chargesNonDeductibles = 0; // Simplification
        const cashflowNetAnnuel = revenusNets - totalImpots - capitalAnnuel - chargesNonDeductibles;
        
        return {
            // Revenus
            loyerHC,
            loyerAnnuelBrut,
            vacanceLocative: inputData.vacanceLocative,
            vacanceAmount,
            gestionLocative: params.gestionLocative,
            fraisGestion,
            revenusNets,
            
            // Charges
            interetsAnnuels,
            tauxAmortissement,
            amortissementBien,
            amortissementMobilier,
            chargesCopro,
            chargesCoproNonRecup, // NOUVEAU
            entretienAnnuel,
            fraisDivers: 100, // Forfait
            totalCharges,
            
            // Fiscalité
            baseImposable,
            impotRevenu,
            prelevementsSociaux,
            totalImpots,
            
            // Cash-flow
            capitalAnnuel,
            chargesNonDeductibles,
            cashflowNetAnnuel,
            
            // Autres infos utiles
            loyerType: inputData.loyerType || 'hc',
            regime: regime.nom
        };
    }

    /**
     * Construit le tableau détaillé complet
     */
    buildDetailedTable(regime, inputData) {
        const params = this.getAllAdvancedParams();
        const calc = this.getDetailedCalculations(regime, inputData, params);
        
        return `
            <table class="detailed-comparison-table" role="table">
                <caption class="sr-only">Détail complet des calculs fiscaux pour le régime ${regime.nom}</caption>
                <thead>
                    <tr>
                        <th colspan="3">📊 DÉTAIL COMPLET - ${regime.nom.toUpperCase()}</th>
                    </tr>
                </thead>
                <tbody>
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
        const charges = [
            { label: "Intérêts d'emprunt", value: calc.interetsAnnuels, formula: "Selon échéancier" },
            calc.amortissementBien > 0 ? { label: "Amortissement bien", value: calc.amortissementBien, formula: `${calc.tauxAmortissement}% × valeur` } : null,
            calc.amortissementMobilier > 0 ? { label: "Amortissement mobilier", value: calc.amortissementMobilier, formula: "10% × 10% du prix" } : null,
            { label: "Taxe foncière", value: params.taxeFonciere, formula: "Paramètre avancé" },
            { label: "Charges copro récupérables", value: calc.chargesCopro, formula: "12 × charges mensuelles" },
            calc.chargesCoproNonRecup > 0 ? { label: "Charges copro non récupérables", value: calc.chargesCoproNonRecup, formula: `${params.chargesCoproNonRecup} × 12` } : null,
            { label: "Assurance PNO", value: params.assurancePNO * 12, formula: `${params.assurancePNO} × 12` },
            { label: "Entretien annuel", value: calc.entretienAnnuel, formula: "Budget annuel" },
            { label: "Frais divers", value: calc.fraisDivers, formula: "Comptable, etc." }
        ].filter(Boolean).sort((a, b) => b.value - a.value);
        
        return `
            <tr class="section-header">
                <td colspan="3"><strong>📉 CHARGES DÉDUCTIBLES</strong></td>
            </tr>
            ${charges.map(charge => `
            <tr>
                <td>${charge.label}</td>
                <td class="text-right negative">-${this.formatCurrency(charge.value)}</td>
                <td class="formula">${charge.formula}</td>
            </tr>
            `).join('')}
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
                <td>Impôt sur le revenu (TMI ${inputData.tmi}%)</td>
                <td class="text-right negative">-${this.formatCurrency(calc.impotRevenu)}</td>
                <td class="formula">= Base × ${inputData.tmi}%</td>
            </tr>
            ${calc.prelevementsSociaux > 0 ? `
            <tr>
                <td>Prélèvements sociaux (17.2%)</td>
                <td class="text-right negative">-${this.formatCurrency(calc.prelevementsSociaux)}</td>
                <td class="formula">Sauf LMNP</td>
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
     */
    buildIndicateursSection(calc, inputData) {
        const rendementBrut = (calc.loyerAnnuelBrut / inputData.price) * 100;
        const rendementNet = (calc.cashflowNetAnnuel / inputData.price) * 100;
        const tauxEndettement = inputData.monthlyPayment / (calc.loyerHC * (1 - calc.vacanceLocative/100)) * 100;
        
        return `
            <tr class="section-header">
                <td colspan="3"><strong>📈 INDICATEURS DE PERFORMANCE</strong></td>
            </tr>
            <tr>
                <td>Rendement brut</td>
                <td class="text-right">${rendementBrut.toFixed(2)}%</td>
                <td class="formula">= Loyer brut / Prix</td>
            </tr>
            <tr>
                <td>Rendement net après impôts</td>
                <td class="text-right ${rendementNet >= 0 ? 'positive' : 'negative'}">${rendementNet.toFixed(2)}%</td>
                <td class="formula">= Cash-flow / Prix</td>
            </tr>
            <tr>
                <td>Taux d'endettement</td>
                <td class="text-right">${tauxEndettement.toFixed(0)}%</td>
                <td class="formula">= Mensualité / Loyer net</td>
            </tr>
            <tr>
                <td>Économie d'impôt annuelle</td>
                <td class="text-right positive">+${this.formatCurrency(calc.baseImposable * inputData.tmi / 100 - calc.totalImpots)}</td>
                <td class="formula">Grâce au régime ${calc.regime}</td>
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
    
    // Calculer les données dérivées
    const loanAmount = formData.price - formData.apport;
    const monthlyPayment = this.calculateMonthlyPayment(loanAmount, formData.loanRate, formData.loanDuration);
    const yearlyRent = loyerHC * 12 * (1 - formData.vacanceLocative / 100);
    const yearlyCharges = charges * 12;
    
    // Ajouter les frais de gestion si applicable
    const gestionFees = formData.gestionLocativeTaux > 0 ? 
    yearlyRent * (formData.gestionLocativeTaux / 100) : 0;
    
    // NOUVEAU : Calculer le coût total d'acquisition
    const coutTotalAcquisition = formData.price + formData.travauxRenovation;
    
    // Stocker dans la console pour debug
    console.log('📊 Données fiscales préparées:', formData);
    console.log('🏙️ Ville sélectionnée:', villeData);
    console.log('💸 Coût total acquisition:', coutTotalAcquisition);
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
        coutTotalAcquisition, // NOUVEAU
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
                    <p class="amount">${this.formatCurrency(bestRegime.cashflowMensuel)}</p>
                </div>
                <div class="benefit-item">
                    <h4>📉 Économie d'impôt annuelle</h4>
                    <p class="amount">${this.formatCurrency(Math.max(0, impotEstime - Math.abs(bestRegime.impotAnnuel)))}</p>
                </div>
            </div>
            
            <!-- Détail du calcul -->
            <div class="fiscal-calculation-details">
                <h4>📋 Détail du calcul avec vos données</h4>
                <table class="calculation-table">
                    <tr>
                        <td>Revenus locatifs annuels (HC):</td>
                        <td class="positive">+${this.formatCurrency(inputData.yearlyRent)}</td>
                    </tr>
                    <tr>
                        <td>Charges déductibles:</td>
                        <td class="negative">-${this.formatCurrency(chargesDeductibles)}</td>
                    </tr>
                    <tr>
                        <td>Base imposable:</td>
                        <td>${this.formatCurrency(baseImposable)}</td>
                    </tr>
                    <tr>
                        <td>Impôt (TMI ${inputData.tmi}%):</td>
                        <td class="negative">-${this.formatCurrency(Math.abs(bestRegime.impotAnnuel))}</td>
                    </tr>
                    <tr>
                        <td>Mensualité crédit:</td>
                        <td class="negative">-${this.formatCurrency(inputData.monthlyPayment * 12)}</td>
                    </tr>
                    <tr class="total-row">
                        <td><strong>Résultat net annuel:</strong></td>
                        <td class="${bestRegime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                            <strong>${this.formatCurrency(bestRegime.cashflowNetAnnuel)}</strong>
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
                        <th>Rendement</th>
                    </tr>
                </thead>
                <tbody>
                    ${fiscalResults.map(regime => {
                        const rendementSurPrix = ((regime.cashflowNetAnnuel / inputData.price) * 100);
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
                            <td class="${rendementSurPrix > 0 ? 'positive' : 'negative'}">
                                ${rendementSurPrix.toFixed(2)}%
                            </td>
                        </tr>
                    `}).join('')}
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
     * Crée les graphiques de comparaison fiscale
     */
    createFiscalCharts(fiscalResults) {
        // Graphique des cash-flows
        const ctxCashflow = document.getElementById('fiscal-cashflow-chart').getContext('2d');
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
        
        // Graphique des rendements
        const ctxRendement = document.getElementById('fiscal-rendement-chart').getContext('2d');
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

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = MarketFiscalAnalyzer;
} else {
    window.MarketFiscalAnalyzer = MarketFiscalAnalyzer;
}
