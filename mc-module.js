// ===== MC (Multi-Critères) – Top 10 dédié sous le Global ===================
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

  // métriques
  const METRICS = {
    perf_1y:         {label:'Perf 1Y',        get:s=>p(s.perf_1y),        max:true},
    ytd:             {label:'YTD',            get:s=>p(s.perf_ytd||s.ytd),max:true},
    perf_3m:         {label:'Perf 3M',        get:s=>p(s.perf_3m),        max:true},
    perf_1m:         {label:'Perf 1M',        get:s=>p(s.perf_1m),        max:true},
    volatility_3y:   {label:'Vol 3Y',         get:s=>p(s.volatility_3y),  max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      get:s=>p(s.max_drawdown_3y),max:false},
    dividend_yield:  {label:'Div. Yield',     get:s=>p(s.dividend_yield), max:true},
  };

  // DOM - utiliser root comme base
  const modeRadios=[...root.querySelectorAll('input[name="mc-mode"]')];
  const lexicoBox=document.getElementById('mc-lexico');
  const prio1=document.getElementById('mc-prio1');
  const prio2=document.getElementById('mc-prio2');
  const prio3=document.getElementById('mc-prio3');
  const quick={
    q1y10: document.getElementById('q-1y10'),
    qytd10: document.getElementById('q-ytd10'),
    qNoNeg1y: document.getElementById('q-noNeg1y'),
    qVol40: document.getElementById('q-vol40'),
  };
  const applyBtn=document.getElementById('mc-apply');
  const resetBtn=document.getElementById('mc-reset');
  const summary=document.getElementById('mc-summary');

  // état et données
  const state={ mode:'balanced', data:[], loading:false };

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
            // Enrichir avec région et icône
            stock.region = region;
            if (region === 'US') {
              stock.marketIcon = '<i class="fas fa-flag-usa text-xs ml-1 text-blue-400" title="US"></i>';
            } else if (region === 'EUROPE') {
              stock.marketIcon = '<i class="fas fa-globe-europe text-xs ml-1 text-green-400" title="Europe"></i>';
            } else if (region === 'ASIA') {
              stock.marketIcon = '<i class="fas fa-globe-asia text-xs ml-1 text-red-400" title="Asie"></i>';
            }
            allStocks.push(stock);
          });
        }
      });
      
      state.data = allStocks;
      console.log(`✅ MC: ${allStocks.length} actions chargées (${loadedRegions.join(', ')})`);
      
      // Afficher message de succès
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

  // remplir priorités
  (function fillPrio(){
    const opts = Object.keys(METRICS).map(k=>`<option value="${k}">${METRICS[k].label}${METRICS[k].max?' ↑':' ↓'}</option>`).join('');
    [prio1,prio2,prio3].forEach(sel=> {
      if (sel) sel.innerHTML = `<option value="">(aucune)</option>${opts}`;
    });
    if (prio1) prio1.value='perf_1y'; 
    if (prio2) prio2.value='volatility_3y'; 
    if (prio3) prio3.value='ytd';
  })();

  // critères cochés
  function selectedMetrics(){
    const ids = Object.keys(METRICS).filter(id => root.querySelector('#m-'+id)?.checked);
    return ids.length? ids : ['perf_1y','volatility_3y'];
  }

  // univers 
  function universe(){
    return state.data;
  }

  // filtres rapides
  function applyFilters(list){
    return list.filter(s=>{
      const v1y = METRICS.perf_1y.get(s);
      const vytd= METRICS.ytd.get(s);
      const vvol= METRICS.volatility_3y.get(s);

      if (quick.q1y10?.checked && !(v1y>=10)) return false;
      if (quick.qytd10?.checked && !(vytd>=10)) return false;
      if (quick.qNoNeg1y?.checked && !(v1y>0)) return false;
      if (quick.qVol40?.checked && vvol>40) return false;

      // au moins une métrique sélectionnée doit être présente
      const anySel = selectedMetrics().some(m => Number.isFinite(METRICS[m].get(s)));
      return anySel;
    });
  }

  // percentiles (winsorisé 1e–99e)
  function percentile(sorted, v){
    if(!Number.isFinite(v)||!sorted.length) return NaN;
    const lo = sorted[Math.floor(0.01*(sorted.length-1))];
    const hi = sorted[Math.ceil(0.99*(sorted.length-1))];
    const x = Math.min(hi, Math.max(lo, v));
    let i=0; while(i<sorted.length && sorted[i]<=x) i++;
    if(sorted.length===1) return 1;
    return Math.max(0, Math.min(1, (i-1)/(sorted.length-1)));
  }

  // équilibré = moyenne des percentiles (inverse si à minimiser)
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
        if(!METRICS[m].max) pr = 1-pr;
        sum+=pr; k++;
      }
      if(k>0) scored.push({s, score: sum/k});
    }
    scored.sort((a,b)=>b.score-a.score);
    return scored;
  }

  // priorités (lexicographique, tolérance 0.5 pt)
  function rankLexico(list){
    const prios=[prio1?.value, prio2?.value, prio3?.value].filter(Boolean);
    if(!prios.length) prios.push('perf_1y','volatility_3y');
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

  function render(entries){
    results.innerHTML='';
    const top = entries.slice(0,10);
    while(top.length<10) top.push({s:null, score:NaN});

    top.forEach((e,i)=>{
      const card=document.createElement('div');
      card.className='stock-card';
      if(!e.s){
        card.innerHTML=`
          <div class="rank">#${i+1}</div>
          <div class="stock-info"><div class="stock-name">—</div><div class="stock-fullname">—</div></div>
          <div class="stock-performance neutral">—</div>`;
        results.appendChild(card); return;
      }
      
      const tkr = e.s.ticker || e.s.symbol || (e.s.name||'').split(' ')[0] || '—';
      
      let scoreText;
      if (Number.isFinite(e.score)) {
        scoreText = `${Math.round(e.score*100)} pts`;
      } else {
        const perf1y = e.s.perf_1y;
        const ytd = e.s.perf_ytd || e.s.ytd;
        if (perf1y) {
          scoreText = `${perf1y > 0 ? '+' : ''}${perf1y}%`;
        } else if (ytd) {
          scoreText = `${ytd > 0 ? '+' : ''}${ytd}%`;
        } else {
          scoreText = '—';
        }
      }
      
      const valueClass = scoreText.includes('-') ? 'negative' : 'positive';
      
      card.innerHTML=`
        <div class="rank">#${i+1}</div>
        <div class="stock-info">
          <div class="stock-name">${tkr} ${e.s.marketIcon||''}</div>
          <div class="stock-fullname" title="${e.s.name||''}">${e.s.name||'—'}</div>
        </div>
        <div class="stock-performance ${valueClass}"><span class="mc-score">${scoreText}</span></div>`;
      results.appendChild(card);
    });
  }

  function setSummary(total, kept, metrics){
    if (!summary) return;
    const mode = state.mode==='balanced' ? 'Équilibre auto' : 'Priorités';
    const labels = metrics.map(m=>METRICS[m].label+(METRICS[m].max?' ↑':' ↓')).join(' · ');
    summary.innerHTML = `${mode} • ${labels} • ${kept}/${total} titres retenus`;
  }

  async function compute(){
    console.log('🔍 MC: Calcul demandé');
    
    // Charger les données si pas encore fait
    if (state.data.length === 0) {
      results.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement des données...</div>';
      await loadData();
    }
    
    const base = universe();
    if(!base.length){ 
      results.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée disponible</div>';
      return; 
    }
    
    const filtered = applyFilters(base);
    if (filtered.length === 0) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Aucune action ne correspond aux filtres sélectionnés</div>';
      setSummary(base.length, 0, selectedMetrics());
      return;
    }
    
    const metrics = selectedMetrics();
    const out = state.mode==='balanced' ? rankBalanced(filtered, metrics) : rankLexico(filtered);
    setSummary(base.length, filtered.length, metrics);
    render(out);
    console.log(`✅ MC: Top 10 calculé (${filtered.length} actions filtrées)`);
  }

  // UI wiring
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
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
      root.querySelector('#m-perf_1y').checked=true;
      root.querySelector('#m-volatility_3y').checked=true;
      ['ytd','perf_3m','perf_1m','max_drawdown_3y','dividend_yield'].forEach(id=>{
        const el=root.querySelector('#m-'+id); 
        if(el) el.checked=false;
      });
      Object.values(quick).forEach(el=> {
        if (el) el.checked=false;
      });
      const balancedRadio = modeRadios.find(x=>x.value==='balanced');
      if (balancedRadio) balancedRadio.checked=true;
      state.mode='balanced'; 
      if (lexicoBox) {
        lexicoBox.classList.add('hidden');
        lexicoBox.setAttribute('aria-hidden', 'true');
      }
      if (prio1) prio1.value='perf_1y'; 
      if (prio2) prio2.value='volatility_3y'; 
      if (prio3) prio3.value='ytd';
      compute();
    });
  }

  // expose
  window.MC = { refresh: compute, loadData, state };

  // Charger les données au démarrage
  loadData().then(() => {
    console.log('✅ MC Module initialisé avec succès');
  });
})();