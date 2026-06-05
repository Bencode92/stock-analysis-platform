/**
 * Allocator — current portfolio → target portfolio with turnover constraint
 *
 * Reads:
 *   - data/portfolios.json (target by profile, optional `_alternates`)
 *   - data/ticker_mapping_ucits.json (UCITS ↔ US reconciliation)
 *   - User-uploaded Trading 212 CSV (current holdings)
 *
 * Produces a prioritized BUY/SELL plan capped by max_turnover.
 *
 * Pure vanilla JS, no deps. Ported from portfolio_engine/trade_generator.py.
 */

(function () {
  'use strict';

  const PROFILES = ['Agressif', 'Agressif-Thematique', 'Modéré', 'Stable', 'Dividende-PEA', 'Dividende-CTO'];
  const BUCKETS = ['Actions', 'ETF', 'Obligations', 'Crypto'];
  const PRIO = { EXIT: 0, TRIM: 1, BUY: 2 };

  class Allocator {
    constructor() {
      this.portfolios = null;
      this.ucits = null;
      this.profile = 'Agressif';
      // Phase Allocator-1: par défaut, plan complet vers la cible (alpha=1).
      // L'utilisateur peut activer le mode "budget turnover" via le toggle Avancé.
      this.maxTurnover = Infinity;
      this.minTradeWeight = 0.005;
      this.minNotional = 50;
      this.currentPositions = [];
      this.nav = 0;
      this.skipped = new Set();
      this.substitutions = {};
      this.unmappedExits = new Set();
      this.preserveLosses = true; // Don't propose SELL/TRIM on positions at unrealized loss
    }

    // ───────────────────────────── data loading

    async load() {
      const [p, u] = await Promise.all([
        this._fetchJson([
          'data/portfolios.json', './data/portfolios.json',
          '/stock-analysis-platform/data/portfolios.json'
        ]),
        this._fetchJson([
          'data/ticker_mapping_ucits.json', './data/ticker_mapping_ucits.json',
          '/stock-analysis-platform/data/ticker_mapping_ucits.json'
        ])
      ]);
      if (!p) throw new Error('portfolios.json introuvable');
      this.portfolios = p;
      this.ucits = u || {};
    }

    async _fetchJson(paths) {
      const ts = Date.now();
      for (const url of paths) {
        try {
          const r = await fetch(`${url}?_=${ts}`);
          if (!r.ok) continue;
          const t = await r.text();
          return JSON.parse(t.replace(/\bNaN\b/g, 'null').replace(/\b-?Infinity\b/g, 'null'));
        } catch {}
      }
      return null;
    }

    // ───────────────────────────── CSV parsing (Trading 212 export)

    parseT212Csv(text) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return [];
      const rows = lines.map(l => this._splitCsvLine(l));
      const header = rows[0].map(h => h.toLowerCase().trim());
      // Prefer exact match, fallback to startsWith, fallback to includes
      const idx = (name) => {
        let i = header.findIndex(h => h === name);
        if (i < 0) i = header.findIndex(h => h.startsWith(name));
        if (i < 0) i = header.findIndex(h => h.includes(name));
        return i;
      };
      const iSlice = idx('slice'), iName = idx('name');
      // "Value" = current market value (NOT "Invested value")
      const iValue = header.findIndex(h => h === 'value');
      const iInvested = header.findIndex(h => h === 'invested value');
      const iResult = header.findIndex(h => h === 'result');
      const iQty = idx('owned quantity');
      if (iSlice < 0 || iValue < 0) {
        throw new Error('CSV invalide: colonnes "Slice" et "Value" requises');
      }

      const positions = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const ticker = (r[iSlice] || '').trim();
        if (!ticker || /^total/i.test(ticker)) continue;
        const value = parseFloat(r[iValue]) || 0;
        const qty = parseFloat(r[iQty]) || 0;
        if (value <= 0) continue;
        const invested = iInvested >= 0 ? (parseFloat(r[iInvested]) || 0) : 0;
        const result = iResult >= 0 ? (parseFloat(r[iResult]) || 0) : (value - invested);
        positions.push({
          ticker_raw: ticker,
          name: (r[iName] || '').trim(),
          value,
          quantity: qty,
          invested,
          pnl: result,
          at_loss: result < 0
        });
      }
      return positions;
    }

    _splitCsvLine(line) {
      const out = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
        cur += c;
      }
      out.push(cur);
      return out;
    }

    setCurrentPositions(positions) {
      this.currentPositions = positions;
      this.nav = positions.reduce((s, p) => s + p.value, 0);
      // Reconciliation: assign target_ticker (UCITS → US).
      // Three explicit cases:
      //   - mapped + us_equivalent → 'exact' | 'equivalent' | 'proxy'
      //   - mapped + similarity='none' (documented "no US equivalent") → 'no_equivalent'
      //   - not in target portfolio AND no UCITS mapping → 'unmapped'
      //   - ticker_raw IS a target ticker directly → 'exact'
      for (const p of positions) {
        const map = this.ucits[p.ticker_raw];
        if (map && map.us_equivalent) {
          p.target_ticker = map.us_equivalent;
          p.similarity = map.similarity || 'equivalent';
          p.mapping_note = map.note || null;
        } else if (map && (map.similarity === 'none' || !map.us_equivalent)) {
          // UCITS connu mais aucun équivalent US documenté
          p.target_ticker = null;
          p.similarity = 'no_equivalent';
          p.mapping_note = map.note || null;
        } else if (this._targetTickers().has(p.ticker_raw)) {
          p.target_ticker = p.ticker_raw;
          p.similarity = 'exact';
          p.mapping_note = null;
        } else {
          p.target_ticker = null;
          p.similarity = 'unmapped';
          p.mapping_note = null;
        }
      }
    }

    // ───────────────────────────── target access helpers

    _profileData() {
      return (this.portfolios && this.portfolios[this.profile]) || {};
    }

    _targetWeights() {
      const t = this._profileData()._tickers || {};
      return t;
    }

    _targetTickers() {
      return new Set(Object.keys(this._targetWeights()));
    }

    _tickerMeta(ticker) {
      const m = this._profileData()._tickers_meta || {};
      return m[ticker] || null;
    }

    _bucketOfTicker(ticker) {
      const m = this._tickerMeta(ticker);
      if (m && m.category) return m.category;
      // Fallback: scan Actions/ETF/Obligations/Crypto sections for display name match
      const pd = this._profileData();
      for (const b of BUCKETS) {
        const obj = pd[b] || {};
        for (const dispName of Object.keys(obj)) {
          if (dispName.includes(`(${ticker})`) || dispName.endsWith(ticker)) return b;
        }
      }
      return 'ETF';
    }

    _alternatesForBucket(bucket) {
      const a = this._profileData()._alternates || {};
      return a[bucket] || [];
    }

    // ───────────────────────────── adjusted target (skip + substitute)

    /**
     * Build the effective target weights after applying:
     *   - this.skipped: tickers marked non-investable → weight removed
     *   - this.substitutions: ticker → replacementTicker (weight transferred)
     *   - leftover weight from skipped (without substitution) → redistributed
     *     pro-rata across remaining tickers of the same bucket.
     *   - this.preserveLosses: tickers held at unrealized loss are pinned to
     *     their current weight (no SELL/TRIM); excess vs target is taken from
     *     the other non-frozen target tickers pro-rata.
     */
    buildAdjustedTarget() {
      const orig = this._targetWeights();
      const adj = {};
      const removedByBucket = {}; // bucket → leftover weight to redistribute
      for (const t of Object.keys(orig)) {
        const w = orig[t];
        if (this.skipped.has(t)) {
          const sub = this.substitutions[t];
          if (sub) {
            adj[sub] = (adj[sub] || 0) + w;
          } else {
            const b = this._bucketOfTicker(t);
            removedByBucket[b] = (removedByBucket[b] || 0) + w;
          }
        } else {
          adj[t] = (adj[t] || 0) + w;
        }
      }
      // Redistribute leftover weights pro-rata within the same bucket
      for (const [bucket, leftover] of Object.entries(removedByBucket)) {
        if (leftover <= 0) continue;
        const peers = Object.keys(adj).filter(t => this._bucketOfTicker(t) === bucket);
        const peerSum = peers.reduce((s, t) => s + adj[t], 0);
        if (peerSum > 0) {
          for (const p of peers) adj[p] += leftover * (adj[p] / peerSum);
        } else {
          // No peer in bucket — global pro-rata
          const tot = Object.values(adj).reduce((s, v) => s + v, 0);
          if (tot > 0) {
            for (const t of Object.keys(adj)) adj[t] += leftover * (adj[t] / tot);
          }
        }
      }
      // Renormalize to safety
      let total = Object.values(adj).reduce((s, v) => s + v, 0);
      if (total > 0 && Math.abs(total - 1) > 1e-6) {
        for (const t of Object.keys(adj)) adj[t] /= total;
      }

      // Loss-preservation: pin frozen tickers to their current weight when
      // current > adjusted target, then absorb the excess pro-rata from
      // non-frozen target tickers. Targets above current stay (BUY allowed).
      if (this.preserveLosses) {
        const curW = this._currentWeights();
        const frozen = new Set(this._frozenTickers());
        let excess = 0;
        for (const t of frozen) {
          const cur = curW[t] || 0;
          const tgt = adj[t] || 0;
          if (cur > tgt) {
            excess += (cur - tgt);
            adj[t] = cur;
          }
        }
        if (excess > 1e-6) {
          const peers = Object.keys(adj).filter(t => !frozen.has(t));
          const peerSum = peers.reduce((s, t) => s + adj[t], 0);
          if (peerSum > 0) {
            const ratio = Math.max(0, 1 - (excess / peerSum));
            for (const t of peers) adj[t] *= ratio;
          }
        }
      }

      total = Object.values(adj).reduce((s, v) => s + v, 0);
      if (total > 0 && Math.abs(total - 1) > 1e-6) {
        for (const t of Object.keys(adj)) adj[t] /= total;
      }
      return adj;
    }

    _currentWeights() {
      const cw = {};
      for (const p of this.currentPositions) {
        const t = p.target_ticker || p.ticker_raw;
        cw[t] = (cw[t] || 0) + (this.nav > 0 ? p.value / this.nav : 0);
      }
      return cw;
    }

    /** Tickers (US/target side) currently held at unrealized loss. */
    _frozenTickers() {
      if (!this.preserveLosses) return [];
      return this.currentPositions
        .filter(p => p.at_loss)
        .map(p => p.target_ticker || p.ticker_raw);
    }

    // ───────────────────────────── trade computation (port from Python)

    /**
     * Convex-combination rebalancer (cash-neutral by construction).
     *
     *   new_w = current_w + α · (target_w − current_w),  α ∈ [0,1]
     *
     *   α = min(1, budget / fullTurnover)
     *
     * α=1 means full rebalance to target (when budget ≥ fullTurnover).
     * α<1 means a partial rebalance: every ticker progresses by the same
     * fraction toward its target. Sells = Buys exactly (no cash leftover).
     *
     * Returns { trades, usedTurnover, fullTurnover, alpha, warnings }.
     */
    computeTrades() {
      const target = this.buildAdjustedTarget();
      const current = this._currentWeights();
      const allTickers = new Set([...Object.keys(current), ...Object.keys(target)]);

      // Full deltas needed for a complete rebalance to target.
      const fullDelta = {};
      let fullDeltaSum = 0;
      for (const t of allTickers) {
        const d = (target[t] || 0) - (current[t] || 0);
        fullDelta[t] = d;
        fullDeltaSum += Math.abs(d);
      }
      const fullTurnover = fullDeltaSum / 2; // one-way (sells = buys)

      const alpha = fullTurnover > 0
        ? Math.min(1, this.maxTurnover / fullTurnover)
        : 1;

      const trades = [];
      let executedSum = 0;
      for (const t of allTickers) {
        const wCur = current[t] || 0;
        const wTgt = target[t] || 0;
        const delta = alpha * fullDelta[t];
        if (Math.abs(delta) < this.minTradeWeight) continue;
        const notional = Math.abs(delta) * this.nav;
        if (notional < this.minNotional) continue;

        const wNew = wCur + delta;
        const ucitsTicker = this._reverseUcitsLookup(t);
        const execTicker = ucitsTicker || t;

        // Reason is a label only — percentages stay in the De/Vers/cible
        // columns so they remain consistent after the post-emit balancing pass.
        let reason;
        if (wTgt === 0 && wCur > 0) {
          reason = alpha >= 0.999 ? 'Sortie complète (hors cible)' : 'Sortie partielle (hors cible)';
        } else if (wCur === 0) {
          reason = 'Nouvelle position';
        } else if (delta < 0) {
          reason = 'Réduction vers cible';
        } else {
          reason = 'Renforcement vers cible';
        }

        trades.push({
          ticker_target: t,
          ticker_exec: execTicker,
          side: delta > 0 ? 'BUY' : 'SELL',
          weight_from: wCur,
          weight_to: wNew,
          weight_target: wTgt,
          delta_weight: delta,
          target_value: Math.round(notional * 100) / 100,
          reason,
          ucits_proxy: ucitsTicker !== null && ucitsTicker !== t,
        });
        executedSum += Math.abs(delta);
      }

      // Cash-neutral post-emit balancing: minNotional pruning is asymmetric and
      // can leave a residual sell/buy gap. Scale the larger side down so that
      // sum(sells) = sum(buys). Slight under-rebalance, zero cash residual.
      const sumBuy = trades.filter(t => t.side === 'BUY').reduce((s, t) => s + t.target_value, 0);
      const sumSell = trades.filter(t => t.side === 'SELL').reduce((s, t) => s + t.target_value, 0);
      let rebalanced = false;
      if (sumBuy > 0 && sumSell > 0 && Math.abs(sumBuy - sumSell) > 0.5) {
        const matchEur = Math.min(sumBuy, sumSell);
        const scaleBuy = matchEur / sumBuy;
        const scaleSell = matchEur / sumSell;
        for (const t of trades) {
          const s = t.side === 'BUY' ? scaleBuy : scaleSell;
          if (s < 0.999) {
            t.target_value = Math.round(t.target_value * s * 100) / 100;
            t.delta_weight *= s;
            t.weight_to = t.weight_from + t.delta_weight;
            rebalanced = true;
          }
        }
        executedSum = trades.reduce((s, t) => s + Math.abs(t.delta_weight), 0);
      }

      // Display order: SELLs first (largest), then BUYs (largest)
      trades.sort((a, b) => {
        if (a.side !== b.side) return a.side === 'SELL' ? -1 : 1;
        return Math.abs(b.delta_weight) - Math.abs(a.delta_weight);
      });

      const warnings = [];
      if (rebalanced) {
        warnings.push(
          `Sells/buys équilibrés à 0 € après filtrage des micro-trades (< ${this.minNotional} € de ticket minimum). Sous-rebalance marginal des plus gros ordres pour maintenir la neutralité cash.`
        );
      }
      return {
        trades,
        usedTurnover: executedSum / 2,
        fullTurnover,
        alpha,
        warnings,
      };
    }

    _reverseUcitsLookup(usTicker) {
      // 1. Held: a UCITS the user holds maps to this US ticker.
      for (const p of this.currentPositions) {
        if (p.target_ticker === usTicker && p.ticker_raw !== usTicker) {
          return p.ticker_raw;
        }
      }
      // 2. Static map: invert ucits[*].us_equivalent → first match
      for (const [ucits, m] of Object.entries(this.ucits)) {
        if (ucits.startsWith('_')) continue;
        if (m && m.us_equivalent === usTicker) return ucits;
      }
      return null;
    }

    // ───────────────────────────── alternates suggestion

    /**
     * Suggest up to N alternates for a target ticker the user marked non-investable.
     * Priority: same bucket from `_alternates` exposed by the optimizer; falls back
     * to other tickers in the same bucket already in target.
     */
    suggestAlternates(ticker, n = 3) {
      const bucket = this._bucketOfTicker(ticker);
      const alts = this._alternatesForBucket(bucket);
      const out = [];
      if (alts.length) {
        const meta = this._tickerMeta(ticker) || {};
        const sourceTheme = meta.industry || meta.sector || '';
        const ranked = [...alts].sort((a, b) => {
          const aScore = (a.score || 0) + ((a.industry || a.sector || '') === sourceTheme ? 20 : 0);
          const bScore = (b.score || 0) + ((b.industry || b.sector || '') === sourceTheme ? 20 : 0);
          return bScore - aScore;
        });
        for (const a of ranked.slice(0, n)) {
          out.push({
            ticker: a.ticker,
            name: a.name || a.ticker,
            score: a.score,
            source: '_alternates'
          });
        }
      }
      // Fallback: peer tickers already in current target (same bucket, not skipped)
      if (out.length < n) {
        const peers = Object.keys(this._targetWeights())
          .filter(t => t !== ticker && !this.skipped.has(t) && this._bucketOfTicker(t) === bucket);
        for (const p of peers.slice(0, n - out.length)) {
          out.push({ ticker: p, name: p, score: null, source: 'peer' });
        }
      }
      return out;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI controller
  // ═══════════════════════════════════════════════════════════════════════════

  class AllocatorUI {
    constructor(rootEl) {
      this.root = rootEl;
      this.alloc = new Allocator();
      this._render();
    }

    async start() {
      try {
        await this.alloc.load();
        this._renderProfilePicker();
      } catch (e) {
        this._setStatus(`Erreur de chargement: ${e.message}`, true);
      }
    }

    _setStatus(msg, isError = false) {
      const s = this.root.querySelector('[data-allocator-status]');
      if (!s) return;
      s.textContent = msg;
      s.style.color = isError ? '#ff5252' : 'var(--text-secondary)';
    }

    _render() {
      this.root.innerHTML = `
        <div class="allocator-toolbar" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-bottom:1.2rem;">
          <label style="font-size:0.8rem;color:var(--text-secondary);">
            Profil cible:
            <select data-allocator-profile style="margin-left:6px;background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:6px;padding:4px 8px;">
              ${PROFILES.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:0.8rem;color:var(--text-secondary);">
            CSV Trading 212:
            <input type="file" data-allocator-csv accept=".csv,text/csv" style="margin-left:6px;color:var(--text-secondary);">
          </label>
          <label style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:6px;" title="Ne propose aucun SELL ni TRIM sur les positions en moins-value latente. Les BUYs (renforcement DCA) restent autorisés.">
            <input type="checkbox" data-allocator-preserve-losses checked> Préserver MV (ne pas vendre les positions en perte)
          </label>
          <button data-allocator-compute style="background:var(--accent,#26c281);color:#0a1410;border:none;border-radius:6px;padding:6px 14px;font-weight:600;cursor:pointer;">
            <i class="fas fa-bolt" style="margin-right:4px;"></i>Calculer arbitrages
          </button>
          <button data-allocator-advanced-toggle title="Activer un budget turnover maximum (par défaut : plan complet vers la cible)" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border-subtle);border-radius:6px;padding:5px 10px;font-size:0.72rem;cursor:pointer;">
            <i class="fas fa-sliders-h" style="margin-right:4px;"></i>Avancé
          </button>
          <div data-allocator-advanced style="display:none;flex-basis:100%;padding:0.6rem 0.8rem;background:var(--surface-2,#0e1622);border:1px dashed var(--border-subtle);border-radius:8px;font-size:0.78rem;color:var(--text-secondary);">
            <label style="display:flex;align-items:center;gap:6px;">
              Budget turnover max :
              <span data-allocator-turnover-label style="font-family:var(--font-mono);color:var(--text-primary);">illimité</span>
              <input type="range" data-allocator-turnover min="0" max="60" step="1" value="0" style="width:160px;">
              <span style="color:var(--text-muted);font-size:0.7rem;">0 = plan complet (recommandé)</span>
            </label>
          </div>
        </div>
        <div data-allocator-status style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.8rem;">Charge un CSV pour démarrer.</div>
        <div data-allocator-recon></div>
        <div data-allocator-target></div>
        <div data-allocator-trades style="margin-top:1.5rem;"></div>
      `;
      this._wireEvents();
    }

    _renderProfilePicker() {
      const sel = this.root.querySelector('[data-allocator-profile]');
      sel.value = this.alloc.profile;
    }

    _wireEvents() {
      this.root.querySelector('[data-allocator-profile]').addEventListener('change', (e) => {
        this.alloc.profile = e.target.value;
        this.alloc.skipped = new Set();
        this.alloc.substitutions = {};
        this._renderTargetPanel();
        this._renderReconPanel();
        this._renderTradesPanel(null);
      });
      this.root.querySelector('[data-allocator-csv]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const positions = this.alloc.parseT212Csv(text);
          this.alloc.setCurrentPositions(positions);
          this._setStatus(`CSV chargé: ${positions.length} positions, NAV ${this.alloc.nav.toFixed(2)} €`);
          this._renderReconPanel();
          this._renderTargetPanel();
        } catch (err) {
          this._setStatus(`CSV invalide: ${err.message}`, true);
        }
      });
      const slider = this.root.querySelector('[data-allocator-turnover]');
      const sliderLabel = this.root.querySelector('[data-allocator-turnover-label]');
      slider.addEventListener('input', (e) => {
        const pct = parseInt(e.target.value, 10);
        // 0 = illimité (alpha=1, plan complet). > 0 = budget en %.
        this.alloc.maxTurnover = pct === 0 ? Infinity : pct / 100;
        sliderLabel.textContent = pct === 0 ? 'illimité' : `${pct}%`;
      });
      const advancedBtn = this.root.querySelector('[data-allocator-advanced-toggle]');
      const advancedPanel = this.root.querySelector('[data-allocator-advanced]');
      advancedBtn.addEventListener('click', () => {
        const visible = advancedPanel.style.display !== 'none';
        advancedPanel.style.display = visible ? 'none' : 'block';
        advancedBtn.style.background = visible ? 'transparent' : 'var(--surface-2,#0e1622)';
      });
      this.root.querySelector('[data-allocator-preserve-losses]').addEventListener('change', (e) => {
        this.alloc.preserveLosses = e.target.checked;
        this._renderTargetPanel();
        this._renderReconPanel();
      });
      this.root.querySelector('[data-allocator-compute]').addEventListener('click', () => {
        if (!this.alloc.currentPositions.length) {
          this._setStatus('Charge d\'abord un CSV.', true);
          return;
        }
        const res = this.alloc.computeTrades();
        this._renderTradesPanel(res);
      });
    }

    _renderReconPanel() {
      const el = this.root.querySelector('[data-allocator-recon]');
      const positions = this.alloc.currentPositions;
      if (!positions.length) { el.innerHTML = ''; return; }
      const targetSet = this.alloc._targetTickers();
      const BADGES = {
        exact:        '<span style="color:#4caf50;">≡ exact</span>',
        equivalent:   '<span style="color:#8bc34a;">≈ équivalent</span>',
        proxy:        '<span style="color:#ffb300;">≈ proxy</span>',
        no_equivalent:'<span style="color:#9e9e9e;" title="UCITS documenté mais sans équivalent US dans la cible">⊘ pas d\'équivalent</span>',
        unmapped:     '<span style="color:#ff5252;">✗ hors cible</span>',
      };
      const rows = positions.map(p => {
        const badge = BADGES[p.similarity] || BADGES.unmapped;
        const wPct = this.alloc.nav > 0 ? (p.value / this.alloc.nav * 100) : 0;
        const pnl = p.pnl != null ? p.pnl : 0;
        const pnlColor = pnl < 0 ? '#ff5252' : (pnl > 0 ? '#4caf50' : 'var(--text-muted)');
        const lockBadge = (p.at_loss && this.alloc.preserveLosses)
          ? ' <span title="Position verrouillée en MV — pas de vente proposée" style="color:#ffb300;">🔒</span>'
          : '';
        // Affichage cible: flèche uniquement si on a un vrai target US différent.
        // Si pas de cible (unmapped / no_equivalent / ticker_raw == target), montrer un tiret.
        const showArrow = p.target_ticker && p.target_ticker !== p.ticker_raw;
        const cibleCell = showArrow
          ? `→ ${p.target_ticker}`
          : '<span style="color:var(--text-muted);">—</span>';
        return `<tr>
          <td style="padding:4px 8px;font-family:var(--font-mono);">${p.ticker_raw}${lockBadge}</td>
          <td style="padding:4px 8px;color:var(--text-secondary);font-size:0.75rem;">${p.name || ''}</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;">${wPct.toFixed(1)}%</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;">${p.value.toFixed(2)} €</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:${pnlColor};">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} €</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);">${cibleCell}</td>
          <td style="padding:4px 8px;font-size:0.75rem;">${badge}</td>
        </tr>`;
      }).join('');
      el.innerHTML = `
        <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.6rem;">
            Réconciliation détenu ↔ cible (${positions.length} positions, NAV ${this.alloc.nav.toFixed(2)} €)
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;border-bottom:1px solid var(--border-subtle);">
              <th style="text-align:left;padding:4px 8px;">UCITS</th>
              <th style="text-align:left;padding:4px 8px;">Nom</th>
              <th style="text-align:right;padding:4px 8px;">Poids</th>
              <th style="text-align:right;padding:4px 8px;">Valeur</th>
              <th style="text-align:right;padding:4px 8px;">P&L</th>
              <th style="text-align:left;padding:4px 8px;">Cible</th>
              <th style="text-align:left;padding:4px 8px;">Match</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    _renderTargetPanel() {
      const el = this.root.querySelector('[data-allocator-target]');
      const tw = this.alloc._targetWeights();
      const tickers = Object.keys(tw).sort((a, b) => tw[b] - tw[a]);
      if (!tickers.length) { el.innerHTML = ''; return; }
      const heldUS = new Set(this.alloc.currentPositions.map(p => p.target_ticker));
      const rows = tickers.map(t => {
        const m = this.alloc._tickerMeta(t) || {};
        const w = tw[t] * 100;
        const held = heldUS.has(t);
        const isSkipped = this.alloc.skipped.has(t);
        const sub = this.alloc.substitutions[t];
        const checked = isSkipped ? 'checked' : '';
        return `<tr data-target-row="${t}">
          <td style="padding:4px 8px;"><input type="checkbox" data-skip="${t}" ${checked}></td>
          <td style="padding:4px 8px;font-family:var(--font-mono);">${t}</td>
          <td style="padding:4px 8px;color:var(--text-secondary);font-size:0.75rem;">${m.name || t}</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;">${w.toFixed(1)}%</td>
          <td style="padding:4px 8px;font-size:0.75rem;color:var(--text-muted);">${m.category || ''}</td>
          <td style="padding:4px 8px;font-size:0.75rem;">${held ? '<span style="color:#4caf50;">détenu</span>' : '<span style="color:var(--text-muted);">à acheter</span>'}</td>
          <td style="padding:4px 8px;" data-sub-cell="${t}">${isSkipped ? this._renderSubChooser(t, sub) : ''}</td>
        </tr>`;
      }).join('');
      el.innerHTML = `
        <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.6rem;">
            Portefeuille cible ${this.alloc.profile} — coche "non investissable" pour exclure et substituer
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;border-bottom:1px solid var(--border-subtle);">
              <th style="padding:4px 8px;">Skip</th>
              <th style="text-align:left;padding:4px 8px;">Ticker</th>
              <th style="text-align:left;padding:4px 8px;">Nom</th>
              <th style="text-align:right;padding:4px 8px;">Cible</th>
              <th style="text-align:left;padding:4px 8px;">Bucket</th>
              <th style="text-align:left;padding:4px 8px;">Détenu</th>
              <th style="text-align:left;padding:4px 8px;">Substitution</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
      el.querySelectorAll('[data-skip]').forEach(cb => {
        cb.addEventListener('change', (e) => this._onSkipToggle(e.target.dataset.skip, e.target.checked));
      });
    }

    _renderSubChooser(ticker, currentSub) {
      const alts = this.alloc.suggestAlternates(ticker, 3);
      if (!alts.length) {
        return '<span style="color:var(--text-muted);font-size:0.75rem;">redistribué dans bucket</span>';
      }
      const opts = alts.map(a => {
        const lbl = a.score != null ? `${a.ticker} (score ${a.score.toFixed(0)})` : `${a.ticker} (peer)`;
        return `<option value="${a.ticker}" ${currentSub === a.ticker ? 'selected' : ''}>${lbl}</option>`;
      }).join('');
      return `
        <select data-sub-for="${ticker}" style="background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 6px;font-size:0.75rem;">
          <option value="">— redistribuer pro-rata —</option>
          ${opts}
        </select>
      `;
    }

    _onSkipToggle(ticker, checked) {
      if (checked) {
        this.alloc.skipped.add(ticker);
      } else {
        this.alloc.skipped.delete(ticker);
        delete this.alloc.substitutions[ticker];
      }
      // Re-render the substitution cell for this row only
      const cell = this.root.querySelector(`[data-sub-cell="${ticker}"]`);
      if (cell) {
        cell.innerHTML = checked ? this._renderSubChooser(ticker, this.alloc.substitutions[ticker]) : '';
        const sel = cell.querySelector(`[data-sub-for="${ticker}"]`);
        if (sel) {
          sel.addEventListener('change', (e) => {
            const v = e.target.value;
            if (v) this.alloc.substitutions[ticker] = v;
            else delete this.alloc.substitutions[ticker];
          });
        }
      }
    }

    _renderTradesPanel(res) {
      const el = this.root.querySelector('[data-allocator-trades]');
      if (!res) { el.innerHTML = ''; return; }
      this._lastResult = res;
      // Per-trade veto: keys are trade indices the user has unchecked
      this._vetoedTrades = this._vetoedTrades || new Set();
      // Reset veto if a fresh compute happened (different trades count)
      if (!this._lastTradesSnap || this._lastTradesSnap !== res.trades) {
        this._vetoedTrades = new Set();
        this._lastTradesSnap = res.trades;
      }
      const { trades, fullTurnover, alpha, warnings } = res;
      if (!trades.length) {
        el.innerHTML = `<div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1rem;color:var(--text-secondary);">Aucun trade nécessaire — portefeuille déjà aligné.</div>`;
        return;
      }

      const alphaPct = (alpha * 100).toFixed(0);
      const fullPct = (fullTurnover * 100).toFixed(1);
      const explainer = alpha >= 0.999
        ? `<span style="color:#4caf50;">Plan complet vers la cible</span> — turnover ${fullPct} % one-way, sells = buys (cash-neutral).`
        : `Budget turnover : ${(this.alloc.maxTurnover*100).toFixed(0)} % one-way. On parcourt <strong>${alphaPct} %</strong> du chemin vers la cible (rebalance complet : ${fullPct} %). Tous les tickers progressent au même rythme.`;

      const warnHtml = warnings.length
        ? `<div style="margin-top:0.6rem;color:#ffb300;font-size:0.8rem;">${warnings.join(' ')}</div>`
        : '';

      el.innerHTML = `
        <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1.2rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.8rem;gap:1rem;">
            <div>
              <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.4rem;">
                Plan d'arbitrage — décoche pour exclure une ligne
              </div>
              <div style="font-size:0.85rem;color:var(--text-secondary);max-width:560px;line-height:1.5;">
                ${explainer}
              </div>
            </div>
            <button data-allocator-export style="background:var(--surface-2,#1a2332);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:6px;padding:6px 12px;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
              <i class="fas fa-download"></i> Export CSV
            </button>
          </div>
          <div data-trades-summary></div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;border-bottom:1px solid var(--border-subtle);">
              <th style="padding:6px 8px;">Faire</th>
              <th style="text-align:left;padding:6px 8px;">Side</th>
              <th style="text-align:left;padding:6px 8px;">Ticker</th>
              <th style="text-align:right;padding:6px 8px;">De</th>
              <th style="text-align:right;padding:6px 8px;">Vers (cible)</th>
              <th style="text-align:right;padding:6px 8px;">Montant</th>
              <th style="text-align:left;padding:6px 8px;">Motif</th>
            </tr></thead>
            <tbody data-trades-body></tbody>
          </table>
          ${warnHtml}
          <div data-final-state style="margin-top:1rem;"></div>
        </div>
      `;
      el.querySelector('[data-allocator-export]').addEventListener('click', () => this._exportCsv(this._activeTrades()));
      this._renderTradesBody();
      this._renderTradesSummary();
      this._renderFinalState();
    }

    _activeTrades() {
      const all = this._lastResult ? this._lastResult.trades : [];
      return all.filter((_, i) => !this._vetoedTrades.has(i));
    }

    _renderTradesBody() {
      const body = this.root.querySelector('[data-trades-body]');
      if (!body || !this._lastResult) return;
      const trades = this._lastResult.trades;
      body.innerHTML = trades.map((t, i) => {
        const vetoed = this._vetoedTrades.has(i);
        const sideColor = t.side === 'BUY' ? '#4caf50' : '#ff5252';
        const rowOpacity = vetoed ? '0.35' : '1';
        const rowDecor = vetoed ? 'text-decoration:line-through;' : '';
        const proxyHint = t.ucits_proxy
          ? `<span style="color:var(--text-muted);font-size:0.7rem;"> via <span style="font-family:var(--font-mono);">${t.ticker_exec}</span></span>`
          : '';
        const tgtCell = t.weight_target != null
          ? `<span style="color:var(--text-muted);font-size:0.75rem;">(cible ${(t.weight_target*100).toFixed(1)}%)</span>`
          : '';
        return `<tr style="opacity:${rowOpacity};${rowDecor}">
          <td style="padding:6px 8px;text-align:center;"><input type="checkbox" data-trade-veto="${i}" ${vetoed ? '' : 'checked'}></td>
          <td style="padding:6px 8px;font-weight:600;color:${sideColor};">${t.side}</td>
          <td style="padding:6px 8px;font-family:var(--font-mono);">${t.ticker_target}${proxyHint}</td>
          <td style="padding:6px 8px;font-family:var(--font-mono);text-align:right;">${(t.weight_from*100).toFixed(1)}%</td>
          <td style="padding:6px 8px;font-family:var(--font-mono);text-align:right;">${(t.weight_to*100).toFixed(1)}% ${tgtCell}</td>
          <td style="padding:6px 8px;font-family:var(--font-mono);text-align:right;font-weight:600;color:${sideColor};">${t.target_value.toFixed(2)} €</td>
          <td style="padding:6px 8px;font-size:0.75rem;color:var(--text-secondary);">${t.reason}</td>
        </tr>`;
      }).join('');
      body.querySelectorAll('[data-trade-veto]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.tradeVeto, 10);
          if (e.target.checked) this._vetoedTrades.delete(idx);
          else this._vetoedTrades.add(idx);
          this._renderTradesBody();
          this._renderTradesSummary();
          this._renderFinalState();
        });
      });
    }

    _renderTradesSummary() {
      const el = this.root.querySelector('[data-trades-summary]');
      if (!el) return;
      const trades = this._activeTrades();
      const totalBuy = trades.filter(t => t.side === 'BUY').reduce((s, t) => s + t.target_value, 0);
      const totalSell = trades.filter(t => t.side === 'SELL').reduce((s, t) => s + t.target_value, 0);
      const cash = totalSell - totalBuy;
      const turnover = trades.reduce((s, t) => s + Math.abs(t.delta_weight), 0) / 2;
      const cashColor = Math.abs(cash) < 1 ? '#4caf50' : '#ffb300';
      const totalAll = this._lastResult ? this._lastResult.trades.length : 0;
      const vetoCount = this._vetoedTrades.size;
      el.innerHTML = `
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.8rem;padding:0.6rem 0.8rem;background:var(--surface-2,#0e1622);border-radius:8px;">
          <span>Ordres actifs : <strong style="font-family:var(--font-mono);">${trades.length}/${totalAll}${vetoCount ? ` (${vetoCount} vetoés)` : ''}</strong></span>
          <span>Ventes : <strong style="color:#ff5252;font-family:var(--font-mono);">${totalSell.toFixed(2)} €</strong></span>
          <span>Achats : <strong style="color:#4caf50;font-family:var(--font-mono);">${totalBuy.toFixed(2)} €</strong></span>
          <span title="Différence sells - buys après les ordres actifs. >0 = cash en attente d'investissement.">Cash résiduel : <strong style="font-family:var(--font-mono);color:${cashColor};">${cash >= 0 ? '+' : ''}${cash.toFixed(2)} €</strong></span>
          <span>Turnover : <strong style="font-family:var(--font-mono);">${(turnover*100).toFixed(1)} %</strong> one-way</span>
        </div>
      `;
    }

    /**
     * Final portfolio state after applying the active (non-vetoed) trades.
     * Shows post-rebalance % vs target % per ticker, sorted by post-rebalance
     * weight desc.
     */
    _renderFinalState() {
      const el = this.root.querySelector('[data-final-state]');
      if (!el) return;
      const trades = this._activeTrades();
      const cur = this.alloc._currentWeights();
      const tgt = this.alloc.buildAdjustedTarget();
      // Apply trade deltas to current
      const finalW = { ...cur };
      let cashDelta = 0;
      for (const t of trades) {
        finalW[t.ticker_target] = (finalW[t.ticker_target] || 0) + t.delta_weight;
        cashDelta += t.side === 'SELL' ? t.target_value : -t.target_value;
      }
      // Cash residual is held as an extra "line" in € terms (not in weights)
      const allTickers = new Set([...Object.keys(finalW), ...Object.keys(tgt)]);
      const rows = [...allTickers]
        .map(t => ({
          ticker: t,
          cur: cur[t] || 0,
          final: finalW[t] || 0,
          target: tgt[t] || 0,
          gap: (tgt[t] || 0) - (finalW[t] || 0)
        }))
        .filter(r => r.cur > 0.001 || r.final > 0.001 || r.target > 0.001)
        .sort((a, b) => b.final - a.final);

      const nav = this.alloc.nav;
      const trBody = rows.map(r => {
        const finalEur = r.final * nav;
        const gapAbs = Math.abs(r.gap);
        const gapColor = gapAbs < 0.005 ? '#4caf50' : (gapAbs < 0.02 ? '#8bc34a' : '#ffb300');
        const gapTxt = r.target === 0 && r.final > 0
          ? '<span style="color:var(--text-muted);">(hors cible)</span>'
          : `${r.gap >= 0 ? '+' : ''}${(r.gap*100).toFixed(1)}%`;
        const onTarget = gapAbs < 0.005 ? ' <i class="fas fa-check" style="color:#4caf50;font-size:0.7rem;"></i>' : '';
        return `<tr>
          <td style="padding:4px 8px;font-family:var(--font-mono);">${r.ticker}${onTarget}</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:var(--text-muted);">${(r.cur*100).toFixed(1)}%</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;">${(r.final*100).toFixed(1)}%</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:var(--text-muted);">${r.target ? (r.target*100).toFixed(1)+'%' : '—'}</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:${gapColor};">${gapTxt}</td>
          <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;">${finalEur.toFixed(2)} €</td>
        </tr>`;
      }).join('');

      const cashRow = Math.abs(cashDelta) > 0.5 ? `<tr style="border-top:1px dashed var(--border-subtle);">
        <td style="padding:4px 8px;font-family:var(--font-mono);color:#ffb300;">CASH</td>
        <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">—</td>
        <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:#ffb300;">${(cashDelta/nav*100).toFixed(1)}%</td>
        <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">0%</td>
        <td style="padding:4px 8px;text-align:right;color:#ffb300;">—</td>
        <td style="padding:4px 8px;font-family:var(--font-mono);text-align:right;color:#ffb300;">${cashDelta.toFixed(2)} €</td>
      </tr>` : '';

      el.innerHTML = `
        <div style="margin-top:1rem;background:var(--surface-2,#0e1622);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.6rem;">
            <i class="fas fa-flag-checkered" style="margin-right:4px;"></i>Portefeuille final après exécution des ordres actifs
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">
              <th style="text-align:left;padding:4px 8px;">Ticker</th>
              <th style="text-align:right;padding:4px 8px;">Avant</th>
              <th style="text-align:right;padding:4px 8px;">Après</th>
              <th style="text-align:right;padding:4px 8px;">Cible</th>
              <th style="text-align:right;padding:4px 8px;">Gap</th>
              <th style="text-align:right;padding:4px 8px;">Valeur</th>
            </tr></thead>
            <tbody>${trBody}${cashRow}</tbody>
          </table>
        </div>
      `;
    }

    _exportCsv(trades) {
      const header = 'side,ticker_target,ticker_exec,weight_from_pct,weight_to_pct,amount_eur,reason';
      const lines = trades.map(t => [
        t.side,
        t.ticker_target,
        t.ticker_exec,
        (t.weight_from * 100).toFixed(2),
        (t.weight_to * 100).toFixed(2),
        t.target_value.toFixed(2),
        `"${t.reason.replace(/"/g, '""')}"`
      ].join(','));
      const csv = [header, ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades_${this.alloc.profile}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // Auto-init when a host element is present on the page
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('allocator-root');
    if (!root) return;
    const ui = new AllocatorUI(root);
    ui.start();
  });

  // Export for tests / external use
  window.Allocator = Allocator;
  window.AllocatorUI = AllocatorUI;
})();
