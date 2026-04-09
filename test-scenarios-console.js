/**
 * test-scenarios-console.js
 *
 * Tests automatisés avec différents profils d'investisseurs
 * Inclut expert-comptable, CFE et part mobilier
 *
 * Usage : fetch('test-scenarios-console.js').then(r=>r.text()).then(eval)
 */

(async function runScenarios() {
  const analyzer = window.analyzer;
  if (!analyzer?.comparateur?.compareAllRegimes) {
    console.error('❌ Analyzer non disponible. Remplir au moins une fois le formulaire puis relancer.');
    return;
  }

  // Helper : injecter une valeur dans un champ du DOM (pour que getAllAdvancedParams les lise)
  function setField(id, value) {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    }
  }

  // Helper : injecter les params avancés d'un scénario dans le DOM
  function injectAdvancedParams(params) {
    setField('compta-an', params.comptaAn ?? 0);
    setField('cfe-an', params.cfeAn ?? 0);
    setField('part-mobilier', params.partMobilier ?? 10);
    setField('entretien-annuel', params.entretienAnnuel ?? 500);
    setField('assurance-pno', params.assurancePNO ?? 15);
    setField('taxeFonciere', params.taxeFonciere ?? 800);
    setField('vacanceLocative', params.vacanceLocative ?? 0);
    setField('gestionLocative', params.gestionLocativeTaux ?? 0);
    setField('travaux-renovation', params.travauxRenovation ?? 0);
    setField('charges-copro-non-recup', params.chargesCopro ?? 50);
  }

  // ═══════════════════════════════════════════════════════════
  // SCÉNARIOS
  // ═══════════════════════════════════════════════════════════
  const scenarios = [
    {
      nom: '🏠 Studio étudiant — Lille (sans compta)',
      desc: 'Petit budget, micro-BIC probable, pas de compta',
      data: {
        apport: 15000, taux: 3.2, duree: 20, surface: 20,
        prixBien: 80000, loyerMensuel: 450, tmi: 11,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      },
      params: { comptaAn: 0, cfeAn: 0, partMobilier: 10 }
    },
    {
      nom: '🏢 T3 Lyon — avec compta + CFE',
      desc: '60m², TMI 30%, charges réalistes complètes',
      data: {
        apport: 40000, taux: 3.5, duree: 20, surface: 60,
        prixBien: 200000, loyerMensuel: 800, tmi: 30,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      },
      params: { comptaAn: 1200, cfeAn: 500, partMobilier: 10, taxeFonciere: 1200 }
    },
    {
      nom: '💰 Paris TMI 41% — compta + CFE + mobilier 15%',
      desc: 'Haut revenu, bien meublé haut de gamme',
      data: {
        apport: 80000, taux: 3.5, duree: 25, surface: 45,
        prixBien: 400000, loyerMensuel: 1400, tmi: 41,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'neuf'
      },
      params: { comptaAn: 1500, cfeAn: 800, partMobilier: 15, taxeFonciere: 2000 }
    },
    {
      nom: '🔨 Ancien rénové — travaux 40%, compta',
      desc: 'Éligible Jeanbrun ancien, loyer social',
      data: {
        apport: 25000, taux: 3.3, duree: 20, surface: 70,
        prixBien: 120000, loyerMensuel: 650, tmi: 30,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'social', jeanbrunType: 'ancien'
      },
      params: { comptaAn: 800, cfeAn: 300, partMobilier: 10, travauxRenovation: 48000 }
    },
    {
      nom: '🤑 TMI 45% — max fiscal Jeanbrun très social',
      desc: 'Gros déficit foncier, forte économie impôt',
      data: {
        apport: 100000, taux: 3.5, duree: 20, surface: 50,
        prixBien: 350000, loyerMensuel: 1200, tmi: 45,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'tresSocial', jeanbrunType: 'neuf'
      },
      params: { comptaAn: 1500, cfeAn: 700, partMobilier: 10, taxeFonciere: 1800 }
    },
    {
      nom: '👶 Primo TMI 11% — sans charges pro',
      desc: 'Petit apport, pas de compta, micro probable',
      data: {
        apport: 10000, taux: 3.8, duree: 25, surface: 30,
        prixBien: 100000, loyerMensuel: 500, tmi: 11,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      },
      params: { comptaAn: 0, cfeAn: 0, partMobilier: 10 }
    },
    {
      nom: '📊 T3 Lyon SANS compta (comparaison)',
      desc: 'Même bien que scénario 2 mais SANS compta ni CFE',
      data: {
        apport: 40000, taux: 3.5, duree: 20, surface: 60,
        prixBien: 200000, loyerMensuel: 800, tmi: 30,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      },
      params: { comptaAn: 0, cfeAn: 0, partMobilier: 10, taxeFonciere: 1200 }
    }
  ];

  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  🧪 TESTS MULTI-SCÉNARIOS — avec compta, CFE & part mobilier', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('');

  const synthese = [];

  for (const sc of scenarios) {
    // Injecter les params avancés dans le DOM
    injectAdvancedParams({ ...sc.params, gestionLocativeTaux: sc.data.gestionLocativeTaux });

    console.group(`%c${sc.nom}`, 'color:#00bfff;font-size:12px;font-weight:bold');
    console.log(`%c${sc.desc}`, 'color:#94a3b8');
    console.log(`Prix: ${sc.data.prixBien.toLocaleString('fr-FR')}€ | ${sc.data.surface}m² | Loyer: ${sc.data.loyerMensuel}€ | TMI: ${sc.data.tmi}%`);
    console.log(`Compta: ${sc.params.comptaAn||0}€ | CFE: ${sc.params.cfeAn||0}€ | Mobilier: ${sc.params.partMobilier||10}%`);

    try {
      const results = await analyzer.comparateur.compareAllRegimes(sc.data);

      console.table(results.map((r, i) => ({
        '#': i + 1,
        'Régime': (r.nom || r.id).substring(0, 22),
        'CF/mois': Math.round(r.cashflowMensuel || 0) + ' €',
        'CF/an': Math.round(r.cashflowNetAnnuel || 0) + ' €',
        'Impôt': Math.round(r.impotAnnuel || 0) + ' €',
        'Rdt': (r.rendementNet || 0).toFixed(2) + '%'
      })));

      const jb = results.find(r => r.id === 'jeanbrun');
      const best = results[0];
      const lmnp = results.find(r => r.id === 'lmnp-reel');
      const jbRank = jb ? results.indexOf(jb) + 1 : '-';

      synthese.push({
        'Scénario': sc.nom.replace(/^.{2} /, '').substring(0, 30),
        'TMI': sc.data.tmi + '%',
        'Compta': (sc.params.comptaAn || 0) + '€',
        'CFE': (sc.params.cfeAn || 0) + '€',
        'Mob%': (sc.params.partMobilier || 10) + '%',
        '#1': (best.nom || best.id).substring(0, 16),
        'CF #1': Math.round(best.cashflowMensuel || 0) + '€',
        'JB #': jbRank,
        'JB CF': Math.round(jb?.cashflowMensuel || 0) + '€',
        'LMNP CF': Math.round(lmnp?.cashflowMensuel || 0) + '€'
      });

    } catch (err) {
      console.error('Erreur:', err.message);
    }
    console.groupEnd();
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════
  // SYNTHÈSE
  // ═══════════════════════════════════════════════════════════
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  📊 SYNTHÈSE COMPARATIVE', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.table(synthese);

  // ═══════════════════════════════════════════════════════════
  // IMPACT COMPTA + CFE (même bien, avec vs sans)
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');
  console.log('%c  💸 IMPACT COMPTA + CFE — T3 200K€ TMI 30%', 'color:#f59e0b;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');

  const baseData = {
    apport: 40000, taux: 3.5, duree: 20, surface: 60,
    prixBien: 200000, loyerMensuel: 800, tmi: 30,
    gestionLocativeTaux: 7, typeAchat: 'classique',
    jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
  };

  const impact = [];
  const configs = [
    { label: 'Sans compta ni CFE', comptaAn: 0, cfeAn: 0 },
    { label: 'Compta 800€ seul', comptaAn: 800, cfeAn: 0 },
    { label: 'Compta 1200€ + CFE 500€', comptaAn: 1200, cfeAn: 500 },
    { label: 'Compta 1500€ + CFE 800€', comptaAn: 1500, cfeAn: 800 }
  ];

  for (const cfg of configs) {
    injectAdvancedParams({ ...cfg, partMobilier: 10, taxeFonciere: 1200 });
    const res = await analyzer.comparateur.compareAllRegimes(baseData);
    const jb = res.find(r => r.id === 'jeanbrun');
    const lmnp = res.find(r => r.id === 'lmnp-reel');
    const reel = res.find(r => r.id === 'reel-foncier');
    const micro = res.find(r => r.id === 'micro-foncier');

    impact.push({
      'Config': cfg.label,
      'LMNP Réel': Math.round(lmnp?.cashflowMensuel || 0) + '€/m',
      'Jeanbrun': Math.round(jb?.cashflowMensuel || 0) + '€/m',
      'Réel foncier': Math.round(reel?.cashflowMensuel || 0) + '€/m',
      'Micro-fonc.': Math.round(micro?.cashflowMensuel || 0) + '€/m',
      '#1': (res[0]?.nom || res[0]?.id || '?').substring(0, 16)
    });
  }
  console.table(impact);
  console.log('%cNote : la compta impacte surtout LMNP/LMP/SCI (charge réelle). Le micro n\'est pas affecté.', 'color:#94a3b8;font-style:italic');

  // ═══════════════════════════════════════════════════════════
  // IMPACT PART MOBILIER
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');
  console.log('%c  🪑 IMPACT PART MOBILIER — T3 200K€ TMI 30%', 'color:#a78bfa;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');

  const mobImpact = [];
  for (const mob of [0, 5, 10, 15, 20]) {
    injectAdvancedParams({ comptaAn: 1200, cfeAn: 500, partMobilier: mob, taxeFonciere: 1200 });
    const res = await analyzer.comparateur.compareAllRegimes(baseData);
    const lmnp = res.find(r => r.id === 'lmnp-reel');
    const jb = res.find(r => r.id === 'jeanbrun');

    mobImpact.push({
      'Mobilier': mob + '%',
      'LMNP amort total': Math.round(lmnp?.amortissements || 0) + '€',
      'LMNP CF/mois': Math.round(lmnp?.cashflowMensuel || 0) + '€',
      'Jeanbrun CF/mois': Math.round(jb?.cashflowMensuel || 0) + '€',
      '#1': (res[0]?.nom || res[0]?.id || '?').substring(0, 16)
    });
  }
  console.table(mobImpact);
  console.log('%cNote : le mobilier augmente l\'amort LMNP (amorti sur 10 ans vs 40 ans pour le bâti). Jeanbrun n\'est pas affecté (amort propre).', 'color:#94a3b8;font-style:italic');

  // ═══════════════════════════════════════════════════════════
  // SENSIBILITÉ TMI (avec charges réalistes)
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  📈 SENSIBILITÉ TMI — avec compta 1200€ + CFE 500€', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

  injectAdvancedParams({ comptaAn: 1200, cfeAn: 500, partMobilier: 10, taxeFonciere: 1200 });

  const tmiTest = [];
  for (const tmi of [0, 11, 30, 41, 45]) {
    const d = { ...baseData, tmi, jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire' };
    const res = await analyzer.comparateur.compareAllRegimes(d);
    const jb = res.find(r => r.id === 'jeanbrun');
    const lmnp = res.find(r => r.id === 'lmnp-reel');
    const jbWins = (jb?.cashflowMensuel || 0) > (lmnp?.cashflowMensuel || 0);

    tmiTest.push({
      'TMI': tmi + '%',
      'Jeanbrun': Math.round(jb?.cashflowMensuel || 0) + '€/m',
      'LMNP Réel': Math.round(lmnp?.cashflowMensuel || 0) + '€/m',
      'Écart': Math.round((jb?.cashflowMensuel || 0) - (lmnp?.cashflowMensuel || 0)) + '€',
      '#1': (res[0]?.nom || res[0]?.id || '?').substring(0, 16),
      'JB > LMNP ?': jbWins ? '✅ OUI' : '❌ Non'
    });
  }
  console.table(tmiTest);

  // Restaurer les params par défaut
  injectAdvancedParams({ comptaAn: 0, cfeAn: 0, partMobilier: 10, taxeFonciere: 800 });

  console.log('');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  ✅ TOUS LES SCÉNARIOS TERMINÉS', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
})();
