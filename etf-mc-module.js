// Module MC adapté pour ETFs - v3.3
// + Filtres multi (Pays / Secteurs / Fund type)
// + Filtres personnalisés (metric/op/value)
// - Retrait "Qualité" & badge de score
(function () {
  function waitFor(cond, cb, tries = 40) {
    if (cond()) return void cb();
    if (tries <= 0) return console.error('❌ ETF MC v3.3: Données introuvables.');
    setTimeout(() => waitFor(cond, cb, tries - 1), 250);
  }

  waitFor(() => !!window.ETFData && typeof window.ETFData.getData === 'function', init);

  function init() {
    const root    = document.querySelector('#etf-mc-section');
    const results = document.querySelector('#etf-mc-results .stock-cards-container');
    if (!root || !results) {
      console.error('❌ ETF MC v3.3: DOM manquant', {root, results});
      return;
    }
    console.log('✅ ETF MC v3.3: Module initialisé');

    // --------- Helpers ----------
    const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF' };
    const fmt  = (n, d=2) => Number.isFinite(+n) ? (+n).toFixed(d) : '—';
    const num  = (x) => Number.isFinite(+x) ? +x : NaN;
    const str  = (s) => (s==null ? '' : String(s));
    const trunc= (s, n=120) => (s && s.length>n) ? (s.slice(0,n-1)+'…') : (s||'');
    const parseMaybeJSON = (s) => { try { return typeof s==='string' ? JSON.parse(s) : (Array.isArray(s)?s:[]);} catch{ return []; } };
    const classify = (e) => {
      const ft = str(e.fund_type).toLowerCase();
      if (/(bond|government|fixed income|core|short|intermediate|maturity)/i.test(ft)) return 'bonds';
      if (/(commodit|precious|gold|silver|oil)/i.test(ft)) return 'commodity';
      return 'equity';
    };
    const isLev = (e) => {
      const t = str(e.etf_type).toLowerCase();
      const lev = Number(e.leverage);
      return /leveraged|inverse/.test(t) || (Number.isFinite(lev) && lev!==0);
    };

    // --------- État ----------
    const state = {
      mode: 'balanced',
      selectedMetrics: ['ter','aum','return_ytd','volatility','sharpe_proxy','dividend_yield'],
      filters: {
        countries: new Set(),   // multi
        sectors:   new Set(),   // multi
        fundTypes: new Set(),   // multi (à partir de fund_type)
        maxTER: null,           // %
        minAUM: null,           // M$
        excludeLeveraged: true
      },
      customFilters: [],        // {metric, operator, value}
      data: [],
      catalogs: { countries: [], sectors: [], fundTypes: [] }
    };

    // --------- Métriques ----------
    const METRICS = {
      ter:              { label:'TER',         unit:'%',  max:false, get: e => num(e.total_expense_ratio) * 100 },
      aum:              { label:'AUM',         unit:'$M', max:true,  get: e => num(e.aum_usd) / 1e6 },
      return_1d:        { label:'Perf 1D',     unit:'%',  max:true,  get: e => num(e.daily_change_pct) },
      return_ytd:       { label:'YTD',         unit:'%',  max:true,  get: e => num(e.ytd_return_pct) },
      return_1y:        { label:'Perf 1Y',     unit:'%',  max:true,  get: e => num(e.one_year_return_pct) },
      volatility:       { label:'Vol 3Y',      unit:'%',  max:false, get: e => num(e.vol_3y_pct) },
      dividend_yield:   { label:'Yield TTM',   unit:'%',  max:true,  get: e => num(e.yield_ttm) * 100 },
      yield_net:        { label:'Yield net',   unit:'%',  max:true,  get: e => classify(e)==='bonds' ? (num(e.yield_ttm)*100 - num(e.total_expense_ratio)*100) : NaN },
      sharpe_proxy:     { label:'R/Vol',       unit:'',   max:true,  get: e => { const r=num(e.one_year_return_pct), v=num(e.vol_3y_pct); return (Number.isFinite(r)&&Number.isFinite(v)&&v>0)? r/v : NaN; } },
    };

    // --------- Debounce ----------
    let tCompute;  const schedule = () => { clearTimeout(tCompute); tCompute = setTimeout(calculate, 120); };

    // --------- Facettes dynamiques (UI) ----------
    function buildFacetCatalogs() {
      const cCount = new Map(), sCount = new Map(), fCount = new Map();
      state.data.forEach(e => {
        (e.__countries||[]).forEach(c => c && cCount.set(c, (cCount.get(c)||0)+1));
        (e.__sectors||[]).forEach(s => s && sCount.set(s, (sCount.get(s)||0)+1));
        const ft = str(e.fund_type).trim(); if (ft) fCount.set(ft, (fCount.get(ft)||0)+1);
      });
      const sortEntries = (m) => [...m.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
      state.catalogs.countries = sortEntries(cCount);
      state.catalogs.sectors   = sortEntries(sCount);
      state.catalogs.fundTypes = sortEntries(fCount);
    }

    function populateFacetUI() {
      const zone = document.querySelector('#etf-mc-section fieldset:last-of-type');
      const countriesEl = document.getElementById('etf-filter-countries');
      const sectorsEl   = document.getElementById('etf-filter-sectors');
      const fundEl      = document.getElementById('etf-filter-fundtype');
      if (!zone || !countriesEl || !sectorsEl || !fundEl) return;

      const makeChips = (arr, idPrefix) =>
        arr.map(v => `<label class="mc-pill"><input type="checkbox" data-facet="${idPrefix}" value="${v}"> ${v}</label>`).join('');

      countriesEl.innerHTML = makeChips(state.catalogs.countries, 'country');
      sectorsEl.innerHTML   = makeChips(state.catalogs.sectors,   'sector');
      fundEl.innerHTML      = makeChips(state.catalogs.fundTypes, 'fund');

      zone.querySelectorAll('input[data-facet]').forEach(inp=>{
        const setFor = inp.dataset.facet==='country' ? state.filters.countries
                    : inp.dataset.facet==='sector'  ? state.filters.sectors
                    : state.filters.fundTypes;
        inp.addEventListener('change', e=>{
          const v = e.target.value;
          if (e.target.checked) setFor.add(v); else setFor.delete(v);
          // style
          e.target.closest('.mc-pill')?.classList.toggle('is-checked', e.target.checked);
          schedule();
        });
      });
    }

    // --------- Filtres personnalisés ----------
    const DEC = 1, POW = 10 ** DEC;
    const q = v => Math.round(v * POW) / POW;

    function setupCustomFiltersUI() {
      const metricSel = document.getElementById('etf-filter-metric');
      const opSel     = document.getElementById('etf-filter-operator');
      const valInp    = document.getElementById('etf-filter-value');
      const unitSpan  = document.getElementById('etf-filter-unit');
      const addBtn    = document.getElementById('etf-add-filter');
      const listBox   = document.getElementById('etf-custom-filters-list');
      if (!metricSel || !opSel || !valInp || !unitSpan || !addBtn || !listBox) return;

      // MAJ du label d'unité selon la métrique
      const updateUnit = () => {
        const def = METRICS[metricSel.value];
        unitSpan.textContent = def ? def.unit || '' : '';
      };
      updateUnit();
      metricSel.addEventListener('change', updateUnit);

      addBtn.addEventListener('click', () => {
        const m = metricSel.value, op = opSel.value, val = parseFloat(valInp.value);
        if (!METRICS[m] || !isFinite(val)) return;
        state.customFilters.push({ metric:m, operator:op, value:val });
        valInp.value = '';
        renderCustomFilters();
        schedule();
      });

      function colorFor(op, isMax) {
        if (op==='>='||op==='>') return isMax ? 'text-green-400' : 'text-cyan-400';
        if (op==='<=||<' ) return isMax ? 'text-red-400'   : 'text-green-400';
        return 'text-yellow-400';
      }

      function removeAt(i) {
        state.customFilters.splice(i,1);
        renderCustomFilters(); schedule();
      }

      function renderCustomFilters() {
        if (!state.customFilters.length) {
          listBox.innerHTML = '<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';
          return;
        }
        listBox.innerHTML = state.customFilters.map((f, i)=>{
          const d = METRICS[f.metric], col =
            (f.operator==='>='||f.operator==='>') ? (d.max?'text-green-400':'text-cyan-400') :
            (f.operator==='<='||f.operator==='<') ? (d.max?'text-red-400':'text-green-400') : 'text-yellow-400';
          const unit = d.unit||'';
          return `
            <div class="filter-item flex items-center gap-2 p-2 rounded">
              <span class="flex-1">${d.label} <span class="${col} font-semibold">${f.operator} ${q(f.value)}${unit}</span></span>
              <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-i="${i}"><i class="fas fa-times"></i></button>
            </div>`;
        }).join('');
        listBox.querySelectorAll('.remove-filter').forEach(b=>{
          b.addEventListener('click', e=> removeAt(parseInt(e.currentTarget.dataset.i)));
        });
      }

      renderCustomFilters();
    }

    function passCustomFilters(arr) {
      if (!state.customFilters.length) return arr;
      return arr.filter(e => {
        for (const f of state.customFilters) {
          const d = METRICS[f.metric]; if (!d) return false;
          const raw = d.get(e); if (!Number.isFinite(raw)) return false;
          const v = q(raw), x = q(f.value);
          let ok = true;
          switch(f.operator){
            case '>=': ok = v >= x; break;
            case '>':  ok = v >  x; break;
            case '=':  ok = v === x; break;
            case '<':  ok = v <  x; break;
            case '<=': ok = v <= x; break;
            case '!=': ok = v !== x; break;
          }
          if (!ok) return false;
        }
        return true;
      });
    }

    // --------- Calcul principal ----------
    function calculate() {
      // enrichir data
      const raw = window.ETFData.getData() || [];
      state.data = raw.map(e => {
        // pays/secteurs multiples depuis *top5*
        const cs5 = parseMaybeJSON(e.country_top5).map(o=>str(o.c)).filter(Boolean);
        const ss5 = parseMaybeJSON(e.sector_top5 ).map(o=>str(o.s)).filter(Boolean);
        const countries = cs5.length ? cs5 : [str(e.country_top)].filter(Boolean);
        const sectors   = ss5.length ? ss5 : [str(e.sector_top)].filter(Boolean);
        return { ...e, __kind: classify(e), __lev: isLev(e), __countries: [...new Set(countries)], __sectors: [...new Set(sectors)] };
      });

      const summary = document.getElementById('etf-mc-summary');
      if (!state.data.length) {
        results.innerHTML = '<div class="text-center text-gray-400 py-4">Chargement des données…</div>';
        if (summary) summary.textContent = 'Chargement…';
        return;
      }

      // facettes (une fois)
      if (!state.catalogs.countries.length) { buildFacetCatalogs(); populateFacetUI(); setupCustomFiltersUI(); }

      // Filtres
      let arr = state.data.slice();

      // Multi-facettes
      const hasCountries = state.filters.countries.size>0;
      const hasSectors   = state.filters.sectors.size>0;
      const hasFunds     = state.filters.fundTypes.size>0;

      if (hasCountries) {
        arr = arr.filter(e => e.__countries.some(c => state.filters.countries.has(c)));
      }
      if (hasSectors) {
        arr = arr.filter(e => e.__sectors.some(s => state.filters.sectors.has(s)));
      }
      if (hasFunds) {
        arr = arr.filter(e => state.filters.fundTypes.has(str(e.fund_type).trim()));
      }

      if (state.filters.excludeLeveraged) {
        arr = arr.filter(e => !e.__lev);
      }
      if (state.filters.maxTER != null) {
        arr = arr.filter(e => {
          const v = METRICS.ter.get(e);
          return Number.isFinite(v) && v <= state.filters.maxTER;
        });
      }
      if (state.filters.minAUM != null) {
        arr = arr.filter(e => {
          const v = METRICS.aum.get(e);
          return Number.isFinite(v) && v >= state.filters.minAUM;
        });
      }

      // Filtres personnalisés
      arr = passCustomFilters(arr);

      if (!arr.length) {
        render([]);
        updateSummary(0, state.data.length);
        return;
      }

      // Ranges pour normalisation
      const sel = state.selectedMetrics.filter(m => METRICS[m]);
      const ranges = {};
      sel.forEach(m => {
        const vals = arr.map(e => METRICS[m].get(e)).filter(Number.isFinite);
        ranges[m] = vals.length ? {min: Math.min(...vals), max: Math.max(...vals)} : {min:0,max:0};
      });

      // Modes
      let out;
      if (state.mode === 'balanced') {
        const scores = arr.map(etf => {
          let s=0,k=0;
          sel.forEach(m=>{
            const v=METRICS[m].get(etf);
            if(!Number.isFinite(v)) return;
            const {min,max}=ranges[m];
            let z=(max===min)?0.5:(v-min)/(max-min);
            if(!METRICS[m].max) z=1-z;
            s+=z; k++;
          });
          return { etf, score: k? (s/k) : 0 };
        });
        scores.sort((a,b)=>b.score-a.score);
        out = scores.slice(0,10);
      } else {
        const N = arr.length, ranks={};
        sel.forEach(m=>{
          const tmp = arr.map((e,i)=>({i,v:METRICS[m].get(e)})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);
          const pct = new Array(N).fill(NaN);
          tmp.forEach((x,idx)=>{ pct[x.i]=(idx+0.5)/tmp.length; });
          ranks[m]=pct;
        });
        const idx = arr.map((_,i)=>i).sort((ia,ib)=>{
          for(const m of sel){
            let pa=ranks[m][ia], pb=ranks[m][ib];
            if(!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
            if(!Number.isFinite(pa)) return 1;
            if(!Number.isFinite(pb)) return -1;
            if(!METRICS[m].max){ pa=1-pa; pb=1-pb; }
            const d=pa-pb;
            if(Math.abs(d)>0.01) return d>0?-1:1;
          }
          return 0;
        });
        out = idx.slice(0,10).map(i=>({ etf: arr[i], score: NaN }));
      }

      render(out);
      updateSummary(arr.length, state.data.length);
    }

    // --------- Rendu ----------
    function render(entries) {
      results.innerHTML = '';
      results.className = 'stock-cards-container';

      if (!entries.length) {
        results.innerHTML = '<div class="text-center text-cyan-400 py-4 col-span-full">Aucun ETF ne correspond aux critères</div>';
        return;
      }

      entries.forEach((entry, i) => {
        const e = entry.etf;

        const topSector  = str(e.sector_top);
        const topSWeight = Number(e.sector_top_weight);
        const topCountry = str(e.country_top);
        const topCWeight = Number(e.country_top_weight);
        const cur = CURRENCY_SYMBOL[str(e.currency).toUpperCase()] || str(e.currency) || '$';

        const metricValues = state.selectedMetrics.map(m => {
          const def = METRICS[m]; if (!def) return '';
          const raw = def.get(e); if (!Number.isFinite(raw)) return '';
          let val;
          if (m==='aum') {
            const M=raw; val = (M>=1000)? (M/1000).toFixed(1)+'B$' : Math.round(M)+'M$';
          } else if (def.unit==='%') {
            val = fmt(raw, 2)+'%';
          } else {
            val = fmt(raw, 2);
          }
          let cls='text-green-400';
          if (m==='ter')         cls = raw<0.2?'text-green-500':raw<0.4?'text-green-400':raw<0.7?'text-yellow-400':'text-red-400';
          else if (m==='volatility') cls = raw<10?'text-green-500':raw<20?'text-green-400':raw<30?'text-yellow-400':'text-red-400';
          else if (m==='sharpe_proxy') cls = raw>2?'text-green-500':raw>1?'text-green-400':raw>0?'text-yellow-400':'text-red-400';
          else cls = raw>=0 ? 'text-green-400' : 'text-red-400';

          return `
            <div class="text-right">
              <div class="text-xs opacity-60">${def.label}</div>
              <div class="${cls} font-semibold">${val}</div>
            </div>`;
        }).join('');

        const typeBadge =
          classify(e)==='bonds'     ? '<span class="ter-badge">Obligations</span>' :
          classify(e)==='commodity' ? '<span class="aum-badge" style="background: rgba(255,193,7,.2); color:#FFC107;">Matières</span>' :
                                      '<span class="aum-badge">Actions</span>';
        const levBadge = e.__lev ? '<span class="text-xs px-2 py-1 bg-red-900 text-red-300 rounded">LEV/INV</span>' : '';

        const nameLine = str(e.symbol) || '—';
        const subLine  = (topSector ? `${topSector}${Number.isFinite(topSWeight)?' '+fmt(topSWeight,0)+'%':''}` : '')
                       + (topSector && topCountry ? ' • ' : '')
                       + (topCountry ? `${topCountry}${Number.isFinite(topCWeight)?' '+fmt(topCWeight,0)+'%':''}` : '');
        const desc = trunc(str(e.objective), 160);

        const last = Number(e.last_close);
        const lastHtml = Number.isFinite(last)
          ? `<div class="text-xs opacity-60 mt-1">Dernier: <strong>${cur} ${fmt(last,2)}</strong>${e.as_of ? ` • <span class="opacity-60">${str(e.as_of).split('T')[0]}</span>`:''}</div>`
          : '';

        const card = document.createElement('div');
        card.className = 'stock-card glassmorphism rounded-lg p-4';
        card.innerHTML = `
          <div class="rank">#${i+1}</div>
          <div class="stock-info">
            <div class="stock-name">${nameLine} ${typeBadge} ${levBadge}</div>
            <div class="stock-fullname" title="${desc.replace(/"/g,'&quot;')}">${desc || '&nbsp;'}</div>
            <div class="text-xs opacity-40">
              ${str(e.isin)}${e.isin? ' • ':''}${str(e.mic_code)}${e.mic_code?' • ':''}${str(e.currency)}
            </div>
            ${subLine ? `<div class="text-xs opacity-60 mt-1">${subLine}</div>` : ''}
            ${lastHtml}
          </div>
          <div class="stock-performance">
            <div class="flex gap-3">${metricValues}</div>
          </div>
        `;
        results.appendChild(card);
      });
    }

    // --------- Résumé ----------
    function updateSummary(filtered, total) {
      const summary = document.getElementById('etf-mc-summary');
      if (!summary) return;

      const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités';
      const metrics = state.selectedMetrics.map(m => METRICS[m]?.label).filter(Boolean).join(' · ');

      const tags = [];
      if (state.filters.countries.size) tags.push(`Pays(${state.filters.countries.size})`);
      if (state.filters.sectors.size)   tags.push(`Secteurs(${state.filters.sectors.size})`);
      if (state.filters.fundTypes.size) tags.push(`Fund type(${state.filters.fundTypes.size})`);
      if (state.filters.maxTER!=null)   tags.push(`TER≤${state.filters.maxTER}%`);
      if (state.filters.minAUM!=null)   tags.push(`AUM≥${state.filters.minAUM}M$`);
      if (state.filters.excludeLeveraged) tags.push('No Lev/Inv');

      summary.innerHTML = `<strong>${mode}</strong> • ${metrics}${tags.length? ' • '+tags.join(' '): ''} • ${filtered}/${total} ETFs`;
    }

    // --------- Écouteurs (réactifs) ----------
    // checkboxes métriques
    Object.keys(METRICS).forEach(metric => {
      const cb = document.getElementById(`etf-m-${metric}`);
      if (!cb) return;
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!state.selectedMetrics.includes(metric)) state.selectedMetrics.push(metric);
        } else {
          state.selectedMetrics = state.selectedMetrics.filter(m => m!==metric);
        }
        cb.closest('.mc-pill')?.classList.toggle('is-checked', cb.checked);
        schedule();
      });
    });

    // mode radios
    document.querySelectorAll('input[name="etf-mc-mode"]').forEach(r => {
      r.addEventListener('change', () => { state.mode = r.value; schedule(); });
    });

    // filtres simples
    document.getElementById('etf-filter-ter')?.addEventListener('input', (e)=>{ state.filters.maxTER = e.target.value ? parseFloat(e.target.value) : null; });
    document.getElementById('etf-filter-aum')?.addEventListener('input', (e)=>{ state.filters.minAUM = e.target.value ? parseFloat(e.target.value) : null; });
    document.getElementById('etf-filter-leveraged')?.addEventListener('change', (e)=>{ state.filters.excludeLeveraged = !!e.target.checked; schedule(); });

    // boutons
    document.getElementById('etf-mc-apply')?.addEventListener('click', ()=> calculate());
    document.getElementById('etf-mc-reset')?.addEventListener('click', ()=>{
      state.mode = 'balanced';
      state.selectedMetrics = ['ter','aum','return_ytd','volatility','sharpe_proxy','dividend_yield'];
      state.filters = { countries:new Set(), sectors:new Set(), fundTypes:new Set(), maxTER:null, minAUM:null, excludeLeveraged:true };
      state.customFilters = [];

      // reset UI
      Object.keys(METRICS).forEach(m=>{
        const cb = document.getElementById(`etf-m-${m}`);
        if (cb) { cb.checked = state.selectedMetrics.includes(m); cb.closest('.mc-pill')?.classList.toggle('is-checked', cb.checked); }
      });
      ['etf-filter-aum','etf-filter-ter'].forEach(id=>{ const el=document.getElementById(id); if (el) el.value=''; });
      const l = document.getElementById('etf-filter-leveraged'); if (l) l.checked = true;

      // désélection facettes
      document.querySelectorAll('#etf-filter-countries input[type="checkbox"], #etf-filter-sectors input[type="checkbox"], #etf-filter-fundtype input[type="checkbox"]').forEach(inp=>{
        inp.checked=false; inp.closest('.mc-pill')?.classList.remove('is-checked');
      });

      // clear custom filters list
      const listBox = document.getElementById('etf-custom-filters-list');
      if (listBox) listBox.innerHTML = '<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';

      calculate();
    });

    // Expose API
    window.ETF_MC = { calculate, state, METRICS };

    // Initial
    setTimeout(() => { if ((window.ETFData.getData() || []).length > 0) calculate(); }, 300);
  }
})();