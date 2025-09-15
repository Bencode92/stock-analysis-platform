// Module MC adapté pour ETFs - v4.9.4 avec volatilité intelligente (3y→1y→SI)
(function () {
  const waitFor=(c,b,t=40)=>c()?b():t<=0?console.error('❌ ETF MC: données introuvables'):setTimeout(()=>waitFor(c,b,t-1),250);
  const num=x=>Number.isFinite(+x)?+x:NaN, str=s=>s==null?'':String(s);
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  
  // Seuil pour ignorer les valeurs quasi-zéro
  const ZERO_EPS = 0.01;
  
  // Helpers d'identification
  const getTicker = (e) => e?.ticker || e?.symbol || e?.isin || '';
  const getName   = (e) => e?.name || e?.long_name || e?.fund_name || e?.full_name || '';
  
  // Parse top5 en ignorant les 0%
  function parseTopList(listStr, keyLabel, keyWeight){
    try{
      const arr = typeof listStr === 'string' ? JSON.parse(listStr||'[]')
                : Array.isArray(listStr) ? listStr : [];
      return arr
        .map(o => ({ label: String(o[keyLabel]||'').trim(), w: Number(o[keyWeight]) }))
        .filter(x => x.label && Number.isFinite(x.w) && x.w > ZERO_EPS)
        .map(x => x.label);
    }catch{ return []; }
  }
  
  function guessSingleStock(etf){
    const name = (etf.long_name||etf.fund_name||etf.name||etf.symbol||'') + ' ' + (etf.etf_type||'');
    const patLev = /\b(2x|3x|x2|x3|leveraged|inverse|bull|bear)\b/i;
    const looksLev = patLev.test(name);
    return { single: true, looksLev };
  }

  // ==== CONSTANTES IDENTIQUES ACTIONS ====
  const GAP_FLOOR = {
    return_ytd:0.3, return_1y:0.3, return_1d:0.5,
    dividend_yield:0.1, volatility:0.2, ter:0.05, aum:0.0, yield_net:0.1
  };
  const TOL_PRESET = { c:0.6, kappa:1.5 };
  const MIN_TOL_P = 0.012;
  const TOP_N = 10;
  const ALLOW_MISSING = 1;

  waitFor(()=>!!window.ETFData?.getData && document.querySelector('#etf-mc-section') && document.querySelector('#etf-mc-results'), init);

  function init(){
    const root=document.querySelector('#etf-mc-section');
    const results=document.querySelector('#etf-mc-results');
    const summary=document.getElementById('etf-mc-summary');
    if(!root||!results){console.error('❌ ETF MC v4.9.4: DOM manquant');return;}
    console.log('✅ ETF MC v4.9.4: Volatilité intelligente (3y→1y→SI) + Ultra-smooth DnD');

    // Harmonisation du conteneur
    results.classList.add('glassmorphism','rounded-lg','p-4');

    // Styles harmonisés avec nouveau drag&drop ultra-fluide + badges volatilité
    if(!document.getElementById('etf-mc-v494-styles')){
      const s=document.createElement('style'); s.id='etf-mc-v494-styles'; s.textContent=`
      #etf-mc-results { display:block }
      #etf-mc-results .space-y-2 > div { margin-bottom: .75rem }
      #etf-mc-results .etf-card{
        display:flex !important; align-items:center; gap:1rem !important;
        padding:12px 16px !important; border-radius:12px !important;
        background:linear-gradient(135deg,rgba(0,200,255,.03),rgba(0,255,255,.02)) !important;
        border:1px solid rgba(0,200,255,.15) !important;
        transition:all .2s ease; width:100%; margin-bottom:.75rem;
      }
      #etf-mc-results .etf-card:hover{
        background:linear-gradient(135deg,rgba(0,200,255,.06),rgba(0,255,255,.04)) !important;
        border-color:rgba(0,200,255,.30) !important; transform:translateX(2px);
      }
      #etf-mc-results .etf-rank{
        min-width:50px !important; font-size:1.5rem !important; font-weight:900 !important; 
        color:#00ffff !important; text-shadow:0 0 5px rgba(0,255,255,.3);
      }
      #etf-mc-results .etf-card:nth-child(1) .etf-rank{ color:#FFD700 !important }
      #etf-mc-results .etf-card:nth-child(2) .etf-rank{ color:#C0C0C0 !important }
      #etf-mc-results .etf-card:nth-child(3) .etf-rank{ color:#CD7F32 !important }
      #etf-mc-results .etf-info{ flex:1 1 40% !important; min-width:200px !important; margin-right:16px !important; }
      #etf-mc-results .etf-name{ font-weight:700; font-size:.95rem; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      #etf-mc-results .micro{ font-size:.75rem; opacity:.6; margin-top:4px; }
      #etf-mc-results .metrics{ margin-left:auto !important; display:flex !important; gap:16px !important; flex-wrap:wrap !important; }
      #etf-mc-results .metric-col{ display:flex; flex-direction:column; align-items:flex-end; }
      #etf-mc-results .metric-col .k{ font-size:.65rem !important; opacity:.65 !important; text-transform:uppercase; font-weight:700; }
      #etf-mc-results .metric-col .v{ font-size:.95rem !important; font-weight:800; }
      #etf-mc-results .badge{ font-size:.58rem !important; padding:2px 7px !important; border-radius:999px !important; font-weight:700; }
      
      /* === NOUVEAUX BADGES VOLATILITÉ === */
      #etf-mc-results .vol-badge{ 
        font-size:.5rem !important; padding:1px 4px !important; border-radius:6px !important; 
        font-weight:600; margin-left:2px; opacity:.85;
      }
      #etf-mc-results .vol-badge.vol-3y{ color:#22c55e; background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.25); }
      #etf-mc-results .vol-badge.vol-1y{ color:#f59e0b; background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.25); }
      #etf-mc-results .vol-badge.vol-SI{ color:#3b82f6; background:rgba(59,130,246,.12); border:1px solid rgba(59,130,246,.25); }
      
      .g{color:#34d399}.y{color:#fbbf24}.r{color:#f87171}
      #etf-mc-section .mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:.2s}
      #etf-mc-section .mc-pill:hover{background:rgba(0,255,255,.08);border-color:rgba(0,255,255,.35)}
      #etf-mc-section .mc-pill.is-checked{background:rgba(0,255,255,.2)!important;border-color:#00ffff!important;box-shadow:0 0 12px rgba(0,255,255,.3)}
      #etf-priority-container{margin-top:12px;padding:12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.2)}
      #etf-priority-list .priority-item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:rgba(0,255,255,.05);border:1px solid rgba(0,255,255,.2);cursor:move;user-select:none;margin-bottom:4px}
      #etf-priority-list .priority-item:hover{background:rgba(0,255,255,.1);border-color:rgba(0,255,255,.4)}
      #etf-priority-list .priority-item.dragging{opacity:.5}
      
      /* === DRAG & DROP ULTRA-FLUIDE === */
      #etf-priority-list{ position:relative; contain:layout paint; touch-action:none; }
      #etf-priority-list .priority-item{ user-select:none; -webkit-user-select:none; }
      #etf-priority-list .placeholder{
        height:40px; border-radius:8px;
        background:rgba(0,255,255,.08);
        border:1px dashed rgba(0,255,255,.35);
      }
      .drag-ghost{
        position:fixed; left:0; top:0; z-index:10000;
        pointer-events:none; opacity:.9; transform:translate3d(0,0,0);
        will-change:transform; box-shadow:0 8px 24px rgba(0,0,0,.25);
      }
      
      /* === NOUVELLES AMÉLIORATIONS === */
      #etf-priority-list .drag-handle{cursor:grab;opacity:.7}
      #etf-priority-list .priority-item:active .drag-handle{cursor:grabbing}
      #etf-priority-list .btn-up, #etf-priority-list .btn-down{
        font-size:.8rem;opacity:.7;padding:2px 6px;border-radius:6px;border:1px solid rgba(0,255,255,.25);
        background:rgba(0,255,255,.06)
      }
      #etf-priority-list .btn-up:hover, #etf-priority-list .btn-down:hover{opacity:1;background:rgba(0,255,255,.12)}
      
      .facet-group{margin-top:10px}.facet-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:.85rem;opacity:.85}
      .facet-head .count{opacity:.6;font-size:.75rem}.facet-body{max-height:0;overflow:hidden;transition:max-height .25s ease}
      .facet-group.open .facet-body{max-height:260px}
      .facet-list{list-style:none;margin:6px 0 0;padding:6px 8px;background:rgba(0,160,255,.07);border:1px solid rgba(0,160,255,.18);border-radius:10px}
      .facet-item{padding:6px 8px;border-radius:8px;display:flex;align-items:center;gap:8px}
      .facet-item input{accent-color:#00ffff}
      .facet-item.is-checked{background:rgba(0,200,255,.16);border:1px solid rgba(0,200,255,.35)}
      /* Filtre type de base */
      .type-filter-seg{display:inline-flex;background:rgba(255,255,255,.04);border:1px solid rgba(0,200,255,.2);border-radius:14px;padding:4px;gap:4px}
      .type-filter-seg button{padding:8px 14px;border-radius:10px;font-weight:600;font-size:.85rem;opacity:.8;transition:all .2s;border:none;background:none;color:inherit;cursor:pointer}
      .type-filter-seg button:hover{background:rgba(0,255,255,.06);opacity:.95}
      .type-filter-seg button.active{background:rgba(0,255,255,.15);color:#00ffff;opacity:1;box-shadow:0 0 0 1px rgba(0,255,255,.3) inset}
      `;
      document.head.appendChild(s);
    }

    // Nettoyer l'ancien HTML de filtres TER/AUM s'ils existent
    setTimeout(() => {
      document.getElementById('etf-filter-ter')?.closest('div')?.remove();
      document.getElementById('etf-filter-aum')?.closest('div')?.remove();
      root.querySelectorAll('legend, .text-sm').forEach(el => {
        if (el.textContent.includes('Filtres ETF')) {
          el.style.display = 'none';
        }
      });
    }, 100);

    // === État & caches (SANS countries) ===
    const state={
      mode:'balanced',
      baseFilter:'all',
      selectedMetrics:['return_ytd','ter','aum','return_1y'],
      filters:{sectors:new Set(),fundTypes:new Set(),excludeLeveraged:true}, // Pas de countries
      customFilters:[],
      data:[],
      catalogs:{sectors:[],fundTypes:[],counts:{sectors:new Map(),fundTypes:new Map()}} // Pas de countries
    };
    const cache = {};
    const masks = { facets:null, custom:null, final:null };

    // ==== MÉTRIQUES AVEC VOLATILITÉ AMÉLIORÉE ====
    const classify=e=>{
      const ft=str(e.fund_type).toLowerCase();
      const dataset=str(e.dataset).toLowerCase();
      if(dataset==='bonds' || /(bond|government|fixed income|core|short|intermediate|maturity)/i.test(ft))return 'bonds';
      if(/(commodit|precious|gold|silver|oil)/i.test(ft))return 'commodity';
      return 'equity';
    };
    
    const METRICS={
      ter:{label:'TER',unit:'%',max:false,get:e=>num(e.total_expense_ratio)*100},
      aum:{label:'AUM',unit:'$M',max:true,get:e=>num(e.aum_usd)/1e6},
      return_1d:{label:'Jour',unit:'%',max:true,get:e=>num(e.daily_change_pct)},
      return_ytd:{label:'YTD',unit:'%',max:true,get:e=>num(e.ytd_return_pct)},
      return_1y:{label:'1 An',unit:'%',max:true,get:e=>num(e.one_year_return_pct)},
      // ✨ VOLATILITÉ AMÉLIORÉE : utilise vol_pct (3y→1y→SI) avec fallback vol_3y_pct
      volatility:{label:'Vol',unit:'%',max:false,get:e=>num(e.vol_pct) || num(e.vol_3y_pct)},
      dividend_yield:{label:'Div',unit:'%',max:true,get:e=>num(e.yield_ttm)*100},
      yield_net:{label:'Rdt net',unit:'%',max:true,get:e=>{
        if(classify(e)!=='bonds') return NaN;
        const y=num(e.yield_ttm), ter=num(e.total_expense_ratio);
        if(!Number.isFinite(y)||!Number.isFinite(ter)) return NaN;
        return (y-ter)*100;
      }}
    };

    // ==== UI: Filtre type de base ====
    function createBaseFilterUI(){
      const firstFieldset = root.querySelector('fieldset');
      if(!firstFieldset || document.getElementById('etf-base-filter')) return;
      
      const filterDiv = document.createElement('div');
      filterDiv.id = 'etf-base-filter';
      filterDiv.className = 'mb-3';
      filterDiv.innerHTML = `
        <div class="text-xs opacity-70 mb-2">Type d'ETF</div>
        <div class="type-filter-seg" role="tablist">
          <button data-type="all" class="active">🌍 Global</button>
          <button data-type="equity">📈 Actions</button>
          <button data-type="bonds">📊 Obligations</button>
        </div>
      `;
      firstFieldset.parentNode.insertBefore(filterDiv, firstFieldset);
      
      filterDiv.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          filterDiv.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.baseFilter = btn.dataset.type;
          recomputeFacetCatalogs();
          renderDynamicFacets();
          scheduleCompute();
        });
      });
    }

    // ==== AUTO FACETTES ====
    function universeForFacets(){
      return state.data.filter(e=>{
        if (state.baseFilter==='equity' && classify(e)!=='equity') return false;
        if (state.baseFilter==='bonds' && classify(e)!=='bonds') return false;
        if (state.filters.excludeLeveraged && e.__lev) return false;
        return true;
      });
    }

    function recomputeFacetCatalogs(){
      const arr = universeForFacets();
      const s = new Map(), f = new Map();
      arr.forEach(e=>{
        (e.__sectors||[]).forEach(x=>x && s.set(x,(s.get(x)||0)+1));
        const ft = (e.fund_type||'').toString().trim();
        if (ft) f.set(ft,(f.get(ft)||0)+1);
      });
      const top = m => [...m.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k);
      state.catalogs = {
        sectors: top(s), fundTypes: top(f),
        counts: { sectors:s, fundTypes:f }
      };
      [['sectors',state.filters.sectors],
       ['fundTypes',state.filters.fundTypes]].forEach(([k,set])=>{
        [...set].forEach(v=>{ if(!state.catalogs[k].includes(v)) set.delete(v); });
      });
    }

    const LABELS = {
      sectors: {"Financial Services":"Services financiers","Consumer Cyclical":"Conso. cyclique","Technology":"Technologie","Industrial":"Industrie","Communication Services":"Communication","Basic Materials":"Matériaux de base","Healthcare":"Santé","Energy":"Énergie","Utilities":"Services publics","Real Estate":"Immobilier","Consumer Defensive":"Conso. défensive"},
      fundTypes: {"Intermediate Core Bond":"Obligations core","High Yield Bond":"Obligations haut rendement","Large Growth":"Grande cap. croissance","Emerging Markets":"Marchés émergents"}
    };

    function renderDynamicFacets(){
      const host = root.querySelector('fieldset:last-of-type'); if(!host) return;
      // MODIFIÉ : suppression de Pays du tableau groups
      const groups = [
        { id:'etf-filter-sectors', title:'Secteurs', key:'sectors' },
        { id:'etf-filter-fundtype', title:'Type de fonds', key:'fundTypes' }
      ];
      groups.forEach(g=>{
        const gid = g.id+'-group';
        let wrap = document.getElementById(gid);
        if(!wrap){
          wrap = document.createElement('div');
          wrap.className='facet-group open'; wrap.id=gid;
          wrap.innerHTML = `
            <div class="facet-head"><span>▾</span><span>${g.title}</span><span class="count"></span></div>
            <div class="facet-body"><ul id="${g.id}" class="facet-list"></ul></div>`;
          host.insertBefore(wrap, host.querySelector('#etf-custom-filters-list')?.parentElement || host.lastChild);
          const head = wrap.querySelector('.facet-head');
          head.addEventListener('click',()=>{
            wrap.classList.toggle('open');
            head.querySelector('span').textContent = wrap.classList.contains('open') ? '▾' : '▸';
          });
        }
        const ul = wrap.querySelector('ul');
        const list = state.catalogs[g.key];
        const counts = state.catalogs.counts[g.key];
        const selected = state.filters[g.key];
        ul.innerHTML = (list.slice(0,15).map(v=>{
          const checked = selected.has(v);
          const label = LABELS[g.key][v] || v;
          const cnt = counts.get(v) || 0;
          return `<li class="facet-item ${checked?'is-checked':''}">
            <label><input type="checkbox" data-facet="${g.key}" value="${v}" ${checked?'checked':''}>
              ${label} <span class="opacity-50 text-xs">(${cnt})</span>
            </label></li>`;
        }).join('')) || '<li class="text-xs opacity-50 px-2 py-1">Aucune valeur disponible</li>';

        ul.querySelectorAll('input[type="checkbox"]').forEach(inp=>{
          inp.addEventListener('change',e=>{
            const set = state.filters[g.key];
            const v = e.target.value;
            if(e.target.checked) set.add(v); else set.delete(v);
            e.target.closest('.facet-item')?.classList.toggle('is-checked', e.target.checked);
            scheduleCompute();
          });
        });

        wrap.querySelector('.count').textContent = selected.size > 0 ? `(${selected.size})` : '';
      });
    }

    // Auto-détection changements dataset
    (function autoWireToData(){
      let lastSig = -1;
      const signature = arr => {
        let acc = arr.length;
        for (let i=0; i<Math.min(150, arr.length); i++){
          const e = arr[i];
          const s = (e.ticker||e.symbol||'') + '|' + (e.fund_type||'') + '|' +
                    (e.aum_usd||0) + '|' + (e.sector_top||'') + '|' + (e.country_top||'');
          for (let k=0;k<s.length;k++) acc = (acc*33 + s.charCodeAt(k))>>>0;
        }
        return acc;
      };
      setInterval(()=>{
        const raw = (window.ETFData?.getData && window.ETFData.getData()) || [];
        const sig = signature(raw);
        if (sig !== lastSig){
          lastSig = sig;
          compute();
        }
      }, 1500);
    })();

    // ==== UI cases métriques & mode ====
    function syncSelectedFromUI() {
      const pills=[...root.querySelectorAll('.mc-pill input[id^="etf-m-"]')];
      state.selectedMetrics = pills.filter(x=>x.checked).map(x=>x.id.replace('etf-m-','')).filter(m=>METRICS[m]);
      if(!state.selectedMetrics.length) state.selectedMetrics=['return_ytd','ter','aum'];
      buildPriorityUI();
    }
    Object.keys(METRICS).forEach(metric=>{
      const cb=document.getElementById(`etf-m-${metric}`); if(!cb) return;
      cb.addEventListener('change',e=>{
        if(e.target.checked){ if(!state.selectedMetrics.includes(metric)) state.selectedMetrics.push(metric); }
        else state.selectedMetrics=state.selectedMetrics.filter(m=>m!==metric);
        cb.closest('.mc-pill')?.classList.toggle('is-checked',cb.checked);
        buildPriorityUI(); scheduleCompute();
      });
    });
    root.addEventListener('change',(e)=>{
      if(e.target && e.target.name==='etf-mc-mode'){ state.mode=e.target.value||'balanced'; buildPriorityUI(); scheduleCompute(); }
    });

    // ==== UI Priorités - VERSION AVEC FIX ÉCOUTEURS DUPLIQUÉS ====
    function buildPriorityUI() {
      let host = root.querySelector('fieldset[role="radiogroup"]') || root.querySelector('#etf-mc-section fieldset:nth-of-type(2)');
      if (!host) return;

      let box = document.getElementById('etf-priority-container');
      if (!box) {
        box = document.createElement('div');
        box.id = 'etf-priority-container';
        box.innerHTML = `
          <div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser la poignée ☰, ou utilisez ▲▼)</div>
          <div id="etf-priority-list" class="space-y-1" role="listbox" aria-label="Priorités"></div>
        `;
        host.appendChild(box);
      }

      box.style.display = (state.mode === 'balanced') ? 'none' : 'block';

      const list = box.querySelector('#etf-priority-list');
      list.innerHTML = state.selectedMetrics.map((m, i) => `
        <div class="priority-item" data-m="${m}" role="option" tabindex="0" aria-posinset="${i+1}" aria-setsize="${state.selectedMetrics.length}">
          <span class="drag-handle">☰</span>
          <span class="text-xs opacity-50 mr-2 priority-number">${i + 1}.</span>
          <span class="flex-1">${METRICS[m]?.label || m} ${METRICS[m]?.max ? '↑' : '↓'}</span>
          <div class="flex gap-1">
            <button type="button" class="btn-up" aria-label="Monter">▲</button>
            <button type="button" class="btn-down" aria-label="Descendre">▼</button>
          </div>
        </div>
      `).join('') || '<div class="text-xs opacity-50">Coche au moins un critère</div>';

      // Helpers ▲▼ + clavier  —————— 1 click = 1 place, sans sauts (SCROLL STABLE)
      const getScrollParent = (el) => {
        let p = el.parentElement;
        while (p) {
          const oy = getComputedStyle(p).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
          p = p.parentElement;
        }
        return window; // fallback
      };

      const renumber = () => {
        list.querySelectorAll('.priority-item').forEach((item, idx) => {
          item.querySelector('.priority-number').textContent = `${idx+1}.`;
          item.setAttribute('aria-posinset', String(idx+1));
        });
      };

      const commit = () => {
        state.selectedMetrics = [...list.querySelectorAll('.priority-item')].map(el => el.dataset.m);
        renumber();
        scheduleCompute();
      };

      // core: move 1 step and keep scroll stable
      const moveItem = (from, to, focusSelector) => {
        const items = [...list.querySelectorAll('.priority-item')];
        if (to < 0 || to >= items.length || from === to) return;

        const node = items[from];
        const ref  = (to > from) ? items[to].nextSibling : items[to];

        // freeze scroll
        const sp = getScrollParent(list);
        const prevTop = (sp === window) ? window.scrollY : sp.scrollTop;

        // move
        list.insertBefore(node, ref);

        // restore scroll (avoid big jump)
        if (sp === window) window.scrollTo(window.scrollX, prevTop);
        else sp.scrollTop = prevTop;

        // keep focus on the same control without scrolling
        if (focusSelector) {
          node.querySelector(focusSelector)?.focus?.({ preventScroll: true });
        }

        commit();
      };

      // ===== FIX ÉCOUTEURS DUPLIQUÉS =====
      
      // 1) CLICK ▲▼ — attacher une seule fois
      const onClickArrows = (e) => {
        if (typeof list.isDragging !== 'undefined' && list.isDragging) return;
        const upBtn   = e.target.closest('.btn-up');
        const downBtn = e.target.closest('.btn-down');
        if (!upBtn && !downBtn) return;
        
        e.preventDefault(); 
        e.stopPropagation();

        const item  = e.target.closest('.priority-item');
        const items = [...list.querySelectorAll('.priority-item')];
        const from  = items.indexOf(item);
        const to    = from + (upBtn ? -1 : 1);

        moveItem(from, to, upBtn ? '.btn-up' : '.btn-down');
      };

      // 2) CLAVIER — attacher une seule fois
      const onKeyMove = (e) => {
        const item = e.target.closest('.priority-item'); 
        if (!item) return;
        const items = [...list.querySelectorAll('.priority-item')];
        const idx = items.indexOf(item);
        if (e.key === 'ArrowUp')   { e.preventDefault(); moveItem(idx, idx-1, '.btn-up'); }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(idx, idx+1, '.btn-down'); }
      };

      // 3) Guard: ne brancher qu'une fois
      if (!list.dataset.wired) {
        list.addEventListener('click', onClickArrows);
        list.addEventListener('keydown', onKeyMove);
        list.dataset.wired = '1';
      }

      // 4) DnD — idem: ne brancher qu'une fois
      setupPointerDnD(list);
    }

    // ==== NOUVEAU DRAG&DROP ULTRA-FLUIDE + FIX ÉCOUTEURS ====
    function setupPointerDnD(list){
      if (list.dataset.dndWired === '1') return; // <<< empêche les doublons
      list.dataset.dndWired = '1';
      
      let dragging=null, ghost=null, placeholder=null, startY=0, offsetY=0, raf=null;
      let pressTimer=null, started=false, pointerId=null;
      let scrollRAF=null, scrollParent=null, lastClientY=0;
      let isDragging = false; // Bonus robustesse

      const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
      const LONG_PRESS_MS = 180;       // délai pour mobile
      const MOVE_TOL = 6;              // tolérance mouvement avant démarrage
      const EDGE = 64;                 // zone auto-scroll (px)
      const MAX_SPEED = 18;            // px/frame

      const listRectLeft = () => list.getBoundingClientRect().left + 6;

      const getScrollParent = (el) => {
        let p = el.parentElement;
        while (p) {
          const style = getComputedStyle(p);
          const oy = style.overflowY;
          if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
          p = p.parentElement;
        }
        return window; // fallback
      };

      function startDrag(ev, fromTouch=false){
        if (started || !dragging) return;
        started = true;
        isDragging = true; // Bonus robustesse
        list.isDragging = true; // Exposer au niveau list pour les boutons

        // pointer capture si possible
        try { ev.target.setPointerCapture?.(ev.pointerId); pointerId = ev.pointerId; } catch{}

        const r = dragging.getBoundingClientRect();
        offsetY = (ev.clientY ?? r.top) - r.top;

        // placeholder
        placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.style.height = `${r.height}px`;
        dragging.after(placeholder);

        // ghost
        ghost = dragging.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.width = `${r.width}px`;
        ghost.style.transform = `translate3d(${listRectLeft()}px, ${r.top}px, 0)`;
        document.body.appendChild(ghost);

        dragging.classList.add('dragging');
        dragging.style.opacity = '0.5';

        scrollParent = getScrollParent(list);
        ensureAutoScrollLoop(); // démarre la boucle
        document.addEventListener('pointermove', onPointerMove, {passive:false});
        document.addEventListener('pointerup', onPointerUp, {passive:false});
      }

      function clearPressTimer(){ if (pressTimer){ clearTimeout(pressTimer); pressTimer=null; } }

      function placePlaceholder(clientY){
        const items=[...list.querySelectorAll('.priority-item:not(.dragging)')];
        let after=null, best=Number.NEGATIVE_INFINITY;
        for(const el of items){
          const r=el.getBoundingClientRect();
          const off = clientY - (r.top + r.height/2);
          if(off<0 && off>best){ best=off; after=el; }
        }
        if(!after) list.appendChild(placeholder);
        else list.insertBefore(placeholder, after);
      }

      function onMoveY(clientY){
        if(!ghost) return;
        lastClientY = clientY;
        const y = clientY - offsetY;
        ghost.style.transform = `translate3d(${listRectLeft()}px, ${y}px, 0)`;
        placePlaceholder(clientY);
      }

      function onPointerMove(e){
        if (!dragging) return;
        const y = e.clientY ?? e.touches?.[0]?.clientY; if (y==null) return;
        if (!started){
          // Annuler long-press si mouvement trop grand avant démarrage
          const dy = Math.abs(y - startY);
          if (dy > MOVE_TOL) { clearPressTimer(); return; }
        }
        e.preventDefault();
        if (raf) return;
        raf = requestAnimationFrame(()=>{ onMoveY(y); raf=null; });
      }

      function ensureAutoScrollLoop(){
        if (scrollRAF) return;
        const step = () => {
          if (!started) { scrollRAF=null; return; }
          const sp = scrollParent;
          let vpTop, vpBottom, scrollFn, canScroll = false, speed=0;

          if (sp === window){
            vpTop = window.scrollY;
            vpBottom = vpTop + window.innerHeight;
            scrollFn = (dy)=>window.scrollTo(window.scrollX, vpTop + dy);
            canScroll = true;
          } else {
            vpTop = sp.scrollTop;
            vpBottom = vpTop + sp.clientHeight;
            scrollFn = (dy)=>{ sp.scrollTop = vpTop + dy; };
            canScroll = sp.scrollHeight > sp.clientHeight;
          }

          if (canScroll && lastClientY){
            const box = (sp === window) ? {top:0, bottom: window.innerHeight}
                                        : sp.getBoundingClientRect();
            const distTop = lastClientY - box.top;
            const distBot = box.bottom - lastClientY;

            let dy = 0;
            if (distTop < EDGE)  dy = -Math.ceil((EDGE - distTop)/EDGE * MAX_SPEED);
            else if (distBot < EDGE) dy =  Math.ceil((EDGE - distBot)/EDGE * MAX_SPEED);

            if (dy !== 0) {
              scrollFn(dy);
              // replacer le placeholder après scroll (car layout a bougé)
              placePlaceholder(lastClientY);
            }
          }
          scrollRAF = requestAnimationFrame(step);
        };
        scrollRAF = requestAnimationFrame(step);
      }

      function finishDrag(){
        // cleanup auto-scroll
        if (scrollRAF){ cancelAnimationFrame(scrollRAF); scrollRAF=null; }

        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        
        // FIX pointer capture (release sur l'élément qui a capturé)
        if (pointerId!=null && dragging) {
          try { dragging.releasePointerCapture(pointerId); } catch {}
        }
        pointerId=null;

        if(ghost) ghost.remove(); ghost=null;

        if(dragging){
          if(placeholder) list.insertBefore(dragging, placeholder);
          dragging.classList.remove('dragging');
          dragging.style.removeProperty('opacity');
          dragging=null;
        }
        if(placeholder){ placeholder.remove(); placeholder=null; }

        // MAJ ordre + numérotation + compute (une fois)
        const items = [...list.querySelectorAll('.priority-item')];
        state.selectedMetrics = items.map(el => el.dataset.m);
        items.forEach((n,i)=> n.querySelector('.priority-number').textContent = (i+1)+'.');
        started=false;
        isDragging = false; // Bonus robustesse
        list.isDragging = false; // Exposer au niveau list pour les boutons
        scheduleCompute();
      }

      function onPointerUp(e){ e.preventDefault(); clearPressTimer(); finishDrag(); }

      // Démarrage : poignée uniquement
      list.addEventListener('pointerdown', (e)=>{
        const handle = e.target.closest('.drag-handle');
        const item = e.target.closest('.priority-item');
        if (!handle || !item) return;

        e.preventDefault(); // évite sélection texte
        dragging = item;
        startY = e.clientY ?? item.getBoundingClientRect().top;

        if (isTouch){
          clearPressTimer();
          pressTimer = setTimeout(()=> startDrag(e), LONG_PRESS_MS);
          // Si mouvement pendant l'attente, on annule
          const cancelIfMove = (ev)=>{
            const y = ev.clientY ?? ev.touches?.[0]?.clientY; if (y==null) return;
            if (Math.abs(y - startY) > MOVE_TOL){ clearPressTimer(); list.removeEventListener('pointermove', cancelIfMove); }
          };
          list.addEventListener('pointermove', cancelIfMove, {passive:true, once:true});
        } else {
          startDrag(e);
        }
      });

      // Shim touch → pointer pour compat iOS très ancienne (sécurisé)
      list.addEventListener('touchstart', (e)=>{
        const t = e.touches[0];
        const handle = e.target.closest('.drag-handle');
        if (!handle) return;
        const ev = new PointerEvent('pointerdown', {bubbles:true, clientX:t.clientX, clientY:t.clientY, pointerType:'touch'});
        e.target.dispatchEvent(ev);
      }, {passive:true});
    }

    // ==== BUILD CACHE ====
    function buildCache(){
      const n=state.data.length; if(!n) return;
      for(const s of state.data){
        s.metrics={};
        for(const [k,def] of Object.entries(METRICS)){ s.metrics[k]=def.get(s); }
      }
      for(const m of Object.keys(METRICS)){
        const raw=new Float64Array(n);
        for(let i=0;i<n;i++) raw[i]=state.data[i].metrics[m];
        const sorted0=Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
        if(!sorted0.length){ cache[m]={raw,sorted:new Float64Array(),rankPct:new Float64Array(n),iqr:1}; continue; }
        const qIdx=(arr,p)=>arr[Math.floor(p*(arr.length-1))];
        const lo=qIdx(sorted0,0.005), hi=qIdx(sorted0,0.995);
        for(let i=0;i<n;i++){ if(Number.isFinite(raw[i])) raw[i]=Math.min(hi,Math.max(lo,raw[i])); }
        const sorted=Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
        const qIdxW=(p)=>sorted[Math.floor(p*(sorted.length-1))];
        const q1=qIdxW(0.25), q3=qIdxW(0.75);
        const iqr=Math.max(1e-9, q3-q1);
        const idx=Array.from({length:n},(_,i)=>i).filter(i=>Number.isFinite(raw[i]));
        idx.sort((i,j)=>raw[i]-raw[j]);
        const rankPct=new Float64Array(n);
        let k=0;
        while(k<idx.length){
          let j=k+1; while(j<idx.length && Math.abs(raw[idx[j]]-raw[idx[k]])<1e-12) j++;
          const r=(k+j-1)/2; const hazen=(r+0.5)/idx.length;
          for(let t=k;t<j;t++) rankPct[idx[t]]=hazen;
          k=j;
        }
        cache[m]={raw,sorted:Float64Array.from(sorted),rankPct,iqr};
      }
    }

    // ==== MASQUES ====
    const q1d=(v)=>Math.round(v*10)/10;
    function buildFacetMask(){
      const n=state.data.length, mask=new Uint8Array(n); mask.fill(1);
      for(let i=0;i<n;i++){
        const e=state.data[i];
        if(state.baseFilter !== 'all'){
          const kind = classify(e);
          if(state.baseFilter === 'equity' && kind !== 'equity'){ mask[i]=0; continue; }
          if(state.baseFilter === 'bonds' && kind !== 'bonds'){ mask[i]=0; continue; }
        }
        if(state.filters.excludeLeveraged && e.__lev){ mask[i]=0; continue; }
        // MODIFIÉ : suppression du filtre countries
        // if(state.filters.countries.size && !e.__countries.some(c=>state.filters.countries.has(c))) { mask[i]=0; continue; }
        if(state.filters.sectors.size && !e.__sectors.some(s=>state.filters.sectors.has(s))) { mask[i]=0; continue; }
        if(state.filters.fundTypes.size && !state.filters.fundTypes.has(str(e.fund_type).trim())) { mask[i]=0; continue; }
      }
      masks.facets=mask; return mask;
    }
    function buildCustomMask(){
      const n=state.data.length, mask=new Uint8Array(n); mask.fill(1);
      const fs=state.customFilters||[];
      for(let i=0;i<n;i++){
        for(const f of fs){
          const raw=state.data[i].metrics[f.metric];
          if(!Number.isFinite(raw)){ mask[i]=0; break; }
          const v=q1d(raw), x=q1d(+f.value);
          const op=f.operator.replace('≥','>=').replace('≤','<=').replace('≠','!=');
          let ok=true;
          switch(op){case'>=':ok=v>=x;break;case'>':ok=v>x;break;case'=':ok=v===x;break;case'<':ok=v<x;break;case'<=':ok=v<=x;break;case'!=':ok=v!==x;break;}
          if(!ok){ mask[i]=0; break; }
        }
      }
      masks.custom=mask; return mask;
    }
    function buildFinalMask(){
      const n=state.data.length, out=new Uint8Array(n);
      if(!masks.facets) buildFacetMask();
      if(!masks.custom) buildCustomMask();
      for(let i=0;i<n;i++) out[i]=(masks.facets[i] & masks.custom[i]) ? 1 : 0;
      masks.final=out; return out;
    }
    function getFilteredIndices(requireMetrics=[]){
      if(!masks.final) buildFinalMask();
      const n=state.data.length, indices=[];
      for(let i=0;i<n;i++){
        if(!masks.final[i]) continue;
        let valid=0;
        for(const m of requireMetrics){ if(Number.isFinite(cache[m]?.raw[i])) valid++; }
        if(valid >= requireMetrics.length - ALLOW_MISSING) indices.push(i);
      }
      return indices;
    }

    // ==== nearTie & comparateur ====
    const localWindow=(len)=>Math.max(6, Math.min(40, Math.ceil(0.03*len)));
    function localGap(sorted, v){
      const a=sorted, n=a.length; if(!n) return Infinity;
      let lo=0, hi=n; while(lo<hi){const mid=(lo+hi)>>1; (a[mid]<v)?lo=mid+1:hi=mid;}
      const W=localWindow(n), i=Math.min(Math.max(lo,1),n-2);
      const start=Math.max(1,i-W), end=Math.min(n-2,i+W);
      const gaps=[]; for(let j=start-1;j<=end;j++) gaps.push(Math.abs(a[j+1]-a[j]));
      gaps.sort((x,y)=>x-y); return gaps.length?gaps[Math.floor(gaps.length/2)]:Infinity;
    }
    function nearTie(metric, vA, vB, dPct, n){
      const c=cache[metric]; if(!c) return false;
      const baseP = TOL_PRESET.c / Math.sqrt(Math.max(2, n));
      const gLoc = localGap(c.sorted, (vA+vB)/2);
      const tolV = Math.max(TOL_PRESET.kappa * (gLoc / c.iqr), (GAP_FLOOR[metric]||0) / c.iqr);
      const nearV = Math.abs(vA-vB)/c.iqr <= tolV;
      const nearP = Math.abs(dPct) <= Math.max(baseP, MIN_TOL_P);
      return nearV || nearP;
    }
    function smarterCompare(aIdx,bIdx,prios){
      const n=state.data.length;
      for(let i=0;i<prios.length;i++){
        const m=prios[i];
        let pA=cache[m].rankPct[aIdx], pB=cache[m].rankPct[bIdx];
        if(!METRICS[m].max){ pA=1-pA; pB=1-pB; }
        const dPct=pA-pB, vA=cache[m].raw[aIdx], vB=cache[m].raw[bIdx];
        if(!nearTie(m, vA, vB, dPct, n)) return dPct>0?-1:1;
      }
      const weights=prios.map((_,i)=>Math.pow(0.5,i));
      let sA=0, sB=0;
      for(let i=0;i<prios.length;i++){
        const m=prios[i]; let pA=cache[m].rankPct[aIdx], pB=cache[m].rankPct[bIdx];
        if(!METRICS[m].max){ pA=1-pA; pB=1-pB; }
        sA += pA*weights[i]; sB += pB*weights[i];
      }
      if(sA!==sB) return sB - sA;
      const ta=str(state.data[aIdx].ticker||state.data[aIdx].symbol||state.data[aIdx].name||'');
      const tb=str(state.data[bIdx].ticker||state.data[bIdx].symbol||state.data[bIdx].name||'');
      return ta.localeCompare(tb);
    }
    function topNByLexico(indices, prios){
      if(indices.length<=TOP_N) return indices.sort((a,b)=>smarterCompare(a,b,prios)).map(i=>({e:state.data[i]}));
      let candidates=indices.slice();
      if(candidates.length>600){
        candidates.sort((a,b)=>smarterCompare(a,b,[prios[0]])); candidates=candidates.slice(0,120);
        if(prios.length>1){ candidates.sort((a,b)=>smarterCompare(a,b,[prios[0],prios[1]])); candidates=candidates.slice(0,40); }
      }
      candidates.sort((a,b)=>smarterCompare(a,b,prios));
      return candidates.slice(0,TOP_N).map(i=>({e:state.data[i]}));
    }

    // ==== RANKING ====
    function rankBalanced(indices){
      const M=state.selectedMetrics, out=[];
      for(const i of indices){
        let sum=0, k=0;
        for(const m of M){
          const pct=cache[m].rankPct[i];
          if(Number.isFinite(pct)){ const adj=METRICS[m].max ? pct : (1-pct); sum+=adj; k++; }
        }
        if(k>0) out.push({i, score:sum/k});
      }
      out.sort((a,b)=>b.score-a.score);
      return out.slice(0,TOP_N).map(x=>({e:state.data[x.i], score:x.score}));
    }

    // ==== RENDU AVEC BADGES VOLATILITÉ ====
    const fmt=(n,d=1)=>Number.isFinite(+n)?(+n).toFixed(d):'—';
    function render(entries){
      results.innerHTML = '<div class="space-y-2"></div>';
      const container=results.querySelector('.space-y-2');
      if(!entries.length){ container.innerHTML='<div class="text-center text-cyan-400 py-4">Aucun ETF ne correspond aux critères</div>'; return; }

      entries.forEach((row,i)=>{
        const e=row.e;
        const typeBadge =
          classify(e)==='bonds'     ? '<span class="badge" style="color:#80aaff;border-color:rgba(128,170,255,.35);background:rgba(128,170,255,.08)">Oblig.</span>' :
          classify(e)==='commodity' ? '<span class="badge" style="color:#fbbf24;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)">Mat.</span>' :
                                      '<span class="badge" style="color:#00ffd0;border-color:rgba(0,255,135,.35);background:rgba(0,255,135,.09)">Actions</span>';
        
        const levBadge = e.__lev ? '<span class="badge" style="color:#ff9aa7;border-color:rgba(255,90,90,.35);background:rgba(255,90,90,.12)">LEV/INV</span>' : '';
        const singleBadge = e.__singleStock ? '<span class="badge" style="color:#a7f3d0;border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.10)">Action unique</span>' : '';
        
        // Utiliser getTicker et getName pour l'affichage
        const titleTicker = esc(e.__ticker || '—');
        const titleName   = esc(e.__name || '');

        const colsHTML = state.selectedMetrics.map(m=>{
          const d=METRICS[m]; if(!d) return '';
          const raw=e.metrics?.[m];
          const renderVal=()=>{
            if(!Number.isFinite(raw)) return '—';
            if(m==='aum'){ const M=raw; return (M>=1000)?(M/1000).toFixed(1)+'B$' : Math.round(M)+'M$'; }
            return d.unit==='%' ? fmt(raw,1)+'%' : fmt(raw,1);
          };
          const color=()=>{
            if(!Number.isFinite(raw)) return '';
            if(m==='ter') return raw<0.2?'g':raw<0.4?'g':'y';
            if(m==='volatility') return raw<10?'g':raw<20?'g':'y';
            return raw>=0?'g':'r';
          };
          // ✨ BADGE VOLATILITÉ : Afficher la fenêtre de calcul
          const volBadge = (m === 'volatility' && e.vol_window) ? 
            `<span class="vol-badge vol-${e.vol_window}">${e.vol_window}</span>` : '';
          
          return `<div class="metric-col"><div class="k">${d.label}${volBadge}</div><div class="v ${color()}">${renderVal()}</div></div>`;
        }).join('');

        // Micro avec nettoyage des 0%
        const topS = (e.__sectors && e.__sectors[0]) ? e.__sectors[0] : '';
        const wS = Number(e.sector_top_weight);
        const topC = (e.__countries && e.__countries[0]) ? e.__countries[0] : '';
        const wC = Number(e.country_top_weight);
        
        const microParts = [];
        if (topS && Number.isFinite(wS) && wS > ZERO_EPS) microParts.push(`${topS} ${wS.toFixed(0)}%`);
        if (topC && Number.isFinite(wC) && wC > ZERO_EPS) microParts.push(`${topC} ${wC.toFixed(0)}%`);
        const micro = microParts.join(' • ');

        const card=document.createElement('div'); card.className='etf-card';
        card.innerHTML=`
          <div class="etf-rank">#${i+1}</div>
          <div class="etf-info">
            <div class="etf-name" title="${titleTicker}${titleName?' — '+titleName:''}">
              <span class="font-semibold">${titleTicker}</span>
              ${titleName ? `<span class="opacity-70"> — ${titleName}</span>` : ''}
              ${typeBadge} ${levBadge} ${singleBadge}
            </div>
            ${micro?`<div class="micro">${micro}</div>`:''}
          </div>
          <div class="metrics">${colsHTML}</div>`;
        container.appendChild(card);
      });
    }

    // ==== SUMMARY ====
    function updateSummary(filtered,total){
      if(!summary) return;
      const mode=state.mode==='balanced'?'Équilibre':'Priorités intelligentes';
      const typeLabel = state.baseFilter === 'equity' ? ' Actions' : state.baseFilter === 'bonds' ? ' Obligations' : '';
      const metrics=state.selectedMetrics.map(m=>METRICS[m]?.label).filter(Boolean).join(' · ');
      const tags=[];
      // MODIFIÉ : suppression du tag Pays
      // if(state.filters.countries.size) tags.push(`Pays(${state.filters.countries.size})`);
      if(state.filters.sectors.size)   tags.push(`Secteurs(${state.filters.sectors.size})`);
      if(state.filters.fundTypes.size) tags.push(`Type(${state.filters.fundTypes.size})`);
      if(state.filters.excludeLeveraged) tags.push('No Lev/Inv');
      summary.innerHTML=`<strong>${mode}${typeLabel}</strong> • ${metrics}${tags.length?' • '+tags.join(' '):''} • ${filtered}/${total} ETFs`;
    }

    // ==== COMPUTE PIPELINE ====
    let computeTimer; const scheduleCompute=()=>{ clearTimeout(computeTimer); computeTimer=setTimeout(compute,120); };

    function compute(){
      const raw=window.ETFData.getData()||[];
      state.data = raw.map(e=>{
        // Parse top5 en ignorant les 0%
        const ss5 = parseTopList(e.sector_top5, 's', 'w');
        const cs5 = parseTopList(e.country_top5, 'c', 'w');
        
        // Fallbacks avec vérification des poids
        const sectorTopW = Number(e.sector_top_weight);
        const sectorTopLabel = String(e.sector_top||'').trim();
        const sectors = ss5.length ? ss5 
                      : (Number.isFinite(sectorTopW) && sectorTopW > ZERO_EPS && sectorTopLabel ? [sectorTopLabel] : []);
        
        const countryTopW = Number(e.country_top_weight);
        const countryTopLabel = String(e.country_top||'').trim();
        const countries = cs5.length ? cs5
                        : (Number.isFinite(countryTopW) && countryTopW > ZERO_EPS && countryTopLabel ? [countryTopLabel] : []);
        
        // Détection leveraged améliorée
        const __levFlag = (()=>{
          const t = String(e.etf_type||'').toLowerCase();
          const lev = Number(e.leverage);
          const byField = /leveraged|inverse/.test(t) || (Number.isFinite(lev) && lev !== 0);
          const name = (e.long_name||e.fund_name||e.name||'') + ' ' + (e.symbol||'');
          const byName = /\b(2x|3x|x2|x3|leveraged|inverse|bull|bear)\b/i.test(name);
          return byField || byName;
        })();
        
        // Détection single-stock
        let __singleStock = false;
        if (sectors.length === 0) {
          const h = guessSingleStock(e);
          __singleStock = h.single;
        }
        
        return {
          ...e,
          __ticker: getTicker(e),  // NEW: enrichir avec ticker
          __name:   getName(e),    // NEW: enrichir avec nom
          __kind: classify(e),
          __lev: __levFlag,
          __singleStock,
          __countries: [...new Set(countries)],
          __sectors: [...new Set(sectors)]
        };
      });

      recomputeFacetCatalogs();
      renderDynamicFacets();
      buildCache();

      masks.facets=masks.custom=masks.final=null;
      const pool = getFilteredIndices(state.selectedMetrics);

      updateSummary(pool.length, state.data.length);
      if(pool.length===0){ render([]); return; }

      let out;
      if(state.mode==='balanced'){ out = rankBalanced(pool); }
      else { out = topNByLexico(pool, state.selectedMetrics); }

      render(out);
    }

    // ==== UI filtres custom ====
    function setupCustomFiltersUI(){
      const metricSel=document.getElementById('etf-filter-metric');
      const opSel=document.getElementById('etf-filter-operator');
      const valInp=document.getElementById('etf-filter-value');
      const unitSpan=document.getElementById('etf-filter-unit');
      const addBtn=document.getElementById('etf-add-filter');
      const listBox=document.getElementById('etf-custom-filters-list');
      if(!metricSel||!opSel||!valInp||!unitSpan||!addBtn||!listBox) return;
      const updUnit=()=>unitSpan.textContent=METRICS[metricSel.value]?.unit||''; updUnit(); metricSel.addEventListener('change',updUnit);
      addBtn.addEventListener('click',()=>{
        const m=metricSel.value,op=opSel.value,val=parseFloat(valInp.value);
        if(!METRICS[m]||!Number.isFinite(val)) return;
        state.customFilters.push({metric:m,operator:op,value:val}); valInp.value=''; renderList(); scheduleCompute();
      });
      function renderList(){
        if(!state.customFilters.length){listBox.innerHTML='<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';return;}
        listBox.innerHTML=state.customFilters.map((f,i)=>{
          const d=METRICS[f.metric], unit=d.unit||'';
          const col=(f.operator==='>='||f.operator==='>')?(d.max?'g':'y'):(f.operator==='<='||f.operator==='<')?(d.max?'r':'g'):'y';
          const qv=Math.round(+f.value*10)/10;
          return `<div class="filter-item flex items-center gap-2 p-2 rounded">
            <span class="flex-1">${d.label} <span class="${col} font-semibold">${f.operator} ${qv}${unit}</span></span>
            <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-i="${i}"><i class="fas fa-times"></i></button>
          </div>`;
        }).join('');
        listBox.querySelectorAll('.remove-filter').forEach(b=>b.addEventListener('click',e=>{
          const idx=+e.currentTarget.dataset.i; state.customFilters.splice(idx,1); renderList(); scheduleCompute();
        }));
      }
      renderList();
    }

    document.getElementById('etf-filter-leveraged')?.addEventListener('change',e=>{
      state.filters.excludeLeveraged=!!e.target.checked;
      recomputeFacetCatalogs();
      renderDynamicFacets();
      scheduleCompute();
    });

    // ==== Boutons ====
    document.getElementById('etf-mc-apply')?.addEventListener('click',()=>compute());
    document.getElementById('etf-mc-reset')?.addEventListener('click',()=>{
      state.mode='balanced';
      state.baseFilter='all';
      state.selectedMetrics=['return_ytd','ter','aum','return_1y'];
      state.filters={sectors:new Set(),fundTypes:new Set(),excludeLeveraged:true}; // MODIFIÉ : pas de countries
      state.customFilters=[];
      document.querySelectorAll('#etf-base-filter button').forEach(b=>b.classList.remove('active'));
      document.querySelector('#etf-base-filter button[data-type="all"]')?.classList.add('active');
      document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp=>{
        const id=inp.id?.replace('etf-m-','');
        inp.checked=state.selectedMetrics.includes(id);
        inp.closest('.mc-pill')?.classList.toggle('is-checked',inp.checked);
      });
      recomputeFacetCatalogs();
      renderDynamicFacets();
      const listBox=document.getElementById('etf-custom-filters-list');
      if(listBox) listBox.innerHTML='<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';
      syncSelectedFromUI();
      buildPriorityUI();
      compute();
    });

    // Initialisation
    createBaseFilterUI();
    syncSelectedFromUI();
    setupCustomFiltersUI();
    setTimeout(()=>compute(), 300);
    // NEW: Ajouter l'alias calculate pour compute
    window.ETF_MC={compute,state,METRICS,cache, calculate: compute};
  }
})();
