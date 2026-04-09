/**
 * test-fiscal-console.js
 *
 * Tests à coller dans la console du navigateur sur comparaison-fiscale.html
 * Vérifie : régimes, constantes 2026, calculs Jeanbrun, cash-flows
 *
 * Usage : ouvrir comparaison-fiscale.html → F12 → Console → coller ce script
 */

(function runFiscalTests() {
  const PASS = '✅';
  const FAIL = '❌';
  const WARN = '⚠️';
  let passed = 0, failed = 0, warnings = 0;

  function assert(name, condition) {
    if (condition) { console.log(PASS, name); passed++; }
    else { console.error(FAIL, name); failed++; }
  }
  function warn(name, condition) {
    if (condition) { console.log(PASS, name); passed++; }
    else { console.warn(WARN, name); warnings++; }
  }

  console.group('🧪 TESTS FISCAUX — comparaison-fiscale.html');
  console.log('Date :', new Date().toLocaleString('fr-FR'));
  console.log('');

  // ═══════════════════════════════════════════════════════
  // 1. VÉRIFICATION DES ÉLÉMENTS UI
  // ═══════════════════════════════════════════════════════
  console.group('1️⃣ Éléments UI');
  assert('Radio Jeanbrun existe', !!document.querySelector('input[name="regime-actuel"][value="nu_jeanbrun"]'));
  assert('Panel options Jeanbrun existe', !!document.getElementById('jeanbrun-options'));
  assert('Radios type bien (neuf/ancien)', document.querySelectorAll('input[name="jeanbrun-type"]').length === 2);
  assert('Radios niveau loyer (3 niveaux)', document.querySelectorAll('input[name="jeanbrun-niveau"]').length === 3);
  assert('Zone validation travaux existe', !!document.getElementById('jeanbrun-travaux-check'));
  assert('Zone grille loyers existe', !!document.getElementById('jeanbrun-loyer-grid'));

  // Vérifier tous les régimes
  const regimes = ['nu_micro', 'nu_reel', 'nu_jeanbrun', 'lmnp_micro', 'lmnp_reel', 'lmp_reel', 'sci_is'];
  regimes.forEach(r => {
    assert('Radio ' + r + ' existe', !!document.querySelector(`input[name="regime-actuel"][value="${r}"]`));
  });
  console.groupEnd();

  // ═══════════════════════════════════════════════════════
  // 2. REGIME_LABELS
  // ═══════════════════════════════════════════════════════
  console.group('2️⃣ REGIME_LABELS');
  if (typeof REGIME_LABELS !== 'undefined') {
    assert('REGIME_LABELS défini', true);
    assert('nu_jeanbrun dans REGIME_LABELS', !!REGIME_LABELS['nu_jeanbrun']);
    assert('nu_jeanbrun.id = jeanbrun', REGIME_LABELS['nu_jeanbrun']?.id === 'jeanbrun');
    assert('7 régimes dans REGIME_LABELS', Object.keys(REGIME_LABELS).length === 7);
  } else {
    assert('REGIME_LABELS défini', false);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════════
  // 3. CONSTANTES FISCALES 2026
  // ═══════════════════════════════════════════════════════
  console.group('3️⃣ Constantes fiscales 2026');
  if (typeof FISCAL_CONSTANTS !== 'undefined') {
    assert('FISCAL_CONSTANTS défini', true);
    assert('PS location nue = 17.2%', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX === 0.172);
    assert('PS meublé = 18.6% (LFSS 2026)', FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX_MEUBLE === 0.186);
    assert('Plafond IS = 100 000€ (LF 2026)', FISCAL_CONSTANTS.IS_PLAFOND_REDUIT === 100000);
    assert('Déficit foncier max = 10 700€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX === 10700);
    assert('Déficit réno énergétique = 21 400€', FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX_RENO_ENERGETIQUE === 21400);
    assert('Micro-foncier plafond = 15 000€', FISCAL_CONSTANTS.MICRO_FONCIER_PLAFOND === 15000);
    assert('Micro-BIC plafond = 77 700€', FISCAL_CONSTANTS.MICRO_BIC_PLAFOND === 77700);
    assert('Cotisations LMP min = 1 220€', FISCAL_CONSTANTS.LMP_COTISATIONS_MIN === 1220);
  } else {
    assert('FISCAL_CONSTANTS défini', false);
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════════
  // 4. ANALYZER & COMPARATEUR
  // ═══════════════════════════════════════════════════════
  console.group('4️⃣ Analyzer & Comparateur');
  const analyzer = window.analyzer;
  assert('window.analyzer existe', !!analyzer);

  if (analyzer) {
    assert('analyzer.comparateur existe', !!analyzer.comparateur);
    assert('analyzer.simulateur existe', !!analyzer.simulateur);

    // Vérifier getRegimeRegistry
    const registry = analyzer.getRegimeRegistry?.();
    if (registry) {
      assert('Registry contient nu_jeanbrun', !!registry['nu_jeanbrun']);
      assert('Registry contient 7 régimes', Object.keys(registry).length === 7);
    }

    // Vérifier normalizeRegimeKey
    if (analyzer.normalizeRegimeKey) {
      assert('normalizeRegimeKey(jeanbrun) = nu_jeanbrun', analyzer.normalizeRegimeKey({id:'jeanbrun'}) === 'nu_jeanbrun');
      assert('normalizeRegimeKey(nu_jeanbrun) = nu_jeanbrun', analyzer.normalizeRegimeKey({id:'nu_jeanbrun'}) === 'nu_jeanbrun');
    }

    // Vérifier getTauxImposition sur le comparateur
    const fc = analyzer.comparateur;
    if (fc?.getTauxImposition) {
      assert('PS micro-foncier = TMI + 17.2', Math.abs(fc.getTauxImposition('micro-foncier', 30) - 47.2) < 0.01);
      assert('PS jeanbrun = TMI + 17.2 (nu)', Math.abs(fc.getTauxImposition('jeanbrun', 30) - 47.2) < 0.01);
      assert('PS lmnp-micro = TMI + 18.6', Math.abs(fc.getTauxImposition('lmnp-micro', 30) - 48.6) < 0.01);
      assert('PS lmnp-reel = TMI + 18.6', Math.abs(fc.getTauxImposition('lmnp-reel', 30) - 48.6) < 0.01);
      assert('PS sci-is = 0 (IS séparé)', fc.getTauxImposition('sci-is', 30) === 0);
    }

    // Vérifier régime Jeanbrun dans le comparateur
    const jbRegime = fc?.regimes?.find(r => r.id === 'jeanbrun');
    if (jbRegime) {
      assert('Jeanbrun type = reel-amortissement-nu', jbRegime.calcul.type === 'reel-amortissement-nu');
      assert('Jeanbrun décote intermédiaire = 0.15', jbRegime.calcul.decoteLoyer.intermediaire === 0.15);
      assert('Jeanbrun décote social = 0.30', jbRegime.calcul.decoteLoyer.social === 0.30);
      assert('Jeanbrun décote très social = 0.45', jbRegime.calcul.decoteLoyer.tresSocial === 0.45);
      assert('Jeanbrun plafond amort interméd = 8000', jbRegime.calcul.plafondAmortissement.intermediaire === 8000);
      assert('Jeanbrun plafond amort social = 10000', jbRegime.calcul.plafondAmortissement.social === 10000);
      assert('Jeanbrun plafond amort très social = 12000', jbRegime.calcul.plafondAmortissement.tresSocial === 12000);
      assert('Jeanbrun part terrain = 0.20', jbRegime.calcul.partTerrain === 0.20);
      assert('Jeanbrun déficit max = 10700', jbRegime.calcul.deficitMax === 10700);
    } else {
      assert('Régime Jeanbrun dans comparateur', false);
    }
  }
  console.groupEnd();

  // ═══════════════════════════════════════════════════════
  // 5. CALCUL COMPLET (si formulaire rempli)
  // ═══════════════════════════════════════════════════════
  console.group('5️⃣ Calcul comparatif (simulation)');
  if (analyzer?.comparateur?.compareAllRegimes) {
    const testData = {
      apport: 30000, taux: 3.5, duree: 20, surface: 45,
      prixBien: 135000, loyerMensuel: 630, tmi: 30,
      gestionLocativeTaux: 0, typeAchat: 'classique',
      jeanbrunNiveau: 'intermediaire', jeanbrunType: 'ancien'
    };

    analyzer.comparateur.compareAllRegimes(testData).then(results => {
      assert('compareAllRegimes retourne des résultats', results.length > 0);

      const jbResult = results.find(r => r.id === 'jeanbrun');
      assert('Jeanbrun présent dans les résultats', !!jbResult);

      if (jbResult) {
        assert('Jeanbrun CF mensuel est un nombre', !isNaN(jbResult.cashflowMensuel));
        assert('Jeanbrun CF annuel est un nombre', !isNaN(jbResult.cashflowNetAnnuel));
        assert('Jeanbrun rendement est un nombre', !isNaN(jbResult.rendementNet));
        assert('Jeanbrun a des amortissements', (jbResult.amortissements || 0) > 0);
        assert('Jeanbrun base imposable ≥ 0', jbResult.baseImposable >= 0);

        // Jeanbrun devrait créer du déficit (amort + charges > loyer plafonné)
        warn('Jeanbrun crée du déficit', (jbResult.deficit || 0) > 0);
      }

      // Comparaison logique entre régimes
      const reelResult = results.find(r => r.id === 'reel-foncier');
      const microResult = results.find(r => r.id === 'micro-foncier');

      if (jbResult && reelResult) {
        warn('Jeanbrun base imposable ≤ Réel (grâce amortissement)', jbResult.baseImposable <= reelResult.baseImposable);
      }

      if (microResult && reelResult) {
        warn('Réel CF ≥ Micro CF (charges réelles > 30%)', reelResult.cashflowNetAnnuel >= microResult.cashflowNetAnnuel);
      }

      // Tableau récapitulatif
      console.log('');
      console.log('📊 Classement par cash-flow (bien test : 45m², 135K€, TMI 30%) :');
      console.table(results.map(r => ({
        'Régime': r.nom || r.id,
        'CF/mois': Math.round(r.cashflowMensuel || 0) + ' €',
        'CF/an': Math.round(r.cashflowNetAnnuel || 0) + ' €',
        'Impôt': Math.round(r.impotAnnuel || 0) + ' €',
        'Rendement': (r.rendementNet || 0).toFixed(2) + ' %'
      })));

      // 3 niveaux Jeanbrun
      console.log('');
      console.log('📊 Jeanbrun — 3 niveaux de loyer :');
      Promise.all(['intermediaire', 'social', 'tresSocial'].map(niveau => {
        const d = { ...testData, jeanbrunNiveau: niveau };
        return analyzer.comparateur.compareAllRegimes(d).then(res => {
          const jb = res.find(r => r.id === 'jeanbrun');
          return {
            'Niveau': niveau,
            'Décote': { intermediaire: '-15%', social: '-30%', tresSocial: '-45%' }[niveau],
            'Amort': Math.round(jb?.amortissements || 0) + ' €',
            'CF/mois': Math.round(jb?.cashflowMensuel || 0) + ' €',
            'Impôt': Math.round(jb?.impotAnnuel || 0) + ' €',
            'Déficit': Math.round(jb?.deficit || 0) + ' €'
          };
        });
      })).then(rows => {
        console.table(rows);

        // Résumé final
        console.log('');
        console.groupEnd(); // Fermer groupe 5

        console.log('');
        console.log('═══════════════════════════════════════');
        console.log(`🏁 RÉSULTAT : ${passed} ${PASS}  ${failed} ${FAIL}  ${warnings} ${WARN}`);
        if (failed === 0) {
          console.log('🎉 Tous les tests passent !');
        } else {
          console.error(`⛔ ${failed} test(s) en échec`);
        }
        console.log('═══════════════════════════════════════');
        console.groupEnd(); // Fermer groupe principal
      });
    }).catch(err => {
      console.error('Erreur compareAllRegimes:', err);
      console.groupEnd();
      console.groupEnd();
    });
  } else {
    console.log('⏭️ Pas d\'analyzer — tests de calcul ignorés (remplir le formulaire d\'abord)');
    console.groupEnd();

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`🏁 RÉSULTAT : ${passed} ${PASS}  ${failed} ${FAIL}  ${warnings} ${WARN}`);
    console.log('═══════════════════════════════════════');
    console.groupEnd();
  }
})();
