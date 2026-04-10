/**
 * test-businessplan-console.js
 * Tests Business Plan + TRI — cohérence des calculs
 *
 * Usage : fetch('test-businessplan-console.js?v=1').then(r=>r.text()).then(eval)
 */

(async function testBusinessPlan() {
  const analyzer = window.analyzer;
  const ptAnalyzer = window.priceTargetAnalyzer;
  if (!analyzer || !ptAnalyzer) {
    console.error('❌ Remplis le formulaire une fois puis relance.');
    return;
  }

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

  // Calculer le TRI (même algo que price-target-ui.js)
  function calcTRI(cashFlows) {
    let r = 0.05;
    for (let iter = 0; iter < 100; iter++) {
      let npv = 0, dnpv = 0;
      for (let t = 0; t < cashFlows.length; t++) {
        npv += cashFlows[t] / Math.pow(1 + r, t);
        dnpv -= t * cashFlows[t] / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(dnpv) < 0.001) break;
      const newR = r - npv / dnpv;
      if (Math.abs(newR - r) < 0.0001) { r = newR; break; }
      r = Math.max(-0.5, Math.min(1, newR));
    }
    return r * 100;
  }

  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  📊 TESTS BUSINESS PLAN + TRI', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  // Bien test
  const sc = { prix: 200000, surface: 60, loyerHC: 800, apport: 40000, duree: 20, taux: 3.5, tmi: 30 };
  setField('propertyPrice', sc.prix);
  setField('propertySurface', sc.surface);
  setField('monthlyRent', sc.loyerHC);
  setField('monthlyCharges', 50);
  setField('apport', sc.apport);
  setField('loanDuration', sc.duree);
  setField('loanRate', sc.taux);
  setField('tmi', sc.tmi);
  setField('occupationMode', 'investment');
  setField('compta-an', 0);
  setField('cfe-an', 0);
  console.log(`Bien test : ${fmt(sc.prix)}€, ${sc.surface}m², loyer ${sc.loyerHC}€, apport ${fmt(sc.apport)}€, ${sc.taux}% sur ${sc.duree} ans`);

  // ═══════════════════════════════════════════════════
  // 1. CALCUL PRIX CIBLE + ENRICHISSEMENT
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣ Prix cible + enrichissement de base', 'color:#f59e0b;font-size:12px;font-weight:bold');

  if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
  const baseInput = analyzer.prepareFiscalData?.({
    ville: {}, prixPaye: sc.prix, surface: sc.surface,
    loyerActuel: sc.loyerHC, loyerHC: sc.loyerHC,
    charges: 50, monthlyCharges: 50, loyerCC: 850,
    apport: sc.apport, duree: sc.duree, taux: sc.taux, tmi: sc.tmi,
    typeAchat: 'classique', occupationMode: 'investment',
    taxeFonciere: 800, entretienAnnuel: 500, assurancePNO: 15,
    chargesCoproNonRecup: 50, fraisNotaireTaux: 8, commissionImmo: 4,
    regimeActuel: 'nu_reel'
  });

  const ptResult = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId: 'nu_reel' });
  console.log(`  Enrichissement an 1: ${fmt(ptResult.currentEnrichment)}€`);
  console.log(`  CF annuel: ${fmt(ptResult.currentBreakdown?.cashflow)}€`);
  console.log(`  Capital an 1: ${fmt(ptResult.currentBreakdown?.capital)}€`);
  console.log(`  Prix équilibre: ${fmt(ptResult.priceTarget)}€`);

  P('Enrichissement = CF + Capital', Math.abs(ptResult.currentEnrichment - (ptResult.currentBreakdown?.cashflow + ptResult.currentBreakdown?.capital)) < 5);
  P('Prix cible > 0', ptResult.priceTarget > 0);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 2. VÉRIF BUSINESS PLAN — ANNÉE 1
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c2️⃣ Business Plan — vérification année 1', 'color:#22c55e;font-size:12px;font-weight:bold');

  const emprunt = Number(baseInput?.loanAmount || 0);
  const loyerAn = sc.loyerHC * 12;
  const tauxM = sc.taux / 100 / 12;
  const nbM = sc.duree * 12;
  const mensu = (emprunt * tauxM) / (1 - Math.pow(1 + tauxM, -nbM));
  const mensAn = mensu * 12;
  const interetsAn1 = emprunt * (sc.taux / 100);
  const capitalAn1 = mensAn - interetsAn1;
  const cfAn1 = ptResult.currentBreakdown?.cashflow || 0;

  console.log(`  Emprunt: ${fmt(emprunt)}€`);
  console.log(`  Mensualité: ${fmt(mensu)}/mois = ${fmt(mensAn)}/an`);
  console.log(`  Intérêts an 1: ${fmt(interetsAn1)}€`);
  console.log(`  Capital remboursé an 1: ${fmt(capitalAn1)}€`);
  console.log(`  CF an 1: ${fmt(cfAn1)}€`);

  P('Emprunt > 0 et < coût total', emprunt > 0 && emprunt < sc.prix * 1.15);
  P('Mensualité entre 500 et 2000€/mois', mensu > 500 && mensu < 2000);
  P('Capital remboursé an 1 > 0', capitalAn1 > 0);
  P('Intérêts an 1 > capital an 1 (début de prêt)', interetsAn1 > capitalAn1);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 3. VÉRIF TRI — COHÉRENCE
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c3️⃣ TRI — vérification cohérence', 'color:#a78bfa;font-size:12px;font-weight:bold');

  const appreciation = 0.02;
  const hausseLoyers = 0.015;
  const fraisRevente = 0.07;

  // Construire les flux pour TRI 10 ans
  const chargesEtImpotsAn1 = loyerAn - cfAn1 - mensAn;
  const flows10 = [-sc.apport];
  let capRest = emprunt;

  for (let y = 1; y <= 10; y++) {
    const loyerY = loyerAn * Math.pow(1 + hausseLoyers, y - 1);
    const chargesY = chargesEtImpotsAn1 * Math.pow(1 + 0.02, y - 1);
    const mensY = y <= sc.duree ? mensAn : 0;
    const cfY = loyerY - chargesY - mensY;

    if (y <= sc.duree && capRest > 0) {
      const inter = capRest * (sc.taux / 100);
      capRest = Math.max(0, capRest - (mensAn - inter));
    }

    const valeurBien = sc.prix * Math.pow(1 + appreciation, y);

    if (y === 10) {
      // PV avec abattements
      const pvBrute = valeurBien - sc.prix;
      const abattIR = Math.min(1, (y - 5) * 0.06);
      const abattPS = Math.min(1, (y - 5) * 0.0165);
      const impotPV = Math.max(0, pvBrute * (1 - abattIR) * 0.19 + pvBrute * (1 - abattPS) * 0.172);
      const fraisV = valeurBien * fraisRevente;
      const netRevente = valeurBien - capRest - impotPV - fraisV;
      flows10.push(cfY + netRevente);
    } else {
      flows10.push(cfY);
    }
  }

  const tri10 = calcTRI(flows10);
  console.log(`  TRI 10 ans calculé: ${tri10.toFixed(2)}%`);
  console.log(`  Flux: [${flows10.map(f => fmt(f)).join(', ')}]`);

  P('TRI 10 ans entre -5% et 30%', tri10 > -5 && tri10 < 30);
  P('TRI 10 ans > 0 (investissement rentable)', tri10 > 0);

  // TRI 20 ans devrait être meilleur que 10 ans (amortissement + appréciation)
  const flows20 = [-sc.apport];
  capRest = emprunt;
  for (let y = 1; y <= 20; y++) {
    const loyerY = loyerAn * Math.pow(1 + hausseLoyers, y - 1);
    const chargesY = chargesEtImpotsAn1 * Math.pow(1 + 0.02, y - 1);
    const mensY = y <= sc.duree ? mensAn : 0;
    const cfY = loyerY - chargesY - mensY;
    if (y <= sc.duree && capRest > 0) {
      const inter = capRest * (sc.taux / 100);
      capRest = Math.max(0, capRest - (mensAn - inter));
    }
    if (y === 20) {
      const valeurBien = sc.prix * Math.pow(1 + appreciation, y);
      const pvBrute = valeurBien - sc.prix;
      const abattIR = Math.min(1, (y - 5) * 0.06);
      const abattPS = Math.min(1, (y - 5) * 0.0165);
      const impotPV = Math.max(0, pvBrute * (1 - abattIR) * 0.19 + pvBrute * (1 - abattPS) * 0.172);
      const fraisV = valeurBien * fraisRevente;
      const netRevente = valeurBien - capRest - impotPV - fraisV;
      flows20.push(cfY + netRevente);
    } else {
      flows20.push(cfY);
    }
  }
  const tri20 = calcTRI(flows20);
  console.log(`  TRI 20 ans calculé: ${tri20.toFixed(2)}%`);

  W('TRI 20 ans ≥ TRI 10 ans (amortissement + appréciation)', tri20 >= tri10 - 0.5);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 4. ABATTEMENTS PV — VÉRIFICATION
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c4️⃣ Abattements plus-value — vérification', 'color:#ef4444;font-size:12px;font-weight:bold');

  const pvTests = [
    { annee: 3, abattIR: 0, abattPS: 0, note: 'Pas d\'abattement avant 5 ans' },
    { annee: 5, abattIR: 0, abattPS: 0, note: 'Année 5 = pas encore d\'abattement' },
    { annee: 6, abattIR: 0.06, abattPS: 0.0165, note: '1ère année d\'abattement' },
    { annee: 10, abattIR: 0.30, abattPS: 0.0825, note: '5 ans d\'abattement' },
    { annee: 22, abattIR: 1.0, abattPS: 0.2805, note: 'Exonération IR' },
    { annee: 30, abattIR: 1.0, abattPS: 0.4125, note: '25 ans d\'abattement PS' },
    { annee: 31, abattIR: 1.0, abattPS: 1.0, note: 'Exonération totale' }
  ];

  pvTests.forEach(t => {
    let abattIR = 0, abattPS = 0;
    if (t.annee > 5) {
      abattIR = Math.min(1, (t.annee - 5) * 0.06);
      abattPS = Math.min(1, (t.annee - 5) * 0.0165);
    }
    if (t.annee > 22) abattIR = 1;
    if (t.annee > 30) abattPS = 1;
    const okIR = Math.abs(abattIR - t.abattIR) < 0.01;
    const okPS = Math.abs(abattPS - t.abattPS) < 0.01;
    P(`An ${t.annee}: abattIR=${(abattIR*100).toFixed(0)}% abattPS=${(abattPS*100).toFixed(1)}% — ${t.note}`, okIR && okPS);
  });

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 5. SENSIBILITÉ TRI — DIFFÉRENTS BIENS
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c5️⃣ Sensibilité TRI — différents profils', 'color:#6366f1;font-size:12px;font-weight:bold');

  const profiles = [
    { nom: 'Pas cher province', prix: 80000, loyer: 450, apport: 15000 },
    { nom: 'T3 moyen', prix: 200000, loyer: 800, apport: 40000 },
    { nom: 'Paris cher', prix: 400000, loyer: 1400, apport: 80000 },
    { nom: 'Très cher', prix: 500000, loyer: 1600, apport: 100000 },
  ];

  const triTable = [];
  for (const p of profiles) {
    const empr = p.prix * 1.12 - p.apport; // approximation avec frais
    const mens = (empr * tauxM) / (1 - Math.pow(1 + tauxM, -nbM));
    const loyerAn = p.loyer * 12;
    const cfAn = loyerAn * 0.95 - (loyerAn * 0.47) - mens * 12; // approximation charges+impôts
    const chargesImpots = loyerAn * 0.95 - cfAn - mens * 12;

    const flows = [-p.apport];
    let cap = empr;
    for (let y = 1; y <= 20; y++) {
      const ly = loyerAn * Math.pow(1.015, y - 1);
      const cy = chargesImpots * Math.pow(1.02, y - 1);
      const my = y <= 20 ? mens * 12 : 0;
      const cf = ly - cy - my;
      if (cap > 0) { const i = cap * 0.035; cap = Math.max(0, cap - (mens * 12 - i)); }
      if (y === 20) {
        const val = p.prix * Math.pow(1.02, 20);
        const pv = val - p.prix;
        const imp = pv * 0.15 * 0.19 + pv * 0.67 * 0.172;
        flows.push(cf + val - cap - imp - val * 0.07);
      } else {
        flows.push(cf);
      }
    }

    const tri = calcTRI(flows);
    triTable.push({
      'Profil': p.nom,
      'Prix': fmt(p.prix) + '€',
      'Loyer': p.loyer + '€/m',
      'Rdt brut': ((p.loyer * 12) / p.prix * 100).toFixed(1) + '%',
      'TRI 20 ans': tri.toFixed(2) + '%',
      'OK': tri > 0 ? '✅' : '⚠️'
    });
  }
  console.table(triTable);
  W('Province TRI > Paris TRI (rendement meilleur)', parseFloat(triTable[0]['TRI 20 ans']) > parseFloat(triTable[2]['TRI 20 ans']));
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 6. EXPORT CSV — VÉRIFICATION
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c6️⃣ Export CSV — vérification', 'color:#00bfff;font-size:12px;font-weight:bold');

  // Les boutons CSV/Copier sont dans le business-plan-slot (rempli après analyse complète)
  const bpSlot = document.getElementById('business-plan-slot');
  const csvLink = bpSlot?.querySelector('a[download]') || document.querySelector('a[download="business-plan-immobilier.csv"]');
  const copyBtn = bpSlot?.querySelector('button[onclick*="clipboard"]') || document.querySelector('button[onclick*="clipboard"]');

  if (csvLink) {
    P('Bouton export CSV présent', true);
    const href = csvLink.getAttribute('href');
    P('CSV contient des données', href?.length > 100);
    const csvContent = decodeURIComponent(href.replace('data:text/csv;charset=utf-8,', ''));
    const lines = csvContent.split('\n');
    P('CSV a un header', lines[0]?.includes('Année'));
    P('CSV a au moins 20 lignes de données', lines.length >= 20);
    console.log(`  CSV: ${lines.length} lignes, ${lines[0]?.split(';').length} colonnes`);
  } else {
    W('Bouton export CSV présent (lancer l\'analyse complète d\'abord)', false);
  }

  if (copyBtn) {
    P('Bouton copier présent', true);
  } else {
    W('Bouton copier présent (lancer l\'analyse complète d\'abord)', false);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // RÉSULTAT
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log(`%c  🏁 RÉSULTAT : ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`, 'color:#22c55e;font-size:14px;font-weight:bold');
  if (failed === 0) console.log('%c  🎉 Tous les tests passent !', 'color:#22c55e;font-size:12px');
  else console.log(`%c  ⛔ ${failed} test(s) en échec`, 'color:#ef4444;font-size:12px');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
})();
