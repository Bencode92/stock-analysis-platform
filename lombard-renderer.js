/**
 * lombard-renderer.js — Lombard Credit Tab Renderer
 *
 * Self-contained renderer with explicit state management.
 * No closure dependencies — all state in LombardRenderer.state.
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
    cto: { name: 'Compte-Titres', taxDiv: 0.30, color: '#ff9800', defaultRate: 2.5, eligible: 'all' },
    pea: { name: 'PEA', taxDiv: 0.172, color: '#2196f3', defaultRate: 3.0, eligible: 'eu_only' },
    av:  { name: 'Assurance Vie', taxDiv: 0.247, color: '#4caf50', defaultRate: 2.0, eligible: 'all' },
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
    this._updateCards();
    this.render();
  },

  setRate(rate) {
    const r = parseFloat(rate);
    if (!isNaN(r) && r > 0 && r < 15) {
      this.state.rate = r;
      this.render();
    }
  },

  // ── Card highlighting ──
  _updateCards() {
    document.querySelectorAll('.envelope-card').forEach(card => {
      const env = card.dataset.env;
      const cfg = this.ENVELOPES[env];
      const active = env === this.state.envelope;
      card.style.borderColor = active ? cfg.color : 'rgba(255,255,255,0.1)';
      card.style.background = active ? cfg.color + '11' : 'rgba(255,255,255,0.02)';
    });
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

    // Find closest available rate
    const targetRate = this.state.rate;
    const closestRate = rates.reduce((prev, curr) => Math.abs(curr - targetRate) < Math.abs(prev - targetRate) ? curr : prev);
    const rd = this.state.rankings[closestRate] || this.state.rankings[String(closestRate)];
    if (!rd) { container.innerHTML = '<p style="color:var(--text-muted);">Pas de données pour ce taux</p>'; container.style.opacity = '1'; return; }

    const stocks = rd.stocks || [];
    const summary = rd.summary || {};

    // Filter by envelope
    const filtered = env.eligible === 'eu_only'
      ? stocks.filter(s => (s.region || '').toUpperCase() === 'EUROPE')
      : stocks;

    // Fiscal calculations
    const avgYieldBrut = summary.avg_yield || 0;
    const avgYieldNet = avgYieldBrut * (1 - env.taxDiv);
    const avgCarryFiscal = avgYieldNet - closestRate;

    let html = '';

    // ── Rate selector ──
    html += `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <i class="fas fa-percentage" style="color:${env.color};"></i>
        <span style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Taux Lombard</span>
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center;">
        ${rates.map(r => `
          <button onclick="LombardRenderer.setRate(${r})"
            style="padding:0.4rem 1rem;border-radius:8px;border:1px solid ${r === closestRate ? env.color : 'rgba(255,255,255,0.1)'};
              background:${r === closestRate ? env.color + '22' : 'transparent'};
              color:${r === closestRate ? env.color : 'rgba(255,255,255,0.5)'};
              font-size:0.85rem;font-weight:700;cursor:pointer;font-family:var(--font-mono);
              transition:all 0.2s;">${r}%</button>
        `).join('')}
        <span style="color:rgba(255,255,255,0.2);margin:0 0.3rem;">|</span>
        <input type="number" min="0.5" max="8" step="0.25" value="${closestRate}"
          style="width:65px;padding:0.4rem 0.5rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
            background:rgba(255,255,255,0.05);color:#fff;font-size:0.85rem;font-family:var(--font-mono);text-align:center;"
          oninput="clearTimeout(window._ld);window._ld=setTimeout(()=>LombardRenderer.setRate(this.value),400)">
        <span style="font-size:0.7rem;color:var(--text-muted);">%</span>
      </div>
      <span style="font-size:0.75rem;color:var(--text-muted);">
        ${filtered.length} éligibles${env.eligible === 'eu_only' ? ' (EU)' : ''} · Fiscalité ${Math.round(env.taxDiv * 100)}%
      </span>
    </div>`;

    // ── Summary cards ──
    html += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">Yield brut</div>
        <div style="font-size:1.4rem;font-weight:700;color:#4caf50;font-family:var(--font-mono);">${avgYieldBrut.toFixed(1)}%</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">Yield net ${env.name}</div>
        <div style="font-size:1.4rem;font-weight:700;color:${env.color};font-family:var(--font-mono);">${avgYieldNet.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">après ${Math.round(env.taxDiv*100)}% fiscalité</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">Carry net fiscal</div>
        <div style="font-size:1.4rem;font-weight:700;color:${avgCarryFiscal > 0 ? '#4caf50' : '#f44336'};font-family:var(--font-mono);">${avgCarryFiscal > 0 ? '+' : ''}${avgCarryFiscal.toFixed(1)}%</div>
        <div style="font-size:0.6rem;color:var(--text-muted);">yield net − taux ${closestRate}%</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">LTV estimé</div>
        <div style="font-size:1.4rem;font-weight:700;color:#2196f3;font-family:var(--font-mono);">${summary.avg_ltv || '?'}%</div>
      </div>
      <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem;text-align:center;">
        <div style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">Qualité</div>
        <div style="font-size:1.4rem;font-weight:700;color:#ff9800;font-family:var(--font-mono);">${summary.avg_quality_score || '?'}</div>
      </div>
    </div>`;

    // ── Simulator ──
    const avgLTV = (summary.avg_ltv || 60) / 100;
    html += `
    <div style="background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;padding:1.2rem;margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.8rem;">
        <i class="fas fa-calculator" style="color:${env.color};"></i> Simulateur Lombard
      </div>
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:end;">
        <div>
          <label style="font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;">Portefeuille nanti</label>
          <div style="position:relative;">
            <input id="lomb-capital" type="number" value="100000" min="10000" step="10000"
              style="width:130px;padding:0.5rem 2.5rem 0.5rem 0.6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
                background:rgba(255,255,255,0.05);color:#fff;font-size:0.9rem;font-family:var(--font-mono);"
              oninput="LombardRenderer._updateSim()">
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3);font-size:0.75rem;">EUR</span>
          </div>
        </div>
        <div>
          <label style="font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:0.3rem;">LTV utilisé</label>
          <input id="lomb-ltv" type="range" min="20" max="70" value="${Math.round(avgLTV * 100)}" step="5"
            style="width:120px;accent-color:${env.color};"
            oninput="document.getElementById('lomb-ltv-val').textContent=this.value+'%'; LombardRenderer._updateSim()">
          <span id="lomb-ltv-val" style="font-size:0.8rem;color:${env.color};font-weight:700;margin-left:0.3rem;">${Math.round(avgLTV * 100)}%</span>
        </div>
        <div id="lomb-sim-result" style="display:flex;gap:1.5rem;"></div>
      </div>
    </div>`;

    // ── Explanation ──
    html += `
    <div style="padding:1rem;background:rgba(255,152,0,0.05);border-left:3px solid #ff9800;border-radius:0 8px 8px 0;margin-bottom:1.5rem;">
      <p style="margin:0;line-height:1.7;font-size:0.82rem;color:rgba(255,255,255,0.7);">
        <strong style="color:#ffb74d;">Principe :</strong> Le crédit Lombard permet d'emprunter contre votre portefeuille (LTV ~60%).
        Le <strong>carry net</strong> = yield du dividende − taux Lombard. Un carry positif signifie que les dividendes couvrent le coût du crédit.
        Le <strong>carry levé</strong> intègre l'effet de levier du Lombard sur le rendement total.
        <span style="color:#ff9800;">⚠ Risque de margin call si le portefeuille chute au-delà du drawdown estimé.</span>
      </p>
    </div>`;

    // ── Table ──
    if (filtered.length === 0 && env.eligible === 'eu_only') {
      html += `<p style="color:#ff9800;text-align:center;padding:2rem;">
        <i class="fas fa-exclamation-triangle"></i> Aucune action européenne éligible au PEA dans le classement actuel.</p>`;
    } else {
      html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
        <thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);">
          <th style="text-align:left;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">#</th>
          <th style="text-align:left;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Ticker</th>
          <th style="text-align:left;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Nom</th>
          <th style="text-align:left;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Secteur</th>
          <th style="text-align:right;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Yield brut</th>
          <th style="text-align:right;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Yield net</th>
          <th style="text-align:right;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Carry fiscal</th>
          <th style="text-align:right;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">LTV</th>
          <th style="text-align:right;padding:0.6rem 0.4rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Score</th>
        </tr></thead><tbody>`;

      for (let i = 0; i < filtered.length; i++) {
        const s = filtered[i];
        const yieldNet = (s.dividend_yield || 0) * (1 - env.taxDiv);
        const carryFiscal = yieldNet - closestRate;
        const carryColor = carryFiscal > 0 ? '#4caf50' : '#f44336';
        const scoreColor = (s.lombard_score || 0) >= 70 ? '#4caf50' : (s.lombard_score || 0) >= 50 ? '#ff9800' : '#f44336';
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
          <td style="padding:0.5rem 0.4rem;color:var(--text-muted);">${i + 1}</td>
          <td style="padding:0.5rem 0.4rem;font-family:var(--font-mono);font-weight:700;color:${env.color};">${s.ticker}</td>
          <td style="padding:0.5rem 0.4rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || ''}</td>
          <td style="padding:0.5rem 0.4rem;color:var(--text-secondary);font-size:0.75rem;">${s.sector || ''}</td>
          <td style="text-align:right;padding:0.5rem 0.4rem;font-family:var(--font-mono);color:#4caf50;">${(s.dividend_yield || 0).toFixed(1)}%</td>
          <td style="text-align:right;padding:0.5rem 0.4rem;font-family:var(--font-mono);color:${env.color};">${yieldNet.toFixed(1)}%</td>
          <td style="text-align:right;padding:0.5rem 0.4rem;font-family:var(--font-mono);color:${carryColor};font-weight:700;">${carryFiscal > 0 ? '+' : ''}${carryFiscal.toFixed(1)}%</td>
          <td style="text-align:right;padding:0.5rem 0.4rem;font-family:var(--font-mono);">${s.ltv_estimated || '?'}%</td>
          <td style="text-align:right;padding:0.5rem 0.4rem;font-family:var(--font-mono);font-weight:700;color:${scoreColor};">${Math.round(s.lombard_score || 0)}</td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    }

    container.innerHTML = html;
    container.style.opacity = '1';

    // Trigger simulator update
    setTimeout(() => this._updateSim(), 50);
  },

  // ── Simulator calculation ──
  _updateSim() {
    const capital = parseFloat(document.getElementById('lomb-capital')?.value) || 100000;
    const ltv = (parseFloat(document.getElementById('lomb-ltv')?.value) || 60) / 100;
    const env = this.ENVELOPES[this.state.envelope];
    const rate = this.state.rate;
    const rd = this.state.rankings?.[rate] || this.state.rankings?.[String(rate)];
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
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;">Emprunt</div>
        <div style="font-size:1.1rem;font-weight:700;color:${env.color};font-family:var(--font-mono);">${fmt.format(emprunt)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;">Coût crédit/an</div>
        <div style="font-size:1.1rem;font-weight:700;color:#f44336;font-family:var(--font-mono);">-${fmt.format(coutAnnuel)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;">Revenu net/an</div>
        <div style="font-size:1.1rem;font-weight:700;color:#4caf50;font-family:var(--font-mono);">+${fmt.format(revenuNet)}</div>
      </div>
      <div style="text-align:center;padding:0.4rem 1rem;background:${profit > 0 ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)'};border-radius:8px;">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;">Profit net/an</div>
        <div style="font-size:1.3rem;font-weight:800;color:${profit > 0 ? '#4caf50' : '#f44336'};font-family:var(--font-mono);">${profit > 0 ? '+' : ''}${fmt.format(profit)}</div>
        <div style="font-size:0.65rem;color:${profit > 0 ? '#81c784' : '#ef9a9a'};">${rendement.toFixed(1)}% sur capital propre</div>
      </div>`;
  },
};

// ── Auto-init when DOM ready ──
document.addEventListener('DOMContentLoaded', () => {
  // Move hidden section content to panel
  const panel = document.getElementById('lombard-panel');
  const hidden = document.getElementById('lombard-section-hidden');
  if (panel && hidden) {
    panel.innerHTML = `
      <div style="padding:2rem 0;">
        <h2 style="color:#ff9800;margin:0 0 0.5rem 0;font-size:1.8rem;font-weight:800;letter-spacing:-0.5px;">
          <i class="fas fa-university" style="margin-right:0.5rem;font-size:1.4rem;"></i>Crédit Lombard
        </h2>
        <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:2rem;">Optimisez votre rendement — comparaison par enveloppe fiscale</p>
      </div>` + hidden.innerHTML;
    hidden.remove();
  }

  // Tab switching
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

  // Pre-load data (lazy)
  LombardRenderer.init();
});
