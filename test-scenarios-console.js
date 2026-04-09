/**
 * test-scenarios-console.js v3
 *
 * Injecte les données dans le formulaire DOM puis appelle performCompleteAnalysis
 * pour que compta, CFE et part mobilier soient pris en compte.
 *
 * Usage : fetch('test-scenarios-console.js?v=3').then(r=>r.text()).then(eval)
 */

(async function runScenarios() {
  const analyzer = window.analyzer;
  if (!analyzer?.performCompleteAnalysis) {
    console.error('❌ Analyzer non disponible. Charge la page comparaison-fiscale.html et remplis le formulaire une fois.');
    return;
  }

  // ── Helpers ──────────────────────────────────────────────
  function setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else if (el.tagName === 'SELECT') {
      // Pour les <select>, chercher l'option correspondante
      const opt = Array.from(el.options).find(o => o.value == value);
      if (opt) el.value = opt.value;
    }
    else el.value = value;
  }

  function injectScenario(sc) {
    // Formulaire principal
    setField('propertyPrice', sc.prix);
    setField('propertySurface', sc.surface);
    setField('monthlyRent', sc.loyerHC);
    setField('monthlyCharges', sc.chargesRecup || 50);
    setField('apport', sc.apport);
    setField('loanDuration', sc.duree);
    setField('loanRate', sc.taux);
    setField('tmi', sc.tmi);
    setField('occupationMode', 'investment');

    // Params avancés
    setField('compta-an', sc.comptaAn || 0);
    setField('cfe-an', sc.cfeAn || 0);
    setField('part-mobilier', sc.partMobilier || 10);
    setField('taxeFonciere', sc.taxeFonciere || 800);
    setField('vacanceLocative', sc.vacance || 0);
    setField('gestionLocative', sc.gestion || 0);
    setField('travaux-renovation', sc.travaux || 0);
    setField('entretien-annuel', sc.entretien || 500);
    setField('assurance-pno', sc.pno || 15);
    setField('charges-copro-non-recup', sc.copro || 50);
    setField('frais-notaire-taux', sc.notaire || 8);
    setField('commission-immo', sc.commission || 4);
  }

  // Construire le propertyData complet comme le fait le formulaire
  function buildPropertyData(sc) {
    const loyerCC = sc.loyerHC + (sc.chargesRecup || 50);
    return {
      ville: sc.ville || {},
      prixPaye: sc.prix,
      surface: sc.surface,
      loyerActuel: sc.loyerHC,
      loyerHC: sc.loyerHC,
      charges: sc.chargesRecup || 50,
      monthlyCharges: sc.chargesRecup || 50,
      loyerCC: loyerCC,
      apport: sc.apport,
      duree: sc.duree,
      taux: sc.taux,
      tmi: sc.tmi,
      typeAchat: sc.typeAchat || 'classique',
      occupationMode: 'investment',
      partnerContribution: 0,
      fraisBancairesDossier: 900,
      fraisBancairesCompte: 150,
      fraisGarantie: 1.3709,
      taxeFonciere: sc.taxeFonciere || 800,
      vacanceLocative: sc.vacance || 0,
      gestionLocativeTaux: sc.gestion || 0,
      gestionLocative: (sc.gestion || 0) > 0,
      travaux: sc.travaux || 0,
      travauxRenovation: sc.travaux || 0,
      entretienAnnuel: sc.entretien || 500,
      chargesCoproNonRecup: sc.copro || 50,
      assurancePNO: sc.pno || 15,
      fraisNotaireTaux: sc.notaire || 8,
      commissionImmo: sc.commission || 4,
      regimeActuel: 'nu_micro',
      forceRegime: false,
      jeanbrunType: sc.jeanbrunType || 'ancien',
      jeanbrunNiveau: sc.jeanbrunNiveau || 'intermediaire'
    };
  }

  async function runAnalysis(sc) {
    try {
      const pd = buildPropertyData(sc);
      const result = await analyzer.performCompleteAnalysis(pd);
      return result?.fiscal || result?.fiscalResults || result?.results || [];
    } catch (e) {
      console.warn('performCompleteAnalysis error:', e.message);
      return [];
    }
  }

  function extractResults(results) {
    if (!Array.isArray(results) || results.length === 0) return [];
    // Normaliser et trier par cash-flow
    return results
      .map(r => ({
        id: analyzer.normalizeRegimeKey?.(r) || r.id,
        nom: r.nom || r.id,
        cf: Math.round(r.cashflowMensuel ?? (r.cashflowNetAnnuel || 0) / 12),
        cfAn: Math.round(r.cashflowNetAnnuel || 0),
        impot: Math.round(r.impotAnnuel || 0),
        rdt: (r.rendementNet || 0).toFixed(2)
      }))
      .sort((a, b) => b.cf - a.cf);
  }

  // ── Scénarios ────────────────────────────────────────────
  const scenarios = [
    {
      nom: '🏢 T3 Lyon — SANS compta/CFE',
      desc: 'Référence pour comparer l\'impact des charges pro',
      prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
      duree: 20, taux: 3.5, tmi: 30, gestion: 7,
      comptaAn: 0, cfeAn: 0, partMobilier: 10, taxeFonciere: 1200
    },
    {
      nom: '🏢 T3 Lyon — AVEC compta 1200€ + CFE 500€',
      desc: 'Même bien, charges pro réalistes',
      prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
      duree: 20, taux: 3.5, tmi: 30, gestion: 7,
      comptaAn: 1200, cfeAn: 500, partMobilier: 10, taxeFonciere: 1200
    },
    {
      nom: '💰 Paris TMI 41% — compta 1500€ + CFE 800€',
      desc: 'Haut revenu, mobilier 15%',
      prix: 400000, surface: 45, loyerHC: 1400, apport: 80000,
      duree: 25, taux: 3.5, tmi: 41, gestion: 7,
      comptaAn: 1500, cfeAn: 800, partMobilier: 15, taxeFonciere: 2000
    },
    {
      nom: '🤑 TMI 45% — compta 1500€ + CFE 700€',
      desc: 'Max fiscal, Jeanbrun très social neuf',
      prix: 350000, surface: 50, loyerHC: 1200, apport: 100000,
      duree: 20, taux: 3.5, tmi: 45, gestion: 7,
      comptaAn: 1500, cfeAn: 700, partMobilier: 10, taxeFonciere: 1800
    },
    {
      nom: '👶 Primo TMI 11% — sans charges pro',
      desc: 'Petit budget, micro probable',
      prix: 100000, surface: 30, loyerHC: 500, apport: 10000,
      duree: 25, taux: 3.8, tmi: 11, gestion: 0,
      comptaAn: 0, cfeAn: 0, partMobilier: 10, taxeFonciere: 500
    }
  ];

  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  🧪 TESTS v3 — via performCompleteAnalysis (compta + CFE intégrés)', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('');

  const synthese = [];

  for (const sc of scenarios) {
    injectScenario(sc);

    console.group(`%c${sc.nom}`, 'color:#00bfff;font-size:12px;font-weight:bold');
    console.log(`%c${sc.desc}`, 'color:#94a3b8');
    console.log(`Prix: ${sc.prix.toLocaleString('fr-FR')}€ | ${sc.surface}m² | Loyer: ${sc.loyerHC}€ | TMI: ${sc.tmi}% | Compta: ${sc.comptaAn}€ | CFE: ${sc.cfeAn}€ | Mob: ${sc.partMobilier}%`);

    const raw = await runAnalysis(sc);
    const res = extractResults(raw);

    if (res.length === 0) {
      console.warn('Aucun résultat — vérifier que le formulaire est initialisé');
      console.groupEnd();
      continue;
    }

    console.table(res.map((r, i) => ({
      '#': i + 1,
      'Régime': r.nom.substring(0, 22),
      'CF/mois': r.cf + ' €',
      'CF/an': r.cfAn + ' €',
      'Impôt': r.impot + ' €',
      'Rdt': r.rdt + '%'
    })));

    const jb = res.find(r => r.id === 'nu_jeanbrun' || r.id === 'jeanbrun');
    const lmnp = res.find(r => r.id === 'lmnp_reel' || r.id === 'lmnp-reel');
    const best = res[0];
    const jbRank = jb ? res.indexOf(jb) + 1 : '-';

    synthese.push({
      'Scénario': sc.nom.replace(/^.{2} /, '').substring(0, 28),
      'TMI': sc.tmi + '%',
      'Compta': sc.comptaAn + '€',
      'CFE': sc.cfeAn + '€',
      '#1': best.nom.substring(0, 16),
      'CF #1': best.cf + '€/m',
      'JB #': jbRank,
      'JB CF': (jb?.cf || 0) + '€/m',
      'LMNP CF': (lmnp?.cf || 0) + '€/m',
      'Δ JB-LMNP': ((jb?.cf||0) - (lmnp?.cf||0)) + '€'
    });

    console.groupEnd();
    console.log('');
  }

  // ── Synthèse ─────────────────────────────────────────────
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  📊 SYNTHÈSE', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.table(synthese);

  // ── Impact compta + CFE (même bien, 4 configs) ───────────
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');
  console.log('%c  💸 IMPACT COMPTA + CFE — T3 200K€ TMI 30%', 'color:#f59e0b;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');

  const baseSc = {
    prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
    duree: 20, taux: 3.5, tmi: 30, gestion: 7,
    partMobilier: 10, taxeFonciere: 1200
  };

  const impactRows = [];
  for (const cfg of [
    { label: 'Sans compta ni CFE', comptaAn: 0, cfeAn: 0 },
    { label: 'Compta 800€', comptaAn: 800, cfeAn: 0 },
    { label: 'Compta 1200€ + CFE 500€', comptaAn: 1200, cfeAn: 500 },
    { label: 'Compta 1500€ + CFE 800€', comptaAn: 1500, cfeAn: 800 }
  ]) {
    const scCfg = { ...baseSc, ...cfg };
    injectScenario(scCfg);
    const raw = await runAnalysis(scCfg);
    const res = extractResults(raw);
    const find = (id1, id2) => res.find(r => r.id === id1 || r.id === id2);

    impactRows.push({
      'Config': cfg.label,
      'LMNP Réel': (find('lmnp_reel','lmnp-reel')?.cf||0) + '€/m',
      'Jeanbrun': (find('nu_jeanbrun','jeanbrun')?.cf||0) + '€/m',
      'Réel foncier': (find('nu_reel','reel-foncier')?.cf||0) + '€/m',
      'Micro': (find('nu_micro','micro-foncier')?.cf||0) + '€/m',
      '#1': res[0]?.nom?.substring(0, 16) || '?'
    });
  }
  console.table(impactRows);

  // ── Impact part mobilier ─────────────────────────────────
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');
  console.log('%c  🪑 IMPACT PART MOBILIER — T3 200K€ TMI 30% (compta 1200€ + CFE 500€)', 'color:#a78bfa;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');

  const mobRows = [];
  for (const mob of [0, 5, 10, 15, 20]) {
    const scMob = { ...baseSc, comptaAn: 1200, cfeAn: 500, partMobilier: mob };
    injectScenario(scMob);
    const raw = await runAnalysis(scMob);
    const res = extractResults(raw);
    const lmnp = res.find(r => r.id === 'lmnp_reel' || r.id === 'lmnp-reel');
    const jb = res.find(r => r.id === 'nu_jeanbrun' || r.id === 'jeanbrun');

    mobRows.push({
      'Mobilier': mob + '%',
      'LMNP CF/mois': (lmnp?.cf||0) + '€',
      'JB CF/mois': (jb?.cf||0) + '€',
      '#1': res[0]?.nom?.substring(0, 16) || '?'
    });
  }
  console.table(mobRows);

  // ── Sensibilité TMI (avec charges réalistes) ─────────────
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  📈 SENSIBILITÉ TMI — avec compta 1200€ + CFE 500€', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  const tmiRows = [];
  for (const tmi of [0, 11, 30, 41, 45]) {
    const scTmi = { ...baseSc, tmi, comptaAn: 1200, cfeAn: 500 };
    injectScenario(scTmi);
    const raw = await runAnalysis(scTmi);
    const res = extractResults(raw);
    const jb = res.find(r => r.id === 'nu_jeanbrun' || r.id === 'jeanbrun');
    const lmnp = res.find(r => r.id === 'lmnp_reel' || r.id === 'lmnp-reel');

    tmiRows.push({
      'TMI': tmi + '%',
      'Jeanbrun': (jb?.cf||0) + '€/m',
      'LMNP Réel': (lmnp?.cf||0) + '€/m',
      'Écart': ((jb?.cf||0) - (lmnp?.cf||0)) + '€',
      '#1': res[0]?.nom?.substring(0, 16) || '?',
      'JB > LMNP ?': (jb?.cf||0) > (lmnp?.cf||0) ? '✅ OUI' : '❌ Non'
    });
  }
  console.table(tmiRows);

  // Restaurer défauts dans le DOM
  const defaults = {
    prix: 200000, surface: 60, loyerHC: 800, apport: 40000,
    duree: 20, taux: 3.5, tmi: 30, gestion: 0,
    comptaAn: 0, cfeAn: 0, partMobilier: 10, taxeFonciere: 800
  };
  injectScenario(defaults);

  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  ✅ TOUS LES SCÉNARIOS TERMINÉS', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
})();
