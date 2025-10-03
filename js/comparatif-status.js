/*
 * Comparatif statuts — v2025 UX+ (presets & personas)
 * Remplace l'ancien comparatif-statuts.js
 *
 * Changements clés:
 * - ✅ Boutons de comparaisons populaires (EURL ↔ SASU, etc.)
 * - ✅ Personae en 1-clic (Freelance au chômage, Startup qui lève…)
 * - ✅ Paragraphe comparatif clair, contextuel
 * - ✅ Mode « différences uniquement » automatique dès qu'une comparaison est active (plus besoin du toggle)
 * - ♻️ Intégration 100% rétrocompatible: initComparatifStatuts() et hooks conservés
 */

// Fonction d'initialisation disponible globalement
window.initComparatifStatuts = function() {
  console.log("✅ Initialisation du tableau comparatif des statuts (UX+)");
  window.createComparatifTable('comparatif-container');
};

(function(){
  // ===================== MÉTAS FALLBACK =====================
  const META_FALLBACK = {
    'MICRO': {
      meta_payout: { peut_salaire: false, peut_dividendes: false, dividendes_cot_sociales: 'n/a', base_cotisations: 'bénéfice' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Bénéfice pris en compte par Pôle Emploi' },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: false, migration_simple: 'EI→société' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'faible' }
    },
    'EI': {
      meta_payout: { peut_salaire: false, peut_dividendes: false, dividendes_cot_sociales: 'n/a', base_cotisations: 'bénéfice' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Bénéfice pris en compte' },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: false, migration_simple: 'EI→société' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'faible' }
    },
    'EURL': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: '>10%', base_cotisations: 'rémunération + div>10%' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'moyen', entree_associes_facile: true, migration_simple: 'EURL→SARL facile' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'moyenne' }
    },
    'SASU': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: 'non', base_cotisations: 'rémunération' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'élevé', entree_associes_facile: true, migration_simple: 'SASU→SAS simple' },
      meta_dirigeant: { statut_dirigeant: 'assimilé salarié', couverture_dirigeant: 'élevée' }
    },
    'SARL': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: '>10%', base_cotisations: 'rémunération + div>10%' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'moyen', entree_associes_facile: true, migration_simple: 'SARL→SAS possible' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'moyenne' }
    },
    'SAS': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: 'non', base_cotisations: 'rémunération' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'élevé', entree_associes_facile: true, migration_simple: 'Actions préférence, BSPCE' },
      meta_dirigeant: { statut_dirigeant: 'assimilé salarié', couverture_dirigeant: 'élevée' }
    }
  };

  // ===================== UTILS =====================
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const toText = v => (v==null || v==='') ? '—' : String(v);
  const fmtEuro = n => Number.isFinite(+n) ? (+n).toLocaleString('fr-FR')+' €' : toText(n);
  const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  function getThresholds2025() {
    const T = (window.recoEngine && window.recoEngine.thresholds2025) || window.thresholds2025 || {};
    const def = {
      micro: { bic_sales:188700, bic_service:77700, bnc:77700, meuble_classe_ca:77700, meuble_non_classe_ca:15000 },
      tva_franchise_base: { ventes:85000, services:37500, tolerance_ventes:93500, tolerance_services:41250 }
    };
    return {
      micro: { ...def.micro, ...(T.micro||{}) },
      tva_franchise_base: { ...def.tva_franchise_base, ...(T.tva_franchise_base||{}) }
    };
  }

  function deriveObligations(shortName) {
    const T = getThresholds2025();
    const tvaFr = `Franchise TVA 2025 : ventes ${fmtEuro(T.tva_franchise_base.ventes)} • services ${fmtEuro(T.tva_franchise_base.services)}`;
    const microPlaf = `Ventes ${fmtEuro(T.micro.bic_sales)} • Services ${fmtEuro(T.micro.bic_service)} • BNC ${fmtEuro(T.micro.bnc)}`;

    const SN = (shortName||'').toUpperCase();
    if (SN.includes('MICRO')) {
      return {
        obligationsCle: [
          'Déclaration CA URSSAF mensuelle/trimestrielle',
          'Livre des recettes',
          'Franchise TVA par défaut',
          'CFE (exonérée 1ʳᵉ année)',
          'Compte pro si CA > 10k€ 2 ans'
        ].join(' · '),
        plafondCA: microPlaf,
        regimeTVA: tvaFr
      };
    }
    if (SN==='EURL') return { obligationsCle: 'Compta engagement · AG<6 mois · TVA réel ou franchise · Cotis TNS + div>10%' };
    if (SN==='SASU') return { obligationsCle: 'Compta engagement · Paie & DSN si rémunération · TVA réel ou franchise · Div non soumis cotis' };
    return { obligationsCle: '' };
  }

  // ===================== INTENTS & SCORING =====================
  const parseAssociesMin = (text)=>{ if(!text) return 1; const t=String(text).toLowerCase(); const nums=(t.match(/\d+/g)||[]).map(n=>parseInt(n,10)).sort((a,b)=>a-b); if(nums.length) return nums[0]; return /\b2\+|plusieurs|deux\b/.test(t)?2:1; };
  const allowsMultipleAssociates = (statut)=>parseAssociesMin(statut.associes)>=2;
  const hasISByDefault = (statut)=>{ const f=(statut.fiscalite||'').toLowerCase(); return /\bis\b/.test(f) && !/\bir\b/.test(f); };
  const canOptIS = (statut)=>{ const opt=(statut.fiscaliteOption||'').toLowerCase(); return /option|possible/.test(opt) && /\bis\b/.test(opt); };
  const canPayDividends = (statut)=>{ const meta=statut.meta_payout||{}; if(meta.peut_dividendes) return true; if(hasISByDefault(statut)) return true; if(canOptIS(statut)) return true; return false; };

  function matchIntent(statut, ans){
    if(ans.prevoit_associes==='oui' && !allowsMultipleAssociates(statut)) return false;
    if(ans.veut_dividendes && !canPayDividends(statut)) return false;
    return true;
  }

  function scoreStatut(statut, answers){
    let s=0; const why=[]; const meta=statut.meta_payout||{}; const areM=statut.meta_are||{}; const evoM=statut.meta_evolution||{};
    if(answers.veut_dividendes && meta.peut_dividendes){ s+=3; if(meta.dividendes_cot_sociales==='non'){ s+=2; why.push('Dividendes sans cotis'); } else if(meta.dividendes_cot_sociales==='>10%'){ why.push('Dividendes >10% cotisés'); } }
    if(answers.en_chomage && areM.are_compatible_sans_salaire){ s+=2; why.push('ARE compatible'); }
    if(answers.prevoit_associes!=='non'){ if(evoM.entree_associes_facile){ s+=2; } else { s-=1; why.push('Entrée associés encadrée'); } }
    if(answers.levee_fonds!=='non'){ const lvl=evoM.accueil_investisseurs; if(lvl==='élevé'){ s+=3; why.push('Investisseurs friendly'); } else if(lvl==='moyen'){ s+=1; } else { s-=1; } }
    return { score:s, why:why.slice(0,3) };
  }

  const onlyDifferences = (rows, columns)=>{
    const keys = columns.map(c=>c.key).filter(k=>k!=='name');
    return keys.filter(k=>{ const vals=rows.map(r=>String(r[k]??'—').toLowerCase()); return new Set(vals).size>1; });
  };

  function enrichForDisplay(statut, answers={}){
    const derived=deriveObligations(statut.shortName||statut.name);
    const km=statut.key_metrics||{}; const shortName=(statut.shortName||'').toUpperCase();
    const fallback = META_FALLBACK[shortName] || {};
    const enriched = {
      ...statut,
      regimeTVA: statut.regimeTVA || derived.regimeTVA,
      plafondCA: statut.plafondCA || derived.plafondCA || '—',
      obligationsCle: statut.obligationsCle || derived.obligationsCle || '—',
      _pp_stars: Number.isFinite(km.patrimony_protection) ? km.patrimony_protection : null,
      _pp_text: toText(statut.protectionPatrimoine),
      meta_payout: statut.meta_payout || fallback.meta_payout || {},
      meta_are: statut.meta_are || fallback.meta_are || {},
      meta_evolution: statut.meta_evolution || fallback.meta_evolution || {},
      meta_dirigeant: statut.meta_dirigeant || fallback.meta_dirigeant || {}
    };
    if(Object.keys(answers).length>0){ const scoring=scoreStatut(enriched, answers); enriched._score=scoring.score; enriched._why=scoring.why; }
    return enriched;
  }

  // ===================== CSS =====================
  function injectCSS(){
    if(document.getElementById('comparatif-status-styles')) return;
    const style=document.createElement('style'); style.id='comparatif-status-styles';
    style.textContent=`
      .comparatif-container{max-width:100%;overflow-x:auto;font-family:'Inter',sans-serif;color:#E6E6E6}
      .comparatif-header{margin-bottom:1.5rem}
      .comparatif-title{font-size:1.75rem;font-weight:700;margin-bottom:.75rem;color:#00FF87}
      .comparatif-description{color:rgba(230,230,230,.8);margin-bottom:1rem;line-height:1.5}

      .intent-filters{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:.75rem;padding:1rem;background:rgba(1,35,65,.5);border-radius:8px;border:1px solid rgba(0,255,135,.2)}
      .intent-filter-item{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;background:rgba(1,42,74,.5);border-radius:6px;cursor:pointer;transition:all .2s}
      .intent-filter-item:hover{background:rgba(1,42,74,.8)}
      .intent-filter-item.active{background:rgba(0,255,135,.15);border:1px solid rgba(0,255,135,.4)}
      .intent-filter-item input[type="checkbox"]{width:16px;height:16px;cursor:pointer;accent-color:#00FF87}
      .intent-filter-item label{cursor:pointer;font-size:.875rem;user-select:none}

      .quick-presets{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0 1rem}
      .preset-chip{padding:.4rem .6rem;border:1px solid rgba(0,255,135,.4);background:rgba(0,255,135,.08);border-radius:999px;font-size:.8rem;color:#00FF87;cursor:pointer}
      .preset-chip:hover{background:rgba(0,255,135,.18)}

      .personas{display:flex;flex-wrap:wrap;gap:.5rem;margin:.25rem 0 1rem}
      .persona-chip{padding:.45rem .7rem;border:1px dashed rgba(255,255,255,.25);border-radius:8px;font-size:.8rem;color:#e6e6e6;cursor:pointer;background:rgba(1,22,39,.6)}
      .persona-chip:hover{border-color:#00FF87}

      .comparison-bar{display:flex;align-items:center;padding:.75rem 1rem;background-color:rgba(1,35,65,.7);border-radius:8px;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem}
      .comparison-title{font-size:.875rem;font-weight:500;color:rgba(255,255,255,.8);margin-right:1rem}
      .comparison-items{display:flex;flex-wrap:wrap;gap:.5rem;flex-grow:1}
      .comparison-item{display:flex;align-items:center;padding:.375rem .75rem;background-color:rgba(0,255,135,.15);border:1px solid rgba(0,255,135,.3);border-radius:4px;font-size:.8125rem;color:#00FF87}
      .comparison-item .remove-btn{background:none;border:none;color:rgba(255,255,255,.6);font-size:.75rem;margin-left:.5rem;cursor:pointer;padding:2px}
      .comparison-item .remove-btn:hover{color:#FF6B6B}
      .status-dropdown{margin-right:.5rem;width:200px;padding:.5rem;background-color:rgba(1,42,74,.7);border:1px solid rgba(0,255,135,.3);border-radius:4px;color:#E6E6E6}

      .advice-card{border:1px solid rgba(0,255,135,.3);border-radius:8px;padding:12px;background:rgba(1,35,65,.6);margin:.5rem 0 1rem}
      .advice-card .title{font-weight:600;color:#00FF87;margin-bottom:6px}
      .advice-card ul{margin:0;padding-left:18px;line-height:1.45}
      .advice-note{font-size:.8rem;color:rgba(255,255,255,.7);margin-top:.4rem}

      .comparatif-filters{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;align-items:flex-end}
      .filter-group{flex:1;min-width:200px}
      .filter-label{display:block;margin-bottom:.5rem;color:rgba(230,230,230,.7);font-size:.875rem}
      .criteria-buttons{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem}
      .criteria-button{padding:.5rem .75rem;border-radius:.375rem;font-size:.875rem;cursor:pointer;background-color:rgba(1,42,74,.5);border:1px solid rgba(0,255,135,.2);color:rgba(230,230,230,.8);transition:all .2s ease}
      .criteria-button:hover{border-color:rgba(0,255,135,.4);background-color:rgba(1,42,74,.7)}
      .criteria-button.active{background-color:rgba(0,255,135,.15);border-color:rgba(0,255,135,.7);color:#00FF87}

      .search-input{width:100%;padding:.625rem 1rem;border-radius:.375rem;border:1px solid rgba(1,42,74,.8);background-color:rgba(1,42,74,.5);color:#E6E6E6;transition:all .2s ease}
      .search-input:focus{outline:none;border-color:rgba(0,255,135,.5);box-shadow:0 0 0 2px rgba(0,255,135,.2)}

      .comparatif-table-container{border-radius:.75rem;border:1px solid rgba(1,42,74,.8);overflow:hidden;background-color:rgba(1,42,74,.3);box-shadow:0 4px 12px rgba(0,0,0,.1)}
      .comparatif-table{width:100%;border-collapse:collapse;text-align:left}
      .comparatif-table th{padding:1rem;background-color:rgba(1,22,39,.8);font-weight:600;color:#00FF87;font-size:.875rem;text-transform:uppercase;border-bottom:1px solid rgba(1,42,74,.8);position:sticky;top:0;z-index:10}
      .comparatif-table td{padding:.875rem 1rem;border-bottom:1px solid rgba(1,42,74,.5);font-size:.875rem;vertical-align:top}
      .comparatif-table tr:last-child td{border-bottom:none}
      .comparatif-table tr:nth-child(odd){background-color:rgba(1,42,74,.2)}
      .comparatif-table tr:hover{background-color:rgba(0,255,135,.05);cursor:pointer}
      .diff-col th,.diff-col td{background:rgba(0,255,135,.04)}

      .statut-cell{display:flex;align-items:flex-start;gap:.75rem}
      .statut-icon{width:2.5rem;height:2.5rem;display:flex;align-items:center;justify-content:center;border-radius:50%;background-color:rgba(1,42,74,.5);color:#00FF87;font-size:1rem;flex-shrink:0}
      .statut-info{display:flex;flex-direction:column}
      .statut-name{font-weight:600;color:#E6E6E6}
      .statut-fullname{font-size:.75rem;color:rgba(230,230,230,.6)}
      .status-badges{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.25rem}
      .status-badge{display:inline-flex;align-items:center;padding:.125rem .375rem;border-radius:3px;font-size:.65rem;font-weight:600;text-transform:uppercase}
      .badge-salary{background:rgba(59,130,246,.2);color:#60A5FA}
      .badge-dividends{background:rgba(236,72,153,.2);color:#EC4899}
      .badge-are{background:rgba(16,185,129,.2);color:#10B981}
      .badge-investors{background:rgba(245,158,11,.2);color:#F59E0B}
      .badge-tns{background:rgba(139,92,246,.2);color:#A78BFA}
      .badge-assimile{background:rgba(34,211,238,.2);color:#22D3EE}

      .loading-state{display:flex;justify-content:center;align-items:center;height:200px;flex-direction:column;gap:1rem}
      .spinner{width:40px;height:40px;border:3px solid rgba(0,255,135,.3);border-radius:50%;border-top-color:#00FF87;animation:spin 1s ease-in-out infinite}
      @keyframes spin{to{transform:rotate(360deg)}}

      .comparatif-notes{margin-top:1.5rem;padding:1rem;border-radius:.5rem;background-color:rgba(1,42,74,.3);font-size:.875rem}
      .notes-title{font-weight:600;color:#00FF87;margin-bottom:.5rem}
      .notes-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.5rem;margin-bottom:.75rem}
      .notes-item{display:flex;align-items:center;gap:.5rem}
      .notes-term{color:#00FF87;font-weight:500}
      .notes-disclaimer{font-style:italic;color:rgba(230,230,230,.6);font-size:.8125rem;text-align:center;margin-top:.75rem}

      @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      .comparatif-table tbody tr{animation:fadeInUp .3s ease forwards;opacity:0}

      @media (max-width: 768px){
        .comparatif-filters{flex-direction:column}
        .criteria-buttons{grid-template-columns:repeat(2,1fr)}
        .statut-icon{width:2rem;height:2rem;font-size:.875rem}
        .comparatif-table th,.comparatif-table td{padding:.75rem .5rem;font-size:.75rem}
        .notes-list{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  // ===================== TABLEAU =====================
  window.createComparatifTable = function(containerId){
    const container = document.getElementById(containerId);
    if(!container){ console.error(`❌ Conteneur #${containerId} non trouvé`); return; }

    injectCSS();

    container.innerHTML = `
      <div class="comparatif-container">
        <div class="comparatif-header">
          <h2 class="comparatif-title">Comparatif des formes juridiques 2025</h2>
          <p class="comparatif-description">Filtrez par intention, comparez vos statuts favoris, lisez un résumé clair adapté à votre situation.</p>

          <div class="intent-filters" id="intent-filters">
            <div class="intent-filter-item" data-intent="veut_dividendes">
              <input type="checkbox" id="filter-dividendes">
              <label for="filter-dividendes">💰 Je vise des dividendes</label>
            </div>
            <div class="intent-filter-item" data-intent="en_chomage">
              <input type="checkbox" id="filter-chomage">
              <label for="filter-chomage">🛡️ Je suis au chômage (ARE)</label>
            </div>
            <div class="intent-filter-item" data-intent="prevoit_associes">
              <input type="checkbox" id="filter-associes">
              <label for="filter-associes">👥 J'aurai des associés</label>
            </div>
            <div class="intent-filter-item" data-intent="levee_fonds">
              <input type="checkbox" id="filter-levee">
              <label for="filter-levee">🚀 Je veux lever des fonds</label>
            </div>
          </div>

          <div class="quick-presets" id="quick-presets"></div>
          <div class="personas" id="personas"></div>

          <div class="comparison-bar">
            <div class="comparison-title">Comparer directement:</div>
            <select id="status-dropdown" class="status-dropdown">
              <option value="">Sélectionner un statut...</option>
            </select>
            <div class="comparison-items" id="comparison-items"></div>
          </div>

          <div id="smart-comparison"></div>
          <div id="persona-advice"></div>

          <div class="comparatif-filters">
            <div class="filter-group">
              <label class="filter-label">Filtrer par critères:</label>
              <div class="criteria-buttons" id="criteria-buttons"></div>
            </div>
            <div class="filter-group" style="max-width:300px;">
              <label class="filter-label">Rechercher:</label>
              <input type="text" id="search-input" class="search-input" placeholder="Rechercher un statut...">
            </div>
          </div>
        </div>

        <div class="comparatif-table-container">
          <table class="comparatif-table" id="comparatif-table">
            <thead><tr id="table-headers"></tr></thead>
            <tbody id="table-body">
              <tr><td colspan="10"><div class="loading-state"><div class="spinner"></div><p>Chargement des données...</p></div></td></tr>
            </tbody>
          </table>
        </div>

        <div class="comparatif-notes">
          <h3 class="notes-title">Notes explicatives</h3>
          <div class="notes-list">
            <div class="notes-item"><span class="notes-term">IR</span> - Impôt sur le Revenu</div>
            <div class="notes-item"><span class="notes-term">IS</span> - Impôt sur les Sociétés</div>
            <div class="notes-item"><span class="notes-term">TNS</span> - Travailleur Non Salarié</div>
            <div class="notes-item"><span class="notes-term">CA</span> - Chiffre d'Affaires</div>
            <div class="notes-item"><span class="notes-term">PFU</span> - Prélèvement Forfaitaire Unique (30%)</div>
            <div class="notes-item"><span class="notes-term">ARE</span> - Allocation Retour à l'Emploi</div>
          </div>
          <p class="notes-disclaimer">Informations 2025. Consultez un expert-comptable pour votre cas précis.</p>
        </div>
      </div>
    `;

    // ---------- critères ----------
    const criteria=[
      { id:'all', label:'Tous les critères' },
      { id:'basic', label:'Critères de base' },
      { id:'fiscal', label:'Aspects fiscaux' },
      { id:'social', label:'Aspects sociaux' },
      { id:'creation', label:'Création et gestion' }
    ];
    const criteriaButtons=document.getElementById('criteria-buttons');
    criteria.forEach(c=>{
      const b=document.createElement('button');
      b.className='criteria-button'+(c.id==='all'?' active':'');
      b.setAttribute('data-criterion', c.id); b.textContent=c.label;
      criteriaButtons.appendChild(b);
    });

    // ---------- états ----------
    let selectedCriterion='all';
    let searchTerm='';
    let compareStatuts=[]; // tableau de shortNames

    // Intentions (ajout facultatif: eviter_salaire pour les personae)
    let intentAnswers={
      veut_dividendes:false,
      en_chomage:false,
      prevoit_associes:'non',
      levee_fonds:'non',
      eviter_salaire:false
    };

    // ---------- hooks publics (rétrocompat) ----------
    window.__comparatifHooks = window.__comparatifHooks || {};
    window.__comparatifHooks.setComparison=function(statuts){ compareStatuts=statuts||[]; updateComparisonBar(); updateTable(); renderPersonaAdvice(); };
    window.__comparatifHooks.setIntents=function(intents){ Object.assign(intentAnswers, intents); syncIntentUI(); renderAREHelper(intentAnswers); updateTable(); renderPersonaAdvice(); };

    // ---------- init ----------
    initIntentFilters();
    initComparisonEvents();
    renderQuickPresets();
    renderPersonas();
    loadStatutData();
    renderAREHelper(intentAnswers);

    // ---------- events UI ----------
    $$('.criteria-button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        $$('.criteria-button').forEach(x=>x.classList.remove('active'));
        btn.classList.add('active');
        selectedCriterion=btn.getAttribute('data-criterion');
        updateTable();
      });
    });
    const debouncedUpdate=debounce(()=>updateTable(),200);
    $('#search-input').addEventListener('input',e=>{ searchTerm=e.target.value.toLowerCase(); debouncedUpdate(); });

    // ---------- intent filters ----------
    function syncIntentUI(){
      $$('.intent-filter-item').forEach(item=>{
        const intent=item.dataset.intent; const checkbox=item.querySelector('input[type="checkbox"]');
        if(!checkbox) return;
        if(intent==='prevoit_associes' || intent==='levee_fonds'){ checkbox.checked = intentAnswers[intent]==='oui'; }
        else { checkbox.checked=!!intentAnswers[intent]; }
        item.classList.toggle('active', checkbox.checked);
      });
    }
    function initIntentFilters(){
      $$('.intent-filter-item').forEach(item=>{
        const intent=item.dataset.intent; const checkbox=item.querySelector('input[type="checkbox"]');
        item.addEventListener('click',e=>{ if(e.target!==checkbox){ checkbox.checked=!checkbox.checked; checkbox.dispatchEvent(new Event('change')); } });
        checkbox.addEventListener('change',()=>{
          item.classList.toggle('active', checkbox.checked);
          if(intent==='prevoit_associes' || intent==='levee_fonds'){ intentAnswers[intent]=checkbox.checked?'oui':'non'; }
          else { intentAnswers[intent]=checkbox.checked; }
          renderAREHelper(intentAnswers); updateTable(); renderPersonaAdvice();
        });
      });
    }

    // ---------- Quick presets ----------
    function renderQuickPresets(){
      const host=$('#quick-presets'); if(!host) return;
      const presets=[
        ['EURL','SASU'],
        ['SAS','SARL'],
        ['MICRO','EI'],
        ['SASU','SARL'],
        ['SASU','MICRO']
      ];
      host.innerHTML = presets.map(p=>`<button class="preset-chip" data-preset="${p.join(',')}">${p[0]} ↔ ${p[1]}</button>`).join('');
      host.querySelectorAll('.preset-chip').forEach(b=>b.addEventListener('click',()=>{
        const [a,bis]=b.getAttribute('data-preset').split(',');
        compareStatuts=[a,bis]; updateComparisonBar(); updateTable(); renderPersonaAdvice();
        window.scrollTo({ top: host.getBoundingClientRect().top + window.scrollY - 24, behavior:'smooth' });
      }));
    }

    // ---------- Personae ----------
    function renderPersonas(){
      const host=$('#personas'); if(!host) return;
      const personas=[
        { id:'freelance-are', label:'Freelance au chômage (ARE)', apply:()=>{ intentAnswers={...intentAnswers,en_chomage:true,veut_dividendes:true,eviter_salaire:true,prevoit_associes:'non',levee_fonds:'non'}; compareStatuts=['EURL','SASU']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }},
        { id:'consultant-solo', label:'Consultant solo sans associés', apply:()=>{ intentAnswers={...intentAnswers,en_chomage:false,veut_dividendes:false,eviter_salaire:false,prevoit_associes:'non',levee_fonds:'non'}; compareStatuts=['EURL','SASU']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }},
        { id:'startup-fundraise', label:'Startup (lever des fonds)', apply:()=>{ intentAnswers={...intentAnswers,levee_fonds:'oui',prevoit_associes:'oui',en_chomage:false}; compareStatuts=['SASU','SAS']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }},
        { id:'artisan-tns', label:'Artisan budget serré (TNS)', apply:()=>{ intentAnswers={...intentAnswers,veut_dividendes:false,en_chomage:false,prevoit_associes:'non'}; compareStatuts=['EURL','MICRO']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }}
      ];
      host.innerHTML = personas.map(p=>`<button class="persona-chip" data-id="${p.id}">${p.label}</button>`).join('');
      host.querySelectorAll('.persona-chip').forEach(el=>{
        const p=personas.find(x=>x.id===el.getAttribute('data-id')); if(p) el.addEventListener('click',p.apply);
      });
    }

    // ---------- ARE helper (inchangé) ----------
    function renderAREHelper(intentAnswers){
      let host=document.getElementById('are-helper');
      if(!host){ host=document.createElement('div'); host.id='are-helper'; host.style.marginTop='.5rem'; const header=document.querySelector('.comparatif-header'); header && header.appendChild(host); }
      if(!intentAnswers.en_chomage){ host.innerHTML=''; host.style.display='none'; return; }
      host.style.display='block';
      host.innerHTML=`
        <div style="border:1px solid rgba(0,255,135,.35);border-radius:8px;padding:12px;background:rgba(1,35,65,.6)">
          <div style="font-weight:600;color:#00FF87;margin-bottom:6px">🛡️ Chômage (ARE) — points clés</div>
          <ul style="margin:0; padding-left:18px; line-height:1.4">
            <li><b>Salaire</b> versé ⇒ <b>réduction ARE</b></li>
            <li><b>Dividendes SAS/SASU</b> ⇒ <b>non pris en compte</b> par ARE</li>
            <li><b>EURL/SARL à l'IS</b> ⇒ dividendes >10% soumis cotis TNS</li>
            <li><b>ARCE</b> possible vs <b>maintien ARE</b> : à arbitrer</li>
          </ul>
        </div>`;
    }

    // ---------- comparaison directe ----------
    function initComparisonEvents(){
      const statusDropdown=$('#status-dropdown');
      function populate(){ if(!window.legalStatuses) return; statusDropdown.innerHTML='<option value="">Sélectionner un statut...</option>';
        const statuts=Object.values(window.legalStatuses).sort((a,b)=>a.shortName.localeCompare(b.shortName,'fr',{sensitivity:'base'}));
        statuts.forEach(s=>{ const o=document.createElement('option'); o.value=s.shortName; o.textContent=s.shortName; statusDropdown.appendChild(o); }); }
      statusDropdown.addEventListener('change',()=>{ if(statusDropdown.value){ addToComparison(statusDropdown.value); statusDropdown.value=''; }});
      if(window.legalStatuses) populate(); else { const it=setInterval(()=>{ if(window.legalStatuses){ populate(); clearInterval(it);} },400); }
      window.addEventListener('legalStatuses:ready',()=>populate(),{ once:true });
    }

    function addToComparison(sn){ if(compareStatuts.includes(sn)) return; if(compareStatuts.length>=3) compareStatuts.shift(); compareStatuts.push(sn); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }
    function removeFromComparison(sn){ const i=compareStatuts.indexOf(sn); if(i!==-1){ compareStatuts.splice(i,1); updateComparisonBar(); updateTable(); renderPersonaAdvice(); }}

    function updateComparisonBar(){
      const wrap=$('#comparison-items'); wrap.innerHTML='';
      compareStatuts.forEach(shortName=>{
        const statut=(Object.values(window.legalStatuses||{}).find(s=>s.shortName===shortName)); if(!statut) return;
        const div=document.createElement('div'); div.className='comparison-item'; div.setAttribute('data-status',shortName);
        div.innerHTML=`<i class="fas ${statut.logo||'fa-building'} mr-2"></i> ${shortName} <button class="remove-btn"><i class="fas fa-times"></i></button>`;
        div.querySelector('.remove-btn').addEventListener('click',()=>removeFromComparison(shortName));
        wrap.appendChild(div);
      });
      renderSmartComparison();
    }

    function renderSmartComparison(){
      let host=$('#smart-comparison'); if(!host){ host=document.createElement('div'); host.id='smart-comparison'; $('.comparatif-header')?.appendChild(host); }
      host.innerHTML='';
      const has=x=>compareStatuts.includes(x);
      const get=sn=>enrichForDisplay(Object.values(window.legalStatuses||{}).find(s=>s.shortName===sn)||{shortName:sn,name:sn}, intentAnswers);

      // EURL vs SASU — carte dédiée
      if(has('EURL') && has('SASU')){
        const eurl=get('EURL'), sasu=get('SASU');
        host.innerHTML+=`
          <div class="advice-card">
            <div class="title">💡 EURL vs SASU — points décisifs</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <div><b>Social</b>: ${toText(eurl.regimeSocial)}</div>
                <div><b>Fiscalité</b>: ${toText(eurl.fiscalite)}</div>
                <div><b>Dividendes</b>: cotisés >10%</div>
              </div>
              <div>
                <div><b>Social</b>: ${toText(sasu.regimeSocial)}</div>
                <div><b>Fiscalité</b>: ${toText(sasu.fiscalite)}</div>
                <div><b>Dividendes</b>: non cotisés (PFU)</div>
              </div>
            </div>
          </div>`;
      }
      // SAS vs SARL
      if(has('SAS') && has('SARL')){
        const sas=get('SAS'), sarl=get('SARL');
        host.innerHTML+=`
          <div class="advice-card">
            <div class="title">💡 SAS vs SARL — gouvernance & investisseurs</div>
            <ul>
              <li><b>SAS</b>: statuts très souples, accueil investisseurs élevé (BSPCE, actions de préférence)</li>
              <li><b>SARL</b>: cadre plus encadré, cessions encadrées, gérant TNS</li>
            </ul>
          </div>`;
      }
      // MICRO vs EI
      if(has('MICRO') && has('EI')){
        const micro=get('MICRO'), ei=get('EI');
        host.innerHTML+=`
          <div class="advice-card">
            <div class="title">💡 Micro vs EI — simplicité vs souplesse</div>
            <ul>
              <li><b>Micro</b>: obligations ultra-légères, plafonds ${toText(micro.plafondCA)}</li>
              <li><b>EI réel</b>: plus de charges/tenue comptable mais déduction des frais réels</li>
            </ul>
          </div>`;
      }
    }

    // ---------- paragraphe conseil contextuel ----------
    function renderPersonaAdvice(){
      const host=$('#persona-advice'); if(!host) return; host.innerHTML='';
      const has=x=>compareStatuts.includes(x);
      if(intentAnswers.en_chomage && intentAnswers.eviter_salaire && (has('EURL')||has('SASU'))){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title">🧭 Cas type — Freelance au chômage qui veut préserver l'ARE (sans se verser de salaire)</div>
            <ul>
              <li><b>SASU</b>: versement de <b>dividendes</b> non pris en compte par l'ARE ⇒ pas d'impact tant que vous ne prenez pas de salaire.</li>
              <li><b>EURL</b>: dividendes >10% soumis aux <b>cotisations TNS</b>; fiscalement possible, mais socialement moins optimisé si l'objectif est l'ARE.</li>
              <li><b>Arbitrage</b>: à court terme SASU cohérente pour l'ARE; si vous prévoyez un <b>salaire régulier</b> et des <b>charges basses</b>, l'EURL (TNS) peut coûter moins cher sur le salaire.</li>
            </ul>
            <div class="advice-note">Astuce: vous pouvez démarrer en SASU, puis basculer vers SAS lors de l'arrivée d'associés.</div>
          </div>`;
        return;
      }
      if(intentAnswers.levee_fonds==='oui'){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title">🧭 Cas type — Startup qui prévoit de lever des fonds</div>
            <ul>
              <li><b>SAS/SASU</b> recommandée: gouvernance souple, <b>BSPCE</b>, actions de préférence, entrée d'investisseurs <b>simple</b>.</li>
              <li><b>SARL/EURL</b>: possible mais moins fluide (agréments, parts sociales, options complexes).</li>
            </ul>
          </div>`;
        return;
      }
      // défaut soft
      if(compareStatuts.length>=2){
        host.innerHTML = `
          <div class="advice-card"><div class="title">🧭 Résumé</div>
            <div>Vous comparez <b>${compareStatuts.join(' vs ')}</b>. Les colonnes affichées ci‑dessous sont <b>limitées aux différences</b> pour gagner du temps.</div>
          </div>`;
      }
    }

    // ---------- DATA / TABLE ----------
    function loadStatutData(){
      if(window.legalStatuses){ renderTable(window.legalStatuses); }
      else {
        setTimeout(()=>{ if(window.legalStatuses){ renderTable(window.legalStatuses); } else { const body=$('#table-body'); body.innerHTML=`<tr><td colspan="10"><div class="loading-state"><p style="color:#FF6B6B;"><i class="fas fa-exclamation-triangle"></i> Impossible de charger les données.</p><button id="retry-load" style="padding:.5rem 1rem;background-color:rgba(0,255,135,.2);border:1px solid rgba(0,255,135,.5);color:#00FF87;border-radius:.375rem;cursor:pointer;margin-top:.5rem;">Réessayer</button></div></td></tr>`; $('#retry-load').addEventListener('click',loadStatutData); } }, 500);
      }
      window.addEventListener('legalStatuses:ready',()=>renderTable(window.legalStatuses),{ once:true });
    }

    function getColumnsForCriterion(criterion){
      switch(criterion){
        case 'basic': return [ {key:'name',label:'Statut'}, {key:'associes',label:"Nombre d'associés"}, {key:'capital',label:'Capital social'}, {key:'responsabilite',label:'Responsabilité'} ];
        case 'fiscal': return [ {key:'name',label:'Statut'}, {key:'fiscalite',label:'Régime fiscal'}, {key:'fiscaliteOption',label:'Option fiscale'}, {key:'regimeTVA',label:'Régime TVA'} ];
        case 'social': return [ {key:'name',label:'Statut'}, {key:'regimeSocial',label:'Régime social'}, {key:'chargesSociales',label:'Charges sociales'}, {key:'protectionPatrimoine',label:'Protection patrimoine'} ];
        case 'creation': return [ {key:'name',label:'Statut'}, {key:'formalites',label:'Formalités'}, {key:'publicationComptes',label:'Publication comptes'}, {key:'plafondCA',label:'Plafond CA'}, {key:'obligationsCle',label:'Obligations clés'} ];
        default: return [ {key:'name',label:'Statut'}, {key:'associes',label:"Nombre d'associés"}, {key:'capital',label:'Capital social'}, {key:'responsabilite',label:'Responsabilité'}, {key:'fiscalite',label:'Régime fiscal'}, {key:'regimeSocial',label:'Régime social'}, {key:'plafondCA',label:'Plafond CA'} ];
      }
    }

    function filterStatuts(statuts, term){
      let list=Object.values(statuts);
      if(compareStatuts.length>0) list=list.filter(s=>compareStatuts.includes(s.shortName));
      if(term){ const tt=term.toLowerCase(); list=list.filter(s=> (s.name||'').toLowerCase().includes(tt) || (s.shortName||'').toLowerCase().includes(tt) || (s.description||'').toLowerCase().includes(tt)); }
      list=list.map(s=>enrichForDisplay(s,intentAnswers)).filter(s=>matchIntent(s,intentAnswers));
      const anyIntent=intentAnswers.veut_dividendes||intentAnswers.en_chomage||intentAnswers.prevoit_associes==='oui'||intentAnswers.levee_fonds==='oui';
      if(anyIntent) list.sort((a,b)=>(b._score||0)-(a._score||0));
      return list;
    }

    function updateTable(){
      if(!window.legalStatuses) return;
      let columns=getColumnsForCriterion(selectedCriterion);
      const rowsData=filterStatuts(window.legalStatuses, searchTerm);

      // 🎯 Mode diff AUTO: si on compare ≥ 2 statuts, ne garder que les colonnes qui différent
      let diffKeys=[]; let applyDiff=false;
      if(compareStatuts.length>=2 && rowsData.length>=2){ diffKeys=onlyDifferences(rowsData, columns); if(diffKeys.length){ columns=[{key:'name',label:'Statut'}, ...columns.filter(c=>diffKeys.includes(c.key))]; applyDiff=true; } }

      const th=$('#table-headers'); th.innerHTML = columns.map(c=>`<th>${c.label}</th>`).join('');
      if(applyDiff){ th.classList.add('diff-col'); } else { th.classList.remove('diff-col'); }

      const body=$('#table-body');
      if(rowsData.length===0){ body.innerHTML=`<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;">Aucun statut ne correspond à votre recherche.</td></tr>`; return; }

      function genBadges(st){
        const badges=[]; const meta=st.meta_payout||{}; const dir=st.meta_dirigeant||{};
        if(meta.peut_salaire) badges.push('<span class="status-badge badge-salary">💼 Salaire</span>');
        if(meta.peut_dividendes){ badges.push(`<span class="status-badge badge-dividends">${meta.dividendes_cot_sociales==='non'?'💰 Div. sans cotis':'💰 Dividendes'}</span>`); }
        if(intentAnswers.en_chomage && st.meta_are?.are_compatible_sans_salaire) badges.push('<span class="status-badge badge-are">🛡️ ARE ok</span>');
        if(st.meta_evolution?.accueil_investisseurs==='élevé') badges.push('<span class="status-badge badge-investors">🚀 Investisseurs</span>');
        if(dir.statut_dirigeant==='TNS') badges.push('<span class="status-badge badge-tns">TNS</span>');
        else if(dir.statut_dirigeant==='assimilé salarié') badges.push('<span class="status-badge badge-assimile">Assimilé salarié</span>');
        return badges.join('');
      }

      body.innerHTML = rowsData.map((st,i)=>{
        let row=`<tr style="animation-delay:${i*0.05}s;" data-statut="${st.shortName}">`;
        columns.forEach(col=>{
          if(col.key==='name'){
            const why = st._why && st._why.length? `<div style="font-size:.7rem;color:rgba(255,255,255,.6);margin-top:.25rem;font-style:italic;">${st._why.join(', ')}</div>` : '';
            row+=`<td><div class="statut-cell"><div class="statut-icon"><i class="fas ${st.logo||'fa-building'}"></i></div><div class="statut-info"><div><span class="statut-name">${st.shortName}</span></div><span class="statut-fullname">${st.name}</span>${why}<div class="status-badges">${genBadges(st)}</div></div></div></td>`;
          } else if(col.key==='responsabilite'){
            const isLimited=st[col.key] && st[col.key].toLowerCase().includes('limitée');
            row+=`<td class="${isLimited?'highlighted-value':''}">${toText(st[col.key])}${isLimited?' <i class="fas fa-shield-alt" style="color:#00FF87"></i>':''}</td>`;
          } else if(col.key==='protectionPatrimoine'){
            const rating=Number.isFinite(st._pp_stars)?st._pp_stars:null;
            const stars=(rating!=null)? `<span title="${rating}/5">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>`:'';
            row+=`<td>${stars} <span>${toText(st._pp_text)}</span></td>`;
          } else if(col.key==='capital'){
            row+=`<td class="key-cell">${toText(st[col.key])}</td>`;
          } else {
            row+=`<td>${toText(st[col.key])}</td>`;
          }
        });
        row+='</tr>'; return row;
      }).join('');

      // ajout: clic pour ajouter à la barre de comparaison
      $$('#table-body tr').forEach(row=>{ row.addEventListener('click',()=>{ const sn=row.getAttribute('data-statut'); if(sn) addToComparison(sn); }); });
    }

    function renderTable(data){ updateTable(); }
  };
})();
