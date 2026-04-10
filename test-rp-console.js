/**
 * test-rp-console.js
 * Tests Résidence Principale vs Locatif
 *
 * Usage : fetch('test-rp-console.js?v=1').then(r=>r.text()).then(eval)
 */

(async function testRP() {
  const analyzer = window.analyzer;
  if (!analyzer?.performCompleteAnalysis) {
    console.error('❌ Analyzer non dispo. Remplis le formulaire une fois puis relance.');
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

  function buildPD(sc) {
    return {
      ville: sc.ville || {},
      prixPaye: sc.prix, surface: sc.surface,
      loyerActuel: sc.loyerHC, loyerHC: sc.loyerHC,
      charges: sc.charges || 50, monthlyCharges: sc.charges || 50,
      loyerCC: sc.loyerHC + (sc.charges || 50),
      apport: sc.apport, duree: sc.duree, taux: sc.taux, tmi: sc.tmi,
      typeAchat: 'classique', occupationMode: sc.mode,
      partnerContribution: sc.partner || 0,
      fraisBancairesDossier: 900, fraisBancairesCompte: 150, fraisGarantie: 1.3709,
      taxeFonciere: sc.tf || 800, vacanceLocative: 0,
      gestionLocativeTaux: sc.gestion || 0,
      travaux: 0, entretienAnnuel: sc.entretien || 500,
      chargesCoproNonRecup: sc.copro || 50, assurancePNO: sc.pno || 15,
      fraisNotaireTaux: 8, commissionImmo: 4,
      regimeActuel: 'nu_micro', forceRegime: false,
      jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
    };
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
    setField('occupationMode', sc.mode);
    setField('partnerContribution', sc.partner || 0);
    setField('taxeFonciere', sc.tf || 800);
    setField('entretien-annuel', sc.entretien || 500);
    setField('assurance-pno', sc.pno || 15);
    setField('charges-copro-non-recup', sc.copro || 50);
    setField('compta-an', sc.compta || 0);
    setField('cfe-an', sc.cfe || 0);
    setField('gestionLocative', sc.gestion || 0);
    setField('taux-opportunite-apport', sc.oppRate || 3);
  }

  async function run(sc) {
    inject(sc);
    if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
    try {
      const pd = buildPD(sc);
      const res = await analyzer.performCompleteAnalysis(pd);
      return res;
    } catch(e) {
      console.warn('Erreur:', e.message);
      return null;
    }
  }

  const fmt = v => Math.round(v).toLocaleString('fr-FR');

  // ═══════════════════════════════════════════════════════════
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🏠 TESTS RÉSIDENCE PRINCIPALE vs LOCATIF', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');

  // ── SCÉNARIO 1 : Même bien en RP vs Locatif ──
  console.log('');
  console.group('%c📊 Test 1 : Même bien — RP vs Locatif (200K€, 60m², Lyon)', 'color:#f59e0b;font-size:12px;font-weight:bold');

  const baseBien = {
    prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
    duree: 20, taux: 3.5, tmi: 30, tf: 1200, copro: 50,
    entretien: 500, pno: 15, compta: 0, cfe: 0
  };

  // RP sans conjoint
  const rpSolo = await run({ ...baseBien, mode: 'residence', partner: 0, oppRate: 3 });
  // RP avec conjoint 400€
  const rpConj = await run({ ...baseBien, mode: 'residence', partner: 400, oppRate: 3 });
  // Locatif
  const loc = await run({ ...baseBien, mode: 'investment', gestion: 7 });

  const rpS = rpSolo?.fiscal?.[0] || {};
  const rpC = rpConj?.fiscal?.[0] || {};
  const locBest = (loc?.fiscal || []).sort((a,b) => (b.cashflowMensuel||0) - (a.cashflowMensuel||0))[0] || {};

  console.table([
    {
      'Mode': 'RP seul',
      'CF/mois': Math.round(rpS.cashflowMensuel || rpSolo?.fiscal?.[0]?.rpMonthlyNet || 0) + '€',
      'Enrichissement/an': fmt(rpSolo?.fiscal?.[0]?.rpEnrichmentComplete || 0) + '€',
      'Régime': 'RP'
    },
    {
      'Mode': 'RP + conjoint 400€',
      'CF/mois': Math.round(rpC.cashflowMensuel || rpConj?.fiscal?.[0]?.rpMonthlyNet || 0) + '€',
      'Enrichissement/an': fmt(rpConj?.fiscal?.[0]?.rpEnrichmentComplete || 0) + '€',
      'Régime': 'RP'
    },
    {
      'Mode': 'Locatif (meilleur)',
      'CF/mois': Math.round(locBest.cashflowMensuel || 0) + '€',
      'Enrichissement/an': fmt((locBest.cashflowNetAnnuel || 0)) + '€',
      'Régime': (locBest.nom || locBest.id || '?').substring(0, 20)
    }
  ]);
  console.groupEnd();

  // ── SCÉNARIO 2 : Impact contribution conjoint ──
  console.log('');
  console.group('%c📊 Test 2 : Impact contribution conjoint (0 → 800€/mois)', 'color:#a78bfa;font-size:12px;font-weight:bold');

  const partnerRows = [];
  for (const partner of [0, 200, 400, 600, 800]) {
    const res = await run({ ...baseBien, mode: 'residence', partner, oppRate: 3 });
    // Extraire les KPIs RP depuis le résultat
    const f = res?.fiscal?.[0] || {};
    partnerRows.push({
      'Conjoint': partner + '€/mois',
      'Enrichissement/an': fmt(f.rpEnrichmentComplete || 0) + '€',
      'Prix équilibre': fmt(f.priceTarget || 0) + '€',
      'Verdict': (f.rpEnrichmentComplete || 0) >= 0 ? '✅ Acheter' : '❌ Louer'
    });
  }
  console.table(partnerRows);
  console.groupEnd();

  // ── SCÉNARIO 3 : Impact taux d'opportunité ──
  console.log('');
  console.group('%c📊 Test 3 : Impact taux d\'opportunité apport (1% → 8%)', 'color:#22c55e;font-size:12px;font-weight:bold');

  const oppRows = [];
  for (const opp of [1, 2, 3, 5, 7, 8]) {
    setField('taux-opportunite-apport', opp);
    const res = await run({ ...baseBien, mode: 'residence', partner: 300, oppRate: opp });
    const f = res?.fiscal?.[0] || {};
    oppRows.push({
      'Placement apport': opp + '%/an',
      'Coût opportunité': fmt((f.rpOpportunityCost || 0)) + '€/an',
      'Enrichissement/an': fmt(f.rpEnrichmentComplete || 0) + '€',
      'Verdict': (f.rpEnrichmentComplete || 0) >= 0 ? '✅ Acheter' : '❌ Louer'
    });
  }
  console.table(oppRows);
  console.log('%cPlus le taux de placement est élevé, plus la location + placement bat l\'achat.', 'color:#94a3b8;font-style:italic');
  console.groupEnd();

  // ── SCÉNARIO 4 : Différents profils de bien ──
  console.log('');
  console.group('%c📊 Test 4 : Différents profils de biens (RP avec conjoint 300€)', 'color:#ef4444;font-size:12px;font-weight:bold');

  const biens = [
    { nom: 'Studio 25m² pas cher', prix: 80000, surface: 25, loyerHC: 450, apport: 15000, taux: 3.2, tf: 400 },
    { nom: 'T2 50m² moyen', prix: 150000, surface: 50, loyerHC: 650, apport: 30000, taux: 3.5, tf: 800 },
    { nom: 'T3 70m² classique', prix: 250000, surface: 70, loyerHC: 950, apport: 50000, taux: 3.5, tf: 1200 },
    { nom: 'T4 90m² familial', prix: 350000, surface: 90, loyerHC: 1200, apport: 70000, taux: 3.5, tf: 1800 },
    { nom: 'Maison 120m² premium', prix: 500000, surface: 120, loyerHC: 1600, apport: 100000, taux: 3.5, tf: 2500 },
  ];

  const bienRows = [];
  for (const b of biens) {
    // RP
    const rpRes = await run({
      ...b, mode: 'residence', partner: 300, duree: 20, tmi: 30,
      copro: 50, entretien: 500, pno: 15, oppRate: 3
    });
    const rpF = rpRes?.fiscal?.[0] || {};

    // Locatif (même bien)
    const locRes = await run({
      ...b, mode: 'investment', partner: 0, duree: 20, tmi: 30,
      copro: 50, entretien: 500, pno: 15, gestion: 7, compta: 1200, cfe: 500
    });
    const locFiscal = (locRes?.fiscal || []).sort((a,c) => (c.cashflowMensuel||0) - (a.cashflowMensuel||0));
    const locBest = locFiscal[0] || {};

    bienRows.push({
      'Bien': b.nom,
      'Prix': fmt(b.prix) + '€',
      'RP enrichir/an': fmt(rpF.rpEnrichmentComplete || 0) + '€',
      'RP verdict': (rpF.rpEnrichmentComplete || 0) >= 0 ? '✅' : '❌',
      'Loc CF/mois': Math.round(locBest.cashflowMensuel || 0) + '€',
      'Loc #1': (locBest.nom || locBest.id || '?').substring(0, 15),
      'Meilleur': (rpF.rpEnrichmentComplete || 0) > (locBest.cashflowNetAnnuel || 0) ? '🏠 RP' : '🏢 Locatif'
    });
  }
  console.table(bienRows);
  console.groupEnd();

  // ── SCÉNARIO 5 : Sensibilité TMI pour le locatif ──
  console.log('');
  console.group('%c📊 Test 5 : RP stable vs Locatif sensible au TMI', 'color:#6366f1;font-size:12px;font-weight:bold');

  const tmiRows = [];
  for (const tmi of [11, 30, 41, 45]) {
    // RP (pas impacté par TMI)
    const rpR = await run({ ...baseBien, mode: 'residence', partner: 300, tmi, oppRate: 3 });
    const rpF = rpR?.fiscal?.[0] || {};

    // Locatif (impacté par TMI)
    const locR = await run({ ...baseBien, mode: 'investment', gestion: 7, compta: 1200, cfe: 500, tmi });
    const locF = (locR?.fiscal || []).sort((a,c) => (c.cashflowMensuel||0) - (a.cashflowMensuel||0));
    const locB = locF[0] || {};

    tmiRows.push({
      'TMI': tmi + '%',
      'RP enrichir/an': fmt(rpF.rpEnrichmentComplete || 0) + '€',
      'Loc CF/mois': Math.round(locB.cashflowMensuel || 0) + '€',
      'Loc #1': (locB.nom || locB.id || '?').substring(0, 16),
      'Meilleur': (rpF.rpEnrichmentComplete || 0) > (locB.cashflowNetAnnuel || 0) ? '🏠 RP' : '🏢 Loc'
    });
  }
  console.table(tmiRows);
  console.log('%cLa RP n\'est pas impactée par le TMI (pas d\'impôt). Le locatif se dégrade avec le TMI (sauf LMNP réel).', 'color:#94a3b8;font-style:italic');
  console.groupEnd();

  // ── SYNTHÈSE ──
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  ✅ TOUS LES TESTS RP vs LOCATIF TERMINÉS', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('');
  console.log('%cRappel des règles :', 'color:#00bfff;font-weight:bold');
  console.log('  • RP : pas d\'impôt sur le logement, pas de PV à la revente (après 30 ans)');
  console.log('  • RP : le coût d\'opportunité de l\'apport est le facteur clé');
  console.log('  • Locatif : impacté par TMI, régime fiscal, compta/CFE');
  console.log('  • Conjoint : réduit le coût net en RP comme en location');
  console.log('  • Plus l\'apport est gros + placement élevé → plus la location gagne');

  // Restaurer
  setField('occupationMode', 'investment');
  setField('taux-opportunite-apport', 3);
  setField('compta-an', 0);
  setField('cfe-an', 0);
})();
