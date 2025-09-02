// ===== MC (Multi-Critères) – Module Optimisé v2.4 avec Payout Ratio et Comparaison Quantisée ===================
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

  // ==== CONSTANTES PERFORMANCE ====
  const GAP_FLOOR = { 
    ytd: 0.3, 
    dividend_yield: 0.1, 
    volatility_3y: 0.2, 
    max_drawdown_3y: 0.3,
    perf_daily: 0.5,
    perf_1m: 0.4,
    perf_3m: 0.4,
    perf_1y: 0.3,
    perf_3y: 0.3,
    payout_ratio: 0.2 // NOUVEAU: Tolérance pour payout ratio
  };
  
  // MODIFIÉ: Tolérance percentile ajustée
  const TOL_PRESET = { c: 0.6, kappa: 1.5 }; // c réduit de 1.0 à 0.6
  const MIN_TOL_P = 0.012; // Plancher à 1.2pp
  const TOP_N = 10;
  const ALLOW_MISSING = 1; // NOUVEAU: Tolérer 1 critère manquant
  const CONFIG = { DEBUG: false }; // Config pour debug

  // Cache global pour les métriques
  const cache = {};
  const masks = { geo: null, custom: null, final: null };

  // Parser amélioré avec minus unicode et espaces
  const p = (s)=>{
    if(s==null||s==='-'||s==='') return NaN;
    const t = String(s)
      .replace(/\\u2212/g,'-')        // minus unicode
      .replace(',', '.')             // décimal FR
      .replace(/[+%\\s]/g,'')         // +, %, espaces
      .trim();
    return parseFloat(t);
  };

  // métriques disponibles ORGANISÉES PAR CATÉGORIE
  const METRICS = {
    // Performance
    perf_daily:      {label:'Perf Daily',     unit:'%', get:s=>p(s.perf_daily||s.daily||s.perf_1d), max:true},
    perf_1m:         {label:'Perf 1M',        unit:'%', get:s=>p(s.perf_1m),        max:true},
    perf_3m:         {label:'Perf 3M',        unit:'%', get:s=>p(s.perf_3m),        max:true},
    ytd:             {label:'YTD',            unit:'%', get:s=>p(s.perf_ytd||s.ytd),max:true},
    perf_1y:         {label:'Perf 1Y',        unit:'%', get:s=>p(s.perf_1y),        max:true},
    perf_3y:         {label:'Perf 3Y',        unit:'%', get:s=>p(s.perf_3y||s.perf_3_years), max:true},
    // Risque
    volatility_3y:   {label:'Vol 3Y',         unit:'%', get:s=>p(s.volatility_3y),  max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      unit:'%', get:s=>p(s.max_drawdown_3y),max:false},
    // Dividende
    dividend_yield:  {label:'Div. Yield',     unit:'%', get:s=>p(s.dividend_yield), max:true},
    // NOUVEAU: Payout ratio
    payout_ratio: {
      label: 'Payout',
      unit: '%',
      get: s => {
        // Accepte plusieurs fallbacks possibles
        const val = p(s.payout_ratio ?? s.payout ?? s.dividend_payout_ratio ?? s.payout_ratio_ttm);
        if (!Number.isFinite(val)) return NaN;

        // REITs/Immobilier : les >100% peuvent être "normaux"
        const isRE = String(s.sector||'').toLowerCase().includes('immobili')
                   || String(s.sector||'').toLowerCase() === 'real estate'
                   || /property|immo/i.test(String(s.sector||''))
                   || /reit/i.test(String(s.name||''))
                   || /reit/i.test(String(s.exchange||''));
        
        // Cap différent pour REITs vs autres
        return isRE ? Math.min(val, 400) : Math.min(val, 200);
      },
      max: false // On veut MINIMISER le payout (plus bas = plus soutenable)
    }
  };

  // DOM
  const modeRadios=[...root.querySelectorAll('input[name="mc-mode"]')];
  const applyBtn=document.getElementById('mc-apply');
  const resetBtn=document.getElementById('mc-reset');
  const summary=document.getElementById('mc-summary');

  // état et données
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

  // ==== PROTECTION YIELD-TRAP ====
  function ensureYieldTrapOnce() {
    const hasDY = state.selectedMetrics.includes('dividend_yield');
    const hasPayoutMetric = state.selectedMetrics.includes('payout_ratio');
    const hasPayoutFilter = (state.customFilters||[]).some(f => f.metric === 'payout_ratio');
    
    // Ajouter protection seulement si yield est coché sans garde-fou payout
    if (hasDY && !hasPayoutMetric && !hasPayoutFilter) {
      // Filtre silencieux: payout < 100%
      state.customFilters.push({ 
        metric: 'payout_ratio', 
        operator: '<', 
        value: 100, 
        __auto: true // Marqueur pour identifier ce filtre automatique
      });
      masks.custom = null; // Invalider le cache
      if (CONFIG.DEBUG) {
        console.log('🛡️ Protection yield-trap activée: payout < 100% appliqué automatiquement');
      }
      return true;
    }
    return false;
  }

  function cleanupAutoYieldTrap() {
    const index = (state.customFilters||[]).findIndex(f => f.__auto);
    if (index >= 0) {
      state.customFilters.splice(index, 1);
      masks.custom = null; // Invalider le cache
    }
  }

  // ==== SYSTÈME DE MASQUES DE FILTRAGE ====
  function buildGeoMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n);
    mask.fill(1);
    
    for (let i = 0; i < n; i++) {
      const s = state.data[i];
      if (state.geoFilters.region !== 'all' && s.region !== state.geoFilters.region) {
        mask[i] = 0;
      }
      if (state.geoFilters.country !== 'all' && s.country !== state.geoFilters.country) {
        mask[i] = 0;
      }
      if (state.geoFilters.sector !== 'all' && s.sector !== state.geoFilters.sector) {
        mask[i] = 0;
      }
    }
    
    masks.geo = mask;
    return mask;
  }

  // CORRIGÉ v2.4: Comparaison quantisée à 1 décimale pour cohérence avec l'UI
  function buildCustomMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n);
    mask.fill(1);
    
    const fs = state.customFilters || [];
    
    // NOUVEAU: Fonction de quantisation à 1 décimale
    const DEC = 1, POW = 10 ** DEC;
    const q = v => Math.round(v * POW) / POW; // quantize à 1 décimale
    
    for (let i = 0; i < n; i++) {
      for (const f of fs) {
        const raw = state.data[i].metrics ? 
          state.data[i].metrics[f.metric] : 
          METRICS[f.metric].get(state.data[i]);
        
        if (!Number.isFinite(raw)) {
          mask[i] = 0;
          break;
        }
        
        // MODIFIÉ: Quantiser les deux valeurs à 1 décimale
        const v = q(raw);        // valeur métrique arrondie à 0.1
        const x = q(f.value);    // valeur seuil arrondie à 0.1
        
        let ok = true;
        switch(f.operator) {
          case '>=': ok = v >= x; break;
          case '>':  ok = v >  x; break;
          case '=':  ok = v === x; break;  // Égalité exacte après quantisation
          case '<':  ok = v <  x; break;
          case '<=': ok = v <= x; break;
          case '!=': ok = v !== x; break;
        }
        
        if (!ok) {
          mask[i] = 0;
          break;
        }
      }
    }
    
    masks.custom = mask;
    return mask;
  }

  function buildFinalMask() {
    const n = state.data.length;
    const out = new Uint8Array(n);
    
    if (!masks.geo) buildGeoMask();
    if (!masks.custom) buildCustomMask();
    
    for (let i = 0; i < n; i++) {
      out[i] = (masks.geo[i] & masks.custom[i]) ? 1 : 0;
    }
    
    masks.final = out;
    return out;
  }

  // MODIFIÉ: Tolérer ALLOW_MISSING critères manquants
  function getFilteredIndices(requireMetrics = []) {
    if (!masks.final) buildFinalMask();
    
    const indices = [];
    const n = state.data.length;
    
    for (let i = 0; i < n; i++) {
      if (!masks.final[i]) continue;
      
      // Compter les métriques valides
      let validCount = 0;
      for (const m of requireMetrics) {
        const value = cache[m] ? cache[m].raw[i] : 
          (state.data[i].metrics ? state.data[i].metrics[m] : 
           METRICS[m].get(state.data[i]));
        
        if (Number.isFinite(value)) {
          validCount++;
        }
      }
      
      // Accepter si on a au moins (requis - ALLOW_MISSING) métriques
      if (validCount >= requireMetrics.length - ALLOW_MISSING) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  // ==== OUTILS DE CALCUL OPTIMISÉS ====
  const localWindow = (len) => Math.max(6, Math.min(40, Math.ceil(0.03 * len)));

  function localGap(sorted, v) {
    const a = sorted;
    const n = a.length;
    if (!n) return Infinity;
    
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      (a[mid] < v) ? lo = mid + 1 : hi = mid;
    }
    
    const W = localWindow(n);
    const i = Math.min(Math.max(lo, 1), n - 2);
    const start = Math.max(1, i - W);
    const end = Math.min(n - 2, i + W);
    const gaps = [];
    
    for (let j = start - 1; j <= end; j++) {
      gaps.push(Math.abs(a[j + 1] - a[j]));
    }
    
    gaps.sort((x, y) => x - y);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  }

  // MODIFIÉ: Utilisation du MIN_TOL_P
  function nearTie(metric, vA, vB, dPct, n) {
    const cached = cache[metric];
    if (!cached) return false;
    
    const { sorted, iqr } = cached;
    const c = TOL_PRESET.c;
    const baseP = c / Math.sqrt(Math.max(2, n));
    const gLoc = localGap(sorted, (vA + vB) / 2);
    const tolV = Math.max(TOL_PRESET.kappa * (gLoc / iqr), (GAP_FLOOR[metric] || 0) / iqr);
    const nearV = Math.abs(vA - vB) / iqr <= tolV;
    const nearP = Math.abs(dPct) <= Math.max(baseP, MIN_TOL_P); // Ajout du plancher MIN_TOL_P
    return nearV || nearP;
  }

  // MinHeap pour Top N
  class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    peek() { return this.a[0]; }
    
    push(x) {
      const a = this.a;
      a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].key <= x.key) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    
    pop() {
      const a = this.a;
      if (!a.length) return;
      const top = a[0];
      const x = a.pop();
      if (!a.length) return top;
      a[0] = x;
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l].key < a[s].key) s = l;
        if (r < a.length && a[r].key < a[s].key) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]];
        i = s;
      }
      return top;
    }
  }

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
      masks.geo = null; // Invalider le cache
      updateCountryFilter();
      scheduleCompute();
    });
    
    document.getElementById('filter-country')?.addEventListener('change', (e) => {
      state.geoFilters.country = e.target.value;
      masks.geo = null; // Invalider le cache
      scheduleCompute();
    });
    
    document.getElementById('filter-sector')?.addEventListener('change', (e) => {
      state.geoFilters.sector = e.target.value;
      masks.geo = null; // Invalider le cache
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
        masks.custom = null; // Invalider le cache
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
      // Ignorer les filtres automatiques dans l'affichage
      if (filter.__auto) return '';
      
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
        masks.custom = null; // Invalider le cache
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

  // Synchroniser checkboxes et selectedMetrics + classe is-checked
  function setupMetricCheckboxes() {
    // Setup des checkboxes métriques
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
          <strong>Mode Équilibre :</strong> Moyenne des scores percentiles (0-100) pour chaque critère coché.
        </div>
        <div id="priority-explanation" class="hidden">
          <strong>Mode Priorités intelligentes :</strong> Tri par ordre avec tolérance locale basée sur la densité de distribution.
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
  }

  // NOUVEAU v2.4: Popover au clic pour l'info payout
  function setupPayoutPopover() {
    const icon = document.getElementById('payout-info');
    if (!icon) return;

    const TEXT = "Payout = dividendes ÷ bénéfices.\nPlus bas = mieux.\nRepères : <60% ok, 60–80% moyen, >100% risqué.";

    let tipEl = null;
    const closeTip = () => { 
      tipEl?.remove(); 
      tipEl = null; 
      document.removeEventListener('click', onDoc); 
    };
    
    const onDoc = (e) => { 
      if (!tipEl || tipEl.contains(e.target) || e.target === icon) return; 
      closeTip(); 
    };

    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tipEl) { 
        closeTip(); 
        return; 
      }

      tipEl = document.createElement('div');
      tipEl.className = 'mc-tip';
      tipEl.style.whiteSpace = 'pre-line'; // Pour respecter les sauts de ligne
      tipEl.textContent = TEXT;

      document.body.appendChild(tipEl);
      const r = icon.getBoundingClientRect();
      const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.left + 12);
      const y = Math.min(window.innerHeight - tipEl.offsetHeight - 8, r.top + 18);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';

      setTimeout(() => document.addEventListener('click', onDoc), 0);
    });
  }

  // charger les données et extraire les infos géographiques
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
      
      // ==== INITIALISATION DU CACHE ====
      console.log('🔧 Initialisation du cache des métriques...');
      
      // Parser une seule fois les métriques
      for (const s of state.data) {
        s.metrics = {};
        for (const [key, metric] of Object.entries(METRICS)) {
          s.metrics[key] = metric.get(s);
        }
      }
      
      // Construire le cache si on a des données
      if (state.data.length > 0) {
        const n = state.data.length;
        
        for (const m of Object.keys(METRICS)) {
          const raw = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            raw[i] = state.data[i].metrics[m];
          }
          
          // Winsorization doux
          const sorted = Array.from(raw)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
          
          if (sorted.length) {
            const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
            const lo = q(0.005);
            const hi = q(0.995);
            
            for (let i = 0; i < n; i++) {
              if (Number.isFinite(raw[i])) {
                raw[i] = Math.min(hi, Math.max(lo, raw[i]));
              }
            }
            
            // MODIFIÉ: Recalculer sorted après winsorisation
            const sortedW = Array.from(raw)
              .filter(Number.isFinite)
              .sort((a, b) => a - b);
            const qW = (p) => sortedW[Math.floor(p * (sortedW.length - 1))];
            const q1 = qW(0.25);
            const q3 = qW(0.75);
            const iqr = Math.max(1e-9, q3 - q1);
            
            // Calcul des rangs/percentiles avec gestion des égalités
            const idx = Array.from({length: n}, (_, i) => i)
              .filter(i => Number.isFinite(raw[i]));
            idx.sort((i, j) => raw[i] - raw[j]);
            
            const rankPct = new Float64Array(n);
            let k = 0;
            while (k < idx.length) {
              let j = k + 1;
              while (j < idx.length && Math.abs(raw[idx[j]] - raw[idx[k]]) < 1e-12) j++;
              const r = (k + j - 1) / 2;
              const hazen = (r + 0.5) / idx.length;
              for (let t = k; t < j; t++) {
                rankPct[idx[t]] = hazen;
              }
              k = j;
            }
            
            // Utiliser sorted winsorisé dans le cache
            cache[m] = {
              raw,
              sorted: Float64Array.from(sortedW), // Sorted après winsorisation
              rankPct,
              iqr // IQR recalculé après winsorisation
            };
          } else {
            // Pas de données valides
            cache[m] = {
              raw,
              sorted: new Float64Array(),
              rankPct: new Float64Array(n),
              iqr: 1
            };
          }
        }
        
        console.log('✅ Cache initialisé pour', Object.keys(cache).length, 'métriques');
      }
      
      console.log(`✅ MC: ${allStocks.length} actions chargées`);
      
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

  // Mode équilibré optimisé
  function rankBalanced(indices) {
    const M = state.selectedMetrics;
    const out = [];
    
    for (const i of indices) {
      let sum = 0;
      let k = 0;
      
      for (const m of M) {
        const pct = cache[m].rankPct[i];
        if (Number.isFinite(pct)) {
          const adjustedPct = METRICS[m].max ? pct : (1 - pct);
          sum += adjustedPct;
          k++;
        }
      }
      
      if (k > 0) {
        out.push({
          idx: i,
          score: sum / k
        });
      }
    }
    
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, TOP_N).map(e => ({ s: state.data[e.idx], score: e.score }));
  }

  // Comparateur pour priorités intelligentes
  function smarterCompare(aIdx, bIdx, prios) {
    const n = state.data.length;
    
    for (let i = 0; i < prios.length; i++) {
      const m = prios[i];
      let pA = cache[m].rankPct[aIdx];
      let pB = cache[m].rankPct[bIdx];
      
      if (!METRICS[m].max) {
        pA = 1 - pA;
        pB = 1 - pB;
      }
      
      const dPct = pA - pB;
      const vA = cache[m].raw[aIdx];
      const vB = cache[m].raw[bIdx];
      
      if (!nearTie(m, vA, vB, dPct, n)) {
        return dPct > 0 ? -1 : 1;
      }
    }
    
    // Tie-break pondéré
    const weights = prios.map((_, i) => Math.pow(0.5, i));
    let scoreA = 0, scoreB = 0;
    
    for (let i = 0; i < prios.length; i++) {
      const m = prios[i];
      let pA = cache[m].rankPct[aIdx];
      let pB = cache[m].rankPct[bIdx];
      
      if (!METRICS[m].max) {
        pA = 1 - pA;
        pB = 1 - pB;
      }
      
      scoreA += pA * weights[i];
      scoreB += pB * weights[i];
    }
    
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    // Dernier recours : ticker
    const ta = String(state.data[aIdx].ticker || state.data[aIdx].name || '');
    const tb = String(state.data[bIdx].ticker || state.data[bIdx].name || '');
    return ta.localeCompare(tb);
  }

  // Top N avec heap
  function topNByLexico(indices, prios) {
    if (indices.length <= TOP_N) {
      return indices
        .sort((a, b) => smarterCompare(a, b, prios))
        .map(i => ({ s: state.data[i], score: NaN }));
    }
    
    // Staging adaptatif pour grandes listes
    let candidates = indices.slice();
    
    if (candidates.length > 600) {
      // Premier filtre : top 120 sur le premier critère
      candidates.sort((a, b) => smarterCompare(a, b, [prios[0]]));
      candidates = candidates.slice(0, 120);
      
      // Deuxième filtre : top 40 sur les deux premiers critères
      if (prios.length > 1) {
        candidates.sort((a, b) => smarterCompare(a, b, [prios[0], prios[1]]));
        candidates = candidates.slice(0, 40);
      }
    }
    
    // Tri final avec tous les critères
    candidates.sort((a, b) => smarterCompare(a, b, prios));
    
    return candidates
      .slice(0, TOP_N)
      .map(i => ({ s: state.data[i], score: NaN }));
  }

  // RENDU VERTICAL SIMPLE avec coloration intelligente
  function render(entries){
    results.innerHTML='';
    results.className = 'space-y-2';
    
    const top = entries.slice(0,10);
    
    top.forEach((e,i)=>{
      const card=document.createElement('div');
      card.className='glassmorphism rounded-lg p-3 flex items-center gap-4';
      
      if(!e.s){
        card.innerHTML=`
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
      
      // MODIFIÉ: Formatage amélioré avec coloration contextuelle
      const metricValues = state.selectedMetrics.map(m => {
        const raw = e.s.metrics ? e.s.metrics[m] : METRICS[m].get(e.s);
        if (!Number.isFinite(raw)) return '';

        // Format par défaut
        const isMax = !!METRICS[m].max;
        const formatted = METRICS[m].unit === '%' ? raw.toFixed(1) : raw.toFixed(2);
        
        // Coloration contextuelle
        let colorClass;
        if (m === 'payout_ratio') {
          // Coloration spéciale pour payout ratio
          colorClass = raw < 30 ? 'text-green-500' :      // Conservative
                      raw < 60 ? 'text-green-400' :       // Moderate
                      raw < 80 ? 'text-yellow-400' :      // High
                      raw < 100 ? 'text-orange-400' :     // Very high
                      'text-red-400';                     // Unsustainable
        } else if (m === 'volatility_3y' || m === 'max_drawdown_3y') {
          // Pour les métriques de risque
          colorClass = raw < 15 ? 'text-green-400' : 
                      raw < 25 ? 'text-yellow-400' : 
                      'text-red-400';
        } else {
          // Coloration standard
          colorClass = isMax 
            ? (raw > 0 ? 'text-green-400' : 'text-red-400')
            : (raw < 20 ? 'text-green-400' : raw > 40 ? 'text-red-400' : 'text-yellow-400');
        }

        return `
          <div class="text-right">
            <div class="text-xs opacity-60">${METRICS[m].label}</div>
            <div class="${colorClass} font-semibold">
              ${isMax && raw > 0 ? '+' : ''}${formatted}${METRICS[m].unit || ''}
            </div>
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
      
      card.innerHTML=`
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

  function setSummary(total, kept){
    if (!summary) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités intelligentes';
    const labels = state.selectedMetrics.map(m=>METRICS[m].label).join(' · ');
    
    // Compter seulement les filtres visibles (exclure __auto)
    const visibleFilters = state.customFilters.filter(f => !f.__auto).length;
    
    const geoActive = [];
    if (state.geoFilters.region !== 'all') geoActive.push(state.geoFilters.region);
    if (state.geoFilters.country !== 'all') geoActive.push(state.geoFilters.country);
    if (state.geoFilters.sector !== 'all') geoActive.push(state.geoFilters.sector);
    
    const geoText = geoActive.length > 0 ? ` • ${geoActive.join(', ')}` : '';
    
    summary.innerHTML = `<strong>${mode}</strong> • ${labels || 'Aucun critère'} • ${visibleFilters} filtres${geoText} • ${kept}/${total} actions`;
  }

  async function compute(){
    console.log('🔍 MC: Calcul avec filtres géo:', state.geoFilters);
    
    if (state.data.length === 0) {
      results.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement...</div>';
      await loadData();
    }
    
    const base = state.data;
    if(!base.length){ 
      results.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée</div>';
      return; 
    }
    
    if (!state.selectedMetrics.length) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Sélectionnez au moins un critère</div>';
      setSummary(base.length, 0);
      return;
    }
    
    // NOUVEAU: Protection yield-trap automatique
    const hadAutoTrap = ensureYieldTrapOnce();
    
    // Utiliser les masques optimisés
    console.time('Filtrage');
    buildGeoMask();
    buildCustomMask();
    buildFinalMask();
    const pool = getFilteredIndices(state.selectedMetrics);
    console.timeEnd('Filtrage');
    
    console.log(`📊 Après filtres: ${pool.length} actions sur ${base.length}`);
    setSummary(base.length, pool.length);
    
    if (pool.length === 0) {
      results.innerHTML = '<div class="text-center text-cyan-400 py-4"><i class="fas fa-exclamation-triangle mr-2"></i>Aucune action ne passe les filtres</div>';
      // NOUVEAU: Nettoyer le filtre auto si appliqué
      if (hadAutoTrap) cleanupAutoYieldTrap();
      return;
    }
    
    // Calcul optimisé
    console.time('Ranking');
    let out;
    if (state.mode === 'balanced') {
      out = rankBalanced(pool);
    } else {
      out = topNByLexico(pool, state.selectedMetrics);
    }
    console.timeEnd('Ranking');
    
    render(out);
    console.log(`✅ MC: ${pool.length} actions filtrées, mode: ${state.mode}`);
    
    // NOUVEAU: Nettoyer le filtre auto après le rendu
    if (hadAutoTrap) cleanupAutoYieldTrap();
  }

  // Event listeners
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
    
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
    resetBtn.addEventListener('click', ()=>{
      state.selectedMetrics = ['ytd', 'dividend_yield'];
      state.customFilters = [];
      state.geoFilters = { region: 'all', country: 'all', sector: 'all' };
      
      // Invalider les caches
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
      
      const balancedRadio = modeRadios.find(x=>x.value==='balanced');
      if (balancedRadio) balancedRadio.checked=true;
      state.mode='balanced';
      
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
  setupPayoutPopover(); // NOUVEAU v2.4

  // expose
  window.MC = { refresh: compute, loadData, state, cache };

  // Charger et calculer au démarrage
  loadData().then(() => {
    console.log('✅ MC Module v2.4 avec comparaison quantisée et popover payout');
    if (state.selectedMetrics.length > 0) {
      compute();
    }
  });
})();