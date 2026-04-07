/**
 * Sector Comparator
 * ------------------
 * Compare deux secteurs côte à côte : top 10 holdings (rangés par poids ETF)
 * enrichis avec les données perf + quality issues de stocks_us/europe/asia.json.
 *
 * Auto-init si #sector-comparator est présent dans la page.
 */
(function () {
  'use strict';

  const STOCK_FILES = [
    'data/stocks_us.json',
    'data/stocks_europe.json',
    'data/stocks_asia.json',
  ];

  const state = {
    sectors: null,         // [{ key, label, region, symbol, sectorObj }]
    holdings: null,        // etf_holdings.json
    stockIndex: null,      // Map: lookup key -> stock
    loading: null,         // promise of full bootstrap
  };

  // ---------- Loaders ----------

  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  }

  async function bootstrap() {
    if (state.loading) return state.loading;
    state.loading = (async () => {
      const [sectorsRaw, holdingsRaw, ...stockSets] = await Promise.all([
        fetchJSON('data/sectors.json'),
        fetchJSON('data/etf_holdings.json'),
        ...STOCK_FILES.map(f => fetchJSON(f).catch(e => {
          console.warn('[comparator]', f, e);
          return null;
        })),
      ]);

      state.holdings = holdingsRaw;
      state.sectors = flattenSectors(sectorsRaw);
      state.stockIndex = buildStockIndex(stockSets.filter(Boolean));
      return state;
    })();
    return state.loading;
  }

  function flattenSectors(sectorsRaw) {
    const out = [];
    const groups = sectorsRaw?.sectors || {};
    Object.keys(groups).forEach(cat => {
      (groups[cat] || []).forEach(s => {
        if (!s || !s.symbol) return;
        const label = s.display_fr || s.indexName || s.name || s.symbol;
        out.push({
          key: `${cat}::${s.symbol}`,
          label,
          region: s.region || '',
          symbol: s.symbol,
          category: cat,
          sectorObj: s,
        });
      });
    });
    out.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return out;
  }

  // ---------- Stock matching ----------

  function normalizeName(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[.,'’()\-]/g, ' ')
      .replace(/\b(the|corp|corporation|inc|incorporated|company|co|ltd|limited|plc|sa|ag|nv|se|ab|oyj|holdings?|group|tr|trust|class\s*[abc])\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripSuffix(sym) {
    if (!sym) return '';
    return String(sym).split('.')[0].toUpperCase();
  }

  function buildStockIndex(stockSets) {
    const idx = new Map();
    const add = (k, v) => { if (k && !idx.has(k)) idx.set(k, v); };

    stockSets.forEach(set => {
      (set?.stocks || []).forEach(stk => {
        add(`T:${(stk.ticker || '').toUpperCase()}`, stk);
        add(`T:${stripSuffix(stk.ticker)}`, stk);
        if (stk.resolved_symbol) {
          add(`T:${stk.resolved_symbol.toUpperCase()}`, stk);
          add(`T:${stripSuffix(stk.resolved_symbol)}`, stk);
        }
        const n1 = normalizeName(stk.name);
        const n2 = normalizeName(stk.name_api);
        if (n1) add(`N:${n1}`, stk);
        if (n2) add(`N:${n2}`, stk);
      });
    });
    return idx;
  }

  function matchStock(holding) {
    if (!state.stockIndex) return null;
    const tries = [];
    if (holding.symbol) {
      tries.push(`T:${holding.symbol.toUpperCase()}`);
      tries.push(`T:${stripSuffix(holding.symbol)}`);
    }
    const n = normalizeName(holding.name);
    if (n) tries.push(`N:${n}`);
    for (const k of tries) {
      const s = state.stockIndex.get(k);
      if (s) return s;
    }
    return null;
  }

  // ---------- Compute ----------

  function getHoldings(symbol) {
    const e = state.holdings?.etfs?.[symbol];
    if (!e || !Array.isArray(e.holdings)) return [];
    return [...e.holdings]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 10);
  }

  function buildRows(symbol) {
    return getHoldings(symbol).map((h, idx) => {
      const stock = matchStock(h);
      return { rank: idx + 1, holding: h, stock };
    });
  }

  function weightedAvg(rows, getter) {
    let sum = 0, w = 0;
    rows.forEach(r => {
      const v = getter(r);
      const wt = r.holding.weight || 0;
      if (v != null && Number.isFinite(v) && wt > 0) {
        sum += v * wt; w += wt;
      }
    });
    return w > 0 ? sum / w : null;
  }

  function median(rows, getter) {
    const vals = rows.map(getter).filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }

  function computeAggregates(rows) {
    const matched = rows.filter(r => r.stock);
    return {
      coverage: matched.length,
      total: rows.length,
      perf_ytd: weightedAvg(matched, r => r.stock.perf_ytd),
      perf_1y: weightedAvg(matched, r => r.stock.perf_1y),
      perf_3y: weightedAvg(matched, r => r.stock.perf_3y),
      quality: weightedAvg(matched, r => r.stock.quality_score),
      buffett: weightedAvg(matched, r => r.stock.buffett_score),
      roe: median(matched, r => r.stock.roe),
      roic: median(matched, r => r.stock.roic),
      net_margin: median(matched, r => r.stock.net_margin),
      fcf_yield: median(matched, r => r.stock.fcf_yield),
      vol_3y: weightedAvg(matched, r => r.stock.volatility_3y),
      max_dd_3y: weightedAvg(matched, r => r.stock.max_drawdown_3y),
      beta: weightedAvg(matched, r => r.stock.beta),
    };
  }

  // ---------- Render ----------

  const fmtPct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtNum = (v, d = 1) => v == null ? '—' : v.toFixed(d);
  const fmtScore = v => v == null ? '—' : Math.round(v).toString();
  const cls = v => v == null ? '' : (v >= 0 ? 'positive' : 'negative');

  // Heatmap cell background — green for high/positive, red for low/negative.
  // `min`/`max` define the value range mapped to full color intensity.
  function heat(v, min, max) {
    if (v == null || !Number.isFinite(v)) return '';
    const mid = (min + max) / 2;
    const half = (max - min) / 2 || 1;
    const t = Math.max(-1, Math.min(1, (v - mid) / half));
    const a = Math.abs(t) * 0.32;
    const rgb = t >= 0 ? '0,255,135' : '255,107,107';
    return `background:rgba(${rgb},${a.toFixed(3)})`;
  }

  function renderRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="9" class="text-center py-4 opacity-60">Aucun holding disponible</td></tr>`;
    }
    return rows.map(r => {
      const s = r.stock || {};
      const name = (r.holding.name || s.name || '—');
      const tic = r.holding.symbol || s.ticker || '';
      const w = r.holding.weight != null ? (r.holding.weight * 100).toFixed(2) + '%' : '—';
      const flag = r.stock ? '' : '<span title="Pas de match" style="opacity:.4">∅</span>';
      return `
        <tr>
          <td class="sc-rank">${r.rank}</td>
          <td class="sc-name-cell">
            <div class="sc-name" title="${name}">${name} ${flag}</div>
            <div class="sc-tic">${tic}${s.country ? ' • ' + s.country : ''}</div>
          </td>
          <td class="sc-w">${w}</td>
          <td class="sc-heat ${cls(s.perf_ytd)}" style="${heat(s.perf_ytd, -20, 20)}">${fmtPct(s.perf_ytd)}</td>
          <td class="sc-heat ${cls(s.perf_1y)}" style="${heat(s.perf_1y, -20, 40)}">${fmtPct(s.perf_1y)}</td>
          <td class="sc-heat" style="${heat(s.quality_score, 30, 85)}">${fmtScore(s.quality_score)}${s.quality_grade ? ` <span class="sc-grade">${s.quality_grade}</span>` : ''}</td>
          <td class="sc-heat" style="${heat(s.buffett_score, 20, 80)}">${fmtScore(s.buffett_score)}</td>
          <td class="sc-heat" style="${heat(s.roe, 0, 30)}">${fmtNum(s.roe)}${s.roe != null ? '%' : ''}</td>
          <td class="sc-heat" style="${heat(s.roic, 0, 25)}">${fmtNum(s.roic)}${s.roic != null ? '%' : ''}</td>
        </tr>`;
    }).join('');
  }

  function renderAggregates(agg) {
    const cell = (label, val, tone) => `
      <div class="sc-agg-cell">
        <div class="sc-agg-label">${label}</div>
        <div class="sc-agg-val ${tone || ''}">${val}</div>
      </div>`;
    return `
      <div class="sc-agg-grid">
        ${cell('Perf YTD (pondérée)', fmtPct(agg.perf_ytd), cls(agg.perf_ytd))}
        ${cell('Perf 1Y (pondérée)', fmtPct(agg.perf_1y), cls(agg.perf_1y))}
        ${cell('Perf 3Y (pondérée)', fmtPct(agg.perf_3y), cls(agg.perf_3y))}
        ${cell('Quality (pondéré)', fmtScore(agg.quality))}
        ${cell('Buffett (pondéré)', fmtScore(agg.buffett))}
        ${cell('ROE médian', agg.roe == null ? '—' : agg.roe.toFixed(1) + '%')}
        ${cell('ROIC médian', agg.roic == null ? '—' : agg.roic.toFixed(1) + '%')}
        ${cell('Net margin médiane', agg.net_margin == null ? '—' : agg.net_margin.toFixed(1) + '%')}
        ${cell('FCF yield médian', agg.fcf_yield == null ? '—' : agg.fcf_yield.toFixed(1) + '%')}
        ${cell('Vol 3Y (pondérée)', agg.vol_3y == null ? '—' : agg.vol_3y.toFixed(1) + '%')}
        ${cell('Max DD 3Y (pondéré)', fmtPct(agg.max_dd_3y), cls(agg.max_dd_3y))}
        ${cell('Couverture stocks', `${agg.coverage}/${agg.total}`)}
      </div>`;
  }

  function renderPanel(side, sector) {
    const rows = buildRows(sector.symbol);
    const agg = computeAggregates(rows);
    return `
      <div class="sc-panel">
        <div class="sc-panel-head">
          <div class="sc-panel-title">${sector.label}</div>
          <div class="sc-panel-sub">${sector.region} • ETF ${sector.symbol}</div>
        </div>
        <div class="sc-table-wrap">
          <table class="sc-table">
            <thead>
              <tr>
                <th>#</th><th>Société</th><th>Poids</th>
                <th>YTD</th><th>1Y</th>
                <th>Quality</th><th>Buffett</th>
                <th>ROE</th><th>ROIC</th>
              </tr>
            </thead>
            <tbody>${renderRows(rows)}</tbody>
          </table>
        </div>
        ${renderAggregates(agg)}
      </div>`;
  }

  function renderComparison(rootEl, leftKey, rightKey) {
    const left = state.sectors.find(s => s.key === leftKey);
    const right = state.sectors.find(s => s.key === rightKey);
    if (!left || !right) {
      rootEl.innerHTML = '<div class="opacity-60 py-6 text-center">Sélectionne deux secteurs.</div>';
      return;
    }
    rootEl.innerHTML = `
      <div class="sc-grid">
        ${renderPanel('left', left)}
        ${renderPanel('right', right)}
      </div>`;
  }

  // ---------- UI wire-up ----------

  function injectStyles() {
    if (document.getElementById('sc-styles')) return;
    const css = `
      #sector-comparator { margin: 2.5rem auto; max-width: 1400px; }
      #sector-comparator .section-title { text-align: center; }
      .sc-controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: center; margin-bottom: 1.25rem; }
      .sc-controls select { background: rgba(255,255,255,.06); color: inherit; border: 1px solid rgba(255,255,255,.15); border-radius: .5rem; padding: .55rem .85rem; min-width: 280px; font-size: .9rem; }
      .sc-controls button { background: var(--accent-color, #00ff87); color: #001; font-weight: 700; border: 0; border-radius: .5rem; padding: .6rem 1.2rem; cursor: pointer; }
      .sc-controls button:hover { filter: brightness(1.1); }
      .sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
      @media (max-width: 1000px) { .sc-grid { grid-template-columns: 1fr; } }
      .sc-panel { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09); border-radius: .9rem; padding: 1.1rem 1.1rem 1rem; }
      .sc-panel-head { margin-bottom: .9rem; padding-bottom: .75rem; border-bottom: 1px solid rgba(255,255,255,.07); }
      .sc-panel-title { font-weight: 700; font-size: 1.1rem; letter-spacing: .01em; }
      .sc-panel-sub { font-size: .78rem; opacity: .55; margin-top: 2px; }
      .sc-table-wrap { overflow-x: auto; }
      .sc-table { width: 100%; border-collapse: separate; border-spacing: 0 2px; font-size: .85rem; table-layout: fixed; }
      .sc-table th, .sc-table td { text-align: right; padding: .5rem .45rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .sc-table th { font-weight: 500; opacity: .55; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; padding-bottom: .45rem; }
      .sc-table tbody tr { background: rgba(255,255,255,.015); }
      .sc-table tbody tr:hover { background: rgba(255,255,255,.05); }
      .sc-table tbody td:first-child { border-radius: .35rem 0 0 .35rem; }
      .sc-table tbody td:last-child  { border-radius: 0 .35rem .35rem 0; }
      .sc-table th:nth-child(1), .sc-table td:nth-child(1) { width: 26px; text-align: center; }
      .sc-table th:nth-child(2), .sc-table td:nth-child(2) { text-align: left; width: auto; }
      .sc-table th:nth-child(3), .sc-table td:nth-child(3) { width: 56px; }
      .sc-table th:nth-child(n+4), .sc-table td:nth-child(n+4) { width: 64px; }
      .sc-rank { opacity: .35; font-weight: 600; }
      .sc-name-cell { overflow: hidden; }
      .sc-name { font-weight: 600; font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
      .sc-tic { font-size: .68rem; opacity: .5; margin-top: 1px; }
      .sc-w { color: #fff; opacity: .85; font-weight: 600; }
      .sc-heat { border-radius: .3rem; font-weight: 600; }
      .sc-grade { font-size: .62rem; padding: 1px 5px; border-radius: 4px; background: rgba(0,255,135,.18); color: #00ff87; margin-left: 3px; vertical-align: middle; }
      .positive { color: #00ff87; }
      .negative { color: #ff6b6b; }
      .sc-agg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .45rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08); }
      @media (max-width: 700px) { .sc-agg-grid { grid-template-columns: repeat(2, 1fr); } }
      .sc-agg-cell { background: rgba(255,255,255,.04); border-radius: .5rem; padding: .55rem .6rem; }
      .sc-agg-label { font-size: .6rem; opacity: .55; text-transform: uppercase; letter-spacing: .04em; }
      .sc-agg-val { font-size: 1.02rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 3px; }
    `;
    const tag = document.createElement('style');
    tag.id = 'sc-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function buildSelect(el, defaultIdx) {
    el.innerHTML = state.sectors
      .map((s, i) => `<option value="${s.key}" ${i === defaultIdx ? 'selected' : ''}>${s.label} (${s.region || '—'})</option>`)
      .join('');
  }

  async function init() {
    const root = document.getElementById('sector-comparator');
    if (!root) return;
    injectStyles();
    root.innerHTML = `
      <h2 class="section-title">Comparateur de secteurs</h2>
      <div class="sc-controls">
        <select id="sc-left"></select>
        <span>vs</span>
        <select id="sc-right"></select>
        <button id="sc-run" type="button">Comparer</button>
        <span id="sc-status" class="opacity-60 text-sm"></span>
      </div>
      <div id="sc-result"></div>`;

    const status = root.querySelector('#sc-status');
    status.textContent = 'Chargement…';
    try {
      await bootstrap();
    } catch (e) {
      status.textContent = 'Erreur de chargement';
      console.error('[sector-comparator]', e);
      return;
    }
    status.textContent = `${state.sectors.length} secteurs · ${state.stockIndex.size} clés stocks`;

    const leftSel = root.querySelector('#sc-left');
    const rightSel = root.querySelector('#sc-right');
    buildSelect(leftSel, 0);
    buildSelect(rightSel, Math.min(1, state.sectors.length - 1));

    const result = root.querySelector('#sc-result');
    const run = () => renderComparison(result, leftSel.value, rightSel.value);
    root.querySelector('#sc-run').addEventListener('click', run);
    leftSel.addEventListener('change', run);
    rightSel.addEventListener('change', run);
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
