/**
 * fiscal-optimizer.js - Module de simulation patrimoniale complète
 * TradePulse Finance Intelligence Platform
 * 
 * Version 5.1 - Fix PASS_PAR_ANNEE scope + Template pédagogique
 */

const PatrimoineSimulator = (function() {
    const PASS_PAR_ANNEE = { 2024: 46368, 2025: 47100, 2026: 48060 };
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
        { min: 0, max: 11497, taux: 0 },
        { min: 11497, max: 29315, taux: 0.11 },
        { min: 29315, max: 83823, taux: 0.30 },
        { min: 83823, max: 180294, taux: 0.41 },
        { min: 180294, max: Infinity, taux: 0.45 }
    ];

    const PLAFOND_QF_DEMI_PART = 1759;
    const TAUX_CSG_DEDUCTIBLE = 0.068;
    const ABATTEMENT_FRAIS_PRO = { taux: 0.10, plafond: 14171, plancher: 495 };

    const CHARGES_PAR_TYPE = {
        salarie: 0.22, cadre: 0.25, fonctionnaire: 0.17, independant: 0.45, dividendes: 0.172,
        microEntrepreneur: { service: 0.22, commercial: 0.123, artisanal: 0.123 }
    };

    const CONFIG_DEFAUT = {
        typeRevenu: 'salarie', taux_charges: CHARGES_PAR_TYPE.salarie, per_pourcentage: 0.10, nbParts: 1,
        budget: { loyer: 0, quotidien: 0, extra: 0, investAuto: 0 },
        allocation: { etf: 0.40, assuranceVie: 0.25, scpi: 0.15, crypto: 0.10, autres: 0.10 },
        perPlafondsReportables: { n1: 0, n2: 0, n3: 0 }
    };

    let state = {
        revenuBrut: 0, typeRevenu: CONFIG_DEFAUT.typeRevenu, tauxCharges: CONFIG_DEFAUT.taux_charges,
        perPourcentage: CONFIG_DEFAUT.per_pourcentage, nbParts: CONFIG_DEFAUT.nbParts,
        budget: {...CONFIG_DEFAUT.budget}, allocation: {...CONFIG_DEFAUT.allocation},
        perPlafondsReportables: {...CONFIG_DEFAUT.perPlafondsReportables},
        resultats: {
            netImposableSansPER: 0, netImposableAvecPER: 0, perVersement: 0, perDeductible: 0, perNonDeductible: 0,
            impotSansPER: 0, impotAvecPER: 0, gainFiscal: 0, netDispoSansPER: 0, netDispoAvecPER: 0,
            patrimoineGlobal: 0, tauxMoyenSansPER: 0, tauxMoyenAvecPER: 0, plafondPERActuel: 0, plafondPERTotalDispo: 0,
            perUtilisationParAnnee: { n3: 0, n2: 0, n1: 0, n: 0 }, perPlafondsRestants: { n3: 0, n2: 0, n1: 0, n: 0 },
            depensesTotales: 0, epargneTotale: 0, tauxEpargne: 0, montantDispo: 0,
            allocations: { etf: 0, assuranceVie: 0, scpi: 0, crypto: 0, autres: 0 }
        }
    };

    function setAnnee(a) { if (PASS_PAR_ANNEE[a]) { ANNEE_SIMULATION = a; PASS_REF = PASS_PAR_ANNEE[a]; } }

    function calculerAbattementFraisPro(revenuNetCharges, typeRevenu) {
        if (typeRevenu === 'independant' || typeRevenu === 'microEntrepreneur') return 0;
        const ab = revenuNetCharges * ABATTEMENT_FRAIS_PRO.taux;
        return Math.round(Math.max(ABATTEMENT_FRAIS_PRO.plancher, Math.min(ab, ABATTEMENT_FRAIS_PRO.plafond)));
    }

    function calculerImpot(revenuImposable, nbParts) {
        const parts = nbParts || state.nbParts || 1;
        const partsBase = parts <= 2 ? parts : 2;
        const demiPartsSupp = (parts - partsBase) * 2;
        const impotAvecQF = _calculerImpotBrut(revenuImposable, parts);
        const impotSansQF = _calculerImpotBrut(revenuImposable, partsBase);
        const avantageQF = impotSansQF - impotAvecQF;
        const plafondAvantage = demiPartsSupp * PLAFOND_QF_DEMI_PART;
        if (avantageQF > plafondAvantage && demiPartsSupp > 0) return Math.round(Math.max(0, impotSansQF - plafondAvantage));
        return Math.round(impotAvecQF);
    }

    function _calculerImpotBrut(revenuImposable, parts) {
        const rpp = revenuImposable / parts;
        let ipp = 0;
        for (let i = 1; i < TRANCHES_IMPOT.length; i++) {
            if (rpp > TRANCHES_IMPOT[i-1].max) {
                ipp += (Math.min(rpp, TRANCHES_IMPOT[i].max) - TRANCHES_IMPOT[i-1].max) * TRANCHES_IMPOT[i].taux;
            }
        }
        return Math.round(ipp * parts * 100) / 100;
    }

    function getTauxCharges(typeRevenu, sousType) {
        if (typeRevenu === 'microEntrepreneur' && sousType) return CHARGES_PAR_TYPE.microEntrepreneur[sousType] || 0.22;
        return CHARGES_PAR_TYPE[typeRevenu] || 0.22;
    }

    function getTauxMarginal(revenuImposable, nbParts) {
        const rpp = revenuImposable / (nbParts || state.nbParts || 1);
        for (let i = TRANCHES_IMPOT.length - 1; i >= 0; i--) { if (rpp > TRANCHES_IMPOT[i].min) return TRANCHES_IMPOT[i].taux * 100; }
        return 0;
    }

    function calculerPlafondsPER(revenuProNet, plafondsReportables, typeRevenu) {
        const rep = plafondsReportables || state.perPlafondsReportables;
        const type = typeRevenu || state.typeRevenu;
        const pl = getPlafondsPER();
        const isTNS = (type === 'independant');
        let plafondN;
        if (isTNS) {
            const bp = Math.min(revenuProNet, PASS_REF * 8);
            const e1 = bp * 0.10;
            const e2 = Math.max(0, Math.min(revenuProNet, PASS_REF * 8) - PASS_REF) * 0.15;
            plafondN = Math.max(pl.TNS_MIN, Math.round(e1 + e2));
        } else {
            const ab = calculerAbattementFraisPro(revenuProNet, type);
            plafondN = Math.max(pl.SALARIE_MIN, Math.min(Math.round((revenuProNet - ab) * 0.10), pl.SALARIE_MAX));
        }
        const ppa = { n3: Math.max(rep.n3||0,0), n2: Math.max(rep.n2||0,0), n1: Math.max(rep.n1||0,0), n: plafondN };
        const tr = ppa.n3 + ppa.n2 + ppa.n1;
        return { plafondN, plafondsParAnnee: ppa, totalDisponible: tr + plafondN, totalReports: tr, isTNS };
    }

    function allouerVersementPER(montant, ppa) {
        const ordre = ['n3','n2','n1','n'];
        const u = {n3:0,n2:0,n1:0,n:0}, r = {n3:0,n2:0,n1:0,n:0};
        let rest = montant;
        for (const a of ordre) { if (rest <= 0) break; const d = ppa[a]||0; if (d<=0) continue; const x = Math.min(rest,d); u[a]=x; rest-=x; }
        for (const a of ordre) { r[a] = Math.max(0,(ppa[a]||0)-(u[a]||0)); }
        return { utilisation: u, perDeductible: montant-rest, perNonDeductible: rest, plafondsRestants: r };
    }

    function calculerPlafondsAnneeProchaine(r) { return { n3: r.n2||0, n2: r.n1||0, n1: r.n||0 }; }

    function calculerVersementOptimalPourChangerTranche(revenuImposable, plafondsReportables, nbParts, typeRevenu) {
        const rep = plafondsReportables || state.perPlafondsReportables;
        const parts = nbParts || state.nbParts || 1;
        const rpp = revenuImposable / parts;
        const { plafondsParAnnee: ppa, totalDisponible: td } = calculerPlafondsPER(revenuImposable, rep, typeRevenu);
        let ti = 0;
        for (let i = 0; i < TRANCHES_IMPOT.length; i++) { if (rpp > TRANCHES_IMPOT[i].min) ti = i; }
        if (ti <= 1) {
            const pr = {...ppa};
            return { versementOptimal:0, nouvelleTMI: ti===0?0:11, ancienneTMI: ti===0?0:11, allocationParAnnee:{n3:0,n2:0,n1:0,n:0}, totalPlafondDisponible:td, economieImpot:0, peutChangerTranche:false, plafondsRestants:pr, plafondsAnneeProchaine: calculerPlafondsAnneeProchaine(pr), message: ti===0?"Tranche 0%.":"Tranche 11%." };
        }
        const tc = TRANCHES_IMPOT[ti];
        const aTMI = tc.taux * 100;
        const mtn = Math.max(0, rpp - tc.min) * parts;
        const vo = Math.min(mtn, td);
        const { utilisation:u, perDeductible:pd, plafondsRestants:pr } = allouerVersementPER(vo, ppa);
        const nri = revenuImposable - pd;
        const nTMI = getTauxMarginal(nri, parts);
        const eco = calculerImpot(revenuImposable, parts) - calculerImpot(nri, parts);
        const pct2 = vo >= mtn;
        return { versementOptimal: Math.round(vo), nouvelleTMI: nTMI, ancienneTMI: aTMI, allocationParAnnee: u, totalPlafondDisponible: td, economieImpot: Math.round(eco), peutChangerTranche: pct2, plafondsRestants: pr, plafondsAnneeProchaine: calculerPlafondsAnneeProchaine(pr), message: pct2 ? `TMI ${aTMI}% \u2192 ${nTMI}%` : `Plafond insuffisant (${Math.round(td).toLocaleString('fr-FR')} \u20AC)` };
    }

    function estimerFiscaliteSortiePER(tv, pv, tmiS) {
        const ir = tv*(tmiS/100), pfu = pv*0.30, tot = ir+pfu, mt = tv+pv;
        return { irSurCapital: Math.round(ir), pfuSurPlusValues: Math.round(pfu), totalFiscaliteSortie: Math.round(tot), tauxEffectifSortie: mt>0?Math.round(tot/mt*1000)/10:0,
            avertissement: tmiS >= 30 ? "\u26A0\uFE0F TMI sortie \u2265 30% : l'avantage PER est surtout un diff\u00E9r\u00E9 d'imp\u00F4t. L'int\u00E9r\u00EAt d\u00E9pend du rendement entre-temps." : "\u2705 TMI plus basse \u00E0 la retraite : le PER g\u00E9n\u00E8re un gain fiscal net en plus de l'effet de tr\u00E9sorerie." };
    }

    function calculerSimulationFiscale(params) {
        if (!params) params = {};
        state.revenuBrut = params.revenuBrut || state.revenuBrut;
        state.typeRevenu = params.typeRevenu || state.typeRevenu;
        state.tauxCharges = params.tauxCharges || getTauxCharges(state.typeRevenu, params.sousType);
        state.perPourcentage = params.perPourcentage !== undefined ? params.perPourcentage : state.perPourcentage;
        state.nbParts = params.nbParts || state.nbParts || 1;
        if (params.plafondsReportables) state.perPlafondsReportables = { n1:params.plafondsReportables.n1||0, n2:params.plafondsReportables.n2||0, n3:params.plafondsReportables.n3||0 };
        const rnc = state.revenuBrut * (1 - state.tauxCharges);
        const ab = calculerAbattementFraisPro(rnc, state.typeRevenu);
        const nisp = rnc - ab;
        const { plafondN, plafondsParAnnee:ppa, totalDisponible:td } = calculerPlafondsPER(rnc, state.perPlafondsReportables, state.typeRevenu);
        const pv = state.revenuBrut * state.perPourcentage;
        const { utilisation:u, perDeductible:pd, perNonDeductible:pnd, plafondsRestants:pr } = allouerVersementPER(pv, ppa);
        const niap = nisp - pd;
        const isp = calculerImpot(nisp), iap = calculerImpot(niap), gf = isp - iap;
        const ndsp = nisp - isp, ndap = niap - iap, pg = ndap + pv;
        Object.assign(state.resultats, { netImposableSansPER:nisp, netImposableAvecPER:niap, perVersement:pv, perDeductible:pd, perNonDeductible:pnd, impotSansPER:isp, impotAvecPER:iap, gainFiscal:gf, netDispoSansPER:ndsp, netDispoAvecPER:ndap, patrimoineGlobal:pg, tauxMoyenSansPER:nisp>0?(isp/nisp)*100:0, tauxMoyenAvecPER:niap>0?(iap/niap)*100:0, plafondPERActuel:plafondN, plafondPERTotalDispo:td, perUtilisationParAnnee:u, perPlafondsRestants:pr, abattementFraisPro:ab });
        return state.resultats;
    }

    function calculerBudget(p) { if(!p)p={}; if(p.loyer)state.budget.loyer=p.loyer; if(p.quotidien)state.budget.quotidien=p.quotidien; if(p.extra)state.budget.extra=p.extra; if(p.investAuto)state.budget.investAuto=p.investAuto; const dt=Object.values(state.budget).reduce((a,b)=>a+b,0); const rm=state.resultats.netDispoAvecPER/12; const et=rm-dt; const te=rm>0?(et/rm)*100:0; Object.assign(state.resultats,{depensesTotales:dt,epargneTotale:et,tauxEpargne:te,montantDispo:et>0?et:0}); return{depensesTotales:dt,epargneTotale:et,tauxEpargne:te}; }
    function calculerAllocation(p) { if(!p)p={}; if(p.etf)state.allocation.etf=p.etf; if(p.assuranceVie)state.allocation.assuranceVie=p.assuranceVie; if(p.scpi)state.allocation.scpi=p.scpi; if(p.crypto)state.allocation.crypto=p.crypto; if(p.autres)state.allocation.autres=p.autres; const t=Object.values(state.allocation).reduce((a,b)=>a+b,0); if(t!==1)Object.keys(state.allocation).forEach(k=>{state.allocation[k]=state.allocation[k]/t;}); const al={}; Object.keys(state.allocation).forEach(k=>{al[k]=state.resultats.montantDispo*state.allocation[k];}); state.resultats.allocations=al; return al; }
    function simulerPatrimoine(p) { if(!p)p={}; calculerSimulationFiscale(p); calculerBudget(p.budget); calculerAllocation(p.allocation); if(p.sauvegarder)sauvegarderResultats(); return state.resultats; }

    function sauvegarderResultats() { try { localStorage.setItem('tradepulse_simulation',JSON.stringify({parametres:{revenuBrut:state.revenuBrut,typeRevenu:state.typeRevenu,tauxCharges:state.tauxCharges,perPourcentage:state.perPourcentage,nbParts:state.nbParts,budget:state.budget,allocation:state.allocation,perPlafondsReportables:state.perPlafondsReportables},resultats:state.resultats,anneeSimulation:ANNEE_SIMULATION,timestamp:Date.now()})); return true; } catch(e){return false;} }
    function chargerResultats() { try { const s=localStorage.getItem('tradepulse_simulation'); if(!s)return null; const p=JSON.parse(s); state.revenuBrut=p.parametres.revenuBrut; state.typeRevenu=p.parametres.typeRevenu||'salarie'; state.tauxCharges=p.parametres.tauxCharges; state.perPourcentage=p.parametres.perPourcentage; state.nbParts=p.parametres.nbParts||1; state.budget=p.parametres.budget; state.allocation=p.parametres.allocation; state.perPlafondsReportables=p.parametres.perPlafondsReportables||{...CONFIG_DEFAUT.perPlafondsReportables}; state.resultats=p.resultats; if(p.anneeSimulation)setAnnee(p.anneeSimulation); return p; } catch(e){return null;} }
    function resetState() { state.typeRevenu=CONFIG_DEFAUT.typeRevenu; state.tauxCharges=CONFIG_DEFAUT.taux_charges; state.perPourcentage=CONFIG_DEFAUT.per_pourcentage; state.nbParts=CONFIG_DEFAUT.nbParts; state.budget={...CONFIG_DEFAUT.budget}; state.allocation={...CONFIG_DEFAUT.allocation}; state.perPlafondsReportables={...CONFIG_DEFAUT.perPlafondsReportables}; }

    function exporterDataGraphique() { return { fiscal:{labels:['Sans PER','Avec PER'],datasets:[{label:'Imp\u00F4t',data:[state.resultats.impotSansPER,state.resultats.impotAvecPER],backgroundColor:'rgba(255,99,132,0.7)'},{label:'Net',data:[state.resultats.netDispoSansPER,state.resultats.netDispoAvecPER],backgroundColor:'rgba(75,192,192,0.7)'},{label:'PER',data:[0,state.resultats.perVersement],backgroundColor:'rgba(153,102,255,0.7)'}]}, budget:{labels:['Loyer','Quotidien','Extra','Invest','\u00C9pargne'],data:[state.budget.loyer,state.budget.quotidien,state.budget.extra,state.budget.investAuto,state.resultats.epargneTotale]}, allocation:{labels:Object.keys(state.allocation).map(k=>k[0].toUpperCase()+k.slice(1)),data:Object.values(state.resultats.allocations)} }; }

    function getConstantesPER() { const p=getPlafondsPER(); return { PASS_REF, ANNEE_SIMULATION, PLAFOND_PER_MIN:p.SALARIE_MIN, PLAFOND_PER_MAX:p.SALARIE_MAX, PLAFOND_TNS_MAX:p.TNS_MAX, ABATTEMENT_FRAIS_PRO }; }
    function getTranchesImpot() { return [...TRANCHES_IMPOT]; }

    return {
        calculerSimulationFiscale, calculerBudget, calculerAllocation, simulerPatrimoine,
        calculerImpot, calculerPlafondsPER, allouerVersementPER,
        calculerVersementOptimalPourChangerTranche, calculerPlafondsAnneeProchaine,
        estimerFiscaliteSortiePER, calculerAbattementFraisPro,
        getTauxMarginal, getTauxCharges, getConstantesPER, getTranchesImpot,
        getState: () => ({...state}), setAnnee, resetState,
        sauvegarderResultats, chargerResultats, exporterDataGraphique
    };
})();

