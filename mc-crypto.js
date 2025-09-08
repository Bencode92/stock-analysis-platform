// mc-crypto.js — Composer multi-critères (Crypto) v3.5 - Fix doublon ID et délégation robuste
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
    cache: {},                       // {metric:{raw,rankPct,sorted,iqr}}
    pref: {}                        // préférences direction (optionnel pour ↑↓)
  };

  // Expose pour debug console
  window.MC = { state, METRICS };

  // ---- Utils
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"}[m]));
  const toNum = (x) => {
    if (x == null || x === '') return NaN;
    if (typeof x === 'number') return x;
    const v = parseFloat(String(x).replace(/[%\s]/g,''));
    return Number.isFinite(v) ? v : NaN;
  };
  const fmtPct = (v) => Number.isFinite(v) ? `${v>0?'+':''}${v.toFixed(2)}%` : '–';
  const fmtPrice = (p, quote) => Number.isFinite(p) ? `${(quote||'US Dollar').toLowerCase().includes('euro')?'€':'$'}${p.toLocaleString('fr-FR',{maximumFractionDigits:8})}` : '–';
  
  // NOUVEAU: Convertit "0,8", " 1.25 % " -> 0.8, 1.25 (format FR)
  function toNumUI(s) {
    if (typeof s === 'number') return s;
    if (s == null) return NaN;
    const v = Number(String(s).trim().replace(/\s/g,'').replace('%','').replace(',','.'));
    return Number.isFinite(v) ? v : NaN;
  }
  
  // NOUVEAU: Format français pour l'affichage
  const fmtFR = (n)=> Number(n).toLocaleString('fr-FR',{maximumFractionDigits:2});

  // Helpers "garantis-moi ce noeud"
  function ensureEl(parent, id, html) {
    let el = document.getElementById(id);
    if (!el) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html.trim();
      el = tmp.firstElementChild;
      parent.appendChild(el);
    }
    return el;
  }

  function ensureMcShell(root) {
    // résumé
    ensureEl(root, 'crypto-mc-summary',
      '<div id="crypto-mc-summary" class="text-xs opacity-70 mb-2"></div>');

    // conteneur priorités + liste
    ensureEl(root, 'crypto-priority-container',
      '<div id="crypto-priority-container" class="hidden mt-3 p-3 rounded bg-white/5"><div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser-déposer)</div><div id="crypto-priority-list" class="space-y-1"></div></div>');

    // conteneur générique (éviter l'ID utilisé par le panneau des filtres)
    ensureEl(root, 'mc-filters-shell',
      '<div id="mc-filters-shell" class="space-y-2"></div>');

    // résultats
    ensureEl(root, 'crypto-mc-results',
      '<div id="crypto-mc-results" class="glassmorphism rounded-lg p-4"><div class="stock-cards-container" id="crypto-mc-list"></div></div>');
  }

  function ensureModeRadios(root) {
    if (root.querySelector('input[name="mc-mode"]')) return;
    const wrap = document.createElement('div');
    wrap.className = 'mb-4 flex gap-2';
    wrap.innerHTML = `
      <fieldset role="radiogroup" aria-label="Mode de tri" class="w-full">
        <legend class="text-xs opacity-60 mb-2">Mode de tri</legend>
        <div class="flex gap-2">
          <label class="mc-pill"><input type="radio" name="mc-mode" value="balanced" checked> Équilibre</label>
          <label class="mc-pill"><input type="radio" name="mc-mode" value="lexico"> Priorités</label>
        </div>
      </fieldset>
    `;
    // Cherche où l'insérer (après les métriques ou au début)
    const metrics = root.querySelector('#crypto-mc-metrics, fieldset:first-child');
    if (metrics && metrics.nextSibling) {
      root.insertBefore(wrap, metrics.nextSibling);
    } else {
      root.appendChild(wrap);
    }
  }

  function ensureMetricCheckboxes(root) {
    // s'il existe déjà au moins une checkbox métrique, ne rien faire
    if (Object.keys(METRICS).some(id => document.getElementById('m-' + id))) return;

    // conteneur dédié (ou créé à la volée)
    let holder = root.querySelector('#crypto-mc-metrics, fieldset:first-child');
    if (!holder) {
      holder = document.createElement('fieldset');
      holder.className = 'mb-4';
      holder.innerHTML = '<legend class="text-sm opacity-70 mb-2">Critères sélectionnés = Ordre de priorité</legend><div id="crypto-mc-metrics" class="flex flex-wrap gap-2"></div>';
      root.insertBefore(holder, root.firstChild);
      holder = holder.querySelector('#crypto-mc-metrics');
    }

    // Si c'est un fieldset, cherche le conteneur des pills dedans
    if (holder.tagName === 'FIELDSET') {
      const inner = holder.querySelector('.flex.flex-wrap.gap-2, div');
      if (inner) holder = inner;
    }

    holder.innerHTML = Object.entries(METRICS).map(([id, m]) => {
      const checked = state.selected.includes(id) ? 'checked' : '';
      const dir = m.max ? '↑' : '↓';
      return `
        <label class="mc-pill ${checked ? 'is-checked' : ''}">
          <input type="checkbox" id="m-${id}" ${checked}>
          ${m.label} ${dir}
        </label>
      `;
    }).join('');
  }

  function ensureFilterControls(root) {
    if (document.getElementById('cf-add')) return;
    
    const filterSection = document.createElement('fieldset');
    filterSection.className = 'mb-4';
    filterSection.innerHTML = `
      <legend class="text-sm opacity-70 mb-2">Filtres personnalisés</legend>
      <div id="cf-pills" class="space-y-2 mb-2"></div>
      <div class="flex gap-1 items-center filter-controls">
        <select id="cf-metric" class="mini-select" style="flex:1.4;">
          ${Object.entries(METRICS).map(([id, m]) => 
            `<option value="${id}">${m.label}</option>`
          ).join('')}
        </select>
        <select id="cf-op" class="mini-select" style="width:58px;">
          <option value=">=">&ge;</option>
          <option value=">">&gt;</option>
          <option value="=">=</option>
          <option value="<">&lt;</option>
          <option value="<=">&le;</option>
          <option value="!=">&ne;</option>
        </select>
        <input id="cf-val" type="number" step="0.1" class="mini-input" style="width:80px;" placeholder="0">
        <span class="text-xs opacity-60">%</span>
        <button id="cf-add" type="button" class="action-button" style="padding:6px 10px;" aria-label="Ajouter le filtre">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
    
    // Insérer après le conteneur des priorités ou à la fin
    const prioContainer = root.querySelector('#crypto-priority-container');
    if (prioContainer && prioContainer.parentElement === root) {
      root.insertBefore(filterSection, prioContainer.nextSibling);
    } else {
      root.appendChild(filterSection);
    }
  }

  function ensureActionButtons(root) {
    if (document.getElementById('crypto-mc-apply')) return;
    
    const actions = document.createElement('div');
    actions.className = 'border-t border-white/10 pt-4';
    actions.innerHTML = `
      <div class="flex gap-2">
        <button id="crypto-mc-apply" class="search-button flex-1"><i class="fas fa-magic mr-2"></i>Appliquer</button>
        <button id="crypto-mc-reset" class="action-button"><i class="fas fa-undo"></i></button>
      </div>
    `;
    root.appendChild(actions);
  }

  // NOUVEAU HELPER: Garantit la présence du panneau + liste des priorités
  function ensurePriorityList() {
    const root = document.getElementById('crypto-mc');
    if (!root) return null;

    let box = document.getElementById('crypto-priority-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'crypto-priority-container';
      box.className = 'hidden mt-3 p-3 rounded bg-white/5';
      box.innerHTML = '<div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser-déposer)</div>';
      // place le panneau avant les filtres si possible
      const before = document.getElementById('cf-pills') || document.getElementById('crypto-mc-results');
      root.insertBefore(box, before || null);
    }

    let list = document.getElementById('crypto-priority-list');
    if (!list) {
      list = document.createElement('div');
      list.id = 'crypto-priority-list';
      list.className = 'space-y-1';
      box.appendChild(list);
    }

    // Legacy : masque d'anciennes zones texte champ "ordre"
    box.querySelectorAll('input,textarea').forEach(el => (el.style.display = 'none'));

    return list;
  }

  // Sync les critères sélectionnés depuis l'état des checkboxes
  function syncSelectedFromCheckboxes() {
    const ids = [];
    Object.keys(METRICS).forEach(id => {
      const cb = document.getElementById(`m-${id}`);
      if (cb && cb.checked) ids.push(id);
    });
    // Conserve l'ordre actuel pour ceux déjà présents, puis ajoute les nouveaux cochés
    const keep = state.selected.filter(id => ids.includes(id));
    const add  = ids.filter(id => !keep.includes(id));
    state.selected = keep.concat(add);
  }

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

  // NOUVEAU: Filtres personnalisés avec tolérance et support entités HTML
  function passCustomFilters(i) {
    const EPS = 0.05; // tolérance 0,05 point de % (~0,05%)
    for (const f of state.filters) {
      const raw = state.cache[f.metric]?.raw[i];
      if (!Number.isFinite(raw)) return false;

      // on travaille à 0,1 près pour stabiliser
      const v = Math.round(raw * 10) / 10;
      const x = Math.round(Number(f.value) * 10) / 10;

      let op = f.operator;
      const map = {'&gt;=':'>=','&gt;':'>','&lt;=':'<=','&lt;':'<','&ne;':'!='};
      op = map[op] || op;

      if (op === '>=') { if (!(v >= x)) return false; }
      else if (op === '>')  { if (!(v >  x)) return false; }
      else if (op === '<=') { if (!(v <= x)) return false; }
      else if (op === '<')  { if (!(v <  x)) return false; }
      else if (op === '!=') { if (!(Math.abs(v - x) > EPS)) return false; }
      else { // '=' (ou tout autre) -> quasi-égalité
        if (!(Math.abs(v - x) <= EPS)) return false;
      }
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

  // Helper pour obtenir la direction d'un critère (avec pref optionnel)
  function isMax(m) {
    return state.pref?.[m] ?? METRICS[m].max;
  }

  // Scores
  function scoreBalanced(indices) {
    const out=[];
    for (const i of indices) {
      let s=0,k=0;
      for (const m of state.selected) {
        let p = state.cache[m].rankPct[i];
        if (!Number.isFinite(p)) continue;
        if (!isMax(m)) p = 1 - p;
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
      if (!isMax(m)) { pa = 1-pa; pb = 1-pb; }
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
        const dir = isMax(m);
        const val = fmtPct(raw);
        const cls = !dir
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

  // ==== VERSION ULTRA-ROBUSTE : Gestion centralisée de l'affichage ====
  
  // Helper robuste pour toggle le panneau priorités - VERSION RENFORCÉE
  function togglePrioBox(show){
    const box = document.getElementById('crypto-priority-container');
    if (!box) {
      console.warn('Priority container not found');
      return;
    }
    // Force conversion booléenne et triple sécurité
    show = !!show;
    box.classList.toggle('hidden', !show);
    if (show) {
      box.hidden = false;
      box.style.removeProperty('display');
    } else {
      box.hidden = true;
      box.style.display = 'none';
    }
  }

  // ==== Force le passage en mode Priorités (utile pour debug uniquement)
  function forcePriorities({scroll=true} = {}) {
    const rootMc = document.getElementById('crypto-mc');
    if (!rootMc) return;

    // Coche le radio "Priorités"
    const pr = rootMc.querySelector('input[name="mc-mode"][value="lexico"]')
             || Array.from(rootMc.querySelectorAll('input[name="mc-mode"]')).find(r => 
                  /prior|prio|lexico/.test(r.value?.toLowerCase() || '') ||
                  /prior|prio/.test(r.closest('label')?.textContent?.toLowerCase() || '')
                )
             || rootMc.querySelector('input[name="mc-mode"]'); // fallback
    
    if (pr) pr.checked = true;

    // État + habillage visuel
    state.mode = 'lexico';
    rootMc.querySelectorAll('input[name="mc-mode"]').forEach(x=>{
      x.closest('.mc-pill')?.classList.toggle('is-checked', x.checked);
    });

    togglePrioBox(true);
    updatePriorityUI();
    refresh(false);

    // Scroll optionnel vers le panneau des priorités
    if (scroll) {
      setTimeout(() => {
        document.getElementById('crypto-priority-container')
          ?.scrollIntoView({behavior:'smooth', block:'nearest'});
      }, 100);
    }
  }

  // NOUVELLE VERSION COMPLÈTE de updatePriorityUI
  function updatePriorityUI() {
    const list = ensurePriorityList();
    const box  = document.getElementById('crypto-priority-container');
    if (!list || !box) return;

    // Affiche/masque selon le mode
    if (state.mode === 'lexico') {
      togglePrioBox(true);
    } else {
      togglePrioBox(false);
      list.innerHTML = '';
      return;
    }

    // Toujours synchroniser avec l'état des cases cochées
    syncSelectedFromCheckboxes();

    // Construire la pile des priorités
    list.innerHTML = state.selected.map((m,i)=>`
      <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5 cursor-move"
           draggable="true" data-metric="${m}">
        <span class="drag-handle">☰</span>
        <span class="text-xs opacity-50">${i+1}.</span>
        <span class="flex-1">${METRICS[m].label} ${isMax(m)?'↑':'↓'}</span>
      </div>
    `).join('') || '<div class="text-xs opacity-50">Coche au moins un critère</div>';

    // DnD
    const items = list.querySelectorAll('.priority-item');
    let dragged = null;

    items.forEach(item => {
      item.addEventListener('dragstart', () => { dragged = item; item.classList.add('dragging'); });
      item.addEventListener('dragend',   () => { item.classList.remove('dragging'); dragged = null; });
    });

    function getAfterElement(container, y) {
      const els = [...container.querySelectorAll('.priority-item:not(.dragging)')];
      return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
      }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    // On gère le dragover/drop au niveau de la LISTE (robuste)
    list.addEventListener('dragover', e => {
      if (!dragged) return;
      e.preventDefault();
      const after = getAfterElement(list, e.clientY);
      if (!after) list.appendChild(dragged);
      else list.insertBefore(dragged, after);
    });

    list.addEventListener('drop', () => {
      state.selected = Array.from(list.querySelectorAll('.priority-item')).map(x => x.dataset.metric);
      refresh(false);        // recalcul du top avec le nouvel ordre
      updatePriorityUI();    // renumérotation 1., 2., 3., …
    }, { once: true });      // évite d'empiler des listeners
  }

  // ==== Fonction pour compacter l'UI des filtres (sera rappelée automatiquement)
  function compactFilterUI() {
    const row = $('#cf-add')?.parentElement; // la rangée qui contient metric/op/val/%/+
    if (!row) return;

    // Ajoute une classe pour le ciblage CSS
    row.classList.add('filter-controls');

    // Application directe des styles (fallback si le CSS n'est pas appliqué)
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(120px,1fr) 56px 72px 14px 34px';
    row.style.gap = '6px';
    row.style.alignItems = 'center';
    row.style.maxWidth = '100%';
    row.style.overflow = 'hidden';
    row.style.whiteSpace = 'nowrap';
  }

  // ==== UI bindings avec délégation robuste
  function wireUI() {
    const rootMc = document.getElementById('crypto-mc');
    if (!rootMc) return;

    // Créer l'UI si elle n'existe pas
    ensureModeRadios(rootMc);
    ensureMetricCheckboxes(rootMc);
    ensureFilterControls(rootMc);
    ensureActionButtons(rootMc);

    // ==== MODIFIÉ : checkboxes métriques avec MAJ immédiate de la liste
    Object.keys(METRICS).forEach(id=>{
      const cb = $(`m-${id}`);
      if (!cb) return;
      cb.checked = state.selected.includes(id);
      
      const pill = cb.closest('.mc-pill');
      const sync = ()=> pill && pill.classList.toggle('is-checked', cb.checked);
      sync();

      // NOUVEAU HANDLER SIMPLIFIÉ
      cb.addEventListener('change', ()=>{
        if (cb.checked) {
          if (!state.selected.includes(id)) state.selected.push(id); // append
        } else {
          state.selected = state.selected.filter(x=>x!==id);
        }

        // visuel de la pill
        const pill = cb.closest('.mc-pill');
        pill && pill.classList.toggle('is-checked', cb.checked);

        // MAJ immédiate de la liste des priorités (elle s'affichera seulement en mode "Priorités")
        updatePriorityUI();
        refresh(false);
      });
    });

    // ---- Radios "Mode de tri" (ultra-robuste avec délégation) - VERSION AMÉLIORÉE
    function applyModeFromTarget(t){
      if (!t) return;
      const v = (t.value || '').toLowerCase();
      const labelTxt = (t.closest('label')?.textContent || t.labels?.[0]?.textContent || '').toLowerCase();
      
      // Détection intelligente du mode basée sur value OU texte du label
      const isLexico = v === 'lexico' || /lexico|prior|prio/.test(labelTxt);
      state.mode = isLexico ? 'lexico' : 'balanced';
      
      // Synchronise les critères sélectionnés quand on passe en Priorités
      if (isLexico) {
        syncSelectedFromCheckboxes();   // ← aligne la sélection
      }
      
      // Effet visuel sur les pills radio
      rootMc.querySelectorAll('input[name="mc-mode"]').forEach(x=>{
        x.closest('.mc-pill')?.classList.toggle('is-checked', x.checked);
      });
      
      // Toggle centralisé du panneau priorités
      togglePrioBox(state.mode === 'lexico');
      
      // NOUVEAU: laisse le DOM respirer, puis build la liste
      requestAnimationFrame(() => {
        updatePriorityUI();
        refresh(false);
      });
      
      // Debug optionnel
      if (window.DEBUG_MC) {
        console.log(`Mode: ${state.mode}`, {value: v, label: labelTxt});
      }
    }

    // Délégation sur le conteneur pour ne rater aucun event - AJOUT input et click
    rootMc.addEventListener('change', (e)=>{
      if (e.target && e.target.name === 'mc-mode') {
        applyModeFromTarget(e.target);
      }
    });

    // NOUVEAU: Support des événements input et click pour Safari/mobile
    rootMc.addEventListener('input', (e)=>{
      if (e.target && e.target.name === 'mc-mode') {
        applyModeFromTarget(e.target);
      }
    });

    // ==== MODIFIÉ: Délégation pour le bouton + (ultra-robuste)
    rootMc.addEventListener('click', (e) => {
      // Gestion du mode radio
      const lbl = e.target.closest('label');
      if (lbl) {
        const inp = lbl.querySelector('input[name="mc-mode"]');
        if (inp && inp.name === 'mc-mode') {
          inp.checked = true;      // force l'état visuel
          applyModeFromTarget(inp); // et applique le mode
          return;
        }
      }
      
      // Gestion du bouton + pour ajouter un filtre
      const addBtn = e.target.closest('#cf-add');
      if (!addBtn) return;

      e.preventDefault();
      e.stopPropagation();

      const metric   = $('#cf-metric')?.value;
      let   operator = $('#cf-op')?.value;
      const valueRaw = $('#cf-val')?.value;
      const value    = toNumUI(valueRaw);

      if (!metric || !Number.isFinite(value)) return;

      const map = {'&gt;=':'>=','&gt;':'>','&lt;=':'<=','&lt;':'<','&ne;':'!='};
      operator = map[operator] || operator;

      // upsert
      const idx = state.filters.findIndex(f => f.metric === metric && f.operator === operator);
      if (idx >= 0) state.filters[idx].value = value;
      else          state.filters.push({ metric, operator, value });

      $('#cf-val').value = '';
      $('#cf-val').focus();

      drawFilters();
      compactFilterUI();
      refresh();             // applique immédiatement
    });

    // Synchronise à l'init
    syncSelectedFromCheckboxes();
    
    // État initial - cherche le radio checked ou prend le premier
    const checkedRadio = rootMc.querySelector('input[name="mc-mode"]:checked') 
                      || rootMc.querySelector('input[name="mc-mode"][value="balanced"]')
                      || rootMc.querySelector('input[name="mc-mode"]');
    if (checkedRadio) {
      checkedRadio.checked = true; // Force le checked si nécessaire
      applyModeFromTarget(checkedRadio);
    }

    // Bonus: Enter dans l'input valeur = clic sur +
    $('#cf-val')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#cf-add')?.click();
      }
    });

    $('#crypto-mc-apply')?.addEventListener('click',()=>refresh(true));

    $('#crypto-mc-reset')?.addEventListener('click',()=>{
      state.selected = ['ret_1d','ret_90d'];
      state.mode = 'balanced';
      state.filters = [];
      state.pref = {}; // Reset des préférences
      Object.keys(METRICS).forEach(id=>{ 
        const cb=$(`m-${id}`); 
        if (cb) {
          cb.checked = state.selected.includes(id); 
          cb?.dispatchEvent(new Event('change')); 
        }
      });
      syncSelectedFromCheckboxes(); // Synchronise après reset
      const balancedRadio = rootMc.querySelector('input[name="mc-mode"][value="balanced"]') 
                         || rootMc.querySelector('input[name="mc-mode"]');
      if (balancedRadio) {
        balancedRadio.checked = true;
        applyModeFromTarget(balancedRadio);
      }
      drawFilters();
      compactFilterUI(); // Re-compacte après reset
      refresh(true);
    });

    drawFilters();
    updatePriorityUI();
    compactFilterUI();
    
    // Re-compacte à chaque interaction et au redimensionnement
    ['change','click'].forEach(evt => rootMc.addEventListener(evt, compactFilterUI, {passive:true}));
    window.addEventListener('resize', compactFilterUI, {passive:true});
    
    // CORRIGÉ: Debug désactivé par défaut (enlève le || true)
    if (window.DEBUG_MC) {
      window.MC.refreshPriorityList = () => {
        console.log('MC State:', {
          mode: state.mode,
          selected: state.selected,
          filters: state.filters.length,
          data: state.data.length
        });
        updatePriorityUI();
        refresh(false);
      };
      
      window.MC.forceLexico = () => forcePriorities({scroll: true});
      window.MC.syncSelected = () => syncSelectedFromCheckboxes();
    }
  }

  // MODIFIÉ: drawFilters utilise le bon ID et refresh immédiat sur suppression
  function drawFilters() {
    const cont = document.getElementById('cf-pills');
    if (!cont) return;
    cont.innerHTML = state.filters.map((f,idx)=>{
      const lab = METRICS[f.metric].label;
      // Normalisation de l'opérateur pour l'affichage
      let displayOp = f.operator;
      if (displayOp === '&gt;=') displayOp = '>=';
      if (displayOp === '&gt;') displayOp = '>';
      if (displayOp === '&lt;=') displayOp = '<=';
      if (displayOp === '&lt;') displayOp = '<';
      if (displayOp === '&ne;') displayOp = '!=';
      
      const color = (displayOp==='>='||displayOp==='>') ? 'text-green-400'
                   : (displayOp==='<'||displayOp==='<=') ? 'text-red-400'
                   : 'text-yellow-400';
      return `<div class="filter-item flex items-center gap-2 p-2 rounded bg-white/5">
        <span class="flex-1 min-w-0">
          <span class="whitespace-nowrap overflow-hidden text-ellipsis">${lab} <span class="${color} font-semibold">${displayOp} ${fmtFR(f.value)}%</span></span>
        </span>
        <button class="remove-filter text-red-400 hover:text-red-300 text-sm shrink-0" data-i="${idx}"><i class="fas fa-times"></i></button>
      </div>`;
    }).join('') || '<div class="text-xs opacity-50 text-center py-2">Aucun filtre</div>';
    cont.querySelectorAll('.remove-filter').forEach(btn=>{
      btn.addEventListener('click',e=>{
        const i = parseInt(e.currentTarget.dataset.i,10);
        state.filters.splice(i,1);
        drawFilters();
        compactFilterUI(); // Re-compacte après suppression
        refresh();  // MODIFIÉ: réapplique immédiatement sans attendre
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
      if (!p) continue; // Skip empty paths
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

    // Créer la structure de base si elle n'existe pas
    ensureMcShell(root);

    const HERE = location.href.replace(/[^/]*$/, '');   // dossier courant de la page
    const ROOT = location.origin + '/';                  // racine du site

    // MODIFIÉ: Utilise vraiment CSV_URL avec override possible
    const text = await fetchFirst([
      // 1) override optionnel à poser dans la page avant le script
      window.CRYPTO_CSV_URL,
      // 2) chemin "officiel" de ce module
      CSV_URL,
      // 3) variantes robustes
      new URL(CSV_URL, HERE).href,
      new URL(CSV_URL, ROOT).href,
      new URL('stock-analysis-platform/' + CSV_URL, ROOT).href,
      '../' + CSV_URL,
      '../../' + CSV_URL,
      // Anciens fallbacks pour compatibilité
      HERE + 'data/filtered/Crypto_filtered_volatility.csv',
      ROOT + 'data/filtered/Crypto_filtered_volatility.csv',
      ROOT + 'stock-analysis-platform/data/filtered/Crypto_filtered_volatility.csv',
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
    // CSS permanent avec ciblage automatique via :has() et classe fallback
    const mcCompactCSS = document.createElement('style');
    mcCompactCSS.textContent = `
      /* Ligne des filtres personnalisés — compacte, une seule ligne, pas d'overflow */
      #crypto-mc fieldset > div:has(#cf-metric,#cf-op,#cf-val,#cf-add),
      #crypto-mc .filter-controls {
        display: grid !important;
        grid-template-columns: minmax(120px,1fr) 56px 72px 14px 34px !important;
        gap: 6px !important;
        align-items: center !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        max-width: 100% !important;
      }

      #cf-metric { min-width: 0 !important; font-size: 0.8rem !important; }
      #cf-op { width: 56px !important; font-size: 0.8rem !important; }
      #cf-val { width: 72px !important; font-size: 0.8rem !important; }
      #cf-add { 
        width: 34px !important; 
        height: 34px !important; 
        padding: 0 !important;
        display: inline-flex !important; 
        align-items: center !important; 
        justify-content: center !important;
        font-size: 0.8rem !important;
      }

      /* Le symbole % juste après l'input */
      #cf-val + span { 
        font-size: 12px !important; 
        opacity: .6 !important; 
        text-align: center !important; 
        white-space: nowrap !important; 
      }

      /* Les "pills" des filtres ajoutés restent fines */
      #cf-pills .filter-item { 
        padding: 6px 8px !important; 
        font-size: .85rem !important; 
      }
      #cf-pills .filter-item .flex-1 { 
        min-width: 0 !important; 
      }
      #cf-pills .filter-item .flex-1 > span { 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis; 
        display: block;
      }

      /* Amélioration des pills */
      .mc-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 8px !important;
        font-size: 0.85rem !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        border: 1px solid rgba(0, 255, 135, 0.3) !important;
        background-color: rgba(0, 255, 135, 0.1) !important;
      }
      .mc-pill:hover {
        background-color: rgba(0, 255, 135, 0.2) !important;
        transform: translateY(-1px);
      }
      .mc-pill.is-checked {
        background-color: rgba(0, 255, 135, 0.25) !important;
        border-color: var(--accent-color) !important;
      }
      
      /* Inputs et selects compacts */
      .mini-input, .mini-select {
        padding: 6px 8px !important;
        border-radius: 6px !important;
        font-size: 0.85rem !important;
        background-color: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        color: white !important;
      }
      
      /* Styles pour le drag & drop des priorités */
      #crypto-priority-list .priority-item { 
        user-select: none; 
        transition: all 0.2s;
      }
      #crypto-priority-list .priority-item .drag-handle { 
        cursor: grab; 
        opacity: .7; 
      }
      #crypto-priority-list .priority-item.dragging { 
        opacity: .5; 
        transform: scale(0.95);
      }
      #crypto-priority-list .priority-item:hover {
        background-color: rgba(0, 255, 135, 0.15) !important;
      }
      
      /* Animation du conteneur des priorités */
      #crypto-priority-container {
        transition: all 0.3s ease;
      }

      /* Boutons d'action */
      .action-button, .search-button {
        padding: 8px 16px !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        transition: all 0.2s !important;
        cursor: pointer !important;
      }
      
      .action-button {
        background-color: rgba(0, 255, 135, 0.1) !important;
        color: var(--accent-color, #00FF87) !important;
        border: 1px solid rgba(0, 255, 135, 0.3) !important;
      }
      
      .search-button {
        background-color: var(--accent-color, #00FF87) !important;
        color: #0a1929 !important;
        border: none !important;
      }
      
      .action-button:hover, .search-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 255, 135, 0.3);
      }
    `;
    document.head.appendChild(mcCompactCSS);

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