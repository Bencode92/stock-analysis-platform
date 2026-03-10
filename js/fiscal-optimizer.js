/**
 * fiscal-optimizer.js - Module de simulation patrimoniale complète
 * TradePulse Finance Intelligence Platform
 * 
 * Version 3.0 - Corrections majeures :
 *   - PASS 2026 (48 060 €) + fallback 2025 (47 100 €)
 *   - Tranches IR revenus 2024 (barème 2025) corrigées
 *   - Plafond TNS élargi (10% de 8 PASS + 15% de 7 PASS)
 *   - Plafonnement du quotient familial (1 759 €/demi-part)
 *   - Avertissement fiscalité à la sortie du PER
 *   - CSG déductible 6,8% intégrée
 */

const PatrimoineSimulator = (function() {

    // =====================================================================
    // CONSTANTES FISCALES — Sources : CGI, arrêtés PASS, BOFiP
    // =====================================================================

    const PASS_PAR_ANNEE = {
        2024: 46368,
        2025: 47100,
        2026: 48060
    };

    let ANNEE_SIMULATION = 2026;
    let PASS_REF = PASS_PAR_ANNEE[ANNEE_SIMULATION];

    function getPlafondsPER() {
        const pass = PASS_PAR_ANNEE[ANNEE_SIMULATION] || PASS_PAR_ANNEE[2026];
        return {
            SALARIE_MIN: Math.round(pass * 0.10),
            SALARIE_MAX: Math.round(pass * 0.10 * 8),
            TNS_MIN: Math.round(pass * 0.10),
            TNS_MAX: Math.round(pass * 0.10 * 8 + pass * 0.15 * 7)
        };
    }

    const TRANCHES_IMPOT = [
        { min: 0,       max: 11497,   taux: 0    },
        { min: 11497,   max: 29315,   taux: 0.11 },
        { min: 29315,   max: 83823,   taux: 0.30 },
        { min: 83823,   max: 180294,  taux: 0.41 },
        { min: 180294,  max: Infinity, taux: 0.45 }
    ];

    const PLAFOND_QF_DEMI_PART = 1759;
    const TAUX_CSG_DEDUCTIBLE = 0.068;

    const CHARGES_PAR_TYPE = {
        salarie:       0.22,
        cadre:         0.25,
        fonctionnaire: 0.17,
        independant:   0.45,
        dividendes:    0.172,
        microEntrepreneur: {
            service:    0.22,
            commercial: 0.123,
            artisanal:  0.123
        }
    };

    const FISCALITE_SORTIE_PER = {
        tauxPS: 0.172,
        abattementRenteVieillesse: 0.10
    };

    const CONFIG_DEFAUT = {
        typeRevenu: 'salarie',
        taux_charges: CHARGES_PAR_TYPE.salarie,
        per_pourcentage: 0.10,
        nbParts: 1,
        budget: { loyer: 0, quotidien: 0, extra: 0, investAuto: 0 },
        allocation: { etf: 0.40, assuranceVie: 0.25, scpi: 0.15, crypto: 0.10, autres: 0.10 },
        perPlafondsReportables: { n1: 0, n2: 0, n3: 0 }
    };

    let state = {
        revenuBrut: 0,
        typeRevenu: CONFIG_DEFAUT.typeRevenu,
        tauxCharges: CONFIG_DEFAUT.taux_charges,
        perPourcentage: CONFIG_DEFAUT.per_pourcentage,
        nbParts: CONFIG_DEFAUT.nbParts,
        budget: {...CONFIG_DEFAUT.budget},
        allocation: {...CONFIG_DEFAUT.allocation},
        perPlafondsReportables: {...CONFIG_DEFAUT.perPlafondsReportables},
        resultats: {
            netImposableSansPER: 0, netImposableAvecPER: 0,
            perVersement: 0, perDeductible: 0, perNonDeductible: 0,
            impotSansPER: 0, impotAvecPER: 0, gainFiscal: 0,
            netDispoSansPER: 0, netDispoAvecPER: 0, patrimoineGlobal: 0,
            tauxMoyenSansPER: 0, tauxMoyenAvecPER: 0,
            plafondPERActuel: 0, plafondPERTotalDispo: 0,
            perUtilisationParAnnee: { n3: 0, n2: 0, n1: 0, n: 0 },
            perPlafondsRestants: { n3: 0, n2: 0, n1: 0, n: 0 },
            depensesTotales: 0, epargneTotale: 0, tauxEpargne: 0, montantDispo: 0,
            allocations: { etf: 0, assuranceVie: 0, scpi: 0, crypto: 0, autres: 0 }
        }
    };

    function setAnnee(annee) {
        if (PASS_PAR_ANNEE[annee]) {
            ANNEE_SIMULATION = annee;
            PASS_REF = PASS_PAR_ANNEE[annee];
            console.log(`Année de simulation → ${annee} (PASS = ${PASS_REF} €)`);
        } else {
            console.warn(`Année ${annee} non supportée. Disponibles : ${Object.keys(PASS_PAR_ANNEE).join(', ')}`);
        }
    }

    function calculerImpot(revenuImposable, nbParts = null) {
        const parts = nbParts || state.nbParts || 1;
        const partsBase = parts <= 2 ? parts : (parts >= 2 ? 2 : 1);
        const demiPartsSupp = (parts - partsBase) * 2;
        const impotAvecQF = _calculerImpotBrut(revenuImposable, parts);
        const impotSansQF = _calculerImpotBrut(revenuImposable, partsBase);
        const avantageQF = impotSansQF - impotAvecQF;
        const plafondAvantage = demiPartsSupp * PLAFOND_QF_DEMI_PART;
        if (avantageQF > plafondAvantage && demiPartsSupp > 0) {
            return Math.round(Math.max(0, impotSansQF - plafondAvantage));
        }
        return Math.round(impotAvecQF);
    }

    function _calculerImpotBrut(revenuImposable, parts) {
        const revenuParPart = revenuImposable / parts;
        let impotParPart = 0;
        for (let i = 1; i < TRANCHES_IMPOT.length; i++) {
            const tranche = TRANCHES_IMPOT[i];
            const tranchePrecedente = TRANCHES_IMPOT[i - 1];
            if (revenuParPart > tranchePrecedente.max) {
                const montantDansTranche = Math.min(revenuParPart, tranche.max) - tranchePrecedente.max;
                impotParPart += montantDansTranche * tranche.taux;
            }
        }
        return Math.round(impotParPart * parts * 100) / 100;
    }

    function getTauxCharges(typeRevenu, sousType = null) {
        if (typeRevenu === 'microEntrepreneur' && sousType) {
            return CHARGES_PAR_TYPE.microEntrepreneur[sousType] || CHARGES_PAR_TYPE.microEntrepreneur.service;
        }
        return CHARGES_PAR_TYPE[typeRevenu] || CHARGES_PAR_TYPE.salarie;
    }

    function getTauxMarginal(revenuImposable, nbParts = null) {
        const parts = nbParts || state.nbParts || 1;
        const revenuParPart = revenuImposable / parts;
        for (let i = TRANCHES_IMPOT.length - 1; i >= 0; i--) {
            if (revenuParPart > TRANCHES_IMPOT[i].min) {
                return TRANCHES_IMPOT[i].taux * 100;
            }
        }
        return 0;
    }

    function calculerPlafondsPER(revenuProNet, plafondsReportables = null, typeRevenu = null) {
        const reportables = plafondsReportables || state.perPlafondsReportables;
        const type = typeRevenu || state.typeRevenu;
        const plafonds = getPlafondsPER();
        const isTNS = (type === 'independant');
        let plafondN;
        if (isTNS) {
            const beneficePlafonne = Math.min(revenuProNet, PASS_REF * 8);
            const enveloppe1 = beneficePlafonne * 0.10;
            const tranche1a8 = Math.max(0, Math.min(revenuProNet, PASS_REF * 8) - PASS_REF);
            const enveloppe2 = tranche1a8 * 0.15;
            const plafondTheorique = enveloppe1 + enveloppe2;
            plafondN = Math.max(plafonds.TNS_MIN, Math.round(plafondTheorique));
        } else {
            const plafondTheorique = revenuProNet * 0.10;
            plafondN = Math.max(plafonds.SALARIE_MIN, Math.min(Math.round(plafondTheorique), plafonds.SALARIE_MAX));
        }
        const plafondsParAnnee = {
            n3: Math.max(reportables.n3 || 0, 0),
            n2: Math.max(reportables.n2 || 0, 0),
            n1: Math.max(reportables.n1 || 0, 0),
            n:  plafondN
        };
        const totalReports = plafondsParAnnee.n3 + plafondsParAnnee.n2 + plafondsParAnnee.n1;
        const totalDisponible = totalReports + plafondN;
        return { plafondN, plafondsParAnnee, totalDisponible, totalReports, isTNS };
    }

    function allouerVersementPER(montant, plafondsParAnnee) {
        const ordre = ['n3', 'n2', 'n1', 'n'];
        const utilisation = { n3: 0, n2: 0, n1: 0, n: 0 };
        const plafondsRestants = { n3: 0, n2: 0, n1: 0, n: 0 };
        let restant = montant;
        for (const annee of ordre) {
            if (restant <= 0) break;
            const dispo = plafondsParAnnee[annee] || 0;
            if (dispo <= 0) continue;
            const utilise = Math.min(restant, dispo);
            utilisation[annee] = utilise;
            restant -= utilise;
        }
        for (const annee of ordre) {
            plafondsRestants[annee] = Math.max(0, (plafondsParAnnee[annee] || 0) - (utilisation[annee] || 0));
        }
        return { utilisation, perDeductible: montant - restant, perNonDeductible: restant, plafondsRestants };
    }

    function calculerPlafondsAnneeProchaine(plafondsRestants) {
        return { n3: plafondsRestants.n2 || 0, n2: plafondsRestants.n1 || 0, n1: plafondsRestants.n || 0 };
    }

    function calculerVersementOptimalPourChangerTranche(revenuImposable, plafondsReportables = null, nbParts = null, typeRevenu = null) {
        const reportables = plafondsReportables || state.perPlafondsReportables;
        const parts = nbParts || state.nbParts || 1;
        const revenuParPart = revenuImposable / parts;
        const { plafondsParAnnee, totalDisponible } = calculerPlafondsPER(revenuImposable, reportables, typeRevenu);
        let trancheIndex = 0;
        for (let i = 0; i < TRANCHES_IMPOT.length; i++) {
            if (revenuParPart > TRANCHES_IMPOT[i].min) trancheIndex = i;
        }
        if (trancheIndex <= 1) {
            const plafondsRestants = { ...plafondsParAnnee };
            return {
                versementOptimal: 0, nouvelleTMI: trancheIndex === 0 ? 0 : 11, ancienneTMI: trancheIndex === 0 ? 0 : 11,
                allocationParAnnee: { n3: 0, n2: 0, n1: 0, n: 0 }, totalPlafondDisponible: totalDisponible,
                economieImpot: 0, peutChangerTranche: false, plafondsRestants,
                plafondsAnneeProchaine: calculerPlafondsAnneeProchaine(plafondsRestants),
                message: trancheIndex === 0 ? "Tranche 0%, pas d'optimisation PER nécessaire." : "Tranche 11%, descendre à 0% n'est généralement pas optimal."
            };
        }
        const trancheCourante = TRANCHES_IMPOT[trancheIndex];
        const ancienneTMI = trancheCourante.taux * 100;
        const montantTotalNecessaire = Math.max(0, revenuParPart - trancheCourante.min) * parts;
        const versementOptimal = Math.min(montantTotalNecessaire, totalDisponible);
        const { utilisation, perDeductible, plafondsRestants } = allouerVersementPER(versementOptimal, plafondsParAnnee);
        const nouveauRevenuImposable = revenuImposable - perDeductible;
        const nouvelleTMI = getTauxMarginal(nouveauRevenuImposable, parts);
        const economieImpot = calculerImpot(revenuImposable, parts) - calculerImpot(nouveauRevenuImposable, parts);
        const peutChangerTranche = versementOptimal >= montantTotalNecessaire;
        return {
            versementOptimal: Math.round(versementOptimal), nouvelleTMI, ancienneTMI,
            allocationParAnnee: utilisation, totalPlafondDisponible: totalDisponible,
            economieImpot: Math.round(economieImpot), peutChangerTranche, plafondsRestants,
            plafondsAnneeProchaine: calculerPlafondsAnneeProchaine(plafondsRestants),
            message: peutChangerTranche
                ? `En versant ${Math.round(versementOptimal).toLocaleString('fr-FR')} €, vous passez de ${ancienneTMI}% à ${nouvelleTMI}%.`
                : `Plafond insuffisant pour sortir de la tranche ${ancienneTMI}%. Max: ${Math.round(totalDisponible).toLocaleString('fr-FR')} €`
        };
    }

    function estimerFiscaliteSortiePER(totalVerse, plusValues, tmiSortie = 30) {
        const irSurCapital = totalVerse * (tmiSortie / 100);
        const pfuSurPV = plusValues * 0.30;
        const totalFiscaliteSortie = irSurCapital + pfuSurPV;
        const montantTotal = totalVerse + plusValues;
        const tauxEffectif = montantTotal > 0 ? (totalFiscaliteSortie / montantTotal) * 100 : 0;
        return {
            irSurCapital: Math.round(irSurCapital), pfuSurPlusValues: Math.round(pfuSurPV),
            totalFiscaliteSortie: Math.round(totalFiscaliteSortie),
            tauxEffectifSortie: Math.round(tauxEffectif * 10) / 10,
            avertissement: tmiSortie >= 30
                ? "⚠️ TMI sortie ≥ 30% : l'avantage PER est surtout un différé d'impôt. L'intérêt dépend du rendement entre-temps."
                : "✅ TMI plus basse à la retraite : le PER génère un gain fiscal net en plus de l'effet de trésorerie."
        };
    }

    function calculerSimulationFiscale(params = {}) {
        state.revenuBrut = params.revenuBrut || state.revenuBrut;
        state.typeRevenu = params.typeRevenu || state.typeRevenu;
        state.tauxCharges = params.tauxCharges || getTauxCharges(state.typeRevenu, params.sousType);
        state.perPourcentage = params.perPourcentage !== undefined ? params.perPourcentage : state.perPourcentage;
        state.nbParts = params.nbParts || state.nbParts || 1;
        if (params.plafondsReportables) {
            state.perPlafondsReportables = { n1: params.plafondsReportables.n1 || 0, n2: params.plafondsReportables.n2 || 0, n3: params.plafondsReportables.n3 || 0 };
        }
        const revenuNetCharges = state.revenuBrut * (1 - state.tauxCharges);
        const netImposableSansPER = revenuNetCharges;
        const { plafondN, plafondsParAnnee, totalDisponible } = calculerPlafondsPER(netImposableSansPER, state.perPlafondsReportables, state.typeRevenu);
        const perVersement = state.revenuBrut * state.perPourcentage;
        const { utilisation, perDeductible, perNonDeductible, plafondsRestants } = allouerVersementPER(perVersement, plafondsParAnnee);
        const netImposableAvecPER = netImposableSansPER - perDeductible;
        const impotSansPER = calculerImpot(netImposableSansPER);
        const impotAvecPER = calculerImpot(netImposableAvecPER);
        const gainFiscal = impotSansPER - impotAvecPER;
        const netDispoSansPER = netImposableSansPER - impotSansPER;
        const netDispoAvecPER = netImposableAvecPER - impotAvecPER;
        const patrimoineGlobal = netDispoAvecPER + perVersement;
        const tauxMoyenSansPER = netImposableSansPER > 0 ? (impotSansPER / netImposableSansPER) * 100 : 0;
        const tauxMoyenAvecPER = netImposableAvecPER > 0 ? (impotAvecPER / netImposableAvecPER) * 100 : 0;
        Object.assign(state.resultats, {
            netImposableSansPER, netImposableAvecPER, perVersement, perDeductible, perNonDeductible,
            impotSansPER, impotAvecPER, gainFiscal, netDispoSansPER, netDispoAvecPER, patrimoineGlobal,
            tauxMoyenSansPER, tauxMoyenAvecPER, plafondPERActuel: plafondN, plafondPERTotalDispo: totalDisponible,
            perUtilisationParAnnee: utilisation, perPlafondsRestants: plafondsRestants
        });
        return state.resultats;
    }

    function calculerBudget(params = {}) {
        if (params.loyer) state.budget.loyer = params.loyer;
        if (params.quotidien) state.budget.quotidien = params.quotidien;
        if (params.extra) state.budget.extra = params.extra;
        if (params.investAuto) state.budget.investAuto = params.investAuto;
        const depensesTotales = Object.values(state.budget).reduce((a, b) => a + b, 0);
        const revenuMensuel = state.resultats.netDispoAvecPER / 12;
        const epargneTotale = revenuMensuel - depensesTotales;
        const tauxEpargne = revenuMensuel > 0 ? (epargneTotale / revenuMensuel) * 100 : 0;
        Object.assign(state.resultats, { depensesTotales, epargneTotale, tauxEpargne, montantDispo: epargneTotale > 0 ? epargneTotale : 0 });
        return { depensesTotales, epargneTotale, tauxEpargne };
    }

    function calculerAllocation(params = {}) {
        if (params.etf) state.allocation.etf = params.etf;
        if (params.assuranceVie) state.allocation.assuranceVie = params.assuranceVie;
        if (params.scpi) state.allocation.scpi = params.scpi;
        if (params.crypto) state.allocation.crypto = params.crypto;
        if (params.autres) state.allocation.autres = params.autres;
        const total = Object.values(state.allocation).reduce((a, b) => a + b, 0);
        if (total !== 1) Object.keys(state.allocation).forEach(key => { state.allocation[key] = state.allocation[key] / total; });
        const allocations = {};
        Object.keys(state.allocation).forEach(key => { allocations[key] = state.resultats.montantDispo * state.allocation[key]; });
        state.resultats.allocations = allocations;
        return allocations;
    }

    function simulerPatrimoine(params = {}) {
        calculerSimulationFiscale(params);
        calculerBudget(params.budget);
        calculerAllocation(params.allocation);
        if (params.sauvegarder) sauvegarderResultats();
        return state.resultats;
    }

    function sauvegarderResultats() {
        try {
            localStorage.setItem('tradepulse_simulation', JSON.stringify({
                parametres: { revenuBrut: state.revenuBrut, typeRevenu: state.typeRevenu, tauxCharges: state.tauxCharges, perPourcentage: state.perPourcentage, nbParts: state.nbParts, budget: state.budget, allocation: state.allocation, perPlafondsReportables: state.perPlafondsReportables },
                resultats: state.resultats, anneeSimulation: ANNEE_SIMULATION, timestamp: Date.now()
            }));
            return true;
        } catch (error) { console.error('Erreur sauvegarde:', error); return false; }
    }

    function chargerResultats() {
        try {
            const savedData = localStorage.getItem('tradepulse_simulation');
            if (!savedData) return null;
            const parsed = JSON.parse(savedData);
            state.revenuBrut = parsed.parametres.revenuBrut;
            state.typeRevenu = parsed.parametres.typeRevenu || 'salarie';
            state.tauxCharges = parsed.parametres.tauxCharges;
            state.perPourcentage = parsed.parametres.perPourcentage;
            state.nbParts = parsed.parametres.nbParts || 1;
            state.budget = parsed.parametres.budget;
            state.allocation = parsed.parametres.allocation;
            state.perPlafondsReportables = parsed.parametres.perPlafondsReportables || {...CONFIG_DEFAUT.perPlafondsReportables};
            state.resultats = parsed.resultats;
            if (parsed.anneeSimulation) setAnnee(parsed.anneeSimulation);
            return parsed;
        } catch (error) { console.error('Erreur chargement:', error); return null; }
    }

    function resetState() {
        state.typeRevenu = CONFIG_DEFAUT.typeRevenu; state.tauxCharges = CONFIG_DEFAUT.taux_charges;
        state.perPourcentage = CONFIG_DEFAUT.per_pourcentage; state.nbParts = CONFIG_DEFAUT.nbParts;
        state.budget = {...CONFIG_DEFAUT.budget}; state.allocation = {...CONFIG_DEFAUT.allocation};
        state.perPlafondsReportables = {...CONFIG_DEFAUT.perPlafondsReportables};
    }

    function exporterDataGraphique() {
        return {
            fiscal: { labels: ['Sans PER', 'Avec PER'], datasets: [
                { label: 'Impôt payé', data: [state.resultats.impotSansPER, state.resultats.impotAvecPER], backgroundColor: 'rgba(255, 99, 132, 0.7)' },
                { label: 'Net disponible', data: [state.resultats.netDispoSansPER, state.resultats.netDispoAvecPER], backgroundColor: 'rgba(75, 192, 192, 0.7)' },
                { label: 'PER', data: [0, state.resultats.perVersement], backgroundColor: 'rgba(153, 102, 255, 0.7)' }
            ]},
            budget: { labels: ['Loyer', 'Quotidien', 'Extra', 'Invest. Auto', 'Épargne'], data: [state.budget.loyer, state.budget.quotidien, state.budget.extra, state.budget.investAuto, state.resultats.epargneTotale], colors: ['rgba(255,99,132,0.7)', 'rgba(255,159,64,0.7)', 'rgba(255,205,86,0.7)', 'rgba(75,192,192,0.7)', 'rgba(54,162,235,0.7)'] },
            allocation: { labels: Object.keys(state.allocation).map(k => k.charAt(0).toUpperCase() + k.slice(1)), data: Object.values(state.resultats.allocations), colors: ['rgba(54,162,235,0.7)', 'rgba(75,192,192,0.7)', 'rgba(255,205,86,0.7)', 'rgba(153,102,255,0.7)', 'rgba(201,203,207,0.7)'] }
        };
    }

    function getConstantesPER() {
        const p = getPlafondsPER();
        return { PASS_REF, ANNEE_SIMULATION, PLAFOND_PER_MIN: p.SALARIE_MIN, PLAFOND_PER_MAX: p.SALARIE_MAX, PLAFOND_TNS_MAX: p.TNS_MAX };
    }

    function getTranchesImpot() { return [...TRANCHES_IMPOT]; }

    return {
        calculerSimulationFiscale, calculerBudget, calculerAllocation, simulerPatrimoine,
        calculerImpot, calculerPlafondsPER, allouerVersementPER,
        calculerVersementOptimalPourChangerTranche, calculerPlafondsAnneeProchaine,
        estimerFiscaliteSortiePER, getTauxMarginal, getTauxCharges, getConstantesPER,
        getTranchesImpot, getState: () => ({...state}), setAnnee, resetState,
        sauvegarderResultats, chargerResultats, exporterDataGraphique
    };
})();


