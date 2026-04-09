// Test complet du Guide Fiscal — scénarios réalistes
// Usage : var s=document.createElement('script');s.src='tests/test-guide-fiscal.js?'+Date.now();document.head.appendChild(s);

(function(){
  if (typeof SimulationsFiscales === 'undefined') {
    console.error('SimulationsFiscales non chargé');
    return;
  }
  var F = SimulationsFiscales;
  var fmt = function(n){ return typeof n === 'number' ? n.toLocaleString('fr-FR') : '—'; };

  console.clear();
  console.log('══════════════════════════════════════════════════════');
  console.log('  GUIDE FISCAL — BATTERIE 12 SCÉNARIOS');
  console.log('══════════════════════════════════════════════════════');

  // ─── Helper pour afficher un résultat ───
  function show(label, r, extra) {
    if (!r || !r.compatible) {
      console.log('⚠️ ' + label + ' → Non compatible' + (r && r.message ? ' (' + r.message + ')' : ''));
      return r;
    }
    var charges = r.cotisationsSociales || r.chargesPatronales || 0;
    var ir = r.impotRevenu || 0;
    var is = r.is || 0;
    var divNets = r.dividendesNets || 0;
    var salNet = r.salaireNet || r.remunerationNette || 0;
    var net = r.revenuNetTotal || 0;
    var ratio = r.ca > 0 ? Math.round(net / r.ca * 100) : 0;
    console.log('✅ ' + label);
    console.log('   Salaire net: ' + fmt(salNet) + '€ | Dividendes nets: ' + fmt(divNets) + '€');
    console.log('   Charges: ' + fmt(charges) + '€ | IR: ' + fmt(ir) + '€ | IS: ' + fmt(is) + '€');
    console.log('   ══► REVENU NET TOTAL: ' + fmt(net) + '€ (' + ratio + '% du CA)');
    if (extra) console.log('   💡 ' + extra);
    return r;
  }

  // ══════════════════════════════════════════════════════
  console.log('\n── SCÉNARIO 1 : Freelance dev 80k€ — SASU vs EURL ──');
  console.log('CA: 80k | Marge: 50% | Capital: 1 000€\n');
  // ══════════════════════════════════════════════════════

  // 1a. SASU 100% dividendes (0% salaire) — stratégie ARE
  show('1a. SASU — 0% salaire (stratégie ARE)', F.simulerSASU({
    ca: 80000, tauxMarge: 0.5, tauxRemuneration: 0,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'ARE préservée, mais 0 trimestre retraite');

  // 1b. SASU 30% salaire / 70% dividendes
  show('1b. SASU — 30% salaire / 70% dividendes', F.simulerSASU({
    ca: 80000, tauxMarge: 0.5, tauxRemuneration: 0.3,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'Quelques trimestres retraite validés');

  // 1c. SASU 70% salaire / 30% dividendes
  show('1c. SASU — 70% salaire / 30% dividendes', F.simulerSASU({
    ca: 80000, tauxMarge: 0.5, tauxRemuneration: 0.7,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'Bonne couverture retraite + prévoyance');

  // 1d. EURL IS — 70% salaire / dividendes (capital 1 000€)
  var r1d = show('1d. EURL IS — 70% salaire (capital 1 000€)', F.simulerEURL({
    ca: 80000, tauxMarge: 0.5, tauxRemuneration: 0.7,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'Dividendes > 10% capital (1000€) → cotisations SSI sur excédent');

  // 1e. EURL IS — 70% salaire / dividendes (capital 10 000€)
  show('1e. EURL IS — 70% salaire (capital 10 000€)', F.simulerEURL({
    ca: 80000, tauxMarge: 0.5, tauxRemuneration: 0.7,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 10000
  }), 'Capital plus élevé → base 10% = 1000€ → plus de dividendes exonérés');

  // 1f. EURL IR (pas d'IS)
  show('1f. EURL IR — bénéfice imposé à l\'IR directement', F.simulerEI({
    ca: 80000, tauxMarge: 0.5,
    nbAssocies: 1, partAssocie: 1
  }), 'Pas de dividendes en EI/EURL-IR, tout est revenu pro');

  // ══════════════════════════════════════════════════════
  console.log('\n── SCÉNARIO 2 : Micro-entrepreneur BNC 60k€ ──');
  console.log('CA: 60k | Abattement 34% | Versement libératoire possible\n');
  // ══════════════════════════════════════════════════════

  // 2a. Micro classique (sans VFL)
  show('2a. MICRO BNC — régime classique (IR)', F.simulerMicroEntreprise({
    ca: 60000, typeMicro: 'BNC', versementLiberatoire: false
  }));

  // 2b. Micro avec versement libératoire
  show('2b. MICRO BNC — versement libératoire (2.2%)', F.simulerMicroEntreprise({
    ca: 60000, typeMicro: 'BNC', versementLiberatoire: true
  }), 'VFL = 2.2% du CA en plus des cotisations');

  // 2c. Micro BIC vente 150k
  show('2c. MICRO BIC Vente — CA 150k€', F.simulerMicroEntreprise({
    ca: 150000, typeMicro: 'BIC_VENTE', versementLiberatoire: false
  }), 'Sous le seuil 203 100€ → compatible');

  // ══════════════════════════════════════════════════════
  console.log('\n── SCÉNARIO 3 : Consultant senior 150k€ — impact capital ──');
  console.log('CA: 150k | Marge: 40% | Comparaison capital 1k vs 30k\n');
  // ══════════════════════════════════════════════════════

  // 3a. EURL IS capital 1 000€
  show('3a. EURL IS 150k — capital 1 000€', F.simulerEURL({
    ca: 150000, tauxMarge: 0.4, tauxRemuneration: 0.5,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'Base 10% = 100€ → quasi-tout le dividende soumis SSI');

  // 3b. EURL IS capital 30 000€
  show('3b. EURL IS 150k — capital 30 000€', F.simulerEURL({
    ca: 150000, tauxMarge: 0.4, tauxRemuneration: 0.5,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 30000
  }), 'Base 10% = 3 000€ → plus de dividendes exonérés de SSI');

  // 3c. SASU 150k — 50% salaire
  show('3c. SASU 150k — 50% salaire', F.simulerSASU({
    ca: 150000, tauxMarge: 0.4, tauxRemuneration: 0.5,
    nbAssocies: 1, partAssocie: 1, capitalSocial: 1000
  }), 'Dividendes SASU jamais soumis aux cotisations sociales');

  // ══════════════════════════════════════════════════════
  console.log('\n── SCÉNARIO 4 : SARL famille 2 associés 200k€ ──');
  console.log('CA: 200k | Marge: 35% | 2 associés 50/50\n');
  // ══════════════════════════════════════════════════════

  // 4a. SARL gérant majoritaire
  show('4a. SARL 200k — gérant majoritaire (TNS)', F.simulerSARL({
    ca: 200000, tauxMarge: 0.35, tauxRemuneration: 0.6,
    nbAssocies: 2, partAssocie: 0.5, capitalSocial: 5000,
    gerantMajoritaire: true
  }));

  // 4b. SAS même config
  show('4b. SAS 200k — président assimilé salarié', F.simulerSAS({
    ca: 200000, tauxMarge: 0.35, tauxRemuneration: 0.6,
    nbAssocies: 2, partAssocie: 0.5, capitalSocial: 5000
  }));

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  FIN — Vérifiez les montants ci-dessus');
  console.log('══════════════════════════════════════════════════════');
})();
