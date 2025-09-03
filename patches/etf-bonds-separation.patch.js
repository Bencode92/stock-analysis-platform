// ===== PATCH ETF-BONDS SEPARATION =====
// Applique ces modifications dans etf-script.js pour séparer ETFs et Bonds

// 1) REMPLACER la partie "Combiner et nettoyer" dans loadETFData() par:
/*
// Combiner et nettoyer (en taguant la source)
const etfsNorm = etfs
  .filter(row => row && Object.keys(row).length > 1)
  .map(r => normalizeETFData(r, 'etf'));

const bondsNorm = bonds
  .filter(row => row && Object.keys(row).length > 1)
  .map(r => normalizeETFData(r, 'bonds'));

etfsData.all = [...etfsNorm, ...bondsNorm];
etfsData.filtered = etfsData.all;
*/

// 2) REMPLACER normalizeETFData par:
function normalizeETFData(etf, source = 'etf') {
  const base = {
    ...etf,
    ticker: etf.ticker || etf.symbol || '-',
    name: etf.name || etf.objective?.slice(0, 60) || '-',

    // fallbacks dataset
    ter: parseFloat(etf.total_expense_ratio ?? etf.expense_ratio ?? etf.ter ?? 0),
    aum: parseFloat(etf.aum_usd ?? etf.aum ?? etf.net_assets ?? 0),
    price: parseFloat(etf.last_close ?? etf.last ?? etf.price ?? 0),

    return_1d: parseFloat(etf.daily_change_pct ?? etf.return_1d ?? etf.change ?? 0),
    return_ytd: parseFloat(etf.ytd_return_pct ?? etf.return_ytd ?? etf.ytd ?? 0),
    return_1y: parseFloat(etf.one_year_return_pct ?? etf.return_1y ?? etf.perf_1y ?? 0),
    return_3y: parseFloat(etf.return_3y ?? etf.perf_3y ?? 0),

    volatility: parseFloat(etf.vol_3y_pct ?? etf.volatility ?? etf.vol_1y ?? 0),
    sharpe_ratio: parseFloat(etf.sharpe_ratio ?? etf.sharpe ?? 0),
    dividend_yield: parseFloat(etf.yield_ttm ?? etf.dividend_yield ?? 0),

    etf_type: etf.etf_type || '',
    leverage: (etf.leverage !== '' && etf.leverage !== undefined) ? Number(etf.leverage) : null,

    // flag de provenance
    dataset: source
  };

  // Type logique : si la source est bonds → 'bonds', sinon typologie ETF
  return {
    ...base,
    type: source === 'bonds' ? 'bonds' : getETFType(base)
  };
}

// 3) DANS renderTopTenETFs() remplacer "Filtrer par type si nécessaire" par:
/*
// Filtrer par type si nécessaire
let data = etfsData.all;
if (topFilters.type === 'EQUITY') {
  data = data.filter(e => e.dataset === 'etf');
} else if (topFilters.type === 'BONDS') {
  data = data.filter(e => e.dataset === 'bonds');
} // GLOBAL = etf + bonds (on ne filtre pas)
*/

// 4) REMPLACER le début de filterETFs() par:
function filterETFs() {
  let filtered = etfsData.all;

  // Filtre par type (onglets du bas)
  const activeTab = document.querySelector('.region-tab.active');
  const filterType = activeTab?.dataset.type || 'all';

  if (filterType === 'equity') {
    filtered = filtered.filter(e => e.dataset === 'etf');
  } else if (filterType === 'bonds') {
    filtered = filtered.filter(e => e.dataset === 'bonds');
  } else if (filterType === 'sector' || filterType === 'geographic') {
    // seulement sur la partie ETFs
    filtered = filtered.filter(e => e.dataset === 'etf' && e.type === filterType);
  } // 'all' = tout

  // Filtre recherche
  if (etfsData.searchQuery) {
    const query = etfsData.searchQuery.toLowerCase();
    filtered = filtered.filter(etf =>
      String(etf.ticker).toLowerCase().includes(query) ||
      String(etf.name).toLowerCase().includes(query) ||
      String(etf.isin || '').toLowerCase().includes(query)
    );
  }

  // Tri par AUM décroissant
  filtered.sort((a, b) => b.aum - a.aum);
  return filtered;
}

// 5) REMPLACER getETFType par:
function getETFType(etf) {
  const name = String(etf.name || '').toLowerCase();
  const t = String(etf.type || '').toLowerCase();

  // plus de 'commodity'
  if (name.includes('sector') || t.includes('sector') || name.includes('technology') || name.includes('health'))
    return 'sector';
  if (name.includes('emerging') || name.includes('europe') || name.includes('asia'))
    return 'geographic';
  return 'equity'; // défaut côté ETFs
}

// 6) AJOUTER ces lignes pour masquer "Matières" dans l'UI:
// (à placer après DOMContentLoaded ou à la fin du script)
/*
document.querySelector('.tp-regions .seg-btn[data-type="COMMODITY"]')?.remove();
document.querySelector('.region-tab[data-type="commodity"]')?.remove();
document.querySelector('#etf-filter-type option[value="commodity"]')?.remove();
*/

// 7) GÉRER le label du scope avec mapping explicite:
/*
document.querySelectorAll('.tp-regions .seg-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tp-regions .seg-btn').forEach(b => b.setAttribute('aria-selected','false'));
    this.setAttribute('aria-selected','true');

    topFilters.type = this.dataset.type;

    const map = { GLOBAL: 'GLOBAL', EQUITY: 'ACTIONS', BONDS: 'OBLIGATIONS' };
    document.getElementById('top-scope-label').textContent = map[topFilters.type] || 'GLOBAL';

    renderTopTenETFs();
  });
});
*/
