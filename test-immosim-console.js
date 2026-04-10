/**
 * test-immosim-console.js
 * Tests du simulateur immobilier immoSim.html
 *
 * Usage : fetch('test-immosim-console.js?v=1').then(r=>r.text()).then(eval)
 */

(function testImmoSim() {
  const sim = window.simulateur;
  if (!sim) {
    console.error('❌ Simulateur non initialisé. Lance une simulation d\'abord.');
    return;
  }

  let passed = 0, failed = 0, warnings = 0;
  const P = (n, ok) => { if (ok) { console.log('✅', n); passed++; } else { console.error('❌', n); failed++; } };
  const W = (n, ok) => { if (ok) { console.log('✅', n); passed++; } else { console.warn('⚠️', n); warnings++; } };
  const fmt = v => Math.round(v).toLocaleString('fr-FR');

  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🏠 TESTS IMMOSIM — Simulateur Immobilier', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  // ═══════════════════════════════════════════════════
  // 1. CONSTANTES FISCALES 2026
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣ Constantes fiscales 2026', 'color:#f59e0b;font-size:12px;font-weight:bold');

  const fisc = sim.params.fiscalite;
  P('PS location nue = 17.2%', fisc.tauxPrelevementsSociaux === 17.2);
  P('PS meublé = 18.6%', fisc.tauxPrelevementsSociauxMeuble === 18.6);
  P('Déficit foncier = 10 700€', fisc.plafondDeficitFoncier === 10700);
  P('Déficit réno énergie = 21 400€', fisc.plafondDeficitRenoEnergetique === 21400);
  P('IS réduit = 15%', fisc.tauxISReduit === 15);
  P('Plafond IS = 100 000€', fisc.plafondISReduit === 100000);
  P('Assurance emprunteur = 0.20%', sim.defaults.tauxAssuranceEmprunteur === 0.20);

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 2. SIMULATION — Ville abordable (viable)
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c2️⃣ Simulation ville abordable (2500€/m², 13€ loyer)', 'color:#22c55e;font-size:12px;font-weight:bold');

  sim.params.base.apport = 30000;
  sim.params.base.taux = 3.5;
  sim.params.base.duree = 20;
  sim.params.communs.prixM2 = 2500;
  sim.params.communs.loyerM2 = 13;
  sim.params.communs.vacanceLocative = 5;
  sim.params.base.calculationMode = 'loyer-mensualite';

  const resAbordable = sim.chercheSurfaceDesc('classique', 1);
  P('Résultat trouvé', !!resAbordable);
  if (resAbordable) {
    console.log(`  Surface: ${resAbordable.surface}m² | Prix: ${fmt(resAbordable.prixAchat)}€ | Mensualité: ${fmt(resAbordable.mensualiteTotale)}€ | Loyer net: ${fmt(resAbordable.loyerNet)}€`);
    P('Surface entre 20 et 120m²', resAbordable.surface >= 20 && resAbordable.surface <= 120);
    P('Loyer net ≥ mensualité totale', resAbordable.loyerNet >= resAbordable.mensualiteTotale - 1);
    P('Marge ≥ 0', resAbordable.marge >= -1);
    P('Cash-flow calculé (pas NaN)', !isNaN(resAbordable.cashFlow));
    P('Rendement net > 0', resAbordable.rendementNet > 0);
    P('Capital remboursé > 0', resAbordable.tableauAmortissement?.length > 0);
  }

  // Enchères aussi
  const resEncheres = sim.chercheSurfaceDesc('encheres', 1);
  P('Enchères : résultat trouvé', !!resEncheres);
  if (resEncheres) {
    console.log(`  Enchères: ${resEncheres.surface}m² | Prix: ${fmt(resEncheres.prixAchat)}€`);
    W('Enchères surface ≤ classique (frais plus élevés)', resEncheres.surface <= (resAbordable?.surface || 999));
  }

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 3. SIMULATION — Ville chère (pas viable)
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c3️⃣ Simulation ville chère (8000€/m², 27€ loyer)', 'color:#ef4444;font-size:12px;font-weight:bold');

  sim.params.base.apport = 70000;
  sim.params.communs.prixM2 = 8000;
  sim.params.communs.loyerM2 = 27;

  const resCher = sim.chercheSurfaceDesc('classique', 1);
  const rdtBrutCher = (27 * 12) / 8000 * 100;
  console.log(`  Rendement brut: ${rdtBrutCher.toFixed(1)}%`);
  W('Ville chère = pas viable (rendement < 5%)', !resCher);

  if (!resCher) {
    // Vérifier que le diagnostic serait correct
    const viab20 = sim.calculerViabilite(20, 'classique');
    const contr20 = sim.surfaceRespecteContraintesFinancement(20, 'classique');
    const calc20 = sim.calculeTout(20, 'classique');
    console.log(`  20m²: contrainte=${contr20}, viable=${viab20}, marge=${Math.round(calc20.marge)}€`);
    P('Contrainte financement OK pour 20m²', contr20);
    P('Marge négative (loyer < mensualité)', calc20.marge < 0);
  }

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 4. MODE CASH-FLOW POSITIF
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c4️⃣ Mode cash-flow positif vs loyer ≥ mensualité', 'color:#a78bfa;font-size:12px;font-weight:bold');

  sim.params.base.apport = 30000;
  sim.params.communs.prixM2 = 2500;
  sim.params.communs.loyerM2 = 13;

  sim.params.base.calculationMode = 'loyer-mensualite';
  const resLM = sim.chercheSurfaceDesc('classique', 1);

  sim.params.base.calculationMode = 'cashflow-positif';
  const resCF = sim.chercheSurfaceDesc('classique', 1);

  console.log(`  Loyer≥Mensualité: ${resLM ? resLM.surface + 'm²' : 'NULL'}`);
  console.log(`  Cash-flow positif: ${resCF ? resCF.surface + 'm²' : 'NULL'}`);

  if (resLM && resCF) {
    W('CF positif → surface ≤ loyer≥mensualité (critère plus strict)', resCF.surface <= resLM.surface);
    P('CF positif: cash-flow ≥ 0', resCF.cashFlow >= -1);
  } else if (resLM && !resCF) {
    console.log('  ✅ Normal : CF positif plus strict, aucune surface viable');
  }

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 5. COHÉRENCE DES CALCULS
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c5️⃣ Cohérence des calculs (formules)', 'color:#6366f1;font-size:12px;font-weight:bold');

  sim.params.base.calculationMode = 'loyer-mensualite';
  sim.params.communs.prixM2 = 2500;
  sim.params.communs.loyerM2 = 13;
  sim.params.base.apport = 30000;

  const r = sim.calculeTout(40, 'classique');

  // Vérif mensualité
  const tauxM = sim.params.base.taux / 100 / 12;
  const nbM = sim.params.base.duree * 12;
  const mensCalc = (r.emprunt * tauxM) / (1 - Math.pow(1 + tauxM, -nbM));
  P('Mensualité correcte', Math.abs(r.mensualite - mensCalc) < 1);

  // Vérif assurance
  const assurCalc = r.emprunt * sim.defaults.tauxAssuranceEmprunteur / 100 / 12;
  P('Assurance emprunteur = emprunt × 0.20% / 12', Math.abs(r.mensualiteAssurance - assurCalc) < 0.1);
  P('Mensualité totale = mensualité + assurance', Math.abs(r.mensualiteTotale - r.mensualite - r.mensualiteAssurance) < 0.1);

  // Vérif loyer
  const loyerBrutCalc = 40 * sim.params.communs.loyerM2;
  P('Loyer brut = surface × loyer/m²', Math.abs(r.loyerBrut - loyerBrutCalc) < 0.1);
  P('Loyer net = brut × (1 - vacance%)', Math.abs(r.loyerNet - r.loyerBrut * 0.95) < 0.1);

  // Vérif marge
  P('Marge = loyer net - mensualité totale', Math.abs(r.marge - (r.loyerNet - r.mensualiteTotale)) < 0.1);

  // Vérif cash-flow
  const tfCalc = r.loyerBrut * 12 * (sim.params.communs.taxeFonciere / 100);
  console.log(`  TF: ${Math.round(tfCalc)}€/an, Charges copro: ${Math.round(40 * 30)}€/an`);
  P('Cash-flow < marge (cash-flow inclut TF + charges)', r.cashFlow < r.marge || Math.abs(r.cashFlow - r.marge) < 1);

  // Vérif enrichissement = CF + capital
  const capital = r.tableauAmortissement?.slice(0, 12).reduce((s, m) => s + m.amortissementCapital, 0) || 0;
  console.log(`  Capital remboursé an 1: ${fmt(capital)}€, CF annuel: ${fmt(r.cashFlow * 12)}€`);

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 6. SENSIBILITÉ AUX PARAMÈTRES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c6️⃣ Sensibilité aux paramètres', 'color:#f59e0b;font-size:12px;font-weight:bold');

  sim.params.base.calculationMode = 'loyer-mensualite';
  sim.params.communs.prixM2 = 2500;
  sim.params.communs.loyerM2 = 13;

  const sensRows = [];

  // Apport
  for (const apport of [10000, 30000, 50000, 80000]) {
    sim.params.base.apport = apport;
    const r = sim.chercheSurfaceDesc('classique', 1);
    sensRows.push({
      'Param': 'Apport ' + (apport/1000) + 'K€',
      'Surface': r ? r.surface + 'm²' : 'NULL',
      'Prix': r ? fmt(r.prixAchat) + '€' : '-',
      'Marge': r ? Math.round(r.marge) + '€' : '-'
    });
  }
  sim.params.base.apport = 30000;

  // Taux
  for (const taux of [2, 3, 3.5, 4, 5]) {
    sim.params.base.taux = taux;
    const r = sim.chercheSurfaceDesc('classique', 1);
    sensRows.push({
      'Param': 'Taux ' + taux + '%',
      'Surface': r ? r.surface + 'm²' : 'NULL',
      'Prix': r ? fmt(r.prixAchat) + '€' : '-',
      'Marge': r ? Math.round(r.marge) + '€' : '-'
    });
  }
  sim.params.base.taux = 3.5;

  // Durée
  for (const duree of [15, 20, 25]) {
    sim.params.base.duree = duree;
    const r = sim.chercheSurfaceDesc('classique', 1);
    sensRows.push({
      'Param': 'Durée ' + duree + ' ans',
      'Surface': r ? r.surface + 'm²' : 'NULL',
      'Prix': r ? fmt(r.prixAchat) + '€' : '-',
      'Marge': r ? Math.round(r.marge) + '€' : '-'
    });
  }
  sim.params.base.duree = 20;

  console.table(sensRows);

  // Vérifs logiques
  sim.params.base.apport = 10000;
  const r10 = sim.chercheSurfaceDesc('classique', 1);
  sim.params.base.apport = 80000;
  const r80 = sim.chercheSurfaceDesc('classique', 1);
  sim.params.base.apport = 30000;
  W('Plus d\'apport → plus grande surface', (!r10 && r80) || (r10 && r80 && r80.surface >= r10.surface));

  sim.params.base.taux = 2;
  const rT2 = sim.chercheSurfaceDesc('classique', 1);
  sim.params.base.taux = 5;
  const rT5 = sim.chercheSurfaceDesc('classique', 1);
  sim.params.base.taux = 3.5;
  W('Taux bas → plus grande surface', (!rT5 && rT2) || (rT2 && rT5 && rT2.surface >= rT5.surface));

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 7. CLASSIQUE vs ENCHÈRES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c7️⃣ Classique vs Enchères', 'color:#22c55e;font-size:12px;font-weight:bold');

  sim.params.communs.prixM2 = 2500;
  sim.params.communs.loyerM2 = 13;
  sim.params.base.apport = 30000;
  sim.params.base.calculationMode = 'loyer-mensualite';

  const classique = sim.simulerAchatClassique();
  const encheres = sim.simulerVenteEncheres();

  if (classique && encheres) {
    console.table([
      { Mode: 'Classique', Surface: classique.surface + 'm²', Prix: fmt(classique.prixAchat) + '€', 'Coût total': fmt(classique.coutTotal) + '€', Marge: Math.round(classique.marge) + '€', 'Rdt net': classique.rendementNet.toFixed(2) + '%' },
      { Mode: 'Enchères', Surface: encheres.surface + 'm²', Prix: fmt(encheres.prixAchat) + '€', 'Coût total': fmt(encheres.coutTotal) + '€', Marge: Math.round(encheres.marge) + '€', 'Rdt net': encheres.rendementNet.toFixed(2) + '%' }
    ]);
    W('Enchères surface ≤ classique (droits enregistrement élevés)', encheres.surface <= classique.surface);
  }

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 8. TEST DE COHÉRENCE INTÉGRÉ
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c8️⃣ Tests de cohérence intégrés', 'color:#00bfff;font-size:12px;font-weight:bold');

  sim.params.base.apport = 30000;
  sim.params.communs.prixM2 = 2000;
  sim.params.communs.loyerM2 = 12;
  const coherence = sim.testCoherence();
  P('testCoherence() passe', coherence);

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // RÉSULTAT
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log(`%c  🏁 RÉSULTAT : ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`, 'color:#22c55e;font-size:14px;font-weight:bold');
  if (failed === 0) {
    console.log('%c  🎉 Tous les tests passent !', 'color:#22c55e;font-size:12px');
  } else {
    console.log(`%c  ⛔ ${failed} test(s) en échec`, 'color:#ef4444;font-size:12px');
  }
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
})();
