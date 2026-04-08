/* ============================================================================
 * ETF Comparator — comparatif côte à côte d'ETF
 *
 * Inspiré de StockComparator (liste-script.js) et sector-comparator (marches),
 * adapté aux ETF :
 *   - Sélection via checkboxes dans le tableau A→Z (max 5)
 *   - Modal qui affiche les top-10 holdings de chaque ETF + ses métriques
 *     intrinsèques (TER, AUM, perfs, vol, yield)
 *   - Couleur vert/rouge UNIQUEMENT sur les métriques ETF — les holdings
 *     sont neutres (pas de score de qualité agrégé)
 *   - Score head-to-head calculé sur les métriques ETF
 *
 * Dépend de : window.ETFData (fournit getData()) — chargé par etf-script.js
 * Exposé sous : window.ETFComparator
 * ========================================================================== */
(function () {
  'use strict';

  const MAX_SELECT = 5;

  // -- helpers ---------------------------------------------------------------
  const num = v => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmtPct = (v, dec = 2) => v == null ? '–' : (v >= 0 ? '+' : '') + v.toFixed(dec) + '%';
  const fmtRatioPct = (v, dec = 2) => {
    if (v == null) return '–';
    // Convert ratio (0.0018) to %, leave value already in % alone
    const x = Math.abs(v) <= 1 ? v * 100 : v;
    return x.toFixed(dec) + '%';
  };
  const fmtAUM = v => {
    if (v == null) return '–';
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' B$';
    if (a >= 1e6) return (v / 1e6).toFixed(0) + ' M$';
    if (a >= 1e3) return (v / 1e3).toFixed(0) + ' k$';
    return String(Math.round(v));
  };
  const parseMaybeJSON = val => {
    if (!val) return null;
    if (Array.isArray(val) || (typeof val === 'object' && val !== null)) return val;
    try { return JSON.parse(val); } catch { return null; }
  };
  function getHoldings(e) {
    const arr = parseMaybeJSON(e.holdings_top10);
    if (Array.isArray(arr)) {
      return arr.filter(h => h && (h.t || h.n)).slice(0, 10);
    }
    return [];
  }

  // -- Stock universe (chargé une seule fois) --------------------------------
  // Réutilise window.SectorComparator.buildStockIndex / normalizeName /
  // stripSuffix si dispo, sinon fallback local minimal.
  const STOCK_FILES = [
    'data/stocks_us.json',
    'data/stocks_europe.json',
    'data/stocks_asia.json',
  ];
  const stockShared = { index: null, loading: null };

  function _normalizeName(s) {
    if (window.SectorComparator?.normalizeName) return window.SectorComparator.normalizeName(s);
    return String(s || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[.,'’()\-]/g, ' ')
      .replace(/\b(the|corp|corporation|inc|incorporated|company|co|ltd|limited|plc|sa|ag|nv|se|ab|holdings?|group|trust|class\s*[abc])\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function _stripSuffix(t) {
    if (window.SectorComparator?.stripSuffix) return window.SectorComparator.stripSuffix(t);
    return String(t || '').split('.')[0].toUpperCase();
  }
  function _buildIndex(stockSets) {
    if (window.SectorComparator?.buildStockIndex) {
      return window.SectorComparator.buildStockIndex(stockSets);
    }
    const idx = new Map();
    const add = (k, v) => {
      if (!k) return;
      if (!idx.has(k)) idx.set(k, [v]);
      else if (!idx.get(k).includes(v)) idx.get(k).push(v);
    };
    stockSets.forEach(set => (set?.stocks || []).forEach(stk => {
      add(`T:${(stk.ticker || '').toUpperCase()}`, stk);
      add(`T:${_stripSuffix(stk.ticker)}`, stk);
      const n = _normalizeName(stk.name);
      if (n) add(`N:${n}`, stk);
    }));
    return idx;
  }
  async function loadStockIndex() {
    if (stockShared.index) return stockShared.index;
    if (stockShared.loading) return stockShared.loading;
    stockShared.loading = (async () => {
      try {
        const sets = await Promise.all(
          STOCK_FILES.map(f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null))
        );
        stockShared.index = _buildIndex(sets.filter(Boolean));
      } catch (err) {
        console.warn('[etf-comparator] stock index load failed', err);
        stockShared.index = new Map();
      }
      return stockShared.index;
    })();
    return stockShared.loading;
  }
  // Moyenne pondérée par poids du holding
  function _weightedAvg(rows, getter) {
    let sum = 0, w = 0;
    rows.forEach(r => {
      if (!r.stock) return;
      const v = getter(r.stock);
      const wt = Number(r.h.w) || 0;
      if (v != null && Number.isFinite(v) && wt > 0) {
        sum += v * wt; w += wt;
      }
    });
    return w > 0 ? sum / w : null;
  }
  function _median(rows, getter) {
    const vals = rows.map(r => r.stock ? getter(r.stock) : null)
      .filter(v => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }

  // Agrégats holdings : moyenne pondérée des perfs/quality + médianes
  // pour les métriques fondamentales (revenue/fcf). Calé sur la même liste
  // de métriques que sector-comparator.js.
  function computeHoldingsAggs(matchedRows) {
    const matched = matchedRows.filter(r => r.stock);
    const totalW = matchedRows.reduce((s, r) => s + (Number(r.h.w) || 0), 0);
    const matchedW = matched.reduce((s, r) => s + (Number(r.h.w) || 0), 0);
    return {
      coverage: matched.length,
      total: matchedRows.length,
      weightCovered: totalW > 0 ? matchedW / totalW : 0,
      perf_ytd:       _weightedAvg(matchedRows, s => s.perf_ytd),
      perf_1y:        _weightedAvg(matchedRows, s => s.perf_1y),
      perf_3y:        _weightedAvg(matchedRows, s => s.perf_3y),
      quality:        _weightedAvg(matchedRows, s => s.quality_raw_score),
      buffett:        _weightedAvg(matchedRows, s => s.buffett_score),
      revenue_growth: _median(matchedRows, s => s.revenue_growth_3y),
      fcf_yield:      _median(matchedRows, s => s.fcf_yield),
      div_yield:      _weightedAvg(matchedRows, s => s.dividend_yield),
      beta:           _weightedAvg(matchedRows, s => s.beta),
    };
  }

  function matchHolding(h) {
    const idx = stockShared.index;
    if (!idx) return null;
    const tries = [];
    const t = h.t || h.symbol || '';
    if (t) {
      tries.push(`T:${t.toUpperCase()}`);
      tries.push(`T:${_stripSuffix(t)}`);
    }
    const n = _normalizeName(h.n || h.name);
    if (n) tries.push(`N:${n}`);
    for (const k of tries) {
      const cands = idx.get(k);
      if (cands && cands.length) return cands[0];
    }
    return null;
  }

  // -- ETFComparator ---------------------------------------------------------
  const ETFComparator = {
    MAX: MAX_SELECT,
    selected: new Map(), // ticker -> ETF object

    toggle(ticker, etfObj) {
      if (this.selected.has(ticker)) {
        this.selected.delete(ticker);
      } else {
        if (this.selected.size >= this.MAX) {
          alert(`Maximum ${this.MAX} ETF à comparer`);
          const cb = document.querySelector(`.etf-compare-checkbox[data-ticker="${ticker}"]`);
          if (cb) cb.checked = false;
          return;
        }
        this.selected.set(ticker, etfObj);
      }
      this.renderBar();
    },

    remove(ticker) {
      this.selected.delete(ticker);
      const cb = document.querySelector(`.etf-compare-checkbox[data-ticker="${ticker}"]`);
      if (cb) cb.checked = false;
      this.renderBar();
    },

    clear() {
      this.selected.clear();
      document.querySelectorAll('.etf-compare-checkbox').forEach(cb => cb.checked = false);
      this.renderBar();
    },

    // -- Sticky bottom bar ---------------------------------------------------
    renderBar() {
      let bar = document.getElementById('etf-comparator-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'etf-comparator-bar';
        bar.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9998;
          background:rgba(10,25,41,0.97);backdrop-filter:blur(12px);
          border-top:2px solid #00FF87;padding:14px 24px;
          display:flex;align-items:center;gap:16px;flex-wrap:wrap;
          box-shadow:0 -8px 24px rgba(0,0,0,0.4);transition:transform 0.3s;`;
        document.body.appendChild(bar);
      }
      if (this.selected.size === 0) {
        bar.style.transform = 'translateY(100%)';
        return;
      }
      bar.style.transform = 'translateY(0)';
      const items = [...this.selected.values()];
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-balance-scale" style="color:#00FF87;font-size:1rem;"></i>
          <span style="color:#fff;font-weight:700;font-size:0.85rem;">Comparateur ETF ${this.selected.size}/${this.MAX}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1;">
          ${items.map(e => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:14px;
              background:rgba(0,255,135,0.1);border:1px solid rgba(0,255,135,0.3);color:#fff;font-size:0.78rem;">
              <strong style="color:#00FF87;">${e.ticker || e.symbol}</strong>
              <span style="opacity:0.7;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name || ''}</span>
              <button onclick="ETFComparator.remove('${e.ticker || e.symbol}')"
                style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;padding:0;font-size:0.7rem;">
                <i class="fas fa-times"></i>
              </button>
            </span>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="ETFComparator.clear()"
            style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
              background:transparent;color:rgba(255,255,255,0.5);font-size:0.78rem;cursor:pointer;">
            <i class="fas fa-trash" style="margin-right:4px;"></i>Vider
          </button>
          <button onclick="ETFComparator.openModal()" ${this.selected.size < 2 ? 'disabled' : ''}
            style="padding:8px 18px;border-radius:8px;border:none;
              background:${this.selected.size >= 2 ? 'linear-gradient(135deg,#00FF87,#00d672)' : 'rgba(0,255,135,0.2)'};
              color:#000;font-weight:700;font-size:0.85rem;cursor:${this.selected.size >= 2 ? 'pointer' : 'not-allowed'};
              opacity:${this.selected.size >= 2 ? '1' : '0.5'};">
            <i class="fas fa-bolt" style="margin-right:4px;"></i>Comparer
          </button>
        </div>
      `;
    },

    // -- Modal ---------------------------------------------------------------
    openModal() {
      if (this.selected.size < 2) return;
      // Si l'index actions n'est pas encore prêt, on attend puis on rappelle.
      if (!stockShared.index) {
        loadStockIndex().then(() => this.openModal());
        return;
      }
      // On clone et on attache les agrégats holdings à chaque ETF
      const etfs = [...this.selected.values()].map(e => {
        const matched = getHoldings(e).map(h => ({ h, stock: matchHolding(h) }));
        return { ...e, _matched: matched, _agg: computeHoldingsAggs(matched) };
      });

      // Lignes comparées : métriques ETF intrinsèques + agrégats holdings
      const rows = [
        { section: 'IDENTITÉ' },
        { label: 'Géo',     get: e => e.geo_bucket || '–', neutral: true },
        { label: 'Secteur', get: e => e.sector_bucket_pill || '–', neutral: true },
        { label: 'Type',    get: e => e.fund_type || e.etf_type || '–', neutral: true },

        { section: 'COÛT & TAILLE' },
        { label: 'TER', get: e => num(e.total_expense_ratio ?? e.ter),
          format: v => fmtRatioPct(v), higherIsBetter: false },
        { label: 'AUM', get: e => num(e.aum_usd ?? e.aum),
          format: v => fmtAUM(v), higherIsBetter: true },

        { section: 'PERFORMANCE' },
        { label: 'Var jour', get: e => num(e.daily_change_pct ?? e.return_1d),
          format: v => fmtPct(v), higherIsBetter: true },
        { label: 'YTD', get: e => num(e.ytd_return_pct ?? e.return_ytd),
          format: v => fmtPct(v), higherIsBetter: true },
        { label: '1 an', get: e => num(e.one_year_return_pct ?? e.return_1y),
          format: v => fmtPct(v), higherIsBetter: true },
        { label: '3 mois', get: e => num(e.perf_3m_pct),
          format: v => fmtPct(v), higherIsBetter: true },
        { label: '1 mois', get: e => num(e.perf_1m_pct),
          format: v => fmtPct(v), higherIsBetter: true },

        { section: 'RISQUE' },
        { label: 'Volatilité 3Y', get: e => num(e.vol_3y_pct ?? e.volatility),
          format: v => v != null ? v.toFixed(2) + '%' : '–', higherIsBetter: false },
        { label: 'Beta', get: e => num(e.beta),
          format: v => v != null ? v.toFixed(2) : '–', neutral: true },

        { section: 'RENDEMENT' },
        { label: 'Yield TTM', get: e => num(e.yield_ttm ?? e.dividend_yield),
          format: v => fmtRatioPct(v), higherIsBetter: true },

        // ── Agrégats calculés depuis les holdings matchés (top 10) ─────────
        { section: 'AGRÉGATS HOLDINGS (pondérés)' },
        { label: 'Perf YTD pondérée', get: e => e._agg?.perf_ytd,
          format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–',
          higherIsBetter: true },
        { label: 'Perf 1Y pondérée', get: e => e._agg?.perf_1y,
          format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–',
          higherIsBetter: true },
        { label: 'Perf 3Y pondérée', get: e => e._agg?.perf_3y,
          format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–',
          higherIsBetter: true },
        { label: 'Quality raw (pondéré)', get: e => e._agg?.quality,
          format: v => v != null ? Math.round(v).toString() : '–',
          higherIsBetter: true },
        { label: 'Buffett (pondéré)', get: e => e._agg?.buffett,
          format: v => v != null ? Math.round(v).toString() : '–',
          higherIsBetter: true },
        { label: 'Revenue growth 3Y (méd)', get: e => e._agg?.revenue_growth,
          format: v => v != null ? v.toFixed(1) + '%' : '–',
          higherIsBetter: true },
        { label: 'FCF yield (méd)', get: e => e._agg?.fcf_yield,
          format: v => v != null ? v.toFixed(1) + '%' : '–',
          higherIsBetter: true },
        { label: 'Div yield (pondéré)', get: e => e._agg?.div_yield,
          format: v => v != null ? v.toFixed(2) + '%' : '–',
          higherIsBetter: true },
        { label: 'Beta (pondéré)', get: e => e._agg?.beta,
          format: v => v != null ? v.toFixed(2) : '–',
          neutral: true },
        { label: 'Couverture stocks', get: e => e._agg ? `${e._agg.coverage}/${e._agg.total}` : '–',
          neutral: true },
      ];

      // Header
      const headerRow = `
        <tr>
          <th style="padding:14px;text-align:left;background:rgba(255,255,255,0.04);min-width:140px;"></th>
          ${etfs.map(e => `
            <th style="padding:14px;text-align:center;background:rgba(0,255,135,0.05);border-left:1px solid rgba(255,255,255,0.06);min-width:170px;">
              <div style="color:#00FF87;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;">${e.ticker || e.symbol}</div>
              <div style="color:#fff;font-size:0.78rem;font-weight:500;margin-top:4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name || ''}</div>
              <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;margin-top:2px;">${(e.geo_bucket || '–').toUpperCase()} · ${(e.sector_bucket_pill || '–').toUpperCase()}</div>
            </th>
          `).join('')}
        </tr>
      `;

      // Score tracking
      const wins = new Array(etfs.length).fill(0);
      const losses = new Array(etfs.length).fill(0);

      const dataRows = rows.map(r => {
        if (r.section) {
          return `<tr><td colspan="${etfs.length + 1}" style="padding:12px 14px 6px 14px;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;color:#00FF87;font-weight:700;border-top:1px solid rgba(255,255,255,0.06);">${r.section}</td></tr>`;
        }
        const values = etfs.map(e => r.get(e));
        const valid = values.filter(v => v != null && v !== '–');
        let bestIdx = -1, worstIdx = -1;
        if (typeof valid[0] === 'number' && valid.length >= 2 && !r.neutral) {
          const nums = values.map(v => typeof v === 'number' ? v : null);
          const max = Math.max(...nums.filter(v => v != null));
          const min = Math.min(...nums.filter(v => v != null));
          if (max !== min) {
            bestIdx  = nums.indexOf(r.higherIsBetter ? max : min);
            worstIdx = nums.indexOf(r.higherIsBetter ? min : max);
            if (bestIdx >= 0)  wins[bestIdx]++;
            if (worstIdx >= 0) losses[worstIdx]++;
          }
        }
        const cells = etfs.map((e, i) => {
          const v = values[i];
          let bg = '', color = '#fff', weight = '500';
          if (i === bestIdx)  { bg = 'rgba(76,175,80,0.15)';  color = '#4caf50'; weight = '700'; }
          else if (i === worstIdx) { bg = 'rgba(244,67,54,0.10)'; color = '#f44336'; weight = '600'; }
          const rendered = r.format ? r.format(v) : (v ?? '–');
          return `<td style="padding:10px 14px;text-align:center;background:${bg};color:${color};font-weight:${weight};font-family:'JetBrains Mono',monospace;font-size:0.85rem;border-left:1px solid rgba(255,255,255,0.06);">${rendered}</td>`;
        }).join('');
        return `<tr><td style="padding:10px 14px;color:rgba(255,255,255,0.6);font-size:0.78rem;">${r.label}</td>${cells}</tr>`;
      }).join('');

      // -- Top holdings (neutre, pas de couleur) -----------------------------
      const holdingsHeaderRow = `
        <tr><td colspan="${etfs.length + 1}" style="padding:18px 14px 6px 14px;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;color:#00FF87;font-weight:700;border-top:1px solid rgba(255,255,255,0.06);">TOP 10 HOLDINGS</td></tr>
      `;
      // Réutilise les holdings matchés déjà calculés pour les agrégats
      const allHoldings = etfs.map(e => e._matched || []);
      const maxHoldings = Math.max(0, ...allHoldings.map(h => h.length));
      // Couverture = nb holdings matchés / total, par ETF
      const coverages = allHoldings.map(hs => {
        const total = hs.length;
        const matched = hs.filter(x => x.stock).length;
        return { matched, total };
      });
      const holdingsRows = [];
      for (let i = 0; i < maxHoldings; i++) {
        const cells = allHoldings.map(hs => {
          const item = hs[i];
          if (!item) return `<td style="padding:8px 12px;text-align:center;color:rgba(255,255,255,0.2);font-size:0.78rem;border-left:1px solid rgba(255,255,255,0.06);">–</td>`;
          const { h, stock } = item;
          const ticker = h.t || '';
          const name = h.n || '';
          const w = h.w != null ? Number(h.w).toFixed(1) + '%' : '';
          // Perf YTD du stock matché
          const ytd = stock?.perf_ytd;
          const y1  = stock?.perf_1y;
          const ytdColor = ytd == null ? 'rgba(255,255,255,0.4)' : (ytd >= 0 ? '#4caf50' : '#f44336');
          const y1Color  = y1  == null ? 'rgba(255,255,255,0.4)' : (y1  >= 0 ? '#4caf50' : '#f44336');
          const ytdTxt = ytd != null ? (ytd >= 0 ? '+' : '') + ytd.toFixed(1) + '%' : '–';
          const y1Txt  = y1  != null ? (y1  >= 0 ? '+' : '') + y1.toFixed(1)  + '%' : '–';
          const matchDot = stock
            ? '<span title="Stock matché" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#00FF87;margin-right:6px;"></span>'
            : '<span title="Non matché dans l\'univers actions" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15);margin-right:6px;"></span>';
          return `<td style="padding:8px 12px;text-align:left;color:#fff;font-size:0.75rem;border-left:1px solid rgba(255,255,255,0.06);font-family:'JetBrains Mono',monospace;vertical-align:top;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <span style="color:#00FF87;font-weight:700;">${matchDot}${ticker || (name ? name.slice(0, 14) : '–')}</span>
              <span style="color:rgba(255,255,255,0.5);">${w}</span>
            </div>
            ${stock ? `
              <div style="display:flex;justify-content:space-between;font-size:0.65rem;margin-top:3px;opacity:0.85;">
                <span style="color:${ytdColor};">YTD ${ytdTxt}</span>
                <span style="color:${y1Color};">1Y ${y1Txt}</span>
              </div>` : ''}
          </td>`;
        }).join('');
        holdingsRows.push(`<tr><td style="padding:8px 12px;color:rgba(255,255,255,0.4);font-size:0.7rem;vertical-align:top;">#${i + 1}</td>${cells}</tr>`);
      }
      // Ligne de couverture (combien de holdings ont été matchés à l'univers actions)
      if (maxHoldings > 0) {
        const covCells = coverages.map(c => {
          const ratio = c.total ? c.matched / c.total : 0;
          const color = ratio >= 0.7 ? '#4caf50' : ratio >= 0.4 ? '#ff9800' : '#f44336';
          return `<td style="padding:6px 12px;text-align:center;color:${color};font-size:0.7rem;font-family:'JetBrains Mono',monospace;border-left:1px solid rgba(255,255,255,0.06);">${c.matched}/${c.total} matchés</td>`;
        }).join('');
        holdingsRows.push(`<tr><td style="padding:6px 12px;color:rgba(255,255,255,0.35);font-size:0.65rem;font-style:italic;">couverture</td>${covCells}</tr>`);
      }
      const holdingsBlock = maxHoldings > 0
        ? holdingsHeaderRow + holdingsRows.join('')
        : `<tr><td colspan="${etfs.length + 1}" style="padding:14px;text-align:center;color:rgba(255,255,255,0.4);font-size:0.78rem;">Holdings non disponibles</td></tr>`;

      // -- Score head-to-head -------------------------------------------------
      const TOTAL = rows.filter(r => !r.section && !r.neutral).length;
      const scores100 = wins.map((w, i) => {
        const net = w - losses[i];
        return Math.round(((net + TOTAL) / (2 * TOTAL)) * 100);
      });
      const maxScore = Math.max(...scores100);
      const winnersCount = scores100.filter(s => s === maxScore).length;
      const winnerIdx = winnersCount === 1 ? scores100.indexOf(maxScore) : -1;

      const scoreCells = etfs.map((e, i) => {
        const score = scores100[i];
        const isWinner = i === winnerIdx;
        const scoreColor = score >= 70 ? '#4caf50' : score >= 50 ? '#ff9800' : '#f44336';
        const bg = isWinner ? 'linear-gradient(135deg,rgba(0,255,135,0.2),rgba(0,255,135,0.05))' : 'rgba(255,255,255,0.02)';
        return `<td style="padding:18px 14px;text-align:center;background:${bg};border-left:1px solid rgba(255,255,255,0.06);border-top:2px solid ${isWinner ? '#00FF87' : 'rgba(255,255,255,0.08)'};vertical-align:middle;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div style="display:flex;align-items:baseline;gap:2px;justify-content:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:1.7rem;font-weight:800;color:${isWinner ? '#00FF87' : scoreColor};line-height:1;">${score}</span>
              <span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">/100</span>
            </div>
            ${isWinner
              ? '<div style="font-size:0.7rem;color:#00FF87;font-weight:700;letter-spacing:1px;">GAGNANT</div>'
              : `<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);font-family:'JetBrains Mono',monospace;">${wins[i]} gagne · ${losses[i]} perd</div>`}
          </div>
        </td>`;
      }).join('');
      const scoreRow = `<tr><td style="padding:18px 14px;color:#00FF87;font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-top:2px solid rgba(0,255,135,0.3);vertical-align:middle;">
        Score global<div style="font-size:0.6rem;color:rgba(255,255,255,0.4);text-transform:none;letter-spacing:0;font-weight:400;margin-top:2px;">Head-to-head sur ${TOTAL} métriques ETF</div>
      </td>${scoreCells}</tr>`;

      // -- Modal --------------------------------------------------------------
      const modal = document.createElement('div');
      modal.id = 'etf-comparator-modal';
      modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;
        background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;padding:20px;`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.innerHTML = `
        <div style="background:#0a1929;border:1px solid rgba(0,255,135,0.3);border-radius:16px;
          max-width:1300px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.6);">
          <div style="position:sticky;top:0;background:#0a1929;padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.06);
            display:flex;align-items:flex-start;justify-content:space-between;z-index:1;">
            <div>
              <h2 style="color:#fff;font-size:1.2rem;font-weight:700;margin:0;display:flex;align-items:center;">
                <i class="fas fa-balance-scale" style="color:#00FF87;margin-right:8px;"></i>
                Comparateur d'ETF
              </h2>
              <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:6px 0 0 0;">
                Vert = meilleur · Rouge = pire · Holdings neutres · Score sur métriques intrinsèques
              </p>
            </div>
            <button onclick="document.getElementById('etf-comparator-modal').remove()"
              style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.4rem;padding:4px 12px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div style="padding:0 24px 24px 24px;overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>${headerRow}</thead>
              <tbody>${dataRows}${holdingsBlock}${scoreRow}</tbody>
            </table>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    },

    // -- Wiring : event delegation sur les checkboxes ------------------------
    init() {
      document.addEventListener('change', ev => {
        const cb = ev.target;
        if (!cb || !cb.classList || !cb.classList.contains('etf-compare-checkbox')) return;
        const ticker = cb.dataset.ticker;
        if (!ticker) return;
        const etf = (window.ETFData?.getData?.() || []).find(
          x => (x.ticker || x.symbol) === ticker
        );
        if (etf) this.toggle(ticker, etf);
      });
      // Restaure l'état des checkboxes après chaque re-render du tableau
      const obs = new MutationObserver(() => {
        document.querySelectorAll('.etf-compare-checkbox').forEach(cb => {
          cb.checked = this.selected.has(cb.dataset.ticker);
        });
      });
      const target = document.getElementById('etf-az-container');
      if (target) obs.observe(target, { childList: true, subtree: true });
      // Précharge l'index actions en arrière-plan dès le boot
      loadStockIndex();
    },
  };

  window.ETFComparator = ETFComparator;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ETFComparator.init());
  } else {
    ETFComparator.init();
  }
})();
