// ===== MC (Multi-Critères) – Module Optimisé v2.0 avec Cache & Bitsets ===================
(function(){
  // Attendre que le DOM soit prêt
  if (!document.querySelector('#mc-section')) {
    console.log('⏳ MC: En attente du DOM...');
    setTimeout(arguments.callee, 500);
    return;
  }

  const root = document.querySelector('#mc-section');
  const results = document.querySelector('#mc-results .stock-cards-container');
  
  if(!root || !results) {
    console.error('❌ MC: Éléments DOM non trouvés', {root, results});
    return;
  }

  console.log('✅ MC: Éléments DOM trouvés');

  // ==== CONSTANTES DE PERFORMANCE ====
  const GAP_FLOOR = { 
    ytd: 0.3, 
    dividend_yield: 0.1, 
    volatility_3y: 0.2, 
    max_drawdown_3y: 0.3,
    perf_daily: 0.5,
    perf_1m: 0.4,
    perf_3m: 0.4,
    perf_1y: 0.3,
    perf_3y: 0.3
  };
  
  const TOL_PRESET = { c: 1.0, kappa: 1.5 };  // Normal par défaut
  const TOP_N = 10;

  // Cache des métriques et masques de filtrage
  const cache = {};  // { metric: { raw, sorted, rankPct, iqr } }
  const masks = { geo: null, custom: null, final: null };  // Bitsets

  // Parser amélioré avec minus unicode et espaces
  const p = (s)=>{
    if(s==null||s==='-'||s==='') return NaN;
    const t = String(s)
      .replace(/\u2212/g,'-')        // minus unicode
      .replace(',', '.')             // décimal FR
      .replace(/[+%\s]/g,'')         // +, %, espaces
      .trim();
    return parseFloat(t);
  };

  // Métriques disponibles ORGANISÉES PAR CATÉGORIE
  const METRICS = {
    // Performance
    perf_daily:      {label:'Perf Daily',     unit:'%', get:s=>s.metrics?.perf_daily ?? NaN, max:true},
    perf_1m:         {label:'Perf 1M',        unit:'%', get:s=>s.metrics?.perf_1m ?? NaN,    max:true},
    perf_3m:         {label:'Perf 3M',        unit:'%', get:s=>s.metrics?.perf_3m ?? NaN,    max:true},
    ytd:             {label:'YTD',            unit:'%', get:s=>s.metrics?.ytd ?? NaN,         max:true},
    perf_1y:         {label:'Perf 1Y',        unit:'%', get:s=>s.metrics?.perf_1y ?? NaN,    max:true},
    perf_3y:         {label:'Perf 3Y',        unit:'%', get:s=>s.metrics?.perf_3y ?? NaN,    max:true},
    // Risque
    volatility_3y:   {label:'Vol 3Y',         unit:'%', get:s=>s.metrics?.volatility_3y ?? NaN,   max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      unit:'%', get:s=>s.metrics?.max_drawdown_3y ?? NaN, max:false},
    // Dividende
    dividend_yield:  {label:'Div. Yield',     unit:'%', get:s=>s.metrics?.dividend_yield ?? NaN,  max:true},
  };

  // DOM
  const modeRadios=[...root.querySelectorAll('input[name="mc-mode"]')];
  const applyBtn=document.getElementById('mc-apply');
  const resetBtn=document.getElementById('mc-reset');
  const summary=document.getElementById('mc-summary');

  // État et données
  const state={ 
    mode:'balanced', 
    data:[], 
    loading:false,
    selectedMetrics: ['ytd', 'dividend_yield'],
    customFilters: [],
    geoFilters: {
      region: 'all',
      country: 'all',
      sector: 'all'
    },
    availableRegions: new Set(),
    availableCountries: new Set(),
    availableSectors: new Set()
  };

  // Debounce pour auto-recompute
  let computeTimer;
  const scheduleCompute = () => {
    clearTimeout(computeTimer);
    computeTimer = setTimeout(compute, 150);
  };

  // ===== MIN HEAP POUR TOP K =====
  class MinHeap {
    constructor(){ this.a=[]; }
    size(){ return this.a.length; }
    peek(){ return this.a[0]; }
    push(x){ 
      const a=this.a; 
      a.push(x); 
      let i=a.length-1;
      while(i>0){ 
        const p=(i-1)>>1; 
        if (a[p].key<=x.key) break; 
        [a[i],a[p]]=[a[p],a[i]]; 
        i=p; 
      }
    }
    pop(){ 
      const a=this.a; 
      if(!a.length) return;
      const top=a[0], x=a.pop(); 
      if(!a.length) return top;
      a[0]=x; 
      let i=0;
      while(true){ 
        const l=2*i+1, r=l+1; 
        let s=i;
        if(l<a.length && a[l].key<a[s].key) s=l;
        if(r<a.length && a[r].key<a[s].key) s=r;
        if(s===i) break; 
        [a[i],a[s]]=[a[s],a[i]]; 
        i=s;
      }
      return top;
    }
  }

  // ===== CONSTRUCTION DU CACHE =====
  function buildCache() {
    const n = state.data.length;
    if (n === 0) return;

    console.log('📊 Construction du cache pour', n, 'stocks...');
    
    // Parser toutes les métriques une seule fois
    for (const s of state.data) {
      s.metrics = {
        perf_daily: p(s.perf_daily||s.daily||s.perf_1d),
        perf_1m:    p(s.perf_1m),   
        perf_3m:    p(s.perf_3m),
        ytd:        p(s.perf_ytd||s.ytd),
        perf_1y:    p(s.perf_1y),   
        perf_3y:    p(s.perf_3y||s.perf_3_years),
        volatility_3y:   p(s.volatility_3y),
        max_drawdown_3y: p(s.max_drawdown_3y),
        dividend_yield:  p(s.dividend_yield),
      };
    }

    // Construire cache par métrique
    for (const m of Object.keys(METRICS)) {
      const raw = new Float64Array(n);
      for (let i=0; i<n; i++) {
        raw[i] = state.data[i].metrics[m];
      }

      // Copie triée & winsorisation douce (0.5%–99.5%)
      const validIndices = [];
      for (let i=0; i<n; i++) {
        if (Number.isFinite(raw[i])) validIndices.push(i);
      }
      
      const sorted = validIndices.map(i => raw[i]).sort((a,b) => a-b);
      
      if (sorted.length > 0) {
        const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
        const lo = q(0.005), hi = q(0.995);
        for (let i=0; i<n; i++) {
          if (Number.isFinite(raw[i])) {
            raw[i] = Math.min(hi, Math.max(lo, raw[i]));
          }
        }
      }

      // Rang/percentile Hazen + égalités
      const idx = validIndices.sort((i,j) => raw[i] - raw[j]);
      const rankPct = new Float64Array(n); // défaut 0
      let k = 0;
      while (k < idx.length) {
        let j = k + 1; 
        while(j < idx.length && Math.abs(raw[idx[j]] - raw[idx[k]]) < 1e-12) j++;
        const r = (k + j - 1) / 2;
        const hazen = (r + 0.5) / idx.length;
        for (let t = k; t < j; t++) {
          rankPct[idx[t]] = hazen;
        }
        k = j;
      }

      // IQR robuste (pour normaliser les gaps)
      let iqr = 1;
      if (sorted.length >= 4) {
        const q1 = sorted[Math.floor(0.25 * (sorted.length - 1))];
        const q3 = sorted[Math.floor(0.75 * (sorted.length - 1))];
        iqr = Math.max(1e-9, q3 - q1);
      }

      cache[m] = { 
        raw, 
        sorted: Float64Array.from(sorted), 
        rankPct, 
        iqr 
      };
    }
    
    console.log('✅ Cache construit avec succès');
  }

  // ===== OUTILS PERCENTILES & NEAR-TIE =====
  const localWindow = (len) => Math.max(6, Math.min(40, Math.ceil(0.03 * len)));

  function localGap(sorted, v) {
    const a = sorted; 
    const n = a.length; 
    if(!n) return Infinity;
    
    let lo=0, hi=n; 
    while(lo<hi) { 
      const mid=(lo+hi)>>1; 
      (a[mid]<v) ? lo=mid+1 : hi=mid; 
    }
    
    const W = localWindow(n);
    const i = Math.min(Math.max(lo,1), n-2);
    const start = Math.max(1, i-W), end = Math.min(n-2, i+W);
    const gaps = [];
    for (let j=start-1; j<=end; j++) {
      gaps.push(Math.abs(a[j+1] - a[j]));
    }
    gaps.sort((x,y) => x-y);
    return gaps.length ? gaps[Math.floor(gaps.length/2)] : Infinity;
  }

  function nearTie(metric, vA, vB, dPct, n) {
    const { sorted, iqr } = cache[metric];
    const c = TOL_PRESET.c;
    const baseP = c / Math.sqrt(Math.max(2, n));
    const gLoc = localGap(sorted, (vA + vB) / 2);
    const tolV = Math.max(TOL_PRESET.kappa * (gLoc/iqr), (GAP_FLOOR[metric]||0) / iqr);
    const nearV = Math.abs(vA - vB) / iqr <= tolV;
    const nearP = Math.abs(dPct) <= Math.max(baseP, 1.5 * (1/Math.max(2, sorted.length)));
    return nearV || nearP;
  }

  // ===== BITSETS DE FILTRAGE =====
  function buildGeoMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n); 
    mask.fill(1);
    
    for (let i=0; i<n; i++) {
      const s = state.data[i];
      if (state.geoFilters.region !== 'all' && s.region !== state.geoFilters.region) mask[i] = 0;
      if (state.geoFilters.country !== 'all' && s.country !== state.geoFilters.country) mask[i] = 0;
      if (state.geoFilters.sector !== 'all' && s.sector !== state.geoFilters.sector) mask[i] = 0;
    }
    masks.geo = mask;
  }

  function buildCustomMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n); 
    mask.fill(1);
    const fs = state.customFilters || [];
    
    for (let i=0; i<n; i++) {
      for (const f of fs) {
        const v = state.data[i].metrics[f.metric];
        if (!Number.isFinite(v)) { 
          mask[i] = 0; 
          break; 
        }
        
        const x = f.value, EPS = 0.001;
        let ok = true;
        if (f.operator === '>=') ok = v >= x - EPS;
        else if (f.operator === '>') ok = v > x - EPS;
        else if (f.operator === '=') ok = Math.abs(v - x) < EPS;
        else if (f.operator === '<') ok = v < x + EPS;
        else if (f.operator === '<=') ok = v <= x + EPS;
        else if (f.operator === '!=') ok = Math.abs(v - x) > EPS;
        
        if (!ok) { 
          mask[i] = 0; 
          break; 
        }
      }
    }
    masks.custom = mask;
  }

  function buildFinalMask() {
    const n = state.data.length;
    const out = new Uint8Array(n);
    for (let i=0; i<n; i++) {
      out[i] = (masks.geo[i] & masks.custom[i]) ? 1 : 0;
    }
    masks.final = out;
  }

  function filteredIndices(requireMetrics) {
    const idx = [];
    const n = state.data.length;
    
    for (let i=0; i<n; i++) {
      if (!masks.final[i]) continue;
      
      // Vérifier présence métriques requises
      let ok = true;
      for (const m of requireMetrics) {
        if (!Number.isFinite(cache[m].raw[i])) { 
          ok = false; 
          break; 
        }
      }
      if (ok) idx.push(i);
    }
    return idx;
  }

  // ===== ALGORITHMES DE RANKING OPTIMISÉS =====
  
  // Comparateur lexico-smart sur indices
  function lexicoKey(idx, prios) {
    const w = prios.map((_, i) => Math.pow(0.5, i));
    const vec = [];
    
    for (let k=0; k<prios.length; k++) {
      const m = prios[k];
      let pA = cache[m].rankPct[idx]; 
      if (!METRICS[m].max) pA = 1 - pA;
      vec.push(pA);
    }
    
    const score = vec.reduce((acc, v, i) => acc + v * w[i], 0);
    const tkr = String(state.data[idx].ticker || state.data[idx].name || '');
    return { vec, score, tkr, key: -score };
  }

  function smarterCompare(aIdx, bIdx, prios) {
    const n = state.data.length;
    
    for (let i=0; i<prios.length; i++) {
      const m = prios[i];
      let pA = cache[m].rankPct[aIdx], pB = cache[m].rankPct[bIdx];
      if (!METRICS[m].max) { 
        pA = 1 - pA; 
        pB = 1 - pB; 
      }
      const dPct = pA - pB;
      const vA = cache[m].raw[aIdx], vB = cache[m].raw[bIdx];
      
      if (!nearTie(m, vA, vB, dPct, n)) {
        return dPct > 0 ? -1 : 1;
      }
    }
    
    // Tie-break pondéré puis ticker
    const wa = lexicoKey(aIdx, prios).score;
    const wb = lexicoKey(bIdx, prios).score;
    if (wa !== wb) return wb - wa;
    
    const ta = String(state.data[aIdx].ticker || state.data[aIdx].name || '');
    const tb = String(state.data[bIdx].ticker || state.data[bIdx].name || '');
    return ta.localeCompare(tb);
  }

  // Top N par tas (O(n log TOP_N))
  function topNByLexico(indices, prios) {
    if (indices.length <= TOP_N) {
      return indices.sort((a, b) => smarterCompare(a, b, prios));
    }
    
    const heap = new MinHeap();
    for (const i of indices) {
      const key = lexicoKey(i, prios).key;
      if (heap.size() < TOP_N) {
        heap.push({ idx: i, key });
      } else if (key < heap.peek().key) {
        heap.pop(); 
        heap.push({ idx: i, key });
      }
    }
    
    const arr = []; 
    while(heap.size()) arr.push(heap.pop().idx);
    return arr.sort((a, b) => smarterCompare(a, b, prios));
  }

  // Mode équilibré ultra-rapide
  function rankBalancedFast(indices) {
    const M = state.selectedMetrics;
    const out = [];
    
    for (const i of indices) {
      let sum = 0, k = 0;
      for (const m of M) {
        let p = cache[m].rankPct[i];
        if (!Number.isFinite(p)) continue;
        if (!METRICS[m].max) p = 1 - p;
        sum += p; 
        k++;
      }
      if (k > 0) out.push({ idx: i, score: sum / k });
    }
    
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, TOP_N).map(e => e.idx);
  }

  // ===== INTERFACE UTILISATEUR =====
  
  // Créer l'interface des filtres géographiques
  function setupGeoFilters() {
    const geoContainer = document.getElementById('geo-filters-container');
    if (!geoContainer) return;
    
    geoContainer.innerHTML = `
      <div class="space-y-2">
        <div class="flex gap-2 items-center">
          <label class="text-xs opacity-70 min-w-[60px]">Région:</label>
          <select id="filter-region" class="mini-select flex-1">
            <option value="all">Toutes régions</option>
            ${Array.from(state.availableRegions).map(r => 
              `<option value="${r}">${r}</option>`
            ).join('')}
          </select>
        </div>
        <div class="flex gap-2 items-center">
          <label class="text-xs opacity-70 min-w-[60px]">Pays:</label>
          <select id="filter-country" class="mini-select flex-1">
            <option value="all">Tous pays</option>
            ${Array.from(state.availableCountries).map(c => 
              `<option value="${c}">${c}</option>`
            ).join('')}
          </select>
        </div>
        <div class="flex gap-2 items-center">
          <label class="text-xs opacity-70 min-w-[60px]">Secteur:</label>
          <select id="filter-sector" class="mini-select flex-1">
            <option value="all">Tous secteurs</option>
            ${Array.from(state.availableSectors).map(s => 
              `<option value="${s}">${s}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `;
    
    // Event listeners avec auto-recompute
    document.getElementById('filter-region')?.addEventListener('change', (e) => {
      state.geoFilters.region = e.target.value;
      updateCountryFilter();
      scheduleCompute();
    });
    
    document.getElementById('filter-country')?.addEventListener('change', (e) => {
      state.geoFilters.country = e.target.value;
      scheduleCompute();
    });
    
    document.getElementById('filter-sector')?.addEventListener('change', (e) => {
      state.geoFilters.sector = e.target.value;
      scheduleCompute();
    });
  }

  // Mettre à jour le filtre pays selon la région sélectionnée
  function updateCountryFilter() {
    const countrySelect = document.getElementById('filter-country');
    if (!countrySelect) return;
    
    const filteredCountries = new Set();
    state.data.forEach(stock => {
      if (state.geoFilters.region === 'all' || stock.region === state.geoFilters.region) {
        if (stock.country) filteredCountries.add(stock.country);
      }
    });
    
    countrySelect.innerHTML = `
      <option value="all">Tous pays</option>
      ${Array.from(filteredCountries).sort().map(c => 
        `<option value="${c}">${c}</option>`
      ).join('')}
    `;
    
    state.geoFilters.country = 'all';
  }

  // Créer l'interface des filtres personnalisables
  function setupCustomFilters() {
    const filtersFieldset = root.querySelector('fieldset:nth-of-type(3)');
    if (!filtersFieldset) return;
    
    filtersFieldset.innerHTML = `
      <legend class="text-sm opacity-70 mb-2">Filtres géographiques</legend>
      <div id="geo-filters-container" class="mb-3">
        <!-- Les filtres géo seront ajoutés ici -->
      </div>
      
      <legend class="text-sm opacity-70 mb-2 mt-3">Filtres personnalisés</legend>
      <div id="custom-filters-list" class="space-y-2 mb-2">
        <!-- Les filtres seront ajoutés ici -->
      </div>
      <div class="flex gap-1 items-center filter-controls">
        <select id="filter-metric" class="mini-select" style="flex: 1.5; min-width: 100px;">
          ${Object.entries(METRICS).map(([k,v]) => 
            `<option value="${k}">${v.label}</option>`
          ).join('')}
        </select>
        <select id="filter-operator" class="mini-select" style="width: 50px;">
          <option value=">=">≥</option>
          <option value=">">></option>
          <option value="=">=</option>
          <option value="<"><</option>
          <option value="<=">≤</option>
          <option value="!=">≠</option>
        </select>
        <input id="filter-value" type="number" class="mini-input" style="width: 65px;" placeholder="0" step="0.1">
        <span class="text-xs opacity-60">%</span>
        <button id="add-filter" class="action-button" style="padding: 6px 10px;">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
    
    // Event listener pour ajouter un filtre
    document.getElementById('add-filter')?.addEventListener('click', () => {
      const metric = document.getElementById('filter-metric').value;
      const operator = document.getElementById('filter-operator').value;
      const value = parseFloat(document.getElementById('filter-value').value);
      
      if (!isNaN(value)) {
        state.customFilters.push({ metric, operator, value });
        updateFiltersList();
        document.getElementById('filter-value').value = '';
        scheduleCompute();
      }
    });
    
    state.customFilters = [];
    updateFiltersList();
  }

  // Mettre à jour l'affichage des filtres
  function updateFiltersList() {
    const filtersList = document.getElementById('custom-filters-list');
    if (!filtersList) return;
    
    filtersList.innerHTML = state.customFilters.map((filter, index) => {
      const metric = METRICS[filter.metric];
      const color = getOperatorColor(filter.operator, metric.max);
      
      return `
        <div class="filter-item flex items-center gap-2 p-2 rounded bg-white/5">
          <span class="flex-1">
            ${metric.label} 
            <span class="${color} font-semibold">${filter.operator} ${filter.value}%</span>
          </span>
          <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-index="${index}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }).join('') || '<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';
    
    filtersList.querySelectorAll('.remove-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        state.customFilters.splice(index, 1);
        updateFiltersList();
        scheduleCompute();
      });
    });
  }

  // Couleur selon l'opérateur
  function getOperatorColor(operator, isMax) {
    if (operator === '>=' || operator === '>') {
      return isMax ? 'text-green-400' : 'text-cyan-400';
    } else if (operator === '<=' || operator === '<') {
      return isMax ? 'text-red-400' : 'text-green-400';
    }
    return 'text-yellow-400';
  }

  // Créer/mettre à jour la zone de priorités avec drag & drop
  function updatePriorityDisplay() {
    let priorityContainer = document.getElementById('priority-container');
    
    if (!priorityContainer) {
      const modeFieldset = root.querySelector('fieldset[role="radiogroup"]');
      if (!modeFieldset) return;
      
      priorityContainer = document.createElement('div');
      priorityContainer.id = 'priority-container';
      priorityContainer.className = 'mt-3 p-3 rounded bg-white/5';
      priorityContainer.innerHTML = `
        <div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser pour réorganiser)</div>
        <div id="priority-list" class="space-y-1"></div>
      `;
      modeFieldset.appendChild(priorityContainer);
    }
    
    const priorityList = document.getElementById('priority-list');
    if (!priorityList) return;
    
    priorityContainer.style.display = state.mode === 'lexico' ? 'block' : 'none';
    
    priorityList.innerHTML = state.selectedMetrics.map((m, i) => `
      <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5 cursor-move" 
           draggable="true" data-metric="${m}">
        <span class="drag-handle">☰</span>
        <span class="priority-number text-xs opacity-50">${i+1}.</span>
        <span class="flex-1">${METRICS[m].label} ${METRICS[m].max?'↑':'↓'}</span>
      </div>
    `).join('') || '<div class="text-xs opacity-50">Cochez des critères pour définir les priorités</div>';
    
    setupDragAndDrop();
  }

  // Drag & Drop
  function setupDragAndDrop() {
    const items = document.querySelectorAll('.priority-item');
    let draggedItem = null;
    
    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        e.target.style.opacity = '0.5';
        e.target.classList.add('dragging');
      });
      
      item.addEventListener('dragend', (e) => {
        e.target.style.opacity = '';
        e.target.classList.remove('dragging');
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(e.currentTarget.parentNode, e.clientY);
        if (afterElement == null) {
          e.currentTarget.parentNode.appendChild(draggedItem);
        } else {
          e.currentTarget.parentNode.insertBefore(draggedItem, afterElement);
        }
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const newOrder = [...document.querySelectorAll('.priority-item')].map(el => el.dataset.metric);
        state.selectedMetrics = newOrder;
        updatePriorityDisplay();
      });
    });
  }
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.priority-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Synchroniser checkboxes et selectedMetrics
  function setupMetricCheckboxes() {
    Object.keys(METRICS).forEach(metricId => {
      const checkbox = root.querySelector('#m-' + metricId);
      if (!checkbox) return;
      
      if (state.selectedMetrics.includes(metricId)) {
        checkbox.checked = true;
      }
      
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!state.selectedMetrics.includes(metricId)) {
            state.selectedMetrics.push(metricId);
          }
        } else {
          state.selectedMetrics = state.selectedMetrics.filter(m => m !== metricId);
        }
        updatePriorityDisplay();
        scheduleCompute();
      });
    });
    
    // Synchroniser classe is-checked pour TOUS les pills
    root.querySelectorAll('.mc-pill input').forEach(inp => {
      const label = inp.closest('.mc-pill');
      if (!label) return;
      
      const sync = () => label.classList.toggle('is-checked', inp.checked);
      inp.addEventListener('change', sync);
      sync(); // État initial
    });
  }

  // Ajouter explication
  function addExplanation() {
    const modeContainer = root.querySelector('fieldset[role="radiogroup"]');
    if (modeContainer && !document.getElementById('mode-explanation')) {
      const explanation = document.createElement('div');
      explanation.id = 'mode-explanation';
      explanation.className = 'text-xs opacity-60 mt-2 p-2 rounded bg-white/5';
      explanation.innerHTML = `
        <div id="balanced-explanation">
          <strong>Mode Équilibre :</strong> Moyenne des scores percentiles optimisés (Hazen).
        </div>
        <div id="priority-explanation" class="hidden">
          <strong>Mode Priorités intelligentes :</strong> Tri lexicographique avec tolérances adaptatives (IQR-normalisées).
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
  }

  // Charger les données et extraire les infos géographiques
  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    
    try {
      console.log('📊 MC: Chargement des données...');
      const files = ['data/stocks_us.json', 'data/stocks_europe.json', 'data/stocks_asia.json'];
      const responses = await Promise.all(
        files.map(f => 
          fetch(f)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      
      const allStocks = [];
      responses.forEach((data, index) => {
        if (!data?.stocks) return;
        const region = ['US', 'EUROPE', 'ASIA'][index];
        data.stocks.forEach(stock => {
          stock.region = region;
          
          // Extraire le pays depuis exchange ou name
          if (!stock.country) {
            if (stock.exchange?.includes('India')) stock.country = 'Inde';
            else if (stock.exchange?.includes('China')) stock.country = 'Chine';
            else if (stock.exchange?.includes('Korea')) stock.country = 'Corée';
            else if (stock.exchange?.includes('Japan')) stock.country = 'Japon';
            else if (stock.exchange?.includes('London')) stock.country = 'UK';
            else if (stock.exchange?.includes('Paris')) stock.country = 'France';
            else if (stock.exchange?.includes('Frankfurt')) stock.country = 'Allemagne';
            else if (region === 'US') stock.country = 'USA';
            else if (region === 'EUROPE') stock.country = 'Europe';
            else if (region === 'ASIA') stock.country = 'Asie';
          }
          
          // Extraire le secteur depuis le nom ou ajouter un secteur par défaut
          if (!stock.sector) {
            const name = stock.name?.toLowerCase() || '';
            if (name.includes('bank') || name.includes('financ')) stock.sector = 'Finance';
            else if (name.includes('tech') || name.includes('software') || name.includes('semi')) stock.sector = 'Technologie';
            else if (name.includes('pharma') || name.includes('health')) stock.sector = 'Santé';
            else if (name.includes('energy') || name.includes('oil') || name.includes('gas')) stock.sector = 'Énergie';
            else if (name.includes('retail') || name.includes('consum')) stock.sector = 'Consommation';
            else if (name.includes('real estate') || name.includes('reit')) stock.sector = 'Immobilier';
            else if (name.includes('industrial')) stock.sector = 'Industrie';
            else stock.sector = 'Autres';
          }
          
          // Ajouter aux listes
          state.availableRegions.add(stock.region);
          state.availableCountries.add(stock.country);
          state.availableSectors.add(stock.sector);
          
          allStocks.push(stock);
        });
      });
      
      state.data = allStocks;
      
      // CONSTRUIRE LE CACHE ICI
      buildCache();
      
      console.log(`✅ MC: ${allStocks.length} actions chargées avec cache optimisé`);
      
      // Initialiser les filtres géo après le chargement
      setupGeoFilters();
      
      if (allStocks.length > 0) {
        results.innerHTML = `<div class="text-center text-cyan-400 py-4">✅ ${allStocks.length} actions disponibles</div>`;
      }
      
    } catch (err) {
      console.error('❌ MC: Erreur:', err);
      results.innerHTML = '<div class="text-center text-red-400 py-4">Erreur de chargement</div>';
    } finally {
      state.loading = false;
    }
  }

  // RENDU VERTICAL SIMPLE
  function render(entries) {
    results.innerHTML='';
    results.className = 'space-y-2';
    
    const top = entries.slice(0, 10);
    
    top.forEach((e, i) => {
      const card = document.createElement('div');
      card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4';
      
      if(!e.s) {
        card.innerHTML = `
          <div class="rank text-2xl font-bold opacity-30">#${i+1}</div>
          <div class="flex-1">
            <div class="font-semibold">—</div>
            <div class="text-xs opacity-60">—</div>
          </div>
          <div class="text-right opacity-30">—</div>`;
        results.appendChild(card); 
        return;
      }
      
      const tkr = e.s.ticker || e.s.symbol || (e.s.name||'').split(' ')[0] || '—';
      
      const metricValues = state.selectedMetrics.map(m => {
        const value = METRICS[m].get(e.s);
        if (!Number.isFinite(value)) return '';
        
        const formatted = value.toFixed(1);
        const colorClass = METRICS[m].max 
          ? (value > 0 ? 'text-green-400' : 'text-red-400')
          : (value < 20 ? 'text-green-400' : value > 40 ? 'text-red-400' : 'text-yellow-400');
        
        return `
          <div class="text-right">
            <div class="text-xs opacity-60">${METRICS[m].label}</div>
            <div class="${colorClass} font-semibold">${value > 0 && METRICS[m].max ? '+' : ''}${formatted}${METRICS[m].unit}</div>
          </div>
        `;
      }).filter(Boolean).join('');
      
      let regionIcon = '';
      if (e.s.region === 'US') {
        regionIcon = '🇺🇸';
      } else if (e.s.region === 'EUROPE') {
        regionIcon = '🇪🇺';
      } else if (e.s.region === 'ASIA') {
        regionIcon = '🌏';
      }
      
      card.innerHTML = `
        <div class="rank text-2xl font-bold">#${i+1}</div>
        <div class="flex-1">
          <div class="font-semibold flex items-center gap-2">
            ${tkr} <span class="text-sm opacity-60">${regionIcon}</span>
          </div>
          <div class="text-xs opacity-60" title="${e.s.name||''}">${e.s.name||'—'}</div>
          <div class="text-xs opacity-40">${e.s.sector||''} • ${e.s.country||''}</div>
        </div>
        <div class="flex gap-4">
          ${metricValues}
        </div>`;
      
      results.appendChild(card);
    });
    
    if (entries.length < 10 && entries.length > 0) {
      const info = document.createElement('div');
      info.className = 'text-center text-xs opacity-50 mt-3';
      info.textContent = `Seulement ${entries.length} actions correspondent aux critères`;
      results.appendChild(info);
    } else if (entries.length === 0) {
      const info = document.createElement('div');
      info.className = 'text-center text-cyan-400 py-4';
      info.innerHTML = '<i class="fas fa-filter mr-2"></i>Aucune action ne passe les filtres';
      results.appendChild(info);
    }
  }

  function setSummary(total, kept) {
    if (!summary) return;
    const mode = state.mode === 'balanced' ? 'Équilibre' : 'Priorités';
    const labels = state.selectedMetrics.map(m => METRICS[m].label).join(' · ');
    const filters = state.customFilters.length;
    
    const geoActive = [];
    if (state.geoFilters.region !== 'all') geoActive.push(state.geoFilters.region);
    if (state.geoFilters.country !== 'all') geoActive.push(state.geoFilters.country);
    if (state.geoFilters.sector !== 'all') geoActive.push(state.geoFilters.sector);
    
    const geoText = geoActive.length > 0 ? ` • ${geoActive.join(', ')}` : '';
    
    summary.innerHTML = `<strong>${mode}</strong> • ${labels || 'Aucun critère'} • ${filters} filtres${geoText} • ${kept}/${total} actions`;
  }

  // ===== COMPUTE PRINCIPAL OPTIMISÉ =====
  async function compute() {
    console.log('🔍 MC: Calcul optimisé avec cache et bitsets');
    
    if (state.data.length === 0) {
      results.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement...</div>';
      await loadData();
    }
    
    const base = state.data;
    if(!base.length) { 
      results.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée</div>';
      return; 
    }
    
    if (!state.selectedMetrics.length) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Sélectionnez au moins un critère</div>';
      setSummary(base.length, 0);
      return;
    }
    
    // Reconstruire les masques si nécessaire
    if (!masks.geo) buildGeoMask();
    else buildGeoMask(); // Pour l'instant on reconstruit toujours
    
    if (!masks.custom) buildCustomMask();
    else buildCustomMask();
    
    buildFinalMask();
    
    const need = state.selectedMetrics;
    const pool = filteredIndices(need);
    
    console.log(`📊 Après filtres: ${pool.length} actions sur ${base.length}`);
    setSummary(base.length, pool.length);
    
    if (pool.length === 0) {
      render([]);
      return;
    }
    
    let topIdx;
    const startTime = performance.now();
    
    if (state.mode === 'balanced') {
      topIdx = rankBalancedFast(pool);
    } else {
      // Staging adaptatif : si pool > 600, garde 120 puis 40 avant Top10
      let cand = pool.slice();
      
      if (cand.length > 600) {
        // Premier filtre sur le premier critère
        cand.sort((a, b) => smarterCompare(a, b, [need[0]]));
        cand = cand.slice(0, 120);
        
        // Deuxième filtre sur les deux premiers critères
        if (need[1]) {
          cand.sort((a, b) => smarterCompare(a, b, [need[0], need[1]]));
          cand = cand.slice(0, 40);
        }
      }
      
      topIdx = topNByLexico(cand, need);
    }
    
    const elapsed = performance.now() - startTime;
    console.log(`✅ MC: Top 10 calculé en ${elapsed.toFixed(1)}ms (mode: ${state.mode})`);
    
    // Mapper vers le renderer existant
    const entries = topIdx.map(i => ({ s: state.data[i], score: NaN }));
    render(entries);
  }

  // Event listeners
  modeRadios.forEach(r => r.addEventListener('change', () => {
    state.mode = modeRadios.find(x => x.checked)?.value || 'balanced';
    
    const balancedExp = document.getElementById('balanced-explanation');
    const priorityExp = document.getElementById('priority-explanation');
    if (balancedExp && priorityExp) {
      balancedExp.classList.toggle('hidden', state.mode !== 'balanced');
      priorityExp.classList.toggle('hidden', state.mode !== 'lexico');
    }
    
    updatePriorityDisplay();
    scheduleCompute();
  }));
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      console.log('🎯 MC: Calcul demandé');
      compute();
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.selectedMetrics = ['ytd', 'dividend_yield'];
      state.customFilters = [];
      state.geoFilters = { region: 'all', country: 'all', sector: 'all' };
      
      // Invalider les masques
      masks.geo = null;
      masks.custom = null;
      masks.final = null;
      
      Object.keys(METRICS).forEach(id => {
        const checkbox = root.querySelector('#m-'+id);
        if (checkbox) {
          checkbox.checked = state.selectedMetrics.includes(id);
        }
      });
      
      // Synchroniser les pills après reset
      root.querySelectorAll('.mc-pill input').forEach(inp => {
        const label = inp.closest('.mc-pill');
        if (label) {
          label.classList.toggle('is-checked', inp.checked);
        }
      });
      
      // Reset filtres géo
      const regionSelect = document.getElementById('filter-region');
      const countrySelect = document.getElementById('filter-country');
      const sectorSelect = document.getElementById('filter-sector');
      if (regionSelect) regionSelect.value = 'all';
      if (countrySelect) countrySelect.value = 'all';
      if (sectorSelect) sectorSelect.value = 'all';
      
      const balancedRadio = modeRadios.find(x => x.value === 'balanced');
      if (balancedRadio) balancedRadio.checked = true;
      state.mode = 'balanced';
      
      updatePriorityDisplay();
      updateFiltersList();
      compute();
    });
  }

  // Initialisation
  addExplanation();
  setupMetricCheckboxes();
  setupCustomFilters();
  updatePriorityDisplay();

  // Expose
  window.MC = { refresh: compute, loadData, state, cache, masks };

  // Charger et calculer au démarrage
  loadData().then(() => {
    console.log('✅ MC Module v2.0 prêt avec optimisations cache & bitsets');
    if (state.selectedMetrics.length > 0) {
      compute();
    }
  });
})();