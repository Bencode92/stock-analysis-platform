// Module MC adapté pour ETFs - v3.2 (mapping CSV réel + UX réactive + robustesse)
(function () {
  // --- Attente de l'API de données -------------------------------------------------
  function waitFor(cond, cb, tries = 40) {
    if (cond()) return void cb();
    if (tries <= 0) return console.error('❌ ETF MC v3.2: Données introuvables.');
    setTimeout(() => waitFor(cond, cb, tries - 1), 250);
  }

  waitFor(
    () => !!window.ETFData && typeof window.ETFData.getData === 'function',
    init
  );

  function init() {
    const root    = document.querySelector('#etf-mc-section');
    const results = document.querySelector('#etf-mc-results .stock-cards-container');
    if (!root || !results) {
      console.error('❌ ETF MC v3.2: DOM manquant', {root, results});
      return;
    }

    console.log('✅ ETF MC v3.2: Module initialisé');

    // --------- Helpers ----------
    const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF' };
    const fmt = (n, d=2) => Number.isFinite(+n) ? (+n).toFixed(d) : '—';
    const pct = (x) => Number.isFinite(+x) ? +x : NaN;
    const safeStr = (s) => (s==null ? '' : String(s));
    const trunc = (s, n=120) => (s && s.length>n) ? (s.slice(0,n-1)+'…') : s || '';
    const parseMaybeJSON = (s) => {
      try { return typeof s === 'string' ? JSON.parse(s) : (Array.isArray(s) ? s : []); }
      catch { return []; }
    };
    const classify = (e) => {
      const ft = safeStr(e.fund_type).toLowerCase();
      if (/(bond|government|fixed income|core|short|intermediate|maturity)/i.test(ft)) return 'bonds';
      if (/(commodit|precious|gold|silver|oil)/i.test(ft)) return 'commodity';
      return 'equity';
    };
    const isLev = (e) => {
      const t = safeStr(e.etf_type).toLowerCase();
      const lev = Number(e.leverage);
      return /leveraged|inverse/.test(t) || (Number.isFinite(lev) && lev !== 0);
    };

    // --------- État ----------
    const state = {
      mode: 'balanced',
      selectedMetrics: ['ter','aum','return_ytd','volatility','sharpe_proxy'],
      filters: {
        type: 'all',              // all | equity | bonds | commodity
        maxTER: null,             // %
        minAUM: null,             // M$ (aum_usd / 1e6)
        minQuality: 80,           // 0..100
        excludeLeveraged: true    // masqué par défaut
      },
      data: []
    };

    // --------- Métriques (mapping exact de ton CSV) ----------
    const METRICS = {
      ter: {
        label:'TER', unit:'%', max:false,
        get: e => pct(e.total_expense_ratio) * 100
      },
      aum: {
        label:'AUM', unit:'$M', max:true,
        get: e => pct(e.aum_usd) / 1e6
      },
      return_1d: {
        label:'Perf 1D', unit:'%', max:true,
        get: e => pct(e.daily_change_pct)
      },
      return_ytd: {
        label:'YTD', unit:'%', max:true,
        get: e => pct(e.ytd_return_pct)
      },
      return_1y: {
        label:'Perf 1Y', unit:'%', max:true,
        get: e => pct(e.one_year_return_pct)
      },
      volatility: {
        label:'Vol 3Y', unit:'%', max:false,
        get: e => pct(e.vol_3y_pct)
      },
      dividend_yield: {
        label:'Yield TTM', unit:'%', max:true,
        get: e => pct(e.yield_ttm) * 100
      },
      // dérivées
      yield_net: {
        label:'Yield net', unit:'%', max:true,
        get: e => classify(e)==='bonds'
          ? (pct(e.yield_ttm)*100 - pct(e.total_expense_ratio)*100)
          : NaN
      },
      sharpe_proxy: {
        label:'R/Vol', unit:'', max:true,
        get: e => {
          const r = pct(e.one_year_return_pct);
          const v = pct(e.vol_3y_pct);
          return (Number.isFinite(r) && Number.isFinite(v) && v>0) ? r / v : NaN;
        }
      },
      quality: {
        label:'Qualité', unit:'', max:true,
        get: e => pct(e.data_quality_score)
      }
    };

    // --------- Compute (debounce) ----------
    let tCompute;
    const schedule = () => { clearTimeout(tCompute); tCompute = setTimeout(calculate, 120); };

    // --------- Calcul ----------
    function calculate() {
      // (re)charger la data
      const raw = window.ETFData.getData() || [];
      state.data = raw.map(e => ({
        ...e,
        __kind: classify(e),
        __lev:  isLev(e)
      }));

      const summary = document.getElementById('etf-mc-summary');

      if (!state.data.length) {
        results.innerHTML = '<div class="text-center text-gray-400 py-4">Chargement des données…</div>';
        if (summary) summary.textContent = 'Chargement…';
        return;
      }

      // Filtres
      let arr = state.data.slice();

      if (state.filters.type !== 'all') {
        arr = arr.filter(e => e.__kind === state.filters.type);
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
      if (state.filters.minQuality != null) {
        arr = arr.filter(e => {
          const v = METRICS.quality.get(e);
          return !Number.isFinite(v) || v >= state.filters.minQuality;
        });
      }

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
          let s = 0, k = 0;
          sel.forEach(m => {
            const v = METRICS[m].get(etf);
            if (!Number.isFinite(v)) return;
            const {min,max} = ranges[m];
            let z = (max===min) ? 0.5 : (v-min)/(max-min);
            if (!METRICS[m].max) z = 1 - z;
            s += z; k++;
          });
          return { etf, score: k? (s/k) : 0 };
        });
        scores.sort((a,b)=>b.score-a.score);
        out = scores.slice(0,10);
      } else {
        // lexicographique percentiles (tolérance 1pp)
        const N = arr.length;
        const ranks = {};
        sel.forEach(m => {
          const tmp = arr.map((e,i)=>({i, v: METRICS[m].get(e)}))
                         .filter(x=>Number.isFinite(x.v))
                         .sort((a,b)=>a.v-b.v);
          const pct = new Array(N).fill(NaN);
          tmp.forEach((x,idx)=>{ pct[x.i] = (idx+0.5)/tmp.length; });
          ranks[m] = pct;
        });
        const idx = arr.map((_,i)=>i).sort((ia,ib)=>{
          for (const m of sel) {
            let pa = ranks[m][ia], pb = ranks[m][ib];
            if (!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
            if (!Number.isFinite(pa)) return 1;
            if (!Number.isFinite(pb)) return -1;
            if (!METRICS[m].max) { pa = 1-pa; pb = 1-pb; }
            const d = pa - pb;
            if (Math.abs(d) > 0.01) return d>0 ? -1 : 1;
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

        // Sector/Country badges (à partir des colonnes simples)
        const topSector  = safeStr(e.sector_top);
        const topSWeight = Number(e.sector_top_weight);
        const topCountry = safeStr(e.country_top);
        const topCWeight = Number(e.country_top_weight);

        // Currency et AUM formatés
        const cur = CURRENCY_SYMBOL[safeStr(e.currency).toUpperCase()] || safeStr(e.currency) || '$';

        const metricValues = state.selectedMetrics.map(m => {
          const def = METRICS[m]; if (!def) return '';
          const raw = def.get(e); if (!Number.isFinite(raw)) return '';
          let val;
          if (m==='aum') {
            const M = raw; // M$
            val = (M>=1000) ? (M/1000).toFixed(1)+'B$' : Math.round(M)+'M$';
          } else if (def.unit==='%') {
            val = fmt(raw, 2)+'%';
          } else {
            val = fmt(raw, 2);
          }

          // Couleurs cohérentes par métrique
          let cls = 'text-green-400';
          if (m==='ter') {
            cls = raw<0.2? 'text-green-500' : raw<0.4? 'text-green-400' : raw<0.7? 'text-yellow-400':'text-red-400';
          } else if (m==='volatility') {
            cls = raw<10? 'text-green-500' : raw<20? 'text-green-400' : raw<30? 'text-yellow-400':'text-red-400';
          } else if (m==='sharpe_proxy') {
            cls = raw>2? 'text-green-500' : raw>1? 'text-green-400' : raw>0? 'text-yellow-400':'text-red-400';
          } else if (m==='quality') {
            cls = raw>=95? 'text-green-500' : raw>=90? 'text-green-400' : raw>=80? 'text-yellow-400':'text-red-400';
          } else {
            cls = raw>=0 ? 'text-green-400' : 'text-red-400';
          }

          return `
            <div class="text-right">
              <div class="text-xs opacity-60">${def.label}</div>
              <div class="${cls} font-semibold">${val}</div>
            </div>
          `;
        }).join('');

        // Type badge + lev
        const typeBadge =
          e.__kind==='bonds'     ? '<span class="ter-badge">Obligations</span>' :
          e.__kind==='commodity' ? '<span class="aum-badge" style="background: rgba(255,193,7,.2); color:#FFC107;">Matières</span>' :
                                   '<span class="aum-badge">Actions</span>';
        const levBadge = e.__lev ? '<span class="text-xs px-2 py-1 bg-red-900 text-red-300 rounded">LEV/INV</span>' : '';

        const nameLine = safeStr(e.symbol) || '—';
        const subLine  = (topSector ? `${topSector}${Number.isFinite(topSWeight)?' '+fmt(topSWeight,0)+'%':''}` : '')
                       + (topSector && topCountry ? ' • ' : '')
                       + (topCountry ? `${topCountry}${Number.isFinite(topCWeight)?' '+fmt(topCWeight,0)+'%':''}` : '');

        const desc = trunc(safeStr(e.objective), 160);

        const scoreHtml = Number.isFinite(entry.score)
          ? `<div class="mc-score-badge text-cyan-400">${(entry.score*100|0)}%</div>`
          : '';

        const last = Number(e.last_close);
        const lastHtml = Number.isFinite(last)
          ? `<div class="text-xs opacity-60 mt-1">Dernier: <strong>${cur} ${fmt(last,2)}</strong>${e.as_of ? ` • <span class="opacity-60">${safeStr(e.as_of).split('T')[0]}</span>`:''}</div>`
          : '';

        const card = document.createElement('div');
        card.className = 'stock-card glassmorphism rounded-lg p-4';
        card.innerHTML = `
          <div class="rank">#${i+1}</div>
          <div class="stock-info">
            <div class="stock-name">${nameLine} ${typeBadge} ${levBadge}</div>
            <div class="stock-fullname" title="${desc.replace(/"/g,'&quot;')}">${desc || '&nbsp;'}</div>
            <div class="text-xs opacity-40">
              ${safeStr(e.isin)}${e.isin? ' • ':''}${safeStr(e.mic_code)}${e.mic_code?' • ':''}${safeStr(e.currency)}
            </div>
            ${subLine ? `<div class="text-xs opacity-60 mt-1">${subLine}</div>` : ''}
            ${lastHtml}
          </div>
          <div class="stock-performance">
            <div class="flex gap-3">${metricValues}</div>
            ${scoreHtml}
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
      const metrics = state.selectedMetrics
        .map(m => METRICS[m]?.label).filter(Boolean).join(' · ');

      const tags = [];
      if (state.filters.type!=='all')      tags.push(state.filters.type);
      if (state.filters.maxTER!=null)      tags.push(`TER≤${state.filters.maxTER}%`);
      if (state.filters.minAUM!=null)      tags.push(`AUM≥${state.filters.minAUM}M$`);
      if (state.filters.minQuality!=null)  tags.push(`Qual≥${state.filters.minQuality}`);
      if (state.filters.excludeLeveraged)  tags.push('No Lev/Inv');

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
        // sync pill UI
        const pill = cb.closest('.mc-pill'); if (pill) pill.classList.toggle('is-checked', cb.checked);
        schedule();
      });
    });

    // mode radios
    document.querySelectorAll('input[name="etf-mc-mode"]').forEach(r => {
      r.addEventListener('change', () => { state.mode = r.value; schedule(); });
    });

    // filtres simples
    document.getElementById('etf-filter-type')?.addEventListener('change', (e)=>{ state.filters.type = e.target.value; schedule(); });
    document.getElementById('etf-filter-ter')?.addEventListener('input', (e)=>{ state.filters.maxTER = e.target.value ? parseFloat(e.target.value) : null; });
    document.getElementById('etf-filter-aum')?.addEventListener('input', (e)=>{ state.filters.minAUM = e.target.value ? parseFloat(e.target.value) : null; });

    // toggle leveraged
    document.getElementById('etf-filter-leveraged')?.addEventListener('change', (e)=>{ state.filters.excludeLeveraged = !!e.target.checked; schedule(); });

    // slider qualité (ajouté par le script d'intégration)
    document.getElementById('etf-filter-quality')?.addEventListener('input', (e)=>{
      state.filters.minQuality = parseInt(e.target.value,10);
      document.getElementById('quality-value')?.replaceChildren(String(state.filters.minQuality));
    });

    // boutons
    document.getElementById('etf-mc-apply')?.addEventListener('click', ()=> calculate());
    document.getElementById('etf-mc-reset')?.addEventListener('click', ()=>{
      state.mode = 'balanced';
      state.selectedMetrics = ['ter','aum','return_ytd','volatility','sharpe_proxy'];
      state.filters = { type:'all', maxTER:null, minAUM:null, minQuality:80, excludeLeveraged:true };

      // reset UI
      Object.keys(METRICS).forEach(m=>{
        const cb = document.getElementById(`etf-m-${m}`);
        if (cb) {
          cb.checked = state.selectedMetrics.includes(m);
          cb.closest('.mc-pill')?.classList.toggle('is-checked', cb.checked);
        }
      });
      const t = document.getElementById('etf-filter-type'); if (t) t.value = 'all';
      const a = document.getElementById('etf-filter-aum');  if (a) a.value = '';
      const te= document.getElementById('etf-filter-ter');  if (te) te.value = '';
      const q = document.getElementById('etf-filter-quality'); if (q) q.value = '80', document.getElementById('quality-value')?.replaceChildren('80');
      const l = document.getElementById('etf-filter-leveraged'); if (l) l.checked = true;
      const b = document.querySelector('input[name="etf-mc-mode"][value="balanced"]'); if (b) b.checked = true;

      calculate();
    });

    // Expose API
    window.ETF_MC = { calculate, state, METRICS };

    // Initial — calcul quand les données sont prêtes
    setTimeout(() => {
      if ((window.ETFData.getData() || []).length > 0) calculate();
    }, 300);
  }
})();