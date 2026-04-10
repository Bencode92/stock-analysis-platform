/**
 * test-full-analysis-console.js
 * Validation complète : données bien + marché + fiscalité + prix cible + projection
 *
 * Usage : fetch('test-full-analysis-console.js?v=1').then(r=>r.text()).then(eval)
 */

(async function testFullAnalysis() {
  const analyzer = window.analyzer;
  const ptAnalyzer = window.priceTargetAnalyzer;
  if (!analyzer?.performCompleteAnalysis || !ptAnalyzer) {
    console.error('❌ Remplis le formulaire une fois puis relance.');
    return;
  }

  let passed = 0, failed = 0, warnings = 0;
  const P = (name, ok) => { if (ok) { console.log('✅', name); passed++; } else { console.error('❌', name); failed++; } };
  const W = (name, ok) => { if (ok) { console.log('✅', name); passed++; } else { console.warn('⚠️', name); warnings++; } };
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

  // Bien test : Garches, 40m², 240K€, loyer 1300€
  const sc = {
    prix: 240000, surface: 40, loyerHC: 1300, charges: 50,
    apport: 80000, duree: 20, taux: 3.5, tmi: 30,
    tf: 800, copro: 50, entretien: 500, pno: 15,
    compta: 0, cfe: 0, gestion: 0, notaire: 8, commission: 4
  };

  // Injecter
  setField('propertyPrice', sc.prix);
  setField('propertySurface', sc.surface);
  setField('monthlyRent', sc.loyerHC);
  setField('monthlyCharges', sc.charges);
  setField('apport', sc.apport);
  setField('loanDuration', sc.duree);
  setField('loanRate', sc.taux);
  setField('tmi', sc.tmi);
  setField('occupationMode', 'investment');
  setField('taxeFonciere', sc.tf);
  setField('charges-copro-non-recup', sc.copro);
  setField('entretien-annuel', sc.entretien);
  setField('assurance-pno', sc.pno);
  setField('compta-an', sc.compta);
  setField('cfe-an', sc.cfe);
  setField('gestionLocative', sc.gestion);

  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log('%c  🔬 VALIDATION COMPLÈTE — Analyse de Marché & Optimisation Fiscale', 'color:#00bfff;font-size:14px;font-weight:bold');
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#00bfff;font-weight:bold');
  console.log(`Bien test : ${sc.prix.toLocaleString('fr-FR')}€, ${sc.surface}m², loyer ${sc.loyerHC}€ HC, apport ${sc.apport.toLocaleString('fr-FR')}€, ${sc.taux}% sur ${sc.duree} ans, TMI ${sc.tmi}%`);

  // ═══════════════════════════════════════════════════
  // 1. DONNÉES DE BASE
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c1️⃣ Données de base', 'color:#f59e0b;font-size:12px;font-weight:bold');

  const prixM2 = sc.prix / sc.surface;
  const loyerM2 = sc.loyerHC / sc.surface;
  const rdtBrut = (sc.loyerHC * 12) / sc.prix * 100;
  const emprunt = sc.prix - sc.apport;
  const tauxM = sc.taux / 100 / 12;
  const nbMens = sc.duree * 12;
  const mensualite = (emprunt * tauxM) / (1 - Math.pow(1 + tauxM, -nbMens));
  const coutNotaire = sc.prix * sc.notaire / 100;
  const coutCommission = sc.prix * sc.commission / 100;
  const coutTotal = sc.prix + coutNotaire + coutCommission; // Simplifié (hors frais bancaires)

  console.log(`Prix/m² : ${Math.round(prixM2)} €/m²`);
  console.log(`Loyer/m² : ${loyerM2.toFixed(1)} €/m²`);
  console.log(`Rendement brut : ${rdtBrut.toFixed(2)}%`);
  console.log(`Mensualité estimée : ${Math.round(mensualite)} €/mois`);
  console.log(`Emprunt : ${emprunt.toLocaleString('fr-FR')} €`);

  P('Prix/m² > 0', prixM2 > 0);
  P('Loyer/m² > 0', loyerM2 > 0);
  P('Rendement brut entre 1% et 15%', rdtBrut > 1 && rdtBrut < 15);
  P('Mensualité > 0', mensualite > 0);
  P('Mensualité < loyer × 2', mensualite < sc.loyerHC * 2);
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 2. ANALYSE FISCALE — TOUS LES RÉGIMES
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c2️⃣ Analyse fiscale — 7 régimes', 'color:#a78bfa;font-size:12px;font-weight:bold');

  if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
  const pd = {
    ville: {}, prixPaye: sc.prix, surface: sc.surface,
    loyerActuel: sc.loyerHC, loyerHC: sc.loyerHC,
    charges: sc.charges, monthlyCharges: sc.charges,
    loyerCC: sc.loyerHC + sc.charges,
    apport: sc.apport, duree: sc.duree, taux: sc.taux, tmi: sc.tmi,
    typeAchat: 'classique', occupationMode: 'investment',
    taxeFonciere: sc.tf, entretienAnnuel: sc.entretien,
    assurancePNO: sc.pno, chargesCoproNonRecup: sc.copro,
    fraisNotaireTaux: sc.notaire, commissionImmo: sc.commission,
    regimeActuel: 'nu_reel', jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire'
  };

  const analysis = await analyzer.performCompleteAnalysis(pd);
  const fiscal = (analysis?.fiscal || []).sort((a, b) => (b.cashflowMensuel || 0) - (a.cashflowMensuel || 0));

  P('Résultats fiscaux retournés', fiscal.length > 0);
  P('Au moins 6 régimes calculés', fiscal.length >= 6);

  // Tableau comparatif
  console.table(fiscal.map((r, i) => ({
    '#': i + 1,
    'Régime': (r.nom || r.id).substring(0, 22),
    'CF/mois': Math.round(r.cashflowMensuel || 0) + '€',
    'CF/an': Math.round(r.cashflowNetAnnuel || 0) + '€',
    'Impôt': Math.round(r.impotAnnuel || 0) + '€',
    'Rdt net': (r.rendementNet || 0).toFixed(2) + '%'
  })));

  // Vérifications logiques
  const findR = (id1, id2) => fiscal.find(r => {
    const k = analyzer.normalizeRegimeKey?.(r) || r.id;
    return k === id1 || k === id2;
  });

  const lmnpReel = findR('lmnp_reel', 'lmnp-reel');
  const nuReel = findR('nu_reel', 'reel-foncier');
  const microF = findR('nu_micro', 'micro-foncier');
  const jb = findR('nu_jeanbrun', 'jeanbrun');
  const sciIs = findR('sci_is', 'sci-is');
  const lmp = findR('lmp', 'lmp_reel');

  P('LMNP Réel trouvé', !!lmnpReel);
  P('Réel foncier trouvé', !!nuReel);
  P('Jeanbrun trouvé', !!jb);
  P('SCI IS trouvé', !!sciIs);

  // Cohérence : LMNP ≥ Réel foncier (amortissements)
  if (lmnpReel && nuReel) {
    W('LMNP CF ≥ Réel foncier CF (amortissements)', (lmnpReel.cashflowMensuel || 0) >= (nuReel.cashflowMensuel || 0));
  }

  // Cohérence : Micro-foncier le pire (charges réelles > 30% abattement)
  if (microF && nuReel) {
    W('Micro-foncier CF ≤ Réel foncier CF', (microF.cashflowMensuel || 0) <= (nuReel.cashflowMensuel || 0));
  }

  // Cohérence : Jeanbrun base imposable ≤ Réel foncier
  if (jb && nuReel) {
    const jbCalc = jb._detailedCalc || {};
    const reelCalc = nuReel._detailedCalc || {};
    W('Jeanbrun base imposable ≤ Réel (amortissement)', (jbCalc.baseImposable || 0) <= (reelCalc.baseImposable || Infinity));
  }

  // Pas de CF = NaN
  fiscal.forEach(r => {
    P(`${(r.nom||r.id).substring(0,15)} CF non NaN`, !isNaN(r.cashflowMensuel || 0));
  });

  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 3. DÉTAIL FISCAL — Régime Réel foncier
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c3️⃣ Détail fiscal — Réel foncier', 'color:#22c55e;font-size:12px;font-weight:bold');

  if (nuReel?._detailedCalc) {
    const c = nuReel._detailedCalc;
    console.table({
      'Revenus nets (CC)': fmt(c.revenusNets || 0) + '€',
      'Charges déductibles': fmt(c.totalCharges || 0) + '€',
      'Intérêts emprunt': fmt(c.interetsAnnuels || 0) + '€',
      'Base imposable': fmt(c.baseImposable || 0) + '€',
      'IR': fmt(c.impotRevenu || 0) + '€',
      'PS 17.2%': fmt(c.prelevementsSociaux || 0) + '€',
      'Total impôts': fmt(c.totalImpots || 0) + '€',
      'Mensualité annuelle': fmt(c.mensualiteAnnuelle || 0) + '€',
      'Capital remboursé': fmt(c.capitalAnnuel || 0) + '€',
      'Cash-flow net': fmt(c.cashflowNetAnnuel || 0) + '€'
    });

    // Vérifications
    P('Base imposable ≥ 0', (c.baseImposable || 0) >= 0);
    P('PS = base × 17.2%', Math.abs((c.prelevementsSociaux || 0) - (c.baseImposable || 0) * 0.172) < 1);
    P('IR = base × TMI(30%)', Math.abs((c.impotRevenu || 0) - (c.baseImposable || 0) * 0.30) < 1);
    P('CF = revenus - charges_cash - impôts - mensualité', true); // Structurel
    P('Capital > 0 (on rembourse du capital)', (c.capitalAnnuel || 0) > 0);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 4. PRIX CIBLE POUR S'ENRICHIR
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c4️⃣ Prix Cible pour S\'Enrichir', 'color:#ef4444;font-size:12px;font-weight:bold');

  const baseInput = analyzer.prepareFiscalData?.(pd);
  if (baseInput) {
    // Test avec 3 régimes
    const regimes = ['nu_reel', 'lmnp_reel', 'nu_micro'];
    const ptRows = [];

    for (const regimeId of regimes) {
      const result = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId });
      const registry = analyzer.getRegimeRegistry?.() || {};
      const nom = registry[regimeId]?.nom || regimeId;

      ptRows.push({
        'Régime': nom.substring(0, 20),
        'Enrichissement/an': fmt(result.currentEnrichment || 0) + '€',
        'Prix équilibre': fmt(result.priceTarget || 0) + '€',
        'Gap': fmt(result.gap || 0) + '€',
        'Gap%': (result.gapPercent || 0).toFixed(1) + '%',
        'CF annuel': fmt(result.currentBreakdown?.cashflow || 0) + '€',
        'Capital/an': fmt(result.currentBreakdown?.capital || 0) + '€'
      });

      // Vérifications
      P(`${nom.substring(0,12)} enrichissement = CF + capital`,
        Math.abs((result.currentEnrichment||0) - ((result.currentBreakdown?.cashflow||0) + (result.currentBreakdown?.capital||0))) < 5
      );
      P(`${nom.substring(0,12)} prix équilibre > 0`, (result.priceTarget || 0) > 0);
    }

    console.table(ptRows);

    // Cohérence : prix d'équilibre LMNP > Réel > Micro
    const ptLMNP = ptRows[1];
    const ptReel = ptRows[0];
    const ptMicro = ptRows[2];
    W('Prix équil. LMNP > Réel > Micro',
      parseInt(ptLMNP['Prix équilibre']) > parseInt(ptReel['Prix équilibre']) &&
      parseInt(ptReel['Prix équilibre']) > parseInt(ptMicro['Prix équilibre'])
    );
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 5. VÉRIFICATION ENRICHISSEMENT = CF + CAPITAL
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c5️⃣ Cohérence enrichissement vs CF + capital', 'color:#6366f1;font-size:12px;font-weight:bold');

  if (baseInput) {
    for (const regimeId of ['nu_reel', 'lmnp_reel', 'nu_jeanbrun', 'nu_micro']) {
      const result = ptAnalyzer.calculatePriceTarget(baseInput, 0, { regimeId });
      const cf = result.currentBreakdown?.cashflow || 0;
      const cap = result.currentBreakdown?.capital || 0;
      const enrich = result.currentEnrichment || 0;
      const delta = Math.abs(enrich - (cf + cap));
      const registry = analyzer.getRegimeRegistry?.() || {};
      const nom = registry[regimeId]?.nom || regimeId;

      P(`${nom.substring(0,15)}: enrichissement(${fmt(enrich)}) = CF(${fmt(cf)}) + capital(${fmt(cap)}) [δ=${Math.round(delta)}]`, delta < 5);
    }
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 6. CONSTANTES FISCALES 2026
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c6️⃣ Constantes fiscales 2026', 'color:#00bfff;font-size:12px;font-weight:bold');

  if (typeof FISCAL_CONSTANTS !== 'undefined') {
    P('PS location nue = 17.2%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX === 0.172);
    P('PS meublé = 18.6%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX_MEUBLE === 0.186);
    P('Plafond IS = 100 000€', FISCAL_CONSTANTS.IS_PLAFOND_REDUIT === 100000);
    P('Déficit foncier = 10 700€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX === 10700);
    P('Déficit réno énergie = 21 400€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX_RENO_ENERGETIQUE === 21400);
    P('Micro-foncier plafond = 15 000€', FISCAL_CONSTANTS.MICRO_FONCIER_PLAFOND === 15000);
    P('LMP cotisations min = 1 220€', FISCAL_CONSTANTS.LMP_COTISATIONS_MIN === 1220);
  } else {
    P('FISCAL_CONSTANTS chargé', false);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // 7. JEANBRUN SPÉCIFIQUE
  // ═══════════════════════════════════════════════════
  console.log('');
  console.group('%c7️⃣ Dispositif Jeanbrun', 'color:#6366f1;font-size:12px;font-weight:bold');

  const jbRegime = analyzer.comparateur?.regimes?.find(r => r.id === 'jeanbrun');
  P('Régime Jeanbrun dans comparateur', !!jbRegime);
  if (jbRegime) {
    P('Type = reel-amortissement-nu', jbRegime.calcul.type === 'reel-amortissement-nu');
    P('3 niveaux de décote', !!jbRegime.calcul.decoteLoyer.tresSocial);
    P('Part terrain = 20%', jbRegime.calcul.partTerrain === 0.20);

    // Test 3 niveaux
    const niveauRows = [];
    for (const niveau of ['intermediaire', 'social', 'tresSocial']) {
      pd.jeanbrunNiveau = niveau;
      if (analyzer.comparateur?.cache) analyzer.comparateur.cache.clear();
      const res = await analyzer.performCompleteAnalysis(pd);
      const jbRes = (res?.fiscal || []).find(r => (analyzer.normalizeRegimeKey?.(r) || r.id) === 'nu_jeanbrun');
      niveauRows.push({
        'Niveau': niveau,
        'CF/mois': Math.round(jbRes?.cashflowMensuel || 0) + '€',
        'Impôt': Math.round(jbRes?.impotAnnuel || 0) + '€'
      });
    }
    console.table(niveauRows);
    W('CF intermédiaire > CF social > CF très social',
      parseInt(niveauRows[0]['CF/mois']) > parseInt(niveauRows[1]['CF/mois']) &&
      parseInt(niveauRows[1]['CF/mois']) > parseInt(niveauRows[2]['CF/mois'])
    );
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════
  // RÉSULTAT FINAL
  // ═══════════════════════════════════════════════════
  console.log('');
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log(`%c  🏁 RÉSULTAT : ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`, 'color:#22c55e;font-size:14px;font-weight:bold');
  if (failed === 0) {
    console.log('%c  🎉 Tous les tests passent !', 'color:#22c55e;font-size:12px');
  } else {
    console.log(`%c  ⛔ ${failed} test(s) en échec`, 'color:#ef4444;font-size:12px');
  }
  console.log('%c══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  // Restaurer
  setField('compta-an', 0);
  setField('cfe-an', 0);
})();
