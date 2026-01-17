# Composer Multi-critères - Guide d'implémentation

## Objectif
Remplacer les sections "Sélecteur de marché" et "Top 10 Performance du NASDAQ" par un Composer multi-critères intelligent.

## Étapes d'implémentation

### 1. Modifications HTML (dans liste.html)

#### A. Ajouter les styles CSS dans la balise `<style>`

```css
/* Composer Multi-critères Styles */
.mini-input,.mini-select{
    padding:8px 10px;
    border-radius:8px;
    border:1px solid var(--card-border);
    background:rgba(255,255,255,0.05);
    font-size:.9rem
}
.mini-input{width:110px}
.mc-pill{
    display:inline-flex;
    gap:8px;
    align-items:center;
    padding:6px 10px;
    border:1px solid var(--card-border);
    border-radius:10px;
    background:rgba(255,255,255,0.04);
    cursor:pointer;
    font-size:.9rem;
    transition: all 0.2s ease;
}
.mc-pill:hover {
    background:rgba(0,255,135,0.08);
}
.mc-pill input{accent-color:#00FF87}
.mc-row{display:flex;gap:8px;align-items:center}
.mc-chip{
    display:inline-flex;
    gap:6px;
    align-items:center;
    padding:4px 8px;
    border:1px solid var(--card-border);
    border-radius:999px;
    background:rgba(0,255,135,0.06);
    margin-right:6px;
    margin-bottom:6px
}
.mc-chip button{
    border:none;
    background:transparent;
    cursor:pointer;
    opacity:.7
}
.mc-chip button:hover{opacity:1;color:var(--accent-color)}
.mc-score{font-weight:800;color:var(--accent-color)}
.mc-mode-btn{
    display:inline-flex;
    gap:8px;
    align-items:center;
    padding:8px 16px;
    border:1px solid var(--card-border);
    border-radius:8px;
    background:rgba(255,255,255,0.04);
    cursor:pointer;
    font-size:.9rem;
    transition: all 0.2s ease;
}
.mc-mode-btn.active{
    background:var(--accent-subtle);
    color:var(--accent-color);
    border-color:var(--accent-medium)
}
.mc-mode-btn input{display:none}
```

#### B. Remplacer les sections marché par le Composer

Chercher et remplacer depuis :
```html
<!-- Sélecteur de marché (DEUXIÈME) -->
<div class="market-selector mb-8">
```

Jusqu'à (inclus) :
```html
</div>
<!-- Top Performers (ancien design, maintenu pour compatibilité) -->
```

Par :