// ============================================================================
// FONCTIONS UI
// ============================================================================

function formatMontant(n) { return Math.round(n).toLocaleString('fr-FR'); }
function formatPct(n) { return `${Math.round(n)} %`; }

function runScenarioPER({ revenuBrut, statut, nbParts, plafondsReportables, perVersement }) {
    const tauxCharges = PatrimoineSimulator.getTauxCharges(statut);
    const revenuProNet = revenuBrut * (1 - tauxCharges);
    const { plafondN, plafondsParAnnee, totalDisponible, totalReports } = PatrimoineSimulator.calculerPlafondsPER(revenuProNet, plafondsReportables, statut);
    const { utilisation, perDeductible, perNonDeductible, plafondsRestants } = PatrimoineSimulator.allouerVersementPER(perVersement, plafondsParAnnee);
    const netImposableSansPER = revenuProNet;
    const netImposableAvecPER = revenuProNet - perDeductible;
    const impotSansPER = PatrimoineSimulator.calculerImpot(netImposableSansPER, nbParts);
    const impotAvecPER = PatrimoineSimulator.calculerImpot(netImposableAvecPER, nbParts);
    const plafondsAnneeProchaine = PatrimoineSimulator.calculerPlafondsAnneeProchaine(plafondsRestants);
    return { revenuProNet, netImposableSansPER, netImposableAvecPER, impotSansPER, impotAvecPER, gainFiscal: impotSansPER - impotAvecPER, perVersement, perDeductible, perNonDeductible, plafondN, plafondTotal: totalDisponible, totalReports, utilisation, plafondsParAnnee, plafondsRestants, plafondsAnneeProchaine, tmiAvant: PatrimoineSimulator.getTauxMarginal(netImposableSansPER, nbParts), tmiApres: PatrimoineSimulator.getTauxMarginal(netImposableAvecPER, nbParts) };
}

