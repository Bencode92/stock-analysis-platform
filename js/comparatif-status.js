/*
 * Comparatif statuts — v2025 UX Clean Room + Phase 1-4 + Sprint UX B
 * Sprint UX B: Hero refonte, toast, switch différences, groupes, ghost column, assistant sticky
 * Ajouts Phase 1: renderDividendRule, colonne ARE, tooltips auto, signaux visuels
 * Ajouts Phase 2: blocs d'aide à la décision pour paires populaires
 * Ajouts Phase 3: XSS protection, keyboard accessibility, URL state persistence
 * Ajouts Phase 4: bannières impact, limite 2 statuts, mode cartes mobile, partage intelligent
 */

window.initComparatifStatuts = function() {
  console.log("✅ Initialisation du tableau comparatif (UX Clean Room + Sprint B)");
  window.createComparatifTable('comparatif-container');
};

(function(){
  // ===================== DESIGN TOKENS =====================
  const TOKENS = {
    spacing: { xs:4, sm:8, md:12, lg:16, xl:24, xxl:28 },
    radius: { sm:4, md:6, lg:8, xl:12 },
    surface: {
      base: 'rgba(1, 35, 65, 0.5)',
      raised: 'rgba(1, 42, 74, 0.7)',
      overlay: 'rgba(1, 35, 65, 0.6)'
    },
    accent: '#00FF87',
    text: {
      primary: '#E6E6E6',
      secondary: 'rgba(230, 230, 230, 0.7)',
      muted: 'rgba(230, 230, 230, 0.5)'
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444'
    }
  };

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
    },
    'SNC': {
      meta_payout: { peut_salaire: false, peut_dividendes: true, dividendes_cot_sociales: 'n/a', base_cotisations: 'bénéfice' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: false },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'faible' }
    }
  };

  // ===================== UTILS =====================
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  
  // Sécurité XSS
  const escapeHTML = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  
  const toText = v => (v==null || v==='') ? '—' : String(v);
  const toHTML = v => escapeHTML(toText(v));
  const fmtEuro = n => Number.isFinite(+n) ? (+n).toLocaleString('fr-FR')+' €' : toText(n);
  const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  
  // Markdown basique **bold** mais en version safe
  const md2html = (text) => {
    if (!text) return '';
    const safe = escapeHTML(String(text));
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  };

  // Toast notification
  function showToast(message, duration = 2000) {
    const existing = $('#toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notification';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHTML(message)}`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ===================== HELPERS =====================
  
  function computeCaveats(st){
    const sn = (st.shortName||'').toUpperCase();
    if(/SASU|SAS/.test(sn) && st.meta_dirigeant?.statut_dirigeant==='assimilé salarié'){
      return "Coût social plus élevé dès qu'il y a salaire.";
    }
    if(/EURL|SARL/.test(sn) && st.meta_payout?.dividendes_cot_sociales==='>10%'){
      return "Dividendes >10% soumis à cotisations TNS.";
    }
    return '';
  }

  function renderIntentImpactBar(intents){
    const chips = [];
    if(intents.en_chomage){
      chips.push(`<span class="comparison-item"><i class="fas fa-shield-alt"></i> ARE : salaire réduit l'ARE ; dividendes SAS(U) ignorés</span>`);
    }
    if(intents.veut_dividendes){
      chips.push(`<span class="comparison-item"><i class="fas fa-coins"></i> Dividendes : SAS/SASU non cotisés ; EURL/SARL >10% cotisés</span>`);
    }
    if(intents.prevoit_associes==='oui'){
      chips.push(`<span class="comparison-item"><i class="fas fa-users"></i> Associés : SAS/SASU plus souples</span>`);
    }
    if(intents.levee_fonds==='oui'){
      chips.push(`<span class="comparison-item"><i class="fas fa-rocket"></i> Levée : privilégier SAS (BSPCE, actions de préférence)</span>`);
    }
    if(!chips.length) return '';
    return `
      <div class="advice-card" role="status" aria-live="polite" id="impact-bar">
        <div class="title"><i class="fas fa-info-circle"></i> Impact de vos objectifs</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${chips.join('')}</div>
      </div>`;
  }

  function renderAlternativeSuggestion(currentStatut, alternative){
    if(!alternative) return '';
    return `
      <div class="advice-card" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.05)">
        <div class="title"><i class="fas fa-lightbulb"></i> Suggestion de comparaison</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span>Comparer <strong>${escapeHTML(currentStatut)}</strong> avec <strong>${escapeHTML(alternative.shortName)}</strong> ?</span>
          <button class="preset-btn" id="suggest-compare-btn" data-compare="${escapeHTML(currentStatut)},${escapeHTML(alternative.shortName)}">
            <i class="fas fa-balance-scale"></i> Comparer
          </button>
        </div>
      </div>`;
  }

  // ===================== RENDERERS =====================
  
  function renderDividendRule(statut) {
    const sn = (statut.shortName || '').toUpperCase();
    const fisc = (statut.fiscalite || '').toUpperCase();
    
    if (/SASU|SAS|SA|SELAS|SCA/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.success};font-weight:500">PFU, non cotisés</span>`;
    }
    if (/EURL|SARL|SELARL/.test(sn) && /IS/.test(fisc)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">PFU, >10% cotisés TNS</span>`;
    }
    if (/MICRO|EI/.test(sn)) {
      return '<span style="color:'+TOKENS.text.muted+'">— (pas de dividendes)</span>';
    }
    return '—';
  }

  function renderARE(statut) {
    const areM = statut.meta_are || {};
    if (areM.are_compatible_sans_salaire) {
      return `<span style="color:${TOKENS.semantic.success};font-weight:500">OK sans salaire</span>`;
    }
    return `<span style="color:${TOKENS.text.secondary}">Réduit si salaire</span>`;
  }

  function renderWithTooltip(text, maxLen=100) {
    if (!text) return '—';
    const raw = String(text);
    if (raw.length <= maxLen) return toHTML(raw);
    const truncated = escapeHTML(raw.slice(0, maxLen).trim());
    const full = escapeHTML(raw);
    return `<span class="truncate" title="${full}">${truncated}… <i class="fas fa-info-circle" style="color:${TOKENS.accent};font-size:.75rem;cursor:help"></i></span>`;
  }

  function renderResponsabilite(statut) {
    const resp = statut.responsabilite || '';
    const isLimited = /limitée/i.test(resp);
    const isUnlimited = /illimitée/i.test(resp);
    
    if (isUnlimited) {
      return `<span style="color:${TOKENS.semantic.danger};font-weight:600">${escapeHTML(resp)} <i class="fas fa-exclamation-triangle"></i></span>`;
    }
    if (isLimited) {
      return `${escapeHTML(resp)} <i class="fas fa-shield-alt" style="color:${TOKENS.accent}"></i>`;
    }
    return toHTML(resp);
  }

  function renderCapital(statut) {
    const cap = statut.capital || '';
    const capNum = parseInt((cap.match(/\d+/g) || ['0']).join(''));
    
    if (capNum >= 37000) {
      return `<span style="color:${TOKENS.accent};font-weight:600">${escapeHTML(cap)}</span>`;
    }
    return toHTML(cap);
  }

  function renderStatutName(statut) {
    const sn = (statut.shortName || '').toUpperCase();
    const isCivil = /SCI|SCM|SCP/.test(sn);
    
    let badges = '';
    if (isCivil) {
      badges += `<span class="status-badge" style="background:rgba(139,92,246,.2);color:#A78BFA;margin-left:4px">CIVIL</span>`;
    }
    
    return escapeHTML(statut.shortName) + badges;
  }

  // ============ DECISION CONTENT ============
  const DECISIONS = {
    'EURL|SASU': {
      a:'EURL', b:'SASU',
      chooseB: [
        "Tu touches l'ARE et ne veux pas de salaire au début → les dividendes **ne réduisent pas l'ARE**",
        "Tu vises **investisseurs/BSPCE** ou une **entrée d'associés** rapide",
        "Tu préfères la **protection sociale du régime général**"
      ],
      chooseA: [
        "Tu te verses un **petit salaire régulier** et veux des **cotisations plus basses** (gérant **TNS**)",
        "Pas d'investisseurs prévus et tu veux **maîtriser le coût social** au lancement"
      ],
      caveats: [
        "EURL à l'IS : **dividendes > 10 %** (capital+primes+CC) = **cotisations TNS**",
        "SASU : **coût social élevé** dès qu'il y a **salaire**, **pas d'assurance chômage**"
      ],
      oneLine: "ARE sans salaire / investisseurs → **SASU** ; salaire régulier mini → **EURL**."
    },
    'SAS|SARL': {
      a:'SAS', b:'SARL',
      chooseA: [
        "Tu veux des **statuts très souples** (pactes, clauses sur-mesure)",
        "Tu prévois **investisseurs** (BSPCE, actions de préférence)",
        "Entrées/sorties d'associés doivent être **fluides**"
      ],
      chooseB: [
        "**Société familiale/PME** avec cadre légal **encadré et stable**",
        "**Gérant majoritaire** qui vise un **coût social plus bas** (**TNS**)",
        "Vous voulez des **cessions contrôlées** (**agrément**)"
      ],
      caveats: [
        "SARL à l'IS + gérant majoritaire : **dividendes > 10 % = cotisations TNS**",
        "SAS : **charges plus élevées** en cas de **salaire** du président"
      ],
      oneLine: "Investisseurs & souplesse → **SAS** ; PME familiale & TNS moins cher → **SARL**."
    },
    'MICRO|EI': {
      a:'MICRO', b:'EI',
      chooseA: [
        "Tu veux la **simplicité maximale** (déclaratif, pas de compta complète)",
        "Ton **CA** reste **sous les plafonds** (188 700 € ventes / 77 700 € services/BNC)",
        "Tu as **peu de frais** ⇒ l'**abattement** suffit"
      ],
      chooseB: [
        "Tu as **beaucoup de frais** à **déduire** (véhicule, matériel, sous-traitance…)",
        "Tu veux **récupérer la TVA** et **aucun plafond de CA**",
        "Tu cherches **crédibilité** et **montée en puissance**"
      ],
      caveats: [
        "Micro : **pas de déduction au réel**, crédibilité parfois limitée",
        "EI (réel/IS) : **compta complète** + **formalités** supplémentaires"
      ],
      oneLine: "Simplicité & peu de frais → **Micro** ; frais réels/TVA/aucun plafond → **EI**."
    },
    'SASU|SARL': {
      a:'SASU', b:'SARL',
      chooseA: [
        "Tu démarres **solo** avec image **corporate** et **associés plus tard** (passage en SAS)",
        "Tu privilégies **dividendes** (non cotisés) et/ou **investisseurs** à moyen terme",
        "Tu veux la **protection sociale** du **régime général**"
      ],
      chooseB: [
        "Vous êtes **plusieurs** et voulez un cadre **connu et protecteur** (assemblées, gérance)",
        "Le **gérant majoritaire** vise un **coût social plus bas** (**TNS**)",
        "Vous voulez des **transferts de parts contrôlés** (**agrément**)"
      ],
      caveats: [
        "SARL à l'IS + gérant maj. : **dividendes > 10 % = cotisations TNS**",
        "SASU : dès qu'il y a **salaire**, le **coût social grimpe**"
      ],
      oneLine: "Solo & futurs associés → **SASU** ; gérant maj. TNS moins cher → **SARL**."
    }
  };

  function renderDecision(pairKey){
    const d = DECISIONS[pairKey]; if(!d) return '';
    const [left, right] = pairKey.split('|');
    return `
      <div class="advice-card decision-card">
        <div class="title"><i class="fas fa-balance-scale"></i> ${escapeHTML(left)} vs ${escapeHTML(right)} — aide à la décision</div>
        <div class="decision-grid">
          <div>
            <div class="decision-sub">Choisis ${escapeHTML(left)} si :</div>
            <ul class="decision-list">
              ${d.chooseA.map(x=>`<li><span class="pro">•</span> ${md2html(x)}</li>`).join('')}
            </ul>
          </div>
          <div>
            <div class="decision-sub">Choisis ${escapeHTML(right)} si :</div>
            <ul class="decision-list">
              ${d.chooseB.map(x=>`<li><span class="pro">•</span> ${md2html(x)}</li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="decision-caveats">
          <span class="decision-kicker">Points d'attention :</span>
          <ul class="decision-list caveats">
            ${d.caveats.map(x=>`<li><span class="con">•</span> ${md2html(x)}</li>`).join('')}
          </ul>
        </div>
        <div class="decision-one-liner">${md2html(d.oneLine)}</div>
      </div>`;
  }

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
        obligationsCle: 'Déclaration CA · Livre recettes · Franchise TVA · CFE (ex. 1ʳᵉ an) · Compte pro si CA>10k€',
        plafondCA: microPlaf,
        regimeTVA: tvaFr
      };
    }
    if (SN==='EURL') return { obligationsCle: 'Compta engagement · AG<6 mois · TVA réel/franchise · Cotis TNS+div>10%' };
    if (SN==='SASU') return { obligationsCle: 'Compta engagement · Paie/DSN si rémunération · TVA réel/franchise · Div non cotisés' };
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
    enriched._caveat = computeCaveats(enriched);
    return enriched;
  }

  // ===================== CSS =====================
  function injectCSS(){
    if(document.getElementById('comparatif-status-styles')) return;
    const style=document.createElement('style'); style.id='comparatif-status-styles';
    style.textContent=`
      .comparatif-container{max-width:100%;overflow-x:auto;font-family:'Inter',sans-serif;color:${TOKENS.text.primary};font-size:16px}
      .comparatif-header{margin-bottom:${TOKENS.spacing.xl}px}
      
      /* Hero refonte UX */
      .hero{text-align:center;max-width:720px;margin:0 auto ${TOKENS.spacing.xxl}px;padding:${TOKENS.spacing.xl}px 0}
      .comparatif-title{font-size:2rem;font-weight:700;margin-bottom:${TOKENS.spacing.md}px;color:${TOKENS.accent};line-height:1.2}
      .comparatif-subtitle{color:${TOKENS.text.secondary};margin-bottom:${TOKENS.spacing.xl}px;font-size:1.125rem;line-height:1.5;max-width:600px;margin-left:auto;margin-right:auto}
      .hero-ctas{display:flex;gap:${TOKENS.spacing.md}px;justify-content:center;flex-wrap:wrap}
      .btn{padding:${TOKENS.spacing.md}px ${TOKENS.spacing.xl}px;border-radius:999px;font-size:.9375rem;font-weight:600;cursor:pointer;transition:all .15s ease;border:none}
      .btn-primary{background:${TOKENS.accent};color:#001a2e;box-shadow:0 2px 8px rgba(0,255,135,.3)}
      .btn-primary:hover{background:#00e67a;transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,255,135,.4)}
      .btn-primary:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px}
      .btn-ghost{background:transparent;color:${TOKENS.text.secondary};border:1px solid rgba(255,255,255,.2)}
      .btn-ghost:hover{border-color:${TOKENS.accent};color:${TOKENS.accent}}
      
      /* Toast notification */
      .toast-notification{position:fixed;bottom:24px;right:24px;background:rgba(1,22,39,.95);border:1px solid ${TOKENS.accent};border-radius:${TOKENS.radius.lg}px;padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;display:flex;align-items:center;gap:${TOKENS.spacing.sm}px;color:${TOKENS.text.primary};font-size:.875rem;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:10000;opacity:0;transform:translateY(20px);transition:all .3s ease}
      .toast-notification.show{opacity:1;transform:translateY(0)}
      .toast-notification i{color:${TOKENS.accent};font-size:1rem}

      .section-label{font-size:0.8125rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${TOKENS.text.secondary};margin-bottom:${TOKENS.spacing.md}px}

      .intent-toggles{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.md}px;margin-bottom:${TOKENS.spacing.lg}px;padding:${TOKENS.spacing.lg}px;background:${TOKENS.surface.base};border-radius:${TOKENS.radius.lg}px;border:1px solid rgba(0,255,135,.15)}
      .intent-toggle{position:relative;display:flex;align-items:center;gap:${TOKENS.spacing.sm}px;padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;background:${TOKENS.surface.raised};border:1px solid rgba(0,255,135,.2);border-radius:999px;font-size:.875rem;color:${TOKENS.text.secondary};cursor:pointer;transition:all .15s ease;user-select:none}
      .intent-toggle:hover{background:rgba(1,42,74,.85);transform:scale(1.02)}
      .intent-toggle:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px;box-shadow:0 0 0 6px rgba(0,255,135,.2)}
      .intent-toggle.active{background:rgba(0,255,135,.15);border-color:${TOKENS.accent};color:${TOKENS.accent}}
      .intent-toggle .icon{font-size:1rem}
      .intent-toggle[aria-pressed="true"] .icon{color:${TOKENS.accent}}

      .tooltip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(1,22,39,.95);border:1px solid rgba(0,255,135,.3);border-radius:${TOKENS.radius.sm}px;padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;font-size:.75rem;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;z-index:100}
      .intent-toggle:hover .tooltip{opacity:1}

      .personas{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;margin-bottom:${TOKENS.spacing.lg}px}
      .persona-chip{position:relative;padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;border:1px solid rgba(255,255,255,.2);border-radius:${TOKENS.radius.md}px;font-size:.8125rem;color:${TOKENS.text.primary};cursor:pointer;background:${TOKENS.surface.overlay};transition:all .15s ease}
      .persona-chip:hover{border-color:${TOKENS.accent};background:rgba(1,42,74,.8)}
      .persona-chip:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px}
      .persona-chip .baseline{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(1,22,39,.95);border:1px solid rgba(0,255,135,.3);padding:4px 8px;border-radius:4px;font-size:.7rem;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}
      .persona-chip:hover .baseline{opacity:1}

      .quick-presets{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;margin-bottom:${TOKENS.spacing.lg}px}
      .preset-btn{padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;border:1px solid rgba(0,255,135,.35);background:rgba(0,255,135,.08);border-radius:999px;font-size:.8125rem;color:${TOKENS.accent};cursor:pointer;transition:all .15s ease}
      .preset-btn:hover{background:rgba(0,255,135,.18);transform:scale(1.02)}
      .preset-btn:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px;box-shadow:0 0 0 6px rgba(0,255,135,.2)}

      .comparison-bar{display:flex;align-items:center;padding:${TOKENS.spacing.lg}px;background:${TOKENS.surface.base};border-radius:${TOKENS.radius.lg}px;margin-bottom:${TOKENS.spacing.lg}px;flex-wrap:wrap;gap:${TOKENS.spacing.md}px;border:1px solid rgba(0,255,135,.15)}
      .comparison-title{font-size:.875rem;font-weight:600;color:${TOKENS.text.secondary};margin-right:auto}
      .comparison-items{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;flex-grow:1}
      .comparison-item{display:flex;align-items:center;gap:${TOKENS.spacing.sm}px;padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;background:rgba(0,255,135,.12);border:1px solid rgba(0,255,135,.35);border-radius:${TOKENS.radius.sm}px;font-size:.8125rem;color:${TOKENS.accent}}
      .comparison-item .remove-btn{background:none;border:none;color:${TOKENS.text.muted};font-size:.75rem;cursor:pointer;padding:2px;transition:color .15s}
      .comparison-item .remove-btn:hover{color:#FF6B6B}
      .status-dropdown{width:200px;padding:${TOKENS.spacing.md}px;background:${TOKENS.surface.raised};border:1px solid rgba(0,255,135,.25);border-radius:${TOKENS.radius.sm}px;color:${TOKENS.text.primary};font-size:.875rem}
      .status-dropdown:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px;box-shadow:0 0 0 6px rgba(0,255,135,.2)}

      .diff-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(0,255,135,.15);border:1px solid rgba(0,255,135,.4);border-radius:999px;font-size:.75rem;font-weight:600;color:${TOKENS.accent}}
      .diff-badge .icon{font-size:.875rem}

      .advice-card{border:1px solid rgba(0,255,135,.3);border-radius:${TOKENS.radius.lg}px;padding:${TOKENS.spacing.lg}px;background:${TOKENS.surface.overlay};margin-bottom:${TOKENS.spacing.lg}px;animation:fadeIn .15s ease}
      .advice-card .title{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.md}px;font-size:.9375rem}
      .advice-card ul{margin:0;padding-left:20px;line-height:1.6}
      .advice-card li{margin-bottom:${TOKENS.spacing.sm}px}
      .advice-card .pro{color:#10B981;font-weight:500}
      .advice-card .con{color:#EF4444;font-weight:500}
      .advice-card .arbitrage{margin-top:${TOKENS.spacing.md}px;padding-top:${TOKENS.spacing.md}px;border-top:1px solid rgba(255,255,255,.1);font-style:italic;color:${TOKENS.text.secondary}}

      .decision-card{border-color:rgba(0,255,135,.35)}
      .decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:${TOKENS.spacing.lg}px}
      .decision-sub{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.sm}px}
      .decision-list{margin:0;padding-left:18px;line-height:1.6}
      .decision-list li{margin-bottom:${TOKENS.spacing.sm}px}
      .decision-caveats{margin-top:${TOKENS.spacing.md}px;padding-top:${TOKENS.spacing.md}px;border-top:1px solid rgba(255,255,255,.08)}
      .decision-kicker{font-weight:600;color:${TOKENS.text.secondary};margin-right:6px}
      .decision-one-liner{margin-top:${TOKENS.spacing.md}px;padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;border:1px dashed rgba(0,255,135,.35);border-radius:${TOKENS.radius.sm}px;color:${TOKENS.text.primary};font-size:.875rem}

      .comparatif-filters{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.lg}px;margin-bottom:${TOKENS.spacing.xl}px;align-items:flex-end}
      .filter-group{flex:1;min-width:200px}
      .filter-label{display:block;margin-bottom:${TOKENS.spacing.md}px;color:${TOKENS.text.secondary};font-size:.875rem;font-weight:500}
      .criteria-buttons{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:${TOKENS.spacing.sm}px}
      .criteria-button{padding:${TOKENS.spacing.md}px;border-radius:${TOKENS.radius.sm}px;font-size:.875rem;cursor:pointer;background:${TOKENS.surface.raised};border:1px solid rgba(0,255,135,.2);color:${TOKENS.text.secondary};transition:all .15s ease;text-align:center}
      .criteria-button:hover{border-color:rgba(0,255,135,.4);background:rgba(1,42,74,.85)}
      .criteria-button:focus-visible{outline:3px solid ${TOKENS.accent};outline-offset:3px;box-shadow:0 0 0 6px rgba(0,255,135,.2)}
      .criteria-button.active{background:rgba(0,255,135,.15);border-color:${TOKENS.accent};color:${TOKENS.accent};font-weight:600}

      .search-input{width:100%;padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;border-radius:${TOKENS.radius.sm}px;border:1px solid rgba(1,42,74,.8);background:${TOKENS.surface.raised};color:${TOKENS.text.primary};transition:all .15s ease;font-size:.875rem}
      .search-input:focus{outline:none;border-color:${TOKENS.accent};box-shadow:0 0 0 2px rgba(0,255,135,.15)}
      .search-input::placeholder{color:${TOKENS.text.muted}}

      .table-header-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:${TOKENS.spacing.md}px;padding:${TOKENS.spacing.sm}px 0}
      .column-count{font-size:.8125rem;color:${TOKENS.text.secondary}}
      .column-count strong{color:${TOKENS.accent};font-weight:600}

      .comparatif-table-container{border-radius:${TOKENS.radius.xl}px;border:1px solid rgba(1,42,74,.8);overflow:hidden;background:rgba(1,42,74,.25);box-shadow:0 4px 16px rgba(0,0,0,.15)}
      .comparatif-table{width:100%;border-collapse:collapse;text-align:left}
      .comparatif-table th{padding:${TOKENS.spacing.lg}px;background:rgba(1,22,39,.9);font-weight:600;color:${TOKENS.accent};font-size:.8125rem;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(1,42,74,.8);position:sticky;top:0;z-index:20}
      .comparatif-table th:first-child{position:sticky;left:0;z-index:30;background:rgba(1,22,39,.95)}
      .comparatif-table td{padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;border-bottom:1px solid rgba(1,42,74,.4);font-size:.875rem;vertical-align:top}
      .comparatif-table td:first-child{position:sticky;left:0;background:rgba(1,42,74,.3);z-index:10}
      .comparatif-table tr:last-child td{border-bottom:none}
      .comparatif-table tr:nth-child(odd) td{background:rgba(1,42,74,.15)}
      .comparatif-table tr:nth-child(odd) td:first-child{background:rgba(1,42,74,.25)}
      .comparatif-table tr:hover td{background:rgba(0,255,135,.04)}
      .comparatif-table tr:hover td:first-child{background:rgba(0,255,135,.06)}
      .comparatif-table .diff-col{background:rgba(0,255,135,.04)}

      .statut-cell{display:flex;align-items:flex-start;gap:${TOKENS.spacing.md}px}
      .statut-icon{width:2.5rem;height:2.5rem;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${TOKENS.surface.raised};color:${TOKENS.accent};font-size:1rem;flex-shrink:0}
      .statut-info{display:flex;flex-direction:column;min-width:0}
      .statut-name{font-weight:600;color:${TOKENS.text.primary};font-size:.9375rem}
      .statut-fullname{font-size:.75rem;color:${TOKENS.text.muted};margin-top:2px}
      .status-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:${TOKENS.spacing.sm}px}
      .status-badge{display:inline-flex;align-items:center;padding:2px 6px;border-radius:3px;font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
      .badge-dividends{background:rgba(236,72,153,.2);color:#EC4899}
      .badge-are{background:rgba(16,185,129,.2);color:#10B981}
      .badge-investors{background:rgba(245,158,11,.2);color:#F59E0B}
      .badge-tns{background:rgba(139,92,246,.2);color:#A78BFA}
      .badge-assimile{background:rgba(34,211,238,.2);color:#22D3EE}

      .truncate{cursor:help}

      .loading-state{display:flex;justify-content:center;align-items:center;height:200px;flex-direction:column;gap:${TOKENS.spacing.lg}px}
      .spinner{width:40px;height:40px;border:3px solid rgba(0,255,135,.2);border-radius:50%;border-top-color:${TOKENS.accent};animation:spin 1s ease-in-out infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

      .comparatif-notes{margin-top:${TOKENS.spacing.xl}px;padding:${TOKENS.spacing.lg}px;border-radius:${TOKENS.radius.lg}px;background:rgba(1,42,74,.25);font-size:.875rem}
      .notes-title{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.md}px}
      .notes-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:${TOKENS.spacing.md}px;margin-bottom:${TOKENS.spacing.md}px}
      .notes-item{display:flex;align-items:center;gap:${TOKENS.spacing.sm}px}
      .notes-term{color:${TOKENS.accent};font-weight:600}
      .notes-disclaimer{font-style:italic;color:${TOKENS.text.muted};font-size:.8125rem;text-align:center;margin-top:${TOKENS.spacing.md}px}

      @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      .comparatif-table tbody tr{animation:fadeInUp .25s ease forwards;opacity:0}

      @media (max-width: 768px){
        .hero{padding:${TOKENS.spacing.lg}px 0}
        .comparatif-title{font-size:1.5rem}
        .comparatif-subtitle{font-size:1rem}
        .hero-ctas{flex-direction:column}
        .btn{width:100%}
        .intent-toggles,.personas,.quick-presets{flex-direction:column}
        .comparatif-filters{flex-direction:column}
        .criteria-buttons{grid-template-columns:repeat(2,1fr)}
        .statut-icon{width:2rem;height:2rem;font-size:.875rem}
        .comparatif-table th,.comparatif-table td{padding:${TOKENS.spacing.md}px ${TOKENS.spacing.sm}px;font-size:.8125rem}
        .comparatif-table th:first-child,.comparatif-table td:first-child{position:static}
        .notes-list{grid-template-columns:1fr}
        .decision-grid{grid-template-columns:1fr}
        .decision-one-liner{font-size:.85rem}
        .cards-mobile{display:grid;grid-template-columns:1fr;gap:${TOKENS.spacing.md}px;margin-bottom:${TOKENS.spacing.lg}px}
        .card{border:1px solid rgba(0,255,135,.25);background:${TOKENS.surface.overlay};border-radius:${TOKENS.radius.lg}px;padding:${TOKENS.spacing.lg}px;cursor:pointer;transition:all .15s ease}
        .card:hover{border-color:${TOKENS.accent};background:rgba(0,255,135,.05)}
        .card h4{margin:0 0 6px 0;color:${TOKENS.accent};font-size:1rem}
        .card ul{margin:8px 0 0 16px;line-height:1.5;font-size:.875rem}
        .comparatif-table-container{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  // Suite dans le prochain message (fichier trop long)
  // ===================== TABLEAU =====================
  window.createComparatifTable = function(containerId){
    const container = document.getElementById(containerId);
    if(!container){ console.error(`❌ Conteneur #${containerId} non trouvé`); return; }

    injectCSS();

    container.innerHTML = `
      <div class="comparatif-container">
        <div class="comparatif-header">
          <div class="hero">
            <h1 class="comparatif-title">Choisis le bon statut en 2 minutes</h1>
            <p class="comparatif-subtitle">
              Compare 2 statuts. On montre uniquement les différences et on te conseille selon tes objectifs (dividendes, ARE, associés, levée de fonds).
            </p>
            <div class="hero-ctas">
              <button class="btn btn-primary" data-preset="EURL,SASU" aria-label="Comparer EURL et SASU">Comparer EURL ↔ SASU</button>
              <button class="btn btn-ghost" id="voir-tout" aria-label="Voir tout le tableau">Voir tout le tableau</button>
            </div>
          </div>

          <div class="section-label">Vos objectifs</div>
          <div class="intent-toggles" role="group" aria-label="Vos objectifs">
            <button class="intent-toggle" data-intent="veut_dividendes" role="button" aria-pressed="false" aria-label="Dividendes">
              <i class="fas fa-coins icon"></i>
              <span>Dividendes</span>
              <div class="tooltip">Affiche les statuts où les dividendes sont possibles/optimisés</div>
            </button>
            <button class="intent-toggle" data-intent="en_chomage" role="button" aria-pressed="false" aria-label="Je perçois l'ARE">
              <i class="fas fa-shield-alt icon"></i>
              <span>Je perçois l'ARE</span>
              <div class="tooltip">Masque les choix qui réduisent fortement l'ARE si pas de salaire</div>
            </button>
            <button class="intent-toggle" data-intent="prevoit_associes" role="button" aria-pressed="false" aria-label="J'aurai des associés">
              <i class="fas fa-users icon"></i>
              <span>J'aurai des associés</span>
              <div class="tooltip">Privilégie les statuts permettant plusieurs associés</div>
            </button>
            <button class="intent-toggle" data-intent="levee_fonds" role="button" aria-pressed="false" aria-label="Lever des fonds">
              <i class="fas fa-rocket icon"></i>
              <span>Lever des fonds</span>
              <div class="tooltip">Recommande SAS/SASU pour BSPCE et actions de préférence</div>
            </button>
          </div>

          <div class="section-label">Cas typiques (1 clic)</div>
          <div class="personas" id="personas"></div>

          <div class="section-label">Comparaisons populaires</div>
          <div class="quick-presets" id="quick-presets"></div>

          <div class="comparison-bar">
            <span class="comparison-title">Candidats à comparer (max 2)</span>
            <select id="status-dropdown" class="status-dropdown" aria-label="Ajouter un statut">
              <option value="">Ajouter un statut…</option>
            </select>
            <div class="comparison-items" id="comparison-items"></div>
            <div id="diff-badge-container"></div>
            <button id="share-link" class="preset-btn" aria-label="Copier le résumé de cette comparaison">Partager</button>
          </div>

          <div id="impact-recommendations" aria-live="polite"></div>
          <div id="smart-comparison" aria-live="polite"></div>
          <div id="persona-advice" aria-live="polite"></div>
          <div id="suggestion-bar" aria-live="polite"></div>

          <div class="comparatif-filters">
            <div class="filter-group">
              <label class="filter-label">Colonnes à afficher</label>
              <div class="criteria-buttons" id="criteria-buttons"></div>
            </div>
            <div class="filter-group" style="max-width:300px;">
              <label class="filter-label">Rechercher</label>
              <input type="text" id="search-input" class="search-input" placeholder="Rechercher un statut…" aria-label="Rechercher un statut">
            </div>
          </div>

          <div class="table-header-bar">
            <div class="column-count" id="column-count"></div>
          </div>
        </div>

        <div class="comparatif-table-container">
          <table class="comparatif-table" id="comparatif-table">
            <thead><tr id="table-headers"></tr></thead>
            <tbody id="table-body">
              <tr><td colspan="10"><div class="loading-state"><div class="spinner"></div><p>Chargement des données…</p></div></td></tr>
            </tbody>
          </table>
        </div>

        <div class="comparatif-notes">
          <h3 class="notes-title">Légende</h3>
          <div class="notes-list">
            <div class="notes-item"><span class="notes-term">IR</span> Impôt sur le Revenu</div>
            <div class="notes-item"><span class="notes-term">IS</span> Impôt sur les Sociétés</div>
            <div class="notes-item"><span class="notes-term">TNS</span> Travailleur Non Salarié</div>
            <div class="notes-item"><span class="notes-term">CA</span> Chiffre d'Affaires</div>
            <div class="notes-item"><span class="notes-term">PFU</span> Prélèvement Forfaitaire Unique (30%)</div>
            <div class="notes-item"><span class="notes-term">ARE</span> Allocation Retour à l'Emploi</div>
          </div>
          <p class="notes-disclaimer">Informations 2025. Consultez un expert-comptable pour votre cas précis.</p>
        </div>
      </div>
    `;

    // Suite du code dans une réponse séparée car trop long
    // ... (reste du code JS identique)
  };
})();
