// ===== MC (Multi-Critères) – Top 10 dédié sous le Global ===================
(function(){
  const root = document.getElementById('mc-root');
  const results = document.querySelector('#mc-results .stock-cards-container');
  if(!root || !results) return;

  // util parse %
  const p = (typeof parsePercentage==='function') ? parsePercentage : (s)=>{
    if(s==null||s==='-') return NaN;
    let t=String(s).replace(',', '.').replace(/[+%]/g,'').trim(); return parseFloat(t);
  };

  // métriques
  const METRICS = {
    perf_1y:         {label:'Perf 1Y',        get:s=>p(s.perf_1y),        max:true},
    ytd:             {label:'YTD',            get:s=>p(s.ytd),            max:true},
    perf_3m:         {label:'Perf 3M',        get:s=>p(s.perf_3m),        max:true},
    perf_1m:         {label:'Perf 1M',        get:s=>p(s.perf_1m),        max:true},
    volatility_3y:   {label:'Vol 3Y',         get:s=>p(s.volatility_3y),  max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      get:s=>p(s.max_drawdown_3y),max:false},
    dividend_yield:  {label:'Div. Yield',     get:s=>p(s.dividend_yield), max:true},
  };

  // DOM
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

  // état
  const state={ mode:'balanced' };

  // remplir priorités
  (function fillPrio(){
    const opts = Object.keys(METRICS).map(k=>`<option value="${k}">${METRICS[k].label}${METRICS[k].max?' ↑':' ↓'}</option>`).join('');
    [prio1,prio2,prio3].forEach(sel=> sel.innerHTML = `<option value="">(aucune)</option>${opts}`);
    prio1.value='perf_1y'; prio2.value='volatility_3y'; prio3.value='ytd';
  })();

  // critères cochés
  function selectedMetrics(){
    const ids = Object.keys(METRICS).filter(id => root.querySelector('#m-'+id)?.checked);
    return ids.length? ids : ['perf_1y','volatility_3y']; // défaut simple
  }

  // univers (A→Z fusionné)
  function universe(){
    const idx = (window.stocksData && window.stocksData.indices) || {};
    const out=[];
    Object.values(idx).forEach(list => (list||[]).forEach(s=>out.push(s)));
    return out;
  }

  // filtres rapides
  function applyFilters(list){
    return list.filter(s=>{
      const v1y = METRICS.perf_1y.get(s);
      const vytd= METRICS.ytd.get(s);
      const vvol= METRICS.volatility_3y.get(s);

      if (quick.q1y10.checked && !(v1y>=10)) return false;
      if (quick.qytd10.checked && !(vytd>=10)) return false;
      if (quick.qNoNeg1y.checked && !(v1y>0)) return false;
      if (quick.qVol40.checked && !(vvol<=40)) return false;

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
    const prios=[prio1.value, prio2.value, prio3.value].filter(Boolean);
    if(!prios.length) prios.push('perf_1y','volatility_3y');
    const EPS=0.5;
    const cmp=(a,b)=>{
      for(const m of prios){
        const av=METRICS[m].get(a), bv=METRICS[m].get(b);
        const dir = METRICS[m].max? -1 : +1; // -1 => décroissant
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
      const scoreText = Number.isFinite(e.score)? `${Math.round(e.score*100)} pts` : (e.s.perf_1y || e.s.ytd || '—');
      card.innerHTML=`
        <div class="rank">#${i+1}</div>
        <div class="stock-info">
          <div class="stock-name">${tkr} ${e.s.marketIcon||''}</div>
          <div class="stock-fullname" title="${e.s.name||''}">${e.s.name||'—'}</div>
        </div>
        <div class="stock-performance positive"><span class="mc-score">${scoreText}</span></div>`;
      results.appendChild(card);
    });
  }

  function setSummary(total, kept, metrics){
    const mode = state.mode==='balanced' ? 'Équilibre auto' : 'Priorités';
    const labels = metrics.map(m=>METRICS[m].label+(METRICS[m].max?' ↑':' ↓')).join(' · ');
    summary.innerHTML = `${mode} • ${labels} • ${kept}/${total} titres retenus`;
  }

  function compute(){
    const base = universe();
    if(!base.length){ return; }
    const filtered = applyFilters(base);
    const metrics = selectedMetrics();
    const out = state.mode==='balanced' ? rankBalanced(filtered, metrics) : rankLexico(filtered);
    setSummary(base.length, filtered.length, metrics);
    render(out);
  }

  // UI wiring
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
    lexicoBox.classList.toggle('hidden', state.mode!=='lexico');
  }));
  document.getElementById('mc-apply').addEventListener('click', compute);
  document.getElementById('mc-reset').addEventListener('click', ()=>{
    root.querySelector('#m-perf_1y').checked=true;
    root.querySelector('#m-volatility_3y').checked=true;
    ['ytd','perf_3m','perf_1m','max_drawdown_3y','dividend_yield'].forEach(id=>{
      const el=root.querySelector('#m-'+id); if(el) el.checked=false;
    });
    Object.values(quick).forEach(el=> el.checked=false);
    modeRadios.find(x=>x.value==='balanced').checked=true;
    state.mode='balanced'; lexicoBox.classList.add('hidden');
    prio1.value='perf_1y'; prio2.value='volatility_3y'; prio3.value='ytd';
    compute();
  });

  // recalc quand la barre Global change (régions / Jour/YTD)
  window.addEventListener('topFiltersChanged', compute);

  // expose pour relancer après chargement A→Z
  window.MC = { refresh: compute };

  // 1er rendu (si données déjà là)
  setTimeout(compute, 300);
})();