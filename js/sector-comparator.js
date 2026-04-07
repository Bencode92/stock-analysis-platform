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
        // shortLabel = la partie après "—" (ex: "Technologie") sinon sector_fr
        const shortLabel = s.sector_fr
          || (label.includes('—') ? label.split('—').pop().trim() : label);
        const family = s.indexFamily || s.indexName || (s.region === 'Europe' ? 'Europe' : 'US');
        out.push({
          key: `${cat}::${s.symbol}`,
          label,
          shortLabel,
          family,
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
          <td class="sc-heat sc-q" style="${heat(s.quality_score, 30, 85)}">${fmtScore(s.quality_score)}${s.quality_grade ? ` <span class="sc-grade">${s.quality_grade}</span>` : ''}</td>
          <td class="sc-num">${fmtScore(s.buffett_score)}</td>
          <td class="sc-num">${fmtNum(s.roe)}${s.roe != null ? '%' : ''}</td>
          <td class="sc-num">${fmtNum(s.roic)}${s.roic != null ? '%' : ''}</td>
        </tr>`;
    }).join('');
  }

  // Liste ordonnée des métriques agrégées + sens (1 = higher wins, -1 = lower wins, 0 = neutre)
  const AGG_METRICS = [
    { key: 'perf_ytd',  label: 'Perf YTD (pondérée)',  dir: 1,  fmt: v => fmtPct(v) },
    { key: 'perf_1y',   label: 'Perf 1Y (pondérée)',   dir: 1,  fmt: v => fmtPct(v) },
    { key: 'perf_3y',   label: 'Perf 3Y (pondérée)',   dir: 1,  fmt: v => fmtPct(v) },
    { key: 'quality',   label: 'Quality (pondéré)',    dir: 1,  fmt: v => fmtScore(v) },
    { key: 'buffett',   label: 'Buffett (pondéré)',    dir: 1,  fmt: v => fmtScore(v) },
    { key: 'roe',       label: 'ROE médian',           dir: 1,  fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'roic',      label: 'ROIC médian',          dir: 1,  fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'net_margin',label: 'Net margin médiane',   dir: 1,  fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'fcf_yield', label: 'FCF yield médian',     dir: 1,  fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'vol_3y',    label: 'Vol 3Y (pondérée)',    dir: -1, fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'max_dd_3y', label: 'Max DD 3Y (pondéré)',  dir: 1,  fmt: v => fmtPct(v) }, // moins négatif = mieux
    { key: 'coverage',  label: 'Couverture stocks',    dir: 0,  fmt: (_, agg) => `${agg.coverage}/${agg.total}` },
  ];

  function compareAggregates(aggL, aggR) {
    const result = { left: {}, right: {}, leftWins: 0, rightWins: 0 };
    AGG_METRICS.forEach(m => {
      if (m.dir === 0) { result.left[m.key] = result.right[m.key] = 'neutral'; return; }
      const vL = aggL[m.key], vR = aggR[m.key];
      if (vL == null || vR == null || !Number.isFinite(vL) || !Number.isFinite(vR)) {
        result.left[m.key] = result.right[m.key] = 'neutral';
        return;
      }
      if (vL === vR) {
        result.left[m.key] = result.right[m.key] = 'tie';
        return;
      }
      const leftBetter = (m.dir === 1 ? vL > vR : vL < vR);
      result.left[m.key]  = leftBetter ? 'win' : 'lose';
      result.right[m.key] = leftBetter ? 'lose' : 'win';
      if (leftBetter) result.leftWins++; else result.rightWins++;
    });
    return result;
  }

  function renderAggregates(agg, comparison, side) {
    return `
      <div class="sc-agg-grid">
        ${AGG_METRICS.map(m => {
          const tone = comparison[side][m.key]; // 'win' | 'lose' | 'tie' | 'neutral'
          const val = m.fmt(agg[m.key], agg);
          return `
            <div class="sc-agg-cell sc-${tone}">
              <div class="sc-agg-label">${m.label}</div>
              <div class="sc-agg-val">${val}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderPanel(side, sector, agg, comparison) {
    const rows = buildRows(sector.symbol);
    const wins = comparison[`${side}Wins`];
    return `
      <div class="sc-panel">
        <div class="sc-panel-head">
          <div class="sc-panel-title">${sector.label}</div>
          <div class="sc-panel-sub">${sector.region} • ETF ${sector.symbol}</div>
          <div class="sc-panel-score">
            <span class="sc-score-num">${wins}</span>
            <span class="sc-score-lbl">victoire${wins > 1 ? 's' : ''} sur ${comparison.leftWins + comparison.rightWins} critères</span>
          </div>
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
        ${renderAggregates(agg, comparison, side)}
      </div>`;
  }

  function renderComparison(rootEl, leftKey, rightKey) {
    const left  = state.sectors.find(s => s.key === leftKey);
    const right = state.sectors.find(s => s.key === rightKey);
    if (!left || !right) {
      rootEl.innerHTML = '<div class="opacity-60 py-6 text-center">Sélectionne deux secteurs.</div>';
      return;
    }
    const rowsL = buildRows(left.symbol);
    const rowsR = buildRows(right.symbol);
    const aggL = computeAggregates(rowsL);
    const aggR = computeAggregates(rowsR);
    const cmp = compareAggregates(aggL, aggR);

    const winnerLabel = cmp.leftWins === cmp.rightWins
      ? '<span class="sc-banner-tie">Égalité</span>'
      : cmp.leftWins > cmp.rightWins
        ? `<span class="sc-banner-winner">🏆 ${left.label}</span> l'emporte ${cmp.leftWins}–${cmp.rightWins}`
        : `<span class="sc-banner-winner">🏆 ${right.label}</span> l'emporte ${cmp.rightWins}–${cmp.leftWins}`;

    rootEl.innerHTML = `
      <div class="sc-banner">${winnerLabel}</div>
      <div class="sc-grid">
        ${renderPanel('left',  left,  aggL, cmp)}
        ${renderPanel('right', right, aggR, cmp)}
      </div>`;
  }

  // ---------- UI wire-up ----------

  function injectStyles() {
    if (document.getElementById('sc-styles')) return;
    const css = `
      #sector-comparator { margin: 2.5rem 0; width: 100%; }
      #sector-comparator .section-title { text-align: center; }
      .sc-hint { text-align: center; opacity: .75; font-size: .9rem; margin-bottom: 1rem; }
      .sc-region-tabs { display: flex; justify-content: center; gap: .4rem; margin-bottom: .85rem; }
      .sc-rtab { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: inherit; padding: .35rem .9rem; border-radius: 999px; font-size: .78rem; cursor: pointer; }
      .sc-rtab.is-active { background: rgba(0,255,135,.18); border-color: rgba(0,255,135,.5); color: #00ff87; }
      .sc-chips { display: flex; flex-direction: column; gap: .9rem; margin: 0 auto 1rem; max-width: 1100px; }
      .sc-family { background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.06); border-radius: .65rem; padding: .65rem .85rem .75rem; }
      .sc-family-head { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; opacity: .55; font-weight: 600; margin-bottom: .55rem; }
      .sc-family-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
      .sc-chip { position: relative; display: inline-flex; align-items: center; gap: .4rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: inherit; border-radius: .45rem; padding: .42rem .75rem; font-size: .78rem; cursor: pointer; transition: all .12s; text-align: left; }
      .sc-chip:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.25); transform: translateY(-1px); }
      .sc-chip.is-selected { background: rgba(0,255,135,.18); border-color: #00ff87; box-shadow: 0 0 0 1px #00ff87 inset; }
      .sc-chip-num { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: #00ff87; color: #001; font-weight: 800; font-size: .65rem; }
      .sc-chip-label { font-weight: 600; }
      .sc-actions { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 1.25rem; }
      .sc-btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,.15); color: inherit; padding: .35rem .8rem; border-radius: .4rem; font-size: .75rem; cursor: pointer; opacity: .7; }
      .sc-btn-ghost:hover { opacity: 1; }
      .sc-status { font-size: .72rem; opacity: .45; }
      .sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
      @media (max-width: 1000px) { .sc-grid { grid-template-columns: 1fr; } }
      .sc-panel { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09); border-radius: .9rem; padding: 1.1rem 1.1rem 1rem; }
      .sc-panel-head { margin-bottom: .9rem; padding-bottom: .75rem; border-bottom: 1px solid rgba(255,255,255,.07); }
      .sc-panel-title { font-weight: 700; font-size: 1.1rem; letter-spacing: .01em; }
      .sc-panel-sub { font-size: .78rem; opacity: .55; margin-top: 2px; }
      .sc-table-wrap { overflow-x: auto; }
      .sc-table { width: 100%; border-collapse: separate; border-spacing: 0 4px; font-size: .9rem; table-layout: fixed; }
      .sc-table th, .sc-table td { text-align: right; padding: .7rem .5rem; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
      .sc-table th { font-weight: 600; opacity: .5; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; padding: .4rem .5rem .6rem; border-bottom: 1px solid rgba(255,255,255,.07); }
      .sc-table tbody tr { background: rgba(255,255,255,.02); transition: background .12s; }
      .sc-table tbody tr:hover { background: rgba(255,255,255,.06); }
      .sc-table tbody td:first-child { border-radius: .4rem 0 0 .4rem; }
      .sc-table tbody td:last-child  { border-radius: 0 .4rem .4rem 0; }
      .sc-table th:nth-child(1), .sc-table td:nth-child(1) { width: 30px; text-align: center; }
      .sc-table th:nth-child(2), .sc-table td:nth-child(2) { text-align: left; width: auto; padding-left: .25rem; }
      .sc-table th:nth-child(3), .sc-table td:nth-child(3) { width: 60px; }
      .sc-table th:nth-child(n+4), .sc-table td:nth-child(n+4) { width: 60px; }
      /* la colonne quality est un peu plus large pour laisser place au grade */
      .sc-table th:nth-child(6), .sc-table td:nth-child(6) { width: 78px; }
      .sc-rank { opacity: .3; font-weight: 700; font-size: .85rem; }
      .sc-name-cell { overflow: hidden; }
      .sc-name { font-weight: 600; font-size: .92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; line-height: 1.25; }
      .sc-tic { font-size: .7rem; opacity: .45; margin-top: 2px; letter-spacing: .02em; }
      .sc-w { color: #fff; opacity: .9; font-weight: 700; }
      .sc-num { opacity: .82; font-weight: 500; }
      .sc-heat { border-radius: .35rem; font-weight: 700; }
      .sc-q { font-weight: 700; }
      .sc-grade { display: inline-block; font-size: .62rem; padding: 1px 5px; border-radius: 4px; background: rgba(0,255,135,.22); color: #00ff87; margin-left: 4px; vertical-align: middle; font-weight: 800; }
      .positive { color: #00ff87; }
      .negative { color: #ff6b6b; }
      .sc-banner { text-align: center; font-size: 1rem; margin-bottom: 1rem; padding: .85rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: .6rem; }
      .sc-banner-winner { color: #00ff87; font-weight: 700; font-size: 1.1rem; }
      .sc-banner-tie { color: #ffd166; font-weight: 700; font-size: 1.1rem; }
      .sc-panel-score { margin-top: .5rem; display: flex; align-items: baseline; gap: .35rem; }
      .sc-score-num { font-size: 1.6rem; font-weight: 800; color: #00ff87; line-height: 1; font-variant-numeric: tabular-nums; }
      .sc-score-lbl { font-size: .72rem; opacity: .55; text-transform: uppercase; letter-spacing: .04em; }
      .sc-agg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .45rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08); }
      @media (max-width: 700px) { .sc-agg-grid { grid-template-columns: repeat(2, 1fr); } }
      .sc-agg-cell { background: rgba(255,255,255,.04); border-radius: .5rem; padding: .55rem .6rem; border: 1px solid transparent; transition: all .2s; }
      .sc-agg-cell.sc-win  { background: rgba(0,255,135,.18); border-color: rgba(0,255,135,.5); }
      .sc-agg-cell.sc-lose { background: rgba(255,107,107,.15); border-color: rgba(255,107,107,.4); }
      .sc-agg-cell.sc-tie  { background: rgba(255,209,102,.12); border-color: rgba(255,209,102,.35); }
      .sc-agg-cell.sc-win .sc-agg-val  { color: #00ff87; }
      .sc-agg-cell.sc-lose .sc-agg-val { color: #ff8888; }
      .sc-agg-label { font-size: .6rem; opacity: .65; text-transform: uppercase; letter-spacing: .04em; }
      .sc-agg-val { font-size: 1.02rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 3px; }
    `;
    const tag = document.createElement('style');
    tag.id = 'sc-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function renderChips(container, regionFilter, selected) {
    const list = state.sectors.filter(s => regionFilter === 'all' || (s.region || '').toLowerCase() === regionFilter);
    // Groupe par famille d'indice
    const families = new Map();
    list.forEach(s => {
      if (!families.has(s.family)) families.set(s.family, []);
      families.get(s.family).push(s);
    });

    container.innerHTML = [...families.entries()].map(([family, sectors]) => `
      <div class="sc-family">
        <div class="sc-family-head">${family}</div>
        <div class="sc-family-chips">
          ${sectors.map(s => {
            const isSel = selected.includes(s.key);
            const order = isSel ? selected.indexOf(s.key) + 1 : '';
            return `<button type="button" class="sc-chip ${isSel ? 'is-selected' : ''}" data-key="${s.key}" title="${s.label}">
              ${isSel ? `<span class="sc-chip-num">${order}</span>` : ''}
              <span class="sc-chip-label">${s.shortLabel}</span>
            </button>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  async function init() {
    const root = document.getElementById('sector-comparator');
    if (!root) return;
    injectStyles();
    root.innerHTML = `
      <h2 class="section-title">Comparateur de secteurs</h2>
      <div class="sc-hint" id="sc-hint">Sélectionne <strong>2 secteurs</strong> pour les comparer</div>
      <div class="sc-region-tabs">
        <button type="button" class="sc-rtab is-active" data-region="all">Tous</button>
        <button type="button" class="sc-rtab" data-region="europe">Europe</button>
        <button type="button" class="sc-rtab" data-region="us">US</button>
      </div>
      <div id="sc-chips" class="sc-chips"></div>
      <div class="sc-actions">
        <button type="button" id="sc-clear" class="sc-btn-ghost">Réinitialiser</button>
        <span id="sc-status" class="sc-status"></span>
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
    status.textContent = `${state.sectors.length} secteurs disponibles`;

    let regionFilter = 'all';
    let selected = []; // array of keys, max 2
    const chipsEl = root.querySelector('#sc-chips');
    const resultEl = root.querySelector('#sc-result');
    const hintEl = root.querySelector('#sc-hint');

    const refresh = () => {
      renderChips(chipsEl, regionFilter, selected);
      hintEl.innerHTML = selected.length === 0
        ? 'Sélectionne <strong>2 secteurs</strong> pour les comparer'
        : selected.length === 1
          ? 'Sélectionne <strong>1 secteur</strong> de plus…'
          : '<span style="color:#00ff87">Comparaison active — clique sur une carte pour la remplacer</span>';
      if (selected.length === 2) {
        renderComparison(resultEl, selected[0], selected[1]);
      } else {
        resultEl.innerHTML = '';
      }
    };

    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.sc-chip');
      if (!btn) return;
      const key = btn.dataset.key;
      const i = selected.indexOf(key);
      if (i >= 0) {
        selected.splice(i, 1);
      } else if (selected.length < 2) {
        selected.push(key);
      } else {
        // remplace le plus ancien
        selected.shift();
        selected.push(key);
      }
      refresh();
    });

    root.querySelectorAll('.sc-rtab').forEach(tab => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.sc-rtab').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        regionFilter = tab.dataset.region;
        refresh();
      });
    });

    root.querySelector('#sc-clear').addEventListener('click', () => {
      selected = [];
      refresh();
    });

    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
