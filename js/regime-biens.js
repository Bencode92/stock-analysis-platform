/**
 * regime-biens.js v1.0 — Nature des biens selon le regime matrimonial
 *
 * CRITIQUE pour le calcul de la masse successorale :
 * - Communaute acquets : biens achetes pendant mariage = COMMUNS (50% dans masse)
 *   Biens herites/donnes/avant mariage = PROPRES (100% dans masse du proprietaire)
 * - Communaute universelle : tout commun (50%), sauf preciput
 * - Separation de biens : tout propre (100%), sauf indivision volontaire
 * - PACS / concubinage : comme separation
 *
 * Injecte un select "Nature du bien" sur chaque immo dans Step 3
 * + auto-default selon regime + mode acquisition
 * + getQuotePartSuccessorale(immoId) pour le calcul
 *
 * @version 1.0.0 - 2026-03-17
 */
const RegimeBiens = (function() {
    'use strict';

    // Store interne : immoId -> {nature, quotePart}
    var _bienNature = {};

    // Natures possibles
    var NATURES = [
        { id: 'commun', label: 'Bien commun (50% dans la masse)', icon: 'fa-ring', color: 'var(--accent-coral)' },
        { id: 'propre_donateur', label: 'Bien propre du donateur/defunt', icon: 'fa-user', color: 'var(--primary-color)' },
        { id: 'propre_conjoint', label: 'Bien propre du conjoint', icon: 'fa-user-friends', color: 'var(--accent-blue)' },
        { id: 'indivision', label: 'Indivision (quote-part)', icon: 'fa-percentage', color: 'var(--accent-purple)' }
    ];

    // ============================================================
    // 1. AUTO-DEFAULT : deduire la nature selon regime + acquisition
    // ============================================================

    function getDefaultNature(immoItem) {
        var state = getState(); if (!state) return 'propre_donateur';
        var regime = state.regime || state._unionType || 'communaute_acquets';
        var unionType = state._unionType || 'mariage';

        // PACS / concubinage -> comme separation
        if (unionType === 'pacs' || unionType === 'concubinage') {
            return 'propre_donateur';
        }

        var mode = immoItem.modeAcquisition || 'achat';

        if (regime === 'communaute_universelle') {
            return 'commun'; // tout est commun
        }

        if (regime === 'separation_biens') {
            return 'propre_donateur'; // tout est propre
        }

        // Communaute reduite aux acquets (defaut)
        if (mode === 'donation' || mode === 'succession') {
            return 'propre_donateur'; // biens recus = propres meme en communaute
        }

        // Bien achete -> commun (presomption)
        return 'commun';
    }

    function getDefaultQuotePart(nature) {
        if (nature === 'commun') return 50;
        if (nature === 'indivision') return 50; // default, modifiable
        return 100; // propre
    }

    // ============================================================
    // 2. QUOTE-PART SUCCESSORALE : ce qui entre dans la masse
    // ============================================================

    /**
     * Retourne le % de la valeur du bien qui entre dans la masse successorale du donateur/defunt.
     * - Commun = 50% (l'autre moitie appartient deja au conjoint)
     * - Propre donateur = 100%
     * - Propre conjoint = 0% (ne lui appartient pas)
     * - Indivision = quote-part declaree
     */
    function getQuotePartSuccessorale(immoId) {
        var entry = _bienNature[immoId];
        if (!entry) return 100; // default si pas encore set

        var nature = entry.nature || 'propre_donateur';
        if (nature === 'commun') return 50;
        if (nature === 'propre_donateur') return 100;
        if (nature === 'propre_conjoint') return 0;
        if (nature === 'indivision') return entry.quotePart || 50;
        return 100;
    }

    /**
     * Valeur dans la masse successorale = valeur * quote-part / 100
     */
    function getValeurSuccessorale(immoId, valeurBrute) {
        return Math.round((valeurBrute || 0) * getQuotePartSuccessorale(immoId) / 100);
    }

    // ============================================================
    // 3. UI - Injecter le select sur chaque immo
    // ============================================================

    function enrichImmoItems() {
        var list = document.getElementById('immo-list'); if (!list) return;
        var state = getState(); if (!state) return;

        list.querySelectorAll('.list-item').forEach(function(item) {
            if (item.querySelector('.regime-bien-block')) return; // deja injecte
            var m = item.id.match(/immo-(\d+)/); if (!m) return;
            var iid = parseInt(m[1]);
            var immoItem = (state.immo || []).find(function(i) { return i.id === iid; });
            if (!immoItem) return;

            // Initialiser la nature si pas encore fait
            if (!_bienNature[iid]) {
                var defNature = getDefaultNature(immoItem);
                _bienNature[iid] = { nature: defNature, quotePart: getDefaultQuotePart(defNature) };
            }

            var entry = _bienNature[iid];
            var regime = state.regime || 'communaute_acquets';
            var unionType = state._unionType || 'mariage';

            // Ne pas afficher si pas de couple
            var hasCoupleInfo = unionType === 'mariage' || unionType === 'pacs' || unionType === 'concubinage';
            if (!hasCoupleInfo) return;

            // Construire le HTML
            var h = '<div class="regime-bien-block" data-immo-id="' + iid + '" style="margin-top:8px;padding:10px 14px;border-radius:10px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);">';
            h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
            h += '<i class="fas fa-balance-scale" style="font-size:.6rem;color:var(--primary-color);"></i>';
            h += '<span style="font-size:.70rem;font-weight:700;color:var(--text-label);">NATURE DU BIEN (regime : ' + formatRegime(regime, unionType) + ')</span>';
            h += '</div>';

            h += '<div style="display:flex;gap:10px;align-items:center;">';
            h += '<select class="regime-bien-select" data-immo-id="' + iid + '" onchange="RegimeBiens.onNatureChange(' + iid + ',this.value)" style="font-size:.78rem;height:34px;flex:1;max-width:300px;">';
            NATURES.forEach(function(n) {
                var selected = entry.nature === n.id ? ' selected' : '';
                // Filtrer options non pertinentes
                if (unionType !== 'mariage' && n.id === 'commun' && regime !== 'communaute_universelle') return; // pas de commun hors mariage (sauf CU)
                h += '<option value="' + n.id + '"' + selected + '>' + n.label + '</option>';
            });
            h += '</select>';

            // Champ quote-part si indivision
            if (entry.nature === 'indivision') {
                h += '<div style="display:flex;align-items:center;gap:4px;">';
                h += '<input type="number" value="' + (entry.quotePart || 50) + '" min="1" max="99" ';
                h += 'onchange="RegimeBiens.onQuotePartChange(' + iid + ',+this.value)" ';
                h += 'style="font-size:.78rem;height:34px;width:60px;text-align:center;">';
                h += '<span style="font-size:.70rem;color:var(--text-muted);">%</span>';
                h += '</div>';
            }

            h += '</div>';

            // Warning / info
            h += getWarningHtml(entry.nature, regime, unionType, immoItem);

            // Afficher la valeur dans la masse
            var valeur = immoItem.valeur || 0;
            if (valeur > 0) {
                var qp = getQuotePartSuccessorale(iid);
                var valMasse = getValeurSuccessorale(iid, valeur);
                if (qp < 100) {
                    h += '<div style="margin-top:6px;font-size:.65rem;color:var(--text-secondary);display:flex;gap:12px;">';
                    h += '<span>Valeur totale : ' + fmt(valeur) + '</span>';
                    h += '<span style="color:var(--accent-green);font-weight:600;">Dans la masse : ' + fmt(valMasse) + ' (' + qp + '%)</span>';
                    h += '</div>';
                }
            }

            h += '</div>';

            // Inserer apres la checkbox affectif ou apres le form-grid
            var affectif = item.querySelector('.affectif-check');
            if (affectif) affectif.insertAdjacentHTML('afterend', h);
            else {
                var fg = item.querySelector('.form-grid');
                if (fg) fg.insertAdjacentHTML('afterend', h);
            }
        });

        // Observer les ajouts
        if (!list._regimeBienObserved) {
            var obs = new MutationObserver(function() { setTimeout(enrichImmoItems, 300); });
            obs.observe(list, { childList: true });
            list._regimeBienObserved = true;
        }
    }

    function getWarningHtml(nature, regime, unionType, immoItem) {
        var html = '';
        var mode = immoItem ? (immoItem.modeAcquisition || 'achat') : 'achat';

        // Separation + "commun" -> incohérent
        if (nature === 'commun' && regime === 'separation_biens') {
            html += '<div style="margin-top:4px;font-size:.60rem;padding:4px 8px;border-radius:6px;background:rgba(255,179,0,.06);color:var(--accent-amber);border:1px solid rgba(255,179,0,.1);">';
            html += '<i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>';
            html += 'En separation de biens, un bien ne peut etre "commun". Verifiez : indivision ?';
            html += '</div>';
        }

        // Communaute + heritage marque comme commun
        if (nature === 'commun' && (mode === 'donation' || mode === 'succession') && regime === 'communaute_acquets') {
            html += '<div style="margin-top:4px;font-size:.60rem;padding:4px 8px;border-radius:6px;background:rgba(59,130,246,.06);color:var(--accent-blue);border:1px solid rgba(59,130,246,.1);">';
            html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
            html += 'Bien recu par ' + mode + ' = propre en communaute (art. 1405 CC). Vouliez-vous dire "propre" ?';
            html += '</div>';
        }

        // Concubinage + commun
        if (nature === 'commun' && unionType === 'concubinage') {
            html += '<div style="margin-top:4px;font-size:.60rem;padding:4px 8px;border-radius:6px;background:rgba(255,107,107,.06);color:var(--accent-coral);border:1px solid rgba(255,107,107,.1);">';
            html += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>';
            html += 'Pas de communaute en concubinage. Utilisez "indivision" si achat a deux.';
            html += '</div>';
        }

        // Propre conjoint -> 0% dans la masse
        if (nature === 'propre_conjoint') {
            html += '<div style="margin-top:4px;font-size:.60rem;padding:4px 8px;border-radius:6px;background:rgba(59,130,246,.04);color:var(--accent-blue);border:1px solid rgba(59,130,246,.08);">';
            html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
            html += 'Ce bien n\'entre PAS dans la masse successorale du donateur/defunt (0%).';
            html += '</div>';
        }

        return html;
    }

    function formatRegime(regime, unionType) {
        if (unionType === 'concubinage') return 'concubinage';
        if (unionType === 'pacs') return 'PACS (sep. biens par defaut)';
        var m = {
            'communaute_acquets': 'communaute acquets',
            'communaute_universelle': 'communaute universelle',
            'separation_biens': 'separation de biens',
            'participation_acquets': 'participation acquets'
        };
        return m[regime] || regime;
    }

    // ============================================================
    // 4. EVENTS
    // ============================================================

    function onNatureChange(immoId, nature) {
        if (!_bienNature[immoId]) _bienNature[immoId] = {};
        _bienNature[immoId].nature = nature;
        _bienNature[immoId].quotePart = getDefaultQuotePart(nature);

        // Re-render ce bloc
        var block = document.querySelector('.regime-bien-block[data-immo-id="' + immoId + '"]');
        if (block) block.remove();
        enrichImmoItems();
    }

    function onQuotePartChange(immoId, pct) {
        if (!_bienNature[immoId]) _bienNature[immoId] = {};
        _bienNature[immoId].quotePart = Math.max(1, Math.min(99, pct || 50));
    }

    // ============================================================
    // 5. INTEGRATION CALCUL - Hook sur SD.calculateResults
    // ============================================================

    function adjustPatrimoine() {
        // Ajuster la synthese patrimoniale pour tenir compte des quotes-parts
        var state = getState(); if (!state) return;

        // Stocker les quotes-parts dans le state pour que les autres modules les voient
        state._bienNatures = {};
        (state.immo || []).forEach(function(b) {
            var qp = getQuotePartSuccessorale(b.id);
            state._bienNatures[b.id] = {
                nature: (_bienNature[b.id] || {}).nature || 'propre_donateur',
                quotePart: qp,
                valeurMasse: getValeurSuccessorale(b.id, b.valeur || 0)
            };
        });

        // Calculer le total ajuste
        var totalMasse = 0;
        (state.immo || []).forEach(function(b) {
            totalMasse += getValeurSuccessorale(b.id, b.valeur || 0);
        });
        state._patrimoineAjusteRegime = totalMasse;
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;

        // Hook sur calculateResults pour ajuster le patrimoine
        var _orig = SD.calculateResults;
        SD.calculateResults = function() {
            adjustPatrimoine();
            _orig.call(SD);
        };

        // Observer step changes pour injecter
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item')) {
                var step = e.target.closest('.step-item').dataset.step;
                if (step === '3') setTimeout(enrichImmoItems, 500);
            }
        });

        // Periodic check si step 3 est actif
        setInterval(function() {
            var panel = document.getElementById('step-3');
            if (panel && panel.classList.contains('active')) {
                var list = document.getElementById('immo-list');
                if (list && list.querySelectorAll('.list-item').length > 0 &&
                    list.querySelectorAll('.regime-bien-block').length === 0) {
                    enrichImmoItems();
                }
            }
        }, 2000);

        console.log('[RegimeBiens v1.0] Loaded - nature bien propre/commun/indivision');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1100); });
    else setTimeout(init, 1100);

    return {
        onNatureChange: onNatureChange,
        onQuotePartChange: onQuotePartChange,
        getQuotePartSuccessorale: getQuotePartSuccessorale,
        getValeurSuccessorale: getValeurSuccessorale,
        enrichImmoItems: enrichImmoItems,
        adjustPatrimoine: adjustPatrimoine
    };
})();
