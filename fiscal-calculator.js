/**
 * Calculateur fiscal exact - TradePulse
 * Calcule l'imposition selon les tranches progressives 2024 et simule l'impact du PER
 */

/**
 * Calcul fiscal exact avec tranches d'imposition progressives 2024
 * @param {Object} params - Paramètres de calcul
 * @param {number} params.brutAnnuel - Salaire brut annuel
 * @param {number} params.tauxNeutre - Taux de charges sociales (ex: 0.22 pour 22%)
 * @param {number} params.perPourcentage - Pourcentage du salaire net versé sur un PER (ex: 0.05 pour 5%)
 * @returns {Object} Résultats détaillés du calcul fiscal
 */
function calculFiscalExact(params) {
    // Paramètres par défaut si non fournis
    const brutAnnuel = params.brutAnnuel || 0;
    const tauxNeutre = params.tauxNeutre || 0.22;
    const perPourcentage = params.perPourcentage || 0;
    
    // Calcul du net avant impôt
    const netAvantImpot = brutAnnuel * (1 - tauxNeutre);
    
    // Montant versé sur le PER
    const montantPER = netAvantImpot * perPourcentage;
    
    // Revenu imposable sans et avec PER
    const revenuImposableSansPER = netAvantImpot;
    const revenuImposableAvecPER = netAvantImpot - montantPER;
    
    // Tranches d'imposition 2024 (France)
    const tranches = [
        { limite: 10777, taux: 0 },      // 0%
        { limite: 27478, taux: 0.11 },   // 11%
        { limite: 78570, taux: 0.30 },   // 30%
        { limite: 168994, taux: 0.41 },  // 41%
        { limite: Infinity, taux: 0.45 } // 45%
    ];
    
    // Calcul de l'impôt selon les tranches progressives
    function calculImpot(revenuImposable) {
        let impot = 0;
        let revenuRestant = revenuImposable;
        let tranchePrecedente = 0;
        
        for (const tranche of tranches) {
            // Montant imposable dans cette tranche
            const montantDansLaTranche = Math.min(
                Math.max(0, revenuImposable - tranchePrecedente),
                tranche.limite - tranchePrecedente
            );
            
            // Impôt pour cette tranche
            impot += montantDansLaTranche * tranche.taux;
            
            // Mise à jour de la tranche précédente
            tranchePrecedente = tranche.limite;
            
            // Si on a dépassé le revenu imposable, on s'arrête
            if (tranchePrecedente > revenuImposable) break;
        }
        
        return impot;
    }
    
    // Calcul des impôts sans et avec PER
    const impotSansPER = calculImpot(revenuImposableSansPER);
    const impotAvecPER = calculImpot(revenuImposableAvecPER);
    
    // Économie d'impôt
    const economieImpot = impotSansPER - impotAvecPER;
    
    // Taux moyen d'imposition
    const tauxMoyenImposition = (impotAvecPER / revenuImposableAvecPER) * 100;
    
    // Revenu net après impôt
    const revenuNetApresImpot = netAvantImpot - montantPER - impotAvecPER;
    
    // Patrimoine total (revenu net + PER)
    const patrimoineTotal = revenuNetApresImpot + montantPER;
    
    // Revenu mensuel
    const revenuMensuelNet = revenuNetApresImpot / 12;
    
    return {
        brutAnnuel,
        netAvantImpot,
        montantPER,
        revenuImposableSansPER,
        revenuImposableAvecPER,
        impotSansPER,
        impotAvecPER,
        economieImpot,
        tauxMoyenImposition,
        revenuNetApresImpot,
        patrimoineTotal,
        revenuMensuelNet
    };
}

/**
 * Calcule la capacité d'investissement basée sur le revenu et les dépenses
 * @param {Object} params - Paramètres de calcul
 * @param {number} params.revenuMensuelNet - Revenu mensuel net après impôts
 * @param {number} params.depenseLogement - Dépenses mensuelles pour le logement
 * @param {number} params.depenseEnergie - Dépenses mensuelles pour l'énergie et les télécommunications
 * @param {number} params.depenseAlimentation - Dépenses mensuelles pour l'alimentation
 * @param {number} params.depenseTransport - Dépenses mensuelles pour le transport
 * @param {number} params.depenseDivers - Autres dépenses mensuelles
 * @returns {Object} Résultats du calcul du budget
 */
function calculBudget(params) {
    // Paramètres par défaut si non fournis
    const revenuMensuelNet = params.revenuMensuelNet || 0;
    const depenseLogement = params.depenseLogement || 0;
    const depenseEnergie = params.depenseEnergie || 0;
    const depenseAlimentation = params.depenseAlimentation || 0;
    const depenseTransport = params.depenseTransport || 0;
    const depenseDivers = params.depenseDivers || 0;
    
    // Total des dépenses mensuelles
    const depensesTotales = depenseLogement + depenseEnergie + depenseAlimentation + depenseTransport + depenseDivers;
    
    // Capacité d'investissement
    const capaciteInvestissement = Math.max(0, revenuMensuelNet - depensesTotales);
    
    // Taux d'épargne (en %)
    const tauxEpargne = (capaciteInvestissement / revenuMensuelNet) * 100;
    
    // Structure du budget (en pourcentage)
    const structureBudget = {
        logement: (depenseLogement / revenuMensuelNet) * 100,
        energie: (depenseEnergie / revenuMensuelNet) * 100,
        alimentation: (depenseAlimentation / revenuMensuelNet) * 100,
        transport: (depenseTransport / revenuMensuelNet) * 100,
        divers: (depenseDivers / revenuMensuelNet) * 100,
        investissement: tauxEpargne
    };
    
    return {
        revenuMensuelNet,
        depensesTotales,
        capaciteInvestissement,
        tauxEpargne,
        structureBudget
    };
}