// ============================================================================
// UI \u2014 v5.1 P\u00E9dagogique (fix PASS_PAR_ANNEE scope)
// ============================================================================
function formatMontant(n) { return Math.round(n).toLocaleString('fr-FR'); }
function formatPct(n) { return Math.round(n) + ' %'; }

function buildBreakdownHTML(brut, tauxCharges, revenuProNet, abattement, revenuImposable, isTNS, statutLabel, nbParts, tmiAvant, impotAvant) {
    const chargesAmt = brut - revenuProNet;
    const chargePct = Math.round(tauxCharges * 100);
    const parPartInfo = nbParts > 1 ? '\u00F7 ' + nbParts + ' parts = ' + formatMontant(Math.round(revenuImposable/nbParts)) + ' \u20AC/part \u2192 ' : '\u2192 ';
    let h = '';
    h += '<div class="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3"><div class="flex items-center gap-3"><span class="text-xs font-bold bg-blue-900/50 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center">1</span><div><p class="text-sm font-semibold text-white">Salaire brut annuel</p><p class="text-[11px] text-slate-500">Ce que votre employeur verse au total</p></div></div><span class="text-base font-bold text-white">' + formatMontant(brut) + ' \u20AC</span></div>';
    h += '<div class="flex items-center gap-3 pl-6"><div class="w-0.5 h-4 bg-red-500/30 ml-2.5"></div><span class="text-xs text-red-400">\u2212 ' + chargePct + '% charges sociales (' + statutLabel + ')</span><span class="text-xs text-red-400 font-medium ml-auto">\u2212' + formatMontant(chargesAmt) + ' \u20AC</span></div>';
    h += '<div class="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3"><div class="flex items-center gap-3"><span class="text-xs font-bold bg-blue-900/50 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center">2</span><div><p class="text-sm font-semibold text-white">Salaire net de charges</p><p class="text-[11px] text-slate-500">Ce que vous recevez sur votre compte</p></div></div><span class="text-base font-bold text-white">' + formatMontant(revenuProNet) + ' \u20AC</span></div>';
    if (abattement > 0) {
        h += '<div class="flex items-center gap-3 pl-6"><div class="w-0.5 h-4 bg-orange-500/30 ml-2.5"></div><span class="text-xs text-orange-400">\u2212 10% abattement frais professionnels (max 14 171 \u20AC)</span><span class="text-xs text-orange-400 font-medium ml-auto">\u2212' + formatMontant(abattement) + ' \u20AC</span></div>';
    } else if (isTNS) {
        h += '<div class="flex items-center gap-3 pl-6"><div class="w-0.5 h-4 bg-slate-600 ml-2.5"></div><span class="text-xs text-slate-400">Pas d\'abattement 10% pour les TNS (charges r\u00E9elles d\u00E9duites)</span></div>';
    }
    h += '<div class="flex items-center justify-between bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-3"><div class="flex items-center gap-3"><span class="text-xs font-bold bg-blue-500/20 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center">3</span><div><p class="text-sm font-semibold text-blue-300">Revenu net imposable</p><p class="text-[11px] text-slate-400">Base de calcul de l\'imp\u00F4t ET du plafond PER</p></div></div><span class="text-lg font-bold text-blue-300">' + formatMontant(revenuImposable) + ' \u20AC</span></div>';
    h += '<div class="flex items-center gap-3 pl-6"><div class="w-0.5 h-4 bg-slate-600 ml-2.5"></div><span class="text-xs text-slate-400">' + parPartInfo + 'tranche \u00E0 <strong class="' + (tmiAvant >= 30 ? 'text-orange-400' : 'text-white') + '">' + tmiAvant + '%</strong> (TMI)</span></div>';
    h += '<div class="flex items-center justify-between bg-red-900/10 border border-red-700/20 rounded-lg px-4 py-3"><div class="flex items-center gap-3"><span class="text-xs font-bold bg-red-900/40 text-red-400 rounded-full w-6 h-6 flex items-center justify-center">4</span><div><p class="text-sm font-semibold text-red-300">Imp\u00F4t sur le revenu (sans PER)</p><p class="text-[11px] text-slate-400">Bar\u00E8me progressif' + (nbParts > 1 ? ' \u00D7 ' + nbParts + ' parts' : '') + '</p></div></div><span class="text-lg font-bold text-red-400">' + formatMontant(impotAvant) + ' \u20AC</span></div>';
    return '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-base font-bold text-white mb-4 flex items-center gap-2">\uD83E\uDDEE Comment votre brut devient imposable</h3><div class="space-y-1">' + h + '</div></div>';
}