```html
<!-- COMPOSER MULTI-CRITÈRES (remplace sélecteur de marché et Top 10 NASDAQ) -->
<div class="composer-section mb-10">
    <h2 class="section-title mb-4">Composer Multi-critères</h2>
    
    <div id="mc-root" class="glassmorphism rounded-lg p-6">
        <div class="grid lg:grid-cols-3 gap-6">
            
            <!-- (A) Critères et Mode -->
            <div class="space-y-4">
                <div>
                    <h3 class="text-sm font-semibold text-green-400 mb-3">Critères de sélection</h3>
                    <div class="flex flex-wrap gap-2">
                        <label class="mc-pill">
                            <input id="m-perf_1y" type="checkbox" checked>
                            <span>Perf 1Y ↑</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-perf_ytd" type="checkbox">
                            <span>YTD ↑</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-perf_3m" type="checkbox">
                            <span>Perf 3M ↑</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-perf_1m" type="checkbox">
                            <span>Perf 1M ↑</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-volatility_3y" type="checkbox" checked>
                            <span>Vol 3Y ↓</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-max_drawdown_3y" type="checkbox">
                            <span>Max DD 3Y ↓</span>
                        </label>
                        <label class="mc-pill">
                            <input id="m-dividend_yield" type="checkbox">
                            <span>Div. Yield ↑</span>
                        </label>
                    </div>
                </div>

                <div>
                    <h3 class="text-sm font-semibold text-green-400 mb-3">Mode d'agrégation</h3>
                    <div class="flex gap-3">
                        <label class="mc-mode-btn active">
                            <input type="radio" name="mc-mode" value="balanced" checked>
                            <span>Équilibre auto</span>
                        </label>
                        <label class="mc-mode-btn">
                            <input type="radio" name="mc-mode" value="lexico">
                            <span>Priorités</span>
                        </label>
                    </div>

                    <div id="mc-lexico" class="mt-3 p-3 bg-white/5 rounded-lg hidden">
                        <div class="text-xs opacity-70 mb-2">Ordre de priorité :</div>
                        <div class="grid grid-cols-3 gap-2">
                            <select id="mc-prio1" class="mini-select">
                                <option value="">Priorité 1</option>
                            </select>
                            <select id="mc-prio2" class="mini-select">
                                <option value="">Priorité 2</option>
                            </select>
                            <select id="mc-prio3" class="mini-select">
                                <option value="">Priorité 3</option>
                            </select>
                        </div>
                        <div class="text-[11px] opacity-50 mt-2">Tolérance: 0,5pt pour éviter les micro-écarts</div>
                    </div>
                </div>
            </div>

            <!-- (B) Filtres -->
            <div class="space-y-4">
                <div>
                    <h3 class="text-sm font-semibold text-green-400 mb-3">Filtres rapides</h3>
                    <div class="space-y-2">
                        <label class="mc-row">
                            <input id="q-1y10" type="checkbox">
                            <span>Inclure: Perf 1Y ≥ <strong class="text-green-400">+10%</strong></span>
                        </label>
                        <label class="mc-row">
                            <input id="q-ytd10" type="checkbox">
                            <span>Inclure: YTD ≥ <strong class="text-green-400">+10%</strong></span>
                        </label>
                        <label class="mc-row">
                            <input id="q-noNeg1y" type="checkbox">
                            <span>Exclure: Perf 1Y ≤ <strong class="text-red-400">0%</strong></span>
                        </label>
                        <label class="mc-row">
                            <input id="q-vol40" type="checkbox">
                            <span>Exclure: Vol 3Y ≥ <strong class="text-orange-400">40%</strong></span>
                        </label>
                    </div>
                </div>

                <div>
                    <h3 class="text-sm font-semibold text-green-400 mb-3">Filtre personnalisé</h3>
                    <div class="flex gap-2 items-center">
                        <select id="mc-free-metric" class="mini-select">
                            <option value="perf_1y">Perf 1Y</option>
                            <option value="perf_ytd">YTD</option>
                            <option value="perf_3m">Perf 3M</option>
                            <option value="perf_1m">Perf 1M</option>
                            <option value="volatility_3y">Vol 3Y</option>
                            <option value="max_drawdown_3y">Max DD 3Y</option>
                            <option value="dividend_yield">Div. Yield</option>
                        </select>
                        <select id="mc-free-op" class="mini-select">
                            <option value=">=">≥</option>
                            <option value="<=">≤</option>
                        </select>
                        <input id="mc-free-value" class="mini-input" type="number" step="0.1" placeholder="valeur %">
                        <button id="mc-free-add" class="action-button">Ajouter</button>
                    </div>
                    <div id="mc-free-list" class="text-xs opacity-80 mt-2"></div>
                </div>
            </div>

            <!-- (C) Actions -->
            <div>
                <h3 class="text-sm font-semibold text-green-400 mb-3">Actions</h3>
                <div class="flex gap-2 mb-4">
                    <button id="mc-apply" class="search-button flex-1">
                        <i class="fas fa-magic mr-2"></i>Appliquer
                    </button>
                    <button id="mc-reset" class="action-button">
                        <i class="fas fa-undo mr-2"></i>Reset
                    </button>
                </div>
                <div class="text-xs opacity-60 p-3 bg-white/5 rounded-lg">
                    <div class="font-semibold mb-1">Output: Top 10 optimisé</div>
                    <div id="mc-summary" class="mt-1">Mode: Équilibre auto • 2 critères actifs</div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Résultats du Composer (remplace les anciennes cartes) -->
    <div class="top-stocks-container mt-6">
        <h3 class="text-lg font-semibold mb-4">
            Résultats du Composer <span id="mc-result-label" class="text-green-400"></span>
        </h3>
        <div id="composer-results" class="stock-cards-container">
            <!-- Les cartes seront générées ici par le JS -->
        </div>
    </div>
</div>
```

### 2. Modifications JavaScript (dans liste-script.js)

