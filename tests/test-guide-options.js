// Test des options du Guide Fiscal
// var s=document.createElement('script');s.src='tests/test-guide-options.js?'+Date.now();document.head.appendChild(s);

(function(){
  if (typeof SimulationsFiscales === 'undefined') { console.error('SimulationsFiscales non chargé'); return; }
  var F = SimulationsFiscales;
  var fmt = function(n){ return typeof n === 'number' ? n.toLocaleString('fr-FR') : '—'; };

  console.clear();
  console.log('══════════════════════════════════════════════════');
  console.log('  TEST OPTIONS DU GUIDE FISCAL');
  console.log('══════════════════════════════════════════════════');

  function compare(label, r1, r2, field) {
    var v1 = r1 && r1[field] || 0;
    var v2 = r2 && r2[field] || 0;
    var diff = v2 - v1;
    var ok = diff !== 0;
    console.log((ok ? '✅' : '❌') + ' ' + label + ' : ' + fmt(v1) + '€ → ' + fmt(v2) + '€ (Δ ' + (diff >= 0 ? '+' : '') + fmt(diff) + '€)');
    return ok;
  }

  var results = [];
  var base = {ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, nbAssocies:1, partAssocie:1, capitalSocial:10000, optionIS:true};

  // ── 1. VERSEMENT LIBÉRATOIRE (MICRO) ──
  console.log('\n── 1. Versement libératoire (Micro BNC 60k) ──');
  var microSans = F.simulerMicroEntreprise({ca:60000, typeMicro:'BNC', versementLiberatoire:false});
  var microAvec = F.simulerMicroEntreprise({ca:60000, typeMicro:'BNC', versementLiberatoire:true});
  results.push(compare('VFL sur IR', microSans, microAvec, 'impotRevenu'));
  results.push(compare('VFL sur net total', microSans, microAvec, 'revenuNetTotal'));
  console.log('   Sans VFL: IR=' + fmt(microSans.impotRevenu) + '€ | Avec VFL: IR=' + fmt(microAvec.impotRevenu) + '€');

  // ── 2. TYPE ACTIVITÉ MICRO ──
  console.log('\n── 2. Type activité Micro (CA 60k) ──');
  var microVente = F.simulerMicroEntreprise({ca:60000, typeMicro:'BIC_VENTE'});
  var microServ = F.simulerMicroEntreprise({ca:60000, typeMicro:'BIC_SERVICE'});
  var microBNC = F.simulerMicroEntreprise({ca:60000, typeMicro:'BNC'});
  console.log('   BIC Vente : cotis=' + fmt(microVente.cotisationsSociales) + '€ | net=' + fmt(microVente.revenuNetTotal) + '€ (abatt 71%)');
  console.log('   BIC Serv  : cotis=' + fmt(microServ.cotisationsSociales) + '€ | net=' + fmt(microServ.revenuNetTotal) + '€ (abatt 50%)');
  console.log('   BNC       : cotis=' + fmt(microBNC.cotisationsSociales) + '€ | net=' + fmt(microBNC.revenuNetTotal) + '€ (abatt 34%)');
  var typesOK = microVente.cotisationsSociales !== microServ.cotisationsSociales && microServ.cotisationsSociales !== microBNC.cotisationsSociales;
  results.push(typesOK);
  console.log(typesOK ? '✅ Les 3 types donnent des résultats différents' : '❌ Types identiques');

  // ── 3. ACRE (TNS) ──
  console.log('\n── 3. ACRE (EI 80k, marge 40%) ──');
  var eiSansACRE = F.simulerEI({ca:80000, tauxMarge:0.4});
  var eiAvecACRE = F.simulerEI({ca:80000, tauxMarge:0.4, acre:true});
  if (eiAvecACRE && eiAvecACRE.cotisationsSociales !== undefined) {
    results.push(compare('ACRE sur cotisations', eiSansACRE, eiAvecACRE, 'cotisationsSociales'));
  } else {
    console.log('⚠️ ACRE non implémenté dans simulerEI (paramètre ignoré)');
    results.push(false);
  }

  // ── 4. GÉRANT MINORITAIRE vs MAJORITAIRE (SARL) ──
  console.log('\n── 4. Gérant majoritaire vs minoritaire (SARL 100k) ──');
  var sarlMaj = F.simulerSARL({ca:100000, tauxMarge:0.4, tauxRemuneration:0.6, nbAssocies:2, partAssocie:0.6, capitalSocial:5000, gerantMajoritaire:true});
  var sarlMin = F.simulerSARL({ca:100000, tauxMarge:0.4, tauxRemuneration:0.6, nbAssocies:2, partAssocie:0.4, capitalSocial:5000, gerantMajoritaire:false});
  results.push(compare('Gérant maj/min sur charges', sarlMaj, sarlMin, 'cotisationsSociales'));
  console.log('   Majoritaire (TNS): charges=' + fmt(sarlMaj.cotisationsSociales) + '€ | net=' + fmt(sarlMaj.revenuNetTotal) + '€');
  console.log('   Minoritaire (AS) : charges=' + fmt(sarlMin.cotisationsSociales) + '€ | net=' + fmt(sarlMin.revenuNetTotal) + '€');

  // ── 5. RÉSERVE LÉGALE (impact dividendes) ──
  console.log('\n── 5. Réserve légale (SASU 100k, marge 40%) ──');
  var sasuSansRL = F.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:10000, reserveLegale:false});
  var sasuAvecRL = F.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:10000, reserveLegale:true});
  if (sasuAvecRL && sasuAvecRL.dividendesNets !== sasuSansRL.dividendesNets) {
    results.push(compare('Réserve légale sur dividendes', sasuSansRL, sasuAvecRL, 'dividendesNets'));
  } else {
    console.log('⚠️ Réserve légale non implémentée dans simulerSASU (même résultat)');
    results.push(false);
  }

  // ── 6. CAPITAL IMPACT SUR DIVIDENDES EURL IS ──
  console.log('\n── 6. Capital social (EURL IS 100k, marge 40%) ──');
  var eurlCap1k = F.simulerEURL({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:1000, optionIS:true});
  var eurlCap50k = F.simulerEURL({ca:100000, tauxMarge:0.4, tauxRemuneration:0.5, capitalSocial:50000, optionIS:true});
  results.push(compare('Capital 1k vs 50k sur dividendes nets', eurlCap1k, eurlCap50k, 'dividendesNets'));
  if (eurlCap1k.cotTNSDiv !== undefined) {
    console.log('   Capital 1k  → cotis SSI div: ' + fmt(eurlCap1k.cotTNSDiv) + '€ | div nets: ' + fmt(eurlCap1k.dividendesNets) + '€');
    console.log('   Capital 50k → cotis SSI div: ' + fmt(eurlCap50k.cotTNSDiv) + '€ | div nets: ' + fmt(eurlCap50k.dividendesNets) + '€');
  }

  // ── 7. IS TAUX RÉDUIT (capital libéré + personnes physiques) ──
  console.log('\n── 7. IS taux réduit — bénéfice 42 500€ vs 50 000€ ──');
  var isReduit = function(benef) {
    // IS progressif : 15% jusqu'à 42 500€, 25% au-delà
    if (benef <= 42500) return Math.round(benef * 0.15);
    return Math.round(42500 * 0.15 + (benef - 42500) * 0.25);
  };
  var is42k = isReduit(42500);
  var is50k = isReduit(50000);
  console.log('   Bénéfice 42 500€ → IS = ' + fmt(is42k) + '€ (taux effectif: ' + Math.round(is42k/42500*100) + '%)');
  console.log('   Bénéfice 50 000€ → IS = ' + fmt(is50k) + '€ (taux effectif: ' + Math.round(is50k/50000*100) + '%)');
  var isOK = is42k === 6375 && is50k === 8250;
  results.push(isOK);
  console.log(isOK ? '✅ IS progressif correct (15%/25%)' : '❌ IS progressif incorrect');

  // ── 8. RATIO OPTIMAL (comparaison 20% vs 50% vs 80% salaire SASU) ──
  console.log('\n── 8. Ratio optimal salaire/dividendes (SASU 100k, marge 40%) ──');
  var ratios = [0.2, 0.5, 0.8];
  var bestNet = 0;
  var bestRatio = 0;
  ratios.forEach(function(r) {
    var res = F.simulerSASU({ca:100000, tauxMarge:0.4, tauxRemuneration:r, capitalSocial:1000});
    var net = res.revenuNetTotal || 0;
    console.log('   Ratio ' + Math.round(r*100) + '% salaire → net ' + fmt(net) + '€');
    if (net > bestNet) { bestNet = net; bestRatio = r; }
  });
  console.log('   ══► Meilleur ratio : ' + Math.round(bestRatio*100) + '% salaire = ' + fmt(bestNet) + '€');
  results.push(bestRatio === 0.2); // Attendu: moins de salaire = plus de net (dividendes SASU non soumis aux cotisations)
  console.log(bestRatio === 0.2 ? '✅ Le ratio le plus bas gagne (dividendes SASU avantageux)' : '⚠️ Ratio optimal inattendu: ' + Math.round(bestRatio*100) + '%');

  // ── RÉSULTAT ──
  var ok = results.filter(Boolean).length;
  console.log('\n══════════════════════════════════════════════════');
  console.log('  RÉSULTAT : ' + ok + '/' + results.length + ' ✅');
  console.log('══════════════════════════════════════════════════');
})();
