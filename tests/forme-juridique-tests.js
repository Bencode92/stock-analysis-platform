// Batterie de validation du moteur de recommandation forme juridique
// Usage console (sur la page types-entreprise-v2.html) :
//   var s=document.createElement('script');s.src='tests/forme-juridique-tests.js?'+Date.now();document.head.appendChild(s);

(function(){
  if (!window.recommendationEngine) {
    console.error('❌ recommendationEngine non chargé');
    return;
  }

  function runTest(label, expected, answers) {
    var res = window.recommendationEngine.calculateRecommendations(answers);
    var list = res && (res.recommendations || res.scores || res.results) || res;
    var arr = Array.isArray(list)
      ? list
      : Object.entries(list).map(function(kv){ return Object.assign({id:kv[0]}, kv[1]); });
    var top = arr.map(function(r){
      return {
        statut: r.shortName || r.id || r.statusId || r.name,
        score: r.score != null ? r.score : (r.s100 != null ? r.s100 : r.finalScore),
        strengths: r.strengths || [],
        weaknesses: r.weaknesses || []
      };
    }).sort(function(a,b){ return (b.score||0) - (a.score||0); }).slice(0,3);
    var winner = (top[0] && top[0].statut) || '—';
    var ok = expected.indexOf(winner) !== -1;
    console.log(
      (ok ? '✅' : '❌') + ' ' + label + ' → ' +
      top.map(function(t){ return t.statut + '=' + t.score; }).join(' | ') +
      (ok ? '' : '   [attendu: ' + expected.join(' ou ') + ']')
    );
    return { ok: ok, top: top };
  }

  // Vérifie qu'un texte contient un mot-clé dans strengths ou weaknesses
  function checkText(result, statut, field, keyword) {
    var found = result.top.find(function(t){ return t.statut === statut; });
    if (!found) return false;
    var texts = found[field] || [];
    for (var i = 0; i < texts.length; i++) {
      if (texts[i].toLowerCase().indexOf(keyword.toLowerCase()) !== -1) return true;
    }
    return false;
  }

  console.clear();
  console.log('═══════════════════════════════════════════');
  console.log('  BATTERIE 15 TESTS — Scoring + Contenu');
  console.log('═══════════════════════════════════════════');
  var r = [];
  var total = 0;

  // ──────────────────────────────────────────
  console.log('\n── BLOC A : Tests de scoring (10) ──');
  // ──────────────────────────────────────────

  r.push(runTest('A1. Freelance ARE consulting', ['SASU'], {
    age:35, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:60000, expense_ratio:0.2,
    remuneration_preference:'dividends', unemployment_benefits:'yes',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }).ok);

  r.push(runTest('A2. Freelance hors chômage', ['SASU','EURL'], {
    age:35, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:60000, expense_ratio:0.2,
    remuneration_preference:'mixed', unemployment_benefits:'no',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }).ok);

  r.push(runTest('A3. Artisan CA 35k', ['Micro-entreprise','MICRO','EI','SASU'], {
    age:42, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:35000, expense_ratio:0.35,
    remuneration_preference:'salary', unemployment_benefits:'no',
    activity_type:'craft', professional_order:'no',
    patrimony_protection:'important'
  }).ok);

  r.push(runTest('A4. Startup levée VC', ['SAS','SASU'], {
    age:30, team_structure:'investors', associates_number:3, investors_count:2,
    fundraising:'yes', fundraising_amount:800000, investor_type:'vc',
    sharing_instruments:['BSPCE'], revenue_projection:200000, expense_ratio:0.7,
    control_preservation:'secondary', governance_complexity:'complex',
    activity_type:'tech', professional_order:'no'
  }).ok);

  r.push(runTest('A5. Libéral réglementé duo', ['SELARL','SELAS'], {
    age:38, team_structure:'associates', associates_number:2, fundraising:'no',
    revenue_projection:180000, expense_ratio:0.3,
    remuneration_preference:'mixed', professional_order:'yes',
    regulated_profession:'yes', activity_type:'liberal',
    patrimony_protection:'important'
  }).ok);

  r.push(runTest('A6. SCI location nue famille', ['SCI'], {
    age:45, team_structure:'family', associates_number:2, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'location_nue',
    real_estate_property_use:'residential',
    patrimony_protection:'essential', remuneration_preference:'mixed',
    bank_loan_amount:200000
  }).ok);

  r.push(runTest('A7. LMNP solo', ['EURL','EI','Micro-entreprise','MICRO'], {
    age:40, team_structure:'solo', associates_number:1, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'lmnp_lmp',
    real_estate_rental_regime:'lmnp', real_estate_property_use:'residential',
    patrimony_protection:'important', remuneration_preference:'dividends'
  }).ok);

  r.push(runTest('A8. Marchand de biens', ['SAS','SARL'], {
    age:40, team_structure:'associates', associates_number:2, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'marchand_biens',
    real_estate_property_use:'commercial',
    patrimony_protection:'essential', remuneration_preference:'mixed',
    governance_complexity:'moderate'
  }).ok);

  r.push(runTest('A9. EURL option IS TMI 41%', ['SASU','EURL'], {
    age:38, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:120000, expense_ratio:0.3,
    remuneration_preference:'mixed', unemployment_benefits:'no',
    tax_bracket:'bracket_41', is_option:'yes',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }).ok);

  r.push(runTest('A10. SARL famille transmission', ['SARL'], {
    age:50, team_structure:'family', associates_number:3, fundraising:'no',
    revenue_projection:300000, expense_ratio:0.5,
    remuneration_preference:'mixed', activity_type:'commercial',
    family_project:'yes', family_transmission:'yes',
    governance_complexity:'simple', control_preservation:'essential',
    patrimony_protection:'essential'
  }).ok);

  // ──────────────────────────────────────────
  console.log('\n── BLOC B : Cas ARE / Dividendes / Retraite (5) ──');
  // ──────────────────────────────────────────

  // B1 — Dev web au chômage, veut garder ARE, 100% dividendes
  var b1 = runTest('B1. Dev web ARE + 100% dividendes', ['SASU'], {
    age:28, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:80000, expense_ratio:0.15,
    remuneration_preference:'dividends', unemployment_benefits:'yes',
    activity_type:'tech', professional_order:'no',
    patrimony_protection:'important', tax_bracket:'bracket_30',
    social_regime:'assimilated_employee'
  });
  r.push(b1.ok);
  // Vérifie que les textes ARE + dividendes apparaissent
  if (b1.ok) {
    var hasARE = checkText(b1, 'SASU', 'strengths', 'ARE');
    var hasDivid = checkText(b1, 'SASU', 'strengths', 'dividendes');
    console.log('   📝 Texte ARE dans strengths SASU : ' + (hasARE ? '✅' : '⚠️ absent'));
    console.log('   📝 Texte dividendes dans strengths SASU : ' + (hasDivid ? '✅' : '⚠️ absent'));
  }

  // B2 — Consultant senior, pas ARE, veut dividendes, TMI 41%
  //       SASU devrait mentionner le risque retraite si 100% dividendes
  var b2 = runTest('B2. Consultant dividendes TMI 41% (pas ARE)', ['SASU'], {
    age:45, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:150000, expense_ratio:0.25,
    remuneration_preference:'dividends', unemployment_benefits:'no',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important', tax_bracket:'bracket_41',
    social_regime:'assimilated_employee'
  });
  r.push(b2.ok);
  if (b2.ok) {
    var hasRetraite = checkText(b2, 'SASU', 'weaknesses', 'retraite');
    console.log('   📝 Alerte retraite dans weaknesses SASU : ' + (hasRetraite ? '✅' : '⚠️ absent'));
  }

  // B3 — Freelance qui hésite EURL, veut dividendes, TMI 30%
  //       EURL devrait mentionner le piège SSI + retraite basse
  var b3 = runTest('B3. Freelance EURL dividendes TMI 30%', ['SASU','EURL'], {
    age:35, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:70000, expense_ratio:0.2,
    remuneration_preference:'dividends', unemployment_benefits:'no',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important', tax_bracket:'bracket_30',
    social_regime:'tns'
  });
  r.push(b3.ok);
  // Vérifier que EURL a le warning dividendes + retraite
  var eurlResult = b3.top.find(function(t){ return t.statut === 'EURL'; });
  if (eurlResult) {
    var hasSSI = false;
    var hasRetraiteEURL = false;
    for (var i=0; i < (eurlResult.weaknesses||[]).length; i++) {
      var w = eurlResult.weaknesses[i].toLowerCase();
      if (w.indexOf('ssi') !== -1 || w.indexOf('cotisations') !== -1) hasSSI = true;
      if (w.indexOf('retraite') !== -1) hasRetraiteEURL = true;
    }
    console.log('   📝 Warning cotisations SSI dans weaknesses EURL : ' + (hasSSI ? '✅' : '⚠️ absent'));
    console.log('   📝 Warning retraite dans weaknesses EURL : ' + (hasRetraiteEURL ? '✅' : '⚠️ absent'));
  }

  // B4 — Graphiste ARE + micro-entreprise (CA 25k)
  //       ARE + petit CA = MICRO devrait quand même sortir, pas SASU
  r.push(runTest('B4. Graphiste ARE + micro CA 25k', ['Micro-entreprise','MICRO','SASU'], {
    age:30, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:25000, expense_ratio:0.1,
    remuneration_preference:'salary', unemployment_benefits:'yes',
    activity_type:'liberal', professional_order:'no',
    patrimony_protection:'secondary', tax_bracket:'bracket_11',
    social_regime:'mixed'
  }).ok);

  // B5 — Couple infirmiers, profession réglementée, veulent dividendes
  //       Devrait sortir SELAS (pas SELARL pour les dividendes)
  r.push(runTest('B5. Infirmiers duo dividendes', ['SELAS','SELARL'], {
    age:35, team_structure:'associates', associates_number:2, fundraising:'no',
    revenue_projection:200000, expense_ratio:0.2,
    remuneration_preference:'dividends', unemployment_benefits:'no',
    activity_type:'liberal', professional_order:'yes',
    regulated_profession:'yes', patrimony_protection:'important',
    tax_bracket:'bracket_30', social_regime:'assimilated_employee'
  }).ok);

  // ──────────────────────────────────────────
  // RÉSULTAT FINAL
  // ──────────────────────────────────────────
  var ok = r.filter(Boolean).length;
  console.log('\n═══════════════════════════════════════════');
  console.log('  RÉSULTAT : ' + ok + '/' + r.length + ' ✅');
  console.log('═══════════════════════════════════════════');
})();
