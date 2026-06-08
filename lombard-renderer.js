/**
 * lombard-renderer.js — Lombard Credit Tab Renderer
 *
 * Self-contained renderer with explicit state management.
 * No closure dependencies — all state in LombardRenderer.state.
 *
 * UX v2: Compact layout per expert recommendations
 *  - Section 1: Enveloppe + Taux on one line
 *  - Section 2: 3 KPIs (yield net, carry fiscal, LTV)
 *  - Section 3: Unified simulator + optimizer
 *  - Section 4: Ranking in collapsible accordion
 */

const LombardRenderer = {

  // ── State ──
  state: {
    envelope: 'cto',
    rate: 2.5,
    rankings: null,
    meta: null,
  },

  // ── Config ──
  ENVELOPES: {
    cto: { name: 'Compte-Titres', taxDiv: 0.30, abbr: 'CTO', color: '#ff9800', defaultRate: 2.5, eligible: 'all' },
    pea: { name: 'PEA', taxDiv: 0.172, abbr: 'PEA', color: '#2196f3', defaultRate: 3.0, eligible: 'eu_only' },
    av:  { name: 'Assurance Vie', taxDiv: 0.247, abbr: 'AV', color: '#4caf50', defaultRate: 2.0, eligible: 'all' },
  },

  // ── Init ──
  async init() {
    try {
      const resp = await fetch('data/lombard_ranking.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this.state.rankings = data.rankings || {};
      this.state.meta = data._meta || {};
      this.render();
    } catch (e) {
      console.error('[Lombard]', e);
      const c = document.getElementById('lombard-container');
      if (c) {
        c.innerHTML = `<p style="color:#ff9800;text-align:center;padding:2rem;">
          <i class="fas fa-exclamation-triangle"></i> Erreur chargement Lombard: ${e.message}</p>`;
        c.style.opacity = '1';
      }
    }
  },

  // ── Actions ──
  setEnvelope(envKey) {
    this.state.envelope = envKey;
    this.state.rate = this.ENVELOPES[envKey].defaultRate;
    this.render();
  },

  setRate(rate) {
    const r = parseFloat(rate);
    if (!isNaN(r) && r > 0 && r < 15) {
      this.state.rate = r;
      this.render();
    }
  },

  // ── Main render ──
  render() {
    const container = document.getElementById('lombard-container');
    if (!container || !this.state.rankings) return;

    const env = this.ENVELOPES[this.state.envelope];
    const rates = Object.keys(this.state.rankings).map(Number).sort();
    if (!rates.length) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Aucun taux disponible</p>';
      container.style.opacity = '1';
      return;
    }

    const closestRate = rates.reduce((prev, curr) => Math.abs(curr - this.state.rate) < Math.abs(prev - this.state.rate) ? curr : prev);
    const rateKey = closestRate.toFixed(1);
    const rd = this.state.rankings[rateKey] || this.state.rankings[String(closestRate)];
    if (!rd) { container.innerHTML = '<p style="color:var(--text-muted);">Pas de données pour ce taux</p>'; container.style.opacity = '1'; return; }

    const stocks = rd.stocks || [];
    const summary = rd.summary || {};
    const filtered = env.eligible === 'eu_only'
      ? stocks.filter(s => (s.region || '').toUpperCase() === 'EUROPE')
      : stocks;

    const avgYieldNet = (summary.avg_yield || 0) * (1 - env.taxDiv);
    const avgCarryFiscal = avgYieldNet - closestRate;
    const avgLTV = summary.avg_ltv || 60;

    let html = '';

    const C = env.color; // Active envelope color

    // ═══════════════════════════════════════════════════
    // SECTION 1: Enveloppe + Taux (une seule ligne)
    // ═══════════════════════════════════════════════════
    html += `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;
      padding:0.8rem 1rem;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;">
      <div style="display:flex;gap:0.4rem;">
        ${Object.entries(this.ENVELOPES).map(([key, cfg]) => {
          const active = key === this.state.envelope;
          return `<button onclick="LombardRenderer.setEnvelope('${key}')"
            style="padding:0.5rem 1rem;border-radius:8px;border:1px solid ${active ? cfg.color : 'rgba(255,255,255,0.1)'};
              background:${active ? cfg.color + '22' : 'transparent'};
              color:${active ? cfg.color : 'rgba(255,255,255,0.5)'};
              font-size:0.82rem;font-weight:${active ? '700' : '500'};cursor:pointer;transition:all 0.2s;">${cfg.abbr}</button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:0.3rem;align-items:center;">
        ${rates.map(r => {
          const active = r === closestRate;
          return `<button onclick="LombardRenderer.setRate(${r})"
            style="padding:0.4rem 0.8rem;border-radius:6px;border:1px solid ${active ? C : 'rgba(255,255,255,0.08)'};
              background:${active ? C + '22' : 'transparent'};
              color:${active ? C : 'rgba(255,255,255,0.4)'};
              font-size:0.8rem;font-weight:700;cursor:pointer;font-family:var(--font-mono);transition:all 0.2s;">${r}%</button>`;
        }).join('')}
      </div>
      <span style="font-size:0.72rem;color:var(--text-muted);">
        ${filtered.length} éligibles · Fiscalité ${Math.round(env.taxDiv * 100)}%
      </span>
    </div>`;

    // ═══════════════════════════════════════════════════
    // SECTION 2: 3 KPIs
    // ═══════════════════════════════════════════════════
    html += `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Yield net ${env.abbr}</div>
        <div style="font-size:1.5rem;font-weight:700;color:${C};font-family:var(--font-mono);">${avgYieldNet.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">après ${Math.round(env.taxDiv*100)}% fiscalité</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Carry net fiscal</div>
        <div style="font-size:1.5rem;font-weight:700;color:${avgCarryFiscal > 0 ? '#4caf50' : '#f44336'};font-family:var(--font-mono);">${avgCarryFiscal > 0 ? '+' : ''}${avgCarryFiscal.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">yield net − taux ${closestRate}%</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">LTV estimé</div>
        <div style="font-size:1.5rem;font-weight:700;color:${C};font-family:var(--font-mono);">${avgLTV}%</div>
      </div>
    </div>`;

    // ═══════════════════════════════════════════════════
    // SECTION 3: Optimiseur
    // ═══════════════════════════════════════════════════
    html += `
    <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1.2rem;margin-bottom:1.5rem;">
      <div style="display:flex;align-items:end;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem;">
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">Montant</label>
          <div style="position:relative;">
            <input id="lomb-capital" type="number" value="100000" min="10000" step="10000"
              style="width:120px;padding:0.5rem 2rem 0.5rem 0.6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
                background:rgba(255,255,255,0.05);color:#fff;font-size:0.9rem;font-family:var(--font-mono);">
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3);font-size:0.7rem;">€</span>
          </div>
        </div>
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">LTV</label>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <input id="lomb-ltv" type="range" min="20" max="70" value="${avgLTV}" step="5"
              style="width:100px;accent-color:${C};"
              oninput="document.getElementById('lomb-ltv-val').textContent=this.value+'%'">
            <span id="lomb-ltv-val" style="font-size:0.8rem;color:${C};font-weight:700;font-family:var(--font-mono);">${avgLTV}%</span>
          </div>
        </div>
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">Actions min</label>
          <input id="lomb-opt-min" type="number" value="3" min="2" max="15" step="1"
            style="width:50px;padding:0.4rem;border-radius:6px;border:1px solid rgba(255,255,255,0.12);
              background:rgba(255,255,255,0.05);color:#fff;font-size:0.85rem;font-family:var(--font-mono);text-align:center;">
        </div>
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">Actions max</label>
          <input id="lomb-opt-max" type="number" value="10" min="2" max="20" step="1"
            style="width:50px;padding:0.4rem;border-radius:6px;border:1px solid rgba(255,255,255,0.12);
              background:rgba(255,255,255,0.05);color:#fff;font-size:0.85rem;font-family:var(--font-mono);text-align:center;">
        </div>
        <button onclick="LombardRenderer._runOptimizer()"
          style="padding:0.6rem 1.5rem;border-radius:8px;border:none;background:linear-gradient(135deg,${C},${C}dd);
            color:#000;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;"
          onmouseover="this.style.transform='scale(1.02)';this.style.boxShadow='0 4px 15px ${C}44'"
          onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
          <i class="fas fa-bolt" style="margin-right:0.3rem;"></i> Optimiser
        </button>
      </div>
      <div id="lomb-opt-result"></div>
    </div>`;

    // ═══════════════════════════════════════════════════
    // SECTION 4: Ranking complet (accordéon fermé)
    // ═══════════════════════════════════════════════════
    if (filtered.length > 0) {
      let tableRows = '';
      for (let i = 0; i < filtered.length; i++) {
        const s = filtered[i];
        const yieldNet = (s.dividend_yield || 0) * (1 - env.taxDiv);
        const carryFiscal = yieldNet - closestRate;
        const carryColor = carryFiscal > 0 ? '#4caf50' : '#f44336';
        tableRows += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
          <td style="padding:0.4rem;color:var(--text-muted);font-size:0.75rem;">${i + 1}</td>
          <td style="padding:0.4rem;font-family:var(--font-mono);font-weight:700;color:${C};font-size:0.8rem;">${s.ticker}</td>
          <td style="padding:0.4rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;">${s.name || ''}</td>
          <td style="padding:0.4rem;color:var(--text-muted);font-size:0.72rem;">${s.sector || ''}</td>
          <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);font-size:0.8rem;">${(s.dividend_yield || 0).toFixed(1)}%</td>
          <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);color:${carryColor};font-weight:700;font-size:0.8rem;">${carryFiscal > 0 ? '+' : ''}${carryFiscal.toFixed(1)}%</td>
          <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);font-size:0.8rem;">${s.ltv_estimated || '?'}%</td>
          <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);font-size:0.8rem;">${Math.round(s.lombard_score || 0)}</td>
        </tr>`;
      }

      html += `
      <details style="margin-bottom:1.5rem;">
        <summary style="cursor:pointer;padding:0.8rem 1rem;background:var(--surface-1);border:1px solid var(--border-subtle);
          border-radius:10px;font-size:0.82rem;color:var(--text-muted);font-weight:600;list-style:none;display:flex;align-items:center;gap:0.5rem;"
          onclick="this.querySelector('.chevron').classList.toggle('open')">
          <i class="fas fa-chevron-right chevron" style="font-size:0.6rem;color:${C};transition:transform 0.2s;"></i>
          Voir les ${filtered.length} actions éligibles
        </summary>
        <div style="margin-top:0.5rem;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid rgba(255,255,255,0.08);">
              <th style="text-align:left;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">#</th>
              <th style="text-align:left;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Ticker</th>
              <th style="text-align:left;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Nom</th>
              <th style="text-align:left;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Secteur</th>
              <th style="text-align:right;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Yield</th>
              <th style="text-align:right;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Carry</th>
              <th style="text-align:right;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">LTV</th>
              <th style="text-align:right;padding:0.5rem 0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Score</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </details>`;
    } else if (env.eligible === 'eu_only') {
      html += `<p style="color:#ff9800;text-align:center;padding:1rem;font-size:0.85rem;">
        Aucune action européenne éligible au PEA dans le classement actuel.</p>`;
    }

    // ── Chevron rotation CSS ──
    html += `<style>.chevron.open{transform:rotate(90deg);}</style>`;

    container.innerHTML = html;
    container.style.opacity = '1';
    // No auto-calculation — user clicks "Optimiser" button
  },

  // ── Portfolio Optimizer v3 ──
  // Constraints
  MAX_WEIGHT: 0.15,       // 15% max per position
  MIN_WEIGHT: 0.05,       // 5% min per position (was 8%, expert rec: allow differentiation)
  MAX_SECTOR_PCT: 0.25,   // 25% max per sector
  MIN_MARGIN_CALL_DD: 20, // Exclude if margin call drawdown < 20%

  // Sector correlation matrix (calibrated from covariance v7.2 benchmark)
  // Used in vol_portfolio calculation instead of assuming corr=0
  SECTOR_CORR: {
    'Finance|Finance': 0.70,
    'Finance|Immobilier': 0.55,
    'Finance|Industries': 0.35,
    'Finance|Énergie': 0.30,
    'Finance|Biens de consommation de base': 0.25,
    'Finance|Biens de consommation cycliques': 0.40,
    'Finance|La communication': 0.35,
    'Finance|Santé': 0.20,
    'Immobilier|Immobilier': 0.65,
    'Immobilier|Biens de consommation de base': 0.15,
    'Immobilier|Énergie': 0.20,
    'Industries|Industries': 0.55,
    'Industries|Énergie': 0.45,
    'Industries|Biens de consommation cycliques': 0.50,
    'Énergie|Énergie': 0.65,
    'Énergie|Biens de consommation de base': 0.10,
    'Biens de consommation de base|Biens de consommation de base': 0.50,
    'Biens de consommation de base|Santé': 0.40,
    'Biens de consommation cycliques|Biens de consommation cycliques': 0.55,
    'La communication|La communication': 0.50,
    'La communication|Biens de consommation cycliques': 0.45,
    'Santé|Santé': 0.50,
  },
  DEFAULT_CORR: 0.25,

  _getSectorCorr(sec1, sec2) {
    if (sec1 === sec2) return this.SECTOR_CORR[`${sec1}|${sec2}`] || 0.50;
    const key1 = `${sec1}|${sec2}`;
    const key2 = `${sec2}|${sec1}`;
    return this.SECTOR_CORR[key1] || this.SECTOR_CORR[key2] || this.DEFAULT_CORR;
  },

  _buildPortfolioForN(stocks, nPos, env, rate) {
    const maxPerSector = Math.max(1, Math.floor(nPos * this.MAX_SECTOR_PCT) || 1);

    // Enrich with fiscal carry + composite score for selection
    const enriched = stocks.map(s => {
      const dy = s.dividend_yield || 0;
      const yieldNet = dy * (1 - env.taxDiv);
      const carryFiscal = yieldNet - rate;
      const vol = s.volatility || 20;
      const quality = (s.quality_score || 50) / 100;
      const payout = s.payout_ratio || 50;
      const industry = (s.industry || '').toUpperCase();
      const region = (s.region || '').toUpperCase();

      // ── REIT-aware payout ──
      // REITs legally must distribute ≥90% — high payout is structural, not a red flag
      const isREIT = industry.includes('REIT');
      const payoutThreshold = isREIT ? 100 : 70;
      const payoutAdj = Math.max(0.2, Math.min(1.0, 1.0 - Math.max(0, payout - payoutThreshold) / 60));

      // ── Yield cap ── yields >8% are suspicious (stock crashing or special dividend)
      // Cap the yield used in carry calculation to avoid yield traps
      const yieldCapped = Math.min(dy, 8.0);
      const carryForScore = yieldCapped * (1 - env.taxDiv) - rate;

      // ── FX risk ── GBP stocks (UK listed in EU) have currency risk on dividends
      // ~5% haircut on composite for non-EUR European stocks
      const isGBP = region === 'EUROPE' && ['IMB','RKT','RIO','REL','BATS','ADM','GLEN','BP.','SHEL','GSK','AZN','ULVR','HSBA','VOD'].includes(s.ticker);
      const fxAdj = isGBP ? 0.95 : 1.0;

      // ── Composite: carry (35%) + quality (25%) + safety (40%) ──
      const safetyScore = Math.max(0, (35 - vol) / 35);
      const compositeScore = (0.35 * Math.max(0, carryForScore / 5) * payoutAdj
                           + 0.25 * quality
                           + 0.40 * safetyScore) * fxAdj;

      // v3.1: backend lombard_score as tiebreaker
      const backendScore = (s.lombard_score || 0) / 100;
      return { ...s, yieldNet, carryFiscal, vol, payoutAdj, compositeScore, backendScore, isREIT, isGBP };
    }).sort((a, b) => {
      const diff = b.compositeScore - a.compositeScore;
      if (Math.abs(diff) < 0.005) return b.backendScore - a.backendScore; // tiebreaker
      return diff;
    });

    // Greedy selection with constraints
    const selected = [];
    const sectorCount = {};
    for (const s of enriched) {
      if (selected.length >= nPos) break;
      // Hard constraints
      if (s.carryFiscal <= 0) continue;  // No negative carry in Lombard
      if ((s.margin_call_drawdown || 99) < this.MIN_MARGIN_CALL_DD) continue;
      const sector = s.sector || 'Autre';
      if ((sectorCount[sector] || 0) >= maxPerSector) continue;
      selected.push(s);
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    }

    if (selected.length < 2) return { portfolio: [], sharpe: -Infinity };

    // Weight by composite × payoutAdj — payout risk reduces weight, not just selection
    // A stock with payout 95% (payoutAdj=0.58) gets 42% less weight than payout 40% (payoutAdj=1.0)
    const adjusted = selected.map(s => s.compositeScore * s.payoutAdj);
    const totalAdj = adjusted.reduce((a, b) => a + b, 0);
    let weights = adjusted.map(a => totalAdj > 0 ? a / totalAdj : 1 / selected.length);

    // Iterative clamping (3 rounds)
    for (let iter = 0; iter < 3; iter++) {
      let excess = 0;
      let nFree = 0;
      weights = weights.map(w => {
        if (w > this.MAX_WEIGHT) { excess += w - this.MAX_WEIGHT; return this.MAX_WEIGHT; }
        if (w < this.MIN_WEIGHT) { excess += w - this.MIN_WEIGHT; return this.MIN_WEIGHT; }
        nFree++;
        return w;
      });
      if (Math.abs(excess) < 0.001 || nFree === 0) break;
      // Redistribute excess to unclamped
      const freeTotal = weights.reduce((s, w) => (w > this.MIN_WEIGHT && w < this.MAX_WEIGHT) ? s + w : s, 0);
      if (freeTotal > 0) {
        weights = weights.map(w => (w > this.MIN_WEIGHT && w < this.MAX_WEIGHT) ? w + excess * (w / freeTotal) : w);
      }
    }
    // Normalize to 1.0
    const wSum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / wSum);

    // Enforce sector cap on weights
    const sectorWeights = {};
    for (let i = 0; i < selected.length; i++) {
      const sec = selected[i].sector || 'Autre';
      sectorWeights[sec] = (sectorWeights[sec] || 0) + weights[i];
    }
    for (const [sec, totalW] of Object.entries(sectorWeights)) {
      if (totalW > this.MAX_SECTOR_PCT + 0.01) {
        const ratio = this.MAX_SECTOR_PCT / totalW;
        let freed = 0;
        for (let i = 0; i < selected.length; i++) {
          if ((selected[i].sector || 'Autre') === sec) {
            const newW = weights[i] * ratio;
            freed += weights[i] - newW;
            weights[i] = newW;
          }
        }
        // Redistribute to other sectors
        const otherTotal = weights.reduce((s, w, i) => (selected[i].sector || 'Autre') !== sec ? s + w : s, 0);
        if (otherTotal > 0) {
          weights = weights.map((w, i) => (selected[i].sector || 'Autre') !== sec ? w + freed * (w / otherTotal) : w);
        }
      }
    }

    const portfolio = selected.map((s, i) => ({ ...s, weight: weights[i] }));
    return { portfolio, n: selected.length };
  },

  _calcSharpe(portfolio, capital, ltv, env, rate) {
    const emprunt = capital * ltv;
    const total = capital + emprunt;
    const coutCredit = emprunt * rate / 100;
    let totalDivNet = 0;
    // Portfolio variance with sector correlation matrix
    // vol² = Σ_i Σ_j w_i × w_j × σ_i × σ_j × ρ(sector_i, sector_j)
    let portVolSq = 0;
    for (let i = 0; i < portfolio.length; i++) {
      const si = portfolio[i];
      const montant = total * si.weight;
      totalDivNet += montant * (si.dividend_yield || 0) / 100 * (1 - env.taxDiv);
      const volI = (si.volatility || 20) / 100;
      for (let j = 0; j < portfolio.length; j++) {
        const sj = portfolio[j];
        const volJ = (sj.volatility || 20) / 100;
        const corr = this._getSectorCorr(si.sector || 'Autre', sj.sector || 'Autre');
        portVolSq += si.weight * sj.weight * volI * volJ * corr;
      }
    }
    const profit = totalDivNet - coutCredit;
    const portVol = Math.sqrt(portVolSq);
    // Sharpe-like: profit / portfolio vol (higher = better risk-adjusted)
    const sharpe = portVol > 0 ? profit / (portVol * capital) : -Infinity;
    return { profit, sharpe, portVol: portVol * 100, totalDivNet };
  },

  _runOptimizer() {
    const env = this.ENVELOPES[this.state.envelope];
    const rk = this.state.rate.toFixed(1);
    const rd = this.state.rankings?.[rk];
    const resultEl = document.getElementById('lomb-opt-result');
    if (!resultEl || !rd?.stocks) return;

    const capital = parseFloat(document.getElementById('lomb-capital')?.value) || 100000;
    const ltv = (parseFloat(document.getElementById('lomb-ltv')?.value) || 60) / 100;

    const stocks = env.eligible === 'eu_only'
      ? rd.stocks.filter(s => (s.region || '').toUpperCase() === 'EUROPE')
      : rd.stocks;

    if (stocks.length === 0) {
      resultEl.innerHTML = `<p style="color:${env.color};text-align:center;padding:1rem;">Aucune action éligible</p>`;
      return;
    }

    const minN = Math.max(2, parseInt(document.getElementById('lomb-opt-min')?.value) || 3);
    const maxN = Math.min(parseInt(document.getElementById('lomb-opt-max')?.value) || 10, stocks.length);
    let bestSharpe = -Infinity;
    let bestResult = null;

    for (let n = minN; n <= maxN; n++) {
      const { portfolio } = this._buildPortfolioForN(stocks, n, env, this.state.rate);
      if (portfolio.length < 2) continue;
      const { profit, sharpe, portVol, totalDivNet } = this._calcSharpe(portfolio, capital, ltv, env, this.state.rate);
      if (sharpe > bestSharpe) {
        bestSharpe = sharpe;
        bestResult = { portfolio, n: portfolio.length, profit, sharpe, portVol, totalDivNet };
      }
    }

    if (!bestResult || bestResult.portfolio.length === 0) {
      resultEl.innerHTML = `<p style="color:${env.color};text-align:center;padding:1rem;">Aucune combinaison rentable</p>`;
      return;
    }

    const portfolio = bestResult.portfolio;
    const emprunt = capital * ltv;
    const total = capital + emprunt;
    const coutCredit = emprunt * this.state.rate / 100;
    const profitNet = bestResult.profit;
    const portVol = bestResult.portVol;
    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    let weightedYield = 0;
    let rows = '';
    const sectorTotals = {};

    for (const s of portfolio) {
      const montant = total * s.weight;
      const divNet = montant * (s.dividend_yield || 0) / 100 * (1 - env.taxDiv);
      weightedYield += s.weight * (s.dividend_yield || 0);
      const sec = s.sector || 'Autre';
      sectorTotals[sec] = (sectorTotals[sec] || 0) + s.weight;

      rows += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:0.4rem;font-family:var(--font-mono);font-weight:700;color:${env.color};">${s.ticker}</td>
        <td style="padding:0.4rem;font-size:0.78rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || ''}</td>
        <td style="padding:0.4rem;color:var(--text-muted);font-size:0.72rem;">${sec}</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);font-weight:700;">${(s.weight * 100).toFixed(0)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${fmt.format(montant)}</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${(s.dividend_yield || 0).toFixed(1)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);color:${s.carryFiscal > 0 ? '#4caf50' : '#f44336'};font-weight:700;">${s.carryFiscal > 0 ? '+' : ''}${s.carryFiscal.toFixed(1)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${fmt.format(divNet)}<span style="font-size:0.6rem;color:var(--text-muted);">/an</span></td>
      </tr>`;
    }

    const rendCapital = (profitNet / capital) * 100;
    const pColor = profitNet > 0 ? '#4caf50' : '#f44336';
    const nSectors = Object.keys(sectorTotals).length;

    resultEl.innerHTML = `
      <div style="margin-top:1rem;padding:0.6rem;background:${env.color}11;border-radius:8px;text-align:center;margin-bottom:1rem;">
        <span style="color:${env.color};font-weight:700;font-size:0.85rem;">
          Portefeuille optimal : ${bestResult.n} actions · ${nSectors} secteurs · ${env.abbr} · taux ${this.state.rate}%
        </span>
      </div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin-bottom:1rem;">
        <div style="text-align:center;min-width:80px;">
          <div style="font-size:0.55rem;text-transform:uppercase;color:var(--text-muted);">Capital total</div>
          <div style="font-size:1rem;font-weight:700;color:#fff;font-family:var(--font-mono);">${fmt.format(total)}</div>
        </div>
        <div style="text-align:center;min-width:80px;">
          <div style="font-size:0.55rem;text-transform:uppercase;color:var(--text-muted);">Dividendes net</div>
          <div style="font-size:1rem;font-weight:700;color:${env.color};font-family:var(--font-mono);">+${fmt.format(bestResult.totalDivNet)}/an</div>
        </div>
        <div style="text-align:center;min-width:80px;">
          <div style="font-size:0.55rem;text-transform:uppercase;color:var(--text-muted);">Coût crédit</div>
          <div style="font-size:1rem;font-weight:700;color:#f44336;font-family:var(--font-mono);">−${fmt.format(coutCredit)}/an</div>
        </div>
        <div style="text-align:center;min-width:80px;">
          <div style="font-size:0.55rem;text-transform:uppercase;color:var(--text-muted);">Vol. portfolio</div>
          <div style="font-size:1rem;font-weight:700;color:${portVol < 15 ? '#4caf50' : portVol < 25 ? '#ff9800' : '#f44336'};font-family:var(--font-mono);">${portVol.toFixed(1)}%</div>
        </div>
        <div style="text-align:center;padding:0.4rem 1rem;background:${profitNet > 0 ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)'};border-radius:8px;min-width:100px;">
          <div style="font-size:0.55rem;text-transform:uppercase;color:var(--text-muted);">Profit net</div>
          <div style="font-size:1.3rem;font-weight:800;color:${pColor};font-family:var(--font-mono);">${profitNet > 0 ? '+' : ''}${fmt.format(profitNet)}/an</div>
          <div style="font-size:0.65rem;color:${pColor};">${rendCapital.toFixed(1)}% sur capital propre</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
          <thead><tr style="border-bottom:2px solid rgba(255,255,255,0.08);">
            <th style="text-align:left;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Ticker</th>
            <th style="text-align:left;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Nom</th>
            <th style="text-align:left;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Secteur</th>
            <th style="text-align:right;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Poids</th>
            <th style="text-align:right;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Montant</th>
            <th style="text-align:right;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Yield</th>
            <th style="text-align:right;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Carry</th>
            <th style="text-align:right;padding:0.4rem;color:var(--text-muted);font-size:0.65rem;text-transform:uppercase;">Div net</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // (simulator removed — all results shown via optimizer)
};

// ── Auto-init when DOM ready ──
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('lombard-panel');
  const hidden = document.getElementById('lombard-section-hidden');
  if (panel && hidden) {
    panel.innerHTML = `
      <div style="padding:2rem 0;">
        <h2 style="color:#ff9800;margin:0 0 0.5rem 0;font-size:1.8rem;font-weight:800;letter-spacing:-0.5px;">
          <i class="fas fa-university" style="margin-right:0.5rem;font-size:1.4rem;"></i>Crédit Lombard
        </h2>
        <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:2rem;">Optimisez votre rendement avec l'effet de levier Lombard</p>
      </div>` + hidden.innerHTML;
    hidden.remove();
  }

  document.querySelectorAll('.portfolio-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const isLombard = tab.dataset.target === 'portfolio-lombard';
      const isTopPicks = tab.dataset.target === 'portfolio-top-picks';
      const isSpecial = isLombard || isTopPicks;
      const pfContent = document.querySelector('.portfolio-content');
      const corrSection = document.getElementById('correlation-section');
      const topPicksPanel = document.getElementById('top-picks-panel');
      if (pfContent) pfContent.style.display = isSpecial ? 'none' : 'block';
      if (corrSection) corrSection.style.display = isSpecial ? 'none' : 'block';
      if (panel) panel.style.display = isLombard ? 'block' : 'none';
      if (topPicksPanel) {
        topPicksPanel.style.display = isTopPicks ? 'block' : 'none';
        // v6.34: charge l'iframe à la demande avec cache-busting pour éviter
        // de servir une version cachée après update du HTML
        if (isTopPicks) {
          const iframe = document.getElementById('top-picks-iframe');
          if (iframe && !iframe.dataset.loaded) {
            iframe.src = 'top_picks_curated.html?_=' + Date.now();
            iframe.dataset.loaded = '1';
          }
        }
      }
      if (isLombard && !LombardRenderer.state.rankings) {
        LombardRenderer.init();
      }
    });
  });

  LombardRenderer.init();
});
