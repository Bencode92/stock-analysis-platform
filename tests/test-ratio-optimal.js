// Test du ratio optimal salaire/dividendes
// var s=document.createElement('script');s.src='tests/test-ratio-optimal.js?'+Date.now();document.head.appendChild(s);

(function(){
  if (typeof SimulationsFiscales === 'undefined') { console.error('SimulationsFiscales non chargé'); return; }
  var F = SimulationsFiscales;
  var fmt = function(n){ return typeof n === 'number' ? n.toLocaleString('fr-FR') : '—'; };

  console.clear();
  console.log('══════════════════════════════════════════════════');
  console.log('  TEST RATIO OPTIMAL SALAIRE / DIVIDENDES');
  console.log('══════════════════════════════════════════════════');

  // Optimisation manuelle : teste 0% à 100% par pas de 5%, affine à 1%
  function trouverOptimal(label, simulFunc, params) {
    var best = {ratio:0, net:0};
    // Passe 1 : pas de 5%
    for (var r = 0; r <= 100; r += 5) {
      try {
        var p = {};
        for (var k in params) p[k] = params[k];
        p.tauxRemuneration = r / 100;
        var res = simulFunc(p);
        var net = res && res.revenuNetTotal || 0;
        if (net > best.net) { best = {ratio: r, net: net}; }
      } catch(e) {}
    }
    // Passe 2 : affinage 1% autour du meilleur
    var lo = Math.max(0, best.ratio - 4);
    var hi = Math.min(100, best.ratio + 4);
    for (var r2 = lo; r2 <= hi; r2++) {
      try {
        var p2 = {};
        for (var k2 in params) p2[k2] = params[k2];
        p2.tauxRemuneration = r2 / 100;
        var res2 = simulFunc(p2);
        var net2 = res2 && res2.revenuNetTotal || 0;
        if (net2 > best.net) { best = {ratio: r2, net: net2}; }
      } catch(e) {}
    }
    return best;
  }

  // ── SASU 100k, marge 40% ──
  console.log('\n── SASU 100k, marge 40%, capital 1k ──');
  var optSASU = trouverOptimal('SASU', function(p){ return F.simulerSASU(p); },
    {ca:100000, tauxMarge:0.4, capitalSocial:1000});
  var r50sasu = F.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:1000});
  console.log('   Ratio optimal : ' + optSASU.ratio + '% salaire → net ' + fmt(optSASU.net) + '€');
  console.log('   Ratio 50%     : net ' + fmt(r50sasu.revenuNetTotal) + '€');
  console.log('   Gain optimal  : +' + fmt(optSASU.net - r50sasu.revenuNetTotal) + '€/an');
  console.log(optSASU.ratio < 50 ? '✅ Dividendes SASU avantageux → ratio bas' : '⚠️ Salaire avantageux');

  // Détail par tranche
  console.log('\n   Détail par ratio :');
  [0, 10, 20, 30, 50, 70, 100].forEach(function(r) {
    var res = F.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:r/100, capitalSocial:1000});
    var sal = res.salaireNetApresIR || res.salaireNet || 0;
    var div = res.dividendesNets || 0;
    console.log('   ' + (r < 10 ? ' ' : '') + r + '% sal → salaire ' + fmt(sal) + '€ + div ' + fmt(div) + '€ = NET ' + fmt(res.revenuNetTotal) + '€');
  });

  // ── EURL IS 100k, capital 1k vs 50k ──
  console.log('\n── EURL IS 100k, marge 40% ──');
  var optEURL1k = trouverOptimal('EURL cap1k', function(p){ p.optionIS = true; return F.simulerEURL(p); },
    {ca:100000, tauxMarge:0.4, capitalSocial:1000});
  var optEURL50k = trouverOptimal('EURL cap50k', function(p){ p.optionIS = true; return F.simulerEURL(p); },
    {ca:100000, tauxMarge:0.4, capitalSocial:50000});
  console.log('   Capital 1k  : ratio optimal ' + optEURL1k.ratio + '% → net ' + fmt(optEURL1k.net) + '€');
  console.log('   Capital 50k : ratio optimal ' + optEURL50k.ratio + '% → net ' + fmt(optEURL50k.net) + '€');
  console.log('   Impact capital : +' + fmt(optEURL50k.net - optEURL1k.net) + '€/an');
  console.log(optEURL50k.net > optEURL1k.net ? '✅ Capital élevé = plus de dividendes exonérés SSI' : '⚠️ Pas d\'impact');

  // ── SARL TNS 200k ──
  console.log('\n── SARL gérant majoritaire 200k, marge 35% ──');
  var optSARL = trouverOptimal('SARL', function(p){ return F.simulerSARL(p); },
    {ca:200000, tauxMarge:0.35, capitalSocial:5000, nbAssocies:2, partAssocie:0.5, gerantMajoritaire:true});
  console.log('   Ratio optimal : ' + optSARL.ratio + '% salaire → net ' + fmt(optSARL.net) + '€');

  // ── COMPARATIF FINAL ──
  console.log('\n══════════════════════════════════════════════════');
  console.log('  COMPARATIF — CA 100k, marge 40%');
  console.log('══════════════════════════════════════════════════');
  console.log('  SASU       : ' + optSASU.ratio + '% sal → ' + fmt(optSASU.net) + '€ net');
  console.log('  EURL IS 1k : ' + optEURL1k.ratio + '% sal → ' + fmt(optEURL1k.net) + '€ net');
  console.log('  EURL IS 50k: ' + optEURL50k.ratio + '% sal → ' + fmt(optEURL50k.net) + '€ net');
  var eurlIR = F.simulerEI({ca:100000, tauxMarge:0.4});
  console.log('  EI / EURL IR : 100% → ' + fmt(eurlIR.revenuNetTotal) + '€ net');
  var micro = F.simulerMicroEntreprise({ca:83600, typeMicro:'BNC'});
  console.log('  MICRO BNC 83k: 100% → ' + fmt(micro.revenuNetTotal) + '€ net');
  console.log('══════════════════════════════════════════════════');
})();
