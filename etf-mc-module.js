// Module MC adapté pour ETFs - v3.12.0 HARMONIZED (même look que Actions)
(function () {
  const waitFor=(c,b,t=40)=>c()?b():t<=0?console.error('❌ ETF MC: données introuvables'):setTimeout(()=>waitFor(c,b,t-1),250);
  const fmt=(n,d=2)=>Number.isFinite(+n)?(+n).toFixed(d):'—';
  const num=x=>Number.isFinite(+x)?+x:NaN;
  const str=s=>s==null?'':String(s);
  const parseMaybeJSON=s=>{try{return typeof s==='string'?JSON.parse(s):(Array.isArray(s)?s:[])}catch{return[];}};
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  
  waitFor(()=>!!window.ETFData?.getData && document.querySelector('#etf-mc-section') && document.querySelector('#etf-mc-results'),init);

  function init(){
    const root=document.querySelector('#etf-mc-section');
    const results=document.querySelector('#etf-mc-results');
    if(!root||!results){console.error('❌ ETF MC v3.12.0: DOM manquant');return;}
    console.log('✅ ETF MC v3.12.0: Module harmonisé avec Actions');

    // Harmonisation du conteneur comme Actions
    results.classList.add('glassmorphism','rounded-lg','p-4');

    // Styles harmonisés Actions/ETFs
    if(!document.getElementById('etf-mc-v312-harmonized')){
      const s=document.createElement('style'); s.id='etf-mc-v312-harmonized'; s.textContent=`
      /* Liste verticale comme Actions */
      #etf-mc-results { display:block }
      #etf-mc-results .space-y-2 > div { margin-bottom: .75rem }
      
      /* Cartes ETF = même look que Actions */
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
      
      /* Rang façon Actions */
      #etf-mc-results .etf-rank{
        min-width:50px !important; width:auto !important; height:auto !important;
        border-radius:0 !important; background:none !important; box-shadow:none !important;
        font-size:1.5rem !important; font-weight:900 !important; color:#00ffff !important;
        text-shadow:0 0 5px rgba(0,255,255,.3); opacity:.9;
      }
      
      /* Top 3 avec couleur */
      #etf-mc-results .etf-card:nth-child(1) .etf-rank{ color:#FFD700 !important }
      #etf-mc-results .etf-card:nth-child(2) .etf-rank{ color:#C0C0C0 !important }
      #etf-mc-results .etf-card:nth-child(3) .etf-rank{ color:#CD7F32 !important }
      
      /* Info ETF flexible */
      #etf-mc-results .etf-info{ 
        flex:1 1 40% !important; min-width:200px !important; margin-right:16px !important;
      }
      #etf-mc-results .etf-name{
        font-weight:700; font-size:.95rem; line-height:1.2;
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
      }
      #etf-mc-results .micro{
        font-size:.75rem; opacity:.6; margin-top:4px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      
      /* Métriques alignées à droite */
      #etf-mc-results .metrics{
        margin-left:auto !important; 
        display:flex !important; gap:16px !important;
        flex-wrap:wrap !important; justify-content:flex-end !important;
      }
      #etf-mc-results .metric-col{ 
        display:flex; flex-direction:column; align-items:flex-end; 
        min-width:auto !important;
      }
      #etf-mc-results .metric-col .k{ 
        font-size:.65rem !important; opacity:.65 !important; 
        text-transform:uppercase; letter-spacing:.3px; font-weight:700;
      }
      #etf-mc-results .metric-col .v{ 
        font-size:.95rem !important; font-weight:800; 
        line-height:1.1; font-variant-numeric:tabular-nums;
      }
      
      /* Badges */
      #etf-mc-results .badge{ 
        font-size:.58rem !important; padding:2px 7px !important; 
        border-radius:999px !important; font-weight:700;
      }
      
      /* Responsive */
      @media (max-width:1200px){
        #etf-mc-results .etf-info{ flex:1 1 35% !important }
        #etf-mc-results .metrics{ gap:12px !important }
      }
      
      /* Couleurs métriques */
      .g{color:#34d399}.y{color:#fbbf24}.r{color:#f87171}
      
      /* Facettes */
      .facet-group{margin-top:10px}.facet-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:.85rem;opacity:.85}
      .facet-head .count{opacity:.6;font-size:.75rem}.facet-body{max-height:0;overflow:hidden;transition:max-height .25s ease}
      .facet-group.open .facet-body{max-height:260px}
      .facet-list{list-style:none;margin:6px 0 0;padding:6px 8px;background:rgba(0,160,255,.07);border:1px solid rgba(0,160,255,.18);border-radius:10px}
      .facet-item{padding:6px 8px;border-radius:8px;display:flex;align-items:center;gap:8px}
      .facet-item input{accent-color:#00ffff}
      .facet-item.is-checked{background:rgba(0,200,255,.16);border:1px solid rgba(0,200,255,.35)}
      
      /* Pills MC */
      #etf-mc-section .mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:.2s}
      #etf-mc-section .mc-pill:hover{background:rgba(0,255,255,.08);border-color:rgba(0,255,255,.35)}
      #etf-mc-section .mc-pill.is-checked{background:rgba(0,255,255,.2)!important;border-color:#00ffff!important;box-shadow:0 0 12px rgba(0,255,255,.3);transform:translateY(-1px)}
      `;
      document.head.appendChild(s);
    }

    const state={
      mode:'balanced',
      selectedMetrics:['return_ytd','ter','aum','return_1y'],
      filters:{countries:new Set(),sectors:new Set(),fundTypes:new Set(),excludeLeveraged:true},
      customFilters:[],
      data:[],catalogs:{countries:[],sectors:[],fundTypes:[]}
    };

    const classify=e=>{
      const ft=str(e.fund_type).toLowerCase();
      if(/(bond|government|fixed income|core|short|intermediate|maturity)/i.test(ft))return'bonds';
      if(/(commodit|precious|gold|silver|oil)/i.test(ft))return'commodity';
      return'equity';
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

    const schedule=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(calculate,120);};})();
    const q=(v,dec=1)=>Math.round(v*10**dec)/10**dec;

    function syncSelectedFromUI() {
      const pills = [...document.querySelectorAll('#etf-mc-section .mc-pill input[id^="etf-m-"]')];
      state.selectedMetrics = pills
        .filter(x => x.checked)
        .map(x => x.id.replace('etf-m-',''))
        .filter(m => METRICS[m]);
      if (!state.selectedMetrics.length) {
        state.selectedMetrics = ['return_ytd','ter','aum'];
      }
    }

    function buildFacetCatalogs(){
      const cCount=new Map(),sCount=new Map(),fCount=new Map();
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
            wrap.querySelector('.count').textContent=`(${target.size})`; schedule();
          });
        });
      };
      mk('etf-filter-countries','Pays',state.catalogs.countries,'country',FR_COUNTRIES);
      mk('etf-filter-sectors','Secteurs',state.catalogs.sectors,'sector',FR_SECTORS);
      mk('etf-filter-fundtype','Type de fonds',state.catalogs.fundTypes,'fund',FR_FUNDTYPES);
    }

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
        state.customFilters.push({metric:m,operator:op,value:val}); valInp.value=''; renderList(); schedule();
      });
      function renderList(){
        if(!state.customFilters.length){listBox.innerHTML='<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';return;}
        listBox.innerHTML=state.customFilters.map((f,i)=>{
          const d=METRICS[f.metric],unit=d.unit||'';
          const col=(f.operator==='>='||f.operator==='>')?(d.max?'g':'y'):(f.operator==='<='||f.operator==='<')?(d.max?'r':'g'):'y';
          return `<div class="filter-item flex items-center gap-2 p-2 rounded">
            <span class="flex-1">${d.label} <span class="${col} font-semibold">${f.operator} ${q(f.value)}${unit}</span></span>
            <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-i="${i}"><i class="fas fa-times"></i></button>
          </div>`;
        }).join('');
        listBox.querySelectorAll('.remove-filter').forEach(b=>b.addEventListener('click',e=>{const idx=+e.currentTarget.dataset.i; state.customFilters.splice(idx,1); renderList(); schedule();}));
      }
      renderList();
    }
    
    function passCustomFilters(arr){
      if(!state.customFilters.length) return arr;
      return arr.filter(e=>{
        for(const f of state.customFilters){
          const d=METRICS[f.metric]; if(!d) return false;
          const raw=d.get(e); if(!Number.isFinite(raw)) return false;
          const v=q(raw),x=q(f.value);
          const op=f.operator.replace('≥','>=').replace('≤','<=').replace('≠','!=');
          let ok=true;
          switch(op){case'>=':ok=v>=x;break;case'>':ok=v>x;break;case'=':ok=v===x;break;case'<':ok=v<x;break;case'<=':ok=v<=x;break;case'!=':ok=v!==x;break;}
          if(!ok) return false;
        } return true;
      });
    }

    Object.keys(METRICS).forEach(metric=>{
      const cb=document.getElementById(`etf-m-${metric}`); if(!cb) return;
      cb.addEventListener('change',e=>{
        if(e.target.checked){ if(!state.selectedMetrics.includes(metric)) state.selectedMetrics.push(metric); }
        else state.selectedMetrics=state.selectedMetrics.filter(m=>m!==metric);
        cb.closest('.mc-pill')?.classList.toggle('is-checked',cb.checked);
        schedule();
      });
    });

    syncSelectedFromUI();

    document.querySelectorAll('input[name="etf-mc-mode"]').forEach(r=>r.addEventListener('change',()=>{state.mode=r.value; schedule();}));
    document.getElementById('etf-filter-leveraged')?.addEventListener('change',e=>{state.filters.excludeLeveraged=!!e.target.checked; schedule();});

    function calculate(){
      const raw=window.ETFData.getData()||[];
      state.data=raw.map(e=>{
        const cs5=parseMaybeJSON(e.country_top5).map(o=>str(o.c)).filter(Boolean);
        const ss5=parseMaybeJSON(e.sector_top5).map(o=>str(o.s)).filter(Boolean);
        const countries=cs5.length?cs5:[str(e.country_top)].filter(Boolean);
        const sectors=ss5.length?ss5:[str(e.sector_top)].filter(Boolean);
        return {...e,__kind:classify(e),__lev:isLev(e),__countries:[...new Set(countries)],__sectors:[...new Set(sectors)]};
      });
      if(!state.catalogs.countries.length){buildFacetCatalogs(); makeFacetLists(); setupCustomFiltersUI();}
      let arr=state.data.slice();
      if(state.filters.countries.size) arr=arr.filter(e=>e.__countries.some(c=>state.filters.countries.has(c)));
      if(state.filters.sectors.size)   arr=arr.filter(e=>e.__sectors.some(s=>state.filters.sectors.has(s)));
      if(state.filters.fundTypes.size) arr=arr.filter(e=>state.filters.fundTypes.has(str(e.fund_type).trim()));
      if(state.filters.excludeLeveraged) arr=arr.filter(e=>!e.__lev);
      arr=passCustomFilters(arr);

      const sel = state.selectedMetrics.filter(m => METRICS[m]);
      if (sel.length === 0) {
        results.innerHTML = '<div class="text-center text-cyan-400 py-4">Coche au moins un critère à gauche.</div>';
        const total = (window.ETFData.getData() || []).length;
        updateSummary(0, total); return;
      }

      const ranges={}; sel.forEach(m=>{const vals=arr.map(e=>METRICS[m].get(e)).filter(Number.isFinite); ranges[m]=vals.length?{min:Math.min(...vals),max:Math.max(...vals)}:{min:0,max:0};});
      let out;
      if(state.mode==='balanced'){
        const scores=arr.map(etf=>{let s=0,k=0; sel.forEach(m=>{const v=METRICS[m].get(etf); if(!Number.isFinite(v)) return; const {min,max}=ranges[m]; let z=(max===min)?0.5:(v-min)/(max-min); if(!METRICS[m].max) z=1-z; s+=z;k++;}); return {etf,score:k?(s/k):0};});
        scores.sort((a,b)=>b.score-a.score); out=scores.slice(0,10);
      }else{
        const N=arr.length,ranks={};
        sel.forEach(m=>{const tmp=arr.map((e,i)=>({i,v:METRICS[m].get(e)})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);
          const pct=new Array(N).fill(NaN); tmp.forEach((x,idx)=>{pct[x.i]=(idx+0.5)/tmp.length;}); ranks[m]=pct;});
        const idx=arr.map((_,i)=>i).sort((ia,ib)=>{for(const m of sel){let pa=ranks[m][ia],pb=ranks[m][ib]; if(!Number.isFinite(pa)&&!Number.isFinite(pb))continue; if(!Number.isFinite(pa))return 1; if(!Number.isFinite(pb))return -1; if(!METRICS[m].max){pa=1-pa;pb=1-pb;} const d=pa-pb; if(Math.abs(d)>0.01) return d>0?-1:1;} return 0;});
        out=idx.slice(0,10).map(i=>({etf:arr[i],score:NaN}));
      }
      render(out); updateSummary(arr.length,state.data.length);
    }

    function cleanName(name){
      return String(name||'')
        .replace(/\bis\s+(an|a)\s+exchange[-\s]?traded.*$/i,'')
        .replace(/\s+ETF\s+is.*$/i,' ETF')
        .replace(/\s+\bis\s+(new|a\s+new)\b.*$/i,'')
        .trim();
    }

    function render(entries){
      // Liste verticale comme Actions
      results.innerHTML = '<div class="space-y-2"></div>';
      const container = results.querySelector('.space-y-2');
      
      if(!entries.length){
        container.innerHTML='<div class="text-center text-cyan-400 py-4">Aucun ETF ne correspond aux critères</div>';
        return;
      }

      entries.forEach((entry,i)=>{
        const e=entry.etf;
        const typeBadge= classify(e)==='bonds' ? '<span class="badge" style="color:#80aaff;border-color:rgba(128,170,255,.35);background:rgba(128,170,255,.08)">Oblig.</span>' :
                         classify(e)==='commodity' ? '<span class="badge" style="color:#fbbf24;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)">Mat.</span>' : 
                         '<span class="badge" style="color:#00ffd0;border-color:rgba(0,255,135,.35);background:rgba(0,255,135,.09)">Actions</span>';
        const levBadge = e.__lev ? '<span class="badge" style="color:#ff9aa7;border-color:rgba(255,90,90,.35);background:rgba(255,90,90,.12)">LEV/INV</span>' : '';
        const displayName = esc(cleanName(e.long_name||e.fund_name||e.name||e.symbol||e.ticker||'—'));

        const colsHTML = state.selectedMetrics
          .filter(m => METRICS[m])
          .map(m => {
            const d = METRICS[m];
            const raw = d.get(e);

            const renderVal = (m,raw)=>{
              if(!Number.isFinite(raw)) return '—';
              if(m==='aum'){ const M=raw; return (M>=1000)?(M/1000).toFixed(1)+'B$':Math.round(M)+'M$'; }
              return d.unit==='%' ? (+raw).toFixed(1)+'%' : (+raw).toFixed(1);
            };
            const colorFor=(m,raw)=>{
              if(!Number.isFinite(raw)) return '';
              if(m==='ter') return raw<0.2?'g':raw<0.4?'g':'y';
              if(m==='volatility') return raw<10?'g':raw<20?'g':'y';
              return raw>=0?'g':'r';
            };

            return `<div class="metric-col">
              <div class="k">${d.label}</div>
              <div class="v ${colorFor(m,raw)}">${renderVal(m,raw)}</div>
            </div>`;
          }).join('');

        const topS=str(e.sector_top), wS=num(e.sector_top_weight);
        const topC=str(e.country_top), wC=num(e.country_top_weight);
        const micro=[ topS?`${topS}${Number.isFinite(wS)?' '+fmt(wS,0)+'%':''}`:'', topC?`${topC}${Number.isFinite(wC)?' '+fmt(wC,0)+'%':''}`:'' ].filter(Boolean).join(' • ');

        const card=document.createElement('div'); card.className='etf-card';
        card.innerHTML=`
          <div class="etf-rank">#${i+1}</div>
          <div class="etf-info">
            <div class="etf-name" title="${displayName}">${displayName} ${typeBadge} ${levBadge}</div>
            ${micro?`<div class="micro">${micro}</div>`:''}
          </div>
          <div class="metrics">${colsHTML}</div>`;
        container.appendChild(card);
      });
    }

    function updateSummary(filtered,total){
      const summary=document.getElementById('etf-mc-summary'); if(!summary) return;
      const mode=state.mode==='balanced'?'Équilibre':'Priorités';
      const metrics=state.selectedMetrics.map(m=>METRICS[m]?.label).filter(Boolean).join(' · ');
      const tags=[]; if(state.filters.countries.size)tags.push(`Pays(${state.filters.countries.size})`);
      if(state.filters.sectors.size)tags.push(`Secteurs(${state.filters.sectors.size})`);
      if(state.filters.fundTypes.size)tags.push(`Type(${state.filters.fundTypes.size})`);
      if(state.filters.excludeLeveraged)tags.push('No Lev/Inv');
      summary.innerHTML=`<strong>${mode}</strong> • ${metrics}${tags.length?' • '+tags.join(' '):''}  • ${filtered}/${total} ETFs`;
    }

    document.getElementById('etf-mc-apply')?.addEventListener('click',()=>calculate());
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
      calculate();
    });

    window.ETF_MC={calculate,state,METRICS};
    setTimeout(()=>{calculate();},300);
  }
})();