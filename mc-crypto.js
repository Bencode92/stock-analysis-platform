// mc-crypto.js — Composer multi-critères (Crypto) minimal, basé sur le CSV
// Source: data/filtered/Crypto_filtered_volatility.csv

(function () {
  const CSV_URL = 'data/filtered/Crypto_filtered_volatility.csv';

  // === Mapping des métriques disponibles ===
  const METRICS = {
    ret_1d:  {label:'Perf 24h',     col:'ret_1d_pct',        unit:'%', max:true},
    ret_7d:  {label:'Perf 7j',      col:'ret_7d_pct',        unit:'%', max:true},
    ret_30d: {label:'Perf 30j',     col:'ret_30d_pct',       unit:'%', max:true},
    ret_90d: {label:'Perf 90j',     col:'ret_90d_pct',       unit:'%', max:true},
    ret_1y:  {label:'Perf 1 an',    col:'ret_1y_pct',        unit:'%', max:true},
    vol_7d:  {label:'Vol 7j (ann.)',col:'vol_7d_annual_pct', unit:'%', max:false},
    vol_30d: {label:'Vol 30j (ann.)',col:'vol_30d_annual_pct',unit:'%', max:false},
    atr14:   {label:'ATR14%',       col:'atr14_pct',         unit:'%', max:false},
    dd90:    {label:'Drawdown 90j', col:'drawdown_90d_pct',  unit:'%', max:false},
  };

  const state = {
    data: [],                // lignes crypto parsées
    selected: ['ret_1d','ret_90d'],   // critères cochés par défaut
    mode: 'balanced',        // 'balanced' | 'lexico'
    filters: [],             // [{metric,operator,value}]
    quick: { tier1:false, nonstale:true, minpoints:0 },
    cache: {}                // {metric:{raw,rankPct,sorted,iqr}}
  };

  // ---- Utils
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toNum = (x) => {
    if (x == null || x === '') return NaN;
    if (typeof x === 'number') return x;
    const v = parseFloat(String(x).replace(/[%\s]/g,''));
    return Number.isFinite(v) ? v : NaN;
  };
  const fmtPct = (v) => Number.isFinite(v) ? `${v>0?'+':''}${v.toFixed(2)}%` : '–';
  const fmtPrice = (p, quote) => Number.isFinite(p) ? `${(quote||'US Dollar').toLowerCase().includes('euro')?'€':'$'}${p.toLocaleString('fr-FR',{maximumFractionDigits:8})}` : '–';

  // Robust CSV (gère champs quotés)
  function csvParse(text) {
    const rows = [];
    let i=0, field='', row=[], inQ=false;
    const pushField=()=>{ row.push(field); field=''; };
    const pushRow=()=>{ rows.push(row); row=[]; };
    while (i<text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i+1] === '"') { field+='"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') pushField();
        else if (c === '\n') { pushField(); pushRow(); }
        else if (c === '\r') { /* ignore */ }
        else field += c;
      }
      i++;
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    const headers = rows.shift().map(h=>h.trim());
    return rows.filter(r=>r.length===headers.length).map(r=>{
      const o={};
      headers.forEach((h,idx)=>o[h]=r[idx]);
      return o;
    });
  }

  function buildCache() {
    state.cache = {};
    const n = state.data.length;
    Object.entries(METRICS).forEach(([key, m]) => {
      const raw = new Float64Array(n);
      for (let i=0;i<n;i++) raw[i] = toNum(state.data[i][m.col]);
      const valid = Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
      if (!valid.length) {
        state.cache[key] = { raw, rankPct:new Float64Array(n), sorted:new Float64Array(), iqr:1 };
        return;
      }
      // Winsor doux
      const q = (p)=>valid[Math.floor(p*(valid.length-1))];
      const lo=q(0.005), hi=q(0.995);
      for (let i=0;i<n;i++) if (Number.isFinite(raw[i])) raw[i]=Math.min(hi,Math.max(lo,raw[i]));
      const sorted = Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
      const qW=(p)=>sorted[Math.floor(p*(sorted.length-1))];
      const iqr = Math.max(1e-9, qW(0.75)-qW(0.25));
      // Rang Hazen
      const idx = Array.from({length:n}, (_,i)=>i).filter(i=>Number.isFinite(raw[i])).sort((i,j)=>raw[i]-raw[j]);
      const rankPct = new Float64Array(n);
      let k=0;
      while (k<idx.length) {
        let j=k+1; while (j<idx.length && Math.abs(raw[idx[j]]-raw[idx[k]])<1e-12) j++;
        const r=(k+j-1)/2, haz=(r+0.5)/idx.length;
        for (let t=k;t<j;t++) rankPct[idx[t]] = haz;
        k=j;
      }
      state.cache[key] = { raw, rankPct, sorted: Float64Array.from(sorted), iqr };
    });
  }

  // Quick masks
  function passQuickFilters(row) {
    // Note: tier1_listed et stale ne sont pas dans le CSV, donc on ignore ces filtres
    // On garde seulement data_points si c'est disponible
    const pts = parseInt(row.data_points||'0',10);
    if (!isNaN(pts) && pts < (state.quick.minpoints||0)) return false;
    return true;
  }

  // Custom filters
  function passCustomFilters(i) {
    const q =  (v)=>Math.round(v*10)/10;
    for (const f of state.filters) {
      const m = METRICS[f.metric], raw = state.cache[f.metric]?.raw[i];
      if (!Number.isFinite(raw)) return false;
      const v = q(raw), x = q(f.value);
      if (f.operator === '>=' && !(v>=x)) return false;
      if (f.operator === '>'  && !(v> x)) return false;
      if (f.operator === '='  && !(v===x))return false;
      if (f.operator === '<'  && !(v< x)) return false;
      if (f.operator === '<=' && !(v<=x)) return false;
      if (f.operator === '!=' && !(v!==x))return false;
    }
    return true;
  }

  // Ranking
  function poolIndices() {
    const kept = [];
    for (let i=0;i<state.data.length;i++) {
      if (!passQuickFilters(state.data[i])) continue;
      if (!passCustomFilters(i)) continue;
      // au moins 1 métrique sélectionnée valide
      if (!state.selected.some(m => Number.isFinite(state.cache[m]?.raw[i]))) continue;
      kept.push(i);
    }
    return kept;
  }

  function scoreBalanced(indices) {
    const out=[];
    for (const i of indices) {
      let s=0,k=0;
      for (const m of state.selected) {
        let p = state.cache[m].rankPct[i];
        if (!Number.isFinite(p)) continue;
        if (!METRICS[m].max) p = 1 - p; // minimiser => inverser
        s+=p; k++;
      }
      if (k>0) out.push({i, score:s/k});
    }
    out.sort((a,b)=>b.score-a.score);
    return out.slice(0,10).map(e=>e.i);
  }

  function cmpLexico(a,b) {
    for (const m of state.selected) {
      let pa = state.cache[m].rankPct[a];
      let pb = state.cache[m].rankPct[b];
      if (!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
      if (!Number.isFinite(pa)) return 1;
      if (!Number.isFinite(pb)) return -1;
      if (!METRICS[m].max) { pa = 1-pa; pb = 1-pb; }
      if (pa !== pb) return pb - pa;
    }
    // tie-break: perf 24h puis ticker
    const ta = state.data[a].token, tb = state.data[b].token;
    return String(ta).localeCompare(String(tb));
  }

  function scoreLexico(indices) {
    const arr = indices.slice().sort(cmpLexico);
    return arr.slice(0,10);
  }

  // Render
  function render(indices) {
    const wrap = $('#crypto-mc-results').querySelector('.stock-cards-container');
    if (!wrap) return;
    wrap.innerHTML='';
    if (!indices.length) {
      wrap.innerHTML = `<div class="text-center text-cyan-400 py-4"><i class="fas fa-filter mr-2"></i>Aucune crypto ne passe les filtres</div>`;
      return;
    }
    indices.forEach((i,rank)=>{
      const r = state.data[i];
      const price = fmtPrice(toNum(r.last_close), r.currency_quote);
      // colonnes à droite = critères cochés
      const cols = state.selected.map(m=>{
        const raw = state.cache[m]?.raw[i];
        if (!Number.isFinite(raw)) return '';
        const isMax = METRICS[m].max;
        const val = fmtPct(raw);
        const cls = !isMax ? (raw<20?'text-green-400':raw>40?'text-red-400':'text-yellow-400')
                           : (raw>=0?'text-green-400':'text-red-400');
        return `<div class="text-right"><div class="text-xs opacity-60">${METRICS[m].label}</div><div class="${cls} font-semibold">${val}</div></div>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4';
      card.innerHTML = `
        <div class="rank text-2xl font-bold">#${rank+1}</div>
        <div class="flex-1">
          <div class="font-semibold">${esc(r.token || r.symbol || '-')}</div>
          <div class="text-xs opacity-60">${esc(r.currency_base||'-')}</div>
          <div class="text-xs opacity-40">${price}</div>
        </div>
        <div class="flex gap-4">${cols}</div>
      `;
      wrap.appendChild(card);
    });
  }

  // Summary
  function setSummary(total, kept){
    const el = $('#crypto-mc-summary');
    if (!el) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités';
    const labels = state.selected.map(m=>METRICS[m].label).join(' · ') || 'Aucun critère';
    const visFilters = state.filters.length;
    el.innerHTML = `<strong>${mode}</strong> • ${labels} • ${visFilters} filtres • ${kept}/${total} cryptos`;
  }

  // UI wiring
  function wireUI() {
    // checkboxes métriques
    Object.keys(METRICS).forEach(id=>{
      const cb = $(`m-${id}`);
      if (!cb) return;
      cb.checked = state.selected.includes(id);
      cb.addEventListener('change',()=>{
        if (cb.checked) { if (!state.selected.includes(id)) state.selected.push(id); }
        else            { state.selected = state.selected.filter(x=>x!==id); }
        refresh(false);
        updatePriorityList();
      });
    });

    // mode
    document.querySelectorAll('input[name="mc-mode"]').forEach(r=>{
      r.addEventListener('change',()=>{
        state.mode = r.value;
        refresh(false);
      });
    });

    // quick filters (on les désactive car pas de données pour tier1/stale dans le CSV)
    const tier1El = $('#f-tier1');
    const nonstaleEl = $('#f-nonstale');
    if (tier1El) tier1El.disabled = true;
    if (nonstaleEl) nonstaleEl.disabled = true;
    
    $('#f-minpoints')?.addEventListener('input',e=>{ state.quick.minpoints = parseInt(e.target.value||'0',10); refresh(false); });

    // custom filters
    $('#cf-add')?.addEventListener('click',()=>{
      const metric = $('#cf-metric').value;
      const operator = $('#cf-op').value;
      const value = parseFloat($('#cf-val').value);
      if (!metric || isNaN(value)) return;
      state.filters.push({metric,operator,value});
      $('#cf-val').value='';
      drawFilters();
      refresh(false);
    });

    $('#crypto-mc-apply')?.addEventListener('click',()=>refresh(true));
    $('#crypto-mc-reset')?.addEventListener('click',()=>{
      state.selected = ['ret_1d','ret_90d'];
      state.mode = 'balanced';
      state.filters = [];
      state.quick = { tier1:false, nonstale:true, minpoints:0 };
      // reset UI
      Object.keys(METRICS).forEach(id=>{ const cb=$(`m-${id}`); if (cb) cb.checked = state.selected.includes(id); });
      document.querySelector('input[name="mc-mode"][value="balanced"]').checked = true;
      $('#f-minpoints').value = 0;
      drawFilters();
      updatePriorityList();
      refresh(true);
    });

    drawFilters();
    updatePriorityList();
  }

  function drawFilters() {
    const cont = $('#crypto-mc-filters');
    if (!cont) return;
    cont.innerHTML = state.filters.map((f,idx)=>{
      const lab = METRICS[f.metric].label;
      const color = (f.operator==='>='||f.operator==='>') ? 'text-green-400'
                   : (f.operator==='<'||f.operator==='<=') ? 'text-red-400'
                   : 'text-yellow-400';
      return `<div class="filter-item flex items-center gap-2 p-2 rounded bg-white/5">
        <span class="flex-1">${lab} <span class="${color} font-semibold">${f.operator} ${f.value}%</span></span>
        <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-i="${idx}"><i class="fas fa-times"></i></button>
      </div>`;
    }).join('') || '<div class="text-xs opacity-50 text-center py-2">Aucun filtre</div>';
    cont.querySelectorAll('.remove-filter').forEach(btn=>{
      btn.addEventListener('click',e=>{
        const i = parseInt(e.currentTarget.dataset.i,10);
        state.filters.splice(i,1);
        drawFilters();
        refresh(false);
      });
    });
  }

  function updatePriorityList() {
    const box = $('#crypto-mc-priorities');
    if (!box) return;
    box.innerHTML = (state.mode==='lexico' && state.selected.length)
      ? `Priorités : <em>${state.selected.map(m=>METRICS[m].label + (METRICS[m].max?' ↑':' ↓')).join(' → ')}</em>`
      : '';
  }

  // Refresh compute
  function refresh(showSpinner){
    const total = state.data.length;
    const pool = poolIndices();
    const kept = pool.length;
    setSummary(total, kept);
    if (!kept) { render([]); return; }
    const topIdx = (state.mode==='balanced') ? scoreBalanced(pool) : scoreLexico(pool);
    render(topIdx);
  }

  // Load CSV
  async function init() {
    const root = document.getElementById('crypto-mc');
    if (!root) return; // pas sur cette page
    // fetch
    const res = await fetch(CSV_URL + `?t=${Date.now()}`);
    if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
    const text = await res.text();
    const rows = csvParse(text);

    // Adapter lignes
    state.data = rows.map(r=>{
      const token = r.symbol || r.currency_base || '';
      return {
        ...r,
        token,
        // normaliser quelques champs bool/num pour filtres rapides
        data_points: r.data_points,
      };
    });

    buildCache();
    wireUI();
    refresh(false);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // petites classes si pas présentes
    document.querySelectorAll('.mc-pill').forEach(x=>{
      x.style.display = 'inline-flex';
      x.style.alignItems = 'center';
      x.style.gap = '6px';
      x.style.padding = x.style.padding || '6px 12px';
      x.style.borderRadius = x.style.borderRadius || '8px';
      x.style.fontSize = '0.85rem';
      x.style.cursor = 'pointer';
      x.style.transition = 'all 0.2s';
      x.style.border = '1px solid rgba(0, 255, 135, 0.3)';
      x.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
    });
    
    document.querySelectorAll('.mc-pill:hover').forEach(x=>{
      x.style.backgroundColor = 'rgba(0, 255, 135, 0.2)';
    });
    
    document.querySelectorAll('.mini-input, .mini-select').forEach(x=>{
      x.style.padding = '6px 8px';
      x.style.borderRadius = '6px';
      x.style.fontSize = '0.85rem';
      x.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      x.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      x.style.color = 'white';
    });
    
    init().catch(err=>{
      console.error('mc-crypto:', err);
      const wrap = $('#crypto-mc-results')?.querySelector('.stock-cards-container');
      if (wrap) wrap.innerHTML = '<div class="text-center text-red-400 py-4">Erreur de chargement</div>';
    });
  });
})();