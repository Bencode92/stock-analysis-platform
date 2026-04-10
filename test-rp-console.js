/**
 * test-rp-console.js v2
 * Tests RP vs Locatif — appelle directement les bons moteurs
 *
 * Usage : fetch('test-rp-console.js?v=2').then(r=>r.text()).then(eval)
 */

(async function testRP() {
  const analyzer = window.analyzer;
  const ptAnalyzer = window.priceTargetAnalyzer;
  if (!analyzer || !ptAnalyzer) {
    console.error('❌ Remplis le formulaire une fois et relance.');
    return;
  }

  function setField(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') {
      const opt = Array.from(el.options).find(o => o.value == v);
      if (opt) el.value = opt.value;
    } else el.value = v;
  }

  function inject(sc) {
    setField('propertyPrice', sc.prix);
    setField('propertySurface', sc.surface);
    setField('monthlyRent', sc.loyerHC);
    setField('monthlyCharges', sc.charges || 50);
    setField('apport', sc.apport);
    setField('loanDuration', sc.duree);
    setField('loanRate', sc.taux);
    setField('tmi', sc.tmi);
    setField('taxeFonciere', sc.tf || 800);
    setField('entretien-annuel', sc.entretien || 500);
    setField('assurance-pno', sc.pno || 15);
    setField('charges-copro-non-recup', sc.copro || 50);
    setField('compta-an', sc.compta || 0);
    setField('cfe-an', sc.cfe || 0);
    setField('gestionLocative', sc.gestion || 0);
    setField('taux-opportunite-apport', sc.oppRate || 3);
  }

  // ── Calcul RP via priceTargetAnalyzer ──
  function calcRP(sc) {
    inject(sc);
    const baseInput = analyzer.prepareFiscalData?.({
      ville: sc.ville || {}, prixPaye: sc.prix, surface: sc.surface,
      loyerActuel: sc.loyerHC, loyerHC: sc.loyerHC,
      charges: sc.charges || 50, monthlyCharges: sc.charges || 50,
      loyerCC: sc.loyerHC + (sc.charges || 50),
      apport: sc.apport, duree: sc.duree, taux: sc.taux, tmi: sc.tmi,
      typeAchat: 'classique', occupationMode: 'residence',
      partnerContribution: sc.partner || 0,
      taxeFonciere: sc.tf || 800, entretienAnnuel: sc.entretien || 500,
      assurancePNO: sc.pno || 15, chargesCoproNonRecup: sc.copro || 50,
      fraisNotaireTaux: 8, commissionImmo: 4
    });
    if (!baseInput) return null;

    const loyerMarche = sc.loyerHC + (sc.charges || 50);
    return ptAnalyzer.calculateRPPriceEquilibrium(baseInput, {
      loyerMarche,
      partnerContribution: sc.partner || 0,
      tauxOpportuniteApport: sc.oppRate || 3
    });
  }

  // ── Calcul Locatif via performCompleteAnalysis ──
  async function calcLoc(sc) {
    inject(sc);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
    const pd = {
      ville: sc.ville || {}, prixPaye: sc.prix, surface: sc.surface,
      loyerActuel: sc.loyerHC, loyerHC: sc.loyerHC,
      charges: sc.charges || 50, monthlyCharges: sc.charges || 50,
      loyerCC: sc.loyerHC + (sc.charges || 50),
      apport: sc.apport, duree: sc.duree, taux: sc.taux, tmi: sc.tmi,
      typeAchat: 'classique', occupationMode: 'investment',
      taxeFonciere: sc.tf || 800, entretienAnnuel: sc.entretien || 500,
      assurancePNO: sc.pno || 15, chargesCoproNonRecup: sc.copro || 50,
      fraisNotaireTaux: 8, commissionImmo: 4, gestionLocativeTaux: sc.gestion || 7,
      regimeActuel: 'nu_micro', jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
    };
    const res = await analyzer.performCompleteAnalysis(pd);
    const fiscal = (res?.fiscal || []).sort((a, b) => (b.cashflowMensuel || 0) - (a.cashflowMensuel || 0));
    return fiscal;
  }

  const fmt = v => Math.round(v).toLocaleString('fr-FR');

  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🏠 TESTS RP vs LOCATIF v2 — avec vrais KPIs', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  const base = {
    prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
    duree: 20, taux: 3.5, tmi: 30, tf: 1200, copro: 50,
    entretien: 500, pno: 15
  };

  // ═══════════════════════════════════════════════════
  // TEST 1 : Même bien — RP seul / RP+conjoint / Locatif
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c📊 Test 1 : Même bien 200K€ — RP vs Locatif', 'color:#f59e0b;font-size:12px;font-weight:bold');

  const rpSolo = calcRP({ ...base, partner: 0, oppRate: 3 });
  const rpConj = calcRP({ ...base, partner: 400, oppRate: 3 });
  const locFiscal = await calcLoc({ ...base, gestion: 7, compta: 1200, cfe: 500 });
  const locBest = locFiscal[0] || {};

  console.table([
    {
      'Mode': '🏠 RP seul',
      'Effort/mois': (rpSolo?.rpMonthlyNet || 0) + '€ vs loyer',
      'Capital remb/mois': (rpSolo?.rpMonthlyCapital || 0) + '€',
      'Enrichissement/an': fmt(rpSolo?.rpEnrichmentComplete || 0) + '€',
      'Coût opportunité': fmt(rpSolo?.rpOpportunityCost || 0) + '€/an',
      'Prix équilibre': fmt(rpSolo?.priceTarget || 0) + '€'
    },
    {
      'Mode': '🏠 RP + conjoint 400€',
      'Effort/mois': (rpConj?.rpMonthlyNet || 0) + '€ vs loyer',
      'Capital remb/mois': (rpConj?.rpMonthlyCapital || 0) + '€',
      'Enrichissement/an': fmt(rpConj?.rpEnrichmentComplete || 0) + '€',
      'Coût opportunité': fmt(rpConj?.rpOpportunityCost || 0) + '€/an',
      'Prix équilibre': fmt(rpConj?.priceTarget || 0) + '€'
    },
    {
      'Mode': '🏢 Locatif (meilleur)',
      'Effort/mois': Math.round(locBest.cashflowMensuel || 0) + '€ CF net',
      'Capital remb/mois': '—',
      'Enrichissement/an': fmt(locBest.cashflowNetAnnuel || 0) + '€ CF net',
      'Coût opportunité': '—',
      'Prix équilibre': '—'
    }
  ]);

  // Vérif logique
  const rpE = rpSolo?.rpEnrichmentComplete || 0;
  const rpEC = rpConj?.rpEnrichmentComplete || 0;
  console.log(rpEC > rpE ? '✅ Conjoint améliore l\'enrichissement RP' : '⚠️ Conjoint n\'améliore pas (vérifier)');
  console.log(rpSolo?.priceTarget > 0 ? '✅ Prix d\'équilibre calculé : ' + fmt(rpSolo.priceTarget) + '€' : '⚠️ Prix équilibre = 0');
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // TEST 2 : Impact contribution conjoint
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c📊 Test 2 : Impact contribution conjoint (0 → 800€/mois)', 'color:#a78bfa;font-size:12px;font-weight:bold');

  const partRows = [];
  for (const partner of [0, 200, 400, 600, 800]) {
    const rp = calcRP({ ...base, partner, oppRate: 3 });
    partRows.push({
      'Conjoint': partner + '€/mois',
      'Effort net/mois': (rp?.rpMonthlyNet || 0) + '€',
      'Enrichissement/an': fmt(rp?.rpEnrichmentComplete || 0) + '€',
      'Prix équilibre': fmt(rp?.priceTarget || 0) + '€',
      'Verdict': (rp?.rpEnrichmentComplete || 0) >= 0 ? '✅ Acheter' : '❌ Louer'
    });
  }
  console.table(partRows);

  // Vérif : l'enrichissement doit augmenter avec le conjoint
  const e0 = calcRP({ ...base, partner: 0, oppRate: 3 })?.rpEnrichmentComplete || 0;
  const e800 = calcRP({ ...base, partner: 800, oppRate: 3 })?.rpEnrichmentComplete || 0;
  console.log(e800 >= e0 ? '✅ Enrichissement croît avec conjoint' : '❌ ERREUR : enrichissement décroît');
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // TEST 3 : Impact taux d'opportunité
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c📊 Test 3 : Taux opportunité apport (1% → 8%)', 'color:#22c55e;font-size:12px;font-weight:bold');

  const oppRows = [];
  for (const opp of [1, 2, 3, 5, 7, 8]) {
    const rp = calcRP({ ...base, partner: 300, oppRate: opp });
    oppRows.push({
      'Placement': opp + '%/an',
      'Coût opportunité': fmt(rp?.rpOpportunityCost || 0) + '€/an',
      'Enrichissement/an': fmt(rp?.rpEnrichmentComplete || 0) + '€',
      'Verdict': (rp?.rpEnrichmentComplete || 0) >= 0 ? '✅ Acheter' : '❌ Louer'
    });
  }
  console.table(oppRows);

  // Vérif : l'enrichissement doit baisser avec le taux
  const opp1 = calcRP({ ...base, partner: 300, oppRate: 1 })?.rpEnrichmentComplete || 0;
  const opp8 = calcRP({ ...base, partner: 300, oppRate: 8 })?.rpEnrichmentComplete || 0;
  console.log(opp1 > opp8 ? '✅ Enrichissement baisse quand placement augmente' : '❌ ERREUR logique');
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // TEST 4 : 5 profils de biens — RP vs Locatif
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c📊 Test 4 : 5 profils de biens — RP vs Locatif', 'color:#ef4444;font-size:12px;font-weight:bold');

  const biens = [
    { nom: 'Studio 25m²', prix: 80000, surface: 25, loyerHC: 450, apport: 15000, taux: 3.2, tf: 400 },
    { nom: 'T2 50m²', prix: 150000, surface: 50, loyerHC: 650, apport: 30000, taux: 3.5, tf: 800 },
    { nom: 'T3 70m²', prix: 250000, surface: 70, loyerHC: 950, apport: 50000, taux: 3.5, tf: 1200 },
    { nom: 'T4 90m²', prix: 350000, surface: 90, loyerHC: 1200, apport: 70000, taux: 3.5, tf: 1800 },
    { nom: 'Maison 120m²', prix: 500000, surface: 120, loyerHC: 1600, apport: 100000, taux: 3.5, tf: 2500 },
  ];

  const bienRows = [];
  for (const b of biens) {
    const rp = calcRP({ ...b, tmi: 30, partner: 300, oppRate: 3, copro: 50, entretien: 500, pno: 15 });
    const locF = await calcLoc({ ...b, tmi: 30, gestion: 7, compta: 1200, cfe: 500, copro: 50, entretien: 500, pno: 15 });
    const locB = locF[0] || {};

    const rpEnrich = rp?.rpEnrichmentComplete || 0;
    const locCFAn = locB.cashflowNetAnnuel || 0;

    bienRows.push({
      'Bien': b.nom,
      'Prix': fmt(b.prix) + '€',
      'RP enrichir/an': fmt(rpEnrich) + '€',
      'RP effort/mois': (rp?.rpMonthlyNet || 0) + '€',
      'Loc CF/mois': Math.round(locB.cashflowMensuel || 0) + '€',
      'Loc régime': (locB.nom || locB.id || '?').substring(0, 14),
      'Gagnant': rpEnrich > locCFAn ? '🏠 RP' : '🏢 Locatif'
    });
  }
  console.table(bienRows);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // TEST 5 : Sensibilité TMI — RP stable vs Locatif
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c📊 Test 5 : Sensibilité TMI — RP vs Locatif', 'color:#6366f1;font-size:12px;font-weight:bold');

  const tmiRows = [];
  for (const tmi of [11, 30, 41, 45]) {
    const rp = calcRP({ ...base, tmi, partner: 300, oppRate: 3 });
    const locF = await calcLoc({ ...base, tmi, gestion: 7, compta: 1200, cfe: 500 });
    const locB = locF[0] || {};

    tmiRows.push({
      'TMI': tmi + '%',
      'RP enrichir/an': fmt(rp?.rpEnrichmentComplete || 0) + '€',
      'RP effort/mois': (rp?.rpMonthlyNet || 0) + '€',
      'Loc CF/mois': Math.round(locB.cashflowMensuel || 0) + '€',
      'Loc #1': (locB.nom || locB.id || '?').substring(0, 16),
      'Gagnant': (rp?.rpEnrichmentComplete || 0) > (locB.cashflowNetAnnuel || 0) ? '🏠 RP' : '🏢 Loc'
    });
  }
  console.table(tmiRows);

  // Vérif : RP ne doit pas changer avec TMI
  const rp11 = calcRP({ ...base, tmi: 11, partner: 300, oppRate: 3 })?.rpEnrichmentComplete || 0;
  const rp45 = calcRP({ ...base, tmi: 45, partner: 300, oppRate: 3 })?.rpEnrichmentComplete || 0;
  console.log(rp11 === rp45 ? '✅ RP stable quel que soit le TMI (pas d\'impôt)' : '⚠️ RP varie avec TMI : ' + rp11 + ' vs ' + rp45);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // SYNTHÈSE
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  ✅ TOUS LES TESTS TERMINÉS', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  // Restaurer
  setField('occupationMode', 'investment');
  setField('compta-an', 0);
  setField('cfe-an', 0);
})();
