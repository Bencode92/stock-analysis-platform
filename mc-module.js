// ===== MC (Multi-Critères) – Module Optimisé v3.8+ avec Presets Hard-Tuned ===================
// v3.8+: Presets "hard-tuned" optimisés pour dénicher les vraies pépites
// v3.8: Système de presets complets avec API (Défensif, Rendement, Agressif, Croissance)
// v3.7+: Boutons ▲▼ pour déplacement précis (1 clic = 1 place) + scroll stable
// v3.7: Système de tags multi-select avec recherche intégrée pour les filtres géographiques
// v3.6: Multi-sélection pour Région/Pays/Secteur avec interface améliorée
// v3.5: Optimisation du Drag & Drop avec scheduleCompute() et updatePriorityNumbersOnly()
// v3.4: Payout basé uniquement sur TTM avec fallbacks robustes
(function(){
  // Attendre que le DOM soit prêt
  if (!document.querySelector('#mc-section')) {
    console.log('⏳ MC: En attente du DOM...');
    setTimeout(arguments.callee, 500);
    return;
  }

  const root = document.querySelector('#mc-section');
  const results = document.querySelector('#mc-results .stock-cards-container');
  
  if(!root || !results) {
    console.error('❌ MC: Éléments DOM non trouvés', {root, results});
    return;
  }

  console.log('✅ MC: Éléments DOM trouvés');

  // ==== INJECTION DES STYLES POUR LES TAGS + BOUTONS ▲▼ + PRESETS ====
  if (!document.querySelector('#mc-tags-styles')) {
    const style = document.createElement('style');
    style.id = 'mc-tags-styles';
    style.textContent = `
      /* === Tag MultiSelect (msel) === */
      .msel{position:relative}
      .msel-label{font-size:.75rem;opacity:.7;min-width:60px;margin-top:.25rem}
      .msel-trigger{width:100%;display:flex;align-items:center;gap:.5rem;min-height:40px;
        padding:8px 10px;border-radius:10px;border:1px solid rgba(0,255,135,0.3);
        background:rgba(0,255,135,0.05);color:#fff;text-align:left;cursor:pointer;
        transition:all 0.3s ease}
      .msel-trigger:hover{border-color:#00ff87;background:rgba(0,255,135,0.08);
        box-shadow:0 0 10px rgba(0,255,135,0.2)}
      .msel-placeholder{opacity:.5}
      .msel-chips{display:flex;flex-wrap:wrap;gap:6px;flex:1}
      .msel-chip{display:inline-flex;align-items:center;gap:6px;
        padding:4px 8px;border-radius:999px;background:rgba(0,255,135,0.15);
        border:1px solid rgba(0,255,135,0.35);font-size:.8rem;
        transition:all 0.2s ease}
      .msel-chip:hover{background:rgba(0,255,135,0.25);transform:translateY(-1px)}
      .msel-chip i{opacity:.7;cursor:pointer;transition:color 0.2s}
      .msel-chip i:hover{color:#ff4757}
      .msel{--msel-elev:0 8px 24px rgba(0,200,255,.18)}
      .msel-panel{position:absolute;z-index:60;top:calc(100% + 6px);left:0;right:0;
        background:linear-gradient(135deg,rgba(10,25,41,0.98),rgba(15,35,55,0.95));
        backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
        border:1px solid rgba(0,255,135,0.3);border-radius:12px;padding:10px;
        box-shadow:var(--msel-elev);display:none;max-height:280px;overflow:auto;
        opacity:0;transform:translateY(-10px);
        transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}
      .msel.open .msel-panel{display:block;opacity:1;transform:translateY(0)}
      .msel-search{width:100%;padding:8px 10px;border-radius:10px;
        border:1px solid rgba(0,255,135,0.3);
        background:rgba(0,255,135,0.06);color:#fff;
        transition:all 0.2s ease}
      .msel-search:focus{border-color:#00ff87;outline:none;
        box-shadow:0 0 0 2px rgba(0,255,135,0.2)}
      .msel-search::placeholder{color:rgba(255,255,255,0.4)}
      .msel-actions{display:flex;gap:8px;margin:8px 0}
      .msel-actions button{flex:1;padding:6px 10px;border-radius:8px;
        border:1px solid rgba(0,255,135,0.3);
        background:rgba(0,255,135,0.08);color:#00ff87;cursor:pointer;
        transition:all 0.2s ease;font-size:0.8rem;font-weight:500}
      .msel-actions button:hover{background:rgba(0,255,135,0.15);
        transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,255,135,0.2)}
      .msel-list{margin-top:4px;display:grid;grid-template-columns:1fr;gap:4px;
        max-height:180px;overflow-y:auto;padding-right:4px}
      .msel-list::-webkit-scrollbar{width:4px}
      .msel-list::-webkit-scrollbar-track{background:rgba(255,255,255,0.05);border-radius:2px}
      .msel-list::-webkit-scrollbar-thumb{background:rgba(0,255,135,0.3);border-radius:2px}
      .msel-list::-webkit-scrollbar-thumb:hover{background:rgba(0,255,135,0.5)}
      .msel-option{display:flex;align-items:center;gap:8px;padding:6px 8px;
        border-radius:8px;cursor:pointer;transition:all 0.2s ease}
      .msel-option:hover{background:rgba(0,255,135,0.08)}
      .msel-option input[type="checkbox"]{accent-color:#00ff87;cursor:pointer}
      .msel-option span{font-size:0.85rem}
      .msel-empty{text-align:center;padding:20px;opacity:0.5;font-size:0.85rem}
      
      /* === Boutons priorités ▲▼ === */
      .btn-up,.btn-down{font-size:.8rem;opacity:.75;padding:2px 6px;border-radius:6px;
        border:1px solid rgba(0,255,135,.25);background:rgba(0,255,135,.06);
        cursor:pointer;transition:all 0.2s ease}
      .btn-up:hover,.btn-down:hover{opacity:1;background:rgba(0,255,135,.12);
        transform:translateY(-1px)}
      
      /* === Boutons Presets v3.8 === */
      .preset-btn {
        padding: 8px 16px;
        border-radius: 10px;
        border: 1px solid rgba(0,255,135,0.3);
        background: rgba(0,255,135,0.05);
        color: #fff;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 0.9rem;
      }
      .preset-btn:hover {
        background: rgba(0,255,135,0.1);
        border-color: #00ff87;
        transform: translateY(-2px);
      }
      .preset-btn.active {
        background: rgba(0,255,135,0.2);
        border-color: #00ff87;
        box-shadow: 0 0 10px rgba(0,255,135,0.3);
      }
      #mc-presets-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
        padding: 12px;
        background: rgba(255,255,255,0.03);
        border-radius: 12px;
        border: 1px solid rgba(0,255,135,0.15);
      }
      .presets-label {
        display: flex;
        align-items: center;
        margin-right: 12px;
        font-size: 0.85rem;
        opacity: 0.7;
      }
      
      @media (min-width: 1024px){
        .msel-list{grid-template-columns:1fr 1fr}
      }
      /* Animation pour les chips */
      @keyframes chip-enter{
        from{opacity:0;transform:scale(0.8)}
        to{opacity:1;transform:scale(1)}
      }
      .msel-chip{animation:chip-enter 0.3s ease}
    `;
    document.head.appendChild(style);
  }

  // ==== CONSTANTES PERFORMANCE ====
  const GAP_FLOOR = { 
    ytd: 0.3, 
    dividend_yield_reg: 0.1,     // Pour régulier
    dividend_yield_ttm: 0.15,    // Pour TTM
    volatility_3y: 0.2, 
    max_drawdown_3y: 0.3,
    perf_daily: 0.5,
    perf_1m: 0.4,
    perf_3m: 0.4,
    perf_1y: 0.3,
    perf_3y: 0.3,
    payout_ratio: 0.2
  };
  
  const TOL_PRESET = { c: 0.6, kappa: 1.5 }; 
  const MIN_TOL_P = 0.012; // Plancher à 1.2pp
  const TOP_N = 10;
  const ALLOW_MISSING = 1; // Tolérer 1 critère manquant
  const CONFIG = { DEBUG: false }; // Config pour debug
  
  // Seuil 1% appliqué à tout dividende coché (REG/TTM), dans tous les modes
  const MIN_DY_SELECTED = 1.0;

  // Cache global pour les métriques
  const cache = {};
  const masks = { geo: null, custom: null, final: null };

  // Parser amélioré avec minus unicode et espaces
  const p = (s)=>{
    if(s==null||s==='-'||s==='') return NaN;
    const t = String(s)
      .replace(/\\u2212/g,'-')        // minus unicode
      .replace(',', '.')             // décimal FR
      .replace(/[+%\\s]/g,'')         // +, %, espaces
      .trim();
    return parseFloat(t);
  };

  // Helpers pour dividendes v3.1
  const getDivReg = s => {
    const val = Number.isFinite(s.dividend_yield_regular) 
      ? s.dividend_yield_regular
      : (s.dividend_yield_src === 'REG' && Number.isFinite(s.dividend_yield) ? s.dividend_yield : NaN);
    return p(val);
  };

  const getDivTTM = s => {
    if (Number.isFinite(s.dividend_yield_ttm)) {
      return s.dividend_yield_ttm;
    }
    if (Number.isFinite(s.total_dividends_ttm) && Number.isFinite(s.price) && s.price > 0) {
      return (s.total_dividends_ttm / s.price) * 100;
    }
    return NaN;
  };

  // MÉTRIQUES v3.4 avec Payout TTM unifié
  const METRICS = {
    // Performance
    perf_daily:      {label:'Perf Daily',     unit:'%', get:s=>p(s.perf_daily||s.daily||s.perf_1d||s.change_percent), max:true},
    perf_1m:         {label:'Perf 1M',        unit:'%', get:s=>p(s.perf_1m),        max:true},
    perf_3m:         {label:'Perf 3M',        unit:'%', get:s=>p(s.perf_3m),        max:true},
    ytd:             {label:'YTD',            unit:'%', get:s=>p(s.perf_ytd||s.ytd),max:true},
    perf_1y:         {label:'Perf 1Y',        unit:'%', get:s=>p(s.perf_1y),        max:true},
    perf_3y:         {label:'Perf 3Y',        unit:'%', get:s=>p(s.perf_3y||s.perf_3_years), max:true},
    // Risque
    volatility_3y:   {label:'Vol 3Y',         unit:'%', get:s=>p(s.volatility_3y),  max:false},
    max_drawdown_3y: {label:'Max DD 3Y',      unit:'%', get:s=>p(s.max_drawdown_3y),max:false},
    // Dividendes v3.1
    dividend_yield_reg: {
      label: 'Div. REG',
      unit: '%',
      get: getDivReg,
      max: true,
      tooltip: 'Dividendes réguliers/récurrents (stables)'
    },
    dividend_yield_ttm: {
      label: 'Div. TTM',
      unit: '%',
      get: getDivTTM,
      max: true,
      tooltip: 'Total des dividendes versés sur 12 mois (réguliers + spéciaux)'
    },
    // Payout ratio v3.4 - TTM unifié
    payout_ratio: {
      label: 'Payout (TTM)',
      unit: '%',
      get: s => {
        // 1) Privilégier le payout TTM direct
        let val = p(s.payout_ratio_ttm);

        // 2) Fallback: calculer TTM si on a les données
        if (!Number.isFinite(val) && Number.isFinite(s.total_dividends_ttm) && Number.isFinite(s.eps_ttm) && s.eps_ttm > 0) {
          val = (s.total_dividends_ttm / s.eps_ttm) * 100;
        }

        // 3) Fallback alternatif: si on a dividend_yield_ttm et PE ratio
        if (!Number.isFinite(val) && Number.isFinite(s.dividend_yield_ttm) && Number.isFinite(s.pe_ratio) && s.pe_ratio > 0) {
          // Payout = Dividend Yield × PE Ratio
          val = s.dividend_yield_ttm * s.pe_ratio;
        }

        // 4) Fallback ultime: utiliser un champ générique si disponible
        if (!Number.isFinite(val)) {
          val = p(s.payout_ratio ?? s.payout ?? s.payout_ratio_regular);
        }

        if (!Number.isFinite(val)) return NaN;

        // REITs/Immobilier: cap plus haut car ils distribuent souvent >100%
        const isRE = String(s.sector||'').toLowerCase().includes('immobili')
                  || String(s.sector||'').toLowerCase() === 'real estate'
                  || /property|immo/i.test(String(s.sector||''))
                  || /reit/i.test(String(s.name||''))
                  || /reit/i.test(String(s.exchange||''));

        // Cap intelligent selon le secteur
        return isRE ? Math.min(val, 400) : Math.min(val, 200);
      },
      max: false // On veut MINIMISER le payout
    }
  };

  // DOM
  const modeRadios=[...root.querySelectorAll('input[name="mc-mode"]')];
  const applyBtn=document.getElementById('mc-apply');
  const resetBtn=document.getElementById('mc-reset');
  const summary=document.getElementById('mc-summary');

  // Variables globales pour les contrôles UI
  let regionUI, countryUI, sectorUI;

  // état et données - v3.6: utilisation de Sets pour multi-sélection
  const state={ 
    mode:'balanced', 
    data:[], 
    loading:false,
    selectedMetrics: ['ytd', 'dividend_yield_reg'], // REG par défaut
    customFilters: [],
    geoFilters: {
      regions: new Set(),   // vide = tous
      countries: new Set(), // vide = tous
      sectors: new Set()    // vide = tous
    },
    availableRegions: new Set(),
    availableCountries: new Set(),
    availableSectors: new Set(),
    currentPreset: null // v3.8: preset actuel
  };

  // Debounce pour auto-recompute avec indicateur visuel
  let computeTimer;
  const scheduleCompute = () => {
    clearTimeout(computeTimer);
    
    // Indicateur de chargement subtil
    if (results) {
      results.classList.add('computing');
      // Ajouter un indicateur visuel temporaire
      if (!results.querySelector('.compute-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'compute-indicator';
        indicator.style.cssText = 'position:absolute;top:10px;right:10px;opacity:0.6;';
        indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
        results.appendChild(indicator);
      }
    }
    
    computeTimer = setTimeout(() => {
      compute();
      // Retirer l'indicateur après compute
      if (results) {
        results.classList.remove('computing');
        const indicator = results.querySelector('.compute-indicator');
        if (indicator) indicator.remove();
      }
    }, 150);
  };

  // DÉSACTIVÉ: plus d'ajout automatique de "payout < 100%"
  function ensureYieldTrapOnce() {
    // Les utilisateurs peuvent toujours l'ajouter manuellement s'ils le souhaitent
    return false;
  }

  // v3.3: Impose ≥ 1% pour CHAQUE métrique dividende cochée (REG/TTM)
  // Applicable dans TOUS les modes (Équilibre ET Priorités)
  function ensureMinDivYieldForPriorities() {
    let changed = false;
    const targets = ['dividend_yield_reg', 'dividend_yield_ttm'];

    targets.forEach(metric => {
      // Ne rien faire si la métrique n'est pas sélectionnée
      if (!state.selectedMetrics.includes(metric)) return;

      // Vérifier si un filtre auto existe déjà pour cette métrique
      const already = (state.customFilters || []).some(f =>
        f.__auto && 
        f.metric === metric && 
        f.operator === '>=' && 
        f.value >= MIN_DY_SELECTED
      );

      if (!already) {
        // Ajouter le filtre auto silencieux
        state.customFilters.push({
          metric,
          operator: '>=',
          value: MIN_DY_SELECTED,
          __auto: true,
          __reason: 'minDYSelected'
        });
        masks.custom = null; // Invalider le cache
        changed = true;
        
        if (CONFIG.DEBUG) {
          const label = metric === 'dividend_yield_reg' ? 'REG' : 'TTM';
          console.log(`🛡️ Auto: filtre ${label} ≥ ${MIN_DY_SELECTED}% appliqué`);
        }
      }
    });

    return changed;
  }

  // Généraliser le nettoyage des filtres auto
  function cleanupAutoFilters() {
    const before = state.customFilters.length;
    state.customFilters = (state.customFilters||[]).filter(f => !f.__auto);
    if (state.customFilters.length !== before) {
      masks.custom = null; // Invalider le cache
    }
  }

  // ==== SYSTÈME DE MASQUES DE FILTRAGE - v3.6: multi-sélection ====
  function buildGeoMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n); 
    mask.fill(1);

    const R = state.geoFilters.regions;
    const C = state.geoFilters.countries;
    const S = state.geoFilters.sectors;

    for (let i = 0; i < n; i++) {
      const s = state.data[i];
      if (R.size && !R.has(s.region))   { mask[i] = 0; continue; }
      if (C.size && !C.has(s.country))  { mask[i] = 0; continue; }
      if (S.size && !S.has(s.sector))   { mask[i] = 0; continue; }
    }
    masks.geo = mask;
    return mask;
  }

  // Comparaison quantisée à 1 décimale pour cohérence avec l'UI
  function buildCustomMask() {
    const n = state.data.length;
    const mask = new Uint8Array(n);
    mask.fill(1);
    
    const fs = state.customFilters || [];
    
    // Fonction de quantisation à 1 décimale
    const DEC = 1, POW = 10 ** DEC;
    const q = v => Math.round(v * POW) / POW; // quantize à 1 décimale
    
    for (let i = 0; i < n; i++) {
      for (const f of fs) {
        const raw = state.data[i].metrics ? 
          state.data[i].metrics[f.metric] : 
          METRICS[f.metric].get(state.data[i]);
        
        if (!Number.isFinite(raw)) {
          mask[i] = 0;
          break;
        }
        
        // Quantiser les deux valeurs à 1 décimale
        const v = q(raw);        // valeur métrique arrondie à 0.1
        const x = q(f.value);    // valeur seuil arrondie à 0.1
        
        let ok = true;
        switch(f.operator) {
          case '>=': ok = v >= x; break;
          case '>':  ok = v >  x; break;
          case '=':  ok = v === x; break;  // Égalité exacte après quantisation
          case '<':  ok = v <  x; break;
          case '<=': ok = v <= x; break;
          case '!=': ok = v !== x; break;
        }
        
        if (!ok) {
          mask[i] = 0;
          break;
        }
      }
    }
    
    masks.custom = mask;
    return mask;
  }

  function buildFinalMask() {
    const n = state.data.length;
    const out = new Uint8Array(n);
    
    if (!masks.geo) buildGeoMask();
    if (!masks.custom) buildCustomMask();
    
    for (let i = 0; i < n; i++) {
      out[i] = (masks.geo[i] & masks.custom[i]) ? 1 : 0;
    }
    
    masks.final = out;
    return out;
  }

  // Tolérer ALLOW_MISSING critères manquants
  function getFilteredIndices(requireMetrics = []) {
    if (!masks.final) buildFinalMask();
    
    const indices = [];
    const n = state.data.length;
    
    for (let i = 0; i < n; i++) {
      if (!masks.final[i]) continue;
      
      // Compter les métriques valides
      let validCount = 0;
      for (const m of requireMetrics) {
        const value = cache[m] ? cache[m].raw[i] : 
          (state.data[i].metrics ? state.data[i].metrics[m] : 
           METRICS[m].get(state.data[i]));
        
        if (Number.isFinite(value)) {
          validCount++;
        }
      }
      
      // Accepter si on a au moins (requis - ALLOW_MISSING) métriques
      if (validCount >= requireMetrics.length - ALLOW_MISSING) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  // ==== OUTILS DE CALCUL OPTIMISÉS ====
  const localWindow = (len) => Math.max(6, Math.min(40, Math.ceil(0.03 * len)));

  function localGap(sorted, v) {
    const a = sorted;
    const n = a.length;
    if (!n) return Infinity;
    
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      (a[mid] < v) ? lo = mid + 1 : hi = mid;
    }
    
    const W = localWindow(n);
    const i = Math.min(Math.max(lo, 1), n - 2);
    const start = Math.max(1, i - W);
    const end = Math.min(n - 2, i + W);
    const gaps = [];
    
    for (let j = start - 1; j <= end; j++) {
      gaps.push(Math.abs(a[j + 1] - a[j]));
    }
    
    gaps.sort((x, y) => x - y);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  }

  // Utilisation du MIN_TOL_P
  function nearTie(metric, vA, vB, dPct, n) {
    const cached = cache[metric];
    if (!cached) return false;
    
    const { sorted, iqr } = cached;
    const c = TOL_PRESET.c;
    const baseP = c / Math.sqrt(Math.max(2, n));
    const gLoc = localGap(sorted, (vA + vB) / 2);
    const tolV = Math.max(TOL_PRESET.kappa * (gLoc / iqr), (GAP_FLOOR[metric] || 0) / iqr);
    const nearV = Math.abs(vA - vB) / iqr <= tolV;
    const nearP = Math.abs(dPct) <= Math.max(baseP, MIN_TOL_P); // Ajout du plancher MIN_TOL_P
    return nearV || nearP;
  }

  // MinHeap pour Top N
  class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    peek() { return this.a[0]; }
    
    push(x) {
      const a = this.a;
      a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].key <= x.key) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    
    pop() {
      const a = this.a;
      if (!a.length) return;
      const top = a[0];
      const x = a.pop();
      if (!a.length) return top;
      a[0] = x;
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l].key < a[s].key) s = l;
        if (r < a.length && a[r].key < a[s].key) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]];
        i = s;
      }
      return top;
    }
  }

  // Helper générique pour un multiselect avec tags + recherche
  function createTagMultiSelect({container, label, options, selectedSet, placeholder='Sélectionner...', onChange}) {
    const wrap = document.createElement('div');
    wrap.className = 'msel';

    wrap.innerHTML = `
      <div class="flex gap-2 items-start">
        <label class="msel-label">${label}:</label>
        <div class="flex-1">
          <button type="button" class="msel-trigger">
            <div class="msel-chips"></div>
            <span class="msel-placeholder">${placeholder}</span>
          </button>
          <div class="msel-panel">
            <input type="text" class="msel-search" placeholder="Rechercher...">
            <div class="msel-actions">
              <button type="button" data-act="all">Tout</button>
              <button type="button" data-act="none">Aucun</button>
            </div>
            <div class="msel-list"></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrap);

    const trigger  = wrap.querySelector('.msel-trigger');
    const chipsBox = wrap.querySelector('.msel-chips');
    const ph       = wrap.querySelector('.msel-placeholder');
    const panel    = wrap.querySelector('.msel-panel');
    const search   = wrap.querySelector('.msel-search');
    const listBox  = wrap.querySelector('.msel-list');

    let currentOptions = options.slice();

    function renderChips() {
      chipsBox.innerHTML = '';
      const vals = [...selectedSet].slice(0, 3); // Afficher max 3 chips
      const more = selectedSet.size - vals.length;
      
      ph.style.display = selectedSet.size ? 'none' : '';
      
      vals.forEach(v => {
        const chip = document.createElement('span');
        chip.className = 'msel-chip';
        chip.innerHTML = `${v} <i class="fas fa-times" title="Retirer"></i>`;
        chip.querySelector('i').addEventListener('click', e => {
          e.stopPropagation();
          selectedSet.delete(v);
          syncListChecks();
          renderChips();
          onChange?.(new Set(selectedSet));
        });
        chipsBox.appendChild(chip);
      });
      
      if (more > 0) {
        const moreChip = document.createElement('span');
        moreChip.className = 'msel-chip';
        moreChip.innerHTML = `+${more} autres`;
        moreChip.style.background = 'rgba(0,255,135,0.25)';
        chipsBox.appendChild(moreChip);
      }
    }

    function syncListChecks() {
      listBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedSet.has(cb.value);
      });
    }

    function renderList(filter = '') {
      const q = filter.trim().toLowerCase();
      const items = currentOptions.filter(o => o.toLowerCase().includes(q));
      
      if (items.length === 0) {
        listBox.innerHTML = '<div class="msel-empty">Aucun résultat</div>';
        return;
      }
      
      listBox.innerHTML = items.map(o => `
        <label class="msel-option"><input type="checkbox" value="${o}"><span>${o}</span></label>
      `).join('');
      
      syncListChecks();
      
      listBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          cb.checked ? selectedSet.add(cb.value) : selectedSet.delete(cb.value);
          renderChips();
          onChange?.(new Set(selectedSet));
        });
      });
    }

    // Events
    trigger.addEventListener('click', () => {
      wrap.classList.toggle('open');
      if (wrap.classList.contains('open')) { 
        search.value=''; 
        renderList(); 
        search.focus(); 
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) wrap.classList.remove('open');
    });
    
    search.addEventListener('input', () => renderList(search.value));
    
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        wrap.classList.remove('open');
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstCb = listBox.querySelector('input[type="checkbox"]:not(:checked)');
        if (firstCb) firstCb.click();
      }
    });
    
    panel.querySelector('[data-act="all"]').addEventListener('click', () => {
      currentOptions.forEach(o => selectedSet.add(o));
      renderList(search.value); 
      renderChips(); 
      onChange?.(new Set(selectedSet));
    });
    
    panel.querySelector('[data-act="none"]').addEventListener('click', () => {
      selectedSet.clear(); 
      renderList(search.value); 
      renderChips(); 
      onChange?.(new Set(selectedSet));
    });

    // API minimaliste pour mises à jour dynamiques
    return {
      setOptions(newOpts) {
        currentOptions = newOpts.slice();
        // conserver l'intersection
        [...selectedSet].forEach(v => { 
          if (!currentOptions.includes(v)) selectedSet.delete(v); 
        });
        renderList(search.value); 
        renderChips();
      },
      clear() { 
        selectedSet.clear(); 
        renderList(); 
        renderChips(); 
      },
      refresh() { 
        renderList(search.value); 
        renderChips(); 
      }
    };
  }

  // Créer l'interface des filtres - v3.7: avec tags multi-select
  function setupGeoFilters() {
    const geoContainer = document.getElementById('geo-filters-container');
    if (!geoContainer) return;

    geoContainer.innerHTML = `
      <div class="text-[10px] opacity-60 mb-2">
        <i class="fas fa-info-circle mr-1"></i>
        Utilisez la recherche et les tags pour filtrer rapidement 🚀
      </div>
    `;

    const regions = Array.from(state.availableRegions).sort();
    const countries = Array.from(state.availableCountries).sort();
    const sectors = Array.from(state.availableSectors).sort();

    regionUI = createTagMultiSelect({
      container: geoContainer,
      label: 'Région',
      options: regions,
      selectedSet: state.geoFilters.regions,
      placeholder: 'Toutes régions',
      onChange: () => { 
        masks.geo = null; 
        updateCountryFilter(); 
        scheduleCompute(); 
      }
    });

    countryUI = createTagMultiSelect({
      container: geoContainer,
      label: 'Pays',
      options: countries,
      selectedSet: state.geoFilters.countries,
      placeholder: 'Tous pays',
      onChange: () => { 
        masks.geo = null; 
        scheduleCompute(); 
      }
    });

    sectorUI = createTagMultiSelect({
      container: geoContainer,
      label: 'Secteur',
      options: sectors,
      selectedSet: state.geoFilters.sectors,
      placeholder: 'Tous secteurs',
      onChange: () => { 
        masks.geo = null; 
        scheduleCompute(); 
      }
    });
  }

  // Mettre à jour le filtre pays selon les régions sélectionnées - v3.7
  function updateCountryFilter() {
    const selectedRegions = state.geoFilters.regions; // Set
    const filtered = new Set();
    
    state.data.forEach(stock => {
      if (!selectedRegions.size || selectedRegions.has(stock.region)) {
        if (stock.country) filtered.add(stock.country);
      }
    });
    
    const options = Array.from(filtered).sort();
    countryUI?.setOptions(options);
  }

  // Créer l'interface des filtres personnalisables
  function setupCustomFilters() {
    const filtersFieldset = root.querySelector('fieldset:nth-of-type(3)');
    if (!filtersFieldset) return;
    
    filtersFieldset.innerHTML = `
      <legend class="text-sm opacity-70 mb-2">Filtres</legend>
      <div id="geo-filters-container" class="mb-3">
        <!-- Les filtres géo seront ajoutés ici -->
      </div>
      
      <legend class="text-sm opacity-70 mb-2 mt-3">Filtres personnalisés</legend>
      <div id="custom-filters-list" class="space-y-2 mb-2">
        <!-- Les filtres seront ajoutés ici -->
      </div>
      <div class="flex gap-1 items-center filter-controls">
        <select id="filter-metric" class="mini-select" style="flex: 1.5; min-width: 100px;">
          ${Object.entries(METRICS).map(([k,v]) => 
            `<option value="${k}">${v.label}</option>`
          ).join('')}
        </select>
        <select id="filter-operator" class="mini-select" style="width: 50px;">
          <option value=">=">≥</option>
          <option value=">">></option>
          <option value="=">=</option>
          <option value="<"><</option>
          <option value="<=">≤</option>
          <option value="!=">≠</option>
        </select>
        <input id="filter-value" type="number" class="mini-input" style="width: 65px;" placeholder="0" step="0.1">
        <span class="text-xs opacity-60">%</span>
        <button id="add-filter" class="action-button" style="padding: 6px 10px;">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
    
    // Event listener pour ajouter un filtre
    document.getElementById('add-filter')?.addEventListener('click', () => {
      const metric = document.getElementById('filter-metric').value;
      const operator = document.getElementById('filter-operator').value;
      const value = parseFloat(document.getElementById('filter-value').value);
      
      if (!isNaN(value)) {
        state.customFilters.push({ metric, operator, value });
        masks.custom = null; // Invalider le cache
        updateFiltersList();
        document.getElementById('filter-value').value = '';
        scheduleCompute();
      }
    });
    
    state.customFilters = [];
    updateFiltersList();
  }

  // Mettre à jour l'affichage des filtres
  function updateFiltersList() {
    const filtersList = document.getElementById('custom-filters-list');
    if (!filtersList) return;
    
    filtersList.innerHTML = state.customFilters.map((filter, index) => {
      // Ignorer les filtres automatiques dans l'affichage
      if (filter.__auto) return '';
      
      const metric = METRICS[filter.metric];
      const color = getOperatorColor(filter.operator, metric.max);
      
      return `
        <div class="filter-item flex items-center gap-2 p-2 rounded bg-white/5">
          <span class="flex-1">
            ${metric.label} 
            <span class="${color} font-semibold">${filter.operator} ${filter.value}%</span>
          </span>
          <button class="remove-filter text-red-400 hover:text-red-300 text-sm" data-index="${index}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }).join('') || '<div class="text-xs opacity-50 text-center py-2">Aucun filtre personnalisé</div>';
    
    filtersList.querySelectorAll('.remove-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        state.customFilters.splice(index, 1);
        masks.custom = null; // Invalider le cache
        updateFiltersList();
        scheduleCompute();
      });
    });
  }

  // Couleur selon l'opérateur
  function getOperatorColor(operator, isMax) {
    if (operator === '>=' || operator === '>') {
      return isMax ? 'text-green-400' : 'text-cyan-400';
    } else if (operator === '<=' || operator === '<') {
      return isMax ? 'text-red-400' : 'text-green-400';
    }
    return 'text-yellow-400';
  }

  // Créer/mettre à jour la zone de priorités avec drag & drop + boutons ▲▼
  function updatePriorityDisplay() {
    let priorityContainer = document.getElementById('priority-container');
    
    if (!priorityContainer) {
      const modeFieldset = root.querySelector('fieldset[role="radiogroup"]');
      if (!modeFieldset) return;
      
      priorityContainer = document.createElement('div');
      priorityContainer.id = 'priority-container';
      priorityContainer.className = 'mt-3 p-3 rounded bg-white/5';
      priorityContainer.innerHTML = `
        <div class="text-xs opacity-70 mb-2">Ordre des priorités (glisser pour réorganiser)</div>
        <div id="priority-list" class="space-y-1"></div>
      `;
      modeFieldset.appendChild(priorityContainer);
    }
    
    const priorityList = document.getElementById('priority-list');
    if (!priorityList) return;
    
    priorityContainer.style.display = state.mode === 'lexico' ? 'block' : 'none';
    
    priorityList.innerHTML = state.selectedMetrics.map((m, i) => `
      <div class="priority-item flex items-center gap-2 p-2 rounded bg-white/5 cursor-move"
           draggable="true" data-metric="${m}" role="option" tabindex="0" aria-posinset="${i+1}" aria-setsize="${state.selectedMetrics.length}">
        <span class="drag-handle">☰</span>
        <span class="priority-number text-xs opacity-50">${i+1}.</span>
        <span class="flex-1">${METRICS[m].label} ${METRICS[m].max?'↑':'↓'}</span>
        <div class="flex gap-1">
          <button type="button" class="btn-up" aria-label="Monter">▲</button>
          <button type="button" class="btn-down" aria-label="Descendre">▼</button>
        </div>
      </div>
    `).join('') || '<div class="text-xs opacity-50">Cochez des critères pour définir les priorités</div>';
    
    setupPriorityArrows();   // ⬅️ new
    setupDragAndDrop();      // (gardé, mais patché ci-dessous pour éviter les doublons)
  }

  // ✅ NOUVEAU: Helper pour mettre à jour uniquement les numéros
  function updatePriorityNumbersOnly() {
    const items = document.querySelectorAll('.priority-item');
    items.forEach((item, index) => {
      const numSpan = item.querySelector('.priority-number');
      if (numSpan) {
        numSpan.textContent = `${index + 1}.`;
      }
    });
  }

  // ✅ NOUVEAU: Fonctions pour les boutons ▲▼ avec scroll stable
  function getScrollParent(el){
    let p = el.parentElement;
    while (p){
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
      p = p.parentElement;
    }
    return window;
  }

  function setupPriorityArrows(){
    const list = document.getElementById('priority-list');
    if (!list || list.dataset.wired === '1') return;   // 🔒 empêcher les doublons
    list.dataset.wired = '1';

    const renumber = () => {
      [...list.querySelectorAll('.priority-item')].forEach((item, idx) => {
        item.querySelector('.priority-number').textContent = `${idx+1}.`;
        item.setAttribute('aria-posinset', String(idx+1));
      });
    };

    const commit = () => {
      state.selectedMetrics = [...list.querySelectorAll('.priority-item')].map(el => el.dataset.metric);
      renumber();
      scheduleCompute();
    };

    const moveItem = (from, to, focusSelector) => {
      const items = [...list.querySelectorAll('.priority-item')];
      if (to < 0 || to >= items.length || from === to) return;
      const node = items[from];
      const ref  = (to > from) ? items[to].nextSibling : items[to];

      // freeze scroll
      const sp = getScrollParent(list);
      const prevTop = (sp === window) ? window.scrollY : sp.scrollTop;

      list.insertBefore(node, ref);

      // restore scroll
      if (sp === window) window.scrollTo(window.scrollX, prevTop);
      else sp.scrollTop = prevTop;

      // garder le focus sans scroll
      if (focusSelector) node.querySelector(focusSelector)?.focus?.({ preventScroll: true });

      commit();
    };

    // click ▲▼ (1 clic = 1 place)
    list.addEventListener('click', (e) => {
      if (list.isDragging) return; // ignorer si DnD en cours
      const up   = e.target.closest('.btn-up');
      const down = e.target.closest('.btn-down');
      if (!up && !down) return;

      e.preventDefault(); e.stopPropagation();
      const item  = e.target.closest('.priority-item');
      const items = [...list.querySelectorAll('.priority-item')];
      const from  = items.indexOf(item);
      const to    = from + (up ? -1 : 1);

      moveItem(from, to, up ? '.btn-up' : '.btn-down');
    });

    // clavier ↑/↓ (1 place)
    list.addEventListener('keydown', (e) => {
      const item = e.target.closest('.priority-item'); if (!item) return;
      const items = [...list.querySelectorAll('.priority-item')];
      const idx = items.indexOf(item);
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveItem(idx, idx-1, '.btn-up'); }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(idx, idx+1, '.btn-down'); }
    });
  }

  // ✅ DRAG & DROP OPTIMISÉ v3.5 - Basé sur le conteneur + protection doublons
  function setupDragAndDrop() {
    const container = document.getElementById('priority-list');
    if (!container) return;

    // 🔒 ne câbler qu'une seule fois
    if (container.dataset.dndWired === '1') return;
    container.dataset.dndWired = '1';

    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
      if (!e.target.classList.contains('priority-item')) return;
      draggedItem = e.target;
      container.isDragging = true;                 // ⬅️ expose à setupPriorityArrows
      e.target.style.opacity = '0.5';
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragend', (e) => {
      if (!e.target.classList.contains('priority-item')) return;
      e.target.style.opacity = '';
      e.target.classList.remove('dragging');
      draggedItem = null;
      container.isDragging = false;                // ⬅️ fin du DnD
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedItem) return;
      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) container.appendChild(draggedItem);
      else container.insertBefore(draggedItem, afterElement);
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedItem) return;
      // nouvel ordre depuis le DOM
      state.selectedMetrics = [...container.querySelectorAll('.priority-item')].map(el => el.dataset.metric);
      updatePriorityNumbersOnly();
      scheduleCompute();
    });
  }
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.priority-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Synchroniser checkboxes v3.4 avec Payout TTM
  function setupMetricCheckboxes() {
    // REMPLACER L'ANCIEN HTML des checkboxes
    const pillsContainer = root.querySelector('.flex.flex-wrap.gap-2');
    if (pillsContainer) {
      pillsContainer.innerHTML = `
        <!-- Performance (organisé par période) -->
        <label class="mc-pill"><input id="m-perf_daily" type="checkbox" aria-label="Performance journalière"> Perf Daily ↑</label>
        <label class="mc-pill"><input id="m-perf_1m" type="checkbox" aria-label="Performance 1 mois"> Perf 1M ↑</label>
        <label class="mc-pill"><input id="m-perf_3m" type="checkbox" aria-label="Performance 3 mois"> Perf 3M ↑</label>
        <label class="mc-pill"><input id="m-ytd" type="checkbox" checked aria-label="Year to date"> YTD ↑</label>
        <label class="mc-pill"><input id="m-perf_1y" type="checkbox" aria-label="Performance 1 an"> Perf 1Y ↑</label>
        <label class="mc-pill"><input id="m-perf_3y" type="checkbox" aria-label="Performance 3 ans"> Perf 3Y ↑</label>
        <!-- Risque -->
        <label class="mc-pill"><input id="m-volatility_3y" type="checkbox" aria-label="Volatilité 3 ans"> Vol 3Y ↓</label>
        <label class="mc-pill"><input id="m-max_drawdown_3y" type="checkbox" aria-label="Drawdown maximum 3 ans"> Max DD 3Y ↓</label>
        <!-- Dividendes v3.1 REG/TTM -->
        <label class="mc-pill" title="Dividendes réguliers/récurrents">
          <input id="m-dividend_yield_reg" type="checkbox" checked aria-label="Dividende régulier"> 
          <i class="fas fa-calendar-check text-xs mr-1"></i>Div. REG ↑
        </label>
        <label class="mc-pill" title="Total des dividendes sur 12 mois (REG + spéciaux)">
          <input id="m-dividend_yield_ttm" type="checkbox" aria-label="Dividende TTM"> 
          <i class="fas fa-receipt text-xs mr-1"></i>Div. TTM ↑
        </label>
        <!-- Payout v3.4 - TTM uniquement -->
        <label class="mc-pill" title="Ratio dividendes/bénéfices sur 12 mois. Plus bas = plus soutenable. Repères : <60% excellent, 60-80% bon, >100% risqué">
          <input id="m-payout_ratio" type="checkbox" aria-label="Payout ratio TTM">
          <span>Payout (TTM) ↓ <i id="payout-info" class="fas fa-info-circle info-icon"></i></span>
        </label>
      `;
    }
    
    // Setup des checkboxes métriques
    Object.keys(METRICS).forEach(metricId => {
      const checkbox = root.querySelector('#m-' + metricId);
      if (!checkbox) return;
      
      if (state.selectedMetrics.includes(metricId)) {
        checkbox.checked = true;
      }
      
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!state.selectedMetrics.includes(metricId)) {
            state.selectedMetrics.push(metricId);
          }
        } else {
          state.selectedMetrics = state.selectedMetrics.filter(m => m !== metricId);
        }
        updatePriorityDisplay();
        scheduleCompute();
      });
    });
    
    // Synchroniser classe is-checked pour TOUS les pills
    root.querySelectorAll('.mc-pill input').forEach(inp => {
      const label = inp.closest('.mc-pill');
      if (!label) return;
      
      const sync = () => label.classList.toggle('is-checked', inp.checked);
      inp.addEventListener('change', sync);
      sync(); // État initial
    });
  }

  // Explication mise à jour v3.4
  function addExplanation() {
    const modeContainer = root.querySelector('fieldset[role="radiogroup"]');
    if (modeContainer && !document.getElementById('mode-explanation')) {
      const explanation = document.createElement('div');
      explanation.id = 'mode-explanation';
      explanation.className = 'text-xs opacity-60 mt-2 p-2 rounded bg-white/5';
      explanation.innerHTML = `
        <div id="balanced-explanation">
          <strong>Mode Équilibre :</strong> Moyenne des scores percentiles (0-100) pour chaque critère coché.
        </div>
        <div id="priority-explanation" class="hidden">
          <strong>Mode Priorités intelligentes :</strong> Tri par ordre avec tolérance locale basée sur la densité de distribution.
        </div>
        <div class="mt-1 text-cyan-400">
          <i class="fas fa-info-circle mr-1"></i>
          <em>Note :</em> Si "Div. REG" ou "Div. TTM" est sélectionné, 
          seules les actions avec rendement ≥ ${MIN_DY_SELECTED}% sont affichées.
        </div>
      `;
      modeContainer.appendChild(explanation);
    }
  }

  // v3.8: Ajouter la barre de presets
  function addPresetsBar() {
    const modeContainer = root.querySelector('fieldset[role="radiogroup"]');
    if (!modeContainer || document.getElementById('mc-presets-bar')) return;
    
    const presetsBar = document.createElement('div');
    presetsBar.id = 'mc-presets-bar';
    presetsBar.innerHTML = `
      <span class="presets-label"><i class="fas fa-magic mr-2"></i>Presets :</span>
      <button class="preset-btn" data-preset="defensif">
        🛡️ Défensif
      </button>
      <button class="preset-btn" data-preset="rendement">
        💰 Rendement
      </button>
      <button class="preset-btn" data-preset="agressif">
        🚀 Agressif
      </button>
      <button class="preset-btn" data-preset="croissance">
        📈 Croissance
      </button>
    `;
    
    // Insérer avant le mode container
    modeContainer.parentNode.insertBefore(presetsBar, modeContainer);
  }

  // Popover au clic pour l'info payout v3.4
  function setupPayoutPopover() {
    const icon = document.getElementById('payout-info');
    if (!icon) return;

    const TEXT = "Payout TTM = dividendes ÷ bénéfices (12 mois glissants).\n" +
                 "Plus bas = meilleure soutenabilité.\n" +
                 "Repères:\n" +
                 "• <60% : Excellent (marge de sécurité)\n" +
                 "• 60-80% : Bon (équilibré)\n" +
                 "• 80-100% : Élevé (peu de marge)\n" +
                 "• >100% : Risqué (non soutenable)\n" +
                 "Note: REITs peuvent avoir >100% (normal).";

    let tipEl = null;
    const closeTip = () => { 
      tipEl?.remove(); 
      tipEl = null; 
      document.removeEventListener('click', onDoc); 
    };
    
    const onDoc = (e) => { 
      if (!tipEl || tipEl.contains(e.target) || e.target === icon) return; 
      closeTip(); 
    };

    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tipEl) { 
        closeTip(); 
        return; 
      }

      tipEl = document.createElement('div');
      tipEl.className = 'mc-tip';
      tipEl.style.whiteSpace = 'pre-line'; // Pour respecter les sauts de ligne
      tipEl.textContent = TEXT;

      document.body.appendChild(tipEl);
      const r = icon.getBoundingClientRect();
      const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.left + 12);
      const y = Math.min(window.innerHeight - tipEl.offsetHeight - 8, r.top + 18);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';

      setTimeout(() => document.addEventListener('click', onDoc), 0);
    });
  }

  // charger les données et extraire les infos géographiques
  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    
    try {
      console.log('📊 MC: Chargement des données...');
      const files = ['data/stocks_us.json', 'data/stocks_europe.json', 'data/stocks_asia.json'];
      const responses = await Promise.all(
        files.map(f => 
          fetch(f)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      
      const allStocks = [];
      responses.forEach((data, index) => {
        if (!data?.stocks) return;
        const region = ['US', 'EUROPE', 'ASIA'][index];
        data.stocks.forEach(stock => {
          stock.region = region;
          
          // Extraire le pays depuis exchange ou name
          if (!stock.country) {
            if (stock.exchange?.includes('India')) stock.country = 'Inde';
            else if (stock.exchange?.includes('China')) stock.country = 'Chine';
            else if (stock.exchange?.includes('Korea')) stock.country = 'Corée';
            else if (stock.exchange?.includes('Japan')) stock.country = 'Japon';
            else if (stock.exchange?.includes('London')) stock.country = 'UK';
            else if (stock.exchange?.includes('Paris')) stock.country = 'France';
            else if (stock.exchange?.includes('Frankfurt')) stock.country = 'Allemagne';
            else if (region === 'US') stock.country = 'USA';
            else if (region === 'EUROPE') stock.country = 'Europe';
            else if (region === 'ASIA') stock.country = 'Asie';
          }
          
          // Extraire le secteur depuis le nom ou ajouter un secteur par défaut
          if (!stock.sector) {
            const name = stock.name?.toLowerCase() || '';
            if (name.includes('bank') || name.includes('financ')) stock.sector = 'Finance';
            else if (name.includes('tech') || name.includes('software') || name.includes('semi')) stock.sector = 'Technologie';
            else if (name.includes('pharma') || name.includes('health')) stock.sector = 'Santé';
            else if (name.includes('energy') || name.includes('oil') || name.includes('gas')) stock.sector = 'Énergie';
            else if (name.includes('retail') || name.includes('consum')) stock.sector = 'Consommation';
            else if (name.includes('real estate') || name.includes('reit')) stock.sector = 'Immobilier';
            else if (name.includes('industrial')) stock.sector = 'Industrie';
            else stock.sector = 'Autres';
          }
          
          // Ajouter aux listes
          state.availableRegions.add(stock.region);
          state.availableCountries.add(stock.country);
          state.availableSectors.add(stock.sector);
          
          allStocks.push(stock);
        });
      });
      
      state.data = allStocks;
      
      // ==== INITIALISATION DU CACHE ====
      console.log('🔧 Initialisation du cache des métriques...');
      
      // Parser une seule fois les métriques
      for (const s of state.data) {
        s.metrics = {};
        for (const [key, metric] of Object.entries(METRICS)) {
          s.metrics[key] = metric.get(s);
        }
      }
      
      // Construire le cache si on a des données
      if (state.data.length > 0) {
        const n = state.data.length;
        
        for (const m of Object.keys(METRICS)) {
          const raw = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            raw[i] = state.data[i].metrics[m];
          }
          
          // Winsorization doux
          const sorted = Array.from(raw)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
          
          if (sorted.length) {
            const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
            const lo = q(0.005);
            const hi = q(0.995);
            
            for (let i = 0; i < n; i++) {
              if (Number.isFinite(raw[i])) {
                raw[i] = Math.min(hi, Math.max(lo, raw[i]));
              }
            }
            
            // Recalculer sorted après winsorisation
            const sortedW = Array.from(raw)
              .filter(Number.isFinite)
              .sort((a, b) => a - b);
            const qW = (p) => sortedW[Math.floor(p * (sortedW.length - 1))];
            const q1 = qW(0.25);
            const q3 = qW(0.75);
            const iqr = Math.max(1e-9, q3 - q1);
            
            // Calcul des rangs/percentiles avec gestion des égalités
            const idx = Array.from({length: n}, (_, i) => i)
              .filter(i => Number.isFinite(raw[i]));
            idx.sort((i, j) => raw[i] - raw[j]);
            
            const rankPct = new Float64Array(n);
            let k = 0;
            while (k < idx.length) {
              let j = k + 1;
              while (j < idx.length && Math.abs(raw[idx[j]] - raw[idx[k]]) < 1e-12) j++;
              const r = (k + j - 1) / 2;
              const hazen = (r + 0.5) / idx.length;
              for (let t = k; t < j; t++) {
                rankPct[idx[t]] = hazen;
              }
              k = j;
            }
            
            // Utiliser sorted winsorisé dans le cache
            cache[m] = {
              raw,
              sorted: Float64Array.from(sortedW), // Sorted après winsorisation
              rankPct,
              iqr // IQR recalculé après winsorisation
            };
          } else {
            // Pas de données valides
            cache[m] = {
              raw,
              sorted: new Float64Array(),
              rankPct: new Float64Array(n),
              iqr: 1
            };
          }
        }
        
        console.log('✅ Cache initialisé pour', Object.keys(cache).length, 'métriques');
      }
      
      console.log(`✅ MC: ${allStocks.length} actions chargées`);
      
      // Initialiser les filtres géo après le chargement
      setupGeoFilters();
      
      if (allStocks.length > 0) {
        results.innerHTML = `<div class="text-center text-cyan-400 py-4">✅ ${allStocks.length} actions disponibles</div>`;
      }
      
    } catch (err) {
      console.error('❌ MC: Erreur:', err);
      results.innerHTML = '<div class="text-center text-red-400 py-4">Erreur de chargement</div>';
    } finally {
      state.loading = false;
    }
  }

  // Mode équilibré optimisé
  function rankBalanced(indices) {
    const M = state.selectedMetrics;
    const out = [];
    
    for (const i of indices) {
      let sum = 0;
      let k = 0;
      
      for (const m of M) {
        const pct = cache[m].rankPct[i];
        if (Number.isFinite(pct)) {
          const adjustedPct = METRICS[m].max ? pct : (1 - pct);
          sum += adjustedPct;
          k++;
        }
      }
      
      if (k > 0) {
        out.push({
          idx: i,
          score: sum / k
        });
      }
    }
    
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, TOP_N).map(e => ({ s: state.data[e.idx], score: e.score }));
  }

  // Comparateur pour priorités intelligentes
  function smarterCompare(aIdx, bIdx, prios) {
    const n = state.data.length;
    
    for (let i = 0; i < prios.length; i++) {
      const m = prios[i];
      let pA = cache[m].rankPct[aIdx];
      let pB = cache[m].rankPct[bIdx];
      
      if (!METRICS[m].max) {
        pA = 1 - pA;
        pB = 1 - pB;
      }
      
      const dPct = pA - pB;
      const vA = cache[m].raw[aIdx];
      const vB = cache[m].raw[bIdx];
      
      if (!nearTie(m, vA, vB, dPct, n)) {
        return dPct > 0 ? -1 : 1;
      }
    }
    
    // Tie-break pondéré
    const weights = prios.map((_, i) => Math.pow(0.5, i));
    let scoreA = 0, scoreB = 0;
    
    for (let i = 0; i < prios.length; i++) {
      const m = prios[i];
      let pA = cache[m].rankPct[aIdx];
      let pB = cache[m].rankPct[bIdx];
      
      if (!METRICS[m].max) {
        pA = 1 - pA;
        pB = 1 - pB;
      }
      
      scoreA += pA * weights[i];
      scoreB += pB * weights[i];
    }
    
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    // Dernier recours : ticker
    const ta = String(state.data[aIdx].ticker || state.data[aIdx].name || '');
    const tb = String(state.data[bIdx].ticker || state.data[bIdx].name || '');
    return ta.localeCompare(tb);
  }

  // Top N avec heap
  function topNByLexico(indices, prios) {
    if (indices.length <= TOP_N) {
      return indices
        .sort((a, b) => smarterCompare(a, b, prios))
        .map(i => ({ s: state.data[i], score: NaN }));
    }
    
    // Staging adaptatif pour grandes listes
    let candidates = indices.slice();
    
    if (candidates.length > 600) {
      // Premier filtre : top 120 sur le premier critère
      candidates.sort((a, b) => smarterCompare(a, b, [prios[0]]));
      candidates = candidates.slice(0, 120);
      
      // Deuxième filtre : top 40 sur les deux premiers critères
      if (prios.length > 1) {
        candidates.sort((a, b) => smarterCompare(a, b, [prios[0], prios[1]]));
        candidates = candidates.slice(0, 40);
      }
    }
    
    // Tri final avec tous les critères
    candidates.sort((a, b) => smarterCompare(a, b, prios));
    
    return candidates
      .slice(0, TOP_N)
      .map(i => ({ s: state.data[i], score: NaN }));
  }

  // RENDU v3.4 - Coloration améliorée pour payout
  function render(entries){
    results.innerHTML='';
    results.className = 'space-y-2';
    
    const top = entries.slice(0,10);
    
    top.forEach((e,i)=>{
      const card=document.createElement('div');
      card.className='glassmorphism rounded-lg p-3 flex items-center gap-4';
      
      if(!e.s){
        card.innerHTML=`
          <div class="rank text-2xl font-bold opacity-30">#${i+1}</div>
          <div class="flex-1">
            <div class="font-semibold">—</div>
            <div class="text-xs opacity-60">—</div>
          </div>
          <div class="text-right opacity-30">—</div>`;
        results.appendChild(card); 
        return;
      }
      
      const tkr = e.s.ticker || e.s.symbol || (e.s.name||'').split(' ')[0] || '—';
      
      // Formatage amélioré avec coloration contextuelle et icônes
      let metricValues = state.selectedMetrics.map(m => {
        const raw = e.s.metrics ? e.s.metrics[m] : METRICS[m].get(e.s);
        if (!Number.isFinite(raw)) return '';

        // Format par défaut
        const isMax = !!METRICS[m].max;
        const formatted = METRICS[m].unit === '%' ? raw.toFixed(1) : raw.toFixed(2);
        
        // Coloration contextuelle
        let colorClass;
        let icon = '';
        
        if (m === 'dividend_yield_reg') {
          // Dividende régulier avec icône calendrier
          icon = '<i class="fas fa-calendar-check text-xs mr-1"></i>';
          colorClass = raw > 3 ? 'text-green-400' : 
                      raw > 1.5 ? 'text-cyan-400' : 
                      'text-yellow-400';
        } else if (m === 'dividend_yield_ttm') {
          // TTM avec icône receipt
          icon = '<i class="fas fa-receipt text-xs mr-1"></i>';
          colorClass = raw > 4 ? 'text-green-400' : 
                      raw > 2 ? 'text-cyan-400' : 
                      'text-yellow-400';
        } else if (m === 'payout_ratio') {
          // Coloration améliorée avec plus de nuances pour payout v3.4
          const sector = String(e.s.sector||'').toLowerCase();
          const isREIT = sector.includes('immobili') || sector === 'real estate' || /reit/i.test(String(e.s.name||''));
          
          if (isREIT) {
            // Seuils adaptés pour REITs
            colorClass = raw < 75 ? 'text-green-500' :      // Excellent pour REIT
                        raw < 90 ? 'text-green-400' :       // Bon pour REIT
                        raw < 110 ? 'text-yellow-400' :     // Normal pour REIT
                        raw < 130 ? 'text-orange-400' :     // Élevé pour REIT
                        'text-red-400';                     // Très élevé
          } else {
            // Seuils standards
            colorClass = raw < 30 ? 'text-green-500' :      // Ultra conservateur
                        raw < 60 ? 'text-green-400' :       // Sain
                        raw < 80 ? 'text-yellow-400' :      // Modéré
                        raw < 100 ? 'text-orange-400' :     // Élevé
                        'text-red-400';                     // Non soutenable
          }
        } else if (m === 'volatility_3y' || m === 'max_drawdown_3y') {
          // Pour les métriques de risque
          colorClass = raw < 15 ? 'text-green-400' : 
                      raw < 25 ? 'text-yellow-400' : 
                      'text-red-400';
        } else {
          // Coloration standard
          colorClass = isMax 
            ? (raw > 0 ? 'text-green-400' : 'text-red-400')
            : (raw < 20 ? 'text-green-400' : raw > 40 ? 'text-red-400' : 'text-yellow-400');
        }

        return `
          <div class="text-right">
            <div class="text-xs opacity-60">${icon}${METRICS[m].label}</div>
            <div class="${colorClass} font-semibold">
              ${isMax && raw > 0 ? '+' : ''}${formatted}${METRICS[m].unit || ''}
            </div>
          </div>
        `;
      }).filter(Boolean).join('');
      
      let regionIcon = '';
      if (e.s.region === 'US') {
        regionIcon = '🇺🇸';
      } else if (e.s.region === 'EUROPE') {
        regionIcon = '🇪🇺';
      } else if (e.s.region === 'ASIA') {
        regionIcon = '🌏';
      }
      
      // Badge si TTM dépasse nettement le REG (présence de spéciaux)
      const reg = getDivReg(e.s);
      const ttm = getDivTTM(e.s);
      let specialBadge = '';
      if (Number.isFinite(reg) && Number.isFinite(ttm) && ttm - reg >= 0.5) {
        specialBadge = '<span class="ml-2 px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded-full">incl. spé</span>';
      }
      
      card.innerHTML=`
        <div class="rank text-2xl font-bold">#${i+1}</div>
        <div class="flex-1">
          <div class="font-semibold flex items-center gap-2">
            ${tkr} <span class="text-sm opacity-60">${regionIcon}</span>${specialBadge}
          </div>
          <div class="text-xs opacity-60" title="${e.s.name||''}">${e.s.name||'—'}</div>
          <div class="text-xs opacity-40">${e.s.sector||''} • ${e.s.country||''}</div>
        </div>
        <div class="flex gap-4">
          ${metricValues}
        </div>`;
      
      results.appendChild(card);
    });
    
    if (entries.length < 10 && entries.length > 0) {
      const info = document.createElement('div');
      info.className = 'text-center text-xs opacity-50 mt-3';
      info.textContent = `Seulement ${entries.length} actions correspondent aux critères`;
      results.appendChild(info);
    } else if (entries.length === 0) {
      const info = document.createElement('div');
      info.className = 'text-center text-cyan-400 py-4';
      info.innerHTML = '<i class="fas fa-filter mr-2"></i>Aucune action ne passe les filtres';
      results.appendChild(info);
    }
  }

  // v3.7: Affichage amélioré du résumé avec compteurs
  function setSummary(total, kept){
    if (!summary) return;
    const mode = state.mode==='balanced' ? 'Équilibre' : 'Priorités intelligentes';
    const labels = state.selectedMetrics.map(m=>METRICS[m].label).join(' · ');
    
    // Compter seulement les filtres visibles (exclure __auto)
    const visibleFilters = state.customFilters.filter(f => !f.__auto).length;
    
    // Ajouter indicateur pour filtres auto actifs
    const autoFilters = state.customFilters.filter(f => f.__auto && f.__reason === 'minDYSelected');
    const autoText = autoFilters.length > 0 
      ? ` <span class="text-cyan-400">[Auto: Div ≥ ${MIN_DY_SELECTED}%]</span>` 
      : '';
    
    // v3.7: Affichage des compteurs de multi-sélections
    const rN = state.geoFilters.regions.size;
    const cN = state.geoFilters.countries.size;
    const sN = state.geoFilters.sectors.size;
    
    const geoText = (rN||cN||sN) 
      ? ` • <span class="text-green-400">${rN ? 'R('+rN+')' : ''} ${cN ? 'P('+cN+')' : ''} ${sN ? 'S('+sN+')' : ''}</span>`.replace(/\s+/g,' ').trim() 
      : '';
    
    // v3.8: Ajouter le preset actuel
    const presetText = state.currentPreset 
      ? ` • <span class="text-purple-400">[Preset: ${state.currentPreset}]</span>`
      : '';
    
    summary.innerHTML = `<strong>${mode}</strong> • ${labels || 'Aucun critère'} • ${visibleFilters} filtres${geoText}${autoText}${presetText} • ${kept}/${total} actions`;
  }

  // Fonction compute avec protections auto pour REG
  async function compute(){
    console.log('🔍 MC: Calcul avec filtres géo:', state.geoFilters);
    
    if (state.data.length === 0) {
      results.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement...</div>';
      await loadData();
    }
    
    const base = state.data;
    if(!base.length){ 
      results.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée</div>';
      return; 
    }
    
    if (!state.selectedMetrics.length) {
      results.innerHTML = '<div class="text-center text-yellow-400 py-4">Sélectionnez au moins un critère</div>';
      setSummary(base.length, 0);
      return;
    }
    
    // Protections automatiques
    const hadAutoTrap = ensureYieldTrapOnce();
    const hadAutoMinDY = ensureMinDivYieldForPriorities();
    
    // Utiliser les masques optimisés
    console.time('Filtrage');
    buildGeoMask();
    buildCustomMask();
    buildFinalMask();
    const pool = getFilteredIndices(state.selectedMetrics);
    console.timeEnd('Filtrage');
    
    console.log(`📊 Après filtres: ${pool.length} actions sur ${base.length}`);
     setSummary(base.length, pool.length);
    
    if (pool.length === 0) {
      results.innerHTML = '<div class="text-center text-cyan-400 py-4"><i class="fas fa-exclamation-triangle mr-2"></i>Aucune action ne passe les filtres</div>';
      // Nettoie tous les filtres auto si ajoutés
      if (hadAutoTrap || hadAutoMinDY) cleanupAutoFilters();
      return;
    }
    
    // Calcul optimisé
    console.time('Ranking');
    let out;
    if (state.mode === 'balanced') {
      out = rankBalanced(pool);
    } else {
      out = topNByLexico(pool, state.selectedMetrics);
    }
    console.timeEnd('Ranking');
    
    render(out);
    console.log(`✅ MC: ${pool.length} actions filtrées, mode: ${state.mode}`)
    
    // Nettoie tous les filtres auto une fois le rendu fait
    if (hadAutoTrap || hadAutoMinDY) cleanupAutoFilters();
  }

  // ==== API v3.8 pour les presets ====
  const api = {
    // Définir le mode
    setMode(mode) {
      const radio = root.querySelector(`input[name="mc-mode"][value="${mode}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
      state.mode = mode;
      updatePriorityDisplay();
    },
    
    // Définir les métriques et leur ordre
    setMetrics(metrics) {
      // Décocher tout d'abord
      Object.keys(METRICS).forEach(m => {
        const cb = root.querySelector('#m-' + m);
        if (cb) {
          cb.checked = false;
          cb.closest('.mc-pill')?.classList.remove('is-checked');
        }
      });
      
      // Cocher les nouvelles métriques
      metrics.forEach(m => {
        const cb = root.querySelector('#m-' + m);
        if (cb) {
          cb.checked = true;
          cb.closest('.mc-pill')?.classList.add('is-checked');
        }
      });
      
      state.selectedMetrics = metrics.slice();
      updatePriorityDisplay();
    },
    
    // Définir les filtres géographiques
    setGeoFilters({ regions = [], countries = [], sectors = [] }) {
      state.geoFilters.regions.clear();
      state.geoFilters.countries.clear();
      state.geoFilters.sectors.clear();
      
      regions.forEach(r => state.geoFilters.regions.add(r));
      countries.forEach(c => state.geoFilters.countries.add(c));
      sectors.forEach(s => state.geoFilters.sectors.add(s));
      
      // Rafraîchir les UI tags
      regionUI?.refresh();
      countryUI?.refresh();
      sectorUI?.refresh();
      
      // Invalider les masques
      masks.geo = null;
    },
    
    // Définir les filtres personnalisés
    setCustomFilters(filters) {
      state.customFilters = filters.slice();
      masks.custom = null;
      updateFiltersList();
    }
  };

// ==== SYSTÈME DE PRESETS v3.9 — sans fondamentaux (only perf/risque/dividendes) ====
const PRESETS = {
  defensif: {
    label: '🛡️ Défensif',
    mode: 'balanced', // moyenne de percentiles
    metrics: [
      'volatility_3y','max_drawdown_3y',
      'dividend_yield_reg','payout_ratio',
      'perf_1y'
    ],
    geoFilters: { regions:['EUROPE','US'], countries:[], sectors:['Santé','Biens de consommation de base','Services publics','Energie','Immobilier'] },
    customFilters: [
      { metric:'perf_daily',          operator:'>=', value:-0.5 },
      { metric:'dividend_yield_reg',  operator:'>=', value:2.0 }, // évite 0% et quasi-0, plus sélectif
      { metric:'volatility_3y',       operator:'<=', value:26 },  // borne max (cohérent défensif)
      { metric:'max_drawdown_3y',     operator:'<=', value:35 },
      { metric:'payout_ratio',        operator:'<=', value:75 }   // passer à 90 si panier REITs
    ]
  },

  rendement: {
    label: '💰 Rendement',
    mode: 'lexico', // priorité stricte par l’ordre ci-dessous
    metrics: [
      'dividend_yield_reg','dividend_yield_ttm',
      'payout_ratio',
      'max_drawdown_3y','volatility_3y',
      'perf_1y'
    ],
    geoFilters: { regions:['EUROPE','US'], countries:[], sectors:['Finance','Immobilier','Energie','Biens de consommation de base','Services publics'] },
    customFilters: [
      { metric:'dividend_yield_reg',  operator:'>=', value:3.5 },
      { metric:'payout_ratio',        operator:'<=', value:85 },  // monter à 110 si REITs
      { metric:'max_drawdown_3y',     operator:'<=', value:45 },
      { metric:'volatility_3y',       operator:'<=', value:35 },
      { metric:'perf_1y',             operator:'>=', value:-5 }   // évite les pièges trop dégradés
    ]
  },

  agressif: {
    label: '🚀 Agressif',
    mode: 'lexico',
    metrics: [
      'perf_3m','perf_1m','ytd','perf_1y',
      'max_drawdown_3y','volatility_3y'
    ],
    geoFilters: { regions:[], countries:[], sectors:['Technologie de l\'information','Santé','Industries','Biens de consommation cycliques','La communication','Matériaux'] },
    customFilters: [
      { metric:'perf_daily',          operator:'>=', value:0 },
      { metric:'ytd',                 operator:'>=', value:10 },  // robuste
      { metric:'max_drawdown_3y',     operator:'<=', value:60 },
      { metric:'volatility_3y',       operator:'<=', value:50 }   // pas de contrainte dividende/payout ici
    ]
  },

  croissance: {
    label: '📈 Croissance',
    mode: 'lexico',
    metrics: [
      'perf_3y','perf_1y','perf_3m','ytd',
      'volatility_3y','max_drawdown_3y'
    ],
    geoFilters: { regions:['US','ASIA'], countries:[], sectors:['Technologie de l\'information','Santé','La communication'] },
    customFilters: [
      { metric:'perf_3y',             operator:'>=', value:60 },  // moins strict que 80
      { metric:'perf_1y',             operator:'>=', value:15 },
      { metric:'volatility_3y',       operator:'<=', value:35 },
      { metric:'max_drawdown_3y',     operator:'<=', value:40 },  // desserré vs 30 pour capter le growth
      { metric:'payout_ratio',        operator:'<=', value:70 }   // conserve le biais “growth”
    ]
  }
};




  // Fonction pour appliquer un preset
  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    
    console.log(`🎯 Application du preset: ${preset.label}`);
    
    // 1. Enregistrer le preset actuel
    state.currentPreset = preset.label;
    
    // 2. Mode
    api.setMode(preset.mode);
    
    // 3. Métriques et ordre
    api.setMetrics(preset.metrics);
    
    // 4. Filtres géographiques
    api.setGeoFilters(preset.geoFilters);
    
    // 5. Filtres personnalisés
    api.setCustomFilters(preset.customFilters);
    
    // 6. Mettre à jour l'UI des boutons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });
    
    // 7. Recalculer
    scheduleCompute();
  }

  // Event listeners
  modeRadios.forEach(r=>r.addEventListener('change',()=>{
    state.mode = modeRadios.find(x=>x.checked)?.value || 'balanced';
    
    const balancedExp = document.getElementById('balanced-explanation');
    const priorityExp = document.getElementById('priority-explanation');
    if (balancedExp && priorityExp) {
      balancedExp.classList.toggle('hidden', state.mode !== 'balanced');
      priorityExp.classList.toggle('hidden', state.mode !== 'lexico');
    }
    
    updatePriorityDisplay();
    scheduleCompute();
  }));
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      console.log('🎯 MC: Calcul demandé');
      compute();
    });
  }
  
  // v3.7: Reset avec nettoyage des UI tags
  if (resetBtn) {
    resetBtn.addEventListener('click', ()=>{
      state.selectedMetrics = ['ytd', 'dividend_yield_reg'];
      state.customFilters = [];
      state.geoFilters = { regions: new Set(), countries: new Set(), sectors: new Set() };
      state.currentPreset = null; // v3.8
      
      // Invalider les caches
      masks.geo = masks.custom = masks.final = null;
      
      Object.keys(METRICS).forEach(id => {
        const checkbox = root.querySelector('#m-'+id);
        if (checkbox) {
          checkbox.checked = state.selectedMetrics.includes(id);
        }
      });
      
      // Synchroniser les pills après reset
      root.querySelectorAll('.mc-pill input').forEach(inp => {
        const label = inp.closest('.mc-pill');
        if (label) {
          label.classList.toggle('is-checked', inp.checked);
        }
      });
      
      // Reset des UI de filtres tags
      regionUI?.clear();
      countryUI?.clear();
      sectorUI?.clear();
      updateCountryFilter(); // Refresh la liste des pays
      
      // Reset les boutons presets v3.8
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      const balancedRadio = modeRadios.find(x=>x.value==='balanced');
      if (balancedRadio) balancedRadio.checked=true;
      state.mode='balanced';
      
      updatePriorityDisplay();
      updateFiltersList();
      compute();
    });
  }

  // Initialisation
  addExplanation();
  addPresetsBar(); // v3.8
  setupMetricCheckboxes();
  setupCustomFilters();
  updatePriorityDisplay();
  setupPayoutPopover();

  // v3.8: Câbler les boutons de presets
  setTimeout(() => {
    const presetsBar = document.getElementById('mc-presets-bar');
    if (presetsBar) {
      presetsBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-preset]');
        if (!btn) return;
        applyPreset(btn.dataset.preset);
      });
    }
  }, 100);

  // Exposer l'API
  window.MC = { refresh: compute, loadData, state, cache, api, applyPreset };

  // Charger et calculer au démarrage
  loadData().then(() => {
    console.log('✅ MC Module v3.8 - Système de presets complets intégré !');
    if (state.selectedMetrics.length > 0) {
      compute();
    }
  });
})();
