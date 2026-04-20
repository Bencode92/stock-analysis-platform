/**
 * pov-onboarding.js — Point Of View Onboarding
 *
 * Écran d'accueil adaptatif : identifie le profil utilisateur avant le wizard.
 * 3 questions : Pour qui je simule ? / Objectif principal ? / Mode détaillé ou rapide ?
 *
 * → Auto-applique un preset famille pertinent
 * → Auto-active l'objectif correspondant
 * → Active mode estimation si "Simulation rapide"
 * → Adapte le wording via i18n-pov.js (event 'pov:ready')
 *
 * State externe : window.__POV__ + localStorage ('sd_pov_v1')
 * Non-destructif : si l'utilisateur ferme l'overlay, l'app fonctionne comme avant.
 *
 * @version 1.0.0 — 2026-04-20
 */
const POVOnboarding = (function() {
    'use strict';

    const STORAGE_KEY = 'sd_pov_v1';

    let povState = {
        pov: null,            // 'self' | 'child' | 'grandchild' | 'spouse' | 'pro'
        objectif: null,       // voir OBJECTIFS_BY_POV
        mode: null,           // 'quick' | 'full'
        userPersonId: null,   // id de la personne "je" dans l'arbre (calculé à la volée)
        isEstimation: false,
        completed: false,
        ts: null
    };

    // ============================================================
    // OBJECTIFS adaptés par POV
    // ============================================================
    const OBJECTIFS_BY_POV = {
        self: [
            { key: 'minimiser',   emoji: '💰', title: 'Minimiser les droits',          desc: 'Optimiser fiscalement ma transmission' },
            { key: 'conjoint',    emoji: '💑', title: 'Protéger mon conjoint',         desc: 'Lui assurer revenus + logement' },
            { key: 'entreprise',  emoji: '🏢', title: 'Transmettre mon entreprise',    desc: 'Pacte Dutreil, continuité activité' },
            { key: 'revenus',     emoji: '💶', title: 'Conserver mes revenus',         desc: 'Démembrement, garder l\'usufruit' }
        ],
        child: [
            { key: 'anticiper',   emoji: '📋', title: 'Anticiper leur succession',    desc: 'Préparer la transmission avec eux' },
            { key: 'minimiser',   emoji: '💰', title: 'Réduire les droits à payer',   desc: 'Optimiser avant leur décès' },
            { key: 'proteger',    emoji: '🛡️', title: 'Protéger le parent survivant',desc: 'Anticiper le veuvage' },
            { key: 'equite',      emoji: '⚖️', title: 'Équité entre enfants',         desc: 'Éviter les conflits' }
        ],
        grandchild: [
            { key: 'heritage',    emoji: '🎁', title: 'Comprendre ce que je recevrai', desc: 'Évaluer mon héritage futur' },
            { key: 'optim_gp',    emoji: '💡', title: 'Aider mes GP à optimiser',      desc: 'Donation directe, génération sautée' },
            { key: 'accepter',    emoji: '🤔', title: 'Accepter ou renoncer ?',        desc: 'Décider en connaissance de cause' }
        ],
        spouse: [
            { key: 'liquidation', emoji: '📑', title: 'Liquider la succession',       desc: 'Évaluer les droits à payer' },
            { key: 'partage',     emoji: '🔀', title: 'Partager avec les enfants',    desc: 'Organiser la dévolution' },
            { key: 'fiscalite',   emoji: '💸', title: 'Optimiser la fiscalité',       desc: 'AV, démembrement du conjoint' }
        ],
        pro: [
            { key: 'client_succ', emoji: '📊', title: 'Simuler pour un client',        desc: 'Mode multi-dossiers à venir' }
        ]
    };

    // Mapping POV → preset famille par défaut (clé utilisée par SD.applyFamilyPreset si dispo)
    const PRESET_BY_POV = {
        self:       'couple_2enfants',
        child:      'couple_3enfants',
        grandchild: 'gp_parents_enfants',
        spouse:     'couple_2enfants',
        pro:        null
    };

    // ============================================================
    // DÉFINITION INLINE des presets (bypass de SD.applyFamilyPreset)
    // ============================================================
    // Ces builders sont identiques à ceux de successions-donations.js
    // mais appelés directement ici pour éviter toute dépendance silencieuse.
    const PRESET_BUILDERS = {
        couple_2enfants: function(FG) {
            const m  = FG.addPerson('Mère', 55, 200000);
            const p  = FG.addPerson('Père', 58, 200000);
            const e1 = FG.addPerson('Enfant 1', 25);
            const e2 = FG.addPerson('Enfant 2', 22);
            FG.addRelation('spouse', m.id, p.id);
            [e1, e2].forEach(function(e) {
                FG.addRelation('parent', m.id, e.id);
                FG.addRelation('parent', p.id, e.id);
            });
            m.isDonor = true; p.isDonor = true;
            e1.isBeneficiary = true; e2.isBeneficiary = true;
        },
        couple_3enfants: function(FG) {
            const m  = FG.addPerson('Mère', 55, 200000);
            const p  = FG.addPerson('Père', 58, 200000);
            const e1 = FG.addPerson('Enfant 1', 28);
            const e2 = FG.addPerson('Enfant 2', 25);
            const e3 = FG.addPerson('Enfant 3', 22);
            FG.addRelation('spouse', m.id, p.id);
            [e1, e2, e3].forEach(function(e) {
                FG.addRelation('parent', m.id, e.id);
                FG.addRelation('parent', p.id, e.id);
            });
            m.isDonor = true; p.isDonor = true;
            e1.isBeneficiary = true; e2.isBeneficiary = true; e3.isBeneficiary = true;
        },
        gp_parents_enfants: function(FG) {
            const gm = FG.addPerson('Grand-mère', 78, 150000);
            const gp = FG.addPerson('Grand-père', 80, 150000);
            const m  = FG.addPerson('Mère', 55, 200000);
            const p  = FG.addPerson('Père', 58, 200000);
            const e1 = FG.addPerson('Enfant 1', 28);
            const e2 = FG.addPerson('Enfant 2', 25);
            FG.addRelation('spouse', gm.id, gp.id);
            FG.addRelation('parent', gm.id, m.id);
            FG.addRelation('parent', gp.id, m.id);
            FG.addRelation('spouse', m.id, p.id);
            [e1, e2].forEach(function(e) {
                FG.addRelation('parent', m.id, e.id);
                FG.addRelation('parent', p.id, e.id);
            });
            gm.isDonor = true; gp.isDonor = true; m.isDonor = true; p.isDonor = true;
            e1.isBeneficiary = true; e2.isBeneficiary = true;
        }
    };

    // Mapping objectif → switch UI à activer
    const OBJ_SWITCH_MAP = {
        minimiser:   'obj-minimiser',
        conjoint:    'obj-conjoint',
        proteger:    'obj-conjoint',
        revenus:     'obj-revenus',
        equite:      'obj-egalite',
        heritage:    'obj-generation',
        optim_gp:    'obj-generation',
        anticiper:   'obj-minimiser',
        entreprise:  'obj-minimiser'
    };

    // ============================================================
    // PERSISTENCE
    // ============================================================
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                Object.assign(povState, parsed);
            }
        } catch (e) { /* ignore */ }
    }

    function save() {
        try {
            povState.ts = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(povState));
        } catch (e) { /* quota/private mode */ }
    }

    // ============================================================
    // CSS injection (self-contained, pas de pollution du HTML)
    // ============================================================
    function injectStyles() {
        if (document.getElementById('pov-styles')) return;
        const css = `
.pov-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(10, 8, 5, 0.88); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    animation: povFadeIn .35s ease-out;
    overflow-y: auto; padding: 32px 16px;
}
@keyframes povFadeIn { from{opacity:0} to{opacity:1} }
.pov-modal {
    background: linear-gradient(145deg, rgba(51,44,32,0.98), rgba(40,34,25,0.98));
    border: 1px solid rgba(198,134,66,0.28);
    border-radius: 24px; padding: 40px 36px 32px;
    max-width: 760px; width: 100%;
    box-shadow: 0 25px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(198,134,66,0.08);
    position: relative; color: var(--text-primary, #fff);
    animation: povSlideUp .45s cubic-bezier(.2,.9,.3,1.1);
}
@keyframes povSlideUp { from{opacity:0;transform:translateY(40px) scale(.96)} to{opacity:1;transform:translateY(0) scale(1)} }
.pov-close {
    position: absolute; top: 16px; right: 16px;
    width: 36px; height: 36px; border-radius: 50%;
    border: 1px solid rgba(198,134,66,0.2); background: transparent;
    color: var(--text-muted, #8B9CB0); font-size: 1.2rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .2s;
}
.pov-close:hover { background: rgba(255,107,107,0.12); color: var(--accent-coral, #FF6B6B); border-color: rgba(255,107,107,0.3); }
.pov-progress { display: flex; justify-content: center; gap: 10px; margin-bottom: 28px; }
.pov-dot {
    width: 30px; height: 4px; border-radius: 4px;
    background: rgba(198,134,66,0.18); transition: all .3s;
}
.pov-dot.active { background: linear-gradient(90deg, var(--primary-color, #C68642), var(--primary-dark, #A66A2E)); width: 44px; box-shadow: 0 0 12px rgba(198,134,66,.4); }
.pov-dot.done { background: var(--accent-green, #10B981); }
.pov-step h2 {
    font-size: 1.5rem; font-weight: 800; margin-bottom: 8px;
    text-align: center; letter-spacing: -0.02em;
}
.pov-subtitle {
    font-size: .88rem; color: var(--text-muted, #8B9CB0);
    text-align: center; margin-bottom: 28px; line-height: 1.5;
}
.pov-choices {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.pov-choices.cols-1 { grid-template-columns: 1fr; }
.pov-choices.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
@media (max-width: 620px) { .pov-choices, .pov-choices.cols-3 { grid-template-columns: 1fr; } }
.pov-choice {
    display: flex; flex-direction: column; gap: 6px;
    padding: 18px 18px 16px; border-radius: 14px;
    border: 1px solid rgba(198,134,66,0.15);
    background: rgba(198,134,66,0.04);
    color: var(--text-primary, #fff);
    cursor: pointer; text-align: left; font-family: inherit;
    transition: all .22s ease;
    position: relative; overflow: hidden;
}
.pov-choice::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(198,134,66,0.08), transparent 60%);
    opacity: 0; transition: opacity .22s;
}
.pov-choice:hover {
    border-color: var(--primary-color, #C68642);
    background: rgba(198,134,66,0.08);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(198,134,66,0.18);
}
.pov-choice:hover::before { opacity: 1; }
.pov-choice.selected {
    border-color: var(--primary-color, #C68642);
    background: rgba(198,134,66,0.14);
    box-shadow: 0 0 0 2px rgba(198,134,66,0.35), 0 8px 24px rgba(198,134,66,0.22);
}
.pov-emoji { font-size: 1.8rem; line-height: 1; margin-bottom: 4px; }
.pov-title {
    font-size: .98rem; font-weight: 700;
    color: var(--text-primary, #fff);
}
.pov-desc {
    font-size: .76rem; color: var(--text-muted, #8B9CB0);
    line-height: 1.45;
}
.pov-back {
    position: absolute; top: 20px; left: 20px;
    padding: 6px 12px; border-radius: 8px;
    border: 1px solid rgba(198,134,66,0.2); background: transparent;
    color: var(--text-muted, #8B9CB0); font-size: .75rem; cursor: pointer;
    font-family: inherit; transition: all .2s;
}
.pov-back:hover { border-color: var(--primary-color, #C68642); color: var(--primary-color, #C68642); }
.pov-footer {
    margin-top: 28px; padding-top: 20px;
    border-top: 1px solid rgba(198,134,66,0.1);
    display: flex; justify-content: space-between; align-items: center;
    font-size: .72rem; color: var(--text-muted, #8B9CB0);
}
.pov-skip {
    background: none; border: none; color: var(--text-muted, #8B9CB0);
    font-size: .78rem; cursor: pointer; text-decoration: underline;
    font-family: inherit;
}
.pov-skip:hover { color: var(--primary-color, #C68642); }
.pov-tag {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    background: rgba(255,179,0,0.12); color: var(--accent-amber, #FFB300);
    font-size: .68rem; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase;
}
`;
        const style = document.createElement('style');
        style.id = 'pov-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // HTML BUILDERS
    // ============================================================
    function buildOverlayHTML() {
        return `
<div id="pov-overlay" class="pov-overlay" role="dialog" aria-modal="true" aria-labelledby="pov-title">
  <div class="pov-modal">
    <button class="pov-close" onclick="POVOnboarding.skip()" title="Passer l'onboarding" aria-label="Fermer">×</button>
    <div class="pov-progress">
      <span class="pov-dot active" data-dot="1"></span>
      <span class="pov-dot" data-dot="2"></span>
      <span class="pov-dot" data-dot="3"></span>
    </div>

    <div class="pov-step" id="pov-step-1">
      <h2 id="pov-title">👋 Pour qui simulez-vous ?</h2>
      <p class="pov-subtitle">Nous adaptons les questions et le vocabulaire à votre situation.</p>
      <div class="pov-choices">
        <button class="pov-choice" data-pov="self">
          <span class="pov-emoji">👤</span>
          <span class="pov-title">Pour moi-même</span>
          <span class="pov-desc">J'organise ma propre transmission patrimoniale.</span>
        </button>
        <button class="pov-choice" data-pov="child">
          <span class="pov-emoji">👨‍👩‍👦</span>
          <span class="pov-title">Pour mes parents</span>
          <span class="pov-desc">J'anticipe leur succession avec eux.</span>
        </button>
        <button class="pov-choice" data-pov="grandchild">
          <span class="pov-emoji">👴👵</span>
          <span class="pov-title">Pour mes grands-parents</span>
          <span class="pov-desc">Je veux comprendre ce que je pourrais recevoir.</span>
        </button>
        <button class="pov-choice" data-pov="spouse">
          <span class="pov-emoji">💔</span>
          <span class="pov-title">Conjoint / Proche décédé</span>
          <span class="pov-desc">Je liquide une succession en cours.</span>
        </button>
        <button class="pov-choice" data-pov="pro" style="grid-column: 1 / -1;">
          <span class="pov-emoji">💼</span>
          <span class="pov-title">Pour un client <span class="pov-tag">Pro</span></span>
          <span class="pov-desc">Mode CGP / notaire — multi-dossiers (à venir).</span>
        </button>
      </div>
    </div>

    <div class="pov-step" id="pov-step-2" style="display:none;">
      <button class="pov-back" onclick="POVOnboarding._goto(1)">← Retour</button>
      <h2 id="pov-step2-title">🎯 Votre objectif principal ?</h2>
      <p class="pov-subtitle" id="pov-step2-subtitle">Cela oriente les scénarios calculés.</p>
      <div class="pov-choices" id="pov-obj-choices"></div>
    </div>

    <div class="pov-step" id="pov-step-3" style="display:none;">
      <button class="pov-back" onclick="POVOnboarding._goto(2)">← Retour</button>
      <h2>⚙️ À quel niveau de détail ?</h2>
      <p class="pov-subtitle">Vous pourrez toujours affiner plus tard — c'est juste le point de départ.</p>
      <div class="pov-choices cols-1">
        <button class="pov-choice" data-mode="quick">
          <span class="pov-emoji">⚡</span>
          <span class="pov-title">Simulation rapide · ~3 min</span>
          <span class="pov-desc">Montants par fourchette (Faible / Moyen / Élevé…). Résultat indicatif, parfait si vous ne connaissez pas tous les chiffres.</span>
        </button>
        <button class="pov-choice" data-mode="full">
          <span class="pov-emoji">🎯</span>
          <span class="pov-title">Simulation précise · ~15 min</span>
          <span class="pov-desc">Saisie détaillée bien par bien. Résultat chiffré fiable, exportable pour un notaire.</span>
        </button>
      </div>
    </div>

    <div class="pov-footer">
      <span><i class="fas fa-lock" style="margin-right:6px;"></i> 100% local — aucune donnée envoyée</span>
      <button class="pov-skip" onclick="POVOnboarding.skip()">Passer cette étape</button>
    </div>
  </div>
</div>`;
    }

    function buildObjectifChoicesHTML(pov) {
        const objs = OBJECTIFS_BY_POV[pov] || OBJECTIFS_BY_POV.self;
        const cols = objs.length <= 2 ? 'cols-1' : (objs.length === 3 ? 'cols-3' : '');
        const html = objs.map(o => `
            <button class="pov-choice" data-obj="${o.key}">
              <span class="pov-emoji">${o.emoji}</span>
              <span class="pov-title">${o.title}</span>
              <span class="pov-desc">${o.desc}</span>
            </button>`).join('');
        const container = document.getElementById('pov-obj-choices');
        if (container) {
            container.className = 'pov-choices ' + cols;
            container.innerHTML = html;
            container.querySelectorAll('.pov-choice').forEach(btn => {
                btn.addEventListener('click', () => selectObjectif(btn.dataset.obj));
            });
        }
    }

    // ============================================================
    // HANDLERS
    // ============================================================
    function selectPOV(pov) {
        povState.pov = pov;
        markStepDone(1);
        _goto(2);
        // Sous-titre adapté
        const st = document.getElementById('pov-step2-subtitle');
        const subtitles = {
            self:       'Cela oriente les scénarios calculés pour vous.',
            child:      'Pour adapter les stratégies au patrimoine de vos parents.',
            grandchild: 'Pour évaluer votre situation d\'héritier potentiel.',
            spouse:     'Pour liquider correctement la succession en cours.',
            pro:        'Pour configurer le dossier client.'
        };
        if (st) st.textContent = subtitles[pov] || subtitles.self;
        buildObjectifChoicesHTML(pov);
        // Mode "pro" : skip étape objectif → va directement au mode
        if (pov === 'pro') {
            povState.objectif = 'client_succ';
            setTimeout(() => { markStepDone(2); _goto(3); }, 200);
        }
    }

    function selectObjectif(objKey) {
        povState.objectif = objKey;
        markStepDone(2);
        _goto(3);
    }

    function selectMode(mode) {
        povState.mode = mode;
        povState.isEstimation = (mode === 'quick');
        povState.completed = true;
        markStepDone(3);
        save();
        hide();
        applyPOVToApp();
    }

    function markStepDone(n) {
        const dot = document.querySelector(`.pov-dot[data-dot="${n}"]`);
        if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
    }

    function _goto(n) {
        for (let i = 1; i <= 3; i++) {
            const panel = document.getElementById('pov-step-' + i);
            if (panel) panel.style.display = (i === n) ? 'block' : 'none';
            const dot = document.querySelector(`.pov-dot[data-dot="${i}"]`);
            if (dot && i === n) { dot.classList.add('active'); }
            if (dot && i !== n && !dot.classList.contains('done')) { dot.classList.remove('active'); }
        }
    }

    // ============================================================
    // APPLICATION dans l'app existante — avec retry robuste
    // ============================================================
    function tryApplyFamilyPreset(preset, attempt) {
        attempt = attempt || 1;
        const maxAttempts = 25;
        const fgReady = typeof window.FamilyGraph !== 'undefined'
                        && typeof FamilyGraph.getPersons === 'function'
                        && typeof FamilyGraph.addPerson === 'function'
                        && typeof FamilyGraph.addRelation === 'function'
                        && typeof FamilyGraph.reset === 'function';
        const domReady = !!document.getElementById('family-persons-list');

        if (!fgReady || !domReady) {
            if (attempt >= maxAttempts) {
                console.warn('[POV] Abandon après ' + maxAttempts + ' tentatives — FamilyGraph/DOM indisponibles.');
                return false;
            }
            setTimeout(function() { tryApplyFamilyPreset(preset, attempt + 1); }, 150);
            return false;
        }

        // 1. Reset + build DIRECTEMENT via FamilyGraph (bypass SD.applyFamilyPreset)
        const builder = PRESET_BUILDERS[preset];
        if (!builder) {
            console.warn('[POV] preset inconnu : ' + preset);
            return false;
        }
        try {
            FamilyGraph.reset();
            builder(FamilyGraph);
        } catch (e) {
            console.error('[POV] builder a levé une erreur', e);
            return false;
        }

        const persons = FamilyGraph.getPersons();
        if (!persons || persons.length === 0) {
            console.warn('[POV] FamilyGraph vide après builder — retry', attempt);
            if (attempt < maxAttempts) {
                setTimeout(function() { tryApplyFamilyPreset(preset, attempt + 1); }, 150);
            }
            return false;
        }
        console.log('[POV] FamilyGraph chargé avec ' + persons.length + ' personnes.');

        // 2. Force render via SD (plusieurs chemins possibles)
        const renderPaths = [
            function() { if (typeof SD !== 'undefined' && SD.renderFamilyAll)  SD.renderFamilyAll(); },
            function() { if (typeof SD !== 'undefined' && SD.renderFamilyTree) SD.renderFamilyTree(); },
            function() { if (typeof SD !== 'undefined' && SD.renderFamilyPersons) SD.renderFamilyPersons(); },
            function() { if (typeof SD !== 'undefined' && SD.renderFamilyRoles) SD.renderFamilyRoles(); }
        ];
        let renderedOk = false;
        renderPaths.forEach(function(fn) {
            try { fn(); renderedOk = true; } catch (e) { /* ignore */ }
        });

        // 3. Sync vers PathOptimizer / step 2 si dispo
        try { if (typeof SD !== 'undefined' && SD.syncGraphToStep2) SD.syncGraphToStep2(); } catch (e) {}

        // 4. Update aside
        try { if (typeof SD !== 'undefined' && SD.updateAside) SD.updateAside(); } catch (e) {}

        // 5. Dernière chance : si le container est vide, re-render après un micro-delay
        setTimeout(function() {
            const cont = document.getElementById('family-persons-list');
            if (cont && !cont.innerHTML.trim()) {
                console.warn('[POV] container famille encore vide après render — retry render');
                try { if (typeof SD !== 'undefined' && SD.renderFamilyTree) SD.renderFamilyTree(); } catch (e) {}
            }
        }, 300);

        console.log('[POV] ✅ preset "' + preset + '" appliqué — ' + persons.length + ' personnes (renderedOk=' + renderedOk + ')');
        return true;
    }

    function applyPOVToApp() {
        console.log('[POV] applyPOVToApp démarre — pov=' + povState.pov + ' objectif=' + povState.objectif + ' mode=' + povState.mode);

        // 1. Appliquer un preset famille cohérent avec le POV (avec retry)
        const preset = PRESET_BY_POV[povState.pov];
        if (preset) {
            tryApplyFamilyPreset(preset);
        } else {
            console.log('[POV] pas de preset pour POV=' + povState.pov + ' (mode pro ?)');
        }

        // 2. Mode détail : quick → simplifie, full → détaillé — différé pour attendre SD
        setTimeout(() => {
            if (typeof window.SD !== 'undefined' && typeof SD.setDetailMode === 'function') {
                try { SD.setDetailMode(povState.mode === 'quick' ? 'simplifie' : 'detaille'); } catch (e) {}
            }
        }, 400);

        // 3. Activer le switch objectif correspondant (si présent dans l'UI)
        setTimeout(() => {
            const switchId = OBJ_SWITCH_MAP[povState.objectif];
            if (switchId) {
                const swEl = document.getElementById(switchId);
                if (swEl && !swEl.classList.contains('on')) {
                    // Utilise SD.toggleSwitch via un click simple (SD branche onclick sur l'élément)
                    try { swEl.click(); } catch (e) { swEl.classList.add('on'); }
                }
            }
        }, 500);

        // 4. Publier le POV pour les autres modules (i18n, estimation, results…)
        window.__POV__ = Object.assign({}, povState);
        document.dispatchEvent(new CustomEvent('pov:ready', { detail: window.__POV__ }));

        // 5. Badge header
        renderPOVBadge();
    }

    function renderPOVBadge() {
        if (!povState.completed) return;
        const header = document.querySelector('.page-header');
        if (!header || document.getElementById('pov-badge')) return;

        const labels = {
            self:       { icon: '👤',   text: 'Pour moi' },
            child:      { icon: '👨‍👩‍👦', text: 'Pour parents' },
            grandchild: { icon: '👴👵', text: 'Pour GP' },
            spouse:     { icon: '💔',   text: 'Liquidation' },
            pro:        { icon: '💼',   text: 'Mode Pro' }
        };
        const lbl = labels[povState.pov] || labels.self;
        const badge = document.createElement('button');
        badge.id = 'pov-badge';
        badge.title = 'Cliquer pour changer le point de vue';
        badge.style.cssText = 'margin-left:10px;padding:6px 12px;border-radius:20px;background:rgba(198,134,66,0.1);border:1px solid rgba(198,134,66,0.2);color:var(--primary-color,#C68642);font-size:.72rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;transition:all .2s;';
        badge.innerHTML = `<span>${lbl.icon}</span><span>${lbl.text}</span>`;
        badge.addEventListener('mouseover', () => { badge.style.background = 'rgba(198,134,66,0.18)'; });
        badge.addEventListener('mouseout',  () => { badge.style.background = 'rgba(198,134,66,0.1)'; });
        badge.addEventListener('click', () => reset());
        const h1 = header.querySelector('h1');
        if (h1) h1.appendChild(badge); else header.appendChild(badge);
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    function show() {
        if (document.getElementById('pov-overlay')) return;
        injectStyles();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildOverlayHTML();
        const overlay = wrapper.firstElementChild;
        document.body.appendChild(overlay);
        // Attach handlers
        overlay.querySelectorAll('[data-pov]').forEach(btn => {
            btn.addEventListener('click', () => selectPOV(btn.dataset.pov));
        });
        overlay.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => selectMode(btn.dataset.mode));
        });
        // ESC pour skip
        const escHandler = (e) => { if (e.key === 'Escape') { skip(); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);
    }

    function hide() {
        const ov = document.getElementById('pov-overlay');
        if (ov) ov.remove();
    }

    function skip() {
        povState.completed = true;
        povState.pov = povState.pov || 'self';
        povState.mode = povState.mode || 'full';
        save();
        hide();
        window.__POV__ = Object.assign({}, povState);
        document.dispatchEvent(new CustomEvent('pov:ready', { detail: window.__POV__ }));
        renderPOVBadge();
    }

    function reset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        povState = { pov: null, objectif: null, mode: null, userPersonId: null, isEstimation: false, completed: false, ts: null };
        const badge = document.getElementById('pov-badge');
        if (badge) badge.remove();
        show();
    }

    function getState()     { return Object.assign({}, povState); }
    function getPOV()       { return povState.pov; }
    function getObjectif()  { return povState.objectif; }
    function getMode()      { return povState.mode; }
    function isCompleted()  { return povState.completed; }
    function isEstimation() { return !!povState.isEstimation; }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        load();
        const start = () => {
            if (povState.completed) {
                // Reload : le state SD est vierge, il faut ré-appliquer le preset
                // pour que l'utilisateur retrouve son arbre famille préconfiguré.
                window.__POV__ = Object.assign({}, povState);
                setTimeout(() => {
                    console.log('[POV] reload — re-application POV=' + povState.pov);
                    applyPOVToApp();
                }, 600);
            } else {
                // Première visite : attendre 200ms que SD ait démarré pour éviter le flash
                setTimeout(show, 200);
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    }

    init();

    return {
        show, hide, skip, reset,
        getState, getPOV, getObjectif, getMode,
        isCompleted, isEstimation,
        _goto // exposé pour les boutons "retour"
    };
})();

if (typeof window !== 'undefined') window.POVOnboarding = POVOnboarding;
