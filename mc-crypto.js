// mc-crypto.js — Composer multi-critères (Crypto) v2
// Lit data/filtered/Crypto_filtered_volatility.csv (CSV ou TSV)

(function () {
  const CSV_URL = 'data/filtered/Crypto_filtered_volatility.csv';

  // --- Métriques disponibles
  const METRICS = {
    ret_1d:  {label:'Perf 24h',      col:'ret_1d_pct',        unit:'%', max:true},
    ret_7d:  {label:'Perf 7j',       col:'ret_7d_pct',        unit:'%', max:true},
    ret_30d: {label:'Perf 30j',      col:'ret_30d_pct',       unit:'%', max:true},
    ret_90d: {label:'Perf 90j',      col:'ret_90d_pct',       unit:'%', max:true},
    ret_1y:  {label:'Perf 1 an',     col:'ret_1y_pct',        unit:'%', max:true},
    vol_7d:  {label:'Vol 7j (ann.)', col:'vol_7d_annual_pct', unit:'%', max:false},
    vol_30d: {label:'Vol 30j (ann.)',col:'vol_30d_annual_pct',unit:'%', max:false},
    atr14:   {label:'ATR14%',        col:'atr14_pct',         unit:'%', max:false},
    dd90:    {label:'Drawdown 90j',  col:'drawdown_90d_pct',  unit:'%', max:false},
  };

  const state = {
    data: [],
    selected: ['ret_1d','ret_90d'],
    mode: 'balanced',                // 'balanced' | 'lexico'
    filters: [],                     // [{metric,operator,value}]
    cache: {}                        // {metric:{raw,rankPct,sorted,iqr}}
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

  // CSV/TSV parser avec auto-détection du séparateur
  function parseTable(text) {
    const firstLine = text.split(/\r?\n/)[0] || '';
    const comma = (firstLine.match(/,/g)||[]).length;
    const tab   = (firstLine.match(/\t/g)||[]).length;
    const D = tab > comma ? '\t' : ',';        // séparateur détecté

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
        else if (c === D) pushField();
        else if (c === '\n') { pushField(); pushRow(); }
        else if (c === '\r') { /* ignore */ }
        else field += c;
      }
      i++;
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    const headers = (rows.shift()||[]).map(h=>h.trim());
    return rows
      .filter(r=>r.length===headers.length)
      .map(r=>Object.fromEntries(headers.map((h,idx)=>[h,r[idx]])));
  }

  // Cache percentiles
  function buildCache() {
    state.cache = {};
    const n = state.data.length;
    Object.entries(METRICS).forEach(([key, m]) => {
      const raw = new Float64Array(n);
      for (let i=0;i<n;i++) raw[i] = toNum(state.data[i][m.col]);
      const valid = Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
      if (!valid.length) { state.cache[key] = { raw, rankPct:new Float64Array(n), sorted:new Float64Array(), iqr:1 }; return; }
      // winsor doux
      const q = (p)=>valid[Math.floor(p*(valid.length-1))];
      const lo=q(0.005), hi=q(0.995);
      for (let i=0;i<n;i++) if (Number.isFinite(raw[i])) raw[i]=Math.min(hi,Math.max(lo,raw[i]));
      const sorted = Array.from(raw).filter(Number.isFinite).sort((a,b)=>a-b);
      const qW=(p)=>sorted[Math.floor(p*(sorted.length-1))];
      const iqr = Math.max(1e-9, qW(0.75)-qW(0.25));
      // rang hazen
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

  // Filtres personnalisés
  function passCustomFilters(i) {
    const q = (v)=>Math.round(v*10)/10; // quantisation 0.1 comme ton module actions
    for (const f of state.filters) {
      const raw = state.cache[f.metric]?.raw[i];
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

  // Pool d'indices retenus
  function poolIndices() {
    const kept = [];
    for (let i=0;i<state.data.length;i++) {
      if (!passCustomFilters(i)) continue;
      if (!state.selected.some(m => Number.isFinite(state.cache[m]?.raw[i]))) continue;
      kept.push(i);
    }
    return kept;
  }

  // Scores
  function scoreBalanced(indices) {
    const out=[];
    for (const i of indices) {
      let s=0,k=0;
      for (const m of state.selected) {
        let p = state.cache[m].rankPct[i];
        if (!Number.isFinite(p)) continue;
        if (!METRICS[m].max) p = 1 - p;
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
    const ta = state.data[a].token, tb = state.data[b].token;
    return String(ta).localeCompare(String(tb));
  }

  function scoreLexico(indices) {
    const arr = indices.slice().sort(cmpLexico);
    return arr.slice(0,10);
  }

  // Rendu résultats — UNE LIGNE, sans duplication
  function render(indices) {
    const container = document.getElementById('crypto-mc-results');
    if (!container) return;

    // --- Garantir un SEUL wrapper réutilisable
    let wrap = container.querySelector('#crypto-mc-list');
    if (!wrap) {
      // S'il existe déjà un .stock-cards-container, on le recycle
      const existing = container.querySelector('.stock-cards-container');
      if (existing) {
        wrap = existing;
        wrap.id = 'crypto-mc-list';
      } else {
        wrap = document.createElement('div');
        wrap.className = 'stock-cards-container';
        wrap.id = 'crypto-mc-list';
        container.appendChild(wrap);
      }
    }
    // Nettoyage défensif: supprimer d'éventuels wrappers créés par erreur
    container.querySelectorAll('.stock-cards-container, #crypto-mc-list').forEach(el => {
      if (el !== wrap) el.remove();
    });

    // --- Forcer l'affichage vertical (1 ligne par item) SANS retirer la classe
    wrap.classList.add('space-y-2');
    wrap.style.display = 'block';
    wrap.style.gridTemplateColumns = 'none';
    wrap.style.gap = '0';

    // --- Contenu
    wrap.innerHTML = '';
    if (!indices.length) {
      wrap.innerHTML = `<div class="text-center text-cyan-400 py-4">
        <i class="fas fa-filter mr-2"></i>Aucune crypto ne passe les filtres
      </div>`;
      return;
    }

    indices.forEach((i, rank) => {
      const r = state.data[i];
      const price = fmtPrice(toNum(r.last_close), r.currency_quote);

      const cols = state.selected.map(m => {
        const raw = state.cache[m]?.raw[i];
        if (!Number.isFinite(raw)) return '';
        const isMax = METRICS[m].max;
        const val = fmtPct(raw);
        const cls = !isMax
          ? (raw < 20 ? 'text-green-400' : raw > 40 ? 'text-red-400' : 'text-yellow-400')
          : (raw >= 0 ? 'text-green-400' : 'text-red-400');
        return `
          <div class="text-right whitespace-nowrap">
            <div class="text-xs opacity-60">${METRICS[m].label}</div>
            <div class="${cls} font-semibold">${val}</div>
          </div>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4 overflow-x-auto whitespace-nowrap';
      card.innerHTML = `
        <div class="rank text-2xl font-bold shrink-0">#${rank + 1}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">${esc(r.token || r.symbol || '-')}</div>
          <div class="text-xs opacity-60 truncate">
            ${esc(r.currency_base || '-')} • ${esc(r.exchange_used || '')}
          </div>
          <div class="text-xs opacity-40 truncate">${price}</div>
        </div>
        <div class="flex items-center gap-6 ml-2 whitespace-nowrap shrink-0">${cols}</div>
      `;
      wrap.appendChild(card);
    });
  }

  function setSummary(total, kept){
    const el = $('#crypto-mc-summary');
    if (!el) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités';
    const labels = state.selected.map(m=>METRICS[m].label).join(' · ') || 'Aucun critère';
    el.innerHTML = `<strong>${mode}</strong> • ${labels} • ${kept}/${total} cryptos`;
  }

  // ==== Priorités (drag & drop)
  function updatePriorityUI() {
    const box = $('#crypto-priority-container');
    const list = $('#crypto-priority-list');
    if (!box || !list) return;
    box.style.display = state.mode==='lexico' ? 'block' : 'none';
    if (state.mode!=='lexico') { list.innerHTML=''; return; }

    list.innerHTML = state.selected.map((m,i)=>`
      <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5 cursor-move"
           draggable="true" data-metric="${m}">
        <span class="drag-handle">☰</span>
        <span class="text-xs opacity-50">${i+1}.</span>
        <span class="flex-1">${METRICS[m].label} ${METRICS[m].max?'↑':'↓'}</span>
      </div>
    `).join('') || '<div class="text-xs opacity-50">Coche au moins un critère</div>';

    const items = list.querySelectorAll('.priority-item');
    let dragged=null;
    items.forEach(item=>{
      item.addEventListener('dragstart',e=>{ dragged=item; item.classList.add('opacity-50'); });
      item.addEventListener('dragend',e=>{ item.classList.remove('opacity-50'); dragged=null; });
      item.addEventListener('dragover',e=>{
        e.preventDefault();
        const after = getAfterElement(list, e.clientY);
        if (!after) list.appendChild(dragged);
        else list.insertBefore(dragged, after);
      });
      item.addEventListener('drop',()=>{
        state.selected = Array.from(list.querySelectorAll('.priority-item')).map(x=>x.dataset.metric);
        refresh(false);
        updatePriorityUI();
      });
    });

    function getAfterElement(container, y) {
      const els = [...container.querySelectorAll('.priority-item:not(.opacity-50)')];
      return els.reduce((closest, child)=>{
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height/2;
        if (offset < 0 && offset > closest.offset) return {offset, element:child};
        else return closest;
      }, {offset:Number.NEGATIVE_INFINITY}).element;
    }
  }

  // ==== UI bindings
  function wireUI() {
    // checkboxes métriques
    Object.keys(METRICS).forEach(id=>{
      const cb = $(`m-${id}`);
      if (!cb) return;
      cb.checked = state.selected.includes(id);
      // état visuel "is-checked"
      const pill = cb.closest('.mc-pill');
      const sync = ()=> pill && pill.classList.toggle('is-checked', cb.checked);
      sync();

      cb.addEventListener('change',()=>{
        if (cb.checked) { if (!state.selected.includes(id)) state.selected.push(id); }
        else            { state.selected = state.selected.filter(x=>x!==id); }
        sync();
        updatePriorityUI();
        refresh(false);
      });
    });

    // mode
    document.querySelectorAll('input[name="mc-mode"]').forEach(r=>{
      r.addEventListener('change',()=>{
        state.mode = r.value;
        updatePriorityUI();
        refresh(false);
      });
    });

    // filtres personnalisés
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
      Object.keys(METRICS).forEach(id=>{ const cb=$(`m-${id}`); if (cb) cb.checked = state.selected.includes(id); cb?.dispatchEvent(new Event('change')); });
      document.querySelector('input[name="mc-mode"][value="balanced"]').checked = true;
      drawFilters();
      updatePriorityUI();
      refresh(true);
    });

    drawFilters();
    updatePriorityUI();
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

  // Refresh (SÉCURISÉ)
  function refresh(){
    if (!document.getElementById('crypto-mc-results')) return;
    
    const total = state.data.length;
    if (!state.selected.length) {
      setSummary(total, 0);
      render([]);
      return;
    }
    const pool = poolIndices();
    setSummary(total, pool.length);
    const topIdx = (state.mode==='balanced') ? scoreBalanced(pool) : scoreLexico(pool);
    render(topIdx);
  }

  // Fetch robuste avec diagnostic détaillé
  async function fetchFirst(paths) {
    const tried = [];
    for (const p of paths) {
      try {
        const url = new URL(p, location.href).href + `?t=${Date.now()}`;
        const r = await fetch(url, { cache: 'no-store' });
        tried.push(`${r.status} ${url}`);
        if (r.ok) return await r.text();
      } catch (e) {
        tried.push(`ERR ${p} ${e.message}`);
      }
    }
    throw new Error('CSV introuvable. Tentatives:\n' + tried.join('\n'));
  }

  // Load
  async function init() {
    const root = document.getElementById('crypto-mc');
    if (!root) return;

    const HERE = location.href.replace(/[^/]*$/, '');   // dossier courant de la page
    const ROOT = location.origin + '/';                  // racine du site

    const text = await fetchFirst([
      HERE + 'data/filtered/Crypto_filtered_volatility.csv',      // si la page est au root
      ROOT + 'data/filtered/Crypto_filtered_volatility.csv',      // racine absolue
      ROOT + 'stock-analysis-platform/data/filtered/Crypto_filtered_volatility.csv', // GitHub Pages
      '../data/filtered/Crypto_filtered_volatility.csv',
      '../../data/filtered/Crypto_filtered_volatility.csv',
      // 👉 Option : autorise une surcharge manuelle depuis une variable globale
      (window.CRYPTO_CSV_URL || '')
    ].filter(Boolean));

    const rows = parseTable(text);
    console.log('CSV lignes:', rows.length, 'colonnes:', Object.keys(rows[0]||{}));

    state.data = rows.map(r=>{
      // token = "AAVE" si "AAVE/USD"
      const sym = (r.symbol||'').toString();
      const token = sym.includes('/') ? sym.split('/')[0] : (r.currency_base || sym || '');
      return { ...r, token };
    });

    buildCache();
    wireUI();
    refresh();
  }

  // --- boot robuste : lance init() tout de suite si le DOM est déjà prêt
  function boot() {
    // (facultatif) petits styles inline
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
    document.querySelectorAll('.mini-input, .mini-select').forEach(x=>{
      x.style.padding = '6px 8px';
      x.style.borderRadius = '6px';
      x.style.fontSize = '0.85rem';
      x.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      x.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      x.style.color = 'white';
    });

    init().catch(err => {
      console.error('mc-crypto init:', err);
      const wrap = document.getElementById('crypto-mc-results')?.querySelector('.stock-cards-container');
      if (wrap) {
        wrap.innerHTML = `
          <div class="text-center text-red-400 py-4">
            Erreur de chargement<br>
            <pre class="text-xs opacity-70 text-left overflow-auto mt-2" style="white-space:pre-wrap">${String(err.message)}</pre>
          </div>`;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();