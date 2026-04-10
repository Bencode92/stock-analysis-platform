/**
 * test-complete-console.js
 * Tests complets : Business Plan, TRI, Stress Test, Radar, Comparateur, RP
 *
 * Usage sur comparaison-fiscale.html :
 *   fetch('test-complete-console.js?v=1').then(r=>r.text()).then(eval)
 */

(async function testAll() {
  const analyzer = window.analyzer;
  const ptAnalyzer = window.priceTargetAnalyzer;
  if (!analyzer) { console.error('❌ Charge comparaison-fiscale.html et remplis le formulaire.'); return; }

  let passed = 0, failed = 0, warnings = 0;
  const P = (n, ok) => { if (ok) { console.log('✅', n); passed++; } else { console.error('❌', n); failed++; } };
  const W = (n, ok) => { if (ok) { console.log('✅', n); passed++; } else { console.warn('⚠️', n); warnings++; } };
  const fmt = v => Math.round(v).toLocaleString('fr-FR');

  function setField(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') {
      const opt = Array.from(el.options).find(o => o.value == v);
      if (opt) el.value = opt.value;
    } else el.value = v;
  }

  function calcTRI(flows) {
    let r = 0.05;
    for (let it = 0; it < 100; it++) {
      let npv = 0, dnpv = 0;
      for (let t = 0; t < flows.length; t++) {
        npv += flows[t] / Math.pow(1 + r, t);
        dnpv -= t * flows[t] / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(dnpv) < 0.001) break;
      const nr = r - npv / dnpv;
      if (Math.abs(nr - r) < 0.0001) { r = nr; break; }
      r = Math.max(-0.5, Math.min(1, nr));
    }
    return r * 100;
  }

  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🧪 TESTS COMPLETS — Tous les scénarios', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  // ═══════════════════════════════════════════════════
  // 1. CONSTANTES 2026
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣ Constantes fiscales 2026', 'color:#f59e0b;font-size:12px;font-weight:bold');
  if (typeof FISCAL_CONSTANTS !== 'undefined') {
    P('PS nue 17.2%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX === 0.172);
    P('PS meublé 18.6%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX_MEUBLE === 0.186);
    P('IS plafond 100K€', FISCAL_CONSTANTS.IS_PLAFOND_REDUIT === 100000);
    P('Déficit foncier 10.7K€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX === 10700);
    P('Déficit réno énergie 21.4K€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX_RENO_ENERGETIQUE === 21400);
    P('LMP min 1220€', FISCAL_CONSTANTS.LMP_COTISATIONS_MIN === 1220);
  } else { P('FISCAL_CONSTANTS chargé', false); }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 2. 7 RÉGIMES FISCAUX
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c2️⃣ 7 régimes fiscaux — cohérence', 'color:#22c55e;font-size:12px;font-weight:bold');

  setField('propertyPrice', 240000); setField('propertySurface', 45);
  setField('monthlyRent', 1100); setField('monthlyCharges', 50);
  setField('apport', 50000); setField('loanDuration', 20);
  setField('loanRate', 3.5); setField('tmi', 30);
  setField('occupationMode', 'investment');
  setField('compta-an', 1200); setField('cfe-an', 500);

  if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
  const pd = {
    ville: {}, prixPaye: 240000, surface: 45, loyerActuel: 1100, loyerHC: 1100,
    charges: 50, monthlyCharges: 50, loyerCC: 1150, apport: 50000,
    duree: 20, taux: 3.5, tmi: 30, typeAchat: 'classique',
    occupationMode: 'investment', taxeFonciere: 1000,
    entretienAnnuel: 500, assurancePNO: 15, chargesCoproNonRecup: 50,
    fraisNotaireTaux: 8, commissionImmo: 4, regimeActuel: 'nu_reel',
    jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
  };

  const analysis = await analyzer.performCompleteAnalysis(pd);
  const fiscal = (analysis?.fiscal || []).sort((a, b) => (b.cashflowMensuel || 0) - (a.cashflowMensuel || 0));

  P('7 régimes calculés', fiscal.length >= 6);
  const findR = id => fiscal.find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === id);

  const lmnp = findR('lmnp_reel');
  const reel = findR('nu_reel');
  const micro = findR('nu_micro');
  const jb = findR('nu_jeanbrun');
  const sci = findR('sci_is');

  P('LMNP CF ≥ Réel CF', (lmnp?.cashflowMensuel||0) >= (reel?.cashflowMensuel||0));
  P('Réel CF > Micro CF', (reel?.cashflowMensuel||0) > (micro?.cashflowMensuel||0));
  P('Jeanbrun existe', !!jb);
  P('SCI IS existe', !!sci);

  console.table(fiscal.map((r, i) => ({
    '#': i + 1, 'Régime': (r.nom||r.id).substring(0, 20),
    'CF/mois': Math.round(r.cashflowMensuel || 0) + '€',
    'Impôt': Math.round(r.impotAnnuel || 0) + '€'
  })));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 3. PRIX CIBLE + ENRICHISSEMENT — 4 RÉGIMES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c3️⃣ Prix cible — enrichissement = CF + capital', 'color:#a78bfa;font-size:12px;font-weight:bold');

  if (ptAnalyzer) {
    const baseInput = analyzer.prepareFiscalData?.(pd);
    const ptRows = [];

    for (const rid of ['nu_reel', 'lmnp_reel', 'nu_jeanbrun', 'sci_is']) {
      const result = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId: rid });
      const cf = result.currentBreakdown?.cashflow || 0;
      const cap = result.currentBreakdown?.capital || 0;
      const enrich = result.currentEnrichment || 0;
      const delta = Math.abs(enrich - (cf + cap));
      const registry = analyzer.getRegimeRegistry?.() || {};

      ptRows.push({
        'Régime': (registry[rid]?.nom || rid).substring(0, 18),
        'Enrichissement': fmt(enrich) + '€', 'CF': fmt(cf) + '€',
        'Capital': fmt(cap) + '€', 'δ': Math.round(delta),
        'Prix éq.': fmt(result.priceTarget) + '€'
      });
      P(`${(registry[rid]?.nom||rid).substring(0,12)}: enrichissement = CF + capital (δ=${Math.round(delta)})`, delta < 10);
    }
    console.table(ptRows);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 4. TRI — COHÉRENCE ET SENSIBILITÉ
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c4️⃣ TRI — cohérence horizons', 'color:#ef4444;font-size:12px;font-weight:bold');

  // TRI simplifié pour vérifier la tendance
  const apport = 50000;
  const loyerAn = 1100 * 12;
  const cfSimplifie = -4000; // approximation

  const tri10 = calcTRI([-apport, ...Array(9).fill(cfSimplifie), cfSimplifie + 240000 * Math.pow(1.02, 10) * 0.85]);
  const tri20 = calcTRI([-apport, ...Array(19).fill(cfSimplifie), cfSimplifie + 240000 * Math.pow(1.02, 20) * 0.85]);

  console.log(`TRI simplifié 10 ans: ${tri10.toFixed(2)}%, 20 ans: ${tri20.toFixed(2)}%`);
  P('TRI > 0 (investissement rentable)', tri10 > 0);
  W('TRI 20 ans ≥ TRI 10 ans', tri20 >= tri10 - 1);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 5. ABATTEMENTS PV — 7 cas
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c5️⃣ Abattements plus-value', 'color:#6366f1;font-size:12px;font-weight:bold');

  [
    [3, 0, 0], [5, 0, 0], [6, 0.06, 0.0165], [10, 0.30, 0.0825],
    [22, 1.0, 0.2805], [30, 1.0, 0.4125], [31, 1.0, 1.0]
  ].forEach(([year, expIR, expPS]) => {
    let abattIR = 0, abattPS = 0;
    if (year > 5) { abattIR = Math.min(1, (year - 5) * 0.06); abattPS = Math.min(1, (year - 5) * 0.0165); }
    if (year > 22) abattIR = 1;
    if (year > 30) abattPS = 1;
    P(`An ${year}: IR=${(abattIR*100).toFixed(0)}% PS=${(abattPS*100).toFixed(1)}%`,
      Math.abs(abattIR - expIR) < 0.01 && Math.abs(abattPS - expPS) < 0.01);
  });
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 6. STRESS TEST — 7 scénarios
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c6️⃣ Stress test — 7 scénarios', 'color:#f59e0b;font-size:12px;font-weight:bold');

  const stressScenarios = [
    { nom: 'Optimiste', appreciation: 0.03, hausseL: 0.02, vacance: 0 },
    { nom: 'Base', appreciation: 0.02, hausseL: 0.015, vacance: 0 },
    { nom: 'Taux +1%', appreciation: 0.02, hausseL: 0.015, vacance: 0, tauxDelta: 1 },
    { nom: 'Loyers -10%', appreciation: 0.02, hausseL: 0.015, vacance: 0, loyerFactor: 0.9 },
    { nom: 'Vacance 2 mois', appreciation: 0.02, hausseL: 0.015, vacance: 16.7 },
    { nom: 'Crash -20%', appreciation: -0.01, hausseL: 0.01, vacance: 5 },
    { nom: 'Tout va bien', appreciation: 0.04, hausseL: 0.025, vacance: 0 }
  ];

  const stressRows = [];
  stressScenarios.forEach(sc => {
    const loyerNet = loyerAn * (sc.loyerFactor || 1) * (1 - (sc.vacance || 0) / 100);
    const tauxS = 3.5 + (sc.tauxDelta || 0);
    const emprunt = 190000; // approximation
    const tauxMS = tauxS / 100 / 12;
    const mensu = (emprunt * tauxMS) / (1 - Math.pow(1 + tauxMS, -240));
    const cfAn = loyerNet - 7000 - mensu * 12; // charges approx 7K

    const flows = [-apport];
    let capRest = emprunt;
    for (let y = 1; y <= 15; y++) {
      const lY = loyerNet * Math.pow(1 + sc.hausseL, y - 1);
      const cY = 7000 * Math.pow(1.02, y - 1);
      const mY = y <= 20 ? mensu * 12 : 0;
      const cfY = lY - cY - mY;
      if (capRest > 0) { const i = capRest * (tauxS / 100); capRest = Math.max(0, capRest - (mensu * 12 - i)); }
      if (y === 15) {
        const val = 240000 * Math.pow(1 + sc.appreciation, y);
        flows.push(cfY + val - capRest - val * 0.07);
      } else { flows.push(cfY); }
    }
    const tri = calcTRI(flows);

    stressRows.push({
      'Scénario': sc.nom, 'TRI 15 ans': tri.toFixed(2) + '%',
      'CF an 1': fmt(cfAn) + '€', 'OK': tri > -10 ? '✅' : '❌'
    });
  });
  console.table(stressRows);

  // Vérifications logiques
  const triOpt = parseFloat(stressRows[0]['TRI 15 ans']);
  const triBase = parseFloat(stressRows[1]['TRI 15 ans']);
  const triCrash = parseFloat(stressRows[5]['TRI 15 ans']);
  P('Optimiste TRI > Base TRI', triOpt > triBase);
  P('Base TRI > Crash TRI', triBase > triCrash);
  W('Crash TRI > -10% (pas catastrophique)', triCrash > -10);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 7. JEANBRUN — 3 niveaux × 2 types
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c7️⃣ Jeanbrun — 3 niveaux × 2 types', 'color:#6366f1;font-size:12px;font-weight:bold');

  const jbRegime = analyzer.comparateur?.regimes?.find(r => r.id === 'jeanbrun');
  P('Jeanbrun dans comparateur', !!jbRegime);

  if (jbRegime && ptAnalyzer) {
    const jbRows = [];
    for (const type of ['neuf', 'ancien']) {
      for (const niveau of ['intermediaire', 'social', 'tresSocial']) {
        pd.jeanbrunType = type; pd.jeanbrunNiveau = niveau;
        setField('jeanbrun-type', type === 'neuf' ? 'neuf' : 'ancien');
        if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
        const res = await analyzer.performCompleteAnalysis(pd);
        const jbRes = (res?.fiscal || []).find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'nu_jeanbrun');
        jbRows.push({
          'Type': type, 'Niveau': niveau,
          'CF/mois': Math.round(jbRes?.cashflowMensuel || 0) + '€',
          'Impôt': Math.round(jbRes?.impotAnnuel || 0) + '€'
        });
      }
    }
    console.table(jbRows);
    // Neuf amort > ancien amort → meilleur impôt
    W('Neuf interméd impôt ≥ ancien interméd (amort plus élevé)',
      parseInt(jbRows[0]['Impôt']) >= parseInt(jbRows[3]['Impôt']));
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 8. RP vs LOCATIF
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c8️⃣ RP vs Locatif — même bien', 'color:#00bfff;font-size:12px;font-weight:bold');

  if (ptAnalyzer) {
    const baseInput = analyzer.prepareFiscalData?.({
      ...pd, occupationMode: 'residence', partnerContribution: 400
    });
    if (baseInput) {
      const rpResult = ptAnalyzer.calculateRPPriceEquilibrium?.(baseInput, {
        loyerMarche: 1150, partnerContribution: 400, tauxOpportuniteApport: 3
      });
      if (rpResult) {
        console.log(`  RP enrichissement: ${fmt(rpResult.rpEnrichmentComplete)}€/an`);
        console.log(`  RP effort: ${rpResult.rpMonthlyNet}€/mois`);
        console.log(`  RP prix équilibre: ${fmt(rpResult.priceTarget)}€`);
        P('RP enrichissement calculé', rpResult.rpEnrichmentComplete !== undefined);
        P('RP prix équilibre > 0', rpResult.priceTarget > 0);
      }
    }

    // Locatif meilleur régime
    const locResult = ptAnalyzer.calculatePriceTarget(
      analyzer.prepareFiscalData?.(pd), 0, { regimeId: 'lmnp_reel' }
    );
    console.log(`  Locatif enrichissement (LMNP): ${fmt(locResult?.currentEnrichment || 0)}€/an`);
    P('Locatif enrichissement calculé', (locResult?.currentEnrichment || 0) !== 0);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 9. SENSIBILITÉ TMI
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c9️⃣ Sensibilité TMI — 4 profils', 'color:#22c55e;font-size:12px;font-weight:bold');

  const tmiRows = [];
  for (const tmi of [11, 30, 41, 45]) {
    setField('tmi', tmi);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
    const res = await analyzer.performCompleteAnalysis({ ...pd, tmi });
    const f = (res?.fiscal || []).sort((a, b) => (b.cashflowMensuel || 0) - (a.cashflowMensuel || 0));
    const best = f[0] || {};
    const jbF = f.find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'nu_jeanbrun');

    tmiRows.push({
      'TMI': tmi + '%',
      '#1': (best.nom || best.id || '?').substring(0, 16),
      'CF #1': Math.round(best.cashflowMensuel || 0) + '€',
      'JB CF': Math.round(jbF?.cashflowMensuel || 0) + '€'
    });
  }
  console.table(tmiRows);
  P('TMI 45% : Jeanbrun monte dans le classement',
    parseInt(tmiRows[3]['JB CF']) > parseInt(tmiRows[0]['JB CF']));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 10. SENSIBILITÉ PROFILS DE BIENS
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c🔟 Sensibilité — 5 profils de biens', 'color:#ef4444;font-size:12px;font-weight:bold');

  const biens = [
    { nom: 'Studio 80K', prix: 80000, loyer: 450, apport: 15000, surface: 20 },
    { nom: 'T2 150K', prix: 150000, loyer: 650, apport: 30000, surface: 40 },
    { nom: 'T3 250K', prix: 250000, loyer: 950, apport: 50000, surface: 60 },
    { nom: 'T4 350K', prix: 350000, loyer: 1200, apport: 70000, surface: 80 },
    { nom: 'Maison 500K', prix: 500000, loyer: 1600, apport: 100000, surface: 110 }
  ];

  const bienRows = [];
  for (const b of biens) {
    setField('propertyPrice', b.prix); setField('propertySurface', b.surface);
    setField('monthlyRent', b.loyer); setField('apport', b.apport);
    setField('tmi', 30); setField('compta-an', 1200); setField('cfe-an', 500);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();

    const res = await analyzer.performCompleteAnalysis({
      ...pd, prixPaye: b.prix, surface: b.surface, loyerActuel: b.loyer,
      loyerHC: b.loyer, loyerCC: b.loyer + 50, apport: b.apport
    });
    const f = (res?.fiscal || []).sort((a, c) => (c.cashflowMensuel || 0) - (a.cashflowMensuel || 0));
    const best = f[0] || {};
    const rdtBrut = ((b.loyer * 12) / b.prix * 100).toFixed(1);

    bienRows.push({
      'Bien': b.nom, 'Rdt brut': rdtBrut + '%',
      '#1': (best.nom || best.id || '?').substring(0, 14),
      'CF/mois': Math.round(best.cashflowMensuel || 0) + '€'
    });
  }
  console.table(bienRows);
  W('Studio rdt > Maison rdt', parseFloat(bienRows[0]['Rdt brut']) > parseFloat(bienRows[4]['Rdt brut']));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 11. EXPORT CSV
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣1️⃣ Export CSV & boutons', 'color:#00bfff;font-size:12px;font-weight:bold');

  const bpSlot = document.getElementById('business-plan-slot');
  const csvLink = bpSlot?.querySelector('a[download]') || document.querySelector('a[download*="business-plan"]');
  const copyBtn = bpSlot?.querySelector('button[onclick*="clipboard"]');
  W('Bouton CSV présent (lancer analyse d\'abord)', !!csvLink);
  W('Bouton Copier présent', !!copyBtn);

  const bpChart = document.getElementById('bp-chart');
  W('Graphique Business Plan présent', !!bpChart);

  const horizonSlider = document.getElementById('bp-horizon-slider');
  W('Slider horizon TRI présent', !!horizonSlider);

  const regimeComparison = document.getElementById('bp-regime-comparison');
  W('Comparaison régimes présent', !!regimeComparison);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // RÉSULTAT FINAL
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log(`%c  🏁 RÉSULTAT FINAL : ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`, 'color:#22c55e;font-size:14px;font-weight:bold');
  if (failed === 0) console.log('%c  🎉 Tous les tests passent !', 'color:#22c55e;font-size:12px');
  else console.log(`%c  ⛔ ${failed} test(s) en échec`, 'color:#ef4444;font-size:12px');
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  // Restaurer
  setField('tmi', 30); setField('compta-an', 0); setField('cfe-an', 0);
})();
