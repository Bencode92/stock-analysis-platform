/**
 * ui-enrichments.js — Injecte les champs UI manquants + câble le state
 * 
 * Ajoute dynamiquement dans le DOM :
 * 1. Type d'union (mariage/PACS/concubinage) — Step 1
 * 2. Pays de résidence + nationalité conjoint — Step 1
 * 3. Enfants autre lit + beaux-enfants — Step 1 (bénéficiaires)
 * 4. Testament existant — Step 4
 * 5. Câblage rendement immo → partage
 * 6. Patch FamilyGraph.getUnionType()
 *
 * Principe : N'ÉDITE PAS successions-donations.js (4200 lignes).
 * Injecte les champs APRÈS le chargement du DOM, lit les valeurs dans gatherInputs.
 *
 * @version 1.0.0 — 2026-03-16
 */
const UIEnrichments = (function() {
    'use strict';

    // ============================================================
    // 1. PATCH FamilyGraph — getUnionType()
    // ============================================================

    var _unionTypeStore = {}; // clé: 'id1-id2', valeur: 'mariage'|'pacs'|'concubinage'

    function patchFamilyGraph() {
        if (typeof FamilyGraph === 'undefined') return;

        // Ajouter getUnionType si n'existe pas
        if (!FamilyGraph.getUnionType) {
            FamilyGraph.getUnionType = function(id1, id2) {
                var key1 = id1 + '-' + id2;
                var key2 = id2 + '-' + id1;
                return _unionTypeStore[key1] || _unionTypeStore[key2] || 'mariage';
            };
        }

        // Ajouter setUnionType
        if (!FamilyGraph.setUnionType) {
            FamilyGraph.setUnionType = function(id1, id2, type) {
                _unionTypeStore[id1 + '-' + id2] = type;
                _unionTypeStore[id2 + '-' + id1] = type;
                // Mettre à jour le state global
                var state = SD._getState ? SD._getState() : null;
                if (state) state._unionType = type;
                console.log('[UIEnrichments] Union type set: ' + type + ' for ' + id1 + '-' + id2);
            };
        }

        // Intercepter addRelation pour détecter les couples
        var _origAddRel = FamilyGraph.addRelation;
        if (_origAddRel && !FamilyGraph._uiEnrichPatched) {
            FamilyGraph.addRelation = function(from, to, type) {
                _origAddRel.call(FamilyGraph, from, to, type);
                if (type === 'spouse') {
                    // Injecter le sélecteur d'union après un court délai
                    setTimeout(function() { injectUnionTypeSelector(from, to); }, 300);
                }
            };
            FamilyGraph._uiEnrichPatched = true;
        }
    }

    // ============================================================
    // 2. INJECTION — Type d'union (Step 1)
    // ============================================================

    function injectUnionTypeSelector(id1, id2) {
        var existingSel = document.getElementById('union-type-selector');
        if (existingSel) existingSel.remove();

        // Trouver où injecter (après l'arbre familial)
        var treeSection = document.getElementById('family-persons-list');
        if (!treeSection) return;

        var currentType = FamilyGraph.getUnionType ? FamilyGraph.getUnionType(id1, id2) : 'mariage';

        var html = '<div id="union-type-selector" style="padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.15);margin-top:12px;">';
        html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:8px;"><i class="fas fa-heart" style="margin-right:6px;"></i>Type d\'union du couple</div>';
        html += '<div class="form-grid cols-3">';
        html += '<div class="form-group">';
        html += '<label class="form-label">Statut matrimonial</label>';
        html += '<select id="select-union-type" onchange="UIEnrichments.onUnionTypeChange(this.value,' + id1 + ',' + id2 + ')" style="border-color:rgba(255,107,107,.25);">';
        html += '<option value="mariage"' + (currentType === 'mariage' ? ' selected' : '') + '>💍 Mariage</option>';
        html += '<option value="pacs"' + (currentType === 'pacs' ? ' selected' : '') + '>📋 PACS</option>';
        html += '<option value="concubinage"' + (currentType === 'concubinage' ? ' selected' : '') + '>🤝 Concubinage (union libre)</option>';
        html += '</select>';
        html += '</div>';
        html += '</div>';
        // Warning dynamique
        html += '<div id="union-type-warning" style="margin-top:8px;font-size:.75rem;"></div>';
        html += '</div>';

        treeSection.insertAdjacentHTML('afterend', html);
        updateUnionWarning(currentType);
    }

    function onUnionTypeChange(type, id1, id2) {
        if (FamilyGraph.setUnionType) FamilyGraph.setUnionType(id1, id2, type);
        updateUnionWarning(type);
    }

    function updateUnionWarning(type) {
        var el = document.getElementById('union-type-warning');
        if (!el) return;
        if (type === 'concubinage') {
            el.innerHTML = '<div style="padding:8px 12px;border-radius:8px;background:rgba(255,107,107,.08);color:var(--accent-coral);"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i><strong>Concubinage :</strong> aucun droit successoral. Taxé à 60%. Seule l\'AV est efficace.</div>';
        } else if (type === 'pacs') {
            el.innerHTML = '<div style="padding:8px 12px;border-radius:8px;background:rgba(255,179,0,.08);color:var(--accent-amber);"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i><strong>PACS :</strong> exonéré mais AUCUN héritage sans testament ! DDV impossible.</div>';
        } else {
            el.innerHTML = '<div style="padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.06);color:var(--accent-green);"><i class="fas fa-check-circle" style="margin-right:4px;"></i><strong>Mariage :</strong> conjoint exonéré + héritage automatique + DDV possible.</div>';
        }
    }

    // ============================================================
    // 3. INJECTION — Pays résidence + nationalité (Step 1)
    // ============================================================

    function injectInternationalFields() {
        var rolesSection = document.getElementById('family-roles-list');
        if (!rolesSection) return;
        if (document.getElementById('international-fields')) return;

        var paysOptions = [
            ['FR', '🇫🇷 France'], ['DE', '🇩🇪 Allemagne'], ['BE', '🇧🇪 Belgique'], ['ES', '🇪🇸 Espagne'],
            ['IT', '🇮🇹 Italie'], ['PT', '🇵🇹 Portugal'], ['GB', '🇬🇧 Royaume-Uni'], ['CH', '🇨🇭 Suisse'],
            ['LU', '🇱🇺 Luxembourg'], ['NL', '🇳🇱 Pays-Bas'], ['SE', '🇸🇪 Suède'], ['AT', '🇦🇹 Autriche'],
            ['GR', '🇬🇷 Grèce'], ['FI', '🇫🇮 Finlande'], ['BG', '🇧🇬 Bulgarie'], ['DK', '🇩🇰 Danemark'],
            ['IE', '🇮🇪 Irlande'], ['OTHER', '🌍 Autre']
        ].map(function(p) { return '<option value="' + p[0] + '"' + (p[0] === 'FR' ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('');

        var html = '<div id="international-fields" class="section-card" style="margin-top:12px;border-color:rgba(59,130,246,.15);">';
        html += '<div class="section-title"><i class="fas fa-globe-europe" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Situation internationale</div>';
        html += '<div class="section-subtitle">Si le défunt ou le conjoint réside à l\'étranger, le régime fiscal peut changer</div>';
        html += '<div class="form-grid">';
        html += '<div class="form-group"><label class="form-label">Pays de résidence du défunt</label><select id="select-pays-residence" onchange="UIEnrichments.onPaysChange()">' + paysOptions + '</select></div>';
        html += '<div class="form-group"><label class="form-label">Nationalité/résidence du conjoint (si différente)</label><select id="select-pays-conjoint" onchange="UIEnrichments.onPaysChange()"><option value="">Même pays</option>' + paysOptions.replace(' selected', '') + '</select></div>';
        html += '</div></div>';

        rolesSection.closest('.section-card').insertAdjacentHTML('afterend', html);
    }

    function onPaysChange() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var paysEl = document.getElementById('select-pays-residence');
        var conjEl = document.getElementById('select-pays-conjoint');
        if (paysEl) {
            state._paysResidence = paysEl.value;
            state._residenceEtranger = paysEl.value !== 'FR' ? paysEl.value : null;
            state._nationalite = 'FR'; // défaut
        }
        if (conjEl && conjEl.value) state._paysConjoint = conjEl.value;
    }

    // ============================================================
    // 4. INJECTION — Testament existant (Step 4)
    // ============================================================

    function injectTestamentSwitch() {
        var ddvSwitch = document.getElementById('switch-ddv');
        if (!ddvSwitch) return;
        if (document.getElementById('switch-testament')) return;

        var switchRow = ddvSwitch.closest('.switch-row');
        if (!switchRow) return;

        var html = '<div class="switch-row">';
        html += '<span class="switch-label">Testament déjà rédigé ? <span class="info-tip" onclick="this.classList.toggle(\'open\');event.stopPropagation()"><i class="fas fa-info-circle"></i><span class="tip-bubble">OBLIGATOIRE pour les pacsés (sinon le partenaire ne reçoit RIEN). Recommandé pour tous : permet de choisir la répartition.</span></span></span>';
        html += '<div class="switch" id="switch-testament" onclick="SD.toggleSwitch(this);UIEnrichments.onTestamentChange()"></div>';
        html += '</div>';

        switchRow.insertAdjacentHTML('beforebegin', html);
    }

    function onTestamentChange() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var el = document.getElementById('switch-testament');
        state._hasTestament = el ? el.classList.contains('on') : false;
    }

    // ============================================================
    // 5. ENRICHIR BÉNÉFICIAIRES — beau_enfant + isAutreLit
    // ============================================================

    function enrichBeneficiaryOptions() {
        // Observer les ajouts de bénéficiaires pour enrichir
        var list = document.getElementById('beneficiaries-list');
        if (!list) return;

        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('list-item')) {
                        enrichBenItem(node);
                    }
                });
            });
        });
        observer.observe(list, { childList: true });

        // Enrichir les existants
        list.querySelectorAll('.list-item').forEach(enrichBenItem);
    }

    function enrichBenItem(item) {
        if (item.querySelector('.autre-lit-check')) return; // déjà enrichi
        var benId = item.dataset.benId;
        if (benId === undefined) {
            var idMatch = item.id.match(/ben-(\d+)/);
            if (idMatch) benId = idMatch[1];
        }
        if (benId === undefined) return;

        // Ajouter beau_enfant dans le select existant
        var select = item.querySelector('select');
        if (select && !select.querySelector('option[value="beau_enfant"]')) {
            var opt = document.createElement('option');
            opt.value = 'beau_enfant';
            opt.textContent = 'Beau-fils / Belle-fille (enfant du conjoint)';
            // Insérer après "Conjoint / Pacsé"
            var conjOpt = select.querySelector('option[value="conjoint_pacs"]');
            if (conjOpt) conjOpt.insertAdjacentElement('afterend', opt);
            else select.appendChild(opt);
        }

        // Ajouter checkbox "Enfant d'un autre lit ?"
        var formGrid = item.querySelector('.form-grid');
        if (formGrid && !item.querySelector('.autre-lit-check')) {
            var checkHtml = '<div class="form-group autre-lit-check" style="margin-top:8px;">';
            checkHtml += '<label style="display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--text-secondary);cursor:pointer;">';
            checkHtml += '<input type="checkbox" onchange="UIEnrichments.onAutreLitChange(' + benId + ',this.checked)" style="width:16px;height:16px;cursor:pointer;">';
            checkHtml += 'Enfant d\'un autre lit (1ère union du défunt)';
            checkHtml += '</label></div>';
            formGrid.insertAdjacentHTML('afterend', checkHtml);
        }
    }

    function onAutreLitChange(benId, checked) {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var ben = state.beneficiaries.find(function(b) { return b.id == benId; });
        if (ben) {
            ben.isAutreLit = checked;
            console.log('[UIEnrichments] Ben ' + benId + ' isAutreLit = ' + checked);
        }
    }

    // ============================================================
    // 6. CÂBLAGE — gatherInputs enrichi
    // ============================================================

    function wireGatherInputs() {
        if (typeof SD === 'undefined' || !SD._getState) return;

        var _origGather = null;

        // Monkey-patch calculateResults pour enrichir le state avant le calcul
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            enrichState();
            _origCalc.call(SD);
        };
    }

    function enrichState() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        // Union type
        var unionSel = document.getElementById('select-union-type');
        if (unionSel) state._unionType = unionSel.value;

        // Pays résidence
        var paysSel = document.getElementById('select-pays-residence');
        if (paysSel) {
            state._paysResidence = paysSel.value;
            state._residenceEtranger = paysSel.value !== 'FR' ? paysSel.value : null;
        }

        // Pays conjoint
        var conjSel = document.getElementById('select-pays-conjoint');
        if (conjSel && conjSel.value) state._paysConjoint = conjSel.value;

        // Testament
        var testEl = document.getElementById('switch-testament');
        if (testEl) state._hasTestament = testEl.classList.contains('on');

        // DDV → _hasDDV
        var ddvEl = document.getElementById('switch-ddv');
        if (ddvEl) state._hasDDV = ddvEl.classList.contains('on');

        // Beaux-enfants count
        var nbBeaux = 0;
        state.beneficiaries.forEach(function(b) {
            if (b.lien === 'beau_enfant') { b.isBeauEnfant = true; nbBeaux++; }
        });
        state._nbBeauxEnfants = nbBeaux;

        // Enfants autre lit flag
        state._hasEnfantsAutreLit = state.beneficiaries.some(function(b) { return b.isAutreLit; });
    }

    // ============================================================
    // 7. INIT
    // ============================================================

    function init() {
        patchFamilyGraph();

        // Injecter les champs quand les steps sont visibles
        // Observer les changements de step
        var interval = setInterval(function() {
            if (typeof SD === 'undefined') return;

            // Step 1 visible
            var step1 = document.getElementById('step-1');
            if (step1 && step1.classList.contains('active')) {
                injectInternationalFields();
                // Union type selector injecté quand un couple est créé (via patch addRelation)
            }

            // Step 2 visible
            var step2 = document.getElementById('step-2');
            if (step2) enrichBeneficiaryOptions();

            // Step 4 visible
            var step4 = document.getElementById('step-4');
            if (step4) injectTestamentSwitch();

            wireGatherInputs();
            clearInterval(interval);
        }, 1000);

        // Aussi réinjecter quand on change de step
        document.addEventListener('click', function(e) {
            var stepItem = e.target.closest('.step-item');
            if (stepItem) {
                setTimeout(function() {
                    injectInternationalFields();
                    enrichBeneficiaryOptions();
                    injectTestamentSwitch();
                }, 300);
            }
        });

        console.log('[UIEnrichments v1] Loaded — union type, pays, testament, beau-enfant, autre lit');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1200); });
    else setTimeout(init, 1200);

    return {
        onUnionTypeChange: onUnionTypeChange,
        onPaysChange: onPaysChange,
        onTestamentChange: onTestamentChange,
        onAutreLitChange: onAutreLitChange,
        injectUnionTypeSelector: injectUnionTypeSelector,
        enrichState: enrichState
    };
})();
