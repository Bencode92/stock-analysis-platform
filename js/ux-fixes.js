/**
 * ux-fixes.js v1.0 — Corrections UX P0 (review expert UX/UI)
 *
 * FIX 1: Inverser l'ordre narratif — Baseline (probleme) AVANT Synthese (solution)
 * FIX 2: Recap des choix utilisateur en tete du Step 5
 * FIX 3: 3 barres visuelles comparant les scenarios
 * FIX 4: Rappels "parce que vous avez dit X" sous chaque reco
 *
 * S'execute APRES per-asset-results.js et AVANT step5-cleanup.js
 * Ne modifie aucun calcul — reordonne et enrichit le DOM uniquement
 *
 * @version 1.0.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) { setTimeout(init, 500); return; }
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(applyUXFixes, 1050);
        };
        console.log('[UXFixes v1.0] Loaded — narrative order + choices recap + scenario bars + justifications');
    }

    function applyUXFixes() {
        reorderNarrative();
        addChoicesRecap();
        addScenarioBars();
        addJustifications();
    }

    // ============================================================
    // FIX 1: INVERSER L'ORDRE NARRATIF
    // Baseline (probleme) → Warning → Synthese (solution) → Par actif → Plan
    // ============================================================
    function reorderNarrative() {
        var synth = document.getElementById('ai-synthesis-panel');
        var baseline = document.getElementById('succession-baseline-panel');
        var warning = document.getElementById('succession-legale-warning');

        if (!synth || !baseline) return;

        // La synthese doit etre APRES le warning (ou apres baseline si pas de warning)
        var anchor = warning || baseline;
        // Verifier que la synthese n'est pas deja apres le warning
        if (anchor.nextElementSibling === synth) return;

        // Deplacer la synthese apres le warning/baseline
        anchor.insertAdjacentElement('afterend', synth);
    }

    // ============================================================
    // FIX 2: RECAP DES CHOIX EN TETE DU STEP 5
    // ============================================================
    function addChoicesRecap() {
        var existing = document.getElementById('choices-recap-panel');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var obj = state.obj || {};
        var decisions = {};
        if (typeof StrategyAdvisor !== 'undefined' && StrategyAdvisor.getDecisions) {
            decisions = StrategyAdvisor.getDecisions() || {};
        }

        var choices = [];
        // Objectifs actifs
        if (obj.minimiser) choices.push({ icon: '\ud83d\udcb0', text: 'Minimiser les droits' });
        if (obj.revenus) choices.push({ icon: '\ud83d\udcb6', text: 'Pr\u00e9server les revenus' });
        if (obj.controle) choices.push({ icon: '\ud83d\udd12', text: 'Garder le contr\u00f4le' });
        if (obj.conjoint) choices.push({ icon: '\u2764\ufe0f', text: 'Prot\u00e9ger le conjoint' });
        if (obj.egalite) choices.push({ icon: '\u2696\ufe0f', text: '\u00c9galit\u00e9 entre h\u00e9ritiers' });
        if (obj.generation) choices.push({ icon: '\ud83c\udfaf', text: 'Transmettre aux PE' });
        if (obj.vendre) choices.push({ icon: '\ud83c\udff7\ufe0f', text: 'Vendre des biens' });

        // Decisions cles
        var keys = Object.keys(decisions);
        keys.forEach(function(k) {
            var v = decisions[k];
            if (k.indexOf('rp-intention') >= 0 && v === 'rester') choices.push({ icon: '\ud83c\udfe0', text: 'Rester dans la RP' });
            if (k.indexOf('indirect') >= 0 && (v === 'oui' || v === 'a_discuter')) choices.push({ icon: '\u2197\ufe0f', text: 'Chemin indirect accept\u00e9' });
            if (k.indexOf('locatif-revenus') >= 0 && v === 'essentiels') choices.push({ icon: '\ud83d\udcca', text: 'Loyers essentiels' });
            if (k.indexOf('av-approche') >= 0 && v === 'capi') choices.push({ icon: '\ud83d\udee1\ufe0f', text: 'AV → capi d\u00e9membr\u00e9' });
        });

        if (choices.length === 0) return;

        // Deduplicate
        var seen = {};
        choices = choices.filter(function(c) { if (seen[c.text]) return false; seen[c.text] = true; return true; });

        var h = '<div id="choices-recap-panel" style="margin-bottom:12px;padding:14px 20px;border-radius:12px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.1);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
        h += '<span style="font-size:.72rem;font-weight:700;color:var(--text-label);white-space:nowrap;"><i class="fas fa-clipboard-check" style="margin-right:4px;color:var(--primary-color);"></i>Vos choix :</span>';
        choices.forEach(function(c) {
            h += '<span style="font-size:.65rem;padding:3px 10px;border-radius:20px;background:rgba(198,134,66,.08);border:1px solid rgba(198,134,66,.12);color:var(--text-secondary);white-space:nowrap;">' + c.icon + ' ' + c.text + '</span>';
        });
        h += '<a href="#" onclick="SD.goToStep(4);return false;" style="font-size:.60rem;color:var(--primary-color);margin-left:auto;white-space:nowrap;">Modifier \u2192</a>';
        h += '</div>';

        // Inserer avant le baseline (tout en haut)
        var baseline = document.getElementById('succession-baseline-panel');
        if (baseline) baseline.insertAdjacentHTML('beforebegin', h);
    }

    // ============================================================
    // FIX 3: 3 BARRES VISUELLES DE COMPARAISON
    // Succession legale | Donation directe | Strategie optimisee
    // ============================================================
    function addScenarioBars() {
        var existing = document.getElementById('scenario-bars-panel');
        if (existing) existing.remove();

        var synth = document.getElementById('ai-synthesis-panel');
        if (!synth) return;

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var pat = SD._fiscal.computePatrimoine();
        var totalAV = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; }).reduce(function(s, f) { return s + (f.valeur || 0); }, 0);
        var masseHorsAV = (pat.actifNet || 0) - totalAV;

        // Scenario 1: Succession legale (enfant herite)
        var abatEnfant = SD._fiscal.getAbattement('enfant', true);
        var baseEnfant = Math.max(0, masseHorsAV - abatEnfant);
        var droitsEnfant = SD._fiscal.calcDroits(baseEnfant, SD._fiscal.getBareme('enfant'));

        // Droits AV si enfant (990I/757B)
        var droitsAVEnfant = 0;
        (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; }).forEach(function(av) {
            var pAv70 = av.primesAvant70 || 0;
            var pAp70 = av.primesApres70 || 0;
            if (pAv70 === 0 && pAp70 === 0 && (state._realDonorAge || 60) >= 70) pAp70 = av.versements || av.valeur || 0;
            if (pAp70 > 0) droitsAVEnfant += SD._fiscal.calcDroits(Math.max(0, pAp70 - 30500), SD._fiscal.getBareme('enfant'));
            if (pAv70 > 0) { var b = Math.max(0, pAv70 - 152500); droitsAVEnfant += Math.round(Math.min(b, 547500) * 0.20 + Math.max(0, b - 547500) * 0.3125); }
        });
        var droitsSuccLegale = droitsEnfant + droitsAVEnfant;

        // Scenario 2: Donation directe GP→PE (sans optim NP/SCI)
        var nbBens = Math.max(1, (state.beneficiaries || []).length);
        var lienBen = 'petit_enfant';
        var abatBen = SD._fiscal.getAbattement(lienBen, false);
        var partDirecte = Math.round((masseHorsAV + totalAV) / nbBens);
        var droitsDirecte = SD._fiscal.calcDroits(Math.max(0, partDirecte - abatBen), SD._fiscal.getBareme(lienBen)) * nbBens;

        // Scenario 3: Strategie optimisee (deja calcule dans synthese)
        var kpiBoxes = synth.querySelectorAll('div[style*="font-weight:800"]');
        var droitsOptimise = 0;
        if (kpiBoxes.length >= 2) {
            var optText = kpiBoxes[1].textContent.replace(/[^\d]/g, '');
            droitsOptimise = parseInt(optText) || 0;
        }

        if (droitsSuccLegale <= 0) return;

        var maxDroits = Math.max(droitsSuccLegale, droitsDirecte, droitsOptimise);
        var pctLegale = Math.round(droitsSuccLegale / maxDroits * 100);
        var pctDirecte = Math.round(droitsDirecte / maxDroits * 100);
        var pctOptimise = droitsOptimise > 0 ? Math.round(droitsOptimise / maxDroits * 100) : 0;
        var ecoTotale = droitsSuccLegale - droitsOptimise;
        var ecoPct = droitsSuccLegale > 0 ? Math.round(ecoTotale / droitsSuccLegale * 100) : 0;

        var h = '<div id="scenario-bars-panel" style="margin-top:16px;padding:16px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">';
        h += '<div style="font-size:.72rem;font-weight:700;color:var(--text-label);margin-bottom:10px;"><i class="fas fa-chart-bar" style="margin-right:6px;color:var(--primary-color);"></i>Comparaison des 3 sc\u00e9narios</div>';

        // Barre 1: Succession legale
        h += barRow('\u26ab Succession l\u00e9gale', '(' + getEnfantNom() + ' h\u00e9rite)', droitsSuccLegale, pctLegale, 'var(--text-muted)', 'rgba(139,156,176,.3)');
        // Barre 2: Donation directe
        h += barRow('\ud83d\udfe1 Donation directe GP\u2192PE', '(sans optim.)', droitsDirecte, pctDirecte, 'var(--accent-amber)', 'rgba(255,179,0,.25)');
        // Barre 3: Strategie optimisee
        h += barRow('\ud83d\udfe2 Strat\u00e9gie optimis\u00e9e', '(NP + SCI + dons)', droitsOptimise, pctOptimise, 'var(--accent-green)', 'rgba(16,185,129,.3)');

        // Economie totale
        h += '<div style="margin-top:10px;text-align:center;font-size:.78rem;font-weight:700;color:var(--accent-green);">';
        h += '\ud83d\udcb0 \u00c9conomie totale : ' + fmt(ecoTotale) + ' (\u2212' + ecoPct + '% vs succession l\u00e9gale)';
        h += '</div>';

        h += '</div>';

        // Inserer dans le panneau synthese, apres les KPI boxes
        var lastGrid = synth.querySelector('div[style*="grid-template-columns"]:last-of-type');
        if (lastGrid) lastGrid.insertAdjacentHTML('afterend', h);
        else synth.insertAdjacentHTML('beforeend', h);
    }

    function barRow(label, sublabel, montant, pct, color, bgColor) {
        var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">';
        h += '<div style="width:200px;flex-shrink:0;">';
        h += '<div style="font-size:.72rem;font-weight:600;color:var(--text-secondary);">' + label + '</div>';
        h += '<div style="font-size:.55rem;color:var(--text-muted);">' + sublabel + '</div>';
        h += '</div>';
        h += '<div style="flex:1;height:24px;background:rgba(198,134,66,.03);border-radius:6px;overflow:hidden;border:1px solid rgba(198,134,66,.04);">';
        h += '<div style="height:100%;width:' + pct + '%;background:' + bgColor + ';border-radius:6px;display:flex;align-items:center;padding-left:8px;transition:width .6s ease;">';
        h += '<span style="font-size:.68rem;font-weight:700;color:' + color + ';white-space:nowrap;">' + fmt(montant) + '</span>';
        h += '</div></div></div>';
        return h;
    }

    // ============================================================
    // FIX 4: JUSTIFICATIONS "PARCE QUE VOUS AVEZ DIT X"
    // ============================================================
    function addJustifications() {
        var perAsset = document.getElementById('per-asset-results-panel');
        if (!perAsset) return;

        var decisions = {};
        if (typeof StrategyAdvisor !== 'undefined' && StrategyAdvisor.getDecisions) {
            decisions = StrategyAdvisor.getDecisions() || {};
        }
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var obj = state.obj || {};

        // Trouver les boites de recommandation (celles avec fa-check-circle)
        var recoBoxes = perAsset.querySelectorAll('.fa-check-circle');
        recoBoxes.forEach(function(icon) {
            var recoDiv = icon.closest('div[style*="border-radius"]');
            if (!recoDiv || recoDiv.querySelector('.justification-block')) return;

            var cardText = recoDiv.closest('.section-card') ? recoDiv.closest('.section-card').textContent : '';
            var justifications = [];

            // Detecter le type d'actif
            var isRP = cardText.indexOf('sidence principale') >= 0 || cardText.indexOf("Conserve l'usage") >= 0;
            var isLocatif = cardText.indexOf('locatif') >= 0 || cardText.indexOf('Conserve les loyers') >= 0;
            var isAV = cardText.indexOf('Assurance-vie') >= 0 || cardText.indexOf('757 B') >= 0;

            if (isRP) {
                if (findDec(decisions, 'rp-intention', 'rester')) justifications.push('\u00ab Je souhaite rester dans le logement \u00bb \u2192 NP conserve l\'usufruit');
                if (obj.minimiser) justifications.push('\u00ab Minimiser les droits \u00bb activ\u00e9 \u2192 droits sur ' + Math.round(SD._fiscal.getNPRatio(state._realDonorAge || 60) * 100) + '% seulement');
                if (findDec(decisions, 'indirect', 'oui') || findDec(decisions, 'indirect', 'a_discuter')) justifications.push('\u00ab Chemin indirect \u00e0 comparer \u00bb \u2192 voir section chemins indirects');
            } else if (isLocatif) {
                if (obj.controle || obj.revenus) justifications.push('\u00ab Contr\u00f4le + Revenus \u00bb activ\u00e9s \u2192 SCI = g\u00e9rance + loyers conserv\u00e9s');
                if (findDec(decisions, 'locatif-horizon', 'conserver')) justifications.push('\u00ab Conserver et continuer \u00e0 louer \u00bb \u2192 NP ou SCI, pas de vente');
                if (obj.minimiser) justifications.push('\u00ab Minimiser les droits \u00bb \u2192 d\u00e9cote SCI 15% + NP');
            } else if (isAV) {
                if (findDec(decisions, 'av-revenus', 'non')) justifications.push('\u00ab AV = placement de transmission \u00bb \u2192 capi d\u00e9membr\u00e9 privil\u00e9gi\u00e9');
                if (obj.minimiser) justifications.push('\u00ab Minimiser les droits \u00bb \u2192 droits sur NP seulement + cr\u00e9ance d\u00e9ductible');
                if (findDec(decisions, 'av-beneficiaire', 'pe_direct')) justifications.push('\u00ab B\u00e9n\u00e9ficiaires = PE directs \u00bb \u2192 clause \u00e0 d\u00e9signer');
            }

            if (justifications.length === 0) return;

            var jh = '<div class="justification-block" style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);font-size:.65rem;color:var(--text-muted);">';
            jh += '<div style="font-weight:700;color:var(--text-label);margin-bottom:4px;"><i class="fas fa-comment-dots" style="margin-right:4px;color:var(--primary-color);"></i>Bas\u00e9 sur vos r\u00e9ponses :</div>';
            justifications.forEach(function(j) {
                jh += '<div style="margin-left:8px;margin-bottom:2px;">\u2022 ' + j + '</div>';
            });
            jh += '</div>';

            recoDiv.insertAdjacentHTML('afterend', jh);
        });
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function findDec(decisions, keyPart, valuePart) {
        var keys = Object.keys(decisions);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(keyPart) >= 0 && decisions[keys[i]] === valuePart) return true;
        }
        return false;
    }

    function getEnfantNom() {
        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        if (!FG || !FG.getPersons) return 'l\'enfant';
        var persons = FG.getPersons();
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        if (donateurs.length === 0) return 'l\'enfant';
        var donor = donateurs[0];
        if (FG.getChildren) {
            var cids = FG.getChildren(donor.id);
            if (cids && cids.length > 0) {
                var enfant = persons.find(function(p) { return cids.indexOf(p.id) >= 0; });
                if (enfant) return enfant.nom || 'l\'enfant';
            }
        }
        return 'l\'enfant';
    }

    function fmt(n) { return SD._fiscal.fmt(n); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1600); });
    else setTimeout(init, 1600);
})();
