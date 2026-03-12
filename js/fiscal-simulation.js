// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 3.12 - Tranches IR 2025 corrigées (11497/29315/83823/180294)

// Constantes pour les taux de charges sociales
const TAUX_CHARGES = {
    TNS: 0.30,
    SALARIAL: 0.22,
    PATRONAL_BASE: 0.45,
    PATRONAL_MOYEN: 0.55,
    PATRONAL_MAX: 0.65
};

const TAUX_CSG_NON_DEDUCTIBLE = 0.029;

const STATUTS_ASSOCIATES_CONFIG = {
    'micro': { maxAssociates: 1, defaultAssociates: 1, label: "Micro-entreprise" },
    'ei': { maxAssociates: 1, defaultAssociates: 1, label: "Entreprise Individuelle" },
    'eurl': { maxAssociates: 1, defaultAssociates: 1, label: "EURL" },
    'eurlIS': { maxAssociates: 1, defaultAssociates: 1, label: "EURL à l'IS" },
    'sasu': { maxAssociates: 1, defaultAssociates: 1, label: "SASU" },
    'sarl': { maxAssociates: 100, defaultAssociates: 2, minAssociates: 2, label: "SARL" },
    'sas': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SAS" },
    'sa': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SA", note: "Min. 7 actionnaires si cotée" },
    'snc': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SNC" },
    'sci': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SCI" },
    'selarl': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SELARL" },
    'selas': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SELAS" },
    'sca': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SCA", note: "1 commandité + 3 commanditaires min." }
};

function calculerSalaireBrut(resultatEntreprise, tauxRemuneration, isTNS) {
    if (isTNS) return Math.round(resultatEntreprise * tauxRemuneration);
    return Math.round(resultatEntreprise * tauxRemuneration / (1 + 0.55));
}
function calculerSalaireBrutMax(resultatDisponible, tauxChargesPatronales = TAUX_CHARGES.PATRONAL_MOYEN) { return resultatDisponible / (1 + tauxChargesPatronales); }
function ajusterRemuneration(remunerationSouhaitee, resultatDisponible, tauxCharges = 0.55) {
    const coutTotal = remunerationSouhaitee * (1 + tauxCharges);
    if (coutTotal > resultatDisponible) return Math.floor(resultatDisponible / (1 + tauxCharges));
    return remunerationSouhaitee;
}
function calculerISProgressif(resultat) {
    if (resultat <= 0) return 0;
    if (resultat <= 42500) return Math.round(resultat * 0.15);
    return Math.round(42500 * 0.15 + (resultat - 42500) * 0.25);
}

function choisirFiscaliteDividendesLocal(divBruts, tmiPct = 30) {
    const pfu = divBruts * 0.30;
    const prog = divBruts * 0.60 * (tmiPct/100) + divBruts * 0.172;
    return (prog < pfu) ? { total: Math.round(prog), methode:'PROGRESSIF', economie: Math.round(pfu-prog) } : { total: Math.round(pfu), methode:'PFU', economie:0 };
}

// CORRIGÉ v3.12 : Tranches IR 2025 (revenus 2024)
function calculerTMI(revenuImposable) {
    if (revenuImposable <= 11497) return 0;
    if (revenuImposable <= 29315) return 11;
    if (revenuImposable <= 83823) return 30;
    if (revenuImposable <= 180294) return 41;
    return 45;
}

// CORRIGÉ v3.12 : Tranches IR 2025 (revenus 2024)
function calculateProgressiveIRFallback(revenuImposable) {
    const tranches = [
        { max: 11497, taux: 0 },
        { max: 29315, taux: 0.11 },
        { max: 83823, taux: 0.30 },
        { max: 180294, taux: 0.41 },
        { max: Infinity, taux: 0.45 }
    ];
    let impot = 0, resteImposable = revenuImposable;
    for (let i = 0; i < tranches.length; i++) {
        const minTranche = i === 0 ? 0 : tranches[i-1].max;
        if (resteImposable > 0) {
            const montantDansTranche = Math.min(resteImposable, tranches[i].max - minTranche);
            impot += montantDansTranche * tranches[i].taux;
            resteImposable -= montantDansTranche;
        }
    }
    return Math.round(impot);
}

