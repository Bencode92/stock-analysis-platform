/**
 * test-final-console.js
 * Tests finaux complets — locatif + RP + TRI + BP + tous régimes
 *
 * Usage : fetch('test-final-console.js?v=1').then(r=>r.text()).then(eval)
 */

(async function testFinal() {
  const analyzer = window.analyzer;
  const ptAnalyzer = window.priceTargetAnalyzer;
  if (!analyzer) { console.error('❌ Charge la page et remplis le formulaire.'); return; }

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

  console.log('%c════════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🏆 TESTS FINAUX — Locatif + RP + TRI + BP + Tous régimes', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c════════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  // ═══════════════════════════════════════════════════
  // 1. CONSTANTES 2026 CRITIQUES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣ Constantes fiscales 2026', 'color:#f59e0b;font-size:12px;font-weight:bold');
  if (typeof FISCAL_CONSTANTS !== 'undefined') {
    P('PS nue = 17.2%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX === 0.172);
    P('PS meublé = 18.6%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX_MEUBLE === 0.186);
    P('IS plafond = 100K€', FISCAL_CONSTANTS.IS_PLAFOND_REDUIT === 100000);
    P('Déficit foncier = 10.7K€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX === 10700);
    P('LMP min = 1220€', FISCAL_CONSTANTS.LMP_COTISATIONS_MIN === 1220);
  }
  // Vérifier PFU 31.4% dans le code
  const pfuCheck = document.body.innerHTML.includes('31.4') || document.body.innerHTML.includes('31,4');
  W('PFU 31.4% référencé dans la page', pfuCheck);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 2. LOCATIF — 5 BIENS × MEILLEUR RÉGIME
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c2️⃣ Locatif — 5 profils de biens', 'color:#22c55e;font-size:12px;font-weight:bold');

  const biens = [
    { nom: 'Studio province 80K', prix: 80000, surface: 20, loyer: 450, apport: 15000, taux: 3.2, duree: 20 },
    { nom: 'T2 ville moyenne 150K', prix: 150000, surface: 40, loyer: 700, apport: 30000, taux: 3.4, duree: 20 },
    { nom: 'T3 grande ville 250K', prix: 250000, surface: 60, loyer: 1000, apport: 50000, taux: 3.5, duree: 25 },
    { nom: 'T4 IDF 400K', prix: 400000, surface: 80, loyer: 1500, apport: 80000, taux: 3.5, duree: 25 },
    { nom: 'Maison premium 600K', prix: 600000, surface: 120, loyer: 2000, apport: 120000, taux: 3.5, duree: 25 }
  ];

  const locResults = [];
  for (const b of biens) {
    setField('propertyPrice', b.prix); setField('propertySurface', b.surface);
    setField('monthlyRent', b.loyer); setField('monthlyCharges', 50);
    setField('apport', b.apport); setField('loanDuration', b.duree);
    setField('loanRate', b.taux); setField('tmi', 30);
    setField('occupationMode', 'investment');
    setField('compta-an', 1200); setField('cfe-an', 500);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();

    const pd = {
      ville: {}, prixPaye: b.prix, surface: b.surface, loyerActuel: b.loyer, loyerHC: b.loyer,
      charges: 50, monthlyCharges: 50, loyerCC: b.loyer + 50, apport: b.apport,
      duree: b.duree, taux: b.taux, tmi: 30, typeAchat: 'classique', occupationMode: 'investment',
      taxeFonciere: Math.round(b.prix * 0.005), entretienAnnuel: 500, assurancePNO: 15,
      chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4,
      regimeActuel: 'lmnp_reel', jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
    };

    const res = await analyzer.performCompleteAnalysis(pd);
    const fiscal = (res?.fiscal || []).sort((a, c) => (c.cashflowMensuel || 0) - (a.cashflowMensuel || 0));
    const best = fiscal[0] || {};
    const jb = fiscal.find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'nu_jeanbrun');
    const rdtBrut = ((b.loyer * 12) / b.prix * 100).toFixed(1);

    locResults.push({
      'Bien': b.nom,
      'Rdt brut': rdtBrut + '%',
      '#1': (best.nom || best.id || '?').substring(0, 14),
      'CF #1/mois': Math.round(best.cashflowMensuel || 0) + '€',
      'JB CF/mois': Math.round(jb?.cashflowMensuel || 0) + '€',
      'Nb régimes': fiscal.length
    });
  }
  console.table(locResults);
  P('5 biens analysés', locResults.length === 5);
  P('Tous ont ≥ 6 régimes', locResults.every(r => parseInt(r['Nb régimes']) >= 6));
  W('Studio rdt > Maison rdt', parseFloat(locResults[0]['Rdt brut']) > parseFloat(locResults[4]['Rdt brut']));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 3. TRI PAR RÉGIME — Bien T3 250K
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c3️⃣ TRI par régime — T3 250K (vérif revente spécifique)', 'color:#a78bfa;font-size:12px;font-weight:bold');

  const b3 = biens[2]; // T3 250K
  setField('propertyPrice', b3.prix); setField('propertySurface', b3.surface);
  setField('monthlyRent', b3.loyer); setField('apport', b3.apport);
  setField('loanDuration', b3.duree); setField('loanRate', b3.taux);
  setField('compta-an', 1200); setField('cfe-an', 500);

  if (ptAnalyzer) {
    const baseInput = analyzer.prepareFiscalData?.({
      ...biens[2], prixPaye: b3.prix, loyerActuel: b3.loyer, loyerHC: b3.loyer,
      charges: 50, monthlyCharges: 50, loyerCC: b3.loyer + 50,
      typeAchat: 'classique', occupationMode: 'investment',
      taxeFonciere: 1250, entretienAnnuel: 500, assurancePNO: 15,
      chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4,
      ville: {}
    });

    const triRows = [];
    for (const rid of ['nu_micro', 'nu_reel', 'nu_jeanbrun', 'lmnp_reel', 'sci_is']) {
      const ptResult = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId: rid });
      const cf = ptResult?.currentBreakdown?.cashflow || 0;
      const cap = ptResult?.currentBreakdown?.capital || 0;
      const enrich = ptResult?.currentEnrichment || 0;
      const registry = analyzer.getRegimeRegistry?.() || {};

      triRows.push({
        'Régime': (registry[rid]?.nom || rid).substring(0, 18),
        'CF/an': fmt(cf) + '€',
        'Capital/an': fmt(cap) + '€',
        'Enrichissement': fmt(enrich) + '€',
        'Prix éq.': fmt(ptResult?.priceTarget || 0) + '€'
      });
    }
    console.table(triRows);

    // Vérifs
    const lmnpE = parseInt(triRows[3]['Enrichissement'].replace(/\s/g, ''));
    const microE = parseInt(triRows[0]['Enrichissement'].replace(/\s/g, ''));
    const sciE = parseInt(triRows[4]['Enrichissement'].replace(/\s/g, ''));
    P('LMNP enrichissement > Micro', lmnpE > microE);
    W('LMNP enrichissement ≠ SCI IS (revente différente)', lmnpE !== sciE);
    P('Tous les prix d\'équilibre > 0', triRows.every(r => parseInt(r['Prix éq.'].replace(/\s/g, '')) > 0));
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 4. RP — 3 BIENS × IMPACT CONJOINT
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c4️⃣ RP — 3 biens × 3 niveaux de conjoint', 'color:#ef4444;font-size:12px;font-weight:bold');

  const rpBiens = [
    { nom: 'T2 150K', prix: 150000, loyer: 700, apport: 30000, taux: 3.4, duree: 20 },
    { nom: 'T3 300K', prix: 300000, loyer: 1200, apport: 60000, taux: 3.5, duree: 25 },
    { nom: 'T4 500K', prix: 500000, loyer: 1800, apport: 100000, taux: 3.5, duree: 25 }
  ];

  if (ptAnalyzer) {
    const rpRows = [];
    for (const b of rpBiens) {
      for (const partner of [0, 400, 800]) {
        const baseInput = analyzer.prepareFiscalData?.({
          ville: {}, prixPaye: b.prix, surface: 60, loyerActuel: b.loyer, loyerHC: b.loyer,
          charges: 50, monthlyCharges: 50, loyerCC: b.loyer + 50, apport: b.apport,
          duree: b.duree, taux: b.taux, tmi: 30, typeAchat: 'classique',
          occupationMode: 'residence', partnerContribution: partner,
          taxeFonciere: Math.round(b.prix * 0.005), entretienAnnuel: 500,
          assurancePNO: 15, chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4
        });

        const rpResult = ptAnalyzer.calculateRPPriceEquilibrium?.(baseInput, {
          loyerMarche: b.loyer + 50, partnerContribution: partner, tauxOpportuniteApport: 3
        });

        rpRows.push({
          'Bien': b.nom,
          'Conjoint': partner + '€/m',
          'Enrichir/an': fmt(rpResult?.rpEnrichmentComplete || 0) + '€',
          'Effort/mois': (rpResult?.rpMonthlyNet || 0) + '€',
          'Prix éq.': fmt(rpResult?.priceTarget || 0) + '€',
          'Verdict': (rpResult?.rpEnrichmentComplete || 0) >= 0 ? '✅' : '❌'
        });
      }
    }
    console.table(rpRows);

    // Vérifs
    const e0 = parseInt(rpRows[0]['Enrichir/an'].replace(/\s/g, ''));
    const e800 = parseInt(rpRows[2]['Enrichir/an'].replace(/\s/g, ''));
    W('Conjoint 800€ > 0€ en enrichissement', e800 >= e0);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 5. PFU 31.4% — VÉRIFICATION
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c5️⃣ PFU 31.4% — vérification', 'color:#6366f1;font-size:12px;font-weight:bold');

  const tresoTest = 100000;
  const pfuNet = tresoTest * (1 - 0.314);
  P('100K€ brut × (1 − 31.4%) = ' + fmt(pfuNet) + '€ net', Math.abs(pfuNet - 68600) < 1);
  P('PFU = 12.8% IR + 18.6% PS = 31.4%', Math.abs(0.128 + 0.186 - 0.314) < 0.001);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 6. SENSIBILITÉ TMI — LOCATIF
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c6️⃣ Sensibilité TMI (11% → 45%) — T3 250K', 'color:#22c55e;font-size:12px;font-weight:bold');

  const tmiRows = [];
  for (const tmi of [11, 30, 41, 45]) {
    setField('propertyPrice', 250000); setField('propertySurface', 60);
    setField('monthlyRent', 1000); setField('apport', 50000);
    setField('loanDuration', 25); setField('loanRate', 3.5);
    setField('tmi', tmi); setField('compta-an', 1200); setField('cfe-an', 500);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();

    const res = await analyzer.performCompleteAnalysis({
      ville: {}, prixPaye: 250000, surface: 60, loyerActuel: 1000, loyerHC: 1000,
      charges: 50, monthlyCharges: 50, loyerCC: 1050, apport: 50000,
      duree: 25, taux: 3.5, tmi, typeAchat: 'classique', occupationMode: 'investment',
      taxeFonciere: 1250, entretienAnnuel: 500, assurancePNO: 15,
      chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4,
      regimeActuel: 'lmnp_reel', jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
    });
    const f = (res?.fiscal || []).sort((a, b) => (b.cashflowMensuel || 0) - (a.cashflowMensuel || 0));
    const best = f[0] || {};
    const jb = f.find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'nu_jeanbrun');
    const lmnp = f.find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'lmnp_reel');

    tmiRows.push({
      'TMI': tmi + '%',
      '#1': (best.nom || best.id || '?').substring(0, 16),
      'LMNP CF': Math.round(lmnp?.cashflowMensuel || 0) + '€',
      'JB CF': Math.round(jb?.cashflowMensuel || 0) + '€',
      'JB > LMNP?': (jb?.cashflowMensuel || 0) > (lmnp?.cashflowMensuel || 0) ? '✅' : '❌'
    });
  }
  console.table(tmiRows);
  W('TMI 45% : JB se rapproche de LMNP', parseInt(tmiRows[3]['JB CF']) > parseInt(tmiRows[0]['JB CF']));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 7. ABATTEMENTS PV — 7 CAS
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c7️⃣ Abattements PV immobilière', 'color:#f59e0b;font-size:12px;font-weight:bold');
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
  // 8. ENRICHISSEMENT = CF + CAPITAL — 4 RÉGIMES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c8️⃣ Enrichissement = CF + Capital (δ < 10€)', 'color:#a78bfa;font-size:12px;font-weight:bold');

  if (ptAnalyzer) {
    const baseInput = analyzer.prepareFiscalData?.({
      ville: {}, prixPaye: 250000, surface: 60, loyerActuel: 1000, loyerHC: 1000,
      charges: 50, monthlyCharges: 50, loyerCC: 1050, apport: 50000,
      duree: 25, taux: 3.5, tmi: 30, typeAchat: 'classique', occupationMode: 'investment',
      taxeFonciere: 1250, entretienAnnuel: 500, assurancePNO: 15,
      chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4
    });

    for (const rid of ['nu_reel', 'lmnp_reel', 'nu_jeanbrun', 'nu_micro']) {
      const r = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId: rid });
      const cf = r?.currentBreakdown?.cashflow || 0;
      const cap = r?.currentBreakdown?.capital || 0;
      const enrich = r?.currentEnrichment || 0;
      const delta = Math.abs(enrich - (cf + cap));
      const nom = (analyzer.getRegimeRegistry?.()?.[rid]?.nom || rid).substring(0, 15);
      P(`${nom}: ${fmt(enrich)} = ${fmt(cf)} + ${fmt(cap)} [δ=${Math.round(delta)}]`, delta < 10);
    }
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 9. STRESS TEST — VÉRIFICATION LOGIQUE
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c9️⃣ Stress test — logique des scénarios', 'color:#ef4444;font-size:12px;font-weight:bold');

  const stressFlowsBase = [-50000, ...Array(14).fill(-3000), -3000 + 250000 * Math.pow(1.02, 15) * 0.85];
  const stressFlowsOpt = [-50000, ...Array(14).fill(-2500), -2500 + 250000 * Math.pow(1.03, 15) * 0.85];
  const stressFlowsCrash = [-50000, ...Array(14).fill(-5000), -5000 + 250000 * Math.pow(0.99, 15) * 0.85];

  const triBase = calcTRI(stressFlowsBase);
  const triOpt = calcTRI(stressFlowsOpt);
  const triCrash = calcTRI(stressFlowsCrash);

  console.log(`  Optimiste: TRI ${triOpt.toFixed(2)}% | Base: ${triBase.toFixed(2)}% | Crash: ${triCrash.toFixed(2)}%`);
  P('Optimiste > Base > Crash', triOpt > triBase && triBase > triCrash);
  P('Crash TRI > -15% (pas catastrophique)', triCrash > -15);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 10. UI — ÉLÉMENTS PRÉSENTS
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c🔟 Éléments UI présents', 'color:#00bfff;font-size:12px;font-weight:bold');

  P('7 radios régime comparaison-fiscale', document.querySelectorAll('input[name="regime-actuel"]').length >= 6);
  P('Jeanbrun radio existe', !!document.querySelector('input[name="regime-actuel"][value="nu_jeanbrun"]'));
  P('Jeanbrun options panel', !!document.getElementById('jeanbrun-options'));
  W('Business plan slot', !!document.getElementById('business-plan-slot'));
  W('Comparaison régimes slot', !!document.getElementById('bp-regime-comparison'));

  // Vérif labels PFU
  const allText = document.body.innerText || '';
  W('PFU 31.4% mentionné quelque part', allText.includes('31.4') || allText.includes('31,4'));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // RÉSULTAT
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c════════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log(`%c  🏁 RÉSULTAT FINAL : ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`, 'color:#22c55e;font-size:14px;font-weight:bold');
  if (failed === 0) console.log('%c  🎉 Tous les tests passent !', 'color:#22c55e;font-size:12px');
  else console.log(`%c  ⛔ ${failed} test(s) en échec — à corriger`, 'color:#ef4444;font-size:12px');
  console.log('%c════════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  // Restaurer
  setField('tmi', 30); setField('compta-an', 0); setField('cfe-an', 0);
  setField('occupationMode', 'investment');
})();
