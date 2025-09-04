// Script d'intégration MC pour ETFs - v3.4
// - Facettes "Pays / Secteurs / Type de fonds" en LISTES (checkboxes verticales)
// - Libellés FR partout
// - Qualité retirée (métrique + slider)
// - Badge de score retiré (géré côté module)

(function(){
  // ---------- Styles idempotents ----------
  if (!document.getElementById('etf-mc-styles')) {
    const s = document.createElement('style');
    s.id='etf-mc-styles';
    s.textContent = `
    /* Cartes (inchangé) */
    #etf-mc-results .stock-cards-container { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); }
    @media (min-width:1280px){ #etf-mc-results .stock-cards-container{ grid-template-columns:repeat(auto-fill,minmax(440px,1fr)); } }
    #etf-mc-results .stock-card{ display:grid; grid-template-columns:48px 1fr auto; align-items:center; gap:12px; min-height:100px; }
    .stock-fullname{ display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; white-space:normal; word-break:break-word; transition:all .25s ease; line-height:1.3; }
    .stock-card:hover .stock-fullname{ -webkit-line-clamp:4; }
    .stock-performance{ white-space:nowrap; text-align:right; font-variant-numeric:tabular-nums; }
    .stock-performance .flex{ display:grid; grid-template-columns:repeat(auto-fit,minmax(70px,1fr)); gap:12px; }
    .rank{ width:42px;height:42px;display:flex;justify-content:center;align-items:center;border-radius:50%;font-weight:700;background:var(--accent-subtle);color:var(--accent-color);box-shadow:0 0 8px rgba(0,255,135,.2); }
    .stock-card:nth-child(1) .rank{ background:linear-gradient(135deg,#FFD700,#FFA500); color:#000; box-shadow:0 0 20px rgba(255,215,0,.6); }
    .stock-card:nth-child(2) .rank{ background:linear-gradient(135deg,#E5E5E5,#C0C0C0); color:#000; box-shadow:0 0 18px rgba(192,192,192,.6); }
    .stock-card:nth-child(3) .rank{ background:linear-gradient(135deg,#CD7F32,#B87333); color:#fff; box-shadow:0 0 16px rgba(205,127,50,.6); }
    .ter-badge,.aum-badge{ padding:3px 10px;border-radius:6px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;display:inline-block;line-height:1; }
    .ter-badge{ background:rgba(255,193,7,.2); color:#FFC107; border:1px solid rgba(255,193,7,.3); }
    .aum-badge{ background:rgba(0,212,255,.2); color:#00D4FF; border:1px solid rgba(0,212,255,.3); }

    /* Pills métriques (inchangé) */
    #etf-mc-section .mc-pill{ display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:all .2s ease; user-select:none; }
    #etf-mc-section .mc-pill:hover{ background:rgba(0,255,255,.08); border-color:rgba(0,255,255,.35); }
    #etf-mc-section .mc-pill.is-checked{ background:rgba(0,255,255,.2)!important; border-color:#00ffff!important; box-shadow:0 0 12px rgba(0,255,255,.3); transform:translateY(-1px); }
    #etf-mc-section .mini-input,#etf-mc-section .mini-select{ transition:all .2s ease; background:rgba(0,255,255,.05); color:#fff; }
    #etf-mc-section .mini-input:focus,#etf-mc-section .mini-select:focus{ border-color:#00ffff; box-shadow:0 0 0 3px rgba(0,255,255,.2); outline:none; }

    /* === LISTES DE FACETTES (pays / secteurs / type de fonds) === */
    .facet-header{ font-size:.8rem; opacity:.7; margin:.5rem 0 .25rem }
    .facet-list{ list-style:none; margin:0; padding:6px 8px; display:block;
      background:rgba(0,255,255,.04); border:1px solid rgba(0,255,255,.15); border-radius:8px;
      max-height:220px; overflow:auto; }
    .facet-item{ display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; }
    .facet-item:hover{ background:rgba(0,255,255,.06); }
    .facet-item.is-checked{ background:rgba(0,255,255,.18); border:1px solid #00ffff; }
    .facet-item input{ accent-color:#00ffff; }

    /* Loader */
    @keyframes shimmer{0%{background-position:-1000px 0}100%{background-position:1000px 0}}
    .loading-shimmer{background:linear-gradient(90deg,rgba(0,255,255,.05) 0%,rgba(0,255,255,.1) 50%,rgba(0,255,255,.05) 100%);background-size:1000px 100%;animation:shimmer 2s infinite}

    /* Mobile */
    @media (max-width:768px){ #etf-mc-results .stock-cards-container{ grid-template-columns:1fr } .stock-performance .flex{ grid-template-columns:repeat(2,1fr) } }
    `;
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // === (1) MÉTRIQUES — enlever "Qualité", s'assurer du FR ===
    const zoneMetrics = document.querySelector('#etf-mc-section fieldset:first-of-type .flex.flex-wrap');
    const setPill = (id, label, checked=false) => {
      if (!zoneMetrics || document.getElementById(`etf-m-${id}`)) return;
      const lab = document.createElement('label'); lab.className='mc-pill';
      lab.innerHTML = `<input id="etf-m-${id}" type="checkbox" ${checked?'checked':''}> ${label}`;
      zoneMetrics.appendChild(lab);
    };
    // Ajouts/renommages utiles
    setPill('yield_net','Rdt net ↑',false);
    setPill('sharpe_proxy','R/Vol ↑',true);
    // Supprimer "Qualité" si présent
    (function removeQuality(){
      const pill = document.getElementById('etf-m-quality')?.closest('.mc-pill');
      if (pill) pill.remove();
    })();

    // === (2) ZONE FILTRES — facettes en LISTES FR ===
    const filtFS = document.querySelector('#etf-mc-section fieldset:last-of-type');
    if (filtFS) {
      // Supprimer l'ancien select "type"
      document.getElementById('etf-filter-type')?.closest('.flex')?.remove();
      // Supprimer le slider de qualité s'il existe
      document.getElementById('etf-filter-quality')?.closest('div')?.remove();

      // Toggle Lev/Inv (crée si manquant)
      if (!document.getElementById('etf-filter-leveraged')) {
        const box = document.createElement('div');
        box.className='lev-toggle-container';
        box.innerHTML = `
          <input id="etf-filter-leveraged" type="checkbox" checked class="accent-red-500">
          <label for="etf-filter-leveraged" class="text-sm font-medium">Exclure ETFs Lev./Inverse</label>
          <span class="text-xs opacity-60 ml-2">(recommandé)</span>
        `;
        filtFS.appendChild(box);
      }

      // Facettes LISTE
      const facets = document.createElement('div');
      facets.className='space-y-2 mt-2';
      facets.innerHTML = `
        <div>
          <div class="facet-header">Pays (multi)</div>
          <ul id="etf-filter-countries" class="facet-list" aria-label="Pays"></ul>
        </div>
        <div>
          <div class="facet-header">Secteurs (multi)</div>
          <ul id="etf-filter-sectors" class="facet-list" aria-label="Secteurs"></ul>
        </div>
        <div>
          <div class="facet-header">Type de fonds (multi)</div>
          <ul id="etf-filter-fundtype" class="facet-list" aria-label="Type de fonds"></ul>
        </div>
      `;
      filtFS.appendChild(facets);

      // Filtres personnalisés (comme Actions)
      const customBox = document.createElement('div');
      customBox.className='mt-3';
      customBox.innerHTML = `
        <div class="text-xs opacity-70 mb-2">Filtres personnalisés</div>
        <div id="etf-custom-filters-list" class="space-y-2 mb-2">
          <div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>
        </div>
        <div class="flex gap-1 items-center filter-controls">
          <select id="etf-filter-metric" class="mini-select" style="flex:1.5; min-width:120px;">
            <option value="ter">TER</option>
            <option value="aum">AUM</option>
            <option value="return_1d">Perf 1J</option>
            <option value="return_ytd">YTD</option>
            <option value="return_1y">Perf 1A</option>
            <option value="volatility">Vol 3A</option>
            <option value="dividend_yield">Rdt TTM</option>
            <option value="yield_net">Rdt net</option>
            <option value="sharpe_proxy">R/Vol</option>
          </select>
          <select id="etf-filter-operator" class="mini-select" style="width:64px;">
            <option value=">=">≥</option><option value=">">></option>
            <option value="=">=</option>
            <option value="<"><</option><option value="<=">≤</option>
            <option value="!=">≠</option>
          </select>
          <input id="etf-filter-value" type="number" class="mini-input" style="width:90px;" placeholder="0" step="0.1">
          <span id="etf-filter-unit" class="text-xs opacity-60">%</span>
          <button id="etf-add-filter" class="action-button" style="padding:6px 10px;"><i class="fas fa-plus"></i></button>
        </div>
      `;
      filtFS.appendChild(customBox);
    }

    // Sync visuel des pills métriques
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp=>{
      const lab = inp.closest('.mc-pill'); const sync = ()=> lab?.classList.toggle('is-checked', inp.checked);
      inp.addEventListener('change', sync); sync();
    });

    // Loader
    if (!document.getElementById('mc-loading')) {
      const container = document.querySelector('#etf-mc-results');
      if (container) {
        const loader = document.createElement('div');
        loader.id='mc-loading'; loader.className='hidden';
        loader.innerHTML = `<div class="loading-shimmer rounded-lg p-8 text-center"><p class="mt-2 text-cyan-400">Calcul en cours…</p></div>`;
        container.parentNode.insertBefore(loader, container);
      }
    }

    // Apply → mini-loader
    const apply = document.getElementById('etf-mc-apply');
    const resZone = document.getElementById('etf-mc-results');
    const loader  = document.getElementById('mc-loading');
    if (apply && resZone && loader) {
      apply.addEventListener('click', ()=>{
        loader.classList.remove('hidden');
        resZone.classList.add('hidden');
        setTimeout(()=>{
          window.ETF_MC?.calculate();
          loader.classList.add('hidden');
          resZone.classList.remove('hidden');
        }, 250);
      });
    }

    // Raccourcis
    document.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey||e.metaKey) && e.key==='Enter') apply?.click();
      if (e.key==='Escape') document.getElementById('etf-mc-reset')?.click();
    });

    console.log('✅ ETF MC Integration v3.4 — facettes LISTE FR prêtes');
  });
})();