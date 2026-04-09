/**
 * test-scenarios-console.js
 *
 * Tests automatisés avec différents profils d'investisseurs
 * Coller dans la console sur comparaison-fiscale.html ou :
 *   fetch('test-scenarios-console.js').then(r=>r.text()).then(eval)
 */

(async function runScenarios() {
  const analyzer = window.analyzer;
  if (!analyzer?.comparateur?.compareAllRegimes) {
    console.error('Analyzer non disponible. Remplir au moins une fois le formulaire puis relancer.');
    return;
  }

  const fmt = v => Math.round(v).toLocaleString('fr-FR').padStart(8) + ' €';
  const pct = v => (v||0).toFixed(2).padStart(6) + ' %';

  // ═══════════════════════════════════════════════════════════
  // SCÉNARIOS DE TEST
  // ═══════════════════════════════════════════════════════════
  const scenarios = [
    {
      nom: '🏠 Studio étudiant — Lille',
      desc: 'Petit budget, studio 20m², ville abordable',
      data: {
        apport: 15000, taux: 3.2, duree: 20, surface: 20,
        prixBien: 80000, loyerMensuel: 450, tmi: 11,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      }
    },
    {
      nom: '🏢 T3 classique — Lyon',
      desc: '60m², prix moyen, TMI 30%',
      data: {
        apport: 40000, taux: 3.5, duree: 20, surface: 60,
        prixBien: 200000, loyerMensuel: 800, tmi: 30,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      }
    },
    {
      nom: '💰 Haut revenu — Paris',
      desc: 'TMI 41%, bien cher, fort levier fiscal',
      data: {
        apport: 80000, taux: 3.5, duree: 25, surface: 45,
        prixBien: 400000, loyerMensuel: 1400, tmi: 41,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'neuf'
      }
    },
    {
      nom: '🔨 Ancien rénové — Province',
      desc: 'Travaux 40% du prix, éligible Jeanbrun ancien',
      data: {
        apport: 25000, taux: 3.3, duree: 20, surface: 70,
        prixBien: 120000, loyerMensuel: 650, tmi: 30,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'social', jeanbrunType: 'ancien',
        travauxRenovation: 48000 // 40% du prix
      }
    },
    {
      nom: '🏗️ Neuf VEFA — Bordeaux',
      desc: 'Jeanbrun neuf, loyer intermédiaire, TMI 30%',
      data: {
        apport: 50000, taux: 3.4, duree: 25, surface: 55,
        prixBien: 250000, loyerMensuel: 900, tmi: 30,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'neuf'
      }
    },
    {
      nom: '🤑 Ultra haut revenu — TMI 45%',
      desc: 'Maximiser le levier fiscal Jeanbrun très social',
      data: {
        apport: 100000, taux: 3.5, duree: 20, surface: 50,
        prixBien: 350000, loyerMensuel: 1200, tmi: 45,
        gestionLocativeTaux: 7, typeAchat: 'classique',
        jeanbrunNiveau: 'tresSocial', jeanbrunType: 'neuf'
      }
    },
    {
      nom: '🏚️ Enchères — Petit prix',
      desc: 'Vente aux enchères, prix cassé, fort rendement',
      data: {
        apport: 20000, taux: 3.5, duree: 15, surface: 50,
        prixBien: 90000, loyerMensuel: 550, tmi: 30,
        gestionLocativeTaux: 0, typeAchat: 'encheres',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      }
    },
    {
      nom: '👶 Primo-accédant prudent',
      desc: 'Petit apport, TMI faible, longue durée',
      data: {
        apport: 10000, taux: 3.8, duree: 25, surface: 30,
        prixBien: 100000, loyerMensuel: 500, tmi: 11,
        gestionLocativeTaux: 0, typeAchat: 'classique',
        jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
      }
    }
  ];

  console.log('%c═══════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  🧪 TESTS MULTI-SCÉNARIOS — 8 profils d\'investisseurs', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('');

  const synthese = [];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    console.group(`%c${sc.nom}`, 'color:#00bfff;font-size:12px;font-weight:bold');
    console.log(`%c${sc.desc}`, 'color:#94a3b8');
    console.log(`Prix: ${sc.data.prixBien.toLocaleString('fr-FR')}€ | ${sc.data.surface}m² | Loyer: ${sc.data.loyerMensuel}€ | TMI: ${sc.data.tmi}% | Apport: ${sc.data.apport.toLocaleString('fr-FR')}€`);

    try {
      const results = await analyzer.comparateur.compareAllRegimes(sc.data);

      // Tableau des résultats
      console.table(results.map(r => ({
        'Régime': (r.nom || r.id).substring(0, 22),
        'CF/mois': Math.round(r.cashflowMensuel || 0) + ' €',
        'CF/an': Math.round(r.cashflowNetAnnuel || 0) + ' €',
        'Impôt': Math.round(r.impotAnnuel || 0) + ' €',
        'Rdt net': (r.rendementNet || 0).toFixed(2) + '%',
        '#': results.indexOf(r) + 1
      })));

      // Jeanbrun détails
      const jb = results.find(r => r.id === 'jeanbrun');
      const best = results[0];
      const jbRank = jb ? results.indexOf(jb) + 1 : '-';

      if (jb) {
        console.log(`  Jeanbrun : #${jbRank} | amort: ${Math.round(jb.amortissements||0)}€ | déficit: ${Math.round(jb.deficit||0)}€ | économie: ${Math.round(jb.impotAnnuel||0)}€`);
      }

      // Verdict
      const jbVsBest = jb && best ? Math.round((jb.cashflowMensuel||0) - (best.cashflowMensuel||0)) : 0;
      const verdict = jbRank === 1 ? '🏆 JEANBRUN #1' :
                      jbRank === 2 ? `🥈 Jeanbrun #2 (${jbVsBest}€/mois vs ${(best.nom||best.id).substring(0,15)})` :
                      `📊 Jeanbrun #${jbRank} (${jbVsBest}€/mois vs #1)`;
      console.log(`%c  → ${verdict}`, jbRank <= 2 ? 'color:#22c55e;font-weight:bold' : 'color:#f59e0b');

      synthese.push({
        'Scénario': sc.nom.replace(/^.{2} /, ''),
        'TMI': sc.data.tmi + '%',
        'Prix': (sc.data.prixBien/1000) + 'K€',
        '#1': (best.nom||best.id).substring(0, 18),
        'CF #1': Math.round(best.cashflowMensuel||0) + '€/m',
        'JB rang': '#' + jbRank,
        'JB CF': Math.round(jb?.cashflowMensuel||0) + '€/m',
        'JB écart': jbVsBest + '€/m'
      });

    } catch (err) {
      console.error('Erreur:', err.message);
      synthese.push({ 'Scénario': sc.nom, 'Erreur': err.message });
    }
    console.groupEnd();
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════
  // SYNTHÈSE
  // ═══════════════════════════════════════════════════════════
  console.log('%c═══════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.log('%c  📊 SYNTHÈSE — Où Jeanbrun se positionne', 'color:#6366f1;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#6366f1;font-weight:bold');
  console.table(synthese);

  // Tests Jeanbrun spécifiques : 3 niveaux × 2 types
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');
  console.log('%c  🏛️ MATRICE JEANBRUN — 3 niveaux × 2 types de bien', 'color:#a78bfa;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#a78bfa;font-weight:bold');

  const baseJB = {
    apport: 40000, taux: 3.5, duree: 20, surface: 60,
    prixBien: 200000, loyerMensuel: 800, tmi: 30,
    gestionLocativeTaux: 7, typeAchat: 'classique'
  };

  const matrice = [];
  for (const type of ['neuf', 'ancien']) {
    for (const niveau of ['intermediaire', 'social', 'tresSocial']) {
      const d = { ...baseJB, jeanbrunType: type, jeanbrunNiveau: niveau };
      const res = await analyzer.comparateur.compareAllRegimes(d);
      const jb = res.find(r => r.id === 'jeanbrun');
      const lmnp = res.find(r => r.id === 'lmnp-reel');
      const decoteLabel = { intermediaire: '−15%', social: '−30%', tresSocial: '−45%' }[niveau];

      matrice.push({
        'Type': type,
        'Niveau': niveau,
        'Décote': decoteLabel,
        'JB CF/mois': Math.round(jb?.cashflowMensuel||0) + '€',
        'JB Amort': Math.round(jb?.amortissements||0) + '€',
        'JB Déficit': Math.round(jb?.deficit||0) + '€',
        'JB Impôt': Math.round(jb?.impotAnnuel||0) + '€',
        'LMNP CF/mois': Math.round(lmnp?.cashflowMensuel||0) + '€',
        'Écart JB-LMNP': Math.round((jb?.cashflowMensuel||0) - (lmnp?.cashflowMensuel||0)) + '€'
      });
    }
  }
  console.table(matrice);

  // Sensibilité TMI
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');
  console.log('%c  📈 SENSIBILITÉ TMI — À partir de quel TMI Jeanbrun bat LMNP ?', 'color:#f59e0b;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#f59e0b;font-weight:bold');

  const tmiTest = [];
  for (const tmi of [0, 11, 30, 41, 45]) {
    const d = { ...baseJB, tmi, jeanbrunType: 'ancien', jeanbrunNiveau: 'intermediaire' };
    const res = await analyzer.comparateur.compareAllRegimes(d);
    const jb = res.find(r => r.id === 'jeanbrun');
    const lmnp = res.find(r => r.id === 'lmnp-reel');
    const reel = res.find(r => r.id === 'reel-foncier');
    const jbWins = (jb?.cashflowMensuel||0) > (lmnp?.cashflowMensuel||0);

    tmiTest.push({
      'TMI': tmi + '%',
      'JB CF/mois': Math.round(jb?.cashflowMensuel||0) + '€',
      'LMNP CF/mois': Math.round(lmnp?.cashflowMensuel||0) + '€',
      'Réel CF/mois': Math.round(reel?.cashflowMensuel||0) + '€',
      '#1': (res[0]?.nom||res[0]?.id||'?').substring(0,18),
      'JB > LMNP ?': jbWins ? '✅ OUI' : '❌ Non'
    });
  }
  console.table(tmiTest);

  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');
  console.log('%c  ✅ TOUS LES SCÉNARIOS TERMINÉS', 'color:#22c55e;font-size:14px;font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#22c55e;font-weight:bold');

})();