function buildPlafondHTML(plafondN, plafondTheorique, revenuImposable, plafondsReportables, totalDisponible, totalReports, isTNS, constantes) {
    const plancher = constantes.PLAFOND_PER_MIN;
    const usePlancher = plafondTheorique < plancher;
    const ANNEE = constantes.ANNEE_SIMULATION;
    let regle = '<div class="bg-slate-800/40 rounded-lg p-4"><p class="text-sm text-white font-medium mb-2">R\u00E8gle l\u00E9gale : <span class="text-emerald-400">10% de votre revenu imposable</span></p><p class="text-xs text-slate-300">10% \u00D7 ' + formatMontant(revenuImposable) + ' \u20AC = <strong class="text-white">' + formatMontant(plafondTheorique) + ' \u20AC</strong>' + (isTNS ? '<span class="text-blue-400 ml-1">(+ 15% entre 1 et 8 PASS pour les TNS)</span>' : '') + '</p>';
    if (usePlancher) regle += '<div class="mt-2 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-2"><p class="text-xs text-emerald-300">\u2705 Bonne nouvelle : le <strong>plancher l\u00E9gal de ' + formatMontant(plancher) + ' \u20AC</strong> s\'applique (sup\u00E9rieur \u00E0 vos 10%).</p></div>';
    regle += '</div>';
    let rep = '';
    if (totalReports > 0) {
        let lig = '';
        if (plafondsReportables.n3 > 0) lig += '<div class="flex items-center justify-between bg-amber-900/15 border border-amber-700/30 rounded-lg px-3 py-2"><div class="flex items-center gap-2"><span class="text-amber-400 text-sm">\uD83D\uDEA8</span><div><p class="text-sm font-medium text-amber-300">N-3 : ' + formatMontant(plafondsReportables.n3) + ' \u20AC</p><p class="text-[11px] text-amber-400/80">Expire le 31 d\u00E9cembre ' + ANNEE + ' \u2014 \u00E0 utiliser EN PREMIER</p></div></div><span class="text-xs bg-amber-900/40 text-amber-300 px-2 py-1 rounded font-bold">URGENT</span></div>';
        if (plafondsReportables.n2 > 0) lig += '<div class="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2"><div><p class="text-sm text-white">N-2 : ' + formatMontant(plafondsReportables.n2) + ' \u20AC</p><p class="text-[11px] text-slate-500">P\u00E9rime l\'an prochain</p></div></div>';
        if (plafondsReportables.n1 > 0) lig += '<div class="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2"><p class="text-sm text-white">N-1 : ' + formatMontant(plafondsReportables.n1) + ' \u20AC</p></div>';
        lig += '<div class="flex items-center justify-between bg-emerald-900/10 border border-emerald-700/30 rounded-lg px-3 py-2"><div><p class="text-sm text-emerald-300">Ann\u00E9e ' + ANNEE + ' : ' + formatMontant(plafondN) + ' \u20AC</p><p class="text-[11px] text-slate-500">Plafond de l\'ann\u00E9e en cours</p></div></div>';
        rep = '<div class="bg-slate-800/40 rounded-lg p-4"><p class="text-sm text-white font-medium mb-3">Vos plafonds cumul\u00E9s</p><div class="space-y-2">' + lig + '</div><div class="mt-3 pt-3 border-t border-slate-700/50 flex justify-between items-center"><span class="text-sm text-slate-400">Plafond total disponible</span><span class="text-xl font-black text-emerald-400">' + formatMontant(totalDisponible) + ' \u20AC</span></div>';
        rep += '<div class="mt-3 bg-blue-900/15 border border-blue-700/30 rounded-lg px-3 py-2.5"><p class="text-xs text-blue-300 leading-relaxed">\uD83D\uDCA1 <strong>Comment \u00E7a marche ?</strong> Chaque ann\u00E9e, vous avez un plafond PER. Non utilis\u00E9, il est report\u00E9 <strong>3 ans</strong>. Au-del\u00E0, il est perdu. Le fisc consomme le <strong>plus ancien d\'abord</strong> (FIFO).' + (plafondsReportables.n3 > 0 ? '<span class="block mt-1 text-amber-300">\u26A0 Vos ' + formatMontant(plafondsReportables.n3) + ' \u20AC de N-3 : derni\u00E8re ann\u00E9e !</span>' : '') + '</p></div></div>';
    } else {
        rep = '<div class="bg-slate-800/40 rounded-lg p-4"><p class="text-sm text-slate-300">Pas de report \u2014 plafond ' + ANNEE + ' : <strong class="text-emerald-400">' + formatMontant(plafondN) + ' \u20AC</strong></p><p class="text-xs text-slate-500 mt-1">V\u00E9rifiez votre avis d\'imp\u00F4t pour d\'\u00E9ventuels plafonds ant\u00E9rieurs.</p></div>';
    }
    return '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-base font-bold text-white mb-4 flex items-center gap-2">\uD83D\uDCD0 Combien pouvez-vous verser sur le PER ?</h3><div class="space-y-3">' + regle + rep + '</div></div>';
}