function calculerDividendesIS(resultatApresIS, partAssocie, capitalDetenu, isTNS = false, isGerantMajoritaire = false, tmiActuel = 30, revenuImposable = 0) {
    const dividendesBrutsSociete = Math.max(0, resultatApresIS);
    const dividendesBrutsAssocie = Math.floor(dividendesBrutsSociete * partAssocie);
    let cotTNSDiv = 0;
    if (isTNS && isGerantMajoritaire && dividendesBrutsAssocie > 0) {
        if (window.FiscalUtils) { cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendesBrutsAssocie, capitalDetenu); }
        else { cotTNSDiv = Math.floor(Math.max(0, dividendesBrutsAssocie - 0.10 * capitalDetenu) * TAUX_CHARGES.TNS); }
    }
    let prelevementForfaitaire = 0, methodeDividendes = '', economieMethode = 0;
    if (dividendesBrutsAssocie > 0) {
        let divTax;
        if (window.FiscalUtils?.choisirFiscaliteDividendes) { divTax = window.FiscalUtils.choisirFiscaliteDividendes(dividendesBrutsAssocie, tmiActuel, revenuImposable); }
        else { divTax = choisirFiscaliteDividendesLocal(dividendesBrutsAssocie, tmiActuel); }
        prelevementForfaitaire = divTax.total; methodeDividendes = divTax.methode; economieMethode = divTax.economie;
    }
    return { dividendesBrutsSociete, dividendesBrutsAssocie, cotTNSDiv, prelevementForfaitaire, dividendesNets: dividendesBrutsAssocie - prelevementForfaitaire - cotTNSDiv, capitalDetenu, methodeDividendes, economieMethode };
}

class SimulationsFiscales {
    static normalizeAssociatesParams(params, statutType) {
        const config = STATUTS_ASSOCIATES_CONFIG[statutType];
        if (!config) return params;
        const np = { ...params };
        if (config.maxAssociates === 1) { np.nbAssocies = 1; np.partAssocie = 1; np.partAssociePct = 100; return np; }
        if (!np.nbAssocies || np.nbAssocies < 1) np.nbAssocies = config.defaultAssociates;
        if (np.partAssocie === undefined || np.partAssocie === null) {
            if (np.partAssociePct !== undefined) np.partAssocie = np.partAssociePct / 100;
            else { np.partAssocie = 1 / np.nbAssocies; np.partAssociePct = 100 / np.nbAssocies; }
        } else if (np.partAssociePct === undefined) np.partAssociePct = np.partAssocie * 100;
        if (np.partPresident !== undefined) { np.partAssocie = np.partPresident; delete np.partPresident; }
        if (np.partPDG !== undefined) { np.partAssocie = np.partPDG; delete np.partPDG; }
        if (np.partAssociePrincipal !== undefined) { np.partAssocie = np.partAssociePrincipal; delete np.partAssociePrincipal; }
        return np;
    }