À ajouter à la FIN du fichier liste-script.js, après le dernier `});` :

```javascript
// === MODULE MC (Multi-Critères Composer) ===================================
(function(){
  // Parser de pourcentage
  const p = (s) => {
    if(s==null||s==='-') return NaN;
    let t = String(s).replace(',', '.').replace(/[+%]/g,'').trim();
    if(t.includes('(') && t.includes(')')) {
      t = '-' + t.replace(/[()]/g,'');
    }
    return parseFloat(t);
  };

  // Mapping métriques
  const METRICS = {
    perf_1y:         { label: 'Perf 1Y',     getter: s => p(s.perf_1y),        maximize: true  },
    perf_ytd:        { label: 'YTD',         getter: s => p(s.ytd||s.perf_ytd), maximize: true  },
    perf_3m:         { label: 'Perf 3M',     getter: s => p(s.perf_3m),        maximize: true  },
    perf_1m:         { label: 'Perf 1M',     getter: s => p(s.perf_1m),        maximize: true  },
    volatility_3y:   { label: 'Vol 3Y',      getter: s => p(s.volatility_3y),  maximize: false },
    max_drawdown_3y: { label: 'Max DD 3Y',   getter: s => p(s.max_drawdown_3y),maximize: false },
    dividend_yield:  { label: 'Div. Yield',  getter: s => p(s.dividend_yield), maximize: true  },
  };

  // DOM refs
  const root = document.getElementById('mc-root');
  if(!root) return;

  const modeRadios = [...root.querySelectorAll('input[name="mc-mode"]')];
  const modeBtns = [...root.querySelectorAll('.mc-mode-btn')];
  const lexicoBox = document.getElementById('mc-lexico');
  const prio1 = document.getElementById('mc-prio1');
  const prio2 = document.getElementById('mc-prio2');
  const prio3 = document.getElementById('mc-prio3');

  const quick = {
    q1y10: document.getElementById('q-1y10'),
    qytd10: document.getElementById('q-ytd10'),
    qNoNeg1y: document.getElementById('q-noNeg1y'),
    qVol40: document.getElementById('q-vol40')
  };

  const freeMetric = document.getElementById('mc-free-metric');
  const freeOp = document.getElementById('mc-free-op');
  const freeValue = document.getElementById('mc-free-value');
  const freeAddBtn = document.getElementById('mc-free-add');
  const freeList = document.getElementById('mc-free-list');

  const applyBtn = document.getElementById('mc-apply');
  const resetBtn = document.getElementById('mc-reset');
  const summary = document.getElementById('mc-summary');
  const resultsContainer = document.getElementById('composer-results');

  // État
  const state = {
    mode: 'balanced',
    freeRules: []
  };

  // Remplir les selects
  function fillPrioSelects(){
    const opts = Object.keys(METRICS)
      .map(k => `<option value="${k}">${METRICS[k].label}${METRICS[k].maximize?' ↑':' ↓'}</option>`)
      .join('');
    [prio1, prio2, prio3].forEach(sel => { 
      sel.innerHTML = `<option value="">(aucune)</option>${opts}`; 
    });
    prio1.value = 'perf_1y';
    prio2.value = 'volatility_3y';
    prio3.value = 'perf_ytd';
  }

  // Critères sélectionnés
  function selectedMetrics(){
    const ids = Object.keys(METRICS).filter(id => {
      const el = document.getElementById('m-'+id);
      return el && el.checked;
    });
    return ids.length ? ids : ['perf_1y','volatility_3y'];
  }

  // Univers des stocks
  function universe(){
    const idx = (window.stocksData && window.stocksData.indices) || {};
    const out = [];
    Object.values(idx).forEach(list => (list||[]).forEach(s => out.push(s)));
    return out;
  }

  // Filtres
  function applyFilters(list){
    const rules = [];
    if (quick.q1y10.checked) rules.push({metric:'perf_1y', op: '>=', value: 10});
    if (quick.qytd10.checked) rules.push({metric:'perf_ytd', op: '>=', value: 10});
    if (quick.qNoNeg1y.checked) rules.push({metric:'perf_1y', op: '>', value: 0});
    if (quick.qVol40.checked) rules.push({metric:'volatility_3y', op: '<', value: 40});
    state.freeRules.forEach(r => rules.push(r));

    return list.filter(s => {
      for (const r of rules){
        const val = METRICS[r.metric].getter(s);
        if (!Number.isFinite(val)) return false;
        if (r.op==='>=') { if (!(val >= r.value)) return false; }
        else if (r.op==='<=') { if (!(val <= r.value)) return false; }
        else if (r.op==='>') { if (!(val > r.value)) return false; }
        else if (r.op==='<') { if (!(val < r.value)) return false; }
      }
      return true;
    });
  }

  // Percentile rank avec winsorisation
  function percentileRank(sorted, v){
    if (!Number.isFinite(v) || sorted.length===0) return NaN;
    const lo = sorted[Math.floor(0.01*(sorted.length-1))];
    const hi = sorted[Math.ceil(0.99*(sorted.length-1))];
    const x = Math.min(hi, Math.max(lo, v));
    let i = 0;
    while (i<sorted.length && sorted[i] <= x) i++;
    if (sorted.length===1) return 1;
    const r = (i-1) / (sorted.length-1);
    return Math.max(0, Math.min(1, r));
  }

  // Mode Équilibre
  function rankBalanced(list, metrics){
    const sortedDict = {};
    metrics.forEach(m => {
      const arr = list.map(s => METRICS[m].getter(s)).filter(Number.isFinite).sort((a,b)=>a-b);
      sortedDict[m] = arr;
    });
    
    const scored = [];
    for (const s of list){
      let sum = 0, k = 0;
      for (const m of metrics){
        const v = METRICS[m].getter(s);
        if (!Number.isFinite(v)) continue;
        let pr = percentileRank(sortedDict[m], v);
        if (!Number.isFinite(pr)) continue;
        if (METRICS[m].maximize === false) pr = 1 - pr;
        sum += pr; k++;
      }
      if (k>0){
        scored.push({ s, score: sum / k });
      }
    }
    scored.sort((a,b) => b.score - a.score);
    return scored;
  }

  // Mode Priorités
  function rankLexico(list){
    const prios = [prio1.value, prio2.value, prio3.value].filter(Boolean);
    if (prios.length===0) prios.push('perf_1y','volatility_3y');
    const EPS = 0.5;
    const cmp = (a,b) => {
      for (const m of prios){
        const ga = METRICS[m].getter(a);
        const gb = METRICS[m].getter(b);
        const dir = METRICS[m].maximize ? -1 : +1;
        const av = Number.isFinite(ga) ? ga : (METRICS[m].maximize ? -1e9 : +1e9);
        const bv = Number.isFinite(gb) ? gb : (METRICS[m].maximize ? -1e9 : +1e9);
        if (Math.abs(av - bv) > EPS) return (av - bv) * dir;
      }
      return 0;
    };
    const arr = list.slice().sort(cmp);
    return arr.map(s => ({ s, score: NaN }));
  }

  // Rendu des cartes
  function renderTop10(entries){
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    const top10 = entries.slice(0,10);

    // Compléter avec placeholders si <10
    while (top10.length < 10) top10.push({ s: null, score: NaN });

    top10.forEach((e, i) => {
      const card = document.createElement('div');
      card.className = 'stock-card';
      
      if (!e.s){
        card.innerHTML = `
          <div class="rank">#${i+1}</div>
          <div class="stock-info">
            <div class="stock-name">—</div>
            <div class="stock-fullname">Aucune action</div>
          </div>
          <div class="stock-performance neutral">—</div>
        `;
      } else {
        const tkr = e.s.ticker || e.s.symbol || (e.s.name||'').split(' ')[0] || '—';
        const scoreText = Number.isFinite(e.score) 
          ? `<span class="mc-score">${Math.round(e.score*100)}pts</span>`
          : (e.s.perf_1y || e.s.ytd || '—');
        
        card.innerHTML = `
          <div class="rank ${i<3 ? 'top-3' : ''}">#${i+1}</div>
          <div class="stock-info">
            <div class="stock-name">${tkr} ${e.s.marketIcon||''}</div>
            <div class="stock-fullname" title="${e.s.name||''}">${e.s.name||'—'}</div>
          </div>
          <div class="stock-performance">${scoreText}</div>
        `;
      }
      resultsContainer.appendChild(card);
    });
    
    // Update label
    const label = document.getElementById('mc-result-label');
    if(label) label.textContent = `(${entries.length} actions filtrées)`;
  }

  // Update summary
  function updateSummary(listLen, keptLen, metrics){
    const mode = state.mode==='balanced' ? 'Équilibre auto' : 'Priorités';
    summary.innerHTML = `Mode: ${mode} • ${metrics.length} critères • ${keptLen}/${listLen} actions`;
  }

  // Compute et render
  function computeAndRender(){
    const base = universe();
    if (!base || base.length===0) return;
    
    const filtered = applyFilters(base);
    const metrics = selectedMetrics();
    
    const result = (state.mode==='balanced')
      ? rankBalanced(filtered, metrics)
      : rankLexico(filtered.map(s => s));
    
    updateSummary(base.length, filtered.length, metrics);
    renderTop10(result);
  }

  // Mode toggle
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const radio = btn.querySelector('input');
      if(radio) {
        radio.checked = true;
        state.mode = radio.value;
        lexicoBox.classList.toggle('hidden', state.mode!=='lexico');
      }
    });
  });

  // Free filters
  freeAddBtn.addEventListener('click', () => {
    const metric = freeMetric.value;
    const op = freeOp.value;
    const val = parseFloat(freeValue.value);
    if (!metric || !op || !Number.isFinite(val)) return;
    
    state.freeRules.push({metric, op, value: val});
    
    const chip = document.createElement('span');
    chip.className = 'mc-chip';
    chip.innerHTML = `${METRICS[metric].label} ${op} ${val}% <button title="Supprimer">&times;</button>`;
    const idx = state.freeRules.length-1;
    chip.querySelector('button').addEventListener('click', ()=>{
      state.freeRules.splice(idx,1);
      chip.remove();
    });
    freeList.appendChild(chip);
    freeValue.value = '';
  });

  // Apply button
  applyBtn.addEventListener('click', computeAndRender);
  
  // Reset button
  resetBtn.addEventListener('click', () => {
    // Reset checkboxes
    document.getElementById('m-perf_1y').checked = true;
    document.getElementById('m-volatility_3y').checked = true;
    ['perf_ytd','perf_3m','perf_1m','max_drawdown_3y','dividend_yield'].forEach(id=>{
      const el = document.getElementById('m-'+id);
      if (el) el.checked = false;
    });
    Object.values(quick).forEach(el => el.checked = false);
    
    // Clear free rules
    state.freeRules = [];
    freeList.innerHTML = '';
    
    // Reset mode
    modeBtns.forEach(b => b.classList.remove('active'));
    modeBtns[0].classList.add('active');
    modeRadios[0].checked = true;
    state.mode = 'balanced';
    lexicoBox.classList.add('hidden');
    
    // Reset priorities
    prio1.value='perf_1y';
    prio2.value='volatility_3y';
    prio3.value='perf_ytd';
    
    computeAndRender();
  });

  // Hook into data loading
  window.addEventListener('topFiltersChanged', () => setTimeout(computeAndRender, 100));

  // Expose API
  window.MC = { refresh: computeAndRender };

  // Initialize
  fillPrioSelects();
  setTimeout(computeAndRender, 500);
})();
```

### 3. Hook d'intégration

Dans liste-script.js, chercher la fonction `renderStocksData()` et ajouter à la fin :

```javascript
// Mettre à jour le Composer après chargement des données
if(window.MC && window.MC.refresh) {
    window.MC.refresh();
}
```

## Résultat attendu

Le Composer Multi-critères remplace l'ancienne interface et offre :

1. **Sélection de critères** : 7 métriques cochables
2. **2 modes sans pondération** : Équilibre auto ou Priorités
3. **Filtres rapides** : Perf 1Y ≥ 10%, exclure Vol 3Y ≥ 40%, etc.
4. **Filtres personnalisés** : créer ses propres règles
5. **Top 10 optimisé** : toujours exactement 10 actions

## Notes techniques

- Le module MC est isolé dans une IIFE pour éviter les conflits
- Compatible avec la structure existante de stocksData
- Réutilise le système de cartes existant
- Responsive et suit le thème dark/light
