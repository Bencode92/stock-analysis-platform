// Script d'intégration MC pour ETFs - v3.2 (styles + contrôles + UX/ARIA)
(function(){
  // ---------- Styles idempotents ----------
  if (!document.getElementById('etf-mc-styles')) {
    const s = document.createElement('style');
    s.id='etf-mc-styles';
    s.textContent = `
    /* Grid cartes */
    #etf-mc-results .stock-cards-container { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); }
    @media (min-width:1280px){ #etf-mc-results .stock-cards-container{ grid-template-columns:repeat(auto-fill,minmax(440px,1fr)); } }
    /* Carte */
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
    .mc-score-badge{ background:linear-gradient(135deg,rgba(0,255,255,.15),rgba(0,255,255,.05));border:1px solid rgba(0,255,255,.4);padding:5px 12px;border-radius:8px;font-weight:700;margin-top:8px;font-size:.9rem; }
    /* Pills */
    #etf-mc-section .mc-pill{ display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:all .2s ease; user-select:none; }
    #etf-mc-section .mc-pill:hover{ background:rgba(0,255,255,.08); border-color:rgba(0,255,255,.35); }
    #etf-mc-section .mc-pill.is-checked{ background:rgba(0,255,255,.2)!important; border-color:#00ffff!important; box-shadow:0 0 12px rgba(0,255,255,.3); transform:translateY(-1px); }
    #etf-mc-section .mini-input,#etf-mc-section .mini-select{ transition:all .2s ease; background:rgba(0,255,255,.05); color:#fff; }
    #etf-mc-section .mini-input:focus,#etf-mc-section .mini-select:focus{ border-color:#00ffff; box-shadow:0 0 0 3px rgba(0,255,255,.2); outline:none; }
    /* Toggle lev */
    .lev-toggle-container{ display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(255,50,50,.05); border:1px solid rgba(255,50,50,.2); border-radius:8px; margin-top:8px; }
    .lev-toggle-container:has(input:checked){ background:rgba(255,50,50,.1); border-color:rgba(255,50,50,.3); }
    /* Loader */
    @keyframes shimmer{0%{background-position:-1000px 0}100%{background-position:1000px 0}}
    .loading-shimmer{background:linear-gradient(90deg,rgba(0,255,255,.05) 0%,rgba(0,255,255,.1) 50%,rgba(0,255,255,.05) 100%);background-size:1000px 100%;animation:shimmer 2s infinite}
    /* Mobile */
    @media (max-width:768px){ #etf-mc-results .stock-cards-container{ grid-template-columns:1fr } .stock-performance .flex{ grid-template-columns:repeat(2,1fr) } }
    `;
    document.head.appendChild(s);
  }

  // ---------- Ajouter contrôles manquants / tooltips / loader ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Crée métriques si absentes (ids = etf-m-<metric>)
    const setPill = (id, label, checked=false) => {
      const zone = document.querySelector('#etf-mc-section fieldset:first-of-type .flex.flex-wrap');
      if (!zone || document.getElementById(`etf-m-${id}`)) return;
      const lab = document.createElement('label'); lab.className='mc-pill';
      lab.innerHTML = `<input id="etf-m-${id}" type="checkbox" ${checked?'checked':''}> ${label}`;
      zone.appendChild(lab);
    };
    setPill('yield_net','Yield net ↑',false);
    setPill('sharpe_proxy','R/Vol ↑',true);
    setPill('quality','Qualité ↑',false);

    // Enlever ce qui n'existe pas dans ton CSV
    ['tracking_error','sharpe'].forEach(id=>{
      const el = document.getElementById(`etf-m-${id}`);
      if (el) el.closest('.mc-pill')?.remove();
    });

    // Toggle Leveraged/Inverse si absent
    const filtFS = document.querySelector('#etf-mc-section fieldset:last-of-type');
    if (filtFS && !document.getElementById('etf-filter-leveraged')) {
      const box = document.createElement('div');
      box.className='lev-toggle-container';
      box.innerHTML = `
        <input id="etf-filter-leveraged" type="checkbox" checked class="accent-red-500">
        <label for="etf-filter-leveraged" class="text-sm font-medium">Exclure ETFs Leveraged/Inverse</label>
        <span class="text-xs opacity-60 ml-2">(recommandé)</span>
      `;
      filtFS.appendChild(box);
    }

    // Slider Qualité min
    if (filtFS && !document.getElementById('etf-filter-quality')) {
      const box = document.createElement('div');
      box.className='flex gap-2 items-center mt-2';
      box.innerHTML = `
        <label class="text-xs opacity-70 min-w-[60px]">Qualité min:</label>
        <input id="etf-filter-quality" type="range" min="0" max="100" value="80" class="flex-1" style="accent-color:#00ffff;">
        <span id="quality-value" class="text-xs font-bold min-w-[30px]">80</span>
      `;
      filtFS.appendChild(box);
    }

    // Tooltips rapides
    const addTip = (id, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.closest('.mc-pill')?.setAttribute('title', text);
    };
    addTip('etf-m-ter','Total Expense Ratio — plus bas = mieux');
    addTip('etf-m-aum','AUM en millions de $');
    addTip('etf-m-return_1d','Performance jour (%)');
    addTip('etf-m-return_ytd','Performance depuis le 1er janvier (%)');
    addTip('etf-m-return_1y','Performance 1 an (%)');
    addTip('etf-m-volatility','Volatilité 3 ans (%) — plus bas = mieux');
    addTip('etf-m-dividend_yield','Rendement dividendes TTM (%)');
    addTip('etf-m-yield_net','Rendement net après frais (surtout pour obligations)');
    addTip('etf-m-sharpe_proxy','Rendement / Volatilité — plus haut = mieux');
    addTip('etf-m-quality','Score de qualité des données (0–100)');

    // Sync visuel pills
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp=>{
      const lab = inp.closest('.mc-pill');
      const sync = ()=> lab?.classList.toggle('is-checked', inp.checked);
      inp.addEventListener('change', sync); sync();
    });

    // Loader
    if (!document.getElementById('mc-loading')) {
      const container = document.querySelector('#etf-mc-results');
      if (container) {
        const loader = document.createElement('div');
        loader.id='mc-loading'; loader.className='hidden';
        loader.innerHTML = `
          <div class="loading-shimmer rounded-lg p-8 text-center">
            <p class="mt-2 text-cyan-400">Calcul en cours…</p>
          </div>
        `;
        container.parentNode.insertBefore(loader, container);
      }
    }

    // Bouton Apply → loader court + calcul
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

    console.log('✅ ETF MC Integration v3.2 — contrôles/UX prêts');
  });
})();