    static simulerMicroEntreprise(params) {
        const np = this.normalizeAssociatesParams(params, 'micro');
        const { ca, typeMicro = 'BIC', versementLiberatoire = false, tauxMarge = 1.0, depensesPro = null } = np;
        const plafonds = { 'BIC_VENTE': 188700, 'BIC_SERVICE': 77700, 'BNC': 77700 };
        const abattements = { 'BIC_VENTE': 0.71, 'BIC_SERVICE': 0.50, 'BNC': 0.34 };
        const tauxCotisations = { 'BIC_VENTE': 0.123, 'BIC_SERVICE': 0.212, 'BNC': 0.246 };
        const tauxVFL = { 'BIC_VENTE': 0.01, 'BIC_SERVICE': 0.017, 'BNC': 0.022 };
        let typeEffectif;
        if (typeMicro === 'BIC_VENTE' || typeMicro === 'vente') typeEffectif = 'BIC_VENTE';
        else if (typeMicro === 'BIC_SERVICE' || typeMicro === 'BIC' || typeMicro === 'service') typeEffectif = 'BIC_SERVICE';
        else typeEffectif = 'BNC';
        if (ca > plafonds[typeEffectif]) return { compatible: false, message: `CA supérieur au plafond micro-entreprise de ${plafonds[typeEffectif]}€` };
        const cotisationsSociales = Math.round(ca * tauxCotisations[typeEffectif]);
        const revenuImposable = Math.round(ca * (1 - abattements[typeEffectif]));
        const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(revenuImposable) : calculerTMI(revenuImposable);
        let impotRevenu;
        if (versementLiberatoire) impotRevenu = Math.round(ca * tauxVFL[typeEffectif]);
        else impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(revenuImposable) : calculateProgressiveIRFallback(revenuImposable);
        const revenuNetApresImpot = ca - cotisationsSociales - impotRevenu;
        const depensesProEstimees = depensesPro !== null ? depensesPro : Math.round(ca * (1 - tauxMarge));
        const cashNetReel = ca - depensesProEstimees - cotisationsSociales - impotRevenu;
        const abattementEffectif = abattements[typeEffectif];
        const beneficeForfaitaire = ca * (1 - abattementEffectif);
        const beneficeReel = ca - depensesProEstimees;
        const ecartFiscal = beneficeForfaitaire - beneficeReel;
        const warnings = [];
        if (tauxMarge < (1 - abattementEffectif)) warnings.push(`⚠️ Micro potentiellement défavorable : marge réelle (${Math.round(tauxMarge * 100)}%) < bénéfice forfaitaire (${Math.round((1 - abattementEffectif) * 100)}%).`);
        if (cashNetReel < 0) warnings.push(`🚨 Cash net réel négatif (${Math.round(cashNetReel)}€).`);
        else if (cashNetReel < revenuNetApresImpot * 0.3) warnings.push(`⚠️ Cash net réel (${Math.round(cashNetReel)}€) très inférieur au net fiscal (${Math.round(revenuNetApresImpot)}€).`);
        const chargesFiscales = cotisationsSociales + impotRevenu;
        return { compatible: true, ca, typeEntreprise: 'Micro-entreprise', typeMicro: typeEffectif, abattement: abattementEffectif * 100 + '%', abattementDecimal: abattementEffectif, revenuImposable, cotisationsSociales, impotRevenu, revenuNetApresImpot, ratioNetCA: (revenuNetApresImpot / ca) * 100, tauxMarge, tauxMargePct: Math.round(tauxMarge * 100) + '%', depensesPro: depensesProEstimees, beneficeForfaitaire, beneficeReel, ecartFiscal, cashNetReel, ratioCashNetCA: (cashNetReel / ca) * 100, seuilMargeSurvie: chargesFiscales / ca, seuilMargeSurviePct: Math.round(chargesFiscales / ca * 100) + '%', microDefavorable: tauxMarge < (1 - abattementEffectif), warnings, versementLiberatoire, modeExpert: true, tmiReel, nbAssocies: 1, partAssocie: 1, partAssociePct: 100 };
    }

    static simulerEI(params) {
        const np = this.normalizeAssociatesParams(params, 'ei');
        const { ca, tauxMarge = 0.3 } = np;
        const beneficeAvantCotisations = Math.round(ca * tauxMarge);
        let cotisationsSociales = window.FiscalUtils ? window.FiscalUtils.cotisationsTNSSurBenefice(beneficeAvantCotisations) : Math.round(beneficeAvantCotisations * TAUX_CHARGES.TNS);
        const csgNonDeductible = Math.round(beneficeAvantCotisations * TAUX_CSG_NON_DEDUCTIBLE);
        const cashAvantIR = beneficeAvantCotisations - cotisationsSociales;
        const baseImposableIR = cashAvantIR + csgNonDeductible;
        const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
        let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
        const revenuNetApresImpot = cashAvantIR - impotRevenu;
        return { compatible: true, ca, typeEntreprise: 'Entreprise Individuelle', tauxMarge: tauxMarge * 100 + '%', beneficeAvantCotisations, cotisationsSociales, csgNonDeductible, cashAvantIR, baseImposableIR, beneficeApresCotisations: cashAvantIR, beneficeImposable: baseImposableIR, impotRevenu, revenuNetApresImpot, ratioNetCA: (revenuNetApresImpot / ca) * 100, tmiReel, modeExpert: true, nbAssocies: 1, partAssocie: 1, partAssociePct: 100 };
    }

