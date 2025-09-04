// Script d'intégration MC pour ETFs - v3.12.0 HARMONIZED
// Même look que Actions - Liste verticale avec cartes flex
(function(){
  // Styles harmonisés Actions/ETFs
  if (!document.getElementById('etf-mc-harmonized-styles')) {
    const s = document.createElement('style');
    s.id='etf-mc-harmonized-styles';
    s.textContent = `
    /* === HARMONISATION ETF = Actions === */
    #etf-mc-results { 
      display:block !important;
    }
    
    /* Pills métriques */
    #etf-mc-section .mc-pill{ 
      display:inline-flex;gap:8px;align-items:center;padding:6px 10px;
      border:1px solid rgba(0,200,255,.2);border-radius:10px;
      background:rgba(0,255,255,.03);cursor:pointer;transition:all .2s ease; 
      user-select:none; 
    }
    #etf-mc-section .mc-pill:hover{ 
      background:rgba(0,255,255,.08); border-color:rgba(0,255,255,.35); 
    }
    #etf-mc-section .mc-pill.is-checked{ 
      background:rgba(0,255,255,.2)!important; 
      border-color:#00ffff!important; 
      box-shadow:0 0 12px rgba(0,255,255,.3); 
      transform:translateY(-1px); 
    }
    
    /* Inputs et selects */
    #etf-mc-section .mini-input,#etf-mc-section .mini-select{ 
      transition:all .2s ease; 
      background:rgba(0,255,255,.05); 
      color:#fff; 
    }
    #etf-mc-section .mini-input:focus,#etf-mc-section .mini-select:focus{ 
      border-color:#00ffff; 
      box-shadow:0 0 0 3px rgba(0,255,255,.2); 
      outline:none; 
    }
    
    /* Filtres */
    .filter-item{ 
      background:rgba(0,255,255,.05); 
      border:1px solid rgba(0,255,255,.2); 
      border-radius:8px; 
    }
    
    /* Facettes */
    .facet-header{ font-size:.8rem; opacity:.7; margin:.5rem 0 .25rem }
    .facet-list{ 
      list-style:none; margin:0; padding:6px 8px; display:block;
      background:rgba(0,255,255,.04); 
      border:1px solid rgba(0,255,255,.15); 
      border-radius:8px;
      max-height:220px; overflow:auto; 
    }
    .facet-item{ 
      display:flex; align-items:center; gap:8px; 
      padding:6px 8px; border-radius:8px; 
    }
    .facet-item:hover{ background:rgba(0,255,255,.06); }
    .facet-item.is-checked{ 
      background:rgba(0,255,255,.18); 
      border:1px solid #00ffff; 
    }
    .facet-item input{ accent-color:#00ffff; }
    
    /* Toggle Lev/Inv */
    .lev-toggle-container{ 
      display:flex; align-items:center; gap:8px; padding:8px 12px; 
      background:rgba(255,50,50,.05); 
      border:1px solid rgba(255,50,50,.2); 
      border-radius:8px; margin-top:8px; 
    }
    .lev-toggle-container:has(input:checked){ 
      background:rgba(255,50,50,.1); 
      border-color:rgba(255,50,50,.3); 
    }
    
    /* Loader */
    @keyframes shimmer{
      0%{background-position:-1000px 0}
      100%{background-position:1000px 0}
    }
    .loading-shimmer{
      background:linear-gradient(90deg,rgba(0,255,255,.05) 0%,rgba(0,255,255,.1) 50%,rgba(0,255,255,.05) 100%);
      background-size:1000px 100%;animation:shimmer 2s infinite
    }
    `;
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ ETF MC Integration v3.12.0 HARMONIZED');
    
    // === MÉTRIQUES (sans Sharpe/R-Vol/Track Error/Perf 3Y) ===
    const zoneMetrics = document.querySelector('#etf-mc-section fieldset:first-of-type .flex.flex-wrap');
    const setPill = (id, label, checked=false) => {
      if (!zoneMetrics || document.getElementById(`etf-m-${id}`)) return;
      const lab = document.createElement('label'); 
      lab.className='mc-pill';
      lab.innerHTML = `<input id="etf-m-${id}" type="checkbox" ${checked?'checked':''}> ${label}`;
      zoneMetrics.appendChild(lab);
    };
    
    // Ajout Rdt net uniquement
    setPill('yield_net','Rdt net ↑',false);
    
    // Suppression des pills non désirées
    ['sharpe','sharpe_proxy','tracking_error','return_3y','quality'].forEach(id => {
      const pill = document.getElementById(`etf-m-${id}`)?.closest('.mc-pill');
      if (pill) pill.remove();
    });

    // === ZONE FILTRES ===
    const filtFS = document.querySelector('#etf-mc-section fieldset:last-of-type');
    if (filtFS) {
      // Nettoyer les anciens éléments
      document.getElementById('etf-filter-type')?.closest('.flex')?.remove();
      document.getElementById('etf-filter-quality')?.closest('div')?.remove();

      // Toggle Lev/Inv
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

      // Filtres personnalisés
      if (!document.getElementById('etf-custom-filters-list')) {
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
              <option value="return_1d">Jour</option>
              <option value="return_ytd">YTD</option>
              <option value="return_1y">1 An</option>
              <option value="volatility">Vol</option>
              <option value="dividend_yield">Div</option>
              <option value="yield_net">Rdt net</option>
            </select>
            <select id="etf-filter-operator" class="mini-select" style="width:64px;">
              <option value=">=">≥</option>
              <option value=">">></option>
              <option value="=">=</option>
              <option value="<"><</option>
              <option value="<=">≤</option>
              <option value="!=">≠</option>
            </select>
            <input id="etf-filter-value" type="number" class="mini-input" style="width:90px;" placeholder="0" step="0.1">
            <span id="etf-filter-unit" class="text-xs opacity-60">%</span>
            <button id="etf-add-filter" class="action-button" style="padding:6px 10px;"><i class="fas fa-plus"></i></button>
          </div>
        `;
        filtFS.appendChild(customBox);
      }
    }

    // === LISTES FR (Pays/Secteurs/Type) ===
    (function makeFacetLists(){
      const filtFS = document.querySelector('#etf-mc-section fieldset:last-of-type');
      if (!filtFS) return;

      // Dictionnaires FR
      const FR_SECTORS = {
        "Financial Services":"Services financiers",
        "Consumer Cyclical":"Conso. cyclique",
        "Technology":"Technologie",
        "Industrial":"Industrie",
        "Communication Services":"Communication",
        "Basic Materials":"Matériaux de base",
        "Healthcare":"Santé",
        "Energy":"Énergie",
        "Utilities":"Services publics",
        "Real Estate":"Immobilier",
        "Consumer Defensive":"Conso. défensive",
        "Financials":"Finance",
        "Information Technology":"Technologies de l'info",
        "Consumer Staples":"Biens de conso. de base",
        "Consumer Discretionary":"Conso. discrétionnaire",
        "Materials":"Matériaux",
        "Industrials":"Industriels",
        "Health Care":"Soins de santé",
        "Telecommunication Services":"Télécoms"
      };
      
      const FR_COUNTRIES = {
        "United States":"États-Unis",
        "United Kingdom":"Royaume-Uni",
        "Germany":"Allemagne",
        "France":"France",
        "Switzerland":"Suisse",
        "Spain":"Espagne",
        "Netherlands":"Pays-Bas",
        "China":"Chine",
        "Korea":"Corée",
        "India":"Inde",
        "Taiwan":"Taïwan",
        "Japan":"Japon",
        "Canada":"Canada",
        "Italy":"Italie",
        "Australia":"Australie",
        "Belgium":"Belgique",
        "Sweden":"Suède",
        "Denmark":"Danemark",
        "Norway":"Norvège",
        "Brazil":"Brésil",
        "Mexico":"Mexique"
      };
      
      const FR_FUNDTYPES = {
        "Intermediate Core Bond":"Obligations core intermédiaire",
        "High Yield Bond":"Obligations haut rendement",
        "Large Growth":"Grande cap. croissance",
        "Large Value":"Grande cap. valeur",
        "Small Growth":"Petite cap. croissance",
        "Small Value":"Petite cap. valeur",
        "Foreign Large Blend":"International grande cap.",
        "Emerging Markets":"Marchés émergents",
        "Europe Stock":"Actions Europe",
        "Real Estate":"Immobilier",
        "Sector Equity":"Actions sectorielles",
        "Corporate Bond":"Obligations d'entreprise",
        "Trading--Leveraged Equity":"ETF levier (actions)",
        "Trading--Inverse Equity":"ETF inverse (actions)"
      };
      
      const toFR = (v, dict) => dict[v] || v;

      // Attendre que le module MC soit prêt
      const ready = () => window.ETF_MC?.state?.catalogs?.countries?.length;
      const boot = () => {
        const cats = window.ETF_MC.state.catalogs;

        // Cacher les anciens selects
        filtFS.querySelectorAll('select').forEach(s => {
          const lab = s.previousElementSibling?.textContent?.toLowerCase() || "";
          if (/(région|pays|secteur|type)/.test(lab)) {
            const parent = s.closest('.flex') || s.parentElement;
            if (parent) parent.style.display = 'none';
          }
        });

        // Créer les listes facettes
        const mk = (id, title, values, facet, dict) => {
          if (document.getElementById(id)) return;
          const wrap = document.createElement('div');
          wrap.innerHTML = `
            <div class="facet-header">${title}</div>
            <ul id="${id}" class="facet-list" aria-label="${title}">
              ${values.slice(0,10).map(v => `
                <li class="facet-item"><label>
                  <input type="checkbox" data-facet="${facet}" value="${v}"> ${toFR(v, dict)}
                </label></li>`).join('')}
            </ul>`;
          filtFS.insertBefore(wrap, document.getElementById('etf-custom-filters-list')?.parentElement);
        };

        mk('etf-filter-countries','Pays (multi-sélection)', cats.countries,'country', FR_COUNTRIES);
        mk('etf-filter-sectors','Secteurs (multi-sélection)', cats.sectors,'sector', FR_SECTORS);
        mk('etf-filter-fundtype','Type de fonds (multi-sélection)', cats.fundTypes,'fund', FR_FUNDTYPES);

        // Connecter les checkboxes
        filtFS.querySelectorAll('input[data-facet]').forEach(inp=>{
          const sets = window.ETF_MC.state.filters;
          const target =
            inp.dataset.facet==='country' ? sets.countries :
            inp.dataset.facet==='sector'  ? sets.sectors   : sets.fundTypes;

          inp.addEventListener('change', e=>{
            const v = e.target.value;
            if (e.target.checked) target.add(v); else target.delete(v);
            e.target.closest('.facet-item')?.classList.toggle('is-checked', e.target.checked);
            window.ETF_MC.calculate();
          });
        });
      };

      (function wait(){ if (ready()) return boot(); setTimeout(wait, 150); })();
    })();

    // Sync visuel des pills
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp=>{
      const lab = inp.closest('.mc-pill'); 
      const sync = ()=> lab?.classList.toggle('is-checked', inp.checked);
      inp.addEventListener('change', sync); 
      sync();
    });

    // Loader
    if (!document.getElementById('mc-loading')) {
      const container = document.querySelector('#etf-mc-results');
      if (container) {
        const loader = document.createElement('div');
        loader.id='mc-loading'; 
        loader.className='hidden';
        loader.innerHTML = `<div class="loading-shimmer rounded-lg p-8 text-center"><p class="mt-2 text-cyan-400">Calcul en cours…</p></div>`;
        container.parentNode.insertBefore(loader, container);
      }
    }

    // Apply button avec loader
    const apply = document.getElementById('etf-mc-apply');
    const resZone = document.getElementById('etf-mc-results');
    const loader = document.getElementById('mc-loading');
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

    // Raccourcis clavier
    document.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey||e.metaKey) && e.key==='Enter') apply?.click();
      if (e.key==='Escape') document.getElementById('etf-mc-reset')?.click();
    });
  });
})();