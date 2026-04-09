// Test du ratio optimal salaire/dividendes
// var s=document.createElement('script');s.src='tests/test-ratio-optimal.js?'+Date.now();document.head.appendChild(s);

(function(){
  if (!window.FiscalUtils || !window.SimulationsFiscales) {
    console.error('FiscalUtils ou SimulationsFiscales non chargé');
    return;
  }

  var fmt = function(n){ return typeof n === 'number' ? n.toLocaleString('fr-FR') : '—'; };
  console.clear();
  console.log('══════════════════════════════════════════════════');
  console.log('  TEST RATIO OPTIMAL SALAIRE / DIVIDENDES');
  console.log('══════════════════════════════════════════════════');

  var results = [];

  // ── SASU 100k, marge 40% ──
  console.log('\n── SASU 100k, marge 40%, capital 1k ──');
  var optSASU = FiscalUtils.optimiserRatioRemuneration(
    {ca:100000, tauxMarge:0.4, capitalSocial:1000, ratioMin:0, ratioMax:1, favoriserDividendes:true},
    function(p){ return SimulationsFiscales.simulerSASU(p); }
  );
  console.log('   Ratio optimal : ' + Math.round(optSASU.ratio*100) + '% salaire');
  console.log('   Net optimal   : ' + fmt(optSASU.net) + '€');

  // Comparaison avec ratio fixe
  var r50 = SimulationsFiscales.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:1000});
  console.log('   Net à 50%     : ' + fmt(r50.revenuNetTotal) + '€');
  var gain = optSASU.net - r50.revenuNetTotal;
  console.log('   Gain optimal  : +' + fmt(gain) + '€/an vs 50% salaire');
  var ok1 = optSASU.ratio < 0.5 && gain > 0;
  results.push(ok1);
  console.log(ok1 ? '✅ SASU : ratio bas optimal (dividendes avantageux)' : '❌ Résultat inattendu');

  // ── EURL IS 100k, marge 40%, capital 1k ──
  console.log('\n── EURL IS 100k, marge 40%, capital 1k ──');
  var optEURL1k = FiscalUtils.optimiserRatioRemuneration(
    {ca:100000, tauxMarge:0.4, capitalSocial:1000, ratioMin:0, ratioMax:1, favoriserDividendes:false},
    function(p){ return SimulationsFiscales.simulerEURL(Object.assign({}, p, {optionIS:true})); }
  );
  console.log('   Ratio optimal : ' + Math.round(optEURL1k.ratio*100) + '% salaire');
  console.log('   Net optimal   : ' + fmt(optEURL1k.net) + '€');

  // ── EURL IS 100k, marge 40%, capital 50k ──
  console.log('\n── EURL IS 100k, marge 40%, capital 50k ──');
  var optEURL50k = FiscalUtils.optimiserRatioRemuneration(
    {ca:100000, tauxMarge:0.4, capitalSocial:50000, ratioMin:0, ratioMax:1, favoriserDividendes:false},
    function(p){ return SimulationsFiscales.simulerEURL(Object.assign({}, p, {optionIS:true})); }
  );
  console.log('   Ratio optimal : ' + Math.round(optEURL50k.ratio*100) + '% salaire');
  console.log('   Net optimal   : ' + fmt(optEURL50k.net) + '€');

  var ok2 = optEURL50k.ratio !== optEURL1k.ratio || optEURL50k.net !== optEURL1k.net;
  results.push(ok2);
  console.log(ok2 ? '✅ EURL IS : capital impacte le ratio optimal' : '⚠️ Capital sans impact sur le ratio');

  // ── SARL gérant majoritaire 200k ──
  console.log('\n── SARL gérant majoritaire 200k, marge 35% ──');
  var optSARL = FiscalUtils.optimiserRatioRemuneration(
    {ca:200000, tauxMarge:0.35, capitalSocial:5000, nbAssocies:2, partAssocie:0.5, gerantMajoritaire:true, ratioMin:0, ratioMax:1},
    function(p){ return SimulationsFiscales.simulerSARL(p); }
  );
  console.log('   Ratio optimal : ' + Math.round(optSARL.ratio*100) + '% salaire');
  console.log('   Net optimal   : ' + fmt(optSARL.net) + '€');
  var rSARL50 = SimulationsFiscales.simulerSARL({ca:200000, tauxMarge:0.35, tauxRemuneration:0.5, capitalSocial:5000, nbAssocies:2, partAssocie:0.5, gerantMajoritaire:true});
  var gainSARL = optSARL.net - rSARL50.revenuNetTotal;
  console.log('   Net à 50%     : ' + fmt(rSARL50.revenuNetTotal) + '€');
  console.log('   Gain optimal  : ' + (gainSARL >= 0 ? '+' : '') + fmt(gainSARL) + '€/an');
  results.push(gainSARL >= 0);
  console.log(gainSARL >= 0 ? '✅ SARL : ratio optimal >= ratio 50%' : '❌ Ratio 50% meilleur que l\'optimal');

  // ── Résumé ──
  console.log('\n── TABLEAU COMPARATIF RATIO OPTIMAL ──');
  console.log('   SASU      : ' + Math.round(optSASU.ratio*100) + '% sal → net ' + fmt(optSASU.net) + '€');
  console.log('   EURL cap1k: ' + Math.round(optEURL1k.ratio*100) + '% sal → net ' + fmt(optEURL1k.net) + '€');
  console.log('   EURL cap50k:' + Math.round(optEURL50k.ratio*100) + '% sal → net ' + fmt(optEURL50k.net) + '€');
  console.log('   SARL TNS  : ' + Math.round(optSARL.ratio*100) + '% sal → net ' + fmt(optSARL.net) + '€');

  var ok = results.filter(Boolean).length;
  console.log('\n══════════════════════════════════════════════════');
  console.log('  RÉSULTAT : ' + ok + '/' + results.length + ' ✅');
  console.log('══════════════════════════════════════════════════');
})();