function buildPlanVersementHTML(repMax, plRep, plN, tmiAvant, vMax, ecoMax, ANNEE) {
    const steps = [];
    if (repMax.n3 > 0) steps.push({label:'N-3',amount:repMax.n3,urgent:true,note:'p\u00E9rime fin '+ANNEE+' !'});
    if (repMax.n2 > 0) steps.push({label:'N-2',amount:repMax.n2,note:'p\u00E9rime l\'an prochain'});
    if (repMax.n1 > 0) steps.push({label:'N-1',amount:repMax.n1});
    if (repMax.n > 0) steps.push({label:'Ann\u00E9e '+ANNEE,amount:repMax.n,current:true,note:'plafond en cours'});
    if (!steps.length) return '';
    let rows = '';
    steps.forEach((s,i) => {
        const bg = s.urgent ? 'bg-amber-900/15 border border-amber-700/30' : s.current ? 'bg-emerald-900/10 border border-emerald-700/30' : 'bg-slate-800/40';
        const numBg = s.urgent ? 'bg-amber-900/40 text-amber-400' : s.current ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-700/50 text-slate-400';
        const amtColor = s.urgent ? 'text-amber-300' : s.current ? 'text-emerald-300' : 'text-white';
        const noteBg = s.urgent ? 'bg-amber-900/30 text-amber-400 font-bold' : s.current ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-700/50 text-slate-400';
        const eco = Math.round(s.amount * tmiAvant / 100);
        rows += '<div class="flex items-center gap-3 rounded-lg px-4 py-3 ' + bg + '"><span class="text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center ' + numBg + '">' + (i+1) + '</span><div class="flex-1"><div class="flex items-center gap-2"><span class="text-sm font-semibold text-white">' + s.label + '</span>' + (s.note ? '<span class="text-[10px] px-1.5 py-0.5 rounded ' + noteBg + '">' + s.note + '</span>' : '') + '</div>' + (s.urgent ? '<p class="text-[11px] text-amber-300/80 mt-0.5">Versez ce montant en premier \u2014 il sera perdu apr\u00E8s le 31 d\u00E9cembre</p>' : '') + '</div><div class="text-right"><p class="text-sm font-bold ' + amtColor + '">' + formatMontant(s.amount) + ' \u20AC</p><p class="text-[10px] text-slate-500">\u00E9co. ~' + formatMontant(eco) + ' \u20AC</p></div></div>';
    });
    return '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-base font-bold text-white mb-1 flex items-center gap-2">\uD83D\uDCCB Votre plan de versement</h3><p class="text-xs text-slate-500 mb-4">Les plafonds les plus anciens sont utilis\u00E9s en premier (FIFO)</p><div class="space-y-2">' + rows + '</div><div class="mt-3 pt-3 border-t border-slate-700/50 flex justify-between items-center"><span class="text-sm text-slate-400">Total</span><span class="text-lg font-black text-emerald-400">' + formatMontant(vMax) + ' \u20AC \u2192 \u00E9co. ' + formatMontant(ecoMax) + ' \u20AC</span></div></div>';
}

