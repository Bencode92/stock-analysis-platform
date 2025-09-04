// Module MC adapté pour ETFs - v4.0 ACTIONS-LIKE
// Reprend exactement la logique Actions : winsorisation, percentiles Hazen, nearTie, etc.
(function () {
  const waitFor=(c,b,t=40)=>c()?b():t<=0?console.error('❌ ETF MC: données introuvables'):setTimeout(()=>waitFor(c,b,t-1),250);
  const num=x=>Number.isFinite(+x)?+x:NaN, str=s=>s==null?'':String(s);
  const parseMaybeJSON=s=>{try{return typeof s==='string'?JSON.parse(s):(Array.isArray(s)?s:[])}catch{return[];}};
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

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
    if(!root||!results){console.error('❌ ETF MC v4.0: DOM manquant');return;}
    console.log('✅ ETF MC v4.0: Module Actions-like avec nearTie');

    // Harmonisation du conteneur
    results.classList.add('glassmorphism','rounded-lg','p-4');

    // Styles harmonisés
    if(!document.getElementById('etf-mc-v4-styles')){
      const s=document.createElement('style'); s.id='etf-mc-v4-styles'; s.textContent=`
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
      .g{color:#34d399}.y{color:#fbbf24}.r{color:#f87171}
      #etf-mc-section .mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:.2s}
      #etf-mc-section .mc-pill:hover{background:rgba(0,255,255,.08);border-color:rgba(0,255,255,.35)}
      #etf-mc-section .mc-pill.is-checked{background:rgba(0,255,255,.2)!important;border-color:#00ffff!important;box-shadow:0 0 12px rgba(0,255,255,.3)}
      #etf-priority-container{margin-top:12px;padding:12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.2)}
      #etf-priority-list .priority-item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:rgba(0,255,255,.05);border:1px solid rgba(0,255,255,.2);cursor:move;user-select:none;margin-bottom:4px}
      #etf-priority-list .priority-item:hover{background:rgba(0,255,255,.1);border-color:rgba(0,255,255,.4)}
      #etf-priority-list .priority-item.dragging{opacity:.5}
      .facet-group{margin-top:10px}.facet-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:.85rem;opacity:.85}
      .facet-head .count{opacity:.6;font-size:.75rem}.facet-body{max-height:0;overflow:hidden;transition:max-height .25s ease}
      .facet-group.open .facet-body{max-height:260px}
      .facet-list{list-style:none;margin:6px 0 0;padding:6px 8px;background:rgba(0,160,255,.07);border:1px solid rgba(0,160,255,.18);border-radius:10px}
      .facet-item{padding:6px 8px;border-radius:8px;display:flex;align-items:center;gap:8px}
      .facet-item input{accent-color:#00ffff}
      .facet-item.is-checked{background:rgba(0,200,255,.16);border:1px solid rgba(0,200,255,.35)}
      `;
      document.head.appendChild(s);
    }

    // === État & caches (même structure que Actions) ===
    const state={
      mode:'balanced',
      selectedMetrics:['return_ytd','ter','aum','return_1y'],
      filters:{countries:new Set(),sectors:new Set(),fundTypes:new Set(),excludeLeveraged:true},
      customFilters:[],
      data:[],
      catalogs:{countries:[],sectors:[],fundTypes:[]}
    };
    const cache = {};  // { metric: { raw, sorted, rankPct, iqr } }
    const masks = { facets:null, custom:null, final:null };

    // ==== MÉTRIQUES (équivalents ETF) ====
    const classify=e=>{
      const ft=str(e.fund_type).toLowerCase();
      if(/(bond|government|fixed income|core|short|intermediate|maturity)/i.test(ft))return 'bonds';
      if(/(commodit|precious|gold|silver|oil)/i.test(ft))return 'commodity';
      return 'equity';
    };
    const isLev=e=>{
      const t=str(e.etf_type).toLowerCase(); const lev=Number(e.leverage);
      return /leveraged|inverse/.test(t)||(Number.isFinite(lev)&&lev!==0);
    };
    const METRICS={
      ter:{label:'TER',unit:'%',max:false,get:e=>num(e.total_expense_ratio)*100},
      aum:{label:'AUM',unit:'$M',max:true,get:e=>num(e.aum_usd)/1e6},
      return_1d:{label:'Jour',unit:'%',max:true,get:e=>num(e.daily_change_pct)},
      return_ytd:{label:'YTD',unit:'%',max:true,get:e=>num(e.ytd_return_pct)},
      return_1y:{label:'1 An',unit:'%',max:true,get:e=>num(e.one_year_return_pct)},
      volatility:{label:'Vol',unit:'%',max:false,get:e=>num(e.vol_3y_pct)},
      dividend_yield:{label:'Div',unit:'%',max:true,get:e=>num(e.yield_ttm)*100},
      yield_net:{label:'Rdt net',unit:'%',max:true,get:e=>{
        if(classify(e)!=='bonds') return NaN;
        const y=num(e.yield_ttm), ter=num(e.total_expense_ratio);
        if(!Number.isFinite(y)||!Number.isFinite(ter)) return NaN;
        return (y-ter)*100;
      }}
    };

    // ==== UI: cases métriques & mode ====
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

    // UI Priorités (copie Actions)
    function buildPriorityUI(){
      let host=root.querySelector('fieldset[role="radiogroup"]') || root.querySelector('#etf-mc-section fieldset:nth-of-type(2)');
      if(!host) return;
      let box=document.getElementById('etf-priority-container');
      if(!box){
        box=document.createElement('div');
        box.id='etf-priority-container';
        box.innerHTML=`<div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser pour réorganiser)</div>
                       <div id="etf-priority-list" class="space-y-1"></div>`;
        host.appendChild(box);
      }
      box.style.display=(state.mode==='balanced')?'none':'block';
      const list=box.querySelector('#etf-priority-list');
      list.innerHTML = state.selectedMetrics.map((m,i)=>`
        <div class="priority-item" draggable="true" data-m="${m}">
          <span>☰</span><span class="text-xs opacity-50 mr-2">${i+1}.</span>
          <span class="flex-1">${METRICS[m]?.label||m} ${METRICS[m]?.max?'↑':'↓'}</span>
        </div>`).join('') || '<div class="text-xs opacity-50">Coche au moins un critère</div>';
      const items=list.querySelectorAll('.priority-item'); let dragging=null;
      items.forEach(it=>{
        it.addEventListener('dragstart',()=>{dragging=it; it.classList.add('dragging');});
        it.addEventListener('dragend',()=>{it.classList.remove('dragging'); dragging=null;});
        it.addEventListener('dragover',e=>{
          e.preventDefault();
          const els=[...list.querySelectorAll('.priority-item:not(.dragging)')];
          let closest={offset:Number.NEGATIVE_INFINITY,el:null};
          els.forEach(el=>{const r=el.getBoundingClientRect(); const off=e.clientY-r.top-r.height/2; if(off<0&&off>closest.offset) closest={offset:off,el};});
          if(!closest.el) list.appendChild(dragging); else list.insertBefore(dragging,closest.el);
        });
        it.addEventListener('drop',()=>{ state.selectedMetrics=[...list.querySelectorAll('.priority-item')].map(el=>el.dataset.m); buildPriorityUI(); scheduleCompute(); });
      });
    }

    // ==== DATA & CATALOGS ====
    function buildFacetCatalogs(){
      const cCount=new Map(), sCount=new Map(), fCount=new Map();
      state.data.forEach(e=>{
        (e.__countries||[]).forEach(c=>c&&cCount.set(c,(cCount.get(c)||0)+1));
        (e.__sectors||[]).forEach(s=>s&&sCount.set(s,(sCount.get(s)||0)+1));
        const ft=str(e.fund_type).trim(); if(ft) fCount.set(ft,(fCount.get(ft)||0)+1);
      });
      const sort=m=>[...m.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
      state.catalogs.countries=sort(cCount); state.catalogs.sectors=sort(sCount); state.catalogs.fundTypes=sort(fCount);
    }

    function makeFacetLists(){
      const host=root.querySelector('fieldset:last-of-type'); if(!host)return;
      host.querySelectorAll('select').forEach(s=>{const lab=s.previousElementSibling?.textContent?.toLowerCase()||'';if(/région|pays|secteur|type/.test(lab)){(s.closest('.flex')||s).style.display='none'}});
      document.getElementById('etf-filter-ter')?.closest('div')?.remove();
      document.getElementById('etf-filter-aum')?.closest('div')?.remove();

      const FR_SECTORS={"Financial Services":"Services financiers","Consumer Cyclical":"Conso. cyclique","Technology":"Technologie","Industrial":"Industrie","Communication Services":"Communication","Basic Materials":"Matériaux de base","Healthcare":"Santé","Energy":"Énergie","Utilities":"Services publics","Real Estate":"Immobilier","Consumer Defensive":"Conso. défensive"};
      const FR_COUNTRIES={"United States":"États-Unis","United Kingdom":"Royaume-Uni","Germany":"Allemagne","France":"France","Switzerland":"Suisse","China":"Chine","Japan":"Japon","Canada":"Canada"};
      const FR_FUNDTYPES={"Intermediate Core Bond":"Obligations core","High Yield Bond":"Obligations haut rendement","Large Growth":"Grande cap. croissance","Emerging Markets":"Marchés émergents"};
      const toFR=(v,d)=>d[v]||v;
      const mk=(id,title,values,facet,dict)=>{
        if(document.getElementById(id+'-group'))return;
        const wrap=document.createElement('div'); wrap.className='facet-group'; wrap.id=id+'-group';
        wrap.innerHTML=`<div class="facet-head"><span>▸</span><span>${title}</span><span class="count">(0)</span></div>
          <div class="facet-body"><ul id="${id}" class="facet-list">
          ${values.slice(0,10).map(v=>`<li class="facet-item"><label><input type="checkbox" data-facet="${facet}" value="${v}"> ${toFR(v,dict)}</label></li>`).join('')}
          </ul></div>`;
        host.insertBefore(wrap, host.querySelector('#etf-custom-filters-list')?.parentElement || host.lastChild);
        const head=wrap.querySelector('.facet-head'); head.addEventListener('click',()=>{wrap.classList.toggle('open'); head.querySelector('span').textContent=wrap.classList.contains('open')?'▾':'▸';});
        wrap.querySelectorAll('input[data-facet]').forEach(inp=>{
          const sets=state.filters; const target=facet==='country'?sets.countries:facet==='sector'?sets.sectors:sets.fundTypes;
          inp.addEventListener('change',e=>{
            const v=e.target.value; if(e.target.checked)target.add(v); else target.delete(v);
            e.target.closest('.facet-item')?.classList.toggle('is-checked',e.target.checked);
            wrap.querySelector('.count').textContent=`(${target.size})`; scheduleCompute();
          });
        });
      };
      mk('etf-filter-countries','Pays',state.catalogs.countries,'country',FR_COUNTRIES);
      mk('etf-filter-sectors','Secteurs',state.catalogs.sectors,'sector',FR_SECTORS);
      mk('etf-filter-fundtype','Type de fonds',state.catalogs.fundTypes,'fund',FR_FUNDTYPES);
    }

    // ==== BUILD CACHE (identique Actions) ====
    function buildCache(){
      const n=state.data.length; if(!n) return;
      // pré-calcul des métriques sur objets
      for(const s of state.data){
        s.metrics={};
        for(const [k,def] of Object.entries(METRICS)){ s.metrics[k]=def.get(s); }
      }
      for(const m of Object.keys(METRICS)){
        const raw=new Float64Array(n);
        for(let i=0;i<n;i++) raw[i]=state.data[i].metrics[m];
        // winsorisation douce
        const sorted0=Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
        if(!sorted0.length){ cache[m]={raw,sorted:new Float64Array(),rankPct:new Float64Array(n),iqr:1}; continue; }
        const qIdx=(arr,p)=>arr[Math.floor(p*(arr.length-1))];
        const lo=qIdx(sorted0,0.005), hi=qIdx(sorted0,0.995);
        for(let i=0;i<n;i++){ if(Number.isFinite(raw[i])) raw[i]=Math.min(hi,Math.max(lo,raw[i])); }
        const sorted=Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
        const qIdxW=(p)=>sorted[Math.floor(p*(sorted.length-1))];
        const q1=qIdxW(0.25), q3=qIdxW(0.75);
        const iqr=Math.max(1e-9, q3-q1);

        // percentiles Hazen avec gestion d'égalités
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

    // ==== MASQUES (facettes + custom) ====
    const q1d=(v)=>Math.round(v*10)/10;
    function buildFacetMask(){
      const n=state.data.length, mask=new Uint8Array(n); mask.fill(1);
      for(let i=0;i<n;i++){
        const e=state.data[i];
        if(state.filters.excludeLeveraged && e.__lev){ mask[i]=0; continue; }
        if(state.filters.countries.size && !e.__countries.some(c=>state.filters.countries.has(c))) { mask[i]=0; continue; }
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

    // ==== nearTie & comparateur (copié Actions) ====
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

    // ==== RENDU (identique look ETF existant) ====
    const fmt=(n,d=1)=>Number.isFinite(+n)?(+n).toFixed(d):'—';
    function render(entries){
      results.innerHTML = '<div class="space-y-2"></div>';
      const container=results.querySelector('.space-y-2');
      if(!entries.length){ container.innerHTML='<div class="text-center text-cyan-400 py-4">Aucun ETF ne correspond aux critères</div>'; return; }

      entries.forEach((row,i)=>{
        const e=row.e;
        const typeBadge= classify(e)==='bonds' ? '<span class="badge" style="color:#80aaff;border-color:rgba(128,170,255,.35);background:rgba(128,170,255,.08)">Oblig.</span>' :
                         classify(e)==='commodity' ? '<span class="badge" style="color:#fbbf24;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)">Mat.</span>' :
                         '<span class="badge" style="color:#00ffd0;border-color:rgba(0,255,135,.35);background:rgba(0,255,135,.09)">Actions</span>';
        const levBadge = e.__lev ? '<span class="badge" style="color:#ff9aa7;border-color:rgba(255,90,90,.35);background:rgba(255,90,90,.12)">LEV/INV</span>' : '';
        const name = esc(e.long_name||e.fund_name||e.name||e.symbol||e.ticker||'—');

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
          return `<div class="metric-col"><div class="k">${d.label}</div><div class="v ${color()}">${renderVal()}</div></div>`;
        }).join('');

        const topS=str(e.sector_top), wS=num(e.sector_top_weight);
        const topC=str(e.country_top), wC=num(e.country_top_weight);
        const micro=[ topS?`${topS}${Number.isFinite(wS)?' '+fmt(wS,0)+'%':''}`:'', topC?`${topC}${Number.isFinite(wC)?' '+fmt(wC,0)+'%':''}`:'' ].filter(Boolean).join(' • ');

        const card=document.createElement('div'); card.className='etf-card';
        card.innerHTML=`
          <div class="etf-rank">#${i+1}</div>
          <div class="etf-info">
            <div class="etf-name" title="${name}">${name} ${typeBadge} ${levBadge}</div>
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
      const metrics=state.selectedMetrics.map(m=>METRICS[m]?.label).filter(Boolean).join(' · ');
      const tags=[];
      if(state.filters.countries.size) tags.push(`Pays(${state.filters.countries.size})`);
      if(state.filters.sectors.size)   tags.push(`Secteurs(${state.filters.sectors.size})`);
      if(state.filters.fundTypes.size) tags.push(`Type(${state.filters.fundTypes.size})`);
      if(state.filters.excludeLeveraged) tags.push('No Lev/Inv');
      summary.innerHTML=`<strong>${mode}</strong> • ${metrics}${tags.length?' • '+tags.join(' '):''} • ${filtered}/${total} ETFs`;
    }

    // ==== COMPUTE PIPELINE (identique Actions) ====
    let computeTimer; const scheduleCompute=()=>{ clearTimeout(computeTimer); computeTimer=setTimeout(compute,120); };

    function compute(){
      // 1) charger données brutes
      const raw=window.ETFData.getData()||[];
      state.data = raw.map(e=>{
        const cs5=parseMaybeJSON(e.country_top5).map(o=>str(o.c)).filter(Boolean);
        const ss5=parseMaybeJSON(e.sector_top5).map(o=>str(o.s)).filter(Boolean);
        const countries=cs5.length?cs5:[str(e.country_top)].filter(Boolean);
        const sectors=ss5.length?ss5:[str(e.sector_top)].filter(Boolean);
        return {...e,__kind:classify(e),__lev:isLev(e),__countries:[...new Set(countries)],__sectors:[...new Set(sectors)]};
      });

      if(!state.catalogs.countries.length){ buildFacetCatalogs(); makeFacetLists(); setupCustomFiltersUI(); }
      // 2) (re)build cache global robuste
      buildCache();

      // 3) masques & indices admissibles (ALLOW_MISSING)
      masks.facets=masks.custom=masks.final=null;
      const pool = getFilteredIndices(state.selectedMetrics);

      updateSummary(pool.length, state.data.length);
      if(pool.length===0){ render([]); return; }

      // 4) ranking
      let out;
      if(state.mode==='balanced'){ out = rankBalanced(pool); }
      else { out = topNByLexico(pool, state.selectedMetrics); }

      // 5) rendu
      render(out);
    }

    // ==== UI filtres custom (quantisé 0.1) ====
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

    // ==== Facettes existantes ====
    document.getElementById('etf-filter-leveraged')?.addEventListener('change',e=>{state.filters.excludeLeveraged=!!e.target.checked; scheduleCompute();});

    // ==== Boutons ====
    document.getElementById('etf-mc-apply')?.addEventListener('click',()=>compute());
    document.getElementById('etf-mc-reset')?.addEventListener('click',()=>{
      state.mode='balanced';
      state.selectedMetrics=['return_ytd','ter','aum','return_1y'];
      state.filters={countries:new Set(),sectors:new Set(),fundTypes:new Set(),excludeLeveraged:true};
      state.customFilters=[];
      document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp=>{
        const id=inp.id?.replace('etf-m-','');
        inp.checked=state.selectedMetrics.includes(id);
        inp.closest('.mc-pill')?.classList.toggle('is-checked',inp.checked);
      });
      document.querySelectorAll('#etf-mc-section .facet-item input[type="checkbox"]').forEach(inp=>{
        inp.checked=false; inp.closest('.facet-item')?.classList.remove('is-checked');
      });
      const listBox=document.getElementById('etf-custom-filters-list');
      if(listBox) listBox.innerHTML='<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';
      syncSelectedFromUI();
      buildPriorityUI();
      compute();
    });

    // Go
    syncSelectedFromUI();
    setTimeout(()=>compute(), 300);
    window.ETF_MC={compute,state,METRICS,cache};
  }
})();