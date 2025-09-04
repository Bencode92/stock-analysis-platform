// Module MC adapté pour ETFs - v3.8.1 STYLE ACTIONS
// - Sync automatique avec pills UI
// - Bloque affichage si aucun critère coché
// - Daily et YTD en priorité
(function () {
  const waitFor=(c,b,t=40)=>c()?b():t<=0?console.error('❌ ETF MC: données introuvables'):setTimeout(()=>waitFor(c,b,t-1),250);
  const fmt=(n,d=2)=>Number.isFinite(+n)?(+n).toFixed(d):'—';
  const num=x=>Number.isFinite(+x)?+x:NaN;
  const str=s=>s==null?'':String(s);
  const parseMaybeJSON=s=>{try{return typeof s==='string'?JSON.parse(s):(Array.isArray(s)?s:[])}catch{return[]}};
  waitFor(()=>!!window.ETFData&&typeof window.ETFData.getData==='function',init);

  function init(){
    const root=document.querySelector('#etf-mc-section');
    const results=document.querySelector('#etf-mc-results .stock-cards-container');
    if(!root||!results){console.error('❌ ETF MC v3.8.1: DOM manquant');return;}
    console.log('✅ ETF MC v3.8.1 SYNC: Module initialisé');
    
    if(!document.getElementById('etf-mc-v38-styles')){
      const s=document.createElement('style'); s.id='etf-mc-v38-styles'; s.textContent=`
      #etf-mc-results .stock-cards-container{display:block}
      #etf-mc-results .stock-cards-container>.etf-card{margin-bottom:.6rem}
      .etf-card{
        display:grid; grid-template-columns:52px 1fr auto; gap:14px; align-items:center;
        padding:14px; border-radius:14px;
        background:linear-gradient(135deg,rgba(0,86,180,.12),rgba(0,140,255,.08));
        border:1px solid rgba(0,160,255,.22); transition:.2s ease;
      }
      .etf-card:hover{background:linear-gradient(135deg,rgba(0,86,180,.18),rgba(0,140,255,.12));border-color:rgba(0,200,255,.42);transform:translateX(2px)}
      .etf-rank{
        width:52px;height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:1rem;background:rgba(0,160,255,.18);color:#9fd6ff;box-shadow:0 0 14px rgba(0,160,255,.28)
      }
      .etf-info{min-width:0}
      .etf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px}
      .badge{font-size:.65rem;padding:3px 8px;border-radius:7px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;border:1px solid rgba(0,220,255,.35);color:#00e5ff;background:rgba(0,220,255,.12)}
      .badge.warn{color:#ff9aa7;border-color:rgba(255,90,90,.35);background:rgba(255,90,90,.12)}
      .micro{font-size:.8rem;opacity:.6;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      /* bloc métriques façon Actions */
      .metrics{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:14px;max-width:58%}
      .metric-primary{min-width:120px}
      .metric-primary .k{font-size:.78rem;opacity:.65}
      .metric-primary .v{font-size:1.05rem;font-weight:800}
      .chips{display:flex;flex-wrap:wrap;gap:8px}
      .chip{font-size:.72rem;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);opacity:.9}
      .g{color:#34d399}.y{color:#fbbf24}.r{color:#f87171}
      /* Facettes repliables */
      .facet-group{margin-top:10px}
      .facet-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:.85rem;opacity:.85}
      .facet-head .count{opacity:.6;font-size:.75rem}
      .facet-body{max-height:0;overflow:hidden;transition:max-height .25s ease}
      .facet-group.open .facet-body{max-height:260px}
      .facet-list{list-style:none;margin:6px 0 0;padding:6px 8px;background:rgba(0,160,255,.07);border:1px solid rgba(0,160,255,.18);border-radius:10px}
      .facet-item{padding:6px 8px;border-radius:8px;display:flex;align-items:center;gap:8px}
      .facet-item input{accent-color:#00e5ff}
      .facet-item.is-checked{background:rgba(0,200,255,.16);border:1px solid rgba(0,200,255,.35)}
      /* masquer vieux champs TER/AUM */
      #etf-filter-ter,#etf-filter-aum,label[for="etf-filter-ter"],label[for="etf-filter-aum"]{display:none!important}
      /* responsive : métriques passent dessous */
      @media (max-width:1200px){ .metrics{max-width:68%} }
      @media (max-width:1000px){
        .etf-card{grid-template-columns:52px 1fr}
        .metrics{justify-content:flex-start;max-width:100%}
      }
      /* pills */
      #etf-mc-section .mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid rgba(0,200,255,.2);border-radius:10px;background:rgba(0,255,255,.03);cursor:pointer;transition:.2s}
      #etf-mc-section .mc-pill:hover{background:rgba(0,255,255,.08);border-color:rgba(0,255,255,.35)}
      #etf-mc-section .mc-pill.is-checked{background:rgba(0,255,255,.2)!important;border-color:#00ffff!important;box-shadow:0 0 12px rgba(0,255,255,.3);transform:translateY(-1px)}
      #etf-mc-section .mini-input,#etf-mc-section .mini-select{background:rgba(0,255,255,.05);color:#fff}
      .filter-item{background:rgba(0,255,255,.05);border:1px solid rgba(0,255,255,.2);border-radius:8px}
      `; document.head.appendChild(s);
    }

    const state={
      mode:'balanced',
      selectedMetrics:['return_1d','return_ytd','volatility','sharpe_proxy','aum','ter','dividend_yield','return_1y'],
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
      return_1d:{label:'Perf 1J',unit:'%',max:true,get:e=>num(e.daily_change_pct)},
      return_ytd:{label:'YTD',unit:'%',max:true,get:e=>num(e.ytd_return_pct)},
      return_1y:{label:'Perf 1A',unit:'%',max:true,get:e=>num(e.one_year_return_pct)},
      volatility:{label:'Vol 3A',unit:'%',max:false,get:e=>num(e.vol_3y_pct)},
      dividend_yield:{label:'Rdt TTM',unit:'%',max:true,get:e=>num(e.yield_ttm)*100},
      yield_net:{label:'Rdt net',unit:'%',max:true,get:e=> classify(e)==='bonds'?(num(e.yield_ttm)*100 - num(e.total_expense_ratio)*100):NaN},
      sharpe_proxy:{label:'R/Vol',unit:'',max:true,get:e=>{const r=num(e.one_year_return_pct),v=num(e.vol_3y_pct);return(Number.isFinite(r)&&Number.isFinite(v)&&v>0)?r/v:NaN;}}
    };

    const schedule=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(calculate,120);};})();
    const q=(v,dec=1)=>Math.round(v*10**dec)/10**dec;

    // == NEW: sync des métriques depuis l'UI ==
    function syncSelectedFromUI() {
      const pills = [...document.querySelectorAll('#etf-mc-section .mc-pill input[id^="etf-m-"]')];
      state.selectedMetrics = pills
        .filter(x => x.checked)
        .map(x => x.id.replace('etf-m-',''))
        .filter(m => METRICS[m]);
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

      const FR_SECTORS={"Financial Services":"Services financiers","Consumer Cyclical":"Conso. cyclique","Technology":"Technologie","Industrial":"Industrie","Communication Services":"Communication","Basic Materials":"Matériaux de base","Healthcare":"Santé","Energy":"Énergie","Utilities":"Services publics","Real Estate":"Immobilier","Consumer Defensive":"Conso. défensive","Financials":"Finance","Information Technology":"Technologies de l'info","Consumer Staples":"Biens de conso. de base","Consumer Discretionary":"Conso. discrétionnaire","Materials":"Matériaux","Industrials":"Industriels","Health Care":"Soins de santé","Telecommunication Services":"Télécoms"};
      const FR_COUNTRIES={"United States":"États-Unis","United Kingdom":"Royaume-Uni","Germany":"Allemagne","France":"France","Switzerland":"Suisse","Spain":"Espagne","Netherlands":"Pays-Bas","China":"Chine","Korea":"Corée","India":"Inde","Taiwan":"Taïwan","Japan":"Japon","Canada":"Canada","Italy":"Italie","Australia":"Australie","Belgium":"Belgique","Sweden":"Suède","Denmark":"Danemark","Norway":"Norvège","Brazil":"Brésil","Mexico":"Mexique"};
      const FR_FUNDTYPES={"Intermediate Core Bond":"Obligations core intermédiaire","Intermediate Core-Plus Bond":"Obligations core-plus intermédiaire","Short Government":"Gouvernement court terme","High Yield Bond":"Obligations haut rendement","Target Maturity":"Échéance cible","Equity Precious Metals":"Actions métaux précieux","Technology":"Technologie","Health":"Santé","Trading--Leveraged Equity":"ETF levier (actions)","Trading--Inverse Equity":"ETF inverse (actions)","Mid-Cap Growth":"Mid-cap croissance","Large Blend":"Grande cap. mixte","Large Growth":"Grande cap. croissance","Large Value":"Grande cap. valeur","Small Growth":"Petite cap. croissance","Small Value":"Petite cap. valeur","Foreign Large Blend":"International grande cap.","Foreign Large Growth":"International croissance","Foreign Large Value":"International valeur","Emerging Markets":"Marchés émergents","Europe Stock":"Actions Europe","Real Estate":"Immobilier","Sector Equity":"Actions sectorielles","World Bond":"Obligations mondiales","Corporate Bond":"Obligations d'entreprise"};
      const toFR=(v,d)=>d[v]||v;
      const mk=(id,title,values,facet,dict)=>{
        if(document.getElementById(id+'-group'))return;
        const wrap=document.createElement('div'); wrap.className='facet-group'; wrap.id=id+'-group';
        wrap.innerHTML=`<div class="facet-head"><span>▸</span><span>${title}</span><span class="count">(0)</span></div>
          <div class="facet-body"><ul id="${id}" class="facet-list">
          ${values.map(v=>`<li class="facet-item"><label><input type="checkbox" data-facet="${facet}" value="${v}"> ${toFR(v,dict)}</label></li>`).join('')}
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
      mk('etf-filter-countries','Pays (multi-sélection)',state.catalogs.countries,'country',FR_COUNTRIES);
      mk('etf-filter-sectors','Secteurs (multi-sélection)',state.catalogs.sectors,'sector',FR_SECTORS);
      mk('etf-filter-fundtype','Type de fonds (multi-sélection)',state.catalogs.fundTypes,'fund',FR_FUNDTYPES);
    }

    // Filtres perso
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
          const v=q(raw),x=q(f.value); let ok=true;
          switch(f.operator){case'>=':ok=v>=x;break;case'>':ok=v>x;break;case'=':ok=v===x;break;case'<':ok=v<x;break;case'<=':ok=v<=x;break;case'!=':ok=v!==x;break;}
          if(!ok) return false;
        } return true;
      });
    }

    // écoute pills → mirroring à droite
    Object.keys(METRICS).forEach(metric=>{
      const cb=document.getElementById(`etf-m-${metric}`); if(!cb) return;
      cb.addEventListener('change',e=>{
        if(e.target.checked){ if(!state.selectedMetrics.includes(metric)) state.selectedMetrics.push(metric); }
        else state.selectedMetrics=state.selectedMetrics.filter(m=>m!==metric);
        cb.closest('.mc-pill')?.classList.toggle('is-checked',cb.checked);
        schedule();
      });
    });

    // == NEW: initialise selectedMetrics selon les pills cochées ==
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

      // == NEW: afficher rien si aucun critère n'est sélectionné ==
      const sel = state.selectedMetrics.filter(m => METRICS[m]);
      if (sel.length === 0) {
        results.innerHTML = '<div class="text-center text-cyan-400 py-4">Coche au moins un critère à gauche.</div>';
        const total = (window.ETFData.getData() || []).length;
        updateSummary(0, total);
        return;
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

    function render(entries){
      const box=results; box.innerHTML=''; box.className='stock-cards-container';
      if(!entries.length){box.innerHTML='<div class="text-center text-cyan-400 py-4">Aucun ETF ne correspond aux critères</div>';return;}

      entries.forEach((entry,i)=>{
        const e=entry.etf;
        const typeBadge= classify(e)==='bonds' ? '<span class="badge">Obligations</span>' :
                         classify(e)==='commodity' ? '<span class="badge">Matières</span>' : '<span class="badge">Actions</span>';
        const levBadge = e.__lev ? '<span class="badge warn">LEV/INV</span>' : '';
        const displayName = str(e.long_name)||str(e.fund_name)||str(e.name)||str(e.symbol)||str(e.ticker)||'—';

        const primary = state.selectedMetrics.filter(m=>METRICS[m]).slice(0,2);
        const secondary = state.selectedMetrics.filter(m=>METRICS[m]).slice(2);

        const renderVal=(m,raw)=>{
          const d=METRICS[m]; if(!Number.isFinite(raw)) return '—';
          if(m==='aum'){ const M=raw; return (M>=1000)?(M/1000).toFixed(1)+'B$':Math.round(M)+'M$'; }
          return d.unit==='%'? fmt(raw,2)+'%' : fmt(raw,2);
        };
        const colorFor=(m,raw)=>{
          if(!Number.isFinite(raw)) return '';
          if(m==='ter') return raw<0.2?'g':raw<0.4?'g':'y';
          if(m==='volatility') return raw<10?'g':raw<20?'g':'y';
          if(m==='sharpe_proxy') return raw>2?'g':raw>1?'g':'y';
          return raw>=0?'g':'r';
        };

        const primHTML = primary.map(m=>{
          const d=METRICS[m], raw=d.get(e);
          return `<div class="metric-primary">
            <div class="k">${d.label}</div>
            <div class="v ${colorFor(m,raw)}">${renderVal(m,raw)}</div>
          </div>`;
        }).join('');

        const chipsHTML = secondary.map(m=>{
          const d=METRICS[m], raw=d.get(e);
          return `<span class="chip ${colorFor(m,raw)}">${d.label}: ${renderVal(m,raw)}</span>`;
        }).join('');

        const topS=str(e.sector_top), wS=num(e.sector_top_weight);
        const topC=str(e.country_top), wC=num(e.country_top_weight);
        const micro=[ topS?`${topS}${Number.isFinite(wS)?' '+fmt(wS,0)+'%':''}`:'', topC?`${topC}${Number.isFinite(wC)?' '+fmt(wC,0)+'%':''}`:'' ].filter(Boolean).join(' • ');

        const card=document.createElement('div'); card.className='etf-card';
        card.innerHTML=`
          <div class="etf-rank">#${i+1}</div>
          <div class="etf-info">
            <div class="etf-name" title="${displayName.replace(/"/g,'&quot;')}">${displayName} ${typeBadge} ${levBadge}</div>
            ${micro?`<div class="micro">${micro}</div>`:''}
          </div>
          <div class="metrics">
            ${primHTML}
            ${chipsHTML?`<div class="chips">${chipsHTML}</div>`:''}
          </div>`;
        box.appendChild(card);
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
      summary.innerHTML=`<strong>${mode}</strong> • ${metrics}${tags.length?' • '+tags.join(' '):''} • ${filtered}/${total} ETFs`;
    }

    document.getElementById('etf-mc-apply')?.addEventListener('click',()=>calculate());
    document.getElementById('etf-mc-reset')?.addEventListener('click',()=>{
      state.mode='balanced';
      state.selectedMetrics=['return_1d','return_ytd','volatility','sharpe_proxy','aum','ter','dividend_yield','return_1y'];
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
      // == NEW: resynchroniser après reset ==
      syncSelectedFromUI();
      calculate();
    });

    window.ETF_MC={calculate,state,METRICS};
    setTimeout(()=>{calculate();},300);
  }
})();