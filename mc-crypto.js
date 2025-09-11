// mc-crypto.js — Composer multi-critères (Crypto) v4.6 - Système de thème modulaire
// THEME TEAL/EMERAUDE par défaut (remplace le violet)
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

  // --- Tolérance (v4.5 - Priorités intelligentes)
  const GAP_FLOOR = {        // planchers de gaps (en points de %)
    ret_1d: 0.5, ret_7d: 0.4, ret_30d: 0.35, ret_90d: 0.30, ret_1y: 0.25,
    vol_7d: 0.20, vol_30d: 0.20, atr14: 0.15, dd90: 0.25
  };
  const TOL_PRESET = { c: 0.6, kappa: 1.5 };
  const MIN_TOL_P = 0.012;    // plancher 1.2 pp sur diff. de percentiles
  const TOP_N = 10;
  const ALLOW_MISSING = 1;    // tolère 1 critère manquant

  // --- Stablecoins à exclure
  const STABLES = new Set(['USDT','USDC','DAI','TUSD','FDUSD','PYUSD','EURT','EURS','USDE','BUSD','UST']);

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
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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

  // Scope helpers (inside this IIFE)
  const rootMc = () => document.getElementById('crypto-mc');
  const q  = (sel) => rootMc()?.querySelector(sel);       // scoped query

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

  // --- MAJ compteur + horodatage + expose global pour d'autres scripts
  function updateHeaderCounters() {
    const n = state.data.length;
    const cnt = document.getElementById('crypto-count');
    if (cnt) cnt.textContent = n.toLocaleString('fr-FR');

    const t = document.getElementById('last-update-time');
    if (t) {
      const now = new Date();
      t.textContent = now.toLocaleString('fr-FR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    // Utile si un autre script veut lire les données
    window.CRYPTO_ROWS = state.data;
  }

  // v4.3 - Choisit 1 seule ligne par token en gardant la meilleure selon la vue
  function topByMetricUnique(list, key, asc = false) {
    // asc=false => on veut le max ; asc=true => on veut le min
    const best = new Map(); // token -> row retenue
    for (const r of list) {
      const v = r[key];
      if (!Number.isFinite(v)) continue;
      const prev = best.get(r.token);
      if (!prev || (asc ? v < prev[key] : v > prev[key])) best.set(r.token, r);
    }
    return Array.from(best.values())
      .sort((a, b) => asc ? a[key] - b[key] : b[key] - a[key])
      .slice(0, 10);
  }

  // v4.3 - Rendu des 4 Top 10 SANS DOUBLONS
  function renderTop10Blocks() {
    const rows = state.data.map(r => ({
      token: r.token,
      name: r.currency_base || r.token || '',
      ex: r.exchange_used || '',
      price: toNum(r.last_close),
      d1: toNum(r.ret_1d_pct),
      q3: toNum(r.ret_90d_pct),
      currency_quote: r.currency_quote
    }));

    // Dédupliqué par token + bon extrême pour chaque vue
    paintTop('#top-daily-gainers .stock-cards-container', topByMetricUnique(rows, 'd1', false), 'd1'); // max
    paintTop('#top-daily-losers .stock-cards-container',  topByMetricUnique(rows, 'd1', true),  'd1'); // min
    paintTop('#top-qtr-gainers .stock-cards-container',   topByMetricUnique(rows, 'q3', false), 'q3'); // max
    paintTop('#top-qtr-losers .stock-cards-container',    topByMetricUnique(rows, 'q3', true),  'q3'); // min
  }

  // Raccourci nom d'exchange pour l'affichage
  function shortEx(ex){
    const x = String(ex||'').toLowerCase();
    if (x.includes('coinbase')) return 'Coinbase';
    if (x.includes('binance'))  return 'Binance';
    if (x.includes('kraken'))   return 'Kraken';
    return ex || '';
  }

  function paintTop(selector, arr, key) {
    const el = document.querySelector(selector);
    if (!el) return;

    if (!arr || !arr.length) {
      el.innerHTML = '<div class="py-6 text-center opacity-60">Aucune donnée</div>';
      return;
    }

    el.innerHTML = arr.map((r, i) => `
      <div class="stock-card topcard">
        <div class="rank">#${i+1}</div>

        <div class="stock-info">
          <div class="stock-name">
            <span class="ticker">${esc(r.token)}</span>
          </div>
          <div class="stock-fullname">
            ${esc(r.name)}${r.ex ? ` • ${esc(shortEx(r.ex))}` : ''}
          </div>
          <div class="price text-xs opacity-60">
            ${fmtPrice(r.price, r.currency_quote)}
          </div>
        </div>

        <div class="stock-performance ${r[key] >= 0 ? 'positive' : 'negative'}">
          ${fmtPct(r[key])}
        </div>
      </div>
    `).join('');
  }

  function ensureMcShell(root) {
    // résumé
    ensureEl(root, 'crypto-mc-summary',
      '<div id="crypto-mc-summary" class="text-xs opacity-70 mb-2"></div>');

    // conteneur priorités + liste
    ensureEl(root, 'crypto-priority-container',
      '<div id="crypto-priority-container" class="hidden mt-3 p-3 rounded bg-white/5"><div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser-déposer)</div><div id="crypto-priority-list" class="space-y-1"></div></div>');

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
    // FIX: détecte l'UI existante avec tous les IDs possibles
    if (q('#crypto-cf-add') || q('#cf-add')) return;

    const filterSection = document.createElement('fieldset');
    filterSection.className = 'mb-4';
    filterSection.innerHTML = `
      <legend class="text-sm opacity-70 mb-2">Filtres personnalisés</legend>
      <div id="crypto-cf-pills" class="space-y-2 mb-2"></div>
      <div class="flex gap-1 items-center filter-controls">
        <select id="crypto-cf-metric" class="mini-select" style="flex:1.4;">
          ${Object.entries(METRICS).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join('')}
        </select>
        <select id="crypto-cf-op" class="mini-select" style="width:58px;">
          <option value=">=">&ge;</option>
          <option value=">">&gt;</option>
          <option value="=">=</option>
          <option value="<">&lt;</option>
          <option value="<=">&le;</option>
          <option value="!=">&ne;</option>
        </select>
        <input id="crypto-cf-val" type="number" step="0.01" class="mini-input" style="width:80px;" placeholder="0">
        <span class="text-xs opacity-60">%</span>
        <button id="crypto-cf-add" type="button" class="action-button" style="padding:6px 10px;" aria-label="Ajouter le filtre">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
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
        <button id="crypto-mc-apply" class="mc-search-button flex-1"><i class="fas fa-magic mr-2"></i>Appliquer</button>
        <button id="crypto-mc-reset" class="mc-action-button"><i class="fas fa-undo"></i></button>
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
      const before = document.getElementById('crypto-cf-pills') || document.getElementById('crypto-mc-results');
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

  // === v4.5 - Helpers near-tie ===
  const localWindow = (len) => Math.max(6, Math.min(40, Math.ceil(0.03 * len)));

  function localGap(sorted, v) {
    const a = sorted, n = a?.length || 0;
    if (!n) return Infinity;
    // binary search
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; (a[mid] < v) ? lo = mid + 1 : hi = mid; }
    const W = localWindow(n);
    const i = Math.min(Math.max(lo, 1), n - 2);
    const start = Math.max(1, i - W);
    const end   = Math.min(n - 2, i + W);
    const gaps = [];
    for (let j = start - 1; j <= end; j++) gaps.push(Math.abs(a[j + 1] - a[j]));
    gaps.sort((x, y) => x - y);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  }

  function nearTie(metric, vA, vB, dPct, n) {
    const c = TOL_PRESET.c;
    const baseP = c / Math.sqrt(Math.max(2, n));
    const { sorted = [], iqr = 1 } = state.cache[metric] || {};
    const gLoc = sorted.length ? localGap(sorted, (vA + vB) / 2) : 0;
    const tolV = Math.max(TOL_PRESET.kappa * (gLoc / iqr), (GAP_FLOOR[metric] || 0) / iqr);
    const nearV = sorted.length ? (Math.abs(vA - vB) / iqr <= tolV) : false;
    const nearP = Math.abs(dPct) <= Math.max(baseP, MIN_TOL_P);
    return nearV || nearP;
  }

  // v4.3 - Filtres personnalisés avec PRÉCISION ACCRUE (pas d'arrondi agressif)
  function passCustomFilters(i) {
    const EPS = 0.01; // tolérance réduite à 0.01% (uniquement pour l'égalité)
    for (const f of state.filters) {
      // Skip auto filters in validation (they are handled differently)
      if (f.__auto) continue;
      
      const raw = state.cache[f.metric]?.raw[i];
      if (!Number.isFinite(raw)) return false;

      // v4.3: Arrondi à 0.01 près au lieu de 0.1 (100x plus précis)
      const v = Math.round(raw * 100) / 100;
      const x = Math.round(Number(f.value) * 100) / 100;

      let op = f.operator;
      const map = {'&gt;=':'>=','&gt;':'>','&lt;=':'<=','&lt;':'<','&ne;':'!='};
      op = map[op] || op;

      // Pour les opérateurs stricts, pas de tolérance
      if (op === '>=') { if (!(v >= x)) return false; }
      else if (op === '>')  { if (!(v >  x)) return false; }
      else if (op === '<=') { if (!(v <= x)) return false; }
      else if (op === '<')  { if (!(v <  x)) return false; }
      else if (op === '!=') { if (!(Math.abs(v - x) > EPS)) return false; }
      else { // '=' -> quasi-égalité avec tolérance minimale
        if (!(Math.abs(v - x) <= EPS)) return false;
      }
    }
    return true;
  }

  // === v4.5 - Pool avec exclusion stablecoins et tolérance missing ===
  function poolIndices() {
    const kept = [];
    const req = state.selected;
    
    for (let i = 0; i < state.data.length; i++) {
      // Exclusion des stablecoins
      const tk = String(state.data[i].token || '').toUpperCase();
      if (STABLES.has(tk)) continue;
      
      // Filtres personnalisés
      if (!passCustomFilters(i)) continue;
      
      // Tolérance aux métriques manquantes
      let valid = 0;
      for (const m of req) {
        const v = state.cache[m]?.raw[i];
        if (Number.isFinite(v)) valid++;
      }
      if (valid >= Math.max(1, req.length - ALLOW_MISSING)) kept.push(i);
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

  // === v4.5 - Comparateur intelligent avec near-tie ===
  function smarterCompare(a, b, prios) {
    const n = state.data.length;
    for (let i = 0; i < prios.length; i++) {
      const m = prios[i];
      let pA = state.cache[m].rankPct[a], pB = state.cache[m].rankPct[b];
      if (!Number.isFinite(pA) && !Number.isFinite(pB)) continue;
      if (!Number.isFinite(pA)) return 1;
      if (!Number.isFinite(pB)) return -1;
      if (!isMax(m)) { pA = 1 - pA; pB = 1 - pB; }
      const vA = state.cache[m].raw[a], vB = state.cache[m].raw[b];
      const dPct = pA - pB;
      if (!nearTie(m, vA, vB, dPct, n)) return dPct > 0 ? -1 : 1;
    }
    // tie-break pondéré (poids décroissants)
    const weights = prios.map((_, i) => Math.pow(0.5, i));
    let sA = 0, sB = 0;
    for (let i = 0; i < prios.length; i++) {
      let pA = state.cache[prios[i]].rankPct[a], pB = state.cache[prios[i]].rankPct[b];
      if (!isMax(prios[i])) { pA = 1 - pA; pB = 1 - pB; }
      sA += (pA || 0) * weights[i];
      sB += (pB || 0) * weights[i];
    }
    if (sA !== sB) return sB - sA;
    return String(state.data[a].token || '').localeCompare(String(state.data[b].token || ''));
  }

  // === v4.5 - Staging pour scalabilité ===
  function scoreLexico(indices) {
    let candidates = indices.slice();
    if (candidates.length > 600) {
      // Stage 1: top 120 sur le premier critère
      candidates.sort((a, b) => smarterCompare(a, b, [state.selected[0]]));
      candidates = candidates.slice(0, 120);
      // Stage 2: top 40 sur les deux premiers
      if (state.selected.length > 1) {
        candidates.sort((a, b) => smarterCompare(a, b, [state.selected[0], state.selected[1]]));
        candidates = candidates.slice(0, 40);
      }
    }
    candidates.sort((a, b) => smarterCompare(a, b, state.selected));
    return candidates.slice(0, TOP_N);
  }

  // === v4.5 - Garde-fous automatiques ===
  function ensureCryptoAutoFilters() {
    let added = false;
    const perfSelected = state.selected.some(m => /^ret_/.test(m));
    const hasRiskCap = state.filters.some(f => f.__auto && (f.metric === 'vol_30d' || f.metric === 'dd90'));
    if (perfSelected && !hasRiskCap && state.cache?.vol_30d) {
      state.filters.push({ metric: 'vol_30d', operator: '<=', value: 150, __auto: true, __reason: 'riskCap' }); // 150% annu.
      added = true;
    }
    return added;
  }

  function cleanupAutoFilters() {
    state.filters = state.filters.filter(f => !f.__auto);
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
      wrap.innerHTML = `<div class="text-center text-teal-400 py-4">
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
      card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4 overflow-x-auto whitespace-nowrap stock-card-mc';
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
    const rootMcEl = document.getElementById('crypto-mc');
    if (!rootMcEl) return;

    // Coche le radio "Priorités"
    const pr = rootMcEl.querySelector('input[name="mc-mode"][value="lexico"]')
             || Array.from(rootMcEl.querySelectorAll('input[name="mc-mode"]')).find(r => 
                  /prior|prio|lexico/.test(r.value?.toLowerCase() || '') ||
                  /prior|prio/.test(r.closest('label')?.textContent?.toLowerCase() || '')
                )
             || rootMcEl.querySelector('input[name="mc-mode"]'); // fallback
    
    if (pr) pr.checked = true;

    // État + habillage visuel
    state.mode = 'lexico';
    rootMcEl.querySelectorAll('input[name="mc-mode"]').forEach(x=>{
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
    const row = q('#crypto-cf-add')?.parentElement || q('#cf-add')?.parentElement;
    if (!row) return;
    row.classList.add('filter-controls');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(120px,1fr) 56px 72px 14px 34px';
    row.style.gap = '6px';
    row.style.alignItems = 'center';
    row.style.maxWidth = '100%';
    row.style.overflow = 'hidden';
    row.style.whiteSpace = 'nowrap';
  }

  // v4.1 - REFACTORISÉE: Lecture scopée + pas de fallback à 0
  function addFilterNow() {
    const root = document.getElementById('crypto-mc');
    const metricEl = root?.querySelector('#crypto-cf-metric') || root?.querySelector('#cf-metric');
    const opEl     = root?.querySelector('#crypto-cf-op')     || root?.querySelector('#cf-op');
    const valEl    = root?.querySelector('#crypto-cf-val')    || root?.querySelector('#cf-val');
    if (!metricEl || !opEl || !valEl) return;

    const metric   = metricEl.value;
    let   operator = opEl.value;
    const valueRaw = valEl.value;                // ← on lit d'abord
    const value    = toNumUI(valueRaw);          // "10" -> 10 ; "10,5" -> 10.5 ; " 10 % " -> 10

    if (!metric || !Number.isFinite(value)) {
      console.warn('addFilterNow: valeur invalide', { valueRaw });
      return;                                    // ← jamais de 0 par défaut
    }

    const map = {'&gt;=':'>=','&gt;':'>','&lt;=':'<=','&lt;':'<','&ne;':'!='};
    operator = map[operator] || operator;

    const idx = state.filters.findIndex(f => f.metric === metric && f.operator === operator && !f.__auto);
    if (idx >= 0) state.filters[idx].value = value;
    else          state.filters.push({ metric, operator, value });

    // on nettoie seulement APRÈS avoir ajouté
    valEl.value = '';
    valEl.focus();

    drawFilters();
    compactFilterUI();
    refresh();                                   // applique immédiatement
  }

  // ==== UI bindings avec délégation robuste
  function wireUI() {
    const rootMcEl = document.getElementById('crypto-mc');
    if (!rootMcEl) return;

    // Créer l'UI si elle n'existe pas
    ensureModeRadios(rootMcEl);
    ensureMetricCheckboxes(rootMcEl);
    ensureFilterControls(rootMcEl);
    ensureActionButtons(rootMcEl);

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
      rootMcEl.querySelectorAll('input[name="mc-mode"]').forEach(x=>{
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
    rootMcEl.addEventListener('change', (e)=>{
      if (e.target && e.target.name === 'mc-mode') {
        applyModeFromTarget(e.target);
      }
    });

    // NOUVEAU: Support des événements input et click pour Safari/mobile
    rootMcEl.addEventListener('input', (e)=>{
      if (e.target && e.target.name === 'mc-mode') {
        applyModeFromTarget(e.target);
      }
    });

    // Delegation on the crypto panel (works for both ids)
    rootMcEl.addEventListener('click', (e) => {
      // toggle radios if a radio-label was clicked
      const lbl = e.target.closest('label');
      if (lbl) {
        const inp = lbl.querySelector('input[name="mc-mode"]');
        if (inp) { inp.checked = true; applyModeFromTarget(inp); return; }
      }

      // "+" button — handle both legacy and namespaced ids
      if (e.target.closest('#crypto-cf-add, #cf-add')) {
        e.preventDefault();
        e.stopImmediatePropagation(); // FIX: bloque les autres handlers sur le même élément
        e.stopPropagation();
        addFilterNow();
      }
    });

    // v4.1 - BLINDAGE: Binding direct en phase de capture pour passer AVANT tout le monde
    ['#crypto-cf-add', '#cf-add'].forEach(sel => {
      const btn = (document.getElementById('crypto-mc') || document).querySelector(sel);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // ← bloque les handlers hérités qui remettent 0%
        addFilterNow();
      }, true); // ← phase de capture : on passe AVANT tout le monde
    });

    // Enter key adds the filter
    (q('#crypto-cf-val') || q('#cf-val'))?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); addFilterNow(); }
    });

    // Synchronise à l'init
    syncSelectedFromCheckboxes();
    
    // État initial - cherche le radio checked ou prend le premier
    const checkedRadio = rootMcEl.querySelector('input[name="mc-mode"]:checked') 
                      || rootMcEl.querySelector('input[name="mc-mode"][value="balanced"]')
                      || rootMcEl.querySelector('input[name="mc-mode"]');
    if (checkedRadio) {
      checkedRadio.checked = true; // Force le checked si nécessaire
      applyModeFromTarget(checkedRadio);
    }

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
      const balancedRadio = rootMcEl.querySelector('input[name="mc-mode"][value="balanced"]') 
                         || rootMcEl.querySelector('input[name="mc-mode"]');
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
    ['change','click'].forEach(evt => rootMcEl.addEventListener(evt, compactFilterUI, {passive:true}));
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

  // === v4.5 - Masquer les filtres auto dans l'UI ===
  function drawFilters() {
    const cont = q('#crypto-cf-pills, #cf-pills, #crypto-mc-filters');
    if (!cont) return;
    
    // Filtrer les filtres auto
    const visible = state.filters.filter(f => !f.__auto);
    
    cont.innerHTML = visible.map((f,idx)=>{
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
      
      // Utiliser l'index dans le tableau filtré pour la suppression
      const realIdx = state.filters.indexOf(f);
      
      return `<div class="filter-item flex items-center gap-2 p-2 rounded bg-white/5">
        <span class="flex-1 min-w-0">
          <span class="whitespace-nowrap overflow-hidden text-ellipsis">${lab} <span class="${color} font-semibold">${displayOp} ${fmtFR(f.value)}%</span></span>
        </span>
        <button class="remove-filter text-red-400 hover:text-red-300 text-sm shrink-0" data-i="${realIdx}"><i class="fas fa-times"></i></button>
      </div>`;
    }).join('') || '<div class="text-xs opacity-50 text-center py-2">Aucun filtre</div>';
    
    cont.querySelectorAll('.remove-filter').forEach(btn=>{
      btn.addEventListener('click',e=>{
        const i = parseInt(e.currentTarget.dataset.i,10);
        state.filters.splice(i,1);
        drawFilters();
        compactFilterUI(); // Re-compacte après suppression
        refresh();  // réapplique immédiatement
      });
    });
  }

  // Refresh (SÉCURISÉ)
  function refresh(){
    if (!document.getElementById('crypto-mc-results')) return;
    
    // Garde-fous auto uniquement en Priorités
    if (state.mode === 'lexico') ensureCryptoAutoFilters();
    
    const total = state.data.length;
    if (!state.selected.length) {
      setSummary(total, 0);
      render([]);
      cleanupAutoFilters(); // Nettoyage
      return;
    }
    const pool = poolIndices();
    setSummary(total, pool.length);
    const topIdx = (state.mode==='balanced') ? scoreBalanced(pool) : scoreLexico(pool);
    render(topIdx);
    
    // Nettoyage pour ne pas figer les filtres auto
    cleanupAutoFilters();
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

    // NOUVEAU: Met à jour les compteurs et Top 10
    updateHeaderCounters();   // met à jour "X cryptomonnaies listées" + heure
    renderTop10Blocks();      // remplit les 4 Top 10

    buildCache();
    wireUI();
    refresh();

    // Optionnel: déclenche un événement pour d'autres scripts
    window.dispatchEvent(new CustomEvent('cryptoDataReady', { detail: state.data }));
  }

  // --- boot robuste : lance init() tout de suite si le DOM est déjà prêt
  function boot() {
    // ---- CSS de base pour compactage et structure ----
    const mcCompactCSS = document.createElement('style');
    mcCompactCSS.textContent = `
      /* Ligne des filtres personnalisés — compacte, une seule ligne, pas d'overflow */
      #crypto-mc fieldset > div:has(#crypto-cf-metric,#crypto-cf-op,#crypto-cf-val,#crypto-cf-add),
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

      #crypto-cf-metric, #cf-metric { min-width: 0 !important; font-size: 0.8rem !important; }
      #crypto-cf-op, #cf-op { width: 56px !important; font-size: 0.8rem !important; }
      #crypto-cf-val, #cf-val { width: 72px !important; font-size: 0.8rem !important; }
      #crypto-cf-add, #cf-add { 
        width: 34px !important; 
        height: 34px !important; 
        padding: 0 !important;
        display: inline-flex !important; 
        align-items: center !important; 
        justify-content: center !important;
        font-size: 0.8rem !important;
      }

      /* Le symbole % juste après l'input */
      #crypto-cf-val + span, #cf-val + span { 
        font-size: 12px !important; 
        opacity: .6 !important; 
        text-align: center !important; 
        white-space: nowrap !important; 
      }

      /* Les "pills" des filtres ajoutés restent fines */
      #crypto-cf-pills .filter-item, 
      #cf-pills .filter-item, 
      #crypto-mc-filters .filter-item { 
        padding: 6px 8px !important; 
        font-size: .85rem !important; 
      }
      #crypto-cf-pills .filter-item .flex-1, 
      #cf-pills .filter-item .flex-1,
      #crypto-mc-filters .filter-item .flex-1 { 
        min-width: 0 !important; 
      }
      #crypto-cf-pills .filter-item .flex-1 > span, 
      #cf-pills .filter-item .flex-1 > span,
      #crypto-mc-filters .filter-item .flex-1 > span { 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis; 
        display: block;
      }

      /* ===== STYLES DE BASE (seront surchargés par le thème) ===== */
      #crypto-mc .mc-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 8px !important;
        font-size: 0.85rem !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      }
      
      /* Inputs et selects compacts */
      #crypto-mc .mini-input, #crypto-mc .mini-select {
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
      
      /* Animation du conteneur des priorités */
      #crypto-priority-container {
        transition: all 0.3s ease;
      }

      /* Boutons d'action */
      #crypto-mc .mc-action-button, 
      #crypto-mc .mc-search-button,
      #crypto-mc .action-button {
        padding: 8px 16px !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        transition: all 0.2s !important;
        cursor: pointer !important;
      }
      
      #crypto-mc .mc-action-button:hover, 
      #crypto-mc .mc-search-button:hover,
      #crypto-mc .action-button:hover {
        transform: translateY(-1px);
      }

      /* Cartes résultats */
      #crypto-mc .stock-cards-container {
        gap: 10px !important;
      }

      /* Micro-interaction sur les métriques */
      #crypto-mc .stock-card-mc [class*="text-green"],
      #crypto-mc .stock-card-mc [class*="text-red"] {
        transition: transform 0.2s;
      }
      
      #crypto-mc .stock-card-mc:hover [class*="text-green"],
      #crypto-mc .stock-card-mc:hover [class*="text-red"] {
        transform: scale(1.05);
      }

      /* Bulle de rang */
      #crypto-mc .stock-card-mc .rank {
        width: 40px !important;
        height: 40px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;
        font-weight: 800 !important;
      }

      /* Top 3 avec couleurs or/argent/bronze */
      #crypto-mc .stock-card-mc:nth-child(1) .rank {
        background: linear-gradient(135deg, #FFD700, #FFA500) !important;
        color: #000 !important;
        border: none !important;
      }
      
      #crypto-mc .stock-card-mc:nth-child(2) .rank {
        background: linear-gradient(135deg, #C0C0C0, #B8B8B8) !important;
        color: #000 !important;
        border: none !important;
      }
      
      #crypto-mc .stock-card-mc:nth-child(3) .rank {
        background: linear-gradient(135deg, #CD7F32, #B87333) !important;
        color: #fff !important;
        border: none !important;
      }
    `;
    document.head.appendChild(mcCompactCSS);

    // === CSS pour le titre centré ===
    const mcTitleCSS = document.createElement('style');
    mcTitleCSS.textContent = `
      /* Centre le titre même si le parent est en flex */
      .mc-crypto-title,
      #crypto-mc .section-title {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        text-transform: uppercase !important;
        letter-spacing: .08em !important;
        font-weight: 800 !important;
        margin: 0 0 14px !important;
        font-size: clamp(18px, 2vw, 20px) !important;
      }
      
      .mc-crypto-title::after,
      #crypto-mc .section-title::after {
        content: '';
        display: block;
        height: 2px;
        width: 240px;
        margin: 8px auto 0;
        opacity: .75;
        animation: subtle-glow 3s ease-in-out infinite;
      }

      @keyframes subtle-glow {
        0%, 100% { opacity: 0.75; }
        50% { opacity: 1; }
      }

      /* Centre visuellement le bloc résultats */
      #crypto-mc #crypto-mc-results {
        max-width: 1120px;
        margin: 0 auto;
      }

      /* Mobile: ajuster la largeur max */
      @media (max-width: 768px) {
        #crypto-mc #crypto-mc-results {
          max-width: 100%;
          padding: 0 8px;
        }
        
        .mc-crypto-title::after,
        #crypto-mc .section-title::after {
          width: 60%;
        }
      }
    `;
    document.head.appendChild(mcTitleCSS);

    // --- THEME SYSTEM avec TEAL par défaut ---
    (function initThemeSystem() {
      const PALETTES = {
        teal:  { accent:'#14b8a6', accentRgb:'20,184,166', glassRgb:'8,43,39', softRgb:'31,64,55', accentText:'#042f2e' },
        green: { accent:'#10b981', accentRgb:'16,185,129', glassRgb:'6,31,23', softRgb:'20,48,38', accentText:'#052e16' },
        blue:  { accent:'#3b82f6', accentRgb:'59,130,246', glassRgb:'13,32,59', softRgb:'30,58,138', accentText:'#0a1929' },
        amber: { accent:'#f59e0b', accentRgb:'245,158,11', glassRgb:'56,38,0', softRgb:'120,53,15', accentText:'#1f1300' },
        slate: { accent:'#94a3b8', accentRgb:'148,163,184', glassRgb:'15,23,42', softRgb:'30,41,59', accentText:'#0b1220' },
      };

      function applyMcTheme(name = 'teal') {
        const t = PALETTES[name] || PALETTES.teal;
        
        const css = `
        /* Pills, radios, petits boutons */
        #crypto-mc .mc-pill {
          border: 1px solid rgba(${t.accentRgb}, .35) !important;
          background-color: rgba(${t.accentRgb}, .12) !important;
        }
        #crypto-mc .mc-pill:hover { 
          background-color: rgba(${t.accentRgb}, .22) !important; 
        }
        #crypto-mc .mc-pill.is-checked { 
          background-color: rgba(${t.accentRgb}, .25) !important; 
          border-color: ${t.accent} !important; 
        }

        /* Panneau priorités */
        #crypto-priority-container {
          background: rgba(${t.softRgb}, .08) !important;
          border: 1px solid rgba(${t.accentRgb}, .25) !important;
        }
        #crypto-priority-list .priority-item:hover { 
          background-color: rgba(${t.accentRgb}, .15) !important; 
        }

        /* Actions */
        #crypto-mc .mc-action-button, 
        #crypto-mc .action-button {
          background-color: rgba(${t.accentRgb}, .12) !important;
          color: ${t.accent} !important;
          border: 1px solid rgba(${t.accentRgb}, .35) !important;
        }
        #crypto-mc .mc-search-button {
          background-color: ${t.accent} !important;
          color: ${t.accentText} !important;
          border: none !important;
        }
        #crypto-mc .mc-action-button:hover, 
        #crypto-mc .mc-search-button:hover,
        #crypto-mc .action-button:hover {
          box-shadow: 0 4px 12px rgba(${t.accentRgb}, .30) !important;
        }

        /* Cartes / verre dépoli */
        #crypto-mc .glassmorphism {
          background: rgba(${t.glassRgb}, .42) !important;
          border: 1px solid rgba(${t.accentRgb}, .28) !important;
          box-shadow: 0 0 0 1px rgba(${t.accentRgb}, .10) inset, 
                     0 8px 24px rgba(${t.accentRgb}, .09) !important;
        }
        #crypto-mc #crypto-cf-pills .filter-item,
        #crypto-mc #crypto-mc-filters .filter-item {
          background: rgba(${t.softRgb}, .12) !important;
          border: 1px solid rgba(${t.accentRgb}, .2) !important;
        }

        /* Liste résultats (lignes) */
        #crypto-mc .stock-card-mc {
          background: rgba(${t.accentRgb}, .14) !important;
          border: 1px solid rgba(${t.accentRgb}, .30) !important;
          box-shadow: 0 6px 20px rgba(${t.accentRgb}, .12) !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        #crypto-mc .stock-card-mc:hover {
          background: rgba(${t.accentRgb}, .20) !important;
          box-shadow: 0 10px 28px rgba(${t.accentRgb}, .18) !important;
          transform: translateY(-2px);
        }

        /* Gradient subtil sur les Top 3 */
        #crypto-mc .stock-card-mc:nth-child(1),
        #crypto-mc .stock-card-mc:nth-child(2),
        #crypto-mc .stock-card-mc:nth-child(3) {
          background: linear-gradient(135deg, 
            rgba(${t.accentRgb}, .16), 
            rgba(${t.accentRgb}, .12)) !important;
        }

        #crypto-mc #crypto-mc-results.glassmorphism {
          background: rgba(${t.glassRgb}, .28) !important;
          border-color: rgba(${t.accentRgb}, .30) !important;
        }
        
        #crypto-mc .stock-card-mc .rank {
          background: rgba(${t.accentRgb}, .28) !important;
          color: #f8fafc !important;
          border: 1px solid rgba(${t.accentRgb}, .40) !important;
        }

        /* Titres + micro textes accent */
        .mc-crypto-title, 
        #crypto-mc .section-title { 
          color: ${t.accent} !important; 
        }
        .mc-crypto-title::after, 
        #crypto-mc .section-title::after {
          background: linear-gradient(90deg, transparent, ${t.accent}, transparent) !important;
        }
        #crypto-mc legend,
        #crypto-mc .text-xs.opacity-70,
        #crypto-mc .text-xs.opacity-60,
        #crypto-mc .text-xs.opacity-50 {
          color: rgba(${t.accentRgb}, .85) !important;
        }
        #crypto-mc #crypto-mc-summary { 
          color: rgba(${t.accentRgb}, .9) !important; 
        }
        `;
        
        let tag = document.getElementById('crypto-mc-theme');
        if (!tag) {
          tag = document.createElement('style');
          tag.id = 'crypto-mc-theme';
          document.head.appendChild(tag);
        }
        tag.textContent = css;
        
        // Persister le choix
        try { 
          localStorage.setItem('crypto-mc-theme', name); 
        } catch(e) {}
      }

      // Expose globalement
      window.applyMcTheme = applyMcTheme;
      
      // Appliquer le thème (priorité: localStorage > config > défaut)
      let theme = 'teal';
      try {
        const saved = localStorage.getItem('crypto-mc-theme');
        if (saved && PALETTES[saved]) theme = saved;
        else if (window.CRYPTO_MC_THEME && PALETTES[window.CRYPTO_MC_THEME]) {
          theme = window.CRYPTO_MC_THEME;
        }
      } catch(e) {}
      
      applyMcTheme(theme);
    })();

    // === Titre "TOP 10 — COMPOSER MULTI-CRITÈRES" (adapté au thème) ===
    (function setCryptoMcTitle(){
      const root = document.getElementById('crypto-mc');
      if (!root) return;
      // essaie d'attraper le titre le plus proche de #crypto-mc (robuste)
      const prev = root.previousElementSibling;
      let title =
        root.closest('section, .section, .panel, .card, .block')?.querySelector('.section-title')
        || (prev && prev.classList?.contains('section-title') ? prev : null);

      if (title) {
        title.textContent = 'TOP 10 — COMPOSER MULTI-CRITÈRES';
        title.classList.add('mc-crypto-title');   // applique le style du thème
      }
    })();

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
