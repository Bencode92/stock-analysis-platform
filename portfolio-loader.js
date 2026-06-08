/**
 * Portfolio Loader v3.0 — Redesigned with Turnover Tracking
 * - Aesthetic overhaul: editorial financial layout
 * - Turnover: entries, exits, weight changes vs previous version
 * - Position explanations: why each asset was selected
 * - Market context: regime/macro interpretation
 * - AMF compliance preserved
 */

class PortfolioManagerV3 {
  constructor() {
    this.portfolios = null;
    this.previousPortfolios = null;
    this.meta = null;
    this.previousMeta = null;
    this.lastUpdate = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════

  cleanJSON(text) {
    return text.replace(/\bNaN\b/g, 'null').replace(/\bInfinity\b/g, 'null').replace(/\b-Infinity\b/g, 'null');
  }

  async fetchJSON(paths) {
    const ts = Date.now();
    for (const p of paths) {
      try {
        const r = await fetch(`${p}?_=${ts}`);
        if (r.ok) {
          const t = await r.text();
          return JSON.parse(this.cleanJSON(t));
        }
      } catch {}
    }
    return null;
  }

  async loadPortfolios() {
    const paths = [
      'data/portfolios.json', './data/portfolios.json',
      '/stock-analysis-platform/data/portfolios.json',
      `https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/data/portfolios.json`
    ];
    const prevPaths = [
      'data/portfolios_previous.json', './data/portfolios_previous.json',
      '/stock-analysis-platform/data/portfolios_previous.json',
      `https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/data/portfolios_previous.json`
    ];

    const data = await this.fetchJSON(paths);
    if (!data) throw new Error('Impossible de charger portfolios.json');

    this.meta = data._meta || { version: '?', generated_at: new Date().toISOString(), backtest_days: 90 };
    this.portfolios = {};
    for (const k of Object.keys(data)) { if (!k.startsWith('_')) this.portfolios[k] = data[k]; }
    this.lastUpdate = this.meta.generated_at ? new Date(this.meta.generated_at) : new Date();

    // v6.24: charge asian_alternatives.json pour le panel "comment acheter" sur actions asiatiques
    const asianPaths = [
      'data/asian_alternatives.json', './data/asian_alternatives.json',
      '/stock-analysis-platform/data/asian_alternatives.json',
      `https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/data/asian_alternatives.json`
    ];
    const asianData = await this.fetchJSON(asianPaths);
    this.asianAlternatives = asianData ? (asianData.stocks || {}) : {};

    // Try loading previous version for turnover
    const prev = await this.fetchJSON(prevPaths);
    if (prev) {
      this.previousMeta = prev._meta || {};
      this.previousPortfolios = {};
      for (const k of Object.keys(prev)) { if (!k.startsWith('_')) this.previousPortfolios[k] = prev[k]; }
      console.log('📊 Previous portfolio loaded for turnover tracking');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TURNOVER COMPUTATION
  // ═══════════════════════════════════════════════════════════════════

  computeTurnover(current, previous) {
    if (!previous) return null;
    const allAssets = new Map(); // name → { current, previous, category }
    const categories = ['Actions', 'ETF', 'Obligations', 'Crypto'];

    for (const cat of categories) {
      const curr = current[cat] || {};
      const prev = previous[cat] || {};
      for (const [name, val] of Object.entries(curr)) {
        const w = parseFloat(String(val).replace('%', '')) || 0;
        if (w > 0) allAssets.set(name, { ...allAssets.get(name), current: w, category: cat });
      }
      for (const [name, val] of Object.entries(prev)) {
        const w = parseFloat(String(val).replace('%', '')) || 0;
        if (w > 0) {
          const existing = allAssets.get(name) || { category: cat };
          allAssets.set(name, { ...existing, previous: w, category: existing.category || cat });
        }
      }
    }

    const entries = [], exits = [], changes = [], unchanged = [];
    for (const [name, data] of allAssets) {
      const c = data.current || 0, p = data.previous || 0;
      const delta = c - p;
      if (p === 0 && c > 0) entries.push({ name, weight: c, category: data.category });
      else if (c === 0 && p > 0) exits.push({ name, weight: p, category: data.category });
      else if (Math.abs(delta) >= 0.5) changes.push({ name, current: c, previous: p, delta, category: data.category });
      else unchanged.push({ name, weight: c, category: data.category });
    }

    entries.sort((a, b) => b.weight - a.weight);
    exits.sort((a, b) => b.weight - a.weight);
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const totalTurnover = (entries.reduce((s, e) => s + e.weight, 0) +
      exits.reduce((s, e) => s + e.weight, 0) +
      changes.reduce((s, e) => s + Math.abs(e.delta), 0)) / 2;

    return { entries, exits, changes, unchanged, totalTurnover: Math.round(totalTurnover * 10) / 10 };
  }

  // ═══════════════════════════════════════════════════════════════════
  // UI RENDERING
  // ═══════════════════════════════════════════════════════════════════

  normalizeType(t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  getProfileConfig(type) {
    const n = this.normalizeType(type);
    if (n.includes('dividende-pea') || n.includes('dividende pea')) return { color: '#be50ff', bg: 'rgba(190,80,255,0.08)', icon: 'fa-seedling', label: 'Dividende PEA', risk: 'Modéré', horizon: '10+ ans' };
    if (n.includes('dividende-cto') || n.includes('dividende cto')) return { color: '#ffb43c', bg: 'rgba(255,180,60,0.08)', icon: 'fa-coins', label: 'Dividende CTO', risk: 'Modéré', horizon: '10+ ans' };
    if (n.includes('agressif-thematique') || n.includes('agressif thematique')) return { color: '#FF3D7F', bg: 'rgba(255,61,127,0.08)', icon: 'fa-fire', label: 'Agressif Thématique', risk: 'Très élevé', horizon: '7-10 ans' };
    if (n.includes('agressif')) return { color: '#FF7B00', bg: 'rgba(255,123,0,0.08)', icon: 'fa-rocket', label: 'Agressif', risk: 'Élevé', horizon: '5+ ans' };
    if (n.includes('stable')) return { color: '#00B2FF', bg: 'rgba(0,178,255,0.08)', icon: 'fa-shield-alt', label: 'Stable', risk: 'Faible', horizon: '1-3 ans' };
    return { color: '#00FF87', bg: 'rgba(0,255,135,0.08)', icon: 'fa-balance-scale', label: 'Modéré', risk: 'Modéré', horizon: '3-5 ans' };
  }

  getCatIcon(c) {
    return { Actions: 'fa-chart-line', ETF: 'fa-layer-group', Obligations: 'fa-file-contract', Crypto: 'fa-coins' }[c] || 'fa-cube';
  }

  getCatColor(c) {
    return { Actions: '#FF6B6B', ETF: '#4ECDC4', Obligations: '#45B7D1', Crypto: '#FFA07A' }[c] || '#888';
  }

  formatDate(d) {
    if (!d) return 'N/A';
    try { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)); } catch { return 'N/A'; }
  }

  // ── Main render ──

  async init() {
    const container = document.querySelector('.portfolio-container');
    if (!container) return;
    try {
      const _loading = container.querySelector('.portfolio-loading');
      if (_loading) _loading.style.display = 'flex';
      await this.loadPortfolios();
      this.render(container);
      if (_loading) _loading.style.display = 'none';
    } catch (e) {
      const _pl = container.querySelector('.portfolio-loading');
      if (_pl) _pl.style.display = 'none';
      const err = container.querySelector('.portfolio-error');
      if (err) { err.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${e.message}`; err.style.display = 'block'; }
    }
  }

  render(container) {
    // Update header info
    const vEl = document.getElementById('portfolioVersion');
    if (vEl) vEl.textContent = this.meta.version || 'N/A';
    const tEl = document.getElementById('portfolioUpdateTime');
    if (tEl) tEl.textContent = this.formatDate(this.lastUpdate);
    const uEl = document.getElementById('updateTime');
    if (uEl) uEl.textContent = this.formatDate(this.lastUpdate);

    const types = Object.keys(this.portfolios);
    const content = document.createElement('div');
    content.className = 'portfolio-content';

    types.forEach((type, i) => {
      const panel = document.createElement('div');
      panel.className = `portfolio-panel ${i === 0 ? 'active' : ''}`;
      panel.id = `portfolio-${this.normalizeType(type)}`;
      panel.style.display = i === 0 ? 'block' : 'none';
      panel.innerHTML = this.renderPortfolio(type, this.portfolios[type]);
      content.appendChild(panel);
    });

    const old = container.querySelector('.portfolio-content');
    if (old) old.remove();
    container.appendChild(content);

    // Charts
    setTimeout(() => this.initCharts(), 150);

    // Tab interactions
    document.querySelectorAll('.portfolio-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.portfolio-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.portfolio-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.target);
        if (target) { target.classList.add('active'); target.style.display = 'block'; }
        const title = document.getElementById('portfolioTitle');
        if (title) title.textContent = `PORTEFEUILLE ${(tab.dataset.originalType || '').toUpperCase()}`;
      });
    });
  }

  // ── Single portfolio ──

  renderPortfolio(type, portfolio) {
    const cfg = this.getProfileConfig(type);
    const opt = portfolio._optimization || {};
    const constraints = portfolio._constraint_report || {};
    const exposures = portfolio._exposures || {};
    const limitations = portfolio._limitations || [];
    const comment = portfolio.Commentaire || 'Portefeuille optimisé selon les conditions de marché actuelles.';
    const prevPortfolio = this.previousPortfolios?.[type] || null;
    const turnover = this.computeTurnover(portfolio, prevPortfolio);

    let html = '';

    // ── Header with risk profile ──
    html += `
    <div class="pf-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;flex-wrap:wrap;gap:1rem;">
      <div>
        <h2 style="color:${cfg.color};margin:0 0 0.5rem 0;font-size:1.8rem;font-weight:800;letter-spacing:-0.5px;">
          <i class="fas ${cfg.icon}" style="margin-right:0.5rem;font-size:1.4rem;"></i>${type}
        </h2>
        <div style="display:flex;gap:1rem;font-size:0.8rem;color:rgba(255,255,255,0.5);">
          <span><i class="fas fa-signal" style="margin-right:4px;"></i>Risque: <strong style="color:${cfg.color}">${cfg.risk}</strong></span>
          <span><i class="fas fa-clock" style="margin-right:4px;"></i>Horizon: <strong>${cfg.horizon}</strong></span>
          <span><i class="fas ${opt.is_heuristic ? 'fa-cogs' : 'fa-calculator'}" style="margin-right:4px;"></i>${opt.is_heuristic ? 'Heuristique' : 'Markowitz SLSQP'}</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        ${this.renderBadge('Vol', `${(opt.vol_realized || 0).toFixed(1)}%`, cfg.color)}
        ${constraints.quality_score ? this.renderBadge('Qualité', `${constraints.quality_score.toFixed(0)}%`, constraints.quality_score >= 85 ? '#4caf50' : '#ff9800') : ''}
        ${exposures.concentration ? this.renderBadge('HHI', Math.round(exposures.concentration.hhi || 0), exposures.concentration.hhi < 1500 ? '#4caf50' : '#ff9800') : ''}
      </div>
    </div>`;

    // ── Market context / Commentary ──
    html += `
    <div class="pf-context" style="position:relative;border-left:4px solid ${cfg.color};padding:1.25rem 1.5rem;background:${cfg.bg};margin-bottom:2rem;border-radius:0 12px 12px 0;">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
        <i class="fas fa-globe" style="color:${cfg.color};"></i>
        <span style="font-weight:700;font-size:0.9rem;color:${cfg.color};">Contexte & Stratégie</span>
      </div>
      <p style="margin:0;line-height:1.7;font-size:0.92rem;color:rgba(255,255,255,0.85);">${comment}</p>
    </div>`;

    // ── Chart + Allocation overview ──
    const normalizedType = this.normalizeType(type);
    html += `
    <div style="display:grid;grid-template-columns:280px 1fr;gap:2rem;margin-bottom:2rem;align-items:start;">
      <div style="background:rgba(255,255,255,0.02);border-radius:12px;padding:1.25rem;height:260px;">
        <canvas id="chart-${normalizedType}"></canvas>
      </div>
      <div>
        <h3 style="margin:0 0 1rem 0;font-size:0.95rem;font-weight:700;color:rgba(255,255,255,0.7);">
          <i class="fas fa-th-large" style="margin-right:6px;"></i>Répartition par classe
        </h3>
        ${this.renderAllocationBars(portfolio, cfg.color)}
      </div>
    </div>`;

    // ── Turnover section ──
    if (turnover && (turnover.entries.length || turnover.exits.length || turnover.changes.length)) {
      html += this.renderTurnover(turnover, cfg);
    }

    // ── Positions detail by category ──
    // v7.3: Investment amount calculator
    const amountId = `invest-amount-${normalizedType}`;
    html += `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;padding:1rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <i class="fas fa-calculator" style="color:${cfg.color};font-size:1.1rem;"></i>
      <label style="font-size:0.85rem;color:rgba(255,255,255,0.6);white-space:nowrap;">Montant à investir</label>
      <div style="position:relative;flex:0 0 180px;">
        <input id="${amountId}" type="number" placeholder="10 000" min="0" step="100"
               style="width:100%;padding:0.5rem 2.5rem 0.5rem 0.75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
                      background:rgba(255,255,255,0.05);color:#fff;font-size:0.95rem;font-family:'JetBrains Mono',monospace;
                      outline:none;transition:border 0.2s;"
               onfocus="this.style.borderColor='${cfg.color}'" onblur="this.style.borderColor='rgba(255,255,255,0.12)'"
               oninput="window._updateAmounts && window._updateAmounts('${normalizedType}', this.value)">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.35);font-size:0.8rem;">EUR</span>
      </div>
      <span id="amount-hint-${normalizedType}" style="font-size:0.75rem;color:rgba(255,255,255,0.35);"></span>
    </div>`;

    html += `<h3 style="margin:0 0 1.25rem 0;font-size:1rem;font-weight:700;color:rgba(255,255,255,0.8);">
      <i class="fas fa-list-ul" style="margin-right:6px;"></i>Positions détaillées
    </h3>`;
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem;margin-bottom:2rem;">';

    for (const cat of ['Actions', 'ETF', 'Obligations', 'Crypto']) {
      const assets = portfolio[cat];
      if (!assets || !Object.keys(assets).length) continue;
      const sorted = Object.entries(assets)
        .map(([n, v]) => ({ name: n, weight: parseFloat(String(v).replace('%', '')) || 0 }))
        .filter(a => a.weight > 0)
        .sort((a, b) => b.weight - a.weight);
      if (!sorted.length) continue;

      const prevCat = prevPortfolio?.[cat] || {};
      const catColor = this.getCatColor(cat);

      html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:1.25rem;border-top:3px solid ${catColor};">
        <h4 style="margin:0 0 1rem 0;color:${catColor};font-size:0.9rem;display:flex;align-items:center;gap:0.5rem;">
          <i class="fas ${this.getCatIcon(cat)}"></i>${cat}
          <span style="margin-left:auto;font-size:0.75rem;color:rgba(255,255,255,0.4);">${sorted.length} positions</span>
        </h4>`;

      // v7.3: Build asset details lookup from _asset_details
      const assetDetails = (portfolio._asset_details || []).reduce((m, d) => {
        if (d.ticker) m[d.ticker] = d;
        if (d.name) m[d.name] = d;
        return m;
      }, {});

      for (const a of sorted) {
        const prevW = parseFloat(String(prevCat[a.name] || 0).replace('%', '')) || 0;
        const delta = prevW > 0 ? a.weight - prevW : null;
        const isNew = prevW === 0;

        // v7.3: Find asset details for tooltip
        const detail = assetDetails[a.name] || Object.values(assetDetails).find(d =>
          a.name.includes(d.ticker) || (d.name && a.name.includes(d.name))
        );
        const ticker = detail?.ticker || a.name.match(/\(([A-Z]{1,5})\)/)?.[1] || '';
        const rationale = detail?.rationale || '';
        const role = detail?.role || '';
        const riskNote = detail?.risk_note || '';
        const metrics = detail?.metrics || {};
        const sector = detail?.sector || '';
        const country = detail?.country || '';
        const contextLink = detail?.market_context_link || '';

        // Build role badge
        const roleBadge = role ? `<span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:${
          role === 'core' ? 'rgba(33,150,243,0.15);color:#64b5f6' :
          role === 'satellite' ? 'rgba(255,152,0,0.15);color:#ffb74d' :
          role === 'defensive' || role === 'income' ? 'rgba(76,175,80,0.15);color:#81c784' :
          'rgba(255,255,255,0.08);color:rgba(255,255,255,0.5)'
        };font-weight:600;text-transform:uppercase;">${role}</span>` : '';

        // Build metrics chips
        const chips = [];
        if (metrics.roe) chips.push(`ROE ${metrics.roe.toFixed(0)}%`);
        if (metrics.pe_ratio) chips.push(`P/E ${metrics.pe_ratio.toFixed(1)}`);
        if (metrics.dividend_yield) chips.push(`Div ${metrics.dividend_yield.toFixed(1)}%`);
        if (metrics.buffett_score) chips.push(`Buffett ${Math.round(metrics.buffett_score)}`);
        if (metrics.volatility) chips.push(`Vol ${metrics.volatility.toFixed(0)}%`);

        // v6.24: mapping asiatique (ADR/alternatives ACTION/ETF dernier recours)
        const asianMapping = this.asianAlternatives?.[ticker];
        const hasDetail = rationale || chips.length > 0 || asianMapping;
        const detailId = `detail-${ticker || a.name.replace(/[^a-zA-Z0-9]/g, '')}`;

        html += `
        <div class="asset-row" style="padding:0.6rem 0;border-bottom:1px solid rgba(255,255,255,0.04);${hasDetail ? 'cursor:pointer;' : ''}"
             ${hasDetail ? `onclick="document.getElementById('${detailId}').style.display = document.getElementById('${detailId}').style.display === 'none' ? 'block' : 'none'"` : ''}>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                ${ticker ? `<span style="font-size:0.75rem;font-family:'JetBrains Mono',monospace;color:${catColor};font-weight:700;min-width:40px;">${ticker}</span>` : ''}
                <span style="font-size:0.85rem;font-weight:600;line-height:1.3;word-break:break-word;flex:1;min-width:0;" title="${a.name.replace(/"/g, '&quot;')}">${a.name.replace(` (${ticker})`, '').replace(ticker, '').trim() || a.name}</span>
                ${roleBadge}
                ${isNew ? '<span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:rgba(76,175,80,0.2);color:#4caf50;font-weight:700;">NEW</span>' : ''}
                ${hasDetail ? '<i class="fas fa-chevron-down" style="font-size:0.5rem;color:rgba(255,255,255,0.25);margin-left:auto;"></i>' : ''}
              </div>
              <div style="margin-top:4px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                <div style="width:${Math.min(a.weight * 2.5, 100)}%;height:100%;background:${catColor};border-radius:2px;"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <span style="font-size:0.95rem;font-weight:700;color:${catColor};">${a.weight}%</span>
              <div class="amount-display" data-pf="${normalizedType}" data-weight="${a.weight}" style="font-size:0.75rem;color:rgba(255,255,255,0.4);font-family:'JetBrains Mono',monospace;display:none;"></div>
              ${delta !== null && Math.abs(delta) >= 0.5 ? `<div style="font-size:0.7rem;color:${delta > 0 ? '#4caf50' : '#f44336'};font-weight:600;">${delta > 0 ? '+' : ''}${delta.toFixed(1)}%</div>` : ''}
            </div>
          </div>
          ${hasDetail ? `
          <div id="${detailId}" style="display:none;margin-top:0.6rem;padding:0.8rem;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid ${catColor};">
            ${rationale ? `<p style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin:0 0 0.5rem 0;line-height:1.5;">${rationale}</p>` : ''}
            ${riskNote ? `<p style="font-size:0.72rem;color:#ff9800;margin:0 0 0.5rem 0;"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>${riskNote}</p>` : ''}
            ${contextLink ? `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;background:rgba(33,150,243,0.12);color:#64b5f6;"><i class="fas fa-chart-line" style="margin-right:3px;"></i>${contextLink}</span>` : ''}
            ${chips.length ? `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem;">
              ${chips.map(c => `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);font-family:'JetBrains Mono',monospace;">${c}</span>`).join('')}
            </div>` : ''}
            ${sector || country ? `<div style="font-size:0.65rem;color:rgba(255,255,255,0.35);margin-top:0.4rem;">${[sector, country].filter(Boolean).join(' · ')}</div>` : ''}
            ${asianMapping ? `
            <div style="margin-top:0.8rem;padding:0.8rem;background:rgba(255,165,0,0.06);border:1px solid rgba(255,165,0,0.18);border-radius:8px;">
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <i class="fas fa-globe-asia" style="color:#ffb74d;font-size:0.8rem;"></i>
                <span style="font-size:0.75rem;font-weight:700;color:#ffb74d;text-transform:uppercase;letter-spacing:0.5px;">Action asiatique — comment l'acheter</span>
              </div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:0.5rem;">
                <div><strong style="color:rgba(255,255,255,0.85);">1. Ticker complet :</strong> <code style="background:rgba(0,0,0,0.3);padding:1px 6px;border-radius:4px;color:#ffd54f;font-family:'JetBrains Mono',monospace;">${asianMapping.yahoo_ticker}</code> sur ${asianMapping.exchange} — <a href="${asianMapping.yahoo_url}" target="_blank" style="color:#64b5f6;text-decoration:none;"><i class="fas fa-external-link-alt" style="font-size:0.6rem;"></i> Yahoo Finance</a></div>
                ${asianMapping.adr_us ? `<div style="margin-top:0.3rem;"><strong style="color:#4caf50;">2. ADR US dispo :</strong> <code style="background:rgba(76,175,80,0.15);padding:1px 6px;border-radius:4px;color:#81c784;">${asianMapping.adr_us}</code> = la MÊME action cotée NY (substitut parfait)</div>` : `<div style="margin-top:0.3rem;color:rgba(255,255,255,0.5);"><strong>2. ADR US :</strong> ❌ pas d'ADR US listé</div>`}
                ${asianMapping.parent_company ? `<div style="margin-top:0.3rem;font-size:0.68rem;color:rgba(255,193,7,0.85);"><i class="fas fa-info-circle" style="margin-right:3px;"></i>${asianMapping.parent_company}</div>` : ''}
                ${asianMapping.notes ? `<div style="margin-top:0.3rem;font-size:0.66rem;color:rgba(255,255,255,0.45);font-style:italic;">${asianMapping.notes}</div>` : ''}
              </div>
              ${asianMapping.alternative_actions && asianMapping.alternative_actions.length ? `
                <div style="margin-top:0.6rem;">
                  <div style="font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.75);margin-bottom:0.3rem;">3. Alternatives ACTION achetables (mêmes secteur/qualité — pas un indice) :</div>
                  ${asianMapping.alternative_actions.map(alt => `
                    <div style="font-size:0.7rem;padding:4px 8px;background:rgba(33,150,243,0.08);border-left:2px solid #64b5f6;margin:0.25rem 0;border-radius:4px;">
                      <strong style="color:#64b5f6;font-family:'JetBrains Mono',monospace;">${alt.ticker}</strong>
                      <span style="color:rgba(255,255,255,0.8);">${alt.name}</span>
                      <span style="color:rgba(255,255,255,0.5);font-size:0.65rem;">— ${alt.country}, ${alt.industry}, Buf ${alt.buffett_score}/Q ${alt.quality_score}${alt.match_level === 'industry' ? ' <span style="color:#4caf50;">[match industry]</span>' : ' <span style="color:#ff9800;">[match secteur]</span>'}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${asianMapping.etf_last_resort ? `
                <div style="margin-top:0.6rem;padding:6px 10px;background:rgba(244,67,54,0.08);border-left:2px solid #ef5350;border-radius:4px;">
                  <div style="font-size:0.65rem;color:#ef9a9a;"><strong>⚠️ 4. ETF dernier recours :</strong> ${asianMapping.etf_last_resort.ticker} (${asianMapping.etf_last_resort.name})</div>
                  <div style="font-size:0.62rem;color:rgba(255,255,255,0.45);font-style:italic;margin-top:2px;">${asianMapping.etf_last_resort.warning} — préfère une alternative ACTION ci-dessus</div>
                </div>
              ` : ''}
            </div>
            ` : ''}
          </div>` : ''}
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    // ── Risk metrics ──
    const conc = exposures.concentration;
    if (conc) {
      html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:1.25rem;margin-bottom:2rem;">
        <h3 style="margin:0 0 1rem 0;font-size:0.95rem;font-weight:700;color:rgba(255,255,255,0.7);">
          <i class="fas fa-chart-bar" style="margin-right:6px;color:#00bcd4;"></i>Indicateurs de risque
        </h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
          ${this.renderMetric('Volatilité', `${(opt.vol_realized || 0).toFixed(1)}%`, cfg.color)}
          ${this.renderMetric('HHI', Math.round(conc.hhi || 0), conc.hhi < 1500 ? '#4caf50' : '#ff9800')}
          ${this.renderMetric('Positions', conc.n_positions || 0, '#2196f3')}
          ${this.renderMetric('Top 5', `${conc.top_5_weight || 0}%`, '#9c27b0')}
        </div>
        <p style="margin:1rem 0 0 0;text-align:center;font-size:0.85rem;color:rgba(255,255,255,0.5);">
          <em>${conc.hhi < 1000 ? '✅ Bien diversifié' : conc.hhi < 1500 ? '🟢 Diversification acceptable' : conc.hhi < 2500 ? '🟡 Concentration modérée' : '🔴 Forte concentration'}</em>
        </p>
      </div>`;
    }

    // ── AMF disclaimer (compact) ──
    html += `
    <div style="padding:1.25rem;background:rgba(255,193,7,0.05);border:1px solid rgba(255,193,7,0.15);border-radius:12px;margin-bottom:1.5rem;">
      <div style="display:flex;align-items:flex-start;gap:0.75rem;">
        <i class="fas fa-gavel" style="color:#ffc107;margin-top:2px;flex-shrink:0;"></i>
        <div style="font-size:0.82rem;line-height:1.6;color:rgba(255,255,255,0.6);">
          <strong style="color:#ffc107;">Avertissement AMF</strong> — Ce portefeuille modèle est fourni à titre informatif. 
          Il ne constitue pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures.
          ${limitations.length ? '<br><strong>Limitations :</strong> ' + limitations.join(' • ') : ''}
          <br><span style="color:rgba(255,255,255,0.4);">v${this.meta.version || '?'} • ${this.formatDate(this.lastUpdate)} • Backtest ${this.meta.backtest_days || 90}j</span>
        </div>
      </div>
    </div>`;

    return html;
  }

  // ── Turnover section ──

  renderTurnover(turnover, cfg) {
    let html = `
    <div style="margin-bottom:2rem;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
      <div style="padding:1rem 1.25rem;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06);">
        <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:rgba(255,255,255,0.8);">
          <i class="fas fa-exchange-alt" style="margin-right:6px;color:${cfg.color};"></i>Turnover vs précédent
        </h3>
        <div style="display:flex;gap:0.75rem;font-size:0.8rem;">
          ${this.renderMiniTag(`${turnover.entries.length} entrée${turnover.entries.length > 1 ? 's' : ''}`, '#4caf50')}
          ${this.renderMiniTag(`${turnover.exits.length} sortie${turnover.exits.length > 1 ? 's' : ''}`, '#f44336')}
          ${this.renderMiniTag(`${turnover.changes.length} ajust.`, '#ff9800')}
          ${this.renderMiniTag(`Turnover: ${turnover.totalTurnover}%`, cfg.color)}
        </div>
      </div>
      <div style="padding:1.25rem;">`;

    if (turnover.entries.length) {
      html += '<div style="margin-bottom:1rem;"><div style="font-size:0.75rem;font-weight:700;color:#4caf50;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:1px;">Entrées</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;">';
      for (const e of turnover.entries) {
        html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.2);border-radius:6px;font-size:0.82rem;">
          <i class="fas fa-arrow-up" style="font-size:0.6rem;color:#4caf50;"></i>
          <strong>${e.name}</strong> <span style="color:#4caf50;">${e.weight}%</span>
        </span>`;
      }
      html += '</div></div>';
    }

    if (turnover.exits.length) {
      html += '<div style="margin-bottom:1rem;"><div style="font-size:0.75rem;font-weight:700;color:#f44336;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:1px;">Sorties</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;">';
      for (const e of turnover.exits) {
        html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.2);border-radius:6px;font-size:0.82rem;text-decoration:line-through;opacity:0.7;">
          <i class="fas fa-arrow-down" style="font-size:0.6rem;color:#f44336;"></i>
          ${e.name} <span style="color:#f44336;">${e.weight}%</span>
        </span>`;
      }
      html += '</div></div>';
    }

    if (turnover.changes.length) {
      html += '<div><div style="font-size:0.75rem;font-weight:700;color:#ff9800;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:1px;">Ajustements</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;">';
      for (const c of turnover.changes) {
        const col = c.delta > 0 ? '#4caf50' : '#f44336';
        html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.15);border-radius:6px;font-size:0.82rem;">
          ${c.name} ${c.previous}→${c.current}% <span style="color:${col};font-weight:700;">(${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1)})</span>
        </span>`;
      }
      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  // ── Helpers ──

  renderBadge(label, value, color) {
    return `<div style="padding:4px 10px;border-radius:8px;font-size:0.75rem;background:${color}15;border:1px solid ${color}30;color:${color};font-weight:600;white-space:nowrap;">
      ${label}: ${value}
    </div>`;
  }

  renderMiniTag(text, color) {
    return `<span style="padding:2px 8px;border-radius:4px;background:${color}18;color:${color};font-weight:600;">${text}</span>`;
  }

  renderMetric(label, value, color) {
    return `<div style="text-align:center;">
      <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-bottom:4px;">${label}</div>
      <div style="font-size:1.3rem;font-weight:800;color:${color};">${value}</div>
    </div>`;
  }

  renderAllocationBars(portfolio, color) {
    let html = '';
    for (const cat of ['Actions', 'ETF', 'Obligations', 'Crypto']) {
      const assets = portfolio[cat] || {};
      const total = Object.values(assets).reduce((s, v) => s + (parseFloat(String(v).replace('%', '')) || 0), 0);
      if (total <= 0) continue;
      const catColor = this.getCatColor(cat);
      html += `
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;">
        <i class="fas ${this.getCatIcon(cat)}" style="width:16px;text-align:center;color:${catColor};font-size:0.8rem;"></i>
        <span style="width:80px;font-size:0.85rem;">${cat}</span>
        <div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
          <div style="width:${total}%;height:100%;background:linear-gradient(90deg,${catColor},${catColor}88);border-radius:4px;transition:width 0.6s ease;"></div>
        </div>
        <span style="width:45px;text-align:right;color:${catColor};font-weight:700;font-size:0.9rem;">${Math.round(total)}%</span>
      </div>`;
    }
    return html;
  }

  // ── Charts ──

  initCharts() {
    if (typeof Chart === 'undefined') return;
    Object.keys(this.portfolios).forEach(type => {
      const id = `chart-${this.normalizeType(type)}`;
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const portfolio = this.portfolios[type];
      const data = [], labels = [], colors = [];
      for (const cat of ['Actions', 'ETF', 'Obligations', 'Crypto']) {
        const total = Object.values(portfolio[cat] || {}).reduce((s, v) => s + (parseFloat(String(v).replace('%', '')) || 0), 0);
        if (total > 0) { data.push(total); labels.push(cat); colors.push(this.getCatColor(cat)); }
      }
      new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#0a1929' }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 }, padding: 12 } } }
        }
      });
    });
  }
}

// ── v7.3: Investment amount calculator ──
window._updateAmounts = function(pfType, rawValue) {
  const amount = parseFloat(rawValue) || 0;
  const displays = document.querySelectorAll(`.amount-display[data-pf="${pfType}"]`);
  const hint = document.getElementById(`amount-hint-${pfType}`);

  if (amount <= 0) {
    displays.forEach(el => el.style.display = 'none');
    if (hint) hint.textContent = '';
    return;
  }

  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  displays.forEach(el => {
    const weight = parseFloat(el.dataset.weight) || 0;
    const val = Math.round(amount * weight / 100);
    el.textContent = fmt.format(val);
    el.style.display = 'block';
  });

  if (hint) {
    const n = displays.length;
    hint.textContent = `${n} positions · ${fmt.format(amount)} répartis`;
  }
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Portfolio Loader v3.0');
  window.portfolioManager = new PortfolioManagerV3();
  window.portfolioManager.init();
});