function afficherSynthesePER() {
    const brutInput = document.getElementById('salaire-brut-simple');
    const statutSelect = document.getElementById('statut-simple');
    const situationSelect = document.getElementById('situation-familiale');
    const n3Input = document.getElementById('plafond-n3-simple');
    const n2Input = document.getElementById('plafond-n2-simple');
    const n1Input = document.getElementById('plafond-n1-simple');
    const resultatElement = document.getElementById('resultat-synthese');
    const alerteN3 = document.getElementById('alerte-n3');
    if (!brutInput || !resultatElement) return;
    const brut = parseFloat(brutInput.value.replace(/\s/g, '').replace(',', '.'));
    if (!brut || brut <= 0) { resultatElement.innerHTML = `<div class="bg-red-900/30 border border-red-700 rounded-xl p-4 text-sm text-red-200"><p><i class="fas fa-exclamation-triangle mr-2"></i><strong>Erreur :</strong> veuillez saisir un salaire brut annuel valide.</p></div>`; return; }
    const statut = statutSelect?.value || 'salarie';
    const nbParts = parseFloat(situationSelect?.value || '1');
    const situationLabel = situationSelect?.options[situationSelect.selectedIndex]?.text || '';
    const isTNS = (statut === 'independant');
    const plafondsReportables = { n3: parseFloat(n3Input?.value?.replace(/\s/g, '') || '0') || 0, n2: parseFloat(n2Input?.value?.replace(/\s/g, '') || '0') || 0, n1: parseFloat(n1Input?.value?.replace(/\s/g, '') || '0') || 0 };
    PatrimoineSimulator.calculerSimulationFiscale({ revenuBrut: brut, typeRevenu: statut, nbParts, perPourcentage: 0, plafondsReportables });
    if (alerteN3) alerteN3.classList.toggle('hidden', plafondsReportables.n3 <= 0);
    const tauxCharges = PatrimoineSimulator.getTauxCharges(statut);
    const revenuProNet = brut * (1 - tauxCharges);
    const { plafondN, plafondsParAnnee, totalDisponible, totalReports } = PatrimoineSimulator.calculerPlafondsPER(revenuProNet, plafondsReportables, statut);
    const scenSansPER = runScenarioPER({ revenuBrut: brut, statut, nbParts, plafondsReportables, perVersement: 0 });
    const revenuImposable = scenSansPER.netImposableSansPER;
    const tmiAvant = scenSansPER.tmiAvant;
    const impotAvant = scenSansPER.impotSansPER;
    const optimisation = PatrimoineSimulator.calculerVersementOptimalPourChangerTranche(revenuImposable, plafondsReportables, nbParts, statut);
    const versementOptimal = optimisation.versementOptimal;
    let scenOptimal = scenSansPER, impotOptimal = impotAvant, tmiApresOptimal = tmiAvant, economieOptimal = 0;
    let repartitionOptimal = { n3:0, n2:0, n1:0, n:0 }, nextYearOptimal = { n3:0, n2:0, n1:0 };
    if (versementOptimal > 0) {
        scenOptimal = runScenarioPER({ revenuBrut: brut, statut, nbParts, plafondsReportables, perVersement: versementOptimal });
        impotOptimal = scenOptimal.impotAvecPER; tmiApresOptimal = scenOptimal.tmiApres;
        economieOptimal = impotAvant - impotOptimal; repartitionOptimal = scenOptimal.utilisation;
        nextYearOptimal = scenOptimal.plafondsAnneeProchaine;
    }
    const versementMax = totalDisponible;
    let scenMax = scenSansPER, impotMax = impotAvant, tmiApresMax = tmiAvant, economieMax = 0;
    if (versementMax > 0) {
        scenMax = runScenarioPER({ revenuBrut: brut, statut, nbParts, plafondsReportables, perVersement: versementMax });
        impotMax = scenMax.impotAvecPER; tmiApresMax = scenMax.tmiApres; economieMax = impotAvant - impotMax;
    }
    const repartitionMax = scenMax.utilisation || { n3:0, n2:0, n1:0, n:0 };
    const constantes = PatrimoineSimulator.getConstantesPER();
    const horizonRetraite = 20, rendementAnnuel = 0.04;
    const pvEstimees = versementMax * (Math.pow(1 + rendementAnnuel, horizonRetraite) - 1);
    const fiscSortie = PatrimoineSimulator.estimerFiscaliteSortiePER(versementMax, pvEstimees, tmiApresMax);
    const ANNEE = constantes.ANNEE_SIMULATION;
    const html = `<div class="space-y-6"><div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-lg font-semibold text-white mb-1 flex items-center gap-2"><span class="text-emerald-400">📊</span> Synthèse de votre situation</h3><p class="text-xs text-slate-400 mb-4">${situationLabel ? situationLabel+' – ' : ''}${isTNS ? 'TNS' : 'Salarié'} – Brut : ${formatMontant(brut)} € – ${ANNEE} (PASS ${formatMontant(constantes.PASS_REF)} €)</p><div class="grid md:grid-cols-3 gap-4 text-sm"><div class="bg-slate-800/50 rounded-lg p-3"><p class="text-slate-400 mb-1">Revenu imposable</p><p class="text-xl font-bold text-white">${formatMontant(revenuImposable)} €</p></div><div class="bg-slate-800/50 rounded-lg p-3"><p class="text-slate-400 mb-1">TMI</p><p class="text-xl font-bold ${tmiAvant >= 30 ? 'text-orange-400' : 'text-white'}">${formatPct(tmiAvant)}</p></div><div class="bg-slate-800/50 rounded-lg p-3"><p class="text-slate-400 mb-1">Plafonds PER ${isTNS ? '(TNS)' : ''}</p><p class="text-xl font-bold text-emerald-400">${formatMontant(totalDisponible)} €</p><p class="text-xs text-slate-400 mt-1">${formatMontant(plafondN)} € année en cours${totalReports > 0 ? ' + '+formatMontant(totalReports)+' € reports' : ''}</p>${isTNS ? '<p class="text-xs text-blue-400 mt-1">Max TNS : '+formatMontant(constantes.PLAFOND_TNS_MAX)+' €</p>' : ''}</div></div>${nbParts > 1 ? '<div class="mt-3 text-xs text-slate-400"><i class="fas fa-users mr-1"></i> '+nbParts+' parts (plafonnement QF appliqué)</div>' : ''}</div><div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2"><span class="text-emerald-400">📈</span> Comparatif</h3><div class="overflow-x-auto"><table class="min-w-full text-sm text-slate-200 border-collapse"><thead><tr class="bg-slate-800/80 text-slate-300"><th class="px-3 py-3 text-left font-semibold rounded-tl-lg">Scénario</th><th class="px-3 py-3 text-right font-semibold">Versement</th><th class="px-3 py-3 text-right font-semibold">Impôt</th><th class="px-3 py-3 text-right font-semibold">Économie</th><th class="px-3 py-3 text-right font-semibold rounded-tr-lg">TMI</th></tr></thead><tbody><tr class="border-t border-slate-700"><td class="px-3 py-3 text-slate-400">Sans PER</td><td class="px-3 py-3 text-right text-slate-400">0 €</td><td class="px-3 py-3 text-right">${formatMontant(impotAvant)} €</td><td class="px-3 py-3 text-right text-slate-400">—</td><td class="px-3 py-3 text-right">${formatPct(tmiAvant)}</td></tr><tr class="border-t border-slate-700 ${optimisation.peutChangerTranche ? 'bg-purple-900/20' : ''}"><td class="px-3 py-3"><span class="${optimisation.peutChangerTranche ? 'text-purple-300 font-medium' : 'text-slate-300'}">${optimisation.peutChangerTranche ? '★ ' : ''}Optimal</span><div class="text-xs text-slate-500 mt-0.5">${versementOptimal > 0 ? (optimisation.peutChangerTranche ? formatPct(tmiAvant)+' → '+formatPct(tmiApresOptimal) : 'Plafond insuffisant') : 'Déjà en tranche basse'}</div></td><td class="px-3 py-3 text-right">${formatMontant(versementOptimal)} €</td><td class="px-3 py-3 text-right">${formatMontant(impotOptimal)} €</td><td class="px-3 py-3 text-right ${economieOptimal > 0 ? 'text-emerald-400 font-medium' : 'text-slate-400'}">${economieOptimal > 0 ? formatMontant(economieOptimal)+' €' : '—'}</td><td class="px-3 py-3 text-right">${formatPct(tmiApresOptimal)}</td></tr><tr class="border-t border-slate-700 bg-emerald-900/10"><td class="px-3 py-3"><span class="text-emerald-300 font-medium">⬆ Maximum</span><div class="text-xs text-slate-500 mt-0.5">Tout le plafond</div></td><td class="px-3 py-3 text-right text-emerald-300 font-medium">${formatMontant(versementMax)} €</td><td class="px-3 py-3 text-right">${formatMontant(impotMax)} €</td><td class="px-3 py-3 text-right text-emerald-400 font-bold">${formatMontant(economieMax)} €</td><td class="px-3 py-3 text-right">${formatPct(tmiApresMax)}</td></tr></tbody></table></div></div>${versementMax > 0 ? '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2"><span class="text-emerald-400">📋</span> Répartition plafonds <span class="text-xs font-normal text-slate-400">(scénario max)</span></h3><div class="space-y-3">'+(repartitionMax.n3 > 0 || plafondsReportables.n3 > 0 ? '<div class="flex items-center justify-between p-2 rounded-lg bg-amber-900/20 border border-amber-700/50"><div class="flex items-center gap-2"><span class="text-amber-400 text-xs">⚠️</span><span class="text-slate-300">N-3</span><span class="text-xs text-amber-400">(périme bientôt)</span></div><span class="font-medium text-amber-300">'+formatMontant(repartitionMax.n3)+' € / '+formatMontant(plafondsReportables.n3)+' €</span></div>' : '')+(repartitionMax.n2 > 0 || plafondsReportables.n2 > 0 ? '<div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/30"><span class="text-slate-300">N-2</span><span class="font-medium text-slate-200">'+formatMontant(repartitionMax.n2)+' € / '+formatMontant(plafondsReportables.n2)+' €</span></div>' : '')+(repartitionMax.n1 > 0 || plafondsReportables.n1 > 0 ? '<div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/30"><span class="text-slate-300">N-1</span><span class="font-medium text-slate-200">'+formatMontant(repartitionMax.n1)+' € / '+formatMontant(plafondsReportables.n1)+' €</span></div>' : '')+'<div class="flex items-center justify-between p-2 rounded-lg bg-emerald-900/20 border border-emerald-700/50"><div class="flex items-center gap-2"><span class="text-emerald-400">📅</span><span class="text-slate-300">Année N</span></div><span class="font-medium text-emerald-300">'+formatMontant(repartitionMax.n)+' € / '+formatMontant(plafondN)+' €</span></div></div><div class="mt-4 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400"><i class="fas fa-lightbulb text-yellow-400 mr-1"></i> FIFO : N-3 → N-2 → N-1 → N</div>'+(plafondsReportables.n3 > 0 ? '<p class="mt-2 text-xs text-amber-400"><i class="fas fa-exclamation-circle mr-1"></i>N-3 périme fin '+ANNEE+'</p>' : '')+(versementOptimal > 0 ? '<div class="mt-5 border-t border-slate-700 pt-4"><h4 class="text-sm font-semibold text-slate-200 mb-2">📅 Plafonds reportables l\'an prochain <span class="text-xs font-normal text-slate-400">(après versement optimal)</span></h4><div class="grid md:grid-cols-3 gap-3 text-sm"><div class="bg-slate-800/70 rounded-lg px-3 py-2"><p class="text-slate-400 text-xs">N-3</p><p class="text-slate-200 font-semibold">'+formatMontant(nextYearOptimal.n3)+' €</p></div><div class="bg-slate-800/70 rounded-lg px-3 py-2"><p class="text-slate-400 text-xs">N-2</p><p class="text-slate-200 font-semibold">'+formatMontant(nextYearOptimal.n2)+' €</p></div><div class="bg-slate-800/70 rounded-lg px-3 py-2"><p class="text-slate-400 text-xs">N-1</p><p class="text-slate-200 font-semibold">'+formatMontant(nextYearOptimal.n1)+' €</p></div></div></div>' : '')+'</div>' : ''}<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-lg font-semibold text-white mb-3 flex items-center gap-2"><span class="text-orange-400">⚖️</span> Fiscalité sortie PER <span class="text-xs font-normal text-slate-400">(estimation capital)</span></h3><div class="grid md:grid-cols-2 gap-4 text-sm mb-4"><div class="bg-slate-800/50 rounded-lg p-3"><p class="text-slate-400 mb-1">Économie entrée</p><p class="text-xl font-bold text-emerald-400">+ ${formatMontant(economieMax)} €</p></div><div class="bg-slate-800/50 rounded-lg p-3"><p class="text-slate-400 mb-1">Impôt sortie estimé</p><p class="text-xl font-bold text-orange-400">- ${formatMontant(fiscSortie.totalFiscaliteSortie)} €</p><p class="text-xs text-slate-500 mt-1">Capital: ${formatMontant(fiscSortie.irSurCapital)} € + PV: ${formatMontant(fiscSortie.pfuSurPlusValues)} €</p></div></div><div class="p-3 rounded-lg text-xs ${tmiApresMax >= 30 ? 'bg-orange-900/20 border border-orange-700/50 text-orange-200' : 'bg-emerald-900/20 border border-emerald-700/50 text-emerald-200'}">${fiscSortie.avertissement}</div><p class="mt-3 text-xs text-slate-500">${horizonRetraite} ans, ${Math.round(rendementAnnuel*100)}%/an, TMI sortie = TMI après PER. En réalité, la TMI retraite sera probablement plus basse.</p></div>${plafondsReportables.n3 > 0 ? '<div class="bg-amber-900/20 border border-amber-600/50 rounded-2xl p-5"><h3 class="text-lg font-semibold text-amber-300 mb-2"><i class="fas fa-exclamation-triangle"></i> Urgence</h3><p class="text-sm text-slate-200"><strong class="text-amber-300">'+formatMontant(plafondsReportables.n3)+' €</strong> de N-3 périme fin '+ANNEE+'. À verser en priorité !</p></div>' : ''}<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-sm font-semibold text-slate-400 mb-3"><i class="fas fa-info-circle"></i> Infos ${ANNEE}</h3><div class="grid md:grid-cols-2 gap-3 text-xs text-slate-400"><div>Plafonds salariés : <strong class="text-slate-300">${formatMontant(constantes.PLAFOND_PER_MIN)} – ${formatMontant(constantes.PLAFOND_PER_MAX)} €</strong></div><div>Plafond TNS max : <strong class="text-slate-300">${formatMontant(constantes.PLAFOND_TNS_MAX)} €</strong></div><div>Reports sur 3 ans • Déblocage : RP, invalidité, décès</div></div></div></div>`;
    resultatElement.innerHTML = html;
    resultatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function calculerFiscalite() {
    const brut = parseFloat(document.getElementById("brut-annuel")?.value);
    const charges = parseFloat(document.getElementById("taux-charges")?.value) / 100;
    const perPct = parseFloat(document.getElementById("per-pourcentage")?.value) / 100;
    if (!brut) return;
    const typeRevenu = document.getElementById("type-revenu")?.value || 'salarie';
    const nbParts = parseFloat(document.getElementById("nb-parts")?.value) || 1;
    const plafondsReportables = { n1: parseFloat(document.getElementById("plafond-n1")?.value) || 0, n2: parseFloat(document.getElementById("plafond-n2")?.value) || 0, n3: parseFloat(document.getElementById("plafond-n3")?.value) || 0 };
    const resultats = PatrimoineSimulator.calculerSimulationFiscale({ revenuBrut: brut, typeRevenu, tauxCharges: charges, perPourcentage: perPct, nbParts, plafondsReportables });
    const elements = { "impot-sans-per": `${formatMontant(resultats.impotSansPER)} €`, "impot-avec-per": `${formatMontant(resultats.impotAvecPER)} €`, "gain-fiscal": `${formatMontant(resultats.gainFiscal)} €`, "net-sans-per": `${formatMontant(resultats.netDispoSansPER)} €`, "net-avec-per": `${formatMontant(resultats.netDispoAvecPER)} €`, "patrimoine-total": `${formatMontant(resultats.patrimoineGlobal)} €` };
    Object.entries(elements).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}

window.PatrimoineSimulator = PatrimoineSimulator;
window.afficherSynthesePER = afficherSynthesePER;
window.runScenarioPER = runScenarioPER;
window.formatMontant = formatMontant;
window.formatPct = formatPct;

document.addEventListener('DOMContentLoaded', () => {
    console.log('PatrimoineSimulator v3.0 chargé (PASS 2026: 48060€, IR 2025)');
    const btnAnalyser = document.getElementById('btn-analyser-per');
    if (btnAnalyser) btnAnalyser.addEventListener('click', afficherSynthesePER);
    const toggleAvance = document.getElementById('btn-toggle-avance');
    const blocAvance = document.getElementById('bloc-avance-per');
    if (toggleAvance && blocAvance) {
        toggleAvance.addEventListener('click', () => {
            blocAvance.classList.toggle('hidden');
            const icon = toggleAvance.querySelector('.icon, .fa-chevron-down, .fa-chevron-up');
            if (icon) icon.classList.toggle('rotate-180');
        });
    }
});
