/*
 * Comparatif statuts — v2025 UX Clean Room + Accessibilité AAA
 * Phase 1: renderDividendRule, colonne ARE, tooltips auto, signaux visuels
 * Phase 2: blocs d'aide à la décision pour paires populaires
 * Phase 3: XSS protection, keyboard accessibility, URL state persistence
 * Phase 4: bannières impact, limite paramétrable, mode cartes mobile, partage intelligent
 * Mini Sprint: Hero + CTA, sticky controls, toast, empty state
 * P0 Quick Wins: Diff by default, mobile sticky CTA, card affordance
 * UX Improvements: Limite MAX_COMPARE configurable, libellés clairs, lisibilité++
 * Accessibilité P0/P1: Contraste AAA, focus visible, reduced motion, safe-area iOS
 */

window.initComparatifStatuts = function() {
  console.log("✅ Initialisation du tableau comparatif (v2025 + Accessibilité AAA)");
  window.createComparatifTable('comparatif-container');
};

(function(){
  // ===================== DESIGN TOKENS =====================
  const TOKENS = {
    spacing: { xs:4, sm:8, md:12, lg:16, xl:24, xxl:28 },
    radius: { sm:4, md:6, lg:8, xl:12 },
    surface: {
      base: 'rgba(1, 35, 65, 0.92)',
      raised: 'rgba(1, 42, 74, 0.95)',
      overlay: 'rgba(1, 35, 65, 0.92)'
    },
    accent: '#00FF87',
    text: {
      primary: '#E6E6E6',
      secondary: 'rgba(230, 230, 230, 0.82)',
      muted: 'rgba(230, 230, 230, 0.65)'
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#FF7B7B'
    }
  };

  // ===================== CONFIG COMPARAISON =====================
  // Mets 4 pour laisser plus de latitude, Infinity pour aucune limite côté UI
  const MAX_COMPARE = 4;

  // ===================== STATUT ALIASES =====================
  const STATUT_ALIASES = {
    'MICRO': ['MICRO','MICRO-ENTREPRISE','AUTO-ENTREPRISE','ME'],
    'EI': ['EI','ENTREPRISE INDIVIDUELLE'],
    'EURL': ['EURL'],
    'SASU': ['SASU'],
    'SARL': ['SARL'],
    'SAS': ['SAS']
  };
  
  const aliasIndex = Object.fromEntries(
    Object.entries(STATUT_ALIASES).flatMap(([canon, arr]) =>
      arr.map(a => [a.toUpperCase(), canon])
    )
  );
  
  function resolveStatutKey(input){
    const k = (input||'').toUpperCase();
    return aliasIndex[k] || k;
  }

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
      meta_payout: { peut_salaire: true, peut_dividendes: false, dividendes_cot_sociales: 'n/a (IR)', base_cotisations: 'bénéfice (quote-part)' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Bénéfice pris en compte' },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: false, migration_simple: 'SNC→SARL/SAS possible' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'faible' }
    },
    'SA': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: 'non', base_cotisations: 'rémunération' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'élevé', entree_associes_facile: true, migration_simple: 'Cotation possible' },
      meta_dirigeant: { statut_dirigeant: 'assimilé salarié', couverture_dirigeant: 'élevée' }
    },
    'SCI': {
      meta_payout: { peut_salaire: false, peut_dividendes: true, dividendes_cot_sociales: 'non (IS) / n/a (IR)', base_cotisations: 'résultat fiscal' },
      meta_are: { are_compatible_sans_salaire: false, are_baisse_si_salaire: false, are_commentaire_court: 'Non applicable' },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: true, migration_simple: 'Option IS irréversible' },
      meta_dirigeant: { statut_dirigeant: 'non salarié', couverture_dirigeant: 'aucune' }
    },
    'SELARL': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: '>10%', base_cotisations: 'rémunération + div>10%' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'faible', entree_associes_facile: false, migration_simple: 'SELARL→SELAS possible' },
      meta_dirigeant: { statut_dirigeant: 'TNS', couverture_dirigeant: 'moyenne' }
    },
    'SELAS': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: 'non', base_cotisations: 'rémunération' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Dividendes non ARE' },
      meta_evolution: { accueil_investisseurs: 'moyen', entree_associes_facile: true, migration_simple: 'Entrée associés encadrée' },
      meta_dirigeant: { statut_dirigeant: 'assimilé salarié', couverture_dirigeant: 'élevée' }
    },
    'SCA': {
      meta_payout: { peut_salaire: true, peut_dividendes: true, dividendes_cot_sociales: '>10% (commandité)', base_cotisations: 'rémunération + div>10%' },
      meta_are: { are_compatible_sans_salaire: true, are_baisse_si_salaire: true, are_commentaire_court: 'Selon statut associé' },
      meta_evolution: { accueil_investisseurs: 'élevé', entree_associes_facile: true, migration_simple: 'Structure complexe' },
      meta_dirigeant: { statut_dirigeant: 'TNS (commandité) / assimilé salarié (commanditaire)', couverture_dirigeant: 'variable' }
    }
  };

  // ===================== UTILS =====================
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  
  const escapeHTML = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  
  const toText = v => (v==null || v==='') ? '—' : String(v);
  const toHTML = v => escapeHTML(toText(v));
  const fmtEuro = n => Number.isFinite(+n) ? (+n).toLocaleString('fr-FR')+' €' : toText(n);
  const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  
  const md2html = (text) => {
    if (!text) return '';
    const safe = escapeHTML(String(text));
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  };

  function normalizeFiscalite(s=''){
    return String(s)
      .replace(/\s*\(\s*par défaut\s*\)/i, ' par défaut')
      .replace(/\s+/g,' ')
      .trim();
  }

  function normalizeForDiff(key, val){
    const v = String(val||'').toLowerCase().trim();
    if(!v) return v;
    if(key==='fiscalite'){
      return v
        .replace(/\s*\(\s*par défaut\s*\)/gi,' par défaut')
        .replace(/[()]/g,'')
        .replace(/\s+/g,' ');
    }
    if(key==='regimesocial'){
      return v.replace(/assimil[eé][ -]?salari[eé]/g,'assimilé salarié');
    }
    return v;
  }

  function showToast(msg='Copié ✓'){
    let t = document.getElementById('toast');
    if(!t){
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 1600);
  }

  // ===================== PHASE 4 - HELPERS IMPACTS =====================
  
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

  // ===================== PHASE 1 RENDERERS =====================
  
  function renderDividendRule(statut) {
    const sn = (statut.shortName || '').toUpperCase();
    const fisc = (statut.fiscalite || '').toUpperCase();

    if (/SASU|SAS|SA|SELAS/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.success};font-weight:500">PFU 31,4%, non cotisés</span>`;
    }
    if (/SCA/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">PFU 31,4%, >10% cotisés (commandité TNS)</span>`;
    }
    if (/EURL|SARL|SELARL/.test(sn) && /IS/.test(fisc)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">PFU 31,4%, >10% cotisés TNS</span>`;
    }
    if (/SNC/.test(sn)) {
      return `<span style="color:${TOKENS.text.muted}">— (IR, pas de dividendes)</span>`;
    }
    if (/SCI/.test(sn)) {
      return /IS/.test(fisc)
        ? `<span style="color:${TOKENS.semantic.success};font-weight:500">PFU 31,4%, non cotisés</span>`
        : `<span style="color:${TOKENS.text.muted}">— (IR, revenus fonciers)</span>`;
    }
    if (/MICRO|EI/.test(sn)) {
      return `<span style="color:${TOKENS.text.muted}">— (pas de dividendes)</span>`;
    }
    return '—';
  }

  function renderChargesSynthese(statut) {
    const sn = (statut.shortName || '').toUpperCase();
    const tagCouverture = (level) => {
      const colors = {
        basique: `background:rgba(245,158,11,.15);color:${TOKENS.semantic.warning}`,
        bonne: `background:rgba(16,185,129,.15);color:${TOKENS.semantic.success}`,
        minimale: `background:rgba(255,123,123,.12);color:${TOKENS.semantic.danger}`
      };
      return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:.7rem;font-weight:600;margin-top:3px;${colors[level]||colors.basique}">${level === 'bonne' ? 'Couverture élevée' : level === 'basique' ? 'Couverture basique' : 'Couverture minimale'}</span>`;
    };

    if (/MICRO/.test(sn)) {
      return `<span><strong>12,3% à 25,6%</strong> du CA<br>
        <small style="color:${TOKENS.text.muted}">Vente 12,3% · Services 21,2% · BNC 25,6%</small><br>
        ${tagCouverture('basique')}
        <small style="color:${TOKENS.text.muted}"> — IJ faibles, retraite SSI basique</small></span>`;
    }
    if (/\bEI\b/.test(sn) || /SNC/.test(sn)) {
      return `<span><strong>~30%</strong> du bénéfice (TNS)<br>
        <small style="color:${TOKENS.text.muted}">Cotisations SSI sur bénéfice réel</small><br>
        ${tagCouverture('basique')}
        <small style="color:${TOKENS.text.muted}"> — IJ faibles, retraite SSI basique</small></span>`;
    }
    if (/EURL|SARL|SELARL|SCA/.test(sn)) {
      const isTNS = /TNS|gérant majoritaire/i.test(statut.regimeSocial || '');
      if (isTNS) {
        return `<span style="color:${TOKENS.semantic.success}"><strong>~30%</strong> de la rémunération (TNS)<br>
          <small style="color:${TOKENS.text.muted}">+ cotisations sur dividendes >10% (capital+primes+CC)</small><br>
          ${tagCouverture('basique')}
          <small style="color:${TOKENS.text.muted}"> — IJ ~60€/j max, retraite SSI, carence 3j</small></span>`;
      }
      return `<span style="color:${TOKENS.semantic.warning}"><strong>~55-77%</strong> de la rémunération<br>
        <small style="color:${TOKENS.text.muted}">Patronales ~55% + salariales ~22% — dividendes non cotisés</small><br>
        ${tagCouverture('bonne')}
        <small style="color:${TOKENS.text.muted}"> — IJ salarié, AGIRC-ARRCO, pas de carence</small></span>`;
    }
    if (/SASU|SAS|SA|SELAS/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.warning}"><strong>~55-77%</strong> de la rémunération<br>
        <small style="color:${TOKENS.text.muted}">Patronales ~55% + salariales ~22% — dividendes non cotisés</small><br>
        ${tagCouverture('bonne')}
        <small style="color:${TOKENS.text.muted}"> — IJ comme salarié, AGIRC-ARRCO, 0j carence</small></span>`;
    }
    if (/SCI/.test(sn)) {
      return `<span style="color:${TOKENS.text.muted}">PS 17,2% à 18,6%<br>
        <small>Sur revenus fonciers ou dividendes (IS)</small><br>
        ${tagCouverture('minimale')}
        <small style="color:${TOKENS.text.muted}"> — Pas de couverture dirigeant</small></span>`;
    }
    return renderWithTooltip(statut.chargesSociales, 60);
  }

  function renderStatutDirigeant(statut) {
    const dir = statut.statutDirigeant || statut.meta_dirigeant?.statut_dirigeant || '—';
    if (/tns/i.test(dir)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">TNS</span>`;
    }
    if (/assimil/i.test(dir)) {
      return `<span style="color:${TOKENS.semantic.success};font-weight:500">Assimilé salarié</span>`;
    }
    return toHTML(dir);
  }

  function renderARE(statut) {
    const areM = statut.meta_are || {};
    const sn = (statut.shortName || '').toUpperCase();
    // SASU/SAS : dividendes ignorés par France Travail = meilleur cas ARE
    if (/SASU|SAS|SA|SELAS/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.success};font-weight:600">Compatible — dividendes ignorés</span>`;
    }
    // EURL/SARL IS : dividendes non pris en compte mais salaire réduit l'ARE
    if (/EURL|SARL|SELARL/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.success}">Compatible — salaire réduit l'ARE</span>`;
    }
    // Micro/EI : bénéfice/CA pris en compte = réduit l'ARE
    if (/MICRO/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">CA pris en compte → réduit l'ARE</span>`;
    }
    if (/\bEI\b/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.warning};font-weight:500">Bénéfice pris en compte → réduit l'ARE</span>`;
    }
    // SNC : quote-part du bénéfice
    if (/SNC/.test(sn)) {
      return `<span style="color:${TOKENS.semantic.warning}">Quote-part bénéfice prise en compte</span>`;
    }
    // SCI / SCA : non pertinent en général
    if (/SCI|SCA/.test(sn)) {
      return `<span style="color:${TOKENS.text.muted}">Non applicable</span>`;
    }
    if (areM.are_compatible_sans_salaire) {
      return `<span style="color:${TOKENS.semantic.success}">Compatible</span>`;
    }
    return `<span style="color:${TOKENS.text.muted}">—</span>`;
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
        "Ton **CA** reste **sous les plafonds** (203 100 € ventes / 83 600 € services/BNC)",
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
    'MICRO|SASU': {
      a:'MICRO', b:'SASU',
      chooseA: [
        "Tu veux **zéro formalité** et commencer immédiatement",
        "Ton **CA reste sous les plafonds** (203 100 € ventes / 83 600 € services)",
        "Tu as **peu de frais** ⇒ l'abattement forfaitaire est plus avantageux que le réel"
      ],
      chooseB: [
        "Tu veux **verser des dividendes** (non cotisés) ou **préserver ton ARE**",
        "Tu prévois des **investisseurs** ou l'**entrée d'associés**",
        "Tu veux **déduire des frais réels** (véhicule, bureau, matériel…)"
      ],
      caveats: [
        "Micro : **pas de TVA récupérable**, **pas de déduction** au réel, CA plafonné",
        "SASU : **charges sociales élevées** (~55-77%) dès qu'il y a salaire, **compta complète**"
      ],
      oneLine: "Simplicité absolue & petit CA → **Micro** ; dividendes/ARE/croissance → **SASU**."
    },
    'EURL|SARL': {
      a:'EURL', b:'SARL',
      chooseA: [
        "Tu es **seul** et veux garder le **contrôle total** sans assemblée formelle",
        "Tu veux pouvoir **basculer facilement en SARL** si un associé arrive",
        "Tu cherches un **cadre simplifié** (décisions de l'associé unique)"
      ],
      chooseB: [
        "Vous êtes **au moins 2** associés dès le départ",
        "Vous voulez un **cadre légal protecteur** avec **assemblées** et **gérance encadrée**",
        "Vous prévoyez une **société familiale** (option IR illimitée pour SARL de famille)"
      ],
      caveats: [
        "EURL : passage en SARL = simple **cession de parts**, pas de transformation",
        "SARL : **2 à 100 associés**, agrément obligatoire pour cessions à des tiers"
      ],
      oneLine: "Solo avec option multi-associés → **EURL** ; plusieurs associés dès le départ → **SARL**."
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
    const T = (window.recoEngine && window.recoEngine.thresholds) || window.thresholds || {};
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
    const tvaFr = `Franchise TVA : ventes ${fmtEuro(T.tva_franchise_base.ventes)} • services ${fmtEuro(T.tva_franchise_base.services)}`;
    const microPlaf = `Ventes ${fmtEuro(T.micro.bic_sales)} • Services ${fmtEuro(T.micro.bic_service)} • BNC ${fmtEuro(T.micro.bnc)}`;

    const SN = (shortName||'').toUpperCase();
    if (SN.includes('MICRO')) {
      return {
        obligationsCle: 'Déclaration CA · Livre recettes · Franchise TVA · CFE (ex. 1ʳᵉ an) · Compte pro si CA>10k€',
        plafondCA: microPlaf,
        regimeTVA: tvaFr
      };
    }
    if (SN==='EURL') return { obligationsCle: 'Compta engagement · AG annuelle · TVA réel/franchise · Cotis TNS + div >10% cotisés' };
    if (SN==='SASU') return { obligationsCle: 'Compta engagement · Paie/DSN si rémunération · TVA réel/franchise · Dividendes non cotisés' };
    if (SN==='SARL') return { obligationsCle: 'Compta engagement · AG annuelle · TVA réel/franchise · Cotis TNS si gérant maj. + div >10%' };
    if (SN==='SAS') return { obligationsCle: 'Compta engagement · Décisions collectives · TVA réel/franchise · Dividendes non cotisés' };
    if (SN==='SA') return { obligationsCle: 'Compta engagement · CA + AG · CAC obligatoire · Capital min 37 000 €' };
    if (SN==='SNC') return { obligationsCle: 'Compta engagement · IR sur quote-part · Responsabilité illimitée et solidaire' };
    if (SN==='SCI') return { obligationsCle: 'Compta simplifiée (IR) ou engagement (IS) · AG annuelle · Revenus fonciers ou IS' };
    if (SN==='SELARL') return { obligationsCle: 'Compta engagement · Ordre professionnel · Cotis TNS + div >10% cotisés' };
    if (SN==='SELAS') return { obligationsCle: 'Compta engagement · Ordre professionnel · Assimilé salarié · Dividendes non cotisés' };
    if (SN==='SCA') return { obligationsCle: 'Compta engagement · Capital min 37 000 € · Commandités TNS · Structure complexe' };
    return { obligationsCle: '—' };
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
    return keys.filter(k=>{
      const vals = rows.map(r => normalizeForDiff(k.toLowerCase(), r[k]));
      return new Set(vals).size>1;
    });
  };

  function enrichForDisplay(statut, answers={}){
    const derived=deriveObligations(statut.shortName||statut.name);
    const km=statut.key_metrics||{}; const shortName=(statut.shortName||'').toUpperCase();
    const fallback = META_FALLBACK[shortName] || {};
    const metaDirigeant = statut.meta_dirigeant || fallback.meta_dirigeant || {};
    const enriched = {
      ...statut,
      fiscalite: normalizeFiscalite(statut.fiscalite || ''),
      regimeTVA: statut.regimeTVA || derived.regimeTVA,
      plafondCA: statut.plafondCA || derived.plafondCA || '—',
      obligationsCle: statut.obligationsCle || derived.obligationsCle || '—',
      statutDirigeant: metaDirigeant.statut_dirigeant || '—',
      _pp_stars: Number.isFinite(km.patrimony_protection) ? km.patrimony_protection : null,
      _pp_text: toText(statut.protectionPatrimoine),
      meta_payout: statut.meta_payout || fallback.meta_payout || {},
      meta_are: statut.meta_are || fallback.meta_are || {},
      meta_evolution: statut.meta_evolution || fallback.meta_evolution || {},
      meta_dirigeant: metaDirigeant
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
      /* Accessibilité: focus visible, reduced motion, safe-area */
      :focus-visible {
        outline: 2px solid ${TOKENS.accent};
        outline-offset: 2px;
      }
      
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }

      .comparatif-container{
        max-width:100%;
        overflow-x:auto;
        font-family:'Inter',sans-serif;
        color:${TOKENS.text.primary};
        font-size:15px;
        line-height:1.55;
      }
      .comparatif-header{margin-bottom:${TOKENS.spacing.md}px}
      .comparatif-setup-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:${TOKENS.spacing.lg}px;
        margin-bottom:${TOKENS.spacing.md}px;
      }
      @media(max-width:900px){
        .comparatif-setup-grid{grid-template-columns:1fr}
      }
      .setup-left,.setup-right{min-width:0}
      .quick-presets-row{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
      .comparatif-title{font-size:1.4rem;font-weight:700;margin-bottom:${TOKENS.spacing.xs}px;color:${TOKENS.accent};line-height:1.2}
      .comparatif-subtitle{
        color:${TOKENS.text.secondary};
        margin-bottom:${TOKENS.spacing.lg}px;
        font-size:.875rem;
        line-height:1.5;
        max-width:75ch;
      }

      .hero{display:none}
      .hero h1{margin:0 0 ${TOKENS.spacing.sm}px 0;font-size:1.5rem;color:${TOKENS.accent};line-height:1.2}
      .hero-sub{color:${TOKENS.text.secondary};margin:0 0 ${TOKENS.spacing.md}px 0;line-height:1.5;font-size:.875rem}
      .hero-ctas{display:flex;gap:${TOKENS.spacing.sm}px;flex-wrap:wrap}
      .btn{
        min-height:44px;
        padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;
        border-radius:999px;
        border:1px solid transparent;
        font-weight:600;
        cursor:pointer;
        transition:all .15s ease;
      }
      .btn-primary{background:${TOKENS.accent};color:#053;border-color:rgba(0,255,135,.8)}
      .btn-ghost{background:transparent;color:${TOKENS.accent};border-color:rgba(0,255,135,.35)}
      .btn:hover{filter:brightness(1.05);transform:scale(1.02)}

      .table-controls{
        position:sticky;
        top:0;
        z-index:40;
        background:${TOKENS.surface.raised};
        backdrop-filter:saturate(140%) blur(6px);
        padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;
        border:1px solid rgba(0,255,135,.12);
        border-radius:${TOKENS.radius.lg}px;
        margin-bottom:${TOKENS.spacing.md}px;
        display:flex;
        align-items:center;
        gap:${TOKENS.spacing.lg}px;
      }
      .switch{display:inline-flex;align-items:center;gap:${TOKENS.spacing.sm}px;cursor:pointer;user-select:none}
      .switch input{accent-color:${TOKENS.accent};width:18px;height:18px;cursor:pointer}

      .toast{
        position:fixed;
        right:16px;
        bottom:16px;
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.35);
        padding:${TOKENS.spacing.md}px ${TOKENS.spacing.lg}px;
        border-radius:${TOKENS.radius.md}px;
        color:${TOKENS.text.primary};
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        opacity:0;
        transform:translateY(6px);
        transition:all .2s ease;
        z-index:9999;
      }
      .toast.show{opacity:1;transform:translateY(0)}

      .empty{padding:2rem;text-align:center;color:${TOKENS.text.secondary}}
      .empty .quick{margin-top:${TOKENS.spacing.md}px;display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;justify-content:center}

      .section-label{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${TOKENS.text.muted};margin-bottom:${TOKENS.spacing.sm}px}

      .intent-toggles{
        display:flex;
        flex-wrap:wrap;
        gap:${TOKENS.spacing.sm}px;
        margin-bottom:${TOKENS.spacing.md}px;
        padding:${TOKENS.spacing.md}px;
        background:${TOKENS.surface.base};
        border-radius:${TOKENS.radius.md}px;
        border:1px solid rgba(0,255,135,.1);
      }
      .intent-toggle{
        position:relative;
        display:flex;
        align-items:center;
        gap:6px;
        min-height:36px;
        padding:6px ${TOKENS.spacing.md}px;
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.15);
        border-radius:999px;
        font-size:.8rem;
        color:${TOKENS.text.secondary};
        cursor:pointer;
        transition:all .15s ease;
        user-select:none;
      }
      .intent-toggle:hover{background:rgba(1,42,74,.85);transform:scale(1.02)}
      .intent-toggle.active{background:rgba(0,255,135,.15);border-color:${TOKENS.accent};color:${TOKENS.accent}}
      .intent-toggle .icon{font-size:1rem}
      .intent-toggle[aria-pressed="true"] .icon{color:${TOKENS.accent}}

      .tooltip{
        position:absolute;
        bottom:calc(100% + 8px);
        left:50%;
        transform:translateX(-50%);
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.3);
        border-radius:${TOKENS.radius.sm}px;
        padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;
        font-size:.75rem;
        white-space:nowrap;
        pointer-events:none;
        opacity:0;
        transition:opacity .15s;
        z-index:100;
      }
      .intent-toggle:hover .tooltip, .intent-toggle:focus-visible .tooltip{opacity:1}

      .personas{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;margin-bottom:${TOKENS.spacing.md}px}
      .persona-chip{
        position:relative;
        min-height:34px;
        padding:6px ${TOKENS.spacing.md}px;
        border:1px solid rgba(255,255,255,.15);
        border-radius:${TOKENS.radius.md}px;
        font-size:.775rem;
        color:${TOKENS.text.primary};
        cursor:pointer;
        background:${TOKENS.surface.overlay};
        transition:all .15s ease;
      }
      .persona-chip:hover{border-color:${TOKENS.accent};background:rgba(1,42,74,.8)}
      .persona-chip.active{border-color:${TOKENS.accent};background:rgba(0,255,135,.15);box-shadow:0 0 0 2px rgba(0,255,135,.35),0 0 18px rgba(0,255,135,.25);color:${TOKENS.accent}}
      .persona-chip.active .baseline{opacity:1;color:${TOKENS.text.secondary}}
      .persona-chip.active::after{content:"✓";position:absolute;top:6px;right:8px;color:${TOKENS.accent};font-weight:700;font-size:.85rem}
      .persona-chip{position:relative}
      .persona-chip .baseline{
        position:absolute;
        bottom:calc(100% + 6px);
        left:50%;
        transform:translateX(-50%);
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.3);
        padding:4px 8px;
        border-radius:4px;
        font-size:.7rem;
        white-space:nowrap;
        opacity:0;
        pointer-events:none;
        transition:opacity .15s;
      }
      .persona-chip:hover .baseline, .persona-chip:focus-visible .baseline{opacity:1}

      .quick-presets{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;margin-bottom:${TOKENS.spacing.md}px}
      .preset-btn{
        min-height:34px;
        padding:5px ${TOKENS.spacing.md}px;
        border:1px solid rgba(0,255,135,.35);
        background:rgba(0,255,135,.08);
        border-radius:999px;
        font-size:.775rem;
        color:${TOKENS.accent};
        cursor:pointer;
        transition:all .15s ease;
      }
      .preset-btn:hover{background:rgba(0,255,135,.18);transform:scale(1.02)}

      .comparison-bar{
        display:flex;
        align-items:center;
        padding:${TOKENS.spacing.md}px;
        background:${TOKENS.surface.base};
        border-radius:${TOKENS.radius.md}px;
        margin-bottom:${TOKENS.spacing.md}px;
        flex-wrap:wrap;
        gap:${TOKENS.spacing.sm}px;
        border:1px solid rgba(0,255,135,.12);
      }
      .comparison-title{font-size:.8rem;font-weight:600;color:${TOKENS.text.secondary};margin-right:auto}
      .comparison-items{display:flex;flex-wrap:wrap;gap:${TOKENS.spacing.sm}px;flex-grow:1}
      .comparison-item{
        display:flex;
        align-items:center;
        gap:${TOKENS.spacing.sm}px;
        padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;
        background:rgba(0,255,135,.12);
        border:1px solid rgba(0,255,135,.35);
        border-radius:${TOKENS.radius.sm}px;
        font-size:.8125rem;
        color:${TOKENS.accent};
      }
      .comparison-item .remove-btn{
        min-width:24px;
        min-height:24px;
        background:none;
        border:none;
        color:${TOKENS.text.muted};
        font-size:.75rem;
        cursor:pointer;
        padding:2px;
        transition:color .15s;
      }
      .comparison-item .remove-btn:hover{color:${TOKENS.semantic.danger}}
      .status-dropdown{
        width:180px;
        min-height:34px;
        padding:6px ${TOKENS.spacing.md}px;
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.25);
        border-radius:${TOKENS.radius.sm}px;
        color:${TOKENS.text.primary};
        font-size:.875rem;
      }

      .diff-badge{
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:4px 10px;
        background:rgba(0,255,135,.15);
        border:1px solid rgba(0,255,135,.4);
        border-radius:999px;
        font-size:.75rem;
        font-weight:600;
        color:${TOKENS.accent};
      }
      .diff-badge .icon{font-size:.875rem}

      .advice-card{
        border:1px solid rgba(0,255,135,.3);
        border-radius:${TOKENS.radius.lg}px;
        padding:${TOKENS.spacing.lg}px;
        background:${TOKENS.surface.overlay};
        margin-bottom:${TOKENS.spacing.lg}px;
        animation:fadeIn .15s ease;
      }
      .advice-card .title{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.md}px;font-size:.9375rem}
      .advice-card ul{margin:0;padding-left:20px;line-height:1.7}
      .advice-card li{margin-bottom:${TOKENS.spacing.sm}px}
      .advice-card .pro{color:${TOKENS.semantic.success};font-weight:500}
      .advice-card .con{color:${TOKENS.semantic.danger};font-weight:500}
      .advice-card .arbitrage{
        margin-top:${TOKENS.spacing.md}px;
        padding-top:${TOKENS.spacing.md}px;
        border-top:1px solid rgba(255,255,255,.1);
        font-style:italic;
        color:${TOKENS.text.secondary};
      }

      .decision-card{border-color:rgba(0,255,135,.35)}
      .decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:${TOKENS.spacing.lg}px}
      .decision-sub{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.sm}px}
      .decision-list{margin:0;padding-left:18px;line-height:1.7}
      .decision-list li{margin-bottom:${TOKENS.spacing.sm}px}
      .decision-caveats{margin-top:${TOKENS.spacing.md}px;padding-top:${TOKENS.spacing.md}px;border-top:1px solid rgba(255,255,255,.08)}
      .decision-kicker{font-weight:600;color:${TOKENS.text.secondary};margin-right:6px}
      .decision-one-liner{
        margin-top:${TOKENS.spacing.md}px;
        padding:${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px;
        border:1px dashed rgba(0,255,135,.35);
        border-radius:${TOKENS.radius.sm}px;
        color:${TOKENS.text.primary};
        font-size:.875rem;
      }

      .comparatif-filters{
        display:flex;
        flex-wrap:wrap;
        gap:${TOKENS.spacing.md}px;
        margin-bottom:${TOKENS.spacing.md}px;
        align-items:flex-end;
      }
      .filter-group{flex:1;min-width:180px}
      .filter-label{display:block;margin-bottom:${TOKENS.spacing.sm}px;color:${TOKENS.text.muted};font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
      .criteria-buttons{display:flex;flex-wrap:wrap;gap:6px}
      .criteria-button{
        min-height:34px;
        padding:6px ${TOKENS.spacing.md}px;
        border-radius:${TOKENS.radius.sm}px;
        font-size:.8rem;
        cursor:pointer;
        background:${TOKENS.surface.raised};
        border:1px solid rgba(0,255,135,.2);
        color:${TOKENS.text.secondary};
        transition:all .15s ease;
        text-align:center;
      }
      .criteria-button:hover{border-color:rgba(0,255,135,.4);background:rgba(1,42,74,.85)}
      .criteria-button.active{background:rgba(0,255,135,.15);border-color:${TOKENS.accent};color:${TOKENS.accent};font-weight:600}

      .search-input{
        width:100%;
        min-height:34px;
        padding:6px ${TOKENS.spacing.md}px;
        border-radius:${TOKENS.radius.sm}px;
        border:1px solid rgba(1,42,74,.8);
        background:${TOKENS.surface.raised};
        color:${TOKENS.text.primary};
        transition:all .15s ease;
        font-size:.875rem;
      }
      .search-input:focus{outline:none;border-color:${TOKENS.accent};box-shadow:0 0 0 2px rgba(0,255,135,.15)}
      .search-input::placeholder{color:${TOKENS.text.muted}}

      .table-header-bar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:${TOKENS.spacing.md}px;
        padding:${TOKENS.spacing.sm}px 0;
      }
      .column-count{font-size:.8125rem;color:${TOKENS.text.secondary}}
      .column-count strong{color:${TOKENS.accent};font-weight:600}

      .comparatif-table-container{
        border-radius:${TOKENS.radius.xl}px;
        border:1px solid rgba(1,42,74,.8);
        overflow:hidden;
        background:rgba(1,42,74,.25);
        box-shadow:0 4px 16px rgba(0,0,0,.15);
      }
      .comparatif-table{width:100%;border-collapse:separate;border-spacing:0;text-align:left}
      .comparatif-table th{
        padding:${TOKENS.spacing.lg}px ${TOKENS.spacing.md}px;
        background:linear-gradient(180deg, rgba(0,255,135,.08), ${TOKENS.surface.raised});
        font-weight:700;
        color:${TOKENS.accent};
        font-size:.78rem;
        text-transform:uppercase;
        letter-spacing:.5px;
        border-bottom:2px solid rgba(0,255,135,.35);
        border-right:1px solid rgba(0,255,135,.08);
        position:sticky;
        top:0;
        z-index:20;
        white-space:nowrap;
      }
      .comparatif-table th:last-child{border-right:none}
      .comparatif-table th:first-child{position:sticky;left:0;z-index:30;background:${TOKENS.surface.raised};border-right:2px solid rgba(0,255,135,.25)}
      .comparatif-table td{
        padding:${TOKENS.spacing.lg}px ${TOKENS.spacing.md}px;
        border-bottom:1px solid rgba(0,255,135,.08);
        border-right:1px solid rgba(255,255,255,.04);
        font-size:.875rem;
        line-height:1.55;
        vertical-align:top;
      }
      .comparatif-table td:last-child{border-right:none}
      .comparatif-table td:first-child{position:sticky;left:0;background:#0a2540;z-index:10;border-right:2px solid rgba(0,255,135,.18)}
      .comparatif-table tr:last-child td{border-bottom:none}
      .comparatif-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.025)}
      .comparatif-table tbody tr:nth-child(even) td:first-child{background:#0c2a47}
      .comparatif-table tbody tr{cursor:pointer;transition:background .15s ease}
      .comparatif-table tbody tr:hover td{background:rgba(0,255,135,.07)}
      .comparatif-table tbody tr:hover td:first-child{background:rgba(0,255,135,.12)}
      .comparatif-table tbody tr.is-selected td{background:rgba(0,255,135,.13);box-shadow:inset 0 1px 0 rgba(0,255,135,.35),inset 0 -1px 0 rgba(0,255,135,.35)}
      .comparatif-table tbody tr.is-selected td:first-child{background:rgba(0,255,135,.18);border-left:3px solid ${TOKENS.accent};padding-left:calc(${TOKENS.spacing.md}px - 3px)}
      .comparatif-table .diff-col{background:rgba(255,184,0,.09) !important;box-shadow:inset 2px 0 0 rgba(255,184,0,.35),inset -2px 0 0 rgba(255,184,0,.35)}
      .comparatif-table tbody tr:hover .diff-col{background:rgba(255,184,0,.15) !important}

      .statut-cell{display:flex;align-items:flex-start;gap:${TOKENS.spacing.md}px}
      .statut-icon{
        width:2.5rem;
        height:2.5rem;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:50%;
        background:${TOKENS.surface.raised};
        color:${TOKENS.accent};
        font-size:1rem;
        flex-shrink:0;
      }
      .statut-info{display:flex;flex-direction:column;min-width:0}
      .statut-name{font-weight:600;color:${TOKENS.text.primary};font-size:.9375rem}
      .statut-fullname{font-size:.75rem;color:${TOKENS.text.muted};margin-top:2px}
      .status-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:${TOKENS.spacing.sm}px}
      .status-badge{
        display:inline-flex;
        align-items:center;
        padding:2px 6px;
        border-radius:3px;
        font-size:.65rem;
        font-weight:600;
        text-transform:uppercase;
        letter-spacing:0.3px;
      }
      .badge-dividends{background:rgba(236,72,153,.2);color:#EC4899}
      .badge-are{background:rgba(16,185,129,.2);color:${TOKENS.semantic.success}}
      .badge-investors{background:rgba(189,162,255,.2);color:#BDA2FF}
      .badge-tns{background:rgba(139,92,246,.2);color:#A78BFA}
      .badge-assimile{background:rgba(34,211,238,.2);color:#22D3EE}

      .truncate{cursor:help}

      .loading-state{
        display:flex;
        justify-content:center;
        align-items:center;
        height:200px;
        flex-direction:column;
        gap:${TOKENS.spacing.lg}px;
      }
      .spinner{
        width:40px;
        height:40px;
        border:3px solid rgba(0,255,135,.2);
        border-radius:50%;
        border-top-color:${TOKENS.accent};
        animation:spin 1s ease-in-out infinite;
      }
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

      .comparatif-notes{
        margin-top:${TOKENS.spacing.xl}px;
        padding:${TOKENS.spacing.lg}px;
        border-radius:${TOKENS.radius.lg}px;
        background:rgba(1,42,74,.25);
        font-size:.875rem;
      }
      .notes-title{font-weight:600;color:${TOKENS.accent};margin-bottom:${TOKENS.spacing.md}px}
      .notes-list{
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
        gap:${TOKENS.spacing.md}px;
        margin-bottom:${TOKENS.spacing.md}px;
      }
      .notes-item{display:flex;align-items:center;gap:${TOKENS.spacing.sm}px}
      .notes-term{color:${TOKENS.accent};font-weight:600}
      .notes-disclaimer{
        font-style:italic;
        color:${TOKENS.text.muted};
        font-size:.8125rem;
        text-align:center;
        margin-top:${TOKENS.spacing.md}px;
      }

      @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      .comparatif-table tbody tr{animation:fadeInUp .25s ease forwards;opacity:0}

      @media (max-width: 768px){
        .mobile-sticky-cta{
          position:fixed;
          left:0;
          right:0;
          bottom:0;
          z-index:60;
          padding:12px;
          padding-bottom:calc(12px + env(safe-area-inset-bottom));
          background:${TOKENS.surface.raised};
          backdrop-filter:saturate(140%) blur(6px);
          border-top:1px solid rgba(0,255,135,.25);
        }
        .mobile-sticky-cta .btn{width:100%}
        .hero h1{font-size:1.5rem}
        .hero-ctas{flex-direction:column}
        .btn{width:100%;text-align:center}
        .comparatif-title{font-size:1.5rem}
        .intent-toggles,.personas,.quick-presets{flex-direction:column}
        .comparatif-filters{flex-direction:column}
        .criteria-buttons{grid-template-columns:repeat(2,1fr)}
        .statut-icon{width:2rem;height:2rem;font-size:.875rem}
        .comparatif-table th,.comparatif-table td{padding:${TOKENS.spacing.md}px ${TOKENS.spacing.sm}px;font-size:.8125rem;line-height:1.5}
        .comparatif-table th:first-child,.comparatif-table td:first-child{position:static}
        .notes-list{grid-template-columns:1fr}
        .decision-grid{grid-template-columns:1fr}
        .decision-one-liner{font-size:.85rem}
        
        .cards-mobile{display:grid;grid-template-columns:1fr;gap:${TOKENS.spacing.md}px;margin-bottom:${TOKENS.spacing.lg}px}
        .card{
          position:relative;
          border:1px solid rgba(0,255,135,.25);
          background:${TOKENS.surface.overlay};
          border-radius:${TOKENS.radius.lg}px;
          padding:${TOKENS.spacing.lg}px;
          cursor:pointer;
          transition:all .15s ease;
          min-height:44px;
        }
        .card:hover{border-color:${TOKENS.accent};background:rgba(0,255,135,.05)}
        .card.selected{border-color:${TOKENS.accent};box-shadow:0 0 0 2px rgba(0,255,135,.25) inset}
        .card-checkbox{
          position:absolute;
          top:10px;
          right:10px;
          width:24px;
          height:24px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(0,255,135,.35);
          background:rgba(0,255,135,.08);
          font-size:.75rem;
        }
        .card.selected .card-checkbox{background:${TOKENS.accent};border-color:${TOKENS.accent};color:#053}
        .card h4{margin:0 0 6px 0;color:${TOKENS.accent};font-size:1rem}
        .card ul{margin:8px 0 0 16px;line-height:1.7;font-size:.875rem}
        .comparatif-table-container{display:none}
      }

      /* Skip to content link pour a11y */
      .skip-to-content {
        position: absolute;
        top: -40px;
        left: 0;
        background: ${TOKENS.accent};
        color: #053;
        padding: 8px 16px;
        text-decoration: none;
        z-index: 100;
        border-radius: 0 0 4px 0;
      }
      .skip-to-content:focus {
        top: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // ===================== TABLEAU =====================
  window.createComparatifTable = function(containerId){
    const container = document.getElementById(containerId);
    if(!container){ console.error(`❌ Conteneur #${containerId} non trouvé`); return; }

    injectCSS();

    // Skip to content link pour accessibilité
    const skipLink = document.createElement('a');
    skipLink.href = '#comparatif-table';
    skipLink.className = 'skip-to-content';
    skipLink.textContent = 'Aller au tableau comparatif';
    document.body.insertBefore(skipLink, document.body.firstChild);

    const heroHTML = `
      <div class="hero">
        <h1>Choisis le bon statut en 2 minutes</h1>
        <p class="hero-sub">Compare des statuts, on montre uniquement les différences et on te guide selon tes objectifs (dividendes, ARE, associés, levée de fonds).</p>
        <div class="hero-ctas">
          <button class="btn btn-primary" id="hero-cta-eurl-sasu">Comparer EURL ↔ SASU</button>
          <button class="btn btn-ghost" id="hero-cta-see-table">Voir tout le tableau</button>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="comparatif-container">
        ${heroHTML}
        <div class="comparatif-header">
          <h1 class="comparatif-title">Comparatif des formes juridiques 2026</h1>
          <p class="comparatif-subtitle">
            Comparez jusqu'à ${MAX_COMPARE === Infinity ? '∞' : MAX_COMPARE} statuts. Seules les différences sont affichées par défaut.
          </p>

          <div class="comparatif-setup-grid">
            <div class="setup-left">
              <div class="section-label">Filtrer par objectif</div>
              <div class="intent-toggles" role="group" aria-label="Vos objectifs">
                <button type="button" class="intent-toggle" data-intent="veut_dividendes" aria-pressed="false" aria-describedby="tip-veut_dividendes">
                  <i class="fas fa-coins icon"></i><span>Dividendes</span>
                  <div class="tooltip" id="tip-veut_dividendes">Statuts avec dividendes possibles/optimisés</div>
                </button>
                <button type="button" class="intent-toggle" data-intent="en_chomage" aria-pressed="false" aria-describedby="tip-en_chomage">
                  <i class="fas fa-shield-alt icon"></i><span>ARE</span>
                  <div class="tooltip" id="tip-en_chomage">Compatible avec l'allocation chômage</div>
                </button>
                <button type="button" class="intent-toggle" data-intent="prevoit_associes" aria-pressed="false" aria-describedby="tip-prevoit_associes">
                  <i class="fas fa-users icon"></i><span>Associés</span>
                  <div class="tooltip" id="tip-prevoit_associes">Statuts multi-associés</div>
                </button>
                <button type="button" class="intent-toggle" data-intent="levee_fonds" aria-pressed="false" aria-describedby="tip-levee_fonds">
                  <i class="fas fa-rocket icon"></i><span>Levée</span>
                  <div class="tooltip" id="tip-levee_fonds">SAS/SASU pour BSPCE et actions de préférence</div>
                </button>
              </div>

              <div class="section-label">Comparaisons rapides</div>
              <div class="quick-presets-row">
                <div class="quick-presets" id="quick-presets"></div>
                <div class="personas" id="personas"></div>
              </div>
            </div>

            <div class="setup-right">
              <div class="section-label">Statuts à comparer</div>
              <div class="comparison-bar">
                <select id="status-dropdown" class="status-dropdown" aria-label="Ajouter un statut">
                  <option value="">Ajouter un statut…</option>
                </select>
                <div class="comparison-items" id="comparison-items"></div>
                <div id="diff-badge-container"></div>
                <button type="button" id="share-link" class="preset-btn" aria-label="Copier le lien de comparaison"><i class="fas fa-share-alt" style="margin-right:4px"></i>Partager</button>
              </div>

              <div class="section-label">Colonnes</div>
              <div class="comparatif-filters">
                <div class="filter-group">
                  <div class="criteria-buttons" id="criteria-buttons"></div>
                </div>
                <div class="filter-group" style="max-width:220px;">
                  <input type="text" id="search-input" class="search-input" placeholder="Rechercher…" aria-label="Rechercher un statut">
                </div>
              </div>
            </div>
          </div>

          <div id="impact-recommendations" aria-live="polite"></div>
          <div id="smart-comparison" aria-live="polite"></div>
          <div id="persona-advice" aria-live="polite"></div>
          <div id="suggestion-bar" aria-live="polite"></div>

          <div class="table-header-bar">
            <div class="column-count" id="column-count"></div>
          </div>
        </div>

        <div class="comparatif-table-container" id="comparatif-table">
          <table class="comparatif-table">
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
            <div class="notes-item"><span class="notes-term">PFU</span> Prélèvement Forfaitaire Unique (31,4% depuis 2026)</div>
            <div class="notes-item"><span class="notes-term">ARE</span> Allocation Retour à l'Emploi</div>
          </div>
          <p class="notes-disclaimer">Informations 2026. Consultez un expert-comptable pour votre cas précis.</p>
        </div>
      </div>
    `;

    // P0: Mobile sticky CTA
    const mobileCTA = document.createElement('div');
    mobileCTA.id = 'mobile-cta';
    mobileCTA.className = 'mobile-sticky-cta';
    mobileCTA.style.display = 'none';
    mobileCTA.innerHTML = `
      <button type="button" class="btn btn-primary" id="mobile-cta-btn">Ajouter des statuts (0/${MAX_COMPARE===Infinity?'∞':MAX_COMPARE})</button>
    `;
    document.body.appendChild(mobileCTA);

    const tableContainer = $('.comparatif-table-container');
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'table-controls';
    controlsWrap.innerHTML = `
      <label class="switch" title="N'afficher que les lignes qui diffèrent entre les statuts">
        <input type="checkbox" id="only-diff-switch" />
        <span>Afficher uniquement les différences</span>
      </label>
    `;
    tableContainer.parentNode.insertBefore(controlsWrap, tableContainer);

    const criteria=[
      { id:'all', label:'Tous' },
      { id:'basic', label:'Base' },
      { id:'fiscal', label:'Fiscalité' },
      { id:'social', label:'Social' },
      { id:'creation', label:'Création' }
    ];
    const criteriaButtons=$('#criteria-buttons');
    criteria.forEach(c=>{
      const b=document.createElement('button');
      b.type = 'button';
      b.className='criteria-button'+(c.id==='all'?' active':'');
      b.setAttribute('data-criterion', c.id); 
      b.setAttribute('aria-pressed', c.id==='all'?'true':'false');
      b.textContent=c.label;
      criteriaButtons.appendChild(b);
    });

    // ---------- états ----------
    let selectedCriterion='all';
    let searchTerm='';
    let compareStatuts=[];
    let onlyDiffSwitch = true; // P0: Diff by default
    let lastDiffCount = 0; // P0: For mobile CTA badge
    
    let isMobile = window.matchMedia('(max-width:768px)').matches;
    window.matchMedia('(max-width:768px)').addEventListener('change', (e) => {
      isMobile = e.matches;
      updateTable();
      updateMobileCTA(); // P0
    });

    let intentAnswers={
      veut_dividendes:false,
      en_chomage:false,
      prevoit_associes:'non',
      levee_fonds:'non',
      eviter_salaire:false
    };

    // P0: Mobile CTA logic
    function updateMobileCTA(){
      const el = document.getElementById('mobile-cta');
      const btn = document.getElementById('mobile-cta-btn');
      if(!el || !btn) return;
      if(!isMobile) { el.style.display = 'none'; return; }

      const count = compareStatuts.length;
      if(count === 0){
        btn.textContent = `Choisir des statuts à comparer (0/${MAX_COMPARE===Infinity?'∞':MAX_COMPARE})`;
        btn.onclick = () => {
          document.querySelector('.quick-presets')?.scrollIntoView({behavior:'smooth', block:'start'});
        };
        el.style.display = 'block';
      } else if(count < MAX_COMPARE){
        btn.textContent = `Ajouter des statuts (${count}/${MAX_COMPARE===Infinity?'∞':MAX_COMPARE})`;
        btn.onclick = () => {
          document.querySelector('.quick-presets')?.scrollIntoView({behavior:'smooth', block:'start'});
        };
        el.style.display = 'block';
      } else {
        const n = lastDiffCount || 0;
        btn.textContent = `Voir les différences (${n})`;
        btn.onclick = () => {
          onlyDiffSwitch = true;
          const switchEl = document.getElementById('only-diff-switch');
          if(switchEl) switchEl.checked = true;
          updateTable();
          document.querySelector('.comparatif-table-container')?.scrollIntoView({behavior:'smooth', block:'start'});
        };
        el.style.display = 'block';
      }
    }

    function persistStateToURL(){
      const i = [];
      if(intentAnswers.veut_dividendes) i.push('dividendes');
      if(intentAnswers.en_chomage) i.push('are');
      if(intentAnswers.prevoit_associes==='oui') i.push('associes');
      if(intentAnswers.levee_fonds==='oui') i.push('levee');
      const params = new URLSearchParams();
      if(compareStatuts.length) params.set('c', compareStatuts.join(','));
      if(i.length) params.set('i', i.join(','));
      if(selectedCriterion!=='all') params.set('k', selectedCriterion);
      if(searchTerm) params.set('q', searchTerm);
      if(onlyDiffSwitch) params.set('d', '1');
      const url = `${location.pathname}?${params.toString()}`;
      history.replaceState(null, '', url);
    }

    function restoreStateFromURL(){
      const p = new URLSearchParams(location.search);
      const c = (p.get('c')||'').split(',').filter(Boolean).map(resolveStatutKey);
      const i = (p.get('i')||'').split(',').filter(Boolean);
      const k = p.get('k')||'all';
      const q = p.get('q')||'';
      const d = p.get('d');

      if(c.length){ compareStatuts = c.slice(0, MAX_COMPARE); }
      if(i.length){
        intentAnswers.veut_dividendes = i.includes('dividendes');
        intentAnswers.en_chomage = i.includes('are');
        intentAnswers.prevoit_associes = i.includes('associes') ? 'oui' : 'non';
        intentAnswers.levee_fonds = i.includes('levee') ? 'oui' : 'non';
      }
      selectedCriterion = ['all','basic','fiscal','social','creation'].includes(k) ? k : 'all';
      searchTerm = q.toLowerCase();
      
      // P0: Respect URL state if present, otherwise default to true
      if(d !== null) {
        onlyDiffSwitch = d === '1';
      }

      syncIntentUI();
      $$('.criteria-button').forEach(b=>{
        const isActive = b.getAttribute('data-criterion')===selectedCriterion;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive?'true':'false');
      });
      const searchEl = $('#search-input'); if(searchEl) searchEl.value = q;
      const switchEl = $('#only-diff-switch'); if(switchEl) switchEl.checked = onlyDiffSwitch;

      updateComparisonBar(); updateTable(); renderPersonaAdvice(); updateMobileCTA(); // P0
    }

    window.__comparatifHooks = window.__comparatifHooks || {};
    window.__comparatifHooks.setComparison=function(statuts){ compareStatuts=statuts||[]; updateComparisonBar(); updateTable(); renderPersonaAdvice(); updateMobileCTA(); };
    window.__comparatifHooks.setIntents=function(intents){ Object.assign(intentAnswers, intents); syncIntentUI(); renderAREHelper(intentAnswers); updateTable(); renderPersonaAdvice(); };

    initIntentFilters();
    initComparisonEvents();
    renderQuickPresets();
    renderPersonas();
    loadStatutData();
    renderAREHelper(intentAnswers);
    restoreStateFromURL();

    $('#hero-cta-eurl-sasu')?.addEventListener('click', ()=>{
      compareStatuts=['EURL','SASU'];
      updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); // P0
      document.querySelector('.comparatif-table-container')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('#hero-cta-see-table')?.addEventListener('click', ()=>{
      document.querySelector('.comparatif-table-container')?.scrollIntoView({behavior:'smooth',block:'start'});
    });

    $('#only-diff-switch')?.addEventListener('change', (e)=>{
      onlyDiffSwitch = !!e.target.checked;
      updateTable();
      persistStateToURL();
    });

    const shareBtn = $('#share-link');
    if(shareBtn){
      shareBtn.addEventListener('click', async ()=>{
        persistStateToURL();
        const label = compareStatuts.length<=2
          ? compareStatuts.join(' vs ')
          : `${compareStatuts.length} statuts`;
        const summary = `Comparaison: ${label} — ${location.href}`;
        try{
          await navigator.clipboard.writeText(summary);
          showToast('Résumé copié ✓');
        }catch{
          showToast('Erreur de copie');
        }
      });
    }

    $$('.criteria-button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        $$('.criteria-button').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed','true');
        selectedCriterion=btn.getAttribute('data-criterion');
        updateTable();
        persistStateToURL();
      });
    });
    const debouncedUpdate=debounce(()=>{ updateTable(); persistStateToURL(); },200);
    $('#search-input').addEventListener('input',e=>{ searchTerm=e.target.value.toLowerCase(); debouncedUpdate(); });

    function syncIntentUI(){
      $$('.intent-toggle').forEach(btn=>{
        const intent=btn.dataset.intent;
        let isActive=false;
        if(intent==='prevoit_associes' || intent==='levee_fonds'){ isActive = intentAnswers[intent]==='oui'; }
        else { isActive=!!intentAnswers[intent]; }
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive?'true':'false');
      });
    }

    function initIntentFilters(){
      $$('.intent-toggle').forEach(btn=>{
        const intent=btn.dataset.intent;

        const toggle = ()=>{
          const isActive = btn.getAttribute('aria-pressed')==='true';
          btn.classList.toggle('active', !isActive);
          btn.setAttribute('aria-pressed', !isActive?'true':'false');
          
          if(intent==='prevoit_associes' || intent==='levee_fonds'){ 
            intentAnswers[intent]=!isActive?'oui':'non'; 
          } else { 
            intentAnswers[intent]=!isActive; 
          }
          
          renderAREHelper(intentAnswers); updateTable(); renderPersonaAdvice(); syncIntentUI(); persistStateToURL();
        };

        btn.addEventListener('click', toggle);
        btn.addEventListener('keydown', (e)=>{
          if(e.key==='Enter' || e.key===' '){
            e.preventDefault(); 
            toggle();
          }
        });
      });
    }

    function renderQuickPresets(){
      const host=$('#quick-presets'); if(!host) return;
      const presets=[ ['EURL','SASU'], ['MICRO','SASU'], ['SAS','SARL'], ['MICRO','EI'], ['EURL','SARL'], ['SASU','SARL'] ];
      host.innerHTML = presets.map(p=>`<button type="button" class="preset-btn" data-preset="${p.join(',')}" aria-label="Comparer ${p[0]} et ${p[1]}">${p[0]} ↔ ${p[1]}</button>`).join('');
      host.querySelectorAll('.preset-btn').forEach(b=>b.addEventListener('click',()=>{
        const [a,bis]=b.getAttribute('data-preset').split(',');
        compareStatuts=[resolveStatutKey(a), resolveStatutKey(bis)];
        updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); // P0
      }));
    }

    function renderPersonas(){
      const host=$('#personas'); if(!host) return;
      const personas=[
        { id:'freelance-are', label:'Freelance au chômage (ARE)', baseline:'éviter salaire, dividendes OK en SASU', apply:()=>{ intentAnswers={...intentAnswers,en_chomage:true,veut_dividendes:true,eviter_salaire:true,prevoit_associes:'non',levee_fonds:'non'}; compareStatuts=['EURL','SASU']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); }},
        { id:'consultant-solo', label:'Consultant solo', baseline:'micro vs société, optimisation charges', apply:()=>{ intentAnswers={...intentAnswers,en_chomage:false,veut_dividendes:true,eviter_salaire:false,prevoit_associes:'non',levee_fonds:'non'}; compareStatuts=['MICRO','EURL','SASU']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); }},
        { id:'startup-fundraise', label:'Startup (lever des fonds)', baseline:'BSPCE, actions de préférence (SAS)', apply:()=>{ intentAnswers={...intentAnswers,levee_fonds:'oui',prevoit_associes:'oui',en_chomage:false}; compareStatuts=['SASU','SAS']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); }},
        { id:'artisan-tns', label:'Artisan budget serré (TNS)', baseline:'charges basses, comptabilité simple', apply:()=>{ intentAnswers={...intentAnswers,veut_dividendes:false,en_chomage:false,prevoit_associes:'non'}; compareStatuts=['MICRO','EURL']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); }},
        { id:'liberal-reglemente', label:'Profession libérale réglementée', baseline:'SELARL vs SELAS, ordre professionnel', apply:()=>{ intentAnswers={...intentAnswers,veut_dividendes:true,en_chomage:false,prevoit_associes:'non',levee_fonds:'non'}; compareStatuts=['SELARL','SELAS']; syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); }}
      ];
      host.innerHTML = personas.map(p=>`<button type="button" class="persona-chip" data-id="${p.id}" aria-pressed="false" aria-label="${p.label}" tabindex="0">${p.label}<div class="baseline">${p.baseline}</div></button>`).join('');
      let activePersonaId = null;
      const resetPersona = ()=>{
        intentAnswers={veut_dividendes:false,en_chomage:false,prevoit_associes:'non',levee_fonds:'non',eviter_salaire:false};
        compareStatuts=[];
        syncIntentUI(); updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA();
      };
      const handlePersona = (el, p)=>{
        const isActive = el.classList.contains('active');
        host.querySelectorAll('.persona-chip').forEach(c=>{ c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
        if(isActive){
          activePersonaId = null;
          resetPersona();
        } else {
          activePersonaId = p.id;
          el.classList.add('active');
          el.setAttribute('aria-pressed','true');
          p.apply();
        }
      };
      host.querySelectorAll('.persona-chip').forEach(el=>{
        const p=personas.find(x=>x.id===el.getAttribute('data-id'));
        if(p) {
          el.addEventListener('click',()=>handlePersona(el,p));
          el.addEventListener('keydown', (e)=>{
            if(e.key==='Enter' || e.key===' '){
              e.preventDefault();
              handlePersona(el,p);
            }
          });
        }
      });
    }

    function renderAREHelper(intentAnswers){
      let host=document.getElementById('are-helper');
      if(!host){ host=document.createElement('div'); host.id='are-helper'; host.style.marginBottom=TOKENS.spacing.lg+'px'; const header=$('.comparatif-header'); header && header.appendChild(host); }
      if(!intentAnswers.en_chomage){ host.innerHTML=''; host.style.display='none'; return; }
      host.style.display='block';
      host.innerHTML=`
        <div class="advice-card">
          <div class="title"><i class="fas fa-shield-alt"></i> Chômage (ARE) — points clés</div>
          <div style="font-size:.875rem;line-height:1.7">
            Salaire versé ⇒ réduction ARE • Dividendes SAS/SASU ⇒ non pris en compte • Dividendes EURL/SARL >10% ⇒ cotisations TNS • ARCE vs maintien : à arbitrer
          </div>
        </div>`;
    }

    function initComparisonEvents(){
      const statusDropdown=$('#status-dropdown');
      function populate(){ if(!window.legalStatuses) return; statusDropdown.innerHTML='<option value="">Ajouter un statut…</option>';
        const statuts=Object.values(window.legalStatuses).sort((a,b)=>a.shortName.localeCompare(b.shortName,'fr',{sensitivity:'base'}));
        statuts.forEach(s=>{ const o=document.createElement('option'); o.value=s.shortName; o.textContent=s.shortName; statusDropdown.appendChild(o); }); }
      statusDropdown.addEventListener('change',()=>{ if(statusDropdown.value){ addToComparison(statusDropdown.value); statusDropdown.value=''; }});
      if(window.legalStatuses) populate(); else { const it=setInterval(()=>{ if(window.legalStatuses){ populate(); clearInterval(it);} },400); }
      window.addEventListener('legalStatuses:ready',()=>{ 
        populate(); 
        renderSmartComparison(); 
      },{ once:true });
    }

    function addToComparison(sn){
      sn = resolveStatutKey(sn);
      if(compareStatuts.includes(sn)) return;
      if(compareStatuts.length >= MAX_COMPARE){
        showToast(`Maximum ${MAX_COMPARE} statuts. Retirez-en un pour continuer.`);
        return;
      }
      compareStatuts.push(sn); 
      updateComparisonBar(); 
      updateTable(); 
      renderPersonaAdvice();
      persistStateToURL();
      updateMobileCTA();
    }
    
    function removeFromComparison(sn){ 
      const i=compareStatuts.indexOf(sn); 
      if(i!==-1){ 
        compareStatuts.splice(i,1); 
        updateComparisonBar(); 
        updateTable(); 
        renderPersonaAdvice(); 
        persistStateToURL();
        updateMobileCTA(); // P0
      }
    }

    function updateComparisonBar(){
      const wrap=$('#comparison-items'); wrap.innerHTML='';
      const badge=$('#diff-badge-container'); 
      
      compareStatuts.forEach(shortName=>{
        const statut=(Object.values(window.legalStatuses||{}).find(
          s => (s.shortName||'').toUpperCase() === shortName.toUpperCase()
        ));
        const icon = statut?.logo || 'fa-building';
        const label = statut?.shortName || shortName;
        const div=document.createElement('div'); 
        div.className='comparison-item';
        div.innerHTML=`<i class="fas ${icon}"></i> ${escapeHTML(label)} <button type="button" class="remove-btn" aria-label="Retirer ${escapeHTML(label)}"><i class="fas fa-times"></i></button>`;
        div.querySelector('.remove-btn').addEventListener('click',()=>removeFromComparison(shortName));
        wrap.appendChild(div);
      });

      if(compareStatuts.length>=2){
        badge.innerHTML='<div class="diff-badge"><i class="fas fa-check-circle icon"></i> Mode différences activé</div>';
      } else {
        badge.innerHTML='';
      }
      
      renderSmartComparison();
    }

    function renderSmartComparison(){
      let host = $('#smart-comparison');
      if(!host){
        host = document.createElement('div');
        host.id = 'smart-comparison';
        $('.comparatif-header')?.appendChild(host);
      }
      host.innerHTML = '';

      const has = x => compareStatuts.includes(x);

      const PAIRS = [
        ['EURL','SASU','EURL|SASU'],
        ['MICRO','SASU','MICRO|SASU'],
        ['SAS','SARL','SAS|SARL'],
        ['MICRO','EI','MICRO|EI'],
        ['EURL','SARL','EURL|SARL'],
        ['SASU','SARL','SASU|SARL'],
      ];

      let rendered = false;
      for(const [a,b,key] of PAIRS){
        if(has(a) && has(b)){ host.innerHTML += renderDecision(key); rendered = true; }
      }

      // Panneau chiffré si la comparaison implique TNS vs assimilé salarié
      if((has('EURL') && has('SASU')) || (has('MICRO') && has('SASU')) || (has('SARL') && has('SAS'))){
        host.innerHTML += renderCostComparisonPanel(60000);
        setTimeout(()=> initBudgetSlider(), 50);
      }

      if(!rendered && compareStatuts.length>=2){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title"><i class="fas fa-info-circle"></i> Résumé</div>
            <div>Vous comparez <strong>${compareStatuts.map(s=>escapeHTML(s)).join(' vs ')}</strong>. Les colonnes affichées ci-dessous sont limitées aux différences pour gagner du temps.</div>
          </div>`;
      }
    }

    function renderCostComparisonPanel(budget){
      budget = budget || 60000;
      const has = x => compareStatuts.includes(x);
      const tnsLabel = has('EURL') ? 'EURL (TNS)' : has('SARL') ? 'SARL (TNS)' : 'Micro';
      const asLabel  = has('SASU') ? 'SASU' : 'SAS';
      const isMicro  = !has('EURL') && !has('SARL') && has('MICRO');
      // TNS
      const tnsRate = isMicro ? 0.22 : 0.30;
      const tnsCot = Math.round(budget * tnsRate);
      const tnsNet = budget - tnsCot;
      const tnsNetMois = Math.round(tnsNet / 12);
      // Assimilé salarié
      const asBrut = Math.round(budget / 1.55);
      const asCotPatron = Math.round(asBrut * 0.55);
      const asCotSalarie = Math.round(asBrut * 0.22);
      const asNet = asBrut - asCotSalarie;
      const asNetMois = Math.round(asNet / 12);
      const ecartMois = tnsNetMois - asNetMois;

      return `
      <div class="advice-card" id="cost-comparison-panel" style="border-color:rgba(139,92,246,.3);background:rgba(139,92,246,.05)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div class="title" style="color:#A78BFA;margin:0"><i class="fas fa-calculator"></i> Exemple chiffré — même budget de <span id="budget-display">${fmtEuro(budget)}</span></div>
          <div style="display:flex;align-items:center;gap:8px;min-width:200px;flex:1;max-width:300px">
            <small style="color:${TOKENS.text.muted};white-space:nowrap">20k</small>
            <input type="range" id="budget-slider" min="20000" max="150000" step="5000" value="${budget}" style="flex:1;accent-color:#A78BFA;height:6px;cursor:pointer">
            <small style="color:${TOKENS.text.muted};white-space:nowrap">150k</small>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0">
          <div style="padding:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px">
            <div style="font-weight:700;color:${TOKENS.semantic.success};margin-bottom:8px;font-size:.9rem">${escapeHTML(tnsLabel)}</div>
            <table style="width:100%;font-size:.82rem;line-height:1.6">
              <tr><td style="color:${TOKENS.text.secondary}">Budget entreprise</td><td style="text-align:right;font-weight:600">${fmtEuro(budget)}</td></tr>
              <tr><td style="color:${TOKENS.text.secondary}">Cotisations (~${Math.round(tnsRate*100)}%)</td><td style="text-align:right;color:${TOKENS.semantic.danger}">-${fmtEuro(tnsCot)}</td></tr>
              <tr style="border-top:1px solid rgba(255,255,255,.1)"><td style="font-weight:700">Net en poche/an</td><td style="text-align:right;font-weight:700;color:${TOKENS.semantic.success}">${fmtEuro(tnsNet)}</td></tr>
              <tr><td style="font-weight:600">Net/mois</td><td style="text-align:right;font-weight:700;font-size:.95rem;color:${TOKENS.semantic.success}">${fmtEuro(tnsNetMois)}</td></tr>
            </table>
          </div>

          <div style="padding:12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px">
            <div style="font-weight:700;color:${TOKENS.semantic.warning};margin-bottom:8px;font-size:.9rem">${escapeHTML(asLabel)} (assimilé salarié)</div>
            <table style="width:100%;font-size:.82rem;line-height:1.6">
              <tr><td style="color:${TOKENS.text.secondary}">Budget entreprise</td><td style="text-align:right;font-weight:600">${fmtEuro(budget)}</td></tr>
              <tr><td style="color:${TOKENS.text.secondary}">Charges patron. (~55%)</td><td style="text-align:right;color:${TOKENS.semantic.danger}">-${fmtEuro(asCotPatron)}</td></tr>
              <tr><td style="color:${TOKENS.text.secondary}">Charges salar. (~22%)</td><td style="text-align:right;color:${TOKENS.semantic.danger}">-${fmtEuro(asCotSalarie)}</td></tr>
              <tr style="border-top:1px solid rgba(255,255,255,.1)"><td style="font-weight:700">Net en poche/an</td><td style="text-align:right;font-weight:700;color:${TOKENS.semantic.warning}">${fmtEuro(asNet)}</td></tr>
              <tr><td style="font-weight:600">Net/mois</td><td style="text-align:right;font-weight:700;font-size:.95rem;color:${TOKENS.semantic.warning}">${fmtEuro(asNetMois)}</td></tr>
            </table>
          </div>
        </div>

        <div style="text-align:center;padding:8px;background:rgba(255,255,255,.03);border-radius:6px;margin-bottom:12px">
          <span style="font-size:.85rem;color:${TOKENS.text.secondary}">Écart net : </span>
          <strong style="color:${TOKENS.accent};font-size:1.1rem">+${fmtEuro(ecartMois)}/mois</strong>
          <span style="font-size:.85rem;color:${TOKENS.text.secondary}"> en ${escapeHTML(tnsLabel)}</span>
        </div>

        <div style="font-weight:700;color:${TOKENS.text.primary};margin-bottom:8px;font-size:.85rem"><i class="fas fa-balance-scale" style="margin-right:6px;color:#A78BFA"></i>Mais le surcoût ${escapeHTML(asLabel)} achète :</div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:.78rem">
          <div style="padding:8px;background:rgba(1,42,74,.4);border-radius:6px;text-align:center">
            <div style="font-size:1.3rem;margin-bottom:4px">🏥</div>
            <div style="font-weight:600;color:${TOKENS.text.primary}">Maladie</div>
            <div style="color:${TOKENS.semantic.success};font-weight:600">0j de carence</div>
            <div style="color:${TOKENS.text.muted};font-size:.72rem">${escapeHTML(tnsLabel)} : 3j de carence</div>
          </div>
          <div style="padding:8px;background:rgba(1,42,74,.4);border-radius:6px;text-align:center">
            <div style="font-size:1.3rem;margin-bottom:4px">👴</div>
            <div style="font-weight:600;color:${TOKENS.text.primary}">Retraite</div>
            <div style="color:${TOKENS.semantic.success};font-weight:600">AGIRC-ARRCO</div>
            <div style="color:${TOKENS.text.muted};font-size:.72rem">${escapeHTML(tnsLabel)} : retraite SSI basique</div>
          </div>
          <div style="padding:8px;background:rgba(1,42,74,.4);border-radius:6px;text-align:center">
            <div style="font-size:1.3rem;margin-bottom:4px">🛡️</div>
            <div style="font-weight:600;color:${TOKENS.text.primary}">Prévoyance</div>
            <div style="color:${TOKENS.semantic.success};font-weight:600">Régime général</div>
            <div style="color:${TOKENS.text.muted};font-size:.72rem">${escapeHTML(tnsLabel)} : basique SSI</div>
          </div>
        </div>

        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
          <div style="padding:8px;background:rgba(1,42,74,.4);border-radius:6px">
            <div style="font-weight:600;color:${TOKENS.text.primary};margin-bottom:4px">📊 Retraite estimée (après 42 ans de cotisation)</div>
            <div><span style="color:${TOKENS.semantic.success};font-weight:600">${escapeHTML(tnsLabel)} :</span> ~${fmtEuro(Math.round(770 * budget / 60000))}/mois <small style="color:${TOKENS.text.muted}">(base + SSI complémentaire faible)</small></div>
            <div><span style="color:${TOKENS.semantic.warning};font-weight:600">${escapeHTML(asLabel)} :</span> ~${fmtEuro(Math.round(1420 * budget / 60000))}/mois <small style="color:${TOKENS.text.muted}">(base + AGIRC-ARRCO)</small></div>
            <div style="color:${TOKENS.accent};font-weight:600;margin-top:4px">→ +${fmtEuro(Math.round(650 * budget / 60000))}/mois de retraite en ${escapeHTML(asLabel)}</div>
          </div>
          <div style="padding:8px;background:rgba(1,42,74,.4);border-radius:6px">
            <div style="font-weight:600;color:${TOKENS.text.primary};margin-bottom:4px">💡 Alternative courante</div>
            <div style="color:${TOKENS.text.secondary};line-height:1.5">${escapeHTML(tnsLabel)} + <strong>contrat Madelin</strong> (~300 €/mois) = couverture comparable à ${escapeHTML(asLabel)} mais <strong style="color:${TOKENS.accent}">~200 €/mois moins cher</strong> + fiscalement déductible.</div>
          </div>
        </div>

        <div style="margin-top:10px;font-size:.72rem;color:${TOKENS.text.muted};font-style:italic">
          <i class="fas fa-info-circle" style="margin-right:4px"></i>
          Simulation indicative pour un budget rémunération de ${fmtEuro(budget)}/an. Ni l'un ni l'autre ne donne droit à l'assurance chômage. Consultez un expert-comptable pour votre situation.
        </div>
      </div>`;
    }

    function initBudgetSlider(){
      const panel = document.getElementById('cost-comparison-panel');
      if(!panel) return;
      const slider = panel.querySelector('#budget-slider');
      const display = panel.querySelector('#budget-display');
      if(!slider) return;

      // Live update label while dragging
      slider.addEventListener('input', function(){
        if(display) display.textContent = parseInt(slider.value).toLocaleString('fr-FR') + ' €';
      });

      // Full recalculate on release
      slider.addEventListener('change', function(){
        const val = parseInt(slider.value);
        if(!val || val < 10000) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = renderCostComparisonPanel(val);
        const newPanel = tmp.firstElementChild;
        panel.replaceWith(newPanel);
        const newSlider = newPanel.querySelector('#budget-slider');
        if(newSlider) newSlider.value = val;
        initBudgetSlider();
      });
    }

    function renderPersonaAdvice(){
      const host=$('#persona-advice'); if(!host) return; host.innerHTML='';
      const has=x=>compareStatuts.includes(x);
      if(intentAnswers.en_chomage && intentAnswers.eviter_salaire && (has('EURL')||has('SASU'))){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title"><i class="fas fa-compass"></i> Cas type — Freelance au chômage qui veut préserver l'ARE (sans se verser de salaire)</div>
            <ul style="padding-left:18px;margin:0">
              <li><strong>SASU:</strong> versement de dividendes non pris en compte par l'ARE ⇒ pas d'impact tant que vous ne prenez pas de salaire.</li>
              <li><strong>EURL:</strong> dividendes >10% soumis aux cotisations TNS; fiscalement possible, mais socialement moins optimisé si l'objectif est l'ARE.</li>
            </ul>
            <div class="arbitrage">Astuce: vous pouvez démarrer en SASU, puis basculer vers SAS lors de l'arrivée d'associés.</div>
          </div>`;
        return;
      }
      if(!intentAnswers.en_chomage && intentAnswers.veut_dividendes && !intentAnswers.eviter_salaire && has('MICRO') && (has('EURL')||has('SASU'))){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title"><i class="fas fa-compass"></i> Cas type — Consultant solo : Micro vs Société</div>
            <ul style="padding-left:18px;margin:0">
              <li><strong>Micro :</strong> zéro formalité, cotisations sur le CA (12,3–25,6%). Idéal si peu de frais et CA sous les plafonds.</li>
              <li><strong>EURL (IS) :</strong> cotisations TNS (~30%) sur la rémunération + dividendes possibles (>10% cotisés). Permet la déduction des frais réels.</li>
              <li><strong>SASU :</strong> dividendes non cotisés (PFU 31,4%) mais charges salariales élevées (~55-77%) si salaire. Idéal si vous voulez capitaliser en société.</li>
            </ul>
            <div class="arbitrage">Règle simple : CA < 40 000 € avec peu de frais → Micro. CA > 40 000 € avec frais réels → EURL ou SASU selon priorité (charges basses vs dividendes).</div>
          </div>`;
        return;
      }
      if(intentAnswers.levee_fonds==='oui'){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title"><i class="fas fa-compass"></i> Cas type — Startup qui prévoit de lever des fonds</div>
            <ul style="padding-left:18px;margin:0">
              <li><strong>SAS/SASU</strong> recommandée: gouvernance souple, BSPCE, actions de préférence, entrée d'investisseurs simple.</li>
              <li><strong>SARL/EURL:</strong> possible mais moins fluide (agréments, parts sociales, options complexes).</li>
            </ul>
          </div>`;
        return;
      }
      if(compareStatuts.length>=2){
        host.innerHTML = `
          <div class="advice-card">
            <div class="title"><i class="fas fa-info-circle"></i> Résumé</div>
            <div>Vous comparez <strong>${compareStatuts.map(s=>escapeHTML(s)).join(' vs ')}</strong>. Les colonnes affichées ci-dessous sont limitées aux différences pour gagner du temps.</div>
          </div>`;
      }
    }

    function loadStatutData(){
      if(window.legalStatuses){ renderTable(window.legalStatuses); }
      else {
        setTimeout(()=>{ if(window.legalStatuses){ renderTable(window.legalStatuses); } else { const body=$('#table-body'); body.innerHTML=`<tr><td colspan="10"><div class="loading-state"><p style="color:${TOKENS.semantic.danger};"><i class="fas fa-exclamation-triangle"></i> Impossible de charger les données.</p><button type="button" id="retry-load" style="min-height:44px;padding:.5rem 1rem;background:rgba(0,255,135,.2);border:1px solid ${TOKENS.accent};color:${TOKENS.accent};border-radius:${TOKENS.radius.sm}px;cursor:pointer;margin-top:.5rem;">Réessayer</button></div></td></tr>`; $('#retry-load').addEventListener('click',loadStatutData); } }, 500);
      }
      window.addEventListener('legalStatuses:ready',()=>renderTable(window.legalStatuses),{ once:true });
    }

    function getColumnsForCriterion(criterion){
      switch(criterion){
        case 'basic': return [
          {key:'name',label:'Statut'},
          {key:'associes',label:'Associés'},
          {key:'capital',label:'Capital'},
          {key:'responsabilite',label:'Responsabilité'},
          {key:'activite',label:'Activités'}
        ];
        case 'fiscal': return [
          {key:'name',label:'Statut'},
          {key:'fiscalite',label:'Régime fiscal'},
          {key:'fiscaliteOption',label:'Option IR/IS'},
          {key:'dividendes',label:'Dividendes'},
          {key:'regimeTVA',label:'TVA'}
        ];
        case 'social': return [
          {key:'name',label:'Statut'},
          {key:'statutDirigeant',label:'Dirigeant'},
          {key:'chargesSociales',label:'Charges & couverture'},
          {key:'are',label:'ARE'}
        ];
        case 'creation': return [
          {key:'name',label:'Statut'},
          {key:'formalites',label:'Formalités'},
          {key:'plafondCA',label:'Plafond CA'},
          {key:'obligationsCle',label:'Obligations'}
        ];
        default: return [
          {key:'name',label:'Statut'},
          {key:'associes',label:'Associés'},
          {key:'capital',label:'Capital'},
          {key:'responsabilite',label:'Responsabilité'},
          {key:'fiscalite',label:'Fiscalité'},
          {key:'dividendes',label:'Dividendes'},
          {key:'regimeSocial',label:'Social'},
          {key:'are',label:'ARE'}
        ];
      }
    }

    function filterStatuts(statuts, term){
      let list = Object.values(statuts);
      
      const selected = new Set(compareStatuts.map(s => s.toUpperCase()));
      if (selected.size > 0) {
        list = list.filter(s => selected.has((s.shortName||'').toUpperCase()));
        list = list.map(s => enrichForDisplay(s, intentAnswers));
      } else {
        if (term) {
          const tt = term.toLowerCase();
          list = list.filter(s =>
            (s.name||'').toLowerCase().includes(tt) ||
            (s.shortName||'').toLowerCase().includes(tt) ||
            (s.description||'').toLowerCase().includes(tt)
          );
        }
        list = list.map(s => enrichForDisplay(s, intentAnswers))
                   .filter(s => matchIntent(s, intentAnswers));
      }
      
      const anyIntent = intentAnswers.veut_dividendes||intentAnswers.en_chomage||
                        intentAnswers.prevoit_associes==='oui'||intentAnswers.levee_fonds==='oui';
      if(anyIntent && selected.size===0) list.sort((a,b)=>(b._score||0)-(a._score||0));
      return list;
    }

    function updateTable(){
      if(!window.legalStatuses) return;
      let columns=getColumnsForCriterion(selectedCriterion);
      const rowsData=filterStatuts(window.legalStatuses, searchTerm);

      const impactHost = $('#impact-recommendations');
      if(impactHost){
        const impact = renderIntentImpactBar(intentAnswers);
        impactHost.innerHTML = impact;
      }

      const suggestionHost = $('#suggestion-bar');
      if(suggestionHost){
        if(compareStatuts.length===1 && rowsData.length>=2){
          const ranked = [...rowsData].sort((a,b)=>(b._score||0)-(a._score||0));
          const alt = ranked[1];
          suggestionHost.innerHTML = renderAlternativeSuggestion(compareStatuts[0], alt);
          const suggestBtn = $('#suggest-compare-btn');
          if(suggestBtn){
            suggestBtn.addEventListener('click', ()=>{
              const statuts = suggestBtn.getAttribute('data-compare').split(',');
              compareStatuts = statuts;
              updateComparisonBar();
              updateTable();
              renderPersonaAdvice();
              persistStateToURL();
              updateMobileCTA(); // P0
            });
          }
        } else {
          suggestionHost.innerHTML = '';
        }
      }

      let diffKeys=[]; 
      let applyDiff=false;

      if(compareStatuts.length>=2 && rowsData.length>=2){
        diffKeys = onlyDifferences(rowsData, columns);
        lastDiffCount = diffKeys.length || 0; // P0: Track for mobile CTA
        
        if(onlyDiffSwitch && diffKeys.length){
          columns = [{key:'name', label:'Statut'}, ...columns.filter(c => diffKeys.includes(c.key))];
          applyDiff = true;
        }
      }

      const th=$('#table-headers'); 
      th.innerHTML = columns.map((c,i)=>`<th${i>0 && applyDiff?' class="diff-col"':''}>${escapeHTML(c.label)}</th>`).join('');

      const countEl=$('#column-count');
      if(applyDiff && diffKeys.length>0){
        countEl.innerHTML = `<strong>${diffKeys.length}</strong> colonne${diffKeys.length>1?'s':''} affichée${diffKeys.length>1?'s':''} (différences)`;
      } else {
        countEl.innerHTML = `<strong>${columns.length-1}</strong> colonne${columns.length-1>1?'s':''} affichée${columns.length-1>1?'s':''}`;
      }

      const tableWrap = document.querySelector('.comparatif-table-container');
      const existingCards = document.querySelector('.cards-mobile');
      if(existingCards) existingCards.remove();
      
      // P0: Mobile cards with checkbox + selected state
      if(isMobile && tableWrap && rowsData.length>0){
        const mobileHost = document.createElement('div');
        mobileHost.className = 'cards-mobile';
        mobileHost.innerHTML = rowsData.map(st => `
          <div class="card" data-statut="${escapeHTML(st.shortName)}" role="button" tabindex="0" aria-pressed="${compareStatuts.includes(st.shortName)?'true':'false'}">
            <div class="card-checkbox"><i class="fas fa-check-circle"></i></div>
            <h4>${renderStatutName(st)}</h4>
            <div style="opacity:.75;margin-bottom:8px">${toHTML(st.name)}</div>
            <ul>
              <li><strong>Fiscalité :</strong> ${toHTML(st.fiscalite)}</li>
              <li><strong>Social :</strong> ${toHTML(st.regimeSocial)}</li>
              <li><strong>Dividendes :</strong> ${renderDividendRule(st)}</li>
              <li><strong>Resp. :</strong> ${renderResponsabilite(st)}</li>
            </ul>
          </div>
        `).join('');
        tableWrap.parentNode.insertBefore(mobileHost, tableWrap);
        
        // P0: Toggle selection on click + visual feedback
        mobileHost.querySelectorAll('.card').forEach(card=>{
          const sn = card.getAttribute('data-statut');
          if(compareStatuts.includes(sn)) card.classList.add('selected');
          
          const toggleCard = ()=>{
            const already = compareStatuts.includes(sn);
            if(already){
              removeFromComparison(sn);
              card.classList.remove('selected');
              card.setAttribute('aria-pressed', 'false');
            } else {
              addToComparison(sn);
              card.classList.add('selected');
              card.setAttribute('aria-pressed', 'true');
            }
          };
          
          card.addEventListener('click', toggleCard);
          card.addEventListener('keydown', (e)=>{
            if(e.key==='Enter' || e.key===' '){
              e.preventDefault();
              toggleCard();
            }
          });
        });
      }

      const body=$('#table-body');
      
      if(rowsData.length===0){ 
        body.innerHTML = `
          <tr>
            <td colspan="${columns.length}">
              <div class="empty">
                <p><i class="fas fa-search"></i> Aucun statut ne correspond à votre recherche.</p>
                <div class="quick">
                  <button type="button" class="preset-btn" data-preset="EURL,SASU">Essayer EURL ↔ SASU</button>
                  <button type="button" class="preset-btn" data-preset="SAS,SARL">Essayer SAS ↔ SARL</button>
                  <button type="button" class="preset-btn" data-preset="MICRO,EI">Essayer MICRO ↔ EI</button>
                </div>
              </div>
            </td>
          </tr>`;
        body.querySelectorAll('.preset-btn').forEach(b=>{
          b.addEventListener('click', ()=>{
            const [a,bis]=b.getAttribute('data-preset').split(',');
            compareStatuts=[resolveStatutKey(a), resolveStatutKey(bis)];
            updateComparisonBar(); updateTable(); renderPersonaAdvice(); persistStateToURL(); updateMobileCTA(); // P0
          });
        });
        return; 
      }

      function genBadges(st){
        const badges=[]; const meta=st.meta_payout||{};
        if(meta.peut_dividendes && meta.dividendes_cot_sociales==='non'){ badges.push('<span class="status-badge badge-dividends">Div. sans cotis</span>'); }
        if(intentAnswers.en_chomage && st.meta_are?.are_compatible_sans_salaire) badges.push('<span class="status-badge badge-are">ARE ok</span>');
        if(st.meta_evolution?.accueil_investisseurs==='élevé') badges.push('<span class="status-badge badge-investors">Investisseurs</span>');
        return badges.slice(0,3).join('');
      }

      body.innerHTML = rowsData.map((st,i)=>{
        const selCls = compareStatuts.includes(st.shortName) ? ' class="is-selected"' : '';
        let row=`<tr${selCls} style="animation-delay:${i*0.04}s;" data-statut="${escapeHTML(st.shortName)}">`;
        columns.forEach((col,idx)=>{
          const diffClass = idx>0 && applyDiff?' diff-col':'';
          if(col.key==='name'){
            row+=`<td><div class="statut-cell"><div class="statut-icon"><i class="fas ${st.logo||'fa-building'}"></i></div><div class="statut-info"><div class="statut-name">${renderStatutName(st)}</div><div class="statut-fullname">${escapeHTML(st.name)}</div><div class="status-badges">${genBadges(st)}</div></div></div></td>`;
          } else if(col.key==='responsabilite'){
            row+=`<td class="${diffClass}">${renderResponsabilite(st)}</td>`;
          } else if(col.key==='capital'){
            row+=`<td class="${diffClass}">${renderCapital(st)}</td>`;
          } else if(col.key==='dividendes'){
            row+=`<td class="${diffClass}">${renderDividendRule(st)}</td>`;
          } else if(col.key==='are'){
            row+=`<td class="${diffClass}">${renderARE(st)}</td>`;
          } else if(col.key==='chargesSociales'){
            row+=`<td class="${diffClass}">${renderChargesSynthese(st)}</td>`;
          } else if(col.key==='statutDirigeant'){
            row+=`<td class="${diffClass}">${renderStatutDirigeant(st)}</td>`;
          } else if(col.key==='fiscaliteOption'){
            row+=`<td class="${diffClass}">${renderWithTooltip(st[col.key], 80)}</td>`;
          } else {
            row+=`<td class="${diffClass}">${toHTML(st[col.key])}</td>`;
          }
        });
        row+='</tr>'; return row;
      }).join('');

      $$('#table-body tr').forEach(row=>{ row.addEventListener('click',()=>{ const sn=row.getAttribute('data-statut'); if(sn) addToComparison(sn); }); });
      
      updateMobileCTA(); // P0: Update CTA after table render
    }

    function renderTable(data){ updateTable(); }
  };
})();
