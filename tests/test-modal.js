(function(){
  var a = {};
  a.projected_revenue = '80000';
  a.gross_margin = '40';
  a.associates_number = '1';
  a.capital_percentage = '100';
  a.available_capital = '1000';
  a.remuneration_preference = 'dividends';
  a.activity_type = 'consulting';
  a.unemployment_benefits = 'yes';
  window.userResponses = a;

  var q = {};
  q.age = 35;
  q.team_structure = 'solo';
  q.associates_number = 1;
  q.fundraising = 'no';
  q.revenue_projection = 80000;
  q.expense_ratio = 0.2;
  q.remuneration_preference = 'dividends';
  q.unemployment_benefits = 'yes';
  q.activity_type = 'consulting';
  q.professional_order = 'no';
  q.patrimony_protection = 'important';

  var res = window.recommendationEngine.calculateRecommendations(q);
  console.log('Top:', res[0].shortName, '=', res[0].score);
  window.recommendationEngine.showStatusDetails(res[0]);
})();
