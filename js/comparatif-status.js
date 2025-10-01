/**
 * comparatif-statuts.js - Tableau comparatif des formes juridiques
 * Version 2025 CLEAN - Sans simulateur, avec debugging amélioré
 */

// Fonction d'initialisation disponible globalement
window.initComparatifStatuts = function() {
    console.log("✅ Initialisation du tableau comparatif des statuts");
    window.createComparatifTable('comparatif-container');
};

// Encapsulation du reste du code dans une IIFE
(function() {
    // ========== MÉTAS FALLBACK ==========
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

    // ========== UTILITAIRES ==========
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
                    'Déclaration CA (URSSAF) mensuelle/trimestrielle',
                    'Livre des recettes',
                    'Franchise TVA par défaut',
                    'CFE (exonérée 1ʳᵉ année)',
                    'Compte pro si CA > 10k€ 2 ans'
                ].join(' · '),
                plafondCA: microPlaf,
                regimeTVA: tvaFr
            };
        }
        if (SN==='EURL') {
            return {
                obligationsCle: 'Compta engagement · AG < 6 mois · TVA réel ou franchise · Cotis TNS + div>10%'
            };
        }
        if (SN==='SASU') {
            return {
                obligationsCle: 'Compta engagement · Paie & DSN si rémunération · TVA réel ou franchise · Div non soumis cotis'
            };
        }
        return { obligationsCle: '' };
    }

    // ========== INTENT HELPERS ==========
    function parseAssociesMin(text) {
        if (!text) return 1;
        const t = String(text).toLowerCase();
        const nums = (t.match(/\d+/g) || []).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
        if (nums.length) return nums[0];
        return /\b2\+|plusieurs|deux\b/.test(t) ? 2 : 1;
    }

    function allowsMultipleAssociates(statut) {
        return parseAssociesMin(statut.associes) >= 2;
    }

    function hasISByDefault(statut) {
        const f = (statut.fiscalite || '').toLowerCase();
        return /\bis\b/.test(f) && !/\bir\b/.test(f);
    }

    function canOptIS(statut) {
        const opt = (statut.fiscaliteOption || '').toLowerCase();
        return /option|possible/.test(opt) && /\bis\b/.test(opt);
    }

    function canPayDividends(statut) {
        const meta = statut.meta_payout || {};
        if (meta.peut_dividendes) return true;
        if (hasISByDefault(statut)) return true;
        if (canOptIS(statut)) return true;
        return false;
    }

    function matchIntent(statut, ans) {
        if (ans.prevoit_associes === 'oui' && !allowsMultipleAssociates(statut)) return false;
        if (ans.veut_dividendes && !canPayDividends(statut)) return false;
        return true;
    }

    // ========== SCORING ==========
    function scoreStatut(statut, answers) {
        let s = 0;
        const why = [];
        const meta = statut.meta_payout || {};
        const areM = statut.meta_are || {};
        const evoM = statut.meta_evolution || {};

        if (answers.veut_dividendes && meta.peut_dividendes) {
            s += 3;
            if (meta.dividendes_cot_sociales === 'non') {
                s += 2;
                why.push('Dividendes sans cotis');
            } else if (meta.dividendes_cot_sociales === '>10%') {
                why.push('Dividendes >10% cotisés');
            }
        }

        if (answers.en_chomage && areM.are_compatible_sans_salaire) {
            s += 2;
            why.push('ARE compatible');
        }

        if (answers.prevoit_associes !== 'non') {
            if (evoM.entree_associes_facile) { s += 2; }
            else { s -= 1; why.push('Entrée associés encadrée'); }
        }

        if (answers.levee_fonds !== 'non') {
            const level = evoM.accueil_investisseurs;
            if (level === 'élevé') { s += 3; why.push('Investisseurs friendly'); }
            else if (level === 'moyen') { s += 1; }
            else { s -= 1; }
        }

        return { score: s, why: why.slice(0, 3) };
    }

    function onlyDifferences(rows, columns) {
        const keys = columns.map(c => c.key).filter(k => k !== 'name');
        return keys.filter(k => {
            const vals = rows.map(r => String(r[k] ?? '—').toLowerCase());
            return new Set(vals).size > 1;
        });
    }

    function enrichForDisplay(statut, answers = {}) {
        const derived = deriveObligations(statut.shortName || statut.name);
        const km = statut.key_metrics || {};
        const shortName = (statut.shortName || '').toUpperCase();
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

        if (Object.keys(answers).length > 0) {
            const scoring = scoreStatut(enriched, answers);
            enriched._score = scoring.score;
            enriched._why = scoring.why;
        }

        return enriched;
    }

    // ========== ENCART ARE/ARCE ==========
    function renderAREHelper(intentAnswers) {
        let host = document.getElementById('are-helper');
        if (!host) {
            host = document.createElement('div');
            host.id = 'are-helper';
            host.style.marginTop = '0.5rem';
            const header = document.querySelector('.comparatif-header');
            header && header.appendChild(host);
        }

        if (!intentAnswers.en_chomage) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }

        host.style.display = 'block';
        host.innerHTML = `
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

    // ========== INJECTION CSS ==========
    function injectCSS() {
        if (document.getElementById('comparatif-status-styles')) return; // Éviter double injection
        
        const style = document.createElement('style');
        style.id = 'comparatif-status-styles';
        style.textContent = `
            .comparatif-container { max-width: 100%; overflow-x: auto; font-family: 'Inter', sans-serif; color: #E6E6E6; }
            .comparatif-header { margin-bottom: 1.5rem; }
            .comparatif-title { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; color: #00FF87; }
            .comparatif-description { color: rgba(230, 230, 230, 0.8); margin-bottom: 1.5rem; line-height: 1.5; }
            
            .intent-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; padding: 1rem; background: rgba(1, 35, 65, 0.5); border-radius: 8px; border: 1px solid rgba(0, 255, 135, 0.2); }
            .intent-filter-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(1, 42, 74, 0.5); border-radius: 6px; cursor: pointer; transition: all 0.2s; }
            .intent-filter-item:hover { background: rgba(1, 42, 74, 0.8); }
            .intent-filter-item.active { background: rgba(0, 255, 135, 0.15); border: 1px solid rgba(0, 255, 135, 0.4); }
            .intent-filter-item input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #00FF87; }
            .intent-filter-item label { cursor: pointer; font-size: 0.875rem; user-select: none; }
            
            .status-badges { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
            .status-badge { display: inline-flex; align-items: center; padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; }
            .badge-salary { background: rgba(59, 130, 246, 0.2); color: #60A5FA; }
            .badge-dividends { background: rgba(236, 72, 153, 0.2); color: #EC4899; }
            .badge-are { background: rgba(16, 185, 129, 0.2); color: #10B981; }
            .badge-investors { background: rgba(245, 158, 11, 0.2); color: #F59E0B; }
            .badge-tns { background: rgba(139, 92, 246, 0.2); color: #A78BFA; }
            .badge-assimile { background: rgba(34, 211, 238, 0.2); color: #22D3EE; }
            
            .diff-mode-toggle { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(1, 42, 74, 0.5); border-radius: 6px; margin-bottom: 1rem; cursor: pointer; transition: all 0.2s; }
            .diff-mode-toggle:hover { background: rgba(1, 42, 74, 0.8); }
            .diff-mode-toggle.active { background: rgba(0, 255, 135, 0.15); border: 1px solid rgba(0, 255, 135, 0.4); }
            
            .status-why { font-size: 0.7rem; color: rgba(255, 255, 255, 0.6); margin-top: 0.25rem; font-style: italic; }
            
            .comparison-bar { display: flex; align-items: center; padding: 0.75rem 1rem; background-color: rgba(1, 35, 65, 0.7); border-radius: 8px; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
            .comparison-title { font-size: 0.875rem; font-weight: 500; color: rgba(255, 255, 255, 0.8); margin-right: 1rem; }
            .comparison-items { display: flex; flex-wrap: wrap; gap: 0.5rem; flex-grow: 1; }
            .comparison-item { display: flex; align-items: center; padding: 0.375rem 0.75rem; background-color: rgba(0, 255, 135, 0.15); border: 1px solid rgba(0, 255, 135, 0.3); border-radius: 4px; font-size: 0.8125rem; color: #00FF87; }
            .comparison-item .remove-btn { background: none; border: none; color: rgba(255, 255, 255, 0.6); font-size: 0.75rem; margin-left: 0.5rem; cursor: pointer; padding: 2px; }
            .comparison-item .remove-btn:hover { color: #FF6B6B; }
            
            .status-dropdown { margin-right: 0.5rem; width: 200px; padding: 0.5rem; background-color: rgba(1, 42, 74, 0.7); border: 1px solid rgba(0, 255, 135, 0.3); border-radius: 4px; color: #E6E6E6; }
            
            .comparatif-filters { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; align-items: flex-end; }
            .filter-group { flex: 1; min-width: 200px; }
            .filter-label { display: block; margin-bottom: 0.5rem; color: rgba(230, 230, 230, 0.7); font-size: 0.875rem; }
            .criteria-buttons { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; }
            .criteria-button { padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; background-color: rgba(1, 42, 74, 0.5); border: 1px solid rgba(0, 255, 135, 0.2); color: rgba(230, 230, 230, 0.8); transition: all 0.2s ease; }
            .criteria-button:hover { border-color: rgba(0, 255, 135, 0.4); background-color: rgba(1, 42, 74, 0.7); }
            .criteria-button.active { background-color: rgba(0, 255, 135, 0.15); border-color: rgba(0, 255, 135, 0.7); color: #00FF87; }
            
            .search-input { width: 100%; padding: 0.625rem 1rem; border-radius: 0.375rem; border: 1px solid rgba(1, 42, 74, 0.8); background-color: rgba(1, 42, 74, 0.5); color: #E6E6E6; transition: all 0.2s ease; }
            .search-input:focus { outline: none; border-color: rgba(0, 255, 135, 0.5); box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.2); }
            
            .comparatif-table-container { border-radius: 0.75rem; border: 1px solid rgba(1, 42, 74, 0.8); overflow: hidden; background-color: rgba(1, 42, 74, 0.3); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
            .comparatif-table { width: 100%; border-collapse: collapse; text-align: left; }
            .comparatif-table th { padding: 1rem; background-color: rgba(1, 22, 39, 0.8); font-weight: 600; color: #00FF87; font-size: 0.875rem; text-transform: uppercase; border-bottom: 1px solid rgba(1, 42, 74, 0.8); position: sticky; top: 0; z-index: 10; }
            .comparatif-table td { padding: 0.875rem 1rem; border-bottom: 1px solid rgba(1, 42, 74, 0.5); font-size: 0.875rem; vertical-align: top; }
            .comparatif-table tr:last-child td { border-bottom: none; }
            .comparatif-table tr:nth-child(odd) { background-color: rgba(1, 42, 74, 0.2); }
            .comparatif-table tr:hover { background-color: rgba(0, 255, 135, 0.05); cursor: pointer; }
            
            .statut-cell { display: flex; align-items: flex-start; gap: 0.75rem; }
            .statut-icon { width: 2.5rem; height: 2.5rem; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: rgba(1, 42, 74, 0.5); color: #00FF87; font-size: 1rem; flex-shrink: 0; }
            .statut-info { display: flex; flex-direction: column; }
            .statut-name { font-weight: 600; color: #E6E6E6; }
            .statut-fullname { font-size: 0.75rem; color: rgba(230, 230, 230, 0.6); }
            
            .loading-state { display: flex; justify-content: center; align-items: center; height: 200px; flex-direction: column; gap: 1rem; }
            .spinner { width: 40px; height: 40px; border: 3px solid rgba(0, 255, 135, 0.3); border-radius: 50%; border-top-color: #00FF87; animation: spin 1s ease-in-out infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
            
            .comparatif-notes { margin-top: 1.5rem; padding: 1rem; border-radius: 0.5rem; background-color: rgba(1, 42, 74, 0.3); font-size: 0.875rem; }
            .notes-title { font-weight: 600; color: #00FF87; margin-bottom: 0.5rem; }
            .notes-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem; }
            .notes-item { display: flex; align-items: center; gap: 0.5rem; }
            .notes-term { color: #00FF87; font-weight: 500; }
            .notes-disclaimer { font-style: italic; color: rgba(230, 230, 230, 0.6); font-size: 0.8125rem; text-align: center; margin-top: 0.75rem; }
            
            .comparatif-table .key-cell { background-color: rgba(0, 255, 135, 0.05); font-weight: 500; }
            .comparatif-table .highlighted-value { color: #00FF87; font-weight: 600; }
            .rating-stars { display: inline-flex; align-items: center; }
            .rating-stars .star { color: rgba(255, 255, 255, 0.2); margin-right: 2px; }
            .rating-stars .star.filled { color: #00FF87; }
            
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .comparatif-table tbody tr { animation: fadeInUp 0.3s ease forwards; opacity: 0; }
            
            #smart-comparison { margin-top: 0.75rem; }
            #smart-comparison .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            #smart-comparison b { color: #00FF87; }
            
            @media (max-width: 768px) {
                .comparatif-filters { flex-direction: column; }
                .criteria-buttons { grid-template-columns: repeat(2, 1fr); }
                .statut-icon { width: 2rem; height: 2rem; font-size: 0.875rem; }
                .comparatif-table th, .comparatif-table td { padding: 0.75rem 0.5rem; font-size: 0.75rem; }
                .notes-list { grid-template-columns: 1fr; }
                #smart-comparison .grid { grid-template-columns: 1fr !important; }
            }
        `;
        document.head.appendChild(style);
    }

    // ========== CRÉATION TABLEAU ==========
    window.createComparatifTable = function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`❌ Conteneur #${containerId} non trouvé`);
            return;
        }

        console.log("📦 Création du comparatif dans", containerId);
        injectCSS();

        container.innerHTML = `
            <div class="comparatif-container">
                <div class="comparatif-header">
                    <h2 class="comparatif-title">Comparatif des formes juridiques 2025</h2>
                    <p class="comparatif-description">
                        Tableau comparatif intelligent : filtrez par intention, comparez les différences clés.
                    </p>

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
                    
                    <div class="comparison-bar">
                        <div class="comparison-title">Comparer directement:</div>
                        <select id="status-dropdown" class="status-dropdown">
                            <option value="">Sélectionner un statut...</option>
                        </select>
                        <div class="comparison-items" id="comparison-items"></div>
                    </div>

                    <div class="diff-mode-toggle" id="diff-mode-toggle">
                        <input type="checkbox" id="diff-mode-checkbox">
                        <label for="diff-mode-checkbox">📊 Afficher uniquement les différences</label>
                    </div>
                    
                    <div class="comparatif-filters">
                        <div class="filter-group">
                            <label class="filter-label">Filtrer par critères:</label>
                            <div class="criteria-buttons" id="criteria-buttons"></div>
                        </div>
                        
                        <div class="filter-group" style="max-width: 300px;">
                            <label class="filter-label">Rechercher:</label>
                            <input type="text" id="search-input" class="search-input" placeholder="Rechercher un statut...">
                        </div>
                    </div>
                </div>
                
                <div class="comparatif-table-container">
                    <table class="comparatif-table" id="comparatif-table">
                        <thead>
                            <tr id="table-headers"></tr>
                        </thead>
                        <tbody id="table-body">
                            <tr>
                                <td colspan="10">
                                    <div class="loading-state">
                                        <div class="spinner"></div>
                                        <p>Chargement des données...</p>
                                    </div>
                                </td>
                            </tr>
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
                    <p class="notes-disclaimer">
                        Informations 2025. Consultez un expert-comptable pour votre cas précis.
                    </p>
                </div>
            </div>
        `;

        const criteria = [
            { id: 'all', label: 'Tous les critères' },
            { id: 'basic', label: 'Critères de base' },
            { id: 'fiscal', label: 'Aspects fiscaux' },
            { id: 'social', label: 'Aspects sociaux' },
            { id: 'creation', label: 'Création et gestion' }
        ];

        const criteriaButtons = document.getElementById('criteria-buttons');
        criteria.forEach(criterion => {
            const button = document.createElement('button');
            button.className = 'criteria-button' + (criterion.id === 'all' ? ' active' : '');
            button.setAttribute('data-criterion', criterion.id);
            button.textContent = criterion.label;
            criteriaButtons.appendChild(button);
        });

        let selectedCriterion = 'all';
        let searchTerm = '';
        let compareStatuts = [];
        let diffMode = false;
        
        let intentAnswers = {
            veut_dividendes: false,
            en_chomage: false,
            prevoit_associes: 'non',
            levee_fonds: 'non'
        };
        
        // ========== HOOK POUR PRESETS ==========
        window.__comparatifHooks = window.__comparatifHooks || {};
        window.__comparatifHooks.setComparison = function(statuts) {
            console.log("🎯 Preset: setComparison appelé avec", statuts);
            compareStatuts = statuts || [];
            updateComparisonBar();
            updateTable();
        };
        window.__comparatifHooks.setIntents = function(intents) {
            console.log("🎯 Preset: setIntents appelé avec", intents);
            Object.assign(intentAnswers, intents);
            
            // Cocher les checkboxes correspondantes
            $$('.intent-filter-item').forEach(item => {
                const intent = item.dataset.intent;
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    if (intent === 'prevoit_associes' || intent === 'levee_fonds') {
                        checkbox.checked = intentAnswers[intent] === 'oui';
                    } else {
                        checkbox.checked = !!intentAnswers[intent];
                    }
                    item.classList.toggle('active', checkbox.checked);
                }
            });
            
            renderAREHelper(intentAnswers);
            updateTable();
        };
        console.log("✅ Hooks comparatif exposés:", Object.keys(window.__comparatifHooks));
        
        initComparisonEvents();
        initIntentFilters();
        loadStatutData();

        renderAREHelper(intentAnswers);

        document.querySelectorAll('.criteria-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.criteria-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                selectedCriterion = button.getAttribute('data-criterion');
                updateTable();
            });
        });

        const debouncedUpdate = debounce(()=>{ updateTable(); }, 200);
        $('#search-input').addEventListener('input', (e)=>{
            searchTerm = e.target.value.toLowerCase();
            debouncedUpdate();
        });

        $('#diff-mode-checkbox').addEventListener('change', (e) => {
            diffMode = e.target.checked;
            $('#diff-mode-toggle').classList.toggle('active', diffMode);
            updateTable();
        });

        function initIntentFilters() {
            $$('.intent-filter-item').forEach(item => {
                const intent = item.dataset.intent;
                const checkbox = item.querySelector('input[type="checkbox"]');
                
                item.addEventListener('click', (e) => {
                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });

                checkbox.addEventListener('change', () => {
                    item.classList.toggle('active', checkbox.checked);
                    
                    if (intent === 'prevoit_associes' || intent === 'levee_fonds') {
                        intentAnswers[intent] = checkbox.checked ? 'oui' : 'non';
                    } else {
                        intentAnswers[intent] = checkbox.checked;
                    }
                    
                    console.log("🎯 Intent changed:", intent, intentAnswers[intent]);
                    renderAREHelper(intentAnswers);
                    updateTable();
                });
            });
        }

        function initComparisonEvents() {
            const statusDropdown = document.getElementById('status-dropdown');
            
            function populateStatusDropdown() {
                if (window.legalStatuses) {
                    statusDropdown.innerHTML = '<option value="">Sélectionner un statut...</option>';
                    const statuts = Object.values(window.legalStatuses)
                        .sort((a,b)=> a.shortName.localeCompare(b.shortName,'fr',{sensitivity:'base'}));
                    
                    statuts.forEach(statut => {
                        const option = document.createElement('option');
                        option.value = statut.shortName;
                        option.textContent = statut.shortName;
                        statusDropdown.appendChild(option);
                    });
                    console.log("✅ Dropdown peuplé avec", statuts.length, "statuts");
                }
            }
            
            statusDropdown.addEventListener('change', () => {
                if (statusDropdown.value) {
                    console.log("📌 Ajout manuel:", statusDropdown.value);
                    addToComparison(statusDropdown.value);
                    statusDropdown.value = '';
                }
            });
            
            if (window.legalStatuses) {
                populateStatusDropdown();
            } else {
                const checkInterval = setInterval(() => {
                    if (window.legalStatuses) {
                        populateStatusDropdown();
                        clearInterval(checkInterval);
                    }
                }, 500);
            }

            window.addEventListener('legalStatuses:ready', ()=>populateStatusDropdown(), { once:true });
        }
        
        function addToComparison(statutShortName) {
            if (compareStatuts.includes(statutShortName)) {
                console.log("⚠️ Statut déjà présent:", statutShortName);
                return;
            }
            
            if (compareStatuts.length >= 3) {
                compareStatuts.shift();
            }
            
            compareStatuts.push(statutShortName);
            console.log("✅ Comparaison mise à jour:", compareStatuts);
            updateComparisonBar();
            updateTable();
        }
        
        function removeFromComparison(statutShortName) {
            const index = compareStatuts.indexOf(statutShortName);
            if (index !== -1) {
                compareStatuts.splice(index, 1);
                console.log("🗑️ Statut retiré:", statutShortName);
                updateComparisonBar();
                updateTable();
            }
        }
        
        function updateComparisonBar() {
            const comparisonItems = document.getElementById('comparison-items');
            comparisonItems.innerHTML = '';
            
            console.log("🔄 Mise à jour barre de comparaison avec", compareStatuts);
            
            compareStatuts.forEach(shortName => {
                const statut = Object.values(window.legalStatuses || {}).find(s => s.shortName === shortName);
                if (!statut) return;
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'comparison-item';
                itemDiv.setAttribute('data-status', shortName);
                itemDiv.innerHTML = `
                    <i class="fas ${statut.logo || 'fa-building'} mr-2"></i> ${shortName}
                    <button class="remove-btn"><i class="fas fa-times"></i></button>
                `;
                
                itemDiv.querySelector('.remove-btn').addEventListener('click', () => {
                    removeFromComparison(shortName);
                });
                
                comparisonItems.appendChild(itemDiv);
            });

            renderSmartComparison();
        }

        function renderSmartComparison(){
            let host = $('#smart-comparison');
            if (!host){
                host = document.createElement('div');
                host.id = 'smart-comparison';
                host.style.marginTop = '0.75rem';
                const header = $('.comparatif-header');
                header && header.appendChild(host);
            }
            host.innerHTML = '';

            const has = x => compareStatuts.includes(x);
            const get = sn => enrichForDisplay(Object.values(window.legalStatuses||{}).find(s=>s.shortName===sn) || { shortName: sn, name: sn }, intentAnswers);

            if (has('EURL') && has('SASU')) {
                const eurl = get('EURL'), sasu = get('SASU');
                host.innerHTML = `
                    <div style="border:1px solid rgba(0,255,135,.3);border-radius:8px;padding:12px;background:rgba(1,35,65,.6)">
                        <div style="font-weight:600;color:#00FF87;margin-bottom:6px">💡 EURL vs SASU — points décisifs</div>
                        <div class="grid">
                            <div>
                                <div><b>Social</b>: ${toText(eurl.regimeSocial)}</div>
                                <div><b>Fiscalité</b>: ${toText(eurl.fiscalite)}</div>
                                <div><b>Dividendes</b>: cotisés >10%</div>
                            </div>
                            <div>
                                <div><b>Social</b>: ${toText(sasu.regimeSocial)}</div>
                                <div><b>Fiscalité</b>: ${toText(sasu.fiscalite)}</div>
                                <div><b>Dividendes</b>: non cotisés</div>
                            </div>
                        </div>
                    </div>`;
            } else if (compareStatuts.length===1 && has('MICRO')) {
                const m = get('MICRO');
                host.innerHTML = `
                    <div style="border:1px solid rgba(0,255,135,.3);border-radius:8px;padding:12px;background:rgba(1,35,65,.6)">
                        <div style="font-weight:600;color:#00FF87;margin-bottom:6px">📋 Micro-entreprise 2025</div>
                        <div>${m.obligationsCle}</div>
                        <div style="margin-top:6px;font-size:.9rem;opacity:.9"><b>Plafonds</b>: ${m.plafondCA}</div>
                    </div>`;
            }
        }

        function generateStarRating(rating) {
            if (typeof rating !== 'number') return 'Non évalué';
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                stars += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
            }
            return stars;
        }
        
        function loadStatutData() {
            if (window.legalStatuses) {
                console.log("✅ legalStatuses disponible:", Object.keys(window.legalStatuses).length);
                renderTable(window.legalStatuses);
            } else {
                console.log("⏳ Attente de legalStatuses...");
                setTimeout(() => {
                    if (window.legalStatuses) {
                        renderTable(window.legalStatuses);
                    } else {
                        const tableBody = document.getElementById('table-body');
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="10">
                                    <div class="loading-state">
                                        <p style="color: #FF6B6B;">
                                            <i class="fas fa-exclamation-triangle"></i>
                                            Impossible de charger les données.
                                        </p>
                                        <button id="retry-load" style="padding: 0.5rem 1rem; background-color: rgba(0, 255, 135, 0.2); border: 1px solid rgba(0, 255, 135, 0.5); color: #00FF87; border-radius: 0.375rem; cursor: pointer; margin-top: 0.5rem;">Réessayer</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                        document.getElementById('retry-load').addEventListener('click', loadStatutData);
                    }
                }, 500);
            }

            window.addEventListener('legalStatuses:ready', ()=>{
                console.log("✅ Événement legalStatuses:ready reçu");
                renderTable(window.legalStatuses);
            }, { once:true });
        }

        function getColumnsForCriterion(criterion) {
            switch (criterion) {
                case 'basic':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' }
                    ];
                case 'fiscal':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'fiscaliteOption', label: 'Option fiscale' },
                        { key: 'regimeTVA', label: 'Régime TVA' }
                    ];
                case 'social':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'regimeSocial', label: 'Régime social' },
                        { key: 'chargesSociales', label: 'Charges sociales' },
                        { key: 'protectionPatrimoine', label: 'Protection patrimoine' }
                    ];
                case 'creation':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'formalites', label: 'Formalités' },
                        { key: 'publicationComptes', label: 'Publication comptes' },
                        { key: 'plafondCA', label: 'Plafond CA' },
                        { key: 'obligationsCle', label: 'Obligations clés' }
                    ];
                default:
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'regimeSocial', label: 'Régime social' },
                        { key: 'plafondCA', label: 'Plafond CA' }
                    ];
            }
        }

        function filterStatuts(statuts, term) {
            let list = Object.values(statuts);

            if (compareStatuts.length > 0) {
                console.log("🔍 Filtrage par comparaison:", compareStatuts);
                list = list.filter(statut => compareStatuts.includes(statut.shortName));
            }

            if (term) {
                const tt = term.toLowerCase();
                list = list.filter(statut =>
                    (statut.name || '').toLowerCase().includes(tt) ||
                    (statut.shortName || '').toLowerCase().includes(tt) ||
                    (statut.description || '').toLowerCase().includes(tt)
                );
            }

            list = list.map(s => enrichForDisplay(s, intentAnswers))
                       .filter(s => matchIntent(s, intentAnswers));

            const anyIntent = intentAnswers.veut_dividendes || intentAnswers.en_chomage ||
                            intentAnswers.prevoit_associes === 'oui' || intentAnswers.levee_fonds === 'oui';
            if (anyIntent) {
                list.sort((a,b) => (b._score||0) - (a._score||0));
            }

            console.log("📊 Statuts filtrés:", list.length, "sur", Object.keys(statuts).length);
            return list;
        }

        function updateTable() {
            if (!window.legalStatuses) {
                console.log("⚠️ updateTable: legalStatuses non disponible");
                return;
            }
            
            let columns = getColumnsForCriterion(selectedCriterion);
            const filteredStatuts = filterStatuts(window.legalStatuses, searchTerm);
            const rowsData = filteredStatuts;

            if (diffMode && compareStatuts.length >= 2) {
                const diffKeys = onlyDifferences(rowsData, columns);
                columns = [
                    { key: 'name', label: 'Statut' },
                    ...columns.filter(c => diffKeys.includes(c.key))
                ];
                console.log("📊 Mode diff: colonnes affichées:", diffKeys);
            }
            
            const tableHeaders = document.getElementById('table-headers');
            tableHeaders.innerHTML = columns.map(col => `<th>${col.label}</th>`).join('');
            
            const tableBody = document.getElementById('table-body');
            
            if (rowsData.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${columns.length}" style="text-align: center; padding: 2rem;">
                            Aucun statut ne correspond à votre recherche.
                        </td>
                    </tr>
                `;
                return;
            }
            
            function generateBadges(statut) {
                const badges = [];
                const meta = statut.meta_payout || {};
                const dirM = statut.meta_dirigeant || {};
                
                if (meta.peut_salaire) badges.push('<span class="status-badge badge-salary">💼 Salaire</span>');
                if (meta.peut_dividendes) {
                    if (meta.dividendes_cot_sociales === 'non') {
                        badges.push('<span class="status-badge badge-dividends">💰 Div. sans cotis</span>');
                    } else {
                        badges.push('<span class="status-badge badge-dividends">💰 Dividendes</span>');
                    }
                }
                
                if (intentAnswers.en_chomage && statut.meta_are && statut.meta_are.are_compatible_sans_salaire) {
                    badges.push('<span class="status-badge badge-are">🛡️ ARE ok</span>');
                }
                
                if (statut.meta_evolution && statut.meta_evolution.accueil_investisseurs === 'élevé') {
                    badges.push('<span class="status-badge badge-investors">🚀 Investisseurs</span>');
                }
                if (dirM.statut_dirigeant === 'TNS') {
                    badges.push('<span class="status-badge badge-tns">TNS</span>');
                } else if (dirM.statut_dirigeant === 'assimilé salarié') {
                    badges.push('<span class="status-badge badge-assimile">Assimilé salarié</span>');
                }
                
                return badges.join('');
            }

            tableBody.innerHTML = rowsData.map((statut, index) => {
                let row = `<tr style="animation-delay: ${index * 0.05}s;" data-statut="${statut.shortName}">`;
                
                columns.forEach(column => {
                    if (column.key === 'name') {
                        const whyHtml = statut._why && statut._why.length > 0
                            ? `<div class="status-why">${statut._why.join(', ')}</div>`
                            : '';
                        const badges = generateBadges(statut);
                        
                        row += `
                            <td>
                                <div class="statut-cell">
                                    <div class="statut-icon">
                                        <i class="fas ${statut.logo || 'fa-building'}"></i>
                                    </div>
                                    <div class="statut-info">
                                        <div>
                                            <span class="statut-name">${statut.shortName}</span>
                                        </div>
                                        <span class="statut-fullname">${statut.name}</span>
                                        ${whyHtml}
                                        <div class="status-badges">${badges}</div>
                                    </div>
                                </div>
                            </td>
                        `;
                    } else if (column.key === 'responsabilite') {
                        const isLimited = statut[column.key] && statut[column.key].toLowerCase().includes('limitée');
                        row += `
                            <td class="${isLimited ? 'highlighted-value' : ''}">
                                ${toText(statut[column.key])}
                                ${isLimited ? ' <i class="fas fa-shield-alt" style="color:#00FF87"></i>' : ''}
                            </td>
                        `;
                    } else if (column.key === 'protectionPatrimoine') {
                        const stars = Number.isFinite(statut._pp_stars) ? `
                            <div class="rating-stars" title="${statut._pp_stars}/5">
                                ${generateStarRating(statut._pp_stars)}
                            </div>` : '';
                        row += `
                            <td>
                                ${stars}
                                <span>${toText(statut._pp_text)}</span>
                            </td>
                        `;
                    } else if (column.key === 'capital') {
                        row += `
                            <td class="key-cell">
                                ${toText(statut[column.key])}
                            </td>
                        `;
                    } else {
                        row += `
                            <td>
                                ${toText(statut[column.key])}
                            </td>
                        `;
                    }
                });
                
                row += '</tr>';
                return row;
            }).join('');
            
            // Ajouter événement de clic sur les lignes
            document.querySelectorAll('#table-body tr').forEach((row) => {
                row.addEventListener('click', () => {
                    const statutShortName = row.getAttribute('data-statut');
                    if (statutShortName) {
                        console.log("🖱️ Clic sur ligne:", statutShortName);
                        addToComparison(statutShortName);
                    }
                });
            });
        }

        function renderTable(data) {
            updateTable();
        }
    };

})();