    static simulerEURL(params) {
        const np = this.normalizeAssociatesParams(params, 'eurl');
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, optionIS = false, capitalSocial = 1 } = np;
        const resultatEntreprise = Math.round(ca * tauxMarge);
        if (!optionIS) {
            const baseCalculTNS = resultatEntreprise;
            let cotisationsSociales = window.FiscalUtils ? window.FiscalUtils.cotisationsTNSSurBenefice(baseCalculTNS) : Math.round(baseCalculTNS * TAUX_CHARGES.TNS);
            const csgNonDeductible = Math.round(resultatEntreprise * TAUX_CSG_NON_DEDUCTIBLE);
            const cashAvantIR = resultatEntreprise - cotisationsSociales;
            const baseImposableIR = cashAvantIR + csgNonDeductible;
            const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
            let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
            const revenuNetApresImpot = cashAvantIR - impotRevenu;
            return { compatible: true, ca, typeEntreprise: "EURL à l'IR", tauxMarge: tauxMarge * 100 + '%', resultatAvantRemuneration: resultatEntreprise, remuneration: resultatEntreprise, resultatApresRemuneration: 0, cotisationsSociales, csgNonDeductible, cashAvantIR, baseImposableIR, beneficeImposable: baseImposableIR, impotRevenu, revenuNetApresImpot, revenuNetTotal: revenuNetApresImpot, ratioNetCA: (revenuNetApresImpot / ca) * 100, baseCalculTNS, tmiReel, modeExpert: true, nbAssocies: 1, partAssocie: 1, partAssociePct: 100 };
        } else {
            const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, true);
            const remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.30);
            let cotisationsSociales = window.FiscalUtils ? window.FiscalUtils.calculCotisationsTNS(remuneration) : Math.round(remuneration * TAUX_CHARGES.TNS);
            const coutRemunerationEntreprise = remuneration + cotisationsSociales;
            const resultatApresRemuneration = resultatEntreprise - coutRemunerationEntreprise;
            const ratioEffectif = coutRemunerationEntreprise / resultatEntreprise;
            const remunerationNetteSociale = remuneration - cotisationsSociales;
            const csgNonDeductible = Math.round(remuneration * TAUX_CSG_NON_DEDUCTIBLE);
            const baseImposableIR = remunerationNetteSociale + csgNonDeductible;
            const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
            let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
            const is = calculerISProgressif(resultatApresRemuneration);
            const resultatApresIS = resultatApresRemuneration - is;
            const dividendesInfo = calculerDividendesIS(resultatApresIS, 1, capitalSocial, true, true, tmiReel, baseImposableIR);
            const revenuNetSalaire = remunerationNetteSociale - impotRevenu;
            const revenuNetTotal = revenuNetSalaire + dividendesInfo.dividendesNets;
            return { compatible: true, ca, typeEntreprise: "EURL à l'IS", tauxMarge: tauxMarge * 100 + '%', resultatAvantRemuneration: resultatEntreprise, remuneration, resultatApresRemuneration, cotisationsSociales, remunerationNetteSociale, csgNonDeductible, baseImposableIR, impotRevenu, revenuNetSalaire, is, resultatApresIS, dividendes: dividendesInfo.dividendesBrutsAssocie, cotTNSDiv: dividendesInfo.cotTNSDiv, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, dividendesNets: dividendesInfo.dividendesNets, revenuNetTotal, ratioNetCA: (revenuNetTotal / ca) * 100, resultatEntreprise, ratioEffectif, tmiReel, modeExpert: true, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, nbAssocies: 1, partAssocie: 1, partAssociePct: 100 };
        }
    }

    static simulerSASU(params) {
        const np = this.normalizeAssociatesParams(params, 'sasu');
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, secteur = "Tous", taille = "<50" } = np;
        const resultatEntreprise = Math.round(ca * tauxMarge);
        const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, false);
        const remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.55);
        let chargesPatronales, chargesSalariales;
        if (window.FiscalUtils) { const c = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille }); chargesPatronales = c.patronales; chargesSalariales = c.salariales; }
        else { chargesPatronales = Math.round(remuneration * TAUX_CHARGES.PATRONAL_MOYEN); chargesSalariales = Math.round(remuneration * TAUX_CHARGES.SALARIAL); }
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const resultatApresRemuneration = resultatEntreprise - coutTotalEmployeur;
        const ratioEffectif = coutTotalEmployeur / resultatEntreprise;
        const salaireNet = remuneration - chargesSalariales;
        const csgNonDeductible = Math.round(remuneration * TAUX_CSG_NON_DEDUCTIBLE);
        const baseImposableIR = salaireNet + csgNonDeductible;
        const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
        let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
        const salaireNetApresIR = salaireNet - impotRevenu;
        const is = calculerISProgressif(resultatApresRemuneration);
        const resultatApresIS = resultatApresRemuneration - is;
        const dividendesInfo = calculerDividendesIS(resultatApresIS, 1, 0, false, false, tmiReel, baseImposableIR);
        const revenuNetTotal = salaireNetApresIR + dividendesInfo.dividendesNets;
        return { compatible: true, ca, typeEntreprise: 'SASU', tauxMarge: tauxMarge * 100 + '%', resultatEntreprise, remuneration, chargesPatronales, coutTotalEmployeur, chargesSalariales, salaireNet, csgNonDeductible, baseImposableIR, impotRevenu, salaireNetApresIR, revenuNetSalaire: salaireNetApresIR, resultatApresRemuneration, is, resultatApresIS, dividendes: dividendesInfo.dividendesBrutsAssocie, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, dividendesNets: dividendesInfo.dividendesNets, revenuNetTotal, ratioNetCA: (revenuNetTotal / ca) * 100, secteur, taille, ratioEffectif, modeExpert: true, tmiReel, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, nbAssocies: 1, partAssocie: 1, partAssociePct: 100 };
    }

    static simulerSARL(params) {
        const np = this.normalizeAssociatesParams(params, 'sarl');
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, gerantMajoritaire = true, nbAssocies = np.nbAssocies, partAssocie = np.partAssocie, partAssociePct = np.partAssociePct, capitalSocial = 1, secteur = "Tous", taille = "<50" } = np;
        const resultatEntreprise = Math.round(ca * tauxMarge);
        let cotisationsSociales = 0, salaireNet = 0, resultatApresRemuneration = 0, remuneration = 0, ratioEffectif = 0, remunerationNetteSociale = 0, csgNonDeductible = 0, baseImposableIR = 0;
        if (gerantMajoritaire) {
            remuneration = ajusterRemuneration(calculerSalaireBrut(resultatEntreprise, tauxRemuneration, true), resultatEntreprise, 0.30);
            cotisationsSociales = window.FiscalUtils ? window.FiscalUtils.calculCotisationsTNS(remuneration) : Math.round(remuneration * TAUX_CHARGES.TNS);
            salaireNet = remuneration - cotisationsSociales; remunerationNetteSociale = salaireNet;
            csgNonDeductible = Math.round(remuneration * TAUX_CSG_NON_DEDUCTIBLE); baseImposableIR = salaireNet + csgNonDeductible;
            const coutRem = remuneration + cotisationsSociales; resultatApresRemuneration = resultatEntreprise - coutRem; ratioEffectif = coutRem / resultatEntreprise;
        } else {
            remuneration = ajusterRemuneration(calculerSalaireBrut(resultatEntreprise, tauxRemuneration, false), resultatEntreprise, 0.55);
            let chargesPatronales, chargesSalariales;
            if (window.FiscalUtils) { const c = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille }); chargesPatronales = c.patronales; chargesSalariales = c.salariales; cotisationsSociales = chargesPatronales + chargesSalariales; }
            else { chargesPatronales = Math.round(remuneration * TAUX_CHARGES.PATRONAL_MOYEN); chargesSalariales = Math.round(remuneration * TAUX_CHARGES.SALARIAL); cotisationsSociales = chargesPatronales + chargesSalariales; }
            salaireNet = remuneration - chargesSalariales;
            csgNonDeductible = Math.round(remuneration * TAUX_CSG_NON_DEDUCTIBLE); baseImposableIR = salaireNet + csgNonDeductible;
            remunerationNetteSociale = salaireNet; const coutTotal = remuneration + chargesPatronales; resultatApresRemuneration = resultatEntreprise - coutTotal; ratioEffectif = coutTotal / resultatEntreprise;
        }
        const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
        let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
        const salaireNetApresIR = salaireNet - impotRevenu;
        const is = calculerISProgressif(resultatApresRemuneration);
        const resultatApresIS = resultatApresRemuneration - is;
        const capitalDetenu = capitalSocial * partAssocie;
        const dividendesInfo = calculerDividendesIS(resultatApresIS, partAssocie, capitalDetenu, gerantMajoritaire, gerantMajoritaire, tmiReel, baseImposableIR);
        const revenuNetTotal = salaireNetApresIR + dividendesInfo.dividendesNets;
        return { compatible: true, ca, typeEntreprise: 'SARL', tauxMarge: tauxMarge * 100 + '%', resultatEntreprise, remuneration, cotisationsSociales, salaireNet, csgNonDeductible, baseImposableIR, remunerationNetteSociale, impotRevenu, salaireNetApresIR, revenuNetSalaire: salaireNetApresIR, resultatApresRemuneration, is, resultatApresIS, dividendesBrutsSociete: dividendesInfo.dividendesBrutsSociete, dividendesGerant: dividendesInfo.dividendesBrutsAssocie, dividendes: dividendesInfo.dividendesBrutsAssocie, capitalDetenu, cotTNSDiv: dividendesInfo.cotTNSDiv, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, dividendesNets: dividendesInfo.dividendesNets, revenuNetTotal, ratioNetCA: (revenuNetTotal / ca) * 100, tmiReel, modeExpert: true, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, nbAssocies, partAssocie, partAssociePct, gerantMajoritaire, secteur, taille, ratioEffectif };
    }

    static simulerSAS(params) {
        const np = this.normalizeAssociatesParams(params, 'sas');
        const { nbAssocies = np.nbAssocies, partAssocie = np.partAssocie, partAssociePct = np.partAssociePct } = np;
        const resultSASU = this.simulerSASU(np);
        if (!resultSASU.compatible) return resultSASU;
        const dividendesInfo = calculerDividendesIS(resultSASU.resultatApresIS, partAssocie, 0, false, false, resultSASU.tmiReel, resultSASU.baseImposableIR);
        const revenuNetTotal = resultSASU.salaireNetApresIR + dividendesInfo.dividendesNets;
        return { ...resultSASU, typeEntreprise: 'SAS', dividendesSociete: dividendesInfo.dividendesBrutsSociete, dividendesPresident: dividendesInfo.dividendesBrutsAssocie, dividendes: dividendesInfo.dividendesBrutsAssocie, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, dividendesNets: dividendesInfo.dividendesNets, revenuNetTotal, ratioNetCA: (revenuNetTotal / np.ca) * 100, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, nbAssocies, partAssocie, partAssociePct };
    }

    static simulerSA(params) {
        const np = this.normalizeAssociatesParams(params, 'sa');
        const { capitalInvesti = 37000, partAssocie = np.partAssocie } = np;
        if (capitalInvesti < 37000) return { compatible: false, message: `Capital minimum SA = 37 000€ (${capitalInvesti}€ indiqué)` };
        const resultSAS = this.simulerSAS(np);
        if (!resultSAS.compatible) return resultSAS;
        const coutCAC = 5000;
        const resultatApresCAC = Math.max(0, resultSAS.resultatApresRemuneration - coutCAC);
        const is = calculerISProgressif(resultatApresCAC);
        const resultatApresIS = Math.max(0, resultatApresCAC - is);
        const dividendesInfo = calculerDividendesIS(resultatApresIS, partAssocie, capitalInvesti * partAssocie, false, false, resultSAS.tmiReel, resultSAS.baseImposableIR);
        const revenuNetTotal = resultSAS.salaireNetApresIR + dividendesInfo.dividendesNets;
        return { ...resultSAS, typeEntreprise: 'SA', coutCAC, is, resultatApresIS, dividendes: resultatApresIS * partAssocie, dividendesNets: dividendesInfo.dividendesNets, revenuNetTotal, ratioNetCA: (revenuNetTotal / np.ca) * 100, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, nbAssocies: np.nbAssocies, partAssocie, partAssociePct: np.partAssociePct };
    }

    static simulerSNC(params) {
        const np = this.normalizeAssociatesParams(params, 'snc');
        const { ca, tauxMarge = 0.3, nbAssocies = np.nbAssocies, partAssocie = np.partAssocie, partAssociePct = np.partAssociePct } = np;
        const resultatEntreprise = Math.round(ca * tauxMarge);
        const beneficeAssociePrincipal = Math.floor(resultatEntreprise * partAssocie);
        let cotisationsSociales = window.FiscalUtils ? window.FiscalUtils.calculCotisationsTNS(beneficeAssociePrincipal) : Math.round(beneficeAssociePrincipal * TAUX_CHARGES.TNS);
        const csgNonDeductible = Math.round(beneficeAssociePrincipal * TAUX_CSG_NON_DEDUCTIBLE);
        const cashAvantIR = beneficeAssociePrincipal - cotisationsSociales;
        const baseImposableIR = cashAvantIR + csgNonDeductible;
        const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
        let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
        const revenuNetApresImpot = cashAvantIR - impotRevenu;
        return { compatible: true, ca, typeEntreprise: 'SNC', tauxMarge: tauxMarge * 100 + '%', resultatEntrepriseSociete: resultatEntreprise, resultatEntreprise, beneficeAssociePrincipal, beneficeAvantCotisations: beneficeAssociePrincipal, cotisationsSociales, csgNonDeductible, cashAvantIR, baseImposableIR, beneficeApresCotisations: cashAvantIR, beneficeImposable: baseImposableIR, impotRevenu, revenuNetApresImpot, revenuNetTotal: revenuNetApresImpot, ratioNetCA: (revenuNetApresImpot / ca) * 100, tmiReel, modeExpert: true, nbAssocies, partAssocie, partAssociePct };
    }

    static simulerSCI(params) {
        const np = this.normalizeAssociatesParams(params, 'sci');
        const { revenuLocatif = 50000, chargesDeductibles = 10000, optionIS = false, partAssocie = np.partAssocie, nbAssocies = np.nbAssocies, partAssociePct = np.partAssociePct, typeLocation = "nue", valeurBien = 300000, tauxAmortissement = 0.02, dureeDetention = 15 } = np;
        const ca = revenuLocatif;
        const locationMeublee = typeLocation === "meublee";
        const optionISEffective = optionIS || locationMeublee;
        const resultatFiscal = revenuLocatif - chargesDeductibles;
        const resultatFiscalAssocie = Math.floor(resultatFiscal * partAssocie);
        const amortissementAnnuel = optionISEffective ? Math.round(valeurBien * tauxAmortissement) : 0;
        const resultatApresAmortissement = Math.max(0, resultatFiscal - amortissementAnnuel);
        const avertissementMeublee = locationMeublee && !optionISEffective ? "Attention: location meublée en SCI IR peut être requalifiée." : "";
        const avantageAmortissement = optionISEffective ? Math.round(amortissementAnnuel * 0.25) : 0;
        if (!optionISEffective) {
            const prelevementsSociaux = Math.round(Math.max(0, resultatFiscalAssocie) * 0.172);
            const csgDeductible = Math.round(resultatFiscalAssocie * 0.068);
            const baseImposableIR = Math.max(0, resultatFiscalAssocie - csgDeductible);
            const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(baseImposableIR) : calculerTMI(baseImposableIR);
            let impotRevenu = (window.FiscalUtils?.calculateProgressiveIR) ? window.FiscalUtils.calculateProgressiveIR(baseImposableIR) : calculateProgressiveIRFallback(baseImposableIR);
            const revenuNetApresImpot = Math.max(0, resultatFiscalAssocie - impotRevenu - prelevementsSociaux);
            return { compatible: true, ca, typeEntreprise: "SCI à l'IR", typeLocation, revenuLocatif, chargesDeductibles, resultatFiscal, resultatFiscalAssocie, partAssociePrincipal: partAssocie, nombreAssocies: nbAssocies, prelevementsSociaux, csgDeductible, baseImposableIR, tmiReel, impotRevenu, revenuNetApresImpot, revenuNetTotal: revenuNetApresImpot, ratioNetCA: (revenuNetApresImpot / ca) * 100, amortissementPossible: false, avertissementMeublee, modeExpert: true, nbAssocies, partAssocie, partAssociePct };
        } else {
            const is = calculerISProgressif(resultatApresAmortissement);
            const resultatApresIS = resultatApresAmortissement - is;
            const revenuImposableEstime = Math.floor(resultatApresIS * partAssocie);
            const tmiReel = window.FiscalUtils ? window.FiscalUtils.getTMI(revenuImposableEstime) : calculerTMI(revenuImposableEstime);
            const dividendesInfo = calculerDividendesIS(resultatApresIS, partAssocie, 0, false, false, tmiReel, revenuImposableEstime);
            const infoLocationMeublee = locationMeublee ? "IS permet l'amortissement du bien meublé." : "Attention: option IS irréversible, souvent défavorable en location nue.";
            return { compatible: true, ca, typeEntreprise: "SCI à l'IS", typeLocation, revenuLocatif, chargesDeductibles, valeurBien, amortissementAnnuel, resultatFiscal, resultatApresAmortissement, is, resultatApresIS, dividendesBruts: dividendesInfo.dividendesBrutsSociete, dividendesAssocie: dividendesInfo.dividendesBrutsAssocie, dividendes: dividendesInfo.dividendesBrutsAssocie, prelevementForfaitaire: dividendesInfo.prelevementForfaitaire, dividendesNets: dividendesInfo.dividendesNets, revenuNetApresImpot: dividendesInfo.dividendesNets, revenuNetTotal: dividendesInfo.dividendesNets, ratioNetCA: (dividendesInfo.dividendesNets / ca) * 100, avantageAmortissement, economieAmortissementDuree: avantageAmortissement * dureeDetention, amortissementPossible: true, infoLocationMeublee, partAssociePrincipal: partAssocie, nombreAssocies: nbAssocies, tmiReel, modeExpert: true, methodeDividendes: dividendesInfo.methodeDividendes, economieMethode: dividendesInfo.economieMethode, nbAssocies, partAssocie, partAssociePct };
        }
    }

    static simulerSELARL(params) { const np = this.normalizeAssociatesParams(params, 'selarl'); const r = this.simulerSARL({...np, gerantMajoritaire: true}); if (r.compatible) r.typeEntreprise = 'SELARL'; return r; }
    static simulerSELAS(params) { const np = this.normalizeAssociatesParams(params, 'selas'); const r = this.simulerSAS(np); if (r.compatible) r.typeEntreprise = 'SELAS'; return r; }
    static simulerSCA(params) {
        const np = this.normalizeAssociatesParams(params, 'sca');
        const { capitalInvesti = 37000 } = np;
        if (capitalInvesti < 37000) return { compatible: false, message: `Capital minimum SCA = 37 000€` };
        const r = this.simulerSARL({...np, gerantMajoritaire: true});
        if (r.compatible) { r.typeEntreprise = 'SCA'; r.noteAssocies = "Simulation pour un commandité."; }
        return r;
    }
}

window.SimulationsFiscales = SimulationsFiscales;
window.TAUX_CHARGES = TAUX_CHARGES;
window.calculerSalaireBrut = calculerSalaireBrut;
window.calculerSalaireBrutMax = calculerSalaireBrutMax;
window.ajusterRemuneration = ajusterRemuneration;
window.calculerDividendesIS = calculerDividendesIS;
window.calculerISProgressif = calculerISProgressif;
window.STATUTS_ASSOCIATES_CONFIG = STATUTS_ASSOCIATES_CONFIG;
window.calculateProgressiveIRFallback = calculateProgressiveIRFallback;

document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales chargé (v3.12 - Tranches IR 2025 corrigées: 11497/29315/83823/180294)");
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady', {
        detail: { version: '3.12', features: ['tranchesIR2025Corrigees', 'normalizeAssociatesParams', 'calculerDividendesIS', 'optimisationFiscaleDividendes', 'calculTMIAutomatique', 'CSGNonDeductible', 'calculerSalaireBrut', 'calculerISProgressif', 'cashVsBaseImposable'] }
    }));
});
