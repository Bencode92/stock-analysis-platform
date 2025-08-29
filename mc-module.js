// ===== MC (Multi-Critères) – Interface unifiée avec drag & drop ===================
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

  // util parse %
  const p = (s)=>{
    if(s==null||s==='-'||s==='') return NaN;
    let t=String(s).replace(',', '.').replace(/[+%]/g,'').trim(); 
    return parseFloat(t);
  };

  // métriques disponibles
  const METRICS = {
    perf_1y:         {label:'Perf 1Y',        unit:'%', get:s=>p(s.perf_1y),        max:true},
    ytd:             {label:'YTD',            unit:'%', get:s=>p(s.perf_ytd||s.ytd),max:true},
    perf_3m:         {label:'Perf 3M',        unit:'%', get:s=>p(s.perf_3m),        max:true},
    perf_1m:         {label:'Perf 1M',        unit:'%', get:s=>p(s.perf_1m),        max:true},
    volatility_3y:   {label:'Vol 3Y',         unit:'%', get:s=>p(s.volatility_3y),  max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      unit:'%', get:s=>p(s.max_drawdown_3y),max:false},
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
    selectedMetrics: ['ytd', 'dividend_yield'], // Métriques sélectionnées = ordre de priorité
    customFilters: []
  };

  // Créer/mettre à jour la zone de priorités avec drag & drop
  function updatePriorityDisplay() {
    let priorityContainer = document.getElementById('priority-container');
    
    if (!priorityContainer) {
      // Créer le conteneur s'il n'existe pas
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
    
    // Afficher uniquement si mode priorités
    priorityContainer.style.display = state.mode === 'lexico' ? 'block' : 'none';
    
    // Générer la liste des priorités
    priorityList.innerHTML = state.selectedMetrics.map((m, i) => `
      <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5 cursor-move" 
           draggable="true" data-metric="${m}">
        <span class="drag-handle">☰</span>
        <span class="priority-number text-xs opacity-50">${i+1}.</span>
        <span class="flex-1">${METRICS[m].label} ${METRICS[m].max?'↑':'↓'}</span>
      </div>
    `).join('') || '<div class="text-xs opacity-50">Cochez des critères pour définir les priorités</div>';
    
    // Ajouter les événements drag & drop
    setupDragAndDrop();
  }

  // Drag & Drop pour réorganiser les priorités
  function setupDragAndDrop() {
    const items = document.querySelectorAll('.priority-item');
    let draggedItem = null;
    
    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        e.target.style.opacity = '0.5';
      });
      
      item.addEventListener('dragend', (e) => {
        e.target.style.opacity = '';
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
        // Mettre à jour l'ordre dans state.selectedMetrics
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
      
      // Mettre à jour l'état initial
      if (state.selectedMetrics.includes(metricId)) {
        checkbox.checked = true;
      }
      
      // Écouter les changements
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          // Ajouter à la fin si pas déjà présent
          if (!state.selectedMetrics.includes(metricId)) {
            state.selectedMetrics.push(metricId);
          }
        } else {
          // Retirer de la liste
          state.selectedMetrics = state.selectedMetrics.filter(m => m !== metricId);
        }
        updatePriorityDisplay();
      });
    });
  }

  // Ajouter explication unifiée
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
          <strong>Mode Priorités :</strong> Tri par ordre de priorité. Glissez pour réorganiser.
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
  }

  // charger les données
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
          allStocks.push(stock);
        });
      });
      
      state.data = allStocks;
      console.log(`✅ MC: ${allStocks.length} actions chargées`);
      
      if (allStocks.length > 0) {
        results.innerHTML = `<div class="text-center text-green-400 py-4">✅ ${allStocks.length} actions disponibles</div>`;
      }
      
    } catch (err) {
      console.error('❌ MC: Erreur:', err);
      results.innerHTML = '<div class="text-center text-red-400 py-4">Erreur de chargement</div>';
    } finally {
      state.loading = false;
    }
  }

  // Filtres : EXCLURE les actions qui n'ont pas TOUTES les métriques requises
  function applyFilters(list){
    const quick = {
      q1y10: document.getElementById('q-1y10'),
      qytd10: document.getElementById('q-ytd10'),
      qNoNeg1y: document.getElementById('q-noNeg1y'),
      qVol40: document.getElementById('q-vol40'),
    };

    return list.filter(s => {
      // IMPORTANT: Vérifier que TOUTES les métriques sélectionnées sont présentes
      const hasAllMetrics = state.selectedMetrics.every(m => {
        const value = METRICS[m].get(s);
        return Number.isFinite(value);
      });
      
      if (!hasAllMetrics) return false; // Exclure si manque une métrique
      
      // Appliquer les filtres rapides
      const v1y = METRICS.perf_1y.get(s);
      const vytd = METRICS.ytd.get(s);
      const vvol = METRICS.volatility_3y.get(s);

      if (quick.q1y10?.checked && !(v1y >= 10)) return false;
      if (quick.qytd10?.checked && !(vytd >= 10)) return false;
      if (quick.qNoNeg1y?.checked && !(v1y > 0)) return false;
      if (quick.qVol40?.checked && vvol > 40) return false;

      return true;
    });
  }

  // Calcul des percentiles
  function percentile(sorted, v){
    if(!Number.isFinite(v)||!sorted.length) return NaN;
    const lo = sorted[Math.floor(0.01*(sorted.length-1))];
    const hi = sorted[Math.ceil(0.99*(sorted.length-1))];
    const x = Math.min(hi, Math.max(lo, v));
    let i=0; while(i<sorted.length && sorted[i]<=x) i++;
    if(sorted.length===1) return 1;
    return Math.max(0, Math.min(1, (i-1)/(sorted.length-1)));
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

  // Mode priorités
  function rankLexico(list){
    const prios = state.selectedMetrics;
    if (!prios.length) return list.map(s=>({s, score:NaN}));
    
    const EPS=0.5;
    const cmp=(a,b)=>{
      for(const m of prios){
        const av=METRICS[m].get(a), bv=METRICS[m].get(b);
        const dir = METRICS[m].max? -1 : +1;
        const aa = Number.isFinite(av)? av : (METRICS[m].max? -1e9:+1e9);
        const bb = Number.isFinite(bv)? bv : (METRICS[m].max? -1e9:+1e9);
        if (Math.abs(aa-bb)>EPS) return (aa-bb)*dir;
      }
      return 0;
    };
    return list.slice().sort(cmp).map(s=>({s, score:NaN}));
  }

  // Rendu vertical avec métriques
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
      
      // Afficher uniquement les métriques sélectionnées
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
      
      // Icône de région
      let regionIcon = '';
      if (e.s.region === 'US') {
        regionIcon = '🇺🇸';
      } else if (e.s.region === 'EUROPE') {
        regionIcon = '🇪🇺';
      } else if (e.s.region === 'ASIA') {
        regionIcon = '🌏';
      }
      
      card.innerHTML=`
        <div class="rank text-2xl font-bold text-accent-color">#${i+1}</div>
        <div class="flex-1">
          <div class="font-semibold flex items-center gap-2">
            ${tkr} <span class="text-sm opacity-60">${regionIcon}</span>
          </div>
          <div class="text-xs opacity-60" title="${e.s.name||''}">${e.s.name||'—'}</div>
        </div>
        <div class="flex gap-4">
          ${metricValues}
        </div>`;
      
      results.appendChild(card);
    });
    
    // Afficher le nombre d'actions si moins de 10
    if (entries.length < 10 && entries.length > 0) {
      const info = document.createElement('div');
      info.className = 'text-center text-xs opacity-50 mt-3';
      info.textContent = `Seulement ${entries.length} actions correspondent aux critères`;
      results.appendChild(info);
    }
  }

  function setSummary(total, kept){
    if (!summary) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités';
    const labels = state.selectedMetrics.map(m=>METRICS[m].label).join(' · ');
    summary.innerHTML = `<strong>${mode}</strong> • ${labels || 'Aucun critère'} • ${kept}/${total} actions`;
  }

  async function compute(){
    console.log('🔍 MC: Calcul avec critères:', state.selectedMetrics);
    
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
    if (filtered.length === 0) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Aucune action avec toutes les métriques requises</div>';
      setSummary(base.length, 0);
      return;
    }
    
    const out = state.mode==='balanced' ? rankBalanced(filtered) : rankLexico(filtered);
    setSummary(base.length, filtered.length);
    render(out);
    console.log(`✅ MC: ${filtered.length} actions avec toutes les métriques`);
  }

  // Event listeners
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
    
    // Afficher/masquer explications et priorités
    const balancedExp = document.getElementById('balanced-explanation');
    const priorityExp = document.getElementById('priority-explanation');
    if (balancedExp && priorityExp) {
      balancedExp.classList.toggle('hidden', state.mode !== 'balanced');
      priorityExp.classList.toggle('hidden', state.mode !== 'lexico');
    }
    
    updatePriorityDisplay();
  }));
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      console.log('🎯 MC: Calcul demandé');
      compute();
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', ()=>{
      // Reset tout
      state.selectedMetrics = ['ytd', 'dividend_yield'];
      
      // Synchroniser les checkboxes
      Object.keys(METRICS).forEach(id => {
        const checkbox = root.querySelector('#m-'+id);
        if (checkbox) {
          checkbox.checked = state.selectedMetrics.includes(id);
        }
      });
      
      // Reset filtres rapides
      ['q-1y10','q-ytd10','q-noNeg1y','q-vol40'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
      });
      
      // Reset mode
      const balancedRadio = modeRadios.find(x=>x.value==='balanced');
      if (balancedRadio) balancedRadio.checked=true;
      state.mode='balanced';
      
      updatePriorityDisplay();
      compute();
    });
  }

  // Initialisation
  addExplanation();
  setupMetricCheckboxes();
  updatePriorityDisplay();

  // expose
  window.MC = { refresh: compute, loadData, state };

  // Charger et calculer au démarrage
  loadData().then(() => {
    console.log('✅ MC Module prêt');
    // Calculer automatiquement si des critères sont déjà sélectionnés
    if (state.selectedMetrics.length > 0) {
      compute();
    }
  });
})();