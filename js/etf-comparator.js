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
      // ── 1. Préparer les ETF avec holdings matchés + agrégats ─────────────
      let etfs = [...this.selected.values()].map(e => {
        const matched = getHoldings(e).map(h => ({ h, stock: matchHolding(h) }));
        return { ...e, _matched: matched, _agg: computeHoldingsAggs(matched) };
      });

      // ── 2. Définir les lignes (ordre logique : holdings en premier) ──────
      const rows = [
        // Section AGRÉGATS HOLDINGS — la vraie info, mise en premier
        { section: 'AGRÉGATS HOLDINGS (PONDÉRÉS)', emphasis: true },
        { label: 'Perf YTD pondérée',     get: e => e._agg?.perf_ytd,       format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–', higherIsBetter: true },
        { label: 'Perf 1Y pondérée',      get: e => e._agg?.perf_1y,        format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–', higherIsBetter: true },
        { label: 'Perf 3Y pondérée',      get: e => e._agg?.perf_3y,        format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '–', higherIsBetter: true },
        { label: 'Quality raw (pondéré)', get: e => e._agg?.quality,        format: v => v != null ? Math.round(v).toString() : '–', higherIsBetter: true },
        { label: 'Buffett (pondéré)',     get: e => e._agg?.buffett,        format: v => v != null ? Math.round(v).toString() : '–', higherIsBetter: true },
        { label: 'Revenue growth 3Y',     get: e => e._agg?.revenue_growth, format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: true },
        { label: 'FCF yield (méd)',       get: e => e._agg?.fcf_yield,      format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: true },
        { label: 'Div yield (pondéré)',   get: e => e._agg?.div_yield,      format: v => v != null ? v.toFixed(2) + '%' : '–', higherIsBetter: true },
        { label: 'Beta (pondéré)',        get: e => e._agg?.beta,           format: v => v != null ? v.toFixed(2) : '–', neutral: true },

        // Section ETF — données intrinsèques
        { section: 'ETF — COÛT, PERFORMANCE, RISQUE' },
        { label: 'TER',          get: e => num(e.total_expense_ratio ?? e.ter), format: v => fmtRatioPct(v), higherIsBetter: false },
        { label: 'AUM',          get: e => num(e.aum_usd ?? e.aum),              format: v => fmtAUM(v),       higherIsBetter: true  },
        { label: 'YTD',          get: e => num(e.ytd_return_pct ?? e.return_ytd), format: v => fmtPct(v),       higherIsBetter: true  },
        { label: '1 an',         get: e => num(e.one_year_return_pct ?? e.return_1y), format: v => fmtPct(v),  higherIsBetter: true  },
        { label: '3 mois',       get: e => num(e.perf_3m_pct),                   format: v => fmtPct(v),       higherIsBetter: true  },
        { label: '1 mois',       get: e => num(e.perf_1m_pct),                   format: v => fmtPct(v),       higherIsBetter: true  },
        { label: 'Var jour',     get: e => num(e.daily_change_pct ?? e.return_1d), format: v => fmtPct(v),     higherIsBetter: true  },
        { label: 'Volatilité 3Y', get: e => num(e.vol_3y_pct ?? e.volatility),    format: v => v != null ? v.toFixed(2) + '%' : '–', higherIsBetter: false },
        { label: 'Yield TTM',    get: e => num(e.yield_ttm ?? e.dividend_yield),  format: v => fmtRatioPct(v), higherIsBetter: true },
        { label: 'Beta',         get: e => num(e.beta),                          format: v => v != null ? v.toFixed(2) : '–', neutral: true },

        // Section identité (info)
        { section: 'IDENTITÉ' },
        { label: 'Géo',     get: e => e.geo_bucket || '–', neutral: true },
        { label: 'Secteur', get: e => e.sector_bucket_pill || '–', neutral: true },
        { label: 'Type',    get: e => e.fund_type || e.etf_type || '–', neutral: true },
      ];

      // ── 3. Précompute : valeurs, min/max, best/worst, wins/losses ────────
      // On stocke aussi sur chaque row pour réutilisation au rendu post-tri.
      const N = etfs.length;
      const wins   = new Array(N).fill(0);
      const losses = new Array(N).fill(0);

      rows.forEach(r => {
        if (r.section) return;
        r._values = etfs.map(e => r.get(e));
        if (r.neutral) { r._best = -1; r._worst = -1; r._min = null; r._max = null; return; }
        const nums = r._values.map(v => typeof v === 'number' && Number.isFinite(v) ? v : null);
        const valid = nums.filter(v => v != null);
        if (valid.length < 2) { r._best = -1; r._worst = -1; r._min = null; r._max = null; return; }
        const max = Math.max(...valid);
        const min = Math.min(...valid);
        r._min = min; r._max = max;
        if (max === min) { r._best = -1; r._worst = -1; return; }
        r._best  = nums.indexOf(r.higherIsBetter ? max : min);
        r._worst = nums.indexOf(r.higherIsBetter ? min : max);
        if (r._best  >= 0) wins[r._best]++;
        if (r._worst >= 0) losses[r._worst]++;
      });

      const TOTAL = rows.filter(r => !r.section && !r.neutral).length;
      const scores100 = wins.map((w, i) => {
        const net = w - losses[i];
        return Math.round(((net + TOTAL) / (2 * TOTAL)) * 100);
      });

      // ── 4. Tri des colonnes par score décroissant (gagnant à gauche) ─────
      const order = etfs.map((_, i) => i)
        .sort((a, b) => scores100[b] - scores100[a]);
      const permute = arr => order.map(i => arr[i]);
      etfs = permute(etfs);
      const sortedScores = permute(scores100);
      const sortedWins   = permute(wins);
      const sortedLosses = permute(losses);
      // Permute aussi les valeurs et indices best/worst dans chaque row
      const newIdx = new Array(N);
      order.forEach((oldI, newI) => { newIdx[oldI] = newI; });
      rows.forEach(r => {
        if (r.section) return;
        r._values = permute(r._values);
        if (r._best  >= 0) r._best  = newIdx[r._best];
        if (r._worst >= 0) r._worst = newIdx[r._worst];
      });

      const maxScore = sortedScores[0];
      const winnersCount = sortedScores.filter(s => s === maxScore).length;
      const winnerSortedIdx = winnersCount === 1 ? 0 : -1; // gagnant unique = 1ère colonne triée

      // ── 5. Heatmap continue (gradient) sur les valeurs numériques ─────────
      // t ∈ [-1, +1] : -1 = pire, +1 = meilleur. Couleur d'opacité ∝ |t|.
      function heatStyle(v, r) {
        if (v == null || !Number.isFinite(v) || r._min == null || r._max == null) return '';
        if (r._max === r._min) return '';
        const mid = (r._min + r._max) / 2;
        const half = (r._max - r._min) / 2;
        let t = (v - mid) / half; // -1..+1
        if (!r.higherIsBetter) t = -t;
        t = Math.max(-1, Math.min(1, t));
        const a = Math.abs(t) * 0.45; // intensité max 0.45
        const rgb = t >= 0 ? '76,175,80' : '244,67,54';
        return `background:rgba(${rgb},${a.toFixed(3)});`;
      }

      // ── 6. Header (avec position dans le ranking) ─────────────────────────
      const headerRow = `
        <tr>
          <th style="padding:10px 12px;text-align:left;background:rgba(255,255,255,0.03);min-width:170px;border-bottom:1px solid rgba(0,255,135,0.2);"></th>
          ${etfs.map((e, i) => {
            const isWinner = i === winnerSortedIdx;
            return `
            <th style="padding:10px 12px;text-align:center;background:${isWinner ? 'linear-gradient(180deg,rgba(0,255,135,0.12),rgba(0,255,135,0.02))' : 'rgba(0,255,135,0.03)'};border-left:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(0,255,135,0.2);min-width:200px;">
              <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                <span style="font-size:0.6rem;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;">#${i + 1}</span>
                <span style="color:#00FF87;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;line-height:1.1;">${e.ticker || e.symbol}</span>
                ${isWinner ? '<i class="fas fa-trophy" style="color:#FFD700;font-size:0.7rem;"></i>' : ''}
              </div>
              <div style="color:#fff;font-size:0.7rem;font-weight:500;margin-top:3px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;" title="${e.name || ''}">${e.name || ''}</div>
              <div style="color:rgba(255,255,255,0.35);font-size:0.58rem;margin-top:2px;letter-spacing:0.4px;">${(e.geo_bucket || '–').toUpperCase()} · ${(e.sector_bucket_pill || '–').toUpperCase()}</div>
            </th>`;
          }).join('')}
        </tr>
      `;

      // ── 7. SCORE STICKY (en haut, juste sous le header de la modal) ──────
      const stickyScoreCells = etfs.map((e, i) => {
        const score = sortedScores[i];
        const isWinner = i === winnerSortedIdx;
        const scoreColor = score >= 70 ? '#4caf50' : score >= 50 ? '#ff9800' : '#f44336';
        return `
          <div style="flex:1;min-width:180px;text-align:center;padding:8px 6px;background:${isWinner ? 'linear-gradient(180deg,rgba(0,255,135,0.18),rgba(0,255,135,0.04))' : 'rgba(255,255,255,0.02)'};border-left:1px solid rgba(255,255,255,0.05);border-top:2px solid ${isWinner ? '#00FF87' : 'rgba(255,255,255,0.08)'};">
            <div style="font-size:0.55rem;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;letter-spacing:0.6px;">#${i + 1} · ${e.ticker || e.symbol}</div>
            <div style="display:flex;align-items:baseline;gap:2px;justify-content:center;line-height:1;margin-top:2px;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:800;color:${isWinner ? '#00FF87' : scoreColor};">${score}</span>
              <span style="font-size:0.65rem;color:rgba(255,255,255,0.4);">/100</span>
            </div>
            <div style="font-size:0.55rem;color:rgba(255,255,255,0.4);font-family:'JetBrains Mono',monospace;margin-top:1px;">${sortedWins[i]} W · ${sortedLosses[i]} L</div>
          </div>`;
      }).join('');
      // Wrapper avec le MÊME padding horizontal que le tableau pour aligner
      // les colonnes du score avec les colonnes du tableau dessous.
      const stickyScoreBar = `
        <div style="position:sticky;top:0;z-index:5;background:#0a1929;border-bottom:1px solid rgba(0,255,135,0.2);padding:0 20px;">
          <div style="display:flex;align-items:stretch;">
            <div style="min-width:170px;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;">
              <div style="color:#00FF87;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;line-height:1.1;">Score global</div>
              <div style="color:rgba(255,255,255,0.4);font-size:0.55rem;margin-top:2px;line-height:1.2;">${TOTAL} métriques</div>
            </div>
            ${stickyScoreCells}
          </div>
        </div>
      `;

      // ── 8. Body : sections + lignes (avec heatmap) ────────────────────────
      const dataRows = rows.map(r => {
        if (r.section) {
          const emphasis = r.emphasis ? 'color:#00FF87;background:rgba(0,255,135,0.04);' : 'color:#00FF87;';
          return `<tr><td colspan="${N + 1}" style="padding:10px 12px 4px 12px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;border-top:1px solid rgba(0,255,135,0.12);${emphasis}">${r.section}</td></tr>`;
        }
        const cells = etfs.map((e, i) => {
          const v = r._values[i];
          const isBest  = i === r._best;
          const isWorst = i === r._worst;
          let bg = '';
          let color = '#fff';
          let weight = '500';
          if (r.neutral) {
            bg = ''; color = 'rgba(255,255,255,0.85)';
          } else if (typeof v === 'number') {
            bg = heatStyle(v, r);
            if (isBest)  { color = '#4caf50'; weight = '700'; }
            else if (isWorst) { color = '#f44336'; weight = '600'; }
          }
          const rendered = r.format ? r.format(v) : (v ?? '–');
          return `<td style="padding:5px 12px;text-align:center;${bg}color:${color};font-weight:${weight};font-family:'JetBrains Mono',monospace;font-size:0.78rem;border-left:1px solid rgba(255,255,255,0.05);line-height:1.3;">${rendered}</td>`;
        }).join('');
        return `<tr><td style="padding:5px 12px;color:rgba(255,255,255,0.55);font-size:0.72rem;line-height:1.3;">${r.label}</td>${cells}</tr>`;
      }).join('');

      // ── 9. Top 10 holdings détaillés (déjà triés via etfs déjà permutés) ─
      const holdingsHeaderRow = `
        <tr><td colspan="${N + 1}" style="padding:10px 12px 4px 12px;font-size:0.6rem;text-transform:uppercase;letter-spacing:1.2px;color:#00FF87;font-weight:700;border-top:1px solid rgba(0,255,135,0.12);">Top 10 holdings (détail)</td></tr>
      `;
      const allHoldings = etfs.map(e => e._matched || []);
      const maxHoldings = Math.max(0, ...allHoldings.map(h => h.length));
      const holdingsRows = [];
      for (let i = 0; i < maxHoldings; i++) {
        const cells = allHoldings.map(hs => {
          const item = hs[i];
          if (!item) return `<td style="padding:3px 12px;text-align:center;color:rgba(255,255,255,0.18);font-size:0.72rem;border-left:1px solid rgba(255,255,255,0.05);">–</td>`;
          const { h, stock } = item;
          const ticker = h.t || '';
          const fullName = h.n || stock?.name || '';
          const w = h.w != null ? Number(h.w).toFixed(1) + '%' : '';
          const ytd = stock?.perf_ytd;
          const y1  = stock?.perf_1y;
          const ytdColor = ytd == null ? 'rgba(255,255,255,0.3)' : (ytd >= 0 ? '#4caf50' : '#f44336');
          const y1Color  = y1  == null ? 'rgba(255,255,255,0.3)' : (y1  >= 0 ? '#4caf50' : '#f44336');
          const ytdTxt = ytd != null ? (ytd >= 0 ? '+' : '') + ytd.toFixed(1) : '–';
          const y1Txt  = y1  != null ? (y1  >= 0 ? '+' : '') + y1.toFixed(1)  : '–';
          const matchDot = stock
            ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#00FF87;flex-shrink:0;"></span>'
            : '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.15);flex-shrink:0;"></span>';
          return `<td style="padding:4px 12px;color:#fff;font-size:0.7rem;border-left:1px solid rgba(255,255,255,0.05);font-family:'JetBrains Mono',monospace;line-height:1.3;" title="${fullName.replace(/"/g, '&quot;')}">
            <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:8px;">
              ${matchDot}
              <span style="color:#00FF87;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ticker || (fullName ? fullName.slice(0, 12) : '–')}</span>
              <span style="color:rgba(255,255,255,0.45);font-size:0.65rem;">${w}</span>
              <span style="color:${ytdColor};font-size:0.65rem;min-width:42px;text-align:right;">${ytdTxt}</span>
              <span style="color:${y1Color};font-size:0.65rem;min-width:42px;text-align:right;">${y1Txt}</span>
            </div>
          </td>`;
        }).join('');
        holdingsRows.push(`<tr><td style="padding:4px 12px;color:rgba(255,255,255,0.35);font-size:0.65rem;line-height:1.3;">#${i + 1}</td>${cells}</tr>`);
      }
      if (maxHoldings > 0) {
        const subHeaderCells = etfs.map(() =>
          `<td style="padding:2px 12px;border-left:1px solid rgba(255,255,255,0.05);">
            <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:8px;font-size:0.55rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.6px;">
              <span style="width:5px;"></span><span></span><span>poids</span><span style="min-width:42px;text-align:right;">YTD</span><span style="min-width:42px;text-align:right;">1Y</span>
            </div>
          </td>`
        ).join('');
        holdingsRows.unshift(`<tr><td></td>${subHeaderCells}</tr>`);
      }
      const holdingsBlock = maxHoldings > 0
        ? holdingsHeaderRow + holdingsRows.join('')
        : `<tr><td colspan="${N + 1}" style="padding:14px;text-align:center;color:rgba(255,255,255,0.4);font-size:0.78rem;">Holdings non disponibles</td></tr>`;

      // ── 10. Modal ─────────────────────────────────────────────────────────
      const modal = document.createElement('div');
      modal.id = 'etf-comparator-modal';
      modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;
        background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;padding:20px;`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.innerHTML = `
        <div style="background:#0a1929;border:1px solid rgba(0,255,135,0.3);border-radius:14px;
          max-width:1500px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.6);">
          <div style="position:sticky;top:0;background:#0a1929;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);
            display:flex;align-items:center;justify-content:space-between;z-index:10;">
            <div style="display:flex;align-items:center;gap:10px;">
              <i class="fas fa-balance-scale" style="color:#00FF87;font-size:1.1rem;"></i>
              <div>
                <h2 style="color:#fff;font-size:1.05rem;font-weight:700;margin:0;line-height:1.1;">Comparateur d'ETF</h2>
                <p style="color:rgba(255,255,255,0.45);font-size:0.62rem;margin:3px 0 0 0;line-height:1.2;">
                  Triés par score décroissant · Heatmap proportionnelle · ${TOTAL} métriques head-to-head
                </p>
              </div>
            </div>
            <button onclick="document.getElementById('etf-comparator-modal').remove()"
              style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.2rem;padding:4px 10px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
          ${stickyScoreBar}
          <div style="padding:0 20px 20px 20px;overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>${headerRow}</thead>
              <tbody>${dataRows}${holdingsBlock}</tbody>
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

  // Helpers exposés pour réutilisation par etf-mc-module.js (zéro duplication)
  ETFComparator.loadStockIndex = loadStockIndex;
  ETFComparator.matchHolding = matchHolding;
  ETFComparator.computeHoldingsAggs = computeHoldingsAggs;
  ETFComparator.getHoldings = getHoldings;
  window.ETFComparator = ETFComparator;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ETFComparator.init());
  } else {
    ETFComparator.init();
  }
})();
