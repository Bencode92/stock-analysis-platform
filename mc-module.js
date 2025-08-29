// ===== MC (Multi-Critères) – Module avec Priorités+ amélioré ===================
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
    customFilters: [], // PAS DE FILTRE PAR DÉFAUT
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

  // Drag & Drop CORRIGÉ avec classe .dragging
  function setupDragAndDrop() {
    const items = document.querySelectorAll('.priority-item');
    let draggedItem = null;
    
    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        e.target.style.opacity = '0.5';
        e.target.classList.add('dragging'); // AJOUT
      });
      
      item.addEventListener('dragend', (e) => {
        e.target.style.opacity = '';
        e.target.classList.remove('dragging'); // RETRAIT
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
          <strong>Mode Priorités+ :</strong> Tri par ordre avec tolérance (2%) et tie-break pondéré. Plus robuste.
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
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

  // Appliquer tous les filtres AVEC EPSILON CORRIGÉ
  function applyFilters(list){
    return list.filter(s => {
      // Filtres géographiques
      if (state.geoFilters.region !== 'all' && s.region !== state.geoFilters.region) return false;
      if (state.geoFilters.country !== 'all' && s.country !== state.geoFilters.country) return false;
      if (state.geoFilters.sector !== 'all' && s.sector !== state.geoFilters.sector) return false;
      
      // Vérifier que toutes les métriques sélectionnées sont présentes
      const hasAllMetrics = state.selectedMetrics.every(m => {
        const value = METRICS[m].get(s);
        return Number.isFinite(value);
      });
      
      if (!hasAllMetrics) return false;
      
      // Appliquer les filtres personnalisés avec EPSILON SYMÉTRIQUE
      for (const filter of state.customFilters) {
        const value = METRICS[filter.metric].get(s);
        if (!Number.isFinite(value)) return false;
        
        let passes = false;
        const EPS = 0.001;
        const val = filter.value;
        
        switch(filter.operator) {
          case '>=': passes = value >= val - EPS; break;
          case '>':  passes = value >  val - EPS; break;
          case '=':  passes = Math.abs(value - val) < EPS; break;
          case '<':  passes = value <  val + EPS; break;
          case '<=': passes = value <= val + EPS; break;
          case '!=': passes = Math.abs(value - val) > EPS; break;
        }
        
        if (!passes) return false;
      }
      
      return true;
    });
  }

  // Calcul des percentiles AMÉLIORÉ (gestion des égalités)
  function percentile(sorted, v){
    if(!Number.isFinite(v)||!sorted.length) return NaN;
    const n = sorted.length;
    const li = Math.max(0, Math.floor(0.01*(n-1)));
    const hi = Math.min(n-1, Math.ceil(0.99*(n-1)));
    const lo = sorted[li], hiV = sorted[hi];
    const x = Math.min(hiV, Math.max(lo, v));
    
    // Trouver le bloc des égalités
    let i=0; while(i<n && sorted[i] < x) i++;
    let j=i; while(j<n && Math.abs(sorted[j]-x) < 1e-9) j++;
    
    // Rang moyen pour les égalités
    const rank = (i + j - 1) / 2;
    return n===1 ? 0.5 : rank / (n-1);
  }

  // Mode équilibré
  function rankBalanced(list){
    const metrics = state.selectedMetrics;
    if (!metrics.length) return [];
    
    const dict={};
    metrics.forEach(m=>{
      dict[m] = list.map(s=>METRICS[m].get(s)).filter(Number.isFinite).sort((a,b)=>a-b);
    });
    
    const scored=[];
    for(const s of list){
      let sum=0,k=0;
      for(const m of metrics){
        const v=METRICS[m].get(s);
        if(!Number.isFinite(v)) continue;
        let pr = percentile(dict[m], v);
        if(!Number.isFinite(pr)) continue;
        if(!METRICS[m].max) pr = 1-pr;
        sum+=pr; k++;
      }
      if(k>0) scored.push({s, score: sum/k});
    }
    scored.sort((a,b)=>b.score-a.score);
    return scored;
  }

  // === PRIORITÉS+ : lexico sur percentiles avec tolérance + tie-break pondéré ===
  function rankLexicoPlus(list, topN = 10) {
    const prios = state.selectedMetrics;
    if (!prios.length) return list.map(s => ({ s, score: NaN }));

    // 1) Prépare percentiles par métrique (distribution sur la liste filtrée)
    const dict = {};
    prios.forEach(m => {
      dict[m] = list
        .map(s => METRICS[m].get(s))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    });

    // Transforme une valeur -> percentile orienté "plus c'est bon, plus c'est haut"
    const pr = (m, v) => {
      let r = percentile(dict[m], v);
      if (!Number.isFinite(r)) return 0;
      if (!METRICS[m].max) r = 1 - r;   // inverse pour min→mieux
      return r; // in [0,1]
    };

    // 2) Vecteur de percentiles par titre (dans l'ordre des priorités)
    const rows = list.map(s => ({
      s,
      vec: prios.map(m => pr(m, METRICS[m].get(s)))
    }));

    // 3) Paramètres de Priorités+
    const tau = 0.02;                         // tolérance (2 points de percentile)
    const weights = prios.map((_, i) => Math.pow(0.5, i)); // tie-break pondéré

    // Étagement Top-K pour stabiliser le Top 10
    const stageKeeps = [Math.max(4 * topN, 40), Math.max(2 * topN, 20), topN];

    let pool = rows.slice();
    for (let k = 0; k < prios.length && pool.length > topN; k++) {
      // Tri simple sur la priorité k
      pool.sort((A, B) => B.vec[k] - A.vec[k]);

      // Coupe au Top-K si on n'est pas au dernier critère
      if (k < prios.length - 1) {
        const keep = stageKeeps[Math.min(k, stageKeeps.length - 1)];
        pool = pool.slice(0, Math.min(keep, pool.length));
      }
    }

    // 4) Tri final : lexico avec tolérance + tie-break pondéré
    pool.sort((A, B) => {
      for (let i = 0; i < prios.length; i++) {
        const d = A.vec[i] - B.vec[i];
        if (Math.abs(d) > tau) return d > 0 ? -1 : 1; // plus haut percentile d'abord
      }
      // Tie-break : somme pondérée
      const sA = A.vec.reduce((acc, v, i) => acc + v * weights[i], 0);
      const sB = B.vec.reduce((acc, v, i) => acc + v * weights[i], 0);
      return sB - sA;
    });

    return pool.map(r => ({ s: r.s, score: NaN }));
  }

  // RENDU VERTICAL SIMPLE - SIMILAIRE À L'EXEMPLE
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
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités+';
    const labels = state.selectedMetrics.map(m=>METRICS[m].label).join(' · ');
    const filters = state.customFilters.length;
    
    const geoActive = [];
    if (state.geoFilters.region !== 'all') geoActive.push(state.geoFilters.region);
    if (state.geoFilters.country !== 'all') geoActive.push(state.geoFilters.country);
    if (state.geoFilters.sector !== 'all') geoActive.push(state.geoFilters.sector);
    
    const geoText = geoActive.length > 0 ? ` • ${geoActive.join(', ')}` : '';
    
    summary.innerHTML = `<strong>${mode}</strong> • ${labels || 'Aucun critère'} • ${filters} filtres${geoText} • ${kept}/${total} actions`;
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
    
    const filtered = applyFilters(base);
    console.log(`📊 Après filtres: ${filtered.length} actions sur ${base.length}`);
    
    if (filtered.length === 0) {
      results.innerHTML = '<div class="text-center text-cyan-400 py-4"><i class="fas fa-exclamation-triangle mr-2"></i>Aucune action ne passe les filtres</div>';
      setSummary(base.length, 0);
      return;
    }
    
    // Utilise rankLexicoPlus au lieu de l'ancien rankLexico
    const out = state.mode === 'balanced'
      ? rankBalanced(filtered)
      : rankLexicoPlus(filtered);
      
    setSummary(base.length, filtered.length);
    render(out);
    console.log(`✅ MC: ${filtered.length} actions filtrées, mode: ${state.mode}`);
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

  // expose
  window.MC = { refresh: compute, loadData, state };

  // Charger et calculer au démarrage
  loadData().then(() => {
    console.log('✅ MC Module prêt avec Priorités+');
    if (state.selectedMetrics.length > 0) {
      compute();
    }
  });
})();