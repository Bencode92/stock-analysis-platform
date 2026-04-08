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
        score: r.score != null ? r.score : (r.s100 != null ? r.s100 : r.finalScore)
      };
    }).sort(function(a,b){ return (b.score||0) - (a.score||0); }).slice(0,3);
    var winner = (top[0] && top[0].statut) || '—';
    var ok = expected.indexOf(winner) !== -1;
    console.log(
      (ok ? '✅' : '❌') + ' ' + label + ' → ' +
      top.map(function(t){ return t.statut + '=' + t.score; }).join(' | ') +
      (ok ? '' : '   [attendu: ' + expected.join(' ou ') + ']')
    );
    return ok;
  }

  console.clear();
  console.log('═══ BATTERIE 10 TESTS ═══');
  var r = [];

  r.push(runTest('1. Freelance ARE consulting', ['SASU'], {
    age:35, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:60000, expense_ratio:0.2,
    remuneration_preference:'dividends', unemployment_benefits:'yes',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }));

  r.push(runTest('2. Freelance hors chômage', ['SASU','EURL'], {
    age:35, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:60000, expense_ratio:0.2,
    remuneration_preference:'mixed', unemployment_benefits:'no',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }));

  r.push(runTest('3. Artisan CA 35k', ['Micro-entreprise','MICRO','EI'], {
    age:42, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:35000, expense_ratio:0.35,
    remuneration_preference:'salary', unemployment_benefits:'no',
    activity_type:'craft', professional_order:'no',
    patrimony_protection:'important'
  }));

  r.push(runTest('4. Startup levée VC', ['SAS','SASU'], {
    age:30, team_structure:'investors', associates_number:3, investors_count:2,
    fundraising:'yes', fundraising_amount:800000, investor_type:'vc',
    sharing_instruments:['BSPCE'], revenue_projection:200000, expense_ratio:0.7,
    control_preservation:'secondary', governance_complexity:'complex',
    activity_type:'tech', professional_order:'no'
  }));

  r.push(runTest('5. Libéral réglementé duo', ['SELARL','SELAS'], {
    age:38, team_structure:'associates', associates_number:2, fundraising:'no',
    revenue_projection:180000, expense_ratio:0.3,
    remuneration_preference:'mixed', professional_order:'yes',
    regulated_profession:'yes', activity_type:'liberal',
    patrimony_protection:'important'
  }));

  r.push(runTest('6. SCI location nue famille', ['SCI'], {
    age:45, team_structure:'family', associates_number:2, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'location_nue',
    real_estate_property_use:'residential',
    patrimony_protection:'essential', remuneration_preference:'mixed',
    bank_loan_amount:200000
  }));

  r.push(runTest('7. LMNP solo', ['EURL','EI','Micro-entreprise','MICRO'], {
    age:40, team_structure:'solo', associates_number:1, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'lmnp_lmp',
    real_estate_rental_regime:'lmnp', real_estate_property_use:'residential',
    patrimony_protection:'important', remuneration_preference:'dividends'
  }));

  r.push(runTest('8. Marchand de biens', ['SAS','SARL'], {
    age:40, team_structure:'associates', associates_number:2, fundraising:'no',
    activity_type:'immobilier', real_estate_activity:'marchand_biens',
    real_estate_property_use:'commercial',
    patrimony_protection:'essential', remuneration_preference:'mixed',
    governance_complexity:'moderate'
  }));

  r.push(runTest('9. EURL option IS TMI 41%', ['SASU','EURL'], {
    age:38, team_structure:'solo', associates_number:1, fundraising:'no',
    revenue_projection:120000, expense_ratio:0.3,
    remuneration_preference:'mixed', unemployment_benefits:'no',
    tax_bracket:'bracket_41', is_option:'yes',
    activity_type:'consulting', professional_order:'no',
    patrimony_protection:'important'
  }));

  r.push(runTest('10. SARL famille transmission', ['SARL'], {
    age:50, team_structure:'family', associates_number:3, fundraising:'no',
    revenue_projection:300000, expense_ratio:0.5,
    remuneration_preference:'mixed', activity_type:'commercial',
    family_project:'yes', family_transmission:'yes',
    governance_complexity:'simple', control_preservation:'essential',
    patrimony_protection:'essential'
  }));

  var ok = r.filter(Boolean).length;
  console.log('═══ ' + ok + '/10 ✅ ═══');
})();
