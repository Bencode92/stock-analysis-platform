/* ETF Data Adapter - Unifie le format et expose un event "ready" */
(function () {
  if (window.ETFData?.getData) return; // déjà en place

  // Helper pour conversion numérique
  const num = (x) => {
    const v = +x; 
    return Number.isFinite(v) ? v : NaN;
  };

  // Mapper les données au format attendu par le module
  const mapRow = (r) => ({
    ticker: r.ticker || r.symbol || '',
    name: r.name || r.objective || r.symbol || '',
    isin: r.isin || '',
    fund_type: r.fund_type || '',
    etf_type: r.etf_type || '',
    leverage: r.leverage,
    aum_usd: num(r.aum_usd || r.aum),
    total_expense_ratio: num(r.total_expense_ratio || r.ter),
    yield_ttm: num(r.yield_ttm || r.dividend_yield),
    daily_change_pct: num(r.daily_change_pct || r.return_1d),
    ytd_return_pct: num(r.ytd_return_pct || r.return_ytd),
    one_year_return_pct: num(r.one_year_return_pct || r.return_1y),
    vol_3y_pct: num(r.vol_3y_pct || r.volatility),
    last_close: num(r.last_close || r.price),
    as_of: r.as_of || r.date || new Date().toISOString(),
    sector_top: r.sector_top || '',
    sector_top_weight: num(r.sector_top_weight),
    country_top: r.country_top || '',
    country_top_weight: num(r.country_top_weight),
    data_quality_score: num(r.data_quality_score || 90),
    // Champs originaux conservés
    ...r
  });

  let _data = [];
  let _originalData = null;

  window.ETFData = {
    // Récupérer les données
    getData: () => _data,
    
    // Récupérer les données originales (pour debug)
    getOriginalData: () => _originalData,
    
    // Définir de nouvelles données
    setData: (arr) => { 
      _originalData = arr;
      _data = (arr || []).map(mapRow); 
      document.dispatchEvent(new CustomEvent('ETFData:ready', { 
        detail: { count: _data.length } 
      }));
      console.log(`📊 ETF Data Adapter: ${_data.length} ETFs chargés`);
    },
    
    // Rafraîchir les données
    refresh: () => {
      if (_originalData) {
        window.ETFData.setData(_originalData);
      }
    },
    
    // Statistiques
    getStats: () => ({
      total: _data.length,
      equity: _data.filter(e => !/bond|fixed|government/i.test(e.fund_type)).length,
      bonds: _data.filter(e => /bond|fixed|government/i.test(e.fund_type)).length,
      leveraged: _data.filter(e => /leveraged|inverse/.test(e.etf_type) || (e.leverage && e.leverage !== 0)).length
    })
  };

  // Si etf-script.js a déjà chargé des données, on les reprend
  if (typeof window.ETFData_backup === 'object' && window.ETFData_backup.getData) {
    const existingData = window.ETFData_backup.getData();
    if (existingData && existingData.length > 0) {
      window.ETFData.setData(existingData);
    }
  }

  console.log('✅ ETF Data Adapter v1.0 initialisé');
})();