function runScenarioPER({ revenuBrut, statut, nbParts, plafondsReportables, perVersement }) {
    const tc = PatrimoineSimulator.getTauxCharges(statut);
    const rpn = revenuBrut * (1 - tc);
    const ab = PatrimoineSimulator.calculerAbattementFraisPro(rpn, statut);
    const nib = rpn - ab;
    const { plafondN, plafondsParAnnee:ppa, totalDisponible:td, totalReports:tr } = PatrimoineSimulator.calculerPlafondsPER(rpn, plafondsReportables, statut);
    const { utilisation:u, perDeductible:pd, perNonDeductible:pnd, plafondsRestants:pr } = PatrimoineSimulator.allouerVersementPER(perVersement, ppa);
    const nisp = nib, niap = nib - pd;
    const isp = PatrimoineSimulator.calculerImpot(nisp, nbParts), iap = PatrimoineSimulator.calculerImpot(niap, nbParts);
    const pan = PatrimoineSimulator.calculerPlafondsAnneeProchaine(pr);
    return { revenuProNet:rpn, abattementFraisPro:ab, netImposableSansPER:nisp, netImposableAvecPER:niap, impotSansPER:isp, impotAvecPER:iap, gainFiscal:isp-iap, perVersement, perDeductible:pd, perNonDeductible:pnd, plafondN, plafondTotal:td, totalReports:tr, utilisation:u, plafondsParAnnee:ppa, plafondsRestants:pr, plafondsAnneeProchaine:pan, tmiAvant:PatrimoineSimulator.getTauxMarginal(nisp,nbParts), tmiApres:PatrimoineSimulator.getTauxMarginal(niap,nbParts) };
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
    if (!brut || brut <= 0) { resultatElement.innerHTML = '<div class="bg-red-900/30 border border-red-700 rounded-xl p-4 text-sm text-red-200"><p><strong>Erreur :</strong> saisir un salaire brut valide.</p></div>'; return; }
    const statut = statutSelect?.value || 'salarie';
    const nbParts = parseFloat(situationSelect?.value || '1');
    const isTNS = (statut === 'independant');
    const statutLabels = {salarie:'Salari\u00E9',cadre:'Cadre',fonctionnaire:'Fonctionnaire',independant:'TNS'};
    const statutLabel = statutLabels[statut] || 'Salari\u00E9';
    const plafondsReportables = { n3:parseFloat(n3Input?.value?.replace(/\s/g,'')||'0')||0, n2:parseFloat(n2Input?.value?.replace(/\s/g,'')||'0')||0, n1:parseFloat(n1Input?.value?.replace(/\s/g,'')||'0')||0 };
    PatrimoineSimulator.calculerSimulationFiscale({revenuBrut:brut,typeRevenu:statut,nbParts,perPourcentage:0,plafondsReportables});
    if (alerteN3) alerteN3.classList.toggle('hidden', plafondsReportables.n3 <= 0);
    const tauxCharges = PatrimoineSimulator.getTauxCharges(statut);
    const revenuProNet = brut * (1 - tauxCharges);
    const abattement = PatrimoineSimulator.calculerAbattementFraisPro(revenuProNet, statut);
    const { plafondN, totalDisponible, totalReports } = PatrimoineSimulator.calculerPlafondsPER(revenuProNet, plafondsReportables, statut);
    const _PASS = PatrimoineSimulator.getConstantesPER().PASS_REF;
    const plafondTheorique = isTNS ? Math.round(Math.min(revenuProNet,_PASS*8)*0.10+Math.max(0,Math.min(revenuProNet,_PASS*8)-_PASS)*0.15) : Math.round((revenuProNet-abattement)*0.10);
    const scenSansPER = runScenarioPER({revenuBrut:brut,statut,nbParts,plafondsReportables,perVersement:0});
    const revenuImposable = scenSansPER.netImposableSansPER;
    const tmiAvant = scenSansPER.tmiAvant;
    const impotAvant = scenSansPER.impotSansPER;
    const optimisation = PatrimoineSimulator.calculerVersementOptimalPourChangerTranche(revenuImposable,plafondsReportables,nbParts,statut);
    const versementOptimal = optimisation.versementOptimal;
    let impotOptimal=impotAvant, tmiApresOptimal=tmiAvant, economieOptimal=0, nextYearOptimal={n3:0,n2:0,n1:0};
    if (versementOptimal > 0) { const so=runScenarioPER({revenuBrut:brut,statut,nbParts,plafondsReportables,perVersement:versementOptimal}); impotOptimal=so.impotAvecPER; tmiApresOptimal=so.tmiApres; economieOptimal=impotAvant-impotOptimal; nextYearOptimal=so.plafondsAnneeProchaine; }
    const versementMax = totalDisponible;
    let impotMax=impotAvant, tmiApresMax=tmiAvant, economieMax=0, scenMax=scenSansPER;
    if (versementMax > 0) { scenMax=runScenarioPER({revenuBrut:brut,statut,nbParts,plafondsReportables,perVersement:versementMax}); impotMax=scenMax.impotAvecPER; tmiApresMax=scenMax.tmiApres; economieMax=impotAvant-impotMax; }
    const repartitionMax = scenMax.utilisation || {n3:0,n2:0,n1:0,n:0};
    const constantes = PatrimoineSimulator.getConstantesPER();
    const ANNEE = constantes.ANNEE_SIMULATION;
    const horizonRetraite=20, rendementAnnuel=0.04;
    const pvEst = versementMax*(Math.pow(1+rendementAnnuel,horizonRetraite)-1);
    const fiscSortie = PatrimoineSimulator.estimerFiscaliteSortiePER(versementMax,pvEst,tmiApresMax);
    const canDropTMI = tmiApresMax < tmiAvant;
    const hasOptimal = versementOptimal > 0 && optimisation.peutChangerTranche;

    let html = '<div class="space-y-5">';
    html += '<div class="bg-gradient-to-br from-emerald-900/30 to-slate-900/60 border border-emerald-700/40 rounded-2xl p-6 md:p-8 text-center"><p class="text-sm text-slate-400 mb-1">Votre \u00E9conomie d\'imp\u00F4t maximale</p><p class="text-5xl md:text-6xl font-black text-emerald-400 tracking-tight">' + formatMontant(economieMax) + ' \u20AC</p><p class="text-sm text-slate-400 mt-2">en versant <strong class="text-white">' + formatMontant(versementMax) + ' \u20AC</strong> sur votre PER</p>' + (canDropTMI ? '<p class="text-sm text-emerald-300 mt-1">TMI : <strong class="text-orange-400">' + tmiAvant + '%</strong> \u2192 <strong class="text-emerald-400">' + tmiApresMax + '%</strong></p>' : '') + '</div>';
    html += buildBreakdownHTML(brut, tauxCharges, revenuProNet, abattement, revenuImposable, isTNS, statutLabel, nbParts, tmiAvant, impotAvant);
    html += buildPlafondHTML(plafondN, plafondTheorique, revenuImposable, plafondsReportables, totalDisponible, totalReports, isTNS, constantes);
    html += '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-base font-bold text-white mb-4 flex items-center gap-2">\uD83D\uDCC8 Comparatif des sc\u00E9narios</h3><div class="overflow-x-auto"><table class="min-w-full text-sm text-slate-200 border-collapse"><thead><tr class="bg-slate-800/80 text-slate-300"><th class="px-3 py-3 text-left font-semibold rounded-tl-lg">Sc\u00E9nario</th><th class="px-3 py-3 text-right font-semibold">Versement</th><th class="px-3 py-3 text-right font-semibold">Imp\u00F4t</th><th class="px-3 py-3 text-right font-semibold">\u00C9conomie</th><th class="px-3 py-3 text-right font-semibold rounded-tr-lg">TMI</th></tr></thead><tbody>';
    html += '<tr class="border-t border-slate-700"><td class="px-3 py-3 text-slate-400">Sans PER</td><td class="px-3 py-3 text-right text-slate-400">0 \u20AC</td><td class="px-3 py-3 text-right">' + formatMontant(impotAvant) + ' \u20AC</td><td class="px-3 py-3 text-right text-slate-400">\u2014</td><td class="px-3 py-3 text-right">' + formatPct(tmiAvant) + '</td></tr>';
    if (versementOptimal > 0) html += '<tr class="border-t border-slate-700 ' + (hasOptimal ? 'bg-purple-900/20' : '') + '"><td class="px-3 py-3"><span class="' + (hasOptimal ? 'text-purple-300 font-medium' : 'text-slate-300') + '">' + (hasOptimal ? '\u2605 ' : '') + 'Optimal</span><div class="text-xs text-slate-500 mt-0.5">' + (hasOptimal ? tmiAvant+'% \u2192 '+tmiApresOptimal+'%' : 'Plafond insuffisant') + '</div></td><td class="px-3 py-3 text-right">' + formatMontant(versementOptimal) + ' \u20AC</td><td class="px-3 py-3 text-right">' + formatMontant(impotOptimal) + ' \u20AC</td><td class="px-3 py-3 text-right text-emerald-400 font-medium">' + formatMontant(economieOptimal) + ' \u20AC</td><td class="px-3 py-3 text-right">' + formatPct(tmiApresOptimal) + '</td></tr>';
    html += '<tr class="border-t border-slate-700 bg-emerald-900/10"><td class="px-3 py-3"><span class="text-emerald-300 font-semibold">\u2B06 Maximum</span><div class="text-xs text-slate-500 mt-0.5">Tout le plafond</div></td><td class="px-3 py-3 text-right text-emerald-300 font-semibold">' + formatMontant(versementMax) + ' \u20AC</td><td class="px-3 py-3 text-right">' + formatMontant(impotMax) + ' \u20AC</td><td class="px-3 py-3 text-right text-emerald-400 font-black text-base">' + formatMontant(economieMax) + ' \u20AC</td><td class="px-3 py-3 text-right">' + formatPct(tmiApresMax) + '</td></tr></tbody></table></div></div>';
    html += buildPlanVersementHTML(repartitionMax, plafondsReportables, plafondN, tmiAvant, versementMax, economieMax, ANNEE);
    if (plafondsReportables.n3 > 0) { const eN3=Math.round(plafondsReportables.n3*tmiAvant/100); html += '<div class="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4"><div class="flex items-start gap-3"><span class="text-amber-400 text-xl mt-0.5">\uD83D\uDEA8</span><div><p class="text-sm font-bold text-amber-300">Priorit\u00E9 n\u00B01 : versez ' + formatMontant(plafondsReportables.n3) + ' \u20AC avant le 31 d\u00E9cembre ' + ANNEE + '</p><p class="text-xs text-slate-300 mt-1">Ce versement seul = <strong class="text-emerald-400">' + formatMontant(eN3) + ' \u20AC</strong> d\'\u00E9conomie.</p></div></div></div>'; }
    if (hasOptimal) html += '<div class="bg-purple-900/20 border border-purple-700/40 rounded-xl p-4"><div class="flex items-start gap-3"><span class="text-purple-400 text-xl mt-0.5">\u2605</span><div><p class="text-sm font-bold text-purple-300">' + formatMontant(versementOptimal) + ' \u20AC suffisent pour passer de ' + tmiAvant + '% \u00E0 ' + tmiApresOptimal + '%</p><p class="text-xs text-slate-300 mt-1">\u00C9conomie : <strong class="text-emerald-400">' + formatMontant(economieOptimal) + ' \u20AC</strong>. Au-del\u00E0, chaque euro est d\u00E9ductible \u00E0 ' + tmiApresOptimal + '%.</p></div></div></div>';
    html += '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-base font-bold text-white mb-3 flex items-center gap-2"><span class="text-orange-400">\u2696\uFE0F</span> Fiscalit\u00E9 \u00E0 la sortie <span class="text-xs font-normal text-slate-500">(estimation ' + horizonRetraite + ' ans)</span></h3><div class="grid md:grid-cols-2 gap-4 text-sm mb-3"><div class="bg-emerald-900/15 rounded-lg p-3 text-center"><p class="text-xs text-slate-400 mb-1">\u00C9conomie aujourd\'hui</p><p class="text-xl font-bold text-emerald-400">+' + formatMontant(economieMax) + ' \u20AC</p></div><div class="bg-orange-900/15 rounded-lg p-3 text-center"><p class="text-xs text-slate-400 mb-1">Imp\u00F4t \u00E0 la sortie</p><p class="text-xl font-bold text-orange-400">\u2212' + formatMontant(fiscSortie.totalFiscaliteSortie) + ' \u20AC</p></div></div><div class="p-3 rounded-lg text-xs ' + (tmiApresMax >= 30 ? 'bg-orange-900/10 border border-orange-800/30 text-orange-200' : 'bg-emerald-900/10 border border-emerald-800/30 text-emerald-200') + '">' + fiscSortie.avertissement + '</div><div class="mt-3 bg-slate-800/40 rounded-lg p-3 text-xs text-slate-400 leading-relaxed"><strong class="text-slate-300">Comment \u00E7a marche :</strong> le capital vers\u00E9 (d\u00E9duit \u00E0 l\'entr\u00E9e) est r\u00E9impos\u00E9 au bar\u00E8me IR. Les plus-values sont tax\u00E9es au PFU (30%). Si votre TMI baisse \u00E0 la retraite, vous gagnez la diff\u00E9rence.</div></div>';
    html += '<div class="bg-gradient-to-r from-slate-900 to-slate-900/80 border border-emerald-700/30 rounded-xl p-5 text-center"><p class="text-sm text-slate-300 mb-1">Pour maximiser votre avantage fiscal :</p><p class="text-xl font-bold text-white">Versez <span class="text-emerald-400">' + formatMontant(versementMax) + ' \u20AC</span> avant le 31 d\u00E9cembre ' + ANNEE + '</p>' + (plafondsReportables.n3 > 0 ? '<p class="text-sm text-amber-400 mt-2 font-medium">\uD83D\uDEA8 Dont ' + formatMontant(plafondsReportables.n3) + ' \u20AC en priorit\u00E9 (N-3)</p>' : '') + '<p class="text-xs text-slate-500 mt-2">\u00C9conomie imm\u00E9diate : <strong class="text-emerald-400">' + formatMontant(economieMax) + ' \u20AC</strong></p></div>';
    html += '<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5"><h3 class="text-sm font-semibold text-slate-400 mb-3">\u2139\uFE0F R\u00E9f\u00E9rences ' + ANNEE + '</h3><div class="grid md:grid-cols-2 gap-3 text-xs text-slate-400"><div>PASS : <strong class="text-slate-300">' + formatMontant(constantes.PASS_REF) + ' \u20AC</strong></div><div>Plancher PER : <strong class="text-slate-300">' + formatMontant(constantes.PLAFOND_PER_MIN) + ' \u20AC</strong></div><div>Plafond salari\u00E9s : <strong class="text-slate-300">' + formatMontant(constantes.PLAFOND_PER_MAX) + ' \u20AC</strong></div><div>Plafond TNS : <strong class="text-slate-300">' + formatMontant(constantes.PLAFOND_TNS_MAX) + ' \u20AC</strong></div><div>Abattement frais pro : 10% (max ' + formatMontant(constantes.ABATTEMENT_FRAIS_PRO.plafond) + ' \u20AC)</div><div>Reports 3 ans (FIFO) \u2022 D\u00E9blocage : RP, invalidit\u00E9</div></div></div>';
    html += '</div>';
    resultatElement.innerHTML = html;
    resultatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function calculerFiscalite() {
    const brut = parseFloat(document.getElementById("brut-annuel")?.value);
    if (!brut) return;
    const charges = parseFloat(document.getElementById("taux-charges")?.value) / 100;
    const perPct = parseFloat(document.getElementById("per-pourcentage")?.value) / 100;
    const typeRevenu = document.getElementById("type-revenu")?.value || 'salarie';
    const nbParts = parseFloat(document.getElementById("nb-parts")?.value) || 1;
    const plafondsReportables = { n1:parseFloat(document.getElementById("plafond-n1")?.value)||0, n2:parseFloat(document.getElementById("plafond-n2")?.value)||0, n3:parseFloat(document.getElementById("plafond-n3")?.value)||0 };
    const r = PatrimoineSimulator.calculerSimulationFiscale({revenuBrut:brut,typeRevenu,tauxCharges:charges,perPourcentage:perPct,nbParts,plafondsReportables});
    const el = {"impot-sans-per":`${formatMontant(r.impotSansPER)} \u20AC`,"impot-avec-per":`${formatMontant(r.impotAvecPER)} \u20AC`,"gain-fiscal":`${formatMontant(r.gainFiscal)} \u20AC`,"net-sans-per":`${formatMontant(r.netDispoSansPER)} \u20AC`,"net-avec-per":`${formatMontant(r.netDispoAvecPER)} \u20AC`,"patrimoine-total":`${formatMontant(r.patrimoineGlobal)} \u20AC`};
    Object.entries(el).forEach(([id,v]) => { const e=document.getElementById(id); if(e)e.textContent=v; });
}

window.PatrimoineSimulator = PatrimoineSimulator;
window.afficherSynthesePER = afficherSynthesePER;
window.runScenarioPER = runScenarioPER;
window.formatMontant = formatMontant;
window.formatPct = formatPct;

document.addEventListener('DOMContentLoaded', () => {
    console.log('PatrimoineSimulator v5.1 (PASS 2026, IR 2025, fix PASS scope)');
    const btn = document.getElementById('btn-analyser-per');
    if (btn) btn.addEventListener('click', afficherSynthesePER);
    const tgl = document.getElementById('btn-toggle-avance');
    const blc = document.getElementById('bloc-avance-per');
    if (tgl && blc) tgl.addEventListener('click', () => { blc.classList.toggle('hidden'); });
});
