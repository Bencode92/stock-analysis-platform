// ===== MC (Multi-Critères) – Top 10 avec interface flexible ===================
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
    if(s==null||s==='-') return NaN;
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

  // DOM - utiliser root comme base
  const modeRadios=[...root.querySelectorAll('input[name="mc-mode"]')];
  const lexicoBox=document.getElementById('mc-lexico');
  const applyBtn=document.getElementById('mc-apply');
  const resetBtn=document.getElementById('mc-reset');
  const summary=document.getElementById('mc-summary');

  // état et données
  const state={ 
    mode:'balanced', 
    data:[], 
    loading:false,
    priorities: ['perf_1y', 'volatility_3y'], // Liste dynamique des priorités
    customFilters: [] // Filtres rapides personnalisés
  };

  // Améliorer l'interface des priorités (remplacer les 3 selects par une liste dynamique)
  function updatePriorityUI() {
    if (!lexicoBox) return;
    
    const prioContainer = lexicoBox.querySelector('.grid') || lexicoBox;
    prioContainer.innerHTML = `
      <div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser-déposer)</div>
      <div id="priority-list" class="space-y-1 mb-2">
        ${state.priorities.map((m, i) => `
          <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5" data-metric="${m}">
            <span class="priority-number text-xs opacity-50">${i+1}.</span>
            <span class="flex-1">${METRICS[m].label} ${METRICS[m].max?'↑':'↓'}</span>
            <button class="remove-priority text-red-400 hover:text-red-300" data-metric="${m}">✕</button>
          </div>
        `).join('')}
      </div>
      <select id="add-priority" class="mini-select w-full">
        <option value="">+ Ajouter une priorité</option>
        ${Object.keys(METRICS)
          .filter(k => !state.priorities.includes(k))
          .map(k => `<option value="${k}">${METRICS[k].label} ${METRICS[k].max?'↑':'↓'}</option>`)
          .join('')}
      </select>
    `;

    // Event listeners pour ajouter/supprimer des priorités
    const addSelect = document.getElementById('add-priority');
    if (addSelect) {
      addSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          state.priorities.push(e.target.value);
          updatePriorityUI();
        }
      });
    }

    // Supprimer une priorité
    prioContainer.querySelectorAll('.remove-priority').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const metric = e.target.dataset.metric;
        state.priorities = state.priorities.filter(m => m !== metric);
        updatePriorityUI();
      });
    });
  }

  // Ajouter explication du mode équilibre
  function addExplanation() {
    const modeContainer = root.querySelector('fieldset[role="radiogroup"]');
    if (modeContainer && !document.getElementById('mode-explanation')) {
      const explanation = document.createElement('div');
      explanation.id = 'mode-explanation';
      explanation.className = 'text-xs opacity-60 mt-2 p-2 rounded bg-white/5';
      explanation.innerHTML = `
        <div id="balanced-explanation" class="space-y-1">
          <strong>Mode Équilibre :</strong> Chaque critère donne un score de 0 à 100 selon le classement percentile. 
          La moyenne des scores détermine le rang final. Tous les critères ont le même poids.
        </div>
        <div id="priority-explanation" class="hidden space-y-1">
          <strong>Mode Priorités :</strong> Tri lexicographique - d'abord par le 1er critère, 
          puis le 2e en cas d'égalité (±0.5%), etc.
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
  }

  // charger les données depuis les fichiers JSON
  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    
    try {
      console.log('📊 MC: Chargement des données boursières...');
      const files = ['data/stocks_us.json', 'data/stocks_europe.json', 'data/stocks_asia.json'];
      const responses = await Promise.all(
        files.map(f => 
          fetch(f)
            .then(r => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            })
            .catch(err => {
              console.error(`❌ Erreur chargement ${f}:`, err);
              return null;
            })
        )
      );
      
      const allStocks = [];
      let loadedRegions = [];
      
      responses.forEach((data, index) => {
        if (!data) return;
        
        const region = ['US', 'EUROPE', 'ASIA'][index];
        loadedRegions.push(region);
        
        if (data.stocks && Array.isArray(data.stocks)) {
          console.log(`📈 ${region}: ${data.stocks.length} actions`);
          data.stocks.forEach(stock => {
            stock.region = region;
            allStocks.push(stock);
          });
        }
      });
      
      state.data = allStocks;
      console.log(`✅ MC: ${allStocks.length} actions chargées (${loadedRegions.join(', ')})`);
      
      if (allStocks.length > 0) {
        results.innerHTML = `<div class="text-center text-green-400 py-4">✅ ${allStocks.length} actions disponibles. Configurez et cliquez "Appliquer"</div>`;
      }
      
    } catch (err) {
      console.error('❌ MC: Erreur chargement données:', err);
      results.innerHTML = '<div class="text-center text-red-400 py-4">Erreur de chargement des données</div>';
    } finally {
      state.loading = false;
    }
  }

  // critères cochés
  function selectedMetrics(){
    const ids = Object.keys(METRICS).filter(id => root.querySelector('#m-'+id)?.checked);
    return ids.length? ids : ['perf_1y','volatility_3y'];
  }

  // filtres rapides dynamiques (à améliorer avec interface configurable)
  function applyFilters(list){
    const quick = {
      q1y10: document.getElementById('q-1y10'),
      qytd10: document.getElementById('q-ytd10'),
      qNoNeg1y: document.getElementById('q-noNeg1y'),
      qVol40: document.getElementById('q-vol40'),
    };

    return list.filter(s=>{
      const v1y = METRICS.perf_1y.get(s);
      const vytd= METRICS.ytd.get(s);
      const vvol= METRICS.volatility_3y.get(s);

      if (quick.q1y10?.checked && !(v1y>=10)) return false;
      if (quick.qytd10?.checked && !(vytd>=10)) return false;
      if (quick.qNoNeg1y?.checked && !(v1y>0)) return false;
      if (quick.qVol40?.checked && vvol>40) return false;

      const anySel = selectedMetrics().some(m => Number.isFinite(METRICS[m].get(s)));
      return anySel;
    });
  }

  // percentiles pour mode équilibre
  function percentile(sorted, v){
    if(!Number.isFinite(v)||!sorted.length) return NaN;
    const lo = sorted[Math.floor(0.01*(sorted.length-1))];
    const hi = sorted[Math.ceil(0.99*(sorted.length-1))];
    const x = Math.min(hi, Math.max(lo, v));
    let i=0; while(i<sorted.length && sorted[i]<=x) i++;
    if(sorted.length===1) return 1;
    return Math.max(0, Math.min(1, (i-1)/(sorted.length-1)));
  }

  // Mode équilibré : moyenne des percentiles
  function rankBalanced(list, metrics){
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
        if(!METRICS[m].max) pr = 1-pr; // Inverser si on veut minimiser
        sum+=pr; k++;
      }
      if(k>0) scored.push({s, score: sum/k});
    }
    scored.sort((a,b)=>b.score-a.score);
    return scored;
  }

  // Mode priorités : tri lexicographique
  function rankLexico(list){
    const prios = state.priorities.length ? state.priorities : ['perf_1y','volatility_3y'];
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

  // Nouveau rendu avec métriques visibles verticalement
  function render(entries, metrics){
    results.innerHTML='';
    results.className = 'space-y-2'; // Affichage vertical
    
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
      
      // Préparer les valeurs des métriques sélectionnées
      const metricValues = metrics.map(m => {
        const value = METRICS[m].get(e.s);
        if (!Number.isFinite(value)) return `<span class="opacity-30">—</span>`;
        
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
      }).join('');
      
      // Icône de région
      let regionIcon = '';
      if (e.s.region === 'US') {
        regionIcon = '<i class="fas fa-flag-usa text-xs text-blue-400" title="US"></i>';
      } else if (e.s.region === 'EUROPE') {
        regionIcon = '<i class="fas fa-globe-europe text-xs text-green-400" title="Europe"></i>';
      } else if (e.s.region === 'ASIA') {
        regionIcon = '<i class="fas fa-globe-asia text-xs text-red-400" title="Asie"></i>';
      }
      
      card.innerHTML=`
        <div class="rank text-2xl font-bold text-accent-color">#${i+1}</div>
        <div class="flex-1">
          <div class="font-semibold flex items-center gap-2">
            ${tkr} ${regionIcon}
          </div>
          <div class="text-xs opacity-60" title="${e.s.name||''}">${e.s.name||'—'}</div>
        </div>
        <div class="flex gap-4">
          ${metricValues}
        </div>`;
      
      results.appendChild(card);
    });
  }

  function setSummary(total, kept, metrics){
    if (!summary) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités';
    const labels = metrics.map(m=>METRICS[m].label).join(' · ');
    summary.innerHTML = `<strong>${mode}</strong> • ${labels} • ${kept}/${total} actions`;
  }

  async function compute(){
    console.log('🔍 MC: Calcul demandé');
    
    if (state.data.length === 0) {
      results.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement...</div>';
      await loadData();
    }
    
    const base = state.data;
    if(!base.length){ 
      results.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée disponible</div>';
      return; 
    }
    
    const filtered = applyFilters(base);
    if (filtered.length === 0) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Aucune action ne correspond aux filtres</div>';
      setSummary(base.length, 0, selectedMetrics());
      return;
    }
    
    const metrics = selectedMetrics();
    const out = state.mode==='balanced' ? rankBalanced(filtered, metrics) : rankLexico(filtered);
    setSummary(base.length, filtered.length, metrics);
    render(out, metrics);
    console.log(`✅ MC: Top 10 calculé (${filtered.length} actions filtrées)`);
  }

  // UI wiring
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
    
    // Afficher/masquer les explications
    const balancedExp = document.getElementById('balanced-explanation');
    const priorityExp = document.getElementById('priority-explanation');
    if (balancedExp && priorityExp) {
      balancedExp.classList.toggle('hidden', state.mode !== 'balanced');
      priorityExp.classList.toggle('hidden', state.mode !== 'lexico');
    }
    
    if (lexicoBox) {
      lexicoBox.classList.toggle('hidden', state.mode!=='lexico');
      lexicoBox.setAttribute('aria-hidden', state.mode!=='lexico' ? 'true' : 'false');
    }
  }));
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      console.log('🎯 MC: Bouton Appliquer cliqué');
      compute();
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', ()=>{
      // Reset critères
      root.querySelector('#m-perf_1y').checked=true;
      root.querySelector('#m-volatility_3y').checked=true;
      ['ytd','perf_3m','perf_1m','max_drawdown_3y','dividend_yield'].forEach(id=>{
        const el=root.querySelector('#m-'+id); 
        if(el) el.checked=false;
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
      state.priorities = ['perf_1y', 'volatility_3y'];
      
      // Update UI
      if (lexicoBox) {
        lexicoBox.classList.add('hidden');
        lexicoBox.setAttribute('aria-hidden', 'true');
      }
      updatePriorityUI();
      compute();
    });
  }

  // Initialisation
  addExplanation();
  updatePriorityUI();

  // expose
  window.MC = { refresh: compute, loadData, state };

  // Charger les données au démarrage
  loadData().then(() => {
    console.log('✅ MC Module initialisé avec succès');
  });
})();