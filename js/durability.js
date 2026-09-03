// ⚠️ SOURCE UNIQUE du Score Durabilité (anti-piège), adaptatif par secteur.
// Utilisée par le pipeline (stock-advanced-filter.js, Node/require) ET l'affichage (liste.html, navigateur).
// NE PAS dupliquer ailleurs — modifier ici seulement.
(function (root, factory) {
    if (typeof module !== "undefined" && module.exports) module.exports = factory();
    else root.computeDurability = factory();
})(typeof self !== "undefined" ? self : this, function () {
    return function computeDurability(stock) {
    const num = v => {
        if (v == null || v === '' || v === '-') return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace('%', '').replace('+', ''));
        return Number.isFinite(n) ? n : null;
    };
    const roe = num(stock.roe), roicAvg = num(stock.roic_avg_3y), roicStd = num(stock.roic_std_3y);
    const netMarg = num(stock.net_margin), revG = num(stock.revenue_growth_3y);
    const de = num(stock.de_ratio), fcfy = num(stock.fcf_yield), pe = num(stock.pe_ratio);
    const dd = num(stock.max_drawdown_3y), epsS = num(stock.eps_surprise_avg_2q);
    const epsBeat = num(stock.eps_beat_streak) || 0, buffAbs = num(stock.buffett_score);
    const qGrade = (stock.quality_grade || '').toUpperCase();
    const bc = {}, bcHas = {};
    (stock.buffett_criteria || []).forEach(c => { bcHas[c.name] = true; bc[c.name] = (c.passed ?? c.pass) === true; });
    const roeAvg = num(stock.roe_avg_3y), roeStd = num(stock.roe_std_3y);
    const payout = num(stock.payout_ratio_ttm), divY = num(stock.dividend_yield_ttm ?? stock.dividend_yield);
    const profile = (stock.quality_profile || 'DEFAULT').toUpperCase();
    // SECTEUR : les profils data ne distinguent que DEFAULT/TECH → on lit l'INDUSTRIE pour FIN et YIELD.
    // Un barème unique fausse les banques (pas de ROIC, levier structurel) et les utilities/REITs
    // (dette élevée + FCF négatif NORMAUX, payout haut normal). Chaque secteur a SES indicateurs.
    const ind = ((stock.industry || '') + ' ' + (stock.sector_api || '')).toLowerCase();
    const isFin = /bank|insurance|reinsurance|capital market|financial serv|asset manage|credit serv/.test(ind);
    const isYield = /reit|utilit/.test(ind);
    const growth = !isFin && !isYield && profile === 'TECH';
    const secLabel = isFin ? 'finance' : isYield ? 'utility/REIT' : growth ? 'croissance' : 'value';
    // GATE sector-aware : une banque n'a PAS de ROIC (normal) → on gate sur le ROE. Sinon sur le ROIC.
    const gateVal = isFin ? roe : roicAvg;
    const _core = [roe, roicAvg, netMarg].filter(v => v != null).length;
    if (gateVal == null || _core < 2) {
        return { insufficient: true, score: null, grade: null, verdict: 'Données insuffisantes', profile: secLabel, growth, mirage: false, crit: [] };
    }
    const band = (v, full, part, hib = true) => {
        if (v == null) return 0.5;
        return hib ? (v >= full ? 1 : v >= part ? 0.5 : 0) : (v <= full ? 1 : v <= part ? 0.5 : 0);
    };
    const crit = [];
    const push = (group, label, val, note) => crit.push({ group, label, val, note: note || null });

    // 1) RENTABILITÉ — métriques ADAPTÉES au secteur.
    const realProfit = isFin
        ? (roe != null && roe > 0 && netMarg != null && netMarg > 0)
        : ((roicAvg != null && roicAvg > 0) && (netMarg != null && netMarg > 0));
    let gRent;
    if (isFin) {
        // banque/assureur : ROE (pas de ROIC) + marge nette élevée + régularité du ROE
        const cRoe = band(roe, 10, 0), cMargin = band(netMarg, 15, 5);
        const cRoeStab = (roeAvg != null && Math.abs(roeAvg) > 0.5) ? band(Math.abs((roeStd ?? 0) / roeAvg), 0.30, 0.60, false) : 0.5;
        gRent = cRoe * 0.5 + cMargin * 0.3 + cRoeStab * 0.2;
        push('Rentabilité', 'ROE ≥ 10%', cRoe); push('Rentabilité', 'Marge nette élevée', cMargin); push('Rentabilité', 'ROE régulier', cRoeStab);
    } else {
        // ROIC seuil bas pour utility/REIT (régulé) ; ROE ROBUSTE au distordu (rachats → capitaux propres négatifs)
        const cRoic = band(roicAvg, isYield ? 3 : growth ? 6 : 10, 0);
        const cMargin = band(netMarg, growth ? 0.01 : 5, growth ? -10 : 0);
        const cRoe = (roe != null && roe > 0) ? 1 : (realProfit ? 0.75 : (roe != null && roe < 0 ? 0 : 0.5));
        gRent = cRoic * 0.45 + cMargin * 0.35 + cRoe * 0.20;
        push('Rentabilité', isYield ? 'ROIC ≥ 3% (régulé)' : 'ROIC ≥ coût du capital', cRoic); push('Rentabilité', 'Marge nette saine', cMargin); push('Rentabilité', 'ROE (structurel)', cRoe);
    }
    // 2) STABILITÉ — banque : régularité du ROE ; sinon du ROIC. Utility : drawdown attendu plus faible.
    const stabBase = isFin
        ? ((roeAvg != null && Math.abs(roeAvg) > 0.5) ? Math.abs((roeStd ?? 0) / roeAvg) : null)
        : ((roicAvg != null && Math.abs(roicAvg) > 0.5) ? Math.abs((roicStd ?? 0) / roicAvg) : null);
    const cStab = band(stabBase, 0.30, 0.60, false);
    const cDD = band(dd == null ? null : Math.abs(dd), isYield ? 25 : 35, isYield ? 45 : 55, false);
    const gStab = cStab * 0.6 + cDD * 0.4;
    push('Stabilité', isFin ? 'ROE régulier' : 'ROIC régulier', cStab); push('Stabilité', 'Drawdown contenu', cDD);
    // 3) TRAJECTOIRE / CROISSANCE
    const cMoat = bcHas.moat_expansion ? (bc.moat_expansion ? 1 : 0) : 0.5;
    const cRev = band(revG, growth ? 10 : isYield ? 1 : 2, growth ? 3 : isYield ? -2 : -3);
    const cEps = (epsS != null) ? band(epsS, 0.01, -5) : (epsBeat >= 2 ? 1 : 0.5);
    const gTraj = cMoat * 0.4 + cRev * 0.35 + cEps * 0.25;
    push('Trajectoire', 'Moat en expansion', cMoat); push('Trajectoire', growth ? 'Croissance CA soutenue' : 'CA non déclinant', cRev); push('Trajectoire', 'EPS tenus / beats', cEps);
    // 4) BILAN — CONTEXTUEL par secteur
    let cLev, cCash;
    if (isFin || isYield) {
        // finance & utility/REIT : levier STRUCTUREL (normal) → NON pénalisé ; on regarde le DIVIDENDE.
        cLev = 1;
        cCash = isFin
            ? ((payout == null) ? 0.75 : band(payout, 60, 90, false))   // banque : payout bas = soutenable
            : ((divY != null && divY > 0) ? 1 : 0.5);                    // utility/REIT : verse un dividende régulier
    } else if (growth) {
        const covered = (fcfy != null && fcfy > 0) || bc.cash_generation;
        cLev = (de == null) ? 0.5 : (de <= 2 ? 1 : covered ? 0.5 : 0);
        cCash = covered ? 1 : (revG != null && revG > 10 ? 0.5 : 0);
    } else {
        cLev = band(de, 1, 2, false);
        cCash = (bc.cash_generation || (fcfy != null && fcfy > 0)) ? 1 : 0;
    }
    const gBilan = cLev * 0.5 + cCash * 0.5;
    push('Bilan', (isFin || isYield) ? 'Levier structurel (OK)' : growth ? 'Dette couverte par le cash' : 'Levier maîtrisé', cLev, (isFin || isYield) ? 'sectoriel' : growth ? 'contextuel' : null);
    push('Bilan', (isFin || isYield) ? 'Dividende soutenable' : 'Génère du cash', cCash);
    // 5) VALO CONTEXTUELLE + COHÉRENCE peer↔absolu (anti-mirage)
    let cValo;
    if (growth) {
        const peg = (pe != null && pe > 0 && revG != null && revG > 0) ? pe / revG : null;
        cValo = band(peg, 1.5, 2.5, false);
    } else {
        cValo = band(pe, isFin ? 15 : 20, isFin ? 22 : 30, false);   // banque : PE plus bas = normal
    }
    // cohérence : le business fait-il de VRAIS profits (ce qui soutient le grade peer) ? Basé sur la
    // rentabilité absolue, PAS sur buffett_score (qui chute pour une valo chère → faux positif type Apple).
    const cCoher = realProfit ? 1 : (((roicAvg != null && roicAvg < 0) || (netMarg != null && netMarg < 0) || (isFin && roe != null && roe < 0)) ? 0 : 0.5);
    const gValo = cValo * 0.5 + cCoher * 0.5;
    push('Valo & honnêteté', growth ? 'Valo justifiée par la croissance' : 'Valo raisonnable', cValo, growth ? 'PEG' : null); push('Valo & honnêteté', 'Profits réels (grade non flatté)', cCoher);

    const W = growth
        ? { 'Rentabilité': 20, 'Stabilité': 20, 'Trajectoire': 35, 'Bilan': 10, 'Valo & honnêteté': 15 }
        : { 'Rentabilité': 30, 'Stabilité': 25, 'Trajectoire': 20, 'Bilan': 15, 'Valo & honnêteté': 10 };
    const G = { 'Rentabilité': gRent, 'Stabilité': gStab, 'Trajectoire': gTraj, 'Bilan': gBilan, 'Valo & honnêteté': gValo };
    let score = 0; for (const k in W) score += W[k] * G[k];
    score = Math.round(score);
    const grade = score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D';
    const verdict = grade === 'A' ? 'Solide' : grade === 'B' ? 'Correct' : grade === 'C' ? 'À creuser' : 'Piège probable';
    // mirage = le grade peer flatte (A/B) mais la durabilité est faible (C/D) — vraie contradiction affichée.
    const mirage = ['A', 'B'].includes(qGrade) && ['C', 'D'].includes(grade);
    return { score, grade, verdict, profile: secLabel, growth, mirage, crit };
};
});
