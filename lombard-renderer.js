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
    cto: { name: 'Compte-Titres', taxDiv: 0.30, abbr: 'CTO', defaultRate: 2.5, eligible: 'all' },
    pea: { name: 'PEA', taxDiv: 0.172, abbr: 'PEA', defaultRate: 3.0, eligible: 'eu_only' },
    av:  { name: 'Assurance Vie', taxDiv: 0.247, abbr: 'AV', defaultRate: 2.0, eligible: 'all' },
  },

  C: '#ff9800', // Primary accent color

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
            style="padding:0.5rem 1rem;border-radius:8px;border:1px solid ${active ? '#ff9800' : 'rgba(255,255,255,0.1)'};
              background:${active ? 'rgba(255,152,0,0.15)' : 'transparent'};
              color:${active ? '#ff9800' : 'rgba(255,255,255,0.5)'};
              font-size:0.82rem;font-weight:${active ? '700' : '500'};cursor:pointer;transition:all 0.2s;">${cfg.abbr}</button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:0.3rem;align-items:center;">
        ${rates.map(r => {
          const active = r === closestRate;
          return `<button onclick="LombardRenderer.setRate(${r})"
            style="padding:0.4rem 0.8rem;border-radius:6px;border:1px solid ${active ? '#ff9800' : 'rgba(255,255,255,0.08)'};
              background:${active ? 'rgba(255,152,0,0.15)' : 'transparent'};
              color:${active ? '#ff9800' : 'rgba(255,255,255,0.4)'};
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
        <div style="font-size:1.5rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">${avgYieldNet.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">après ${Math.round(env.taxDiv*100)}% fiscalité</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Carry net fiscal</div>
        <div style="font-size:1.5rem;font-weight:700;color:${avgCarryFiscal > 0 ? '#4caf50' : '#f44336'};font-family:var(--font-mono);">${avgCarryFiscal > 0 ? '+' : ''}${avgCarryFiscal.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">yield net − taux ${closestRate}%</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">LTV estimé</div>
        <div style="font-size:1.5rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">${avgLTV}%</div>
      </div>
    </div>`;

    // ═══════════════════════════════════════════════════
    // SECTION 3: Simulateur unifié (sim + optimiseur)
    // ═══════════════════════════════════════════════════
    html += `
    <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1.2rem;margin-bottom:1.5rem;">
      <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem;">
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">Montant</label>
          <div style="position:relative;">
            <input id="lomb-capital" type="number" value="100000" min="10000" step="10000"
              style="width:120px;padding:0.5rem 2rem 0.5rem 0.6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
                background:rgba(255,255,255,0.05);color:#fff;font-size:0.9rem;font-family:var(--font-mono);"
              oninput="LombardRenderer._updateSim()">
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3);font-size:0.7rem;">€</span>
          </div>
        </div>
        <div>
          <label style="font-size:0.65rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;text-transform:uppercase;">LTV</label>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <input id="lomb-ltv" type="range" min="20" max="70" value="${avgLTV}" step="5"
              style="width:100px;accent-color:#ff9800;"
              oninput="document.getElementById('lomb-ltv-val').textContent=this.value+'%'; LombardRenderer._updateSim()">
            <span id="lomb-ltv-val" style="font-size:0.8rem;color:#ff9800;font-weight:700;font-family:var(--font-mono);">${avgLTV}%</span>
          </div>
        </div>
        <div id="lomb-sim-result" style="display:flex;gap:1.2rem;flex-wrap:wrap;"></div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:1rem;">
        <button onclick="LombardRenderer._runOptimizer()"
          style="padding:0.6rem 1.5rem;border-radius:8px;border:none;background:linear-gradient(135deg,#ff9800,#f57c00);
            color:#000;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;"
          onmouseover="this.style.transform='scale(1.02)';this.style.boxShadow='0 4px 15px rgba(255,152,0,0.3)'"
          onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
          <i class="fas fa-bolt" style="margin-right:0.3rem;"></i> Optimiser le portefeuille
        </button>
        <span style="font-size:0.72rem;color:var(--text-muted);margin-left:0.8rem;">
          Trouve le meilleur nombre d'actions et allocation pour maximiser le profit
        </span>
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
          <td style="padding:0.4rem;font-family:var(--font-mono);font-weight:700;color:#ff9800;font-size:0.8rem;">${s.ticker}</td>
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
          <i class="fas fa-chevron-right chevron" style="font-size:0.6rem;color:#ff9800;transition:transform 0.2s;"></i>
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
    setTimeout(() => this._updateSim(), 50);
  },

  // ── Portfolio Optimizer ──
  _buildPortfolioForN(stocks, nPos, env, rate) {
    const maxPerSector = Math.max(1, Math.ceil(nPos * 0.4));
    const selected = [];
    const sectorCount = {};

    const ranked = stocks.map(s => {
      const yieldNet = (s.dividend_yield || 0) * (1 - env.taxDiv);
      return { ...s, yieldNet, carryFiscal: yieldNet - rate };
    }).sort((a, b) => b.carryFiscal - a.carryFiscal);

    for (const s of ranked) {
      if (selected.length >= nPos) break;
      const sector = s.sector || 'Autre';
      if ((sectorCount[sector] || 0) >= maxPerSector) continue;
      if (s.carryFiscal <= -1) continue;
      selected.push(s);
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    }

    if (selected.length < 2) return { portfolio: [], profit: -Infinity };

    const shifted = selected.map(s => Math.max(0.1, s.carryFiscal + 3));
    const totalShift = shifted.reduce((a, b) => a + b, 0);
    const portfolio = selected.map((s, i) => ({ ...s, weight: shifted[i] / totalShift }));
    return { portfolio, n: selected.length };
  },

  _calcProfit(portfolio, capital, ltv, env, rate) {
    const emprunt = capital * ltv;
    const total = capital + emprunt;
    const coutCredit = emprunt * rate / 100;
    let totalDivNet = 0;
    for (const s of portfolio) {
      const montant = total * s.weight;
      totalDivNet += montant * (s.dividend_yield || 0) / 100 * (1 - env.taxDiv);
    }
    return totalDivNet - coutCredit;
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
      resultEl.innerHTML = '<p style="color:#ff9800;text-align:center;padding:1rem;">Aucune action éligible</p>';
      return;
    }

    const maxN = Math.min(15, stocks.length);
    let bestProfit = -Infinity;
    let bestResult = null;

    for (let n = 2; n <= maxN; n++) {
      const { portfolio } = this._buildPortfolioForN(stocks, n, env, this.state.rate);
      if (portfolio.length < 2) continue;
      const profit = this._calcProfit(portfolio, capital, ltv, env, this.state.rate);
      if (profit > bestProfit) {
        bestProfit = profit;
        bestResult = { portfolio, n: portfolio.length, profit };
      }
    }

    if (!bestResult || bestResult.portfolio.length === 0) {
      resultEl.innerHTML = '<p style="color:#ff9800;text-align:center;padding:1rem;">Aucune combinaison rentable</p>';
      return;
    }

    const portfolio = bestResult.portfolio;
    const emprunt = capital * ltv;
    const total = capital + emprunt;
    const coutCredit = emprunt * this.state.rate / 100;
    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    let totalDivNet = 0;
    let weightedYield = 0;
    let rows = '';

    for (const s of portfolio) {
      const montant = total * s.weight;
      const divNet = montant * (s.dividend_yield || 0) / 100 * (1 - env.taxDiv);
      totalDivNet += divNet;
      weightedYield += s.weight * (s.dividend_yield || 0);

      rows += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:0.4rem;font-family:var(--font-mono);font-weight:700;color:#ff9800;">${s.ticker}</td>
        <td style="padding:0.4rem;font-size:0.78rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || ''}</td>
        <td style="padding:0.4rem;color:var(--text-muted);font-size:0.72rem;">${s.sector || ''}</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);font-weight:700;">${(s.weight * 100).toFixed(0)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${fmt.format(montant)}</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${(s.dividend_yield || 0).toFixed(1)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);color:${s.carryFiscal > 0 ? '#4caf50' : '#f44336'};font-weight:700;">${s.carryFiscal > 0 ? '+' : ''}${s.carryFiscal.toFixed(1)}%</td>
        <td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);">${fmt.format(divNet)}<span style="font-size:0.6rem;color:var(--text-muted);">/an</span></td>
      </tr>`;
    }

    const profitNet = totalDivNet - coutCredit;
    const rendCapital = (profitNet / capital) * 100;
    const pColor = profitNet > 0 ? '#4caf50' : '#f44336';

    resultEl.innerHTML = `
      <div style="margin-top:1rem;padding:0.6rem;background:rgba(255,152,0,0.06);border-radius:8px;text-align:center;margin-bottom:1rem;">
        <span style="color:#ff9800;font-weight:700;font-size:0.85rem;">
          Portefeuille optimal : ${bestResult.n} actions · ${env.abbr} · taux ${this.state.rate}%
        </span>
      </div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin-bottom:1rem;">
        <div style="text-align:center;min-width:90px;">
          <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);">Capital total</div>
          <div style="font-size:1rem;font-weight:700;color:#fff;font-family:var(--font-mono);">${fmt.format(total)}</div>
        </div>
        <div style="text-align:center;min-width:90px;">
          <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);">Dividendes net</div>
          <div style="font-size:1rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">+${fmt.format(totalDivNet)}/an</div>
        </div>
        <div style="text-align:center;min-width:90px;">
          <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);">Coût crédit</div>
          <div style="font-size:1rem;font-weight:700;color:#f44336;font-family:var(--font-mono);">−${fmt.format(coutCredit)}/an</div>
        </div>
        <div style="text-align:center;padding:0.4rem 1rem;background:${profitNet > 0 ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)'};border-radius:8px;min-width:100px;">
          <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);">Profit net</div>
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

  // ── Simulator calculation (live) ──
  _updateSim() {
    const capital = parseFloat(document.getElementById('lomb-capital')?.value) || 100000;
    const ltv = (parseFloat(document.getElementById('lomb-ltv')?.value) || 60) / 100;
    const env = this.ENVELOPES[this.state.envelope];
    const rate = this.state.rate;
    const rk = rate.toFixed(1);
    const rd = this.state.rankings?.[rk] || this.state.rankings?.[String(rate)];
    const avgYield = rd?.summary?.avg_yield || 5.0;

    const emprunt = capital * ltv;
    const total = capital + emprunt;
    const coutAnnuel = emprunt * rate / 100;
    const revenuNet = total * avgYield / 100 * (1 - env.taxDiv);
    const profit = revenuNet - coutAnnuel;
    const rendement = (profit / capital) * 100;

    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const el = document.getElementById('lomb-sim-result');
    if (!el) return;

    el.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;">Emprunt</div>
        <div style="font-size:1rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">${fmt.format(emprunt)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;">Coût crédit/an</div>
        <div style="font-size:1rem;font-weight:700;color:#f44336;font-family:var(--font-mono);">−${fmt.format(coutAnnuel)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;">Revenu net/an</div>
        <div style="font-size:1rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">+${fmt.format(revenuNet)}</div>
      </div>
      <div style="text-align:center;padding:0.3rem 0.8rem;background:${profit > 0 ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)'};border-radius:8px;">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;">Profit net/an</div>
        <div style="font-size:1.2rem;font-weight:800;color:${profit > 0 ? '#4caf50' : '#f44336'};font-family:var(--font-mono);">${profit > 0 ? '+' : ''}${fmt.format(profit)}</div>
        <div style="font-size:0.6rem;color:${profit > 0 ? '#81c784' : '#ef9a9a'};">${rendement.toFixed(1)}% sur capital</div>
      </div>`;
  },
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
      const pfContent = document.querySelector('.portfolio-content');
      const corrSection = document.getElementById('correlation-section');
      if (pfContent) pfContent.style.display = isLombard ? 'none' : 'block';
      if (corrSection) corrSection.style.display = isLombard ? 'none' : 'block';
      if (panel) panel.style.display = isLombard ? 'block' : 'none';
      if (isLombard && !LombardRenderer.state.rankings) {
        LombardRenderer.init();
      }
    });
  });

  LombardRenderer.init();
});
