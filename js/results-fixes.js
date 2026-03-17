/**
 * results-fixes.js v1.0 — Fix critique Step 5
 *
 * FIX 1: computePatrimoine ignore RegimeBiens (biens communs = 50% dans masse)
 *   -> Patch SD._fiscal.computePatrimoine pour utiliser RegimeBiens.getValeurSuccessorale()
 *   -> Les 8 scenarios utilisent maintenant la vraie masse successorale
 *
 * FIX 2: Tableau comparatif replie par defaut -> auto-deploie apres calcul
 *
 * FIX 3: Section #per-beneficiary-detail souvent vide -> genere un resume
 *
 * @version 1.0.0 — 2026-03-17
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) {
            console.warn('[ResultsFixes] SD not found, retrying...');
            setTimeout(init, 500);
            return;
        }

        // ============================================================
        // FIX 1: Patch computePatrimoine pour RegimeBiens
        // ============================================================
        var _origCompute = SD._fiscal.computePatrimoine;

        SD._fiscal.computePatrimoine = function() {
            var result = _origCompute.call(this);

            // Si RegimeBiens est charge et qu'on a des immos avec nature definie
            if (typeof RegimeBiens === 'undefined' || !RegimeBiens.getValeurSuccessorale) {
                return result;
            }

            var state = SD._fiscal.getState ? SD._fiscal.getState() : null;
            if (!state || !state.immo || state.immo.length === 0) return result;

            // Recalculer immoTotal avec les quotes-parts du regime
            var immoTotalAjuste = 0;
            var immoTotalBrut = 0;
            state.immo.forEach(function(item) {
                var valBrut = item.valeur || 0;
                immoTotalBrut += valBrut;
                immoTotalAjuste += RegimeBiens.getValeurSuccessorale(item.id, valBrut);
            });

            // Si aucun ajustement, retourner tel quel
            if (immoTotalAjuste === immoTotalBrut) return result;

            // Recalculer avec la vraie masse
            var diff = immoTotalBrut - immoTotalAjuste;
            result.immo = immoTotalAjuste;
            result.immoBrut = immoTotalBrut;
            result.actifBrut = result.actifBrut - diff;
            result.actifNet = result.actifNet - diff;

            // Stocker le delta pour les modules qui veulent savoir
            result._regimeDelta = diff;
            result._regimeApplied = true;

            return result;
        };

        console.log('[ResultsFixes v1.0] FIX 1: computePatrimoine patche pour RegimeBiens');

        // ============================================================
        // FIX 2: Auto-deployer le tableau comparatif apres calcul
        // ============================================================
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);

            // Deployer le tableau comparatif
            setTimeout(function() {
                var legacy = document.getElementById('legacy-scenarios');
                if (legacy && legacy.style.display === 'none') {
                    legacy.style.display = '';
                    // Tourner le chevron
                    var parent = legacy.parentElement;
                    if (parent) {
                        var chevron = parent.querySelector('.fa-chevron-down');
                        if (chevron) chevron.style.transform = 'rotate(180deg)';
                    }
                }

                // Aussi deployer le results-hero
                var hero = document.getElementById('results-hero');
                if (hero) hero.style.display = '';

                // Deployer strategy-card
                var strat = document.getElementById('strategy-card');
                if (strat) strat.style.display = '';

                // Si regime applique, ajouter un bandeau info
                showRegimeBanner();

                // Remplir per-beneficiary si vide
                fillPerBeneficiary();
            }, 400);
        };

        console.log('[ResultsFixes v1.0] FIX 2: Tableau comparatif auto-deploye');

        // ============================================================
        // FIX 3: Remplir per-beneficiary-detail
        // ============================================================
        function fillPerBeneficiary() {
            var container = document.getElementById('per-beneficiary-detail');
            if (!container) return;
            if (container.innerHTML.trim().length > 10) return; // deja rempli par un autre module

            var state = SD._fiscal.getState ? SD._fiscal.getState() : null;
            if (!state || !state.beneficiaries || state.beneficiaries.length === 0) return;

            var pat = SD._fiscal.computePatrimoine();
            var totalNet = pat.actifNet || 0;
            var bens = state.beneficiaries;
            var nbBens = bens.length;
            if (nbBens === 0 || totalNet <= 0) return;

            var FISCAL = SD._fiscal.getFISCAL();
            var html = '';

            bens.forEach(function(b) {
                var lien = b.lien || 'enfant';
                var abat = SD._fiscal.getAbattement(lien, false) || 0;
                var partBrute = Math.round(totalNet / nbBens);
                var base = Math.max(0, partBrute - abat);
                var droits = SD._fiscal.calcDroits(base, SD._fiscal.getBareme(lien));
                var netRecu = partBrute - droits;
                var tauxEffectif = partBrute > 0 ? Math.round(droits / partBrute * 100) : 0;

                var lienLabels = {
                    'enfant': 'Enfant', 'conjoint_pacs': 'Conjoint/PACS',
                    'petit_enfant': 'Petit-enfant', 'frere_soeur': 'Frere/Soeur',
                    'neveu_niece': 'Neveu/Niece', 'tiers': 'Tiers',
                    'arriere_petit_enfant': 'Arriere-petit-enfant'
                };
                var lienLabel = lienLabels[lien] || lien;
                var nom = b.nom || b.prenom || lienLabel;

                html += '<div style="padding:14px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.08);margin-bottom:10px;">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
                html += '<div><span style="font-weight:700;font-size:.88rem;">' + esc(nom) + '</span>';
                html += ' <span style="font-size:.65rem;color:var(--text-muted);">' + lienLabel + '</span></div>';
                html += '<div style="font-size:1rem;font-weight:800;color:var(--accent-green);">' + fmt(netRecu) + '</div>';
                html += '</div>';

                // Barre de detail
                html += '<div style="display:flex;gap:16px;font-size:.72rem;color:var(--text-secondary);">';
                html += '<span>Part brute : ' + fmt(partBrute) + '</span>';
                html += '<span>Abattement : ' + fmt(abat) + '</span>';
                html += '<span>Base taxable : ' + fmt(base) + '</span>';
                html += '<span style="color:var(--accent-coral);">Droits : ' + fmt(droits) + ' (' + tauxEffectif + '%)</span>';
                html += '</div>';

                // Barre visuelle
                var pctNet = totalNet > 0 ? Math.round(netRecu / totalNet * 100) : 0;
                html += '<div style="margin-top:8px;height:6px;border-radius:3px;background:rgba(198,134,66,.06);overflow:hidden;">';
                html += '<div style="height:100%;width:' + pctNet + '%;background:linear-gradient(90deg,var(--accent-green),var(--accent-emerald));border-radius:3px;"></div>';
                html += '</div>';
                html += '</div>';
            });

            container.innerHTML = html;
        }

        // ============================================================
        // BANNER REGIME
        // ============================================================
        function showRegimeBanner() {
            if (typeof RegimeBiens === 'undefined') return;
            var existing = document.getElementById('regime-banner');
            if (existing) existing.remove();

            var pat = SD._fiscal.computePatrimoine();
            if (!pat._regimeApplied) return;

            var delta = pat._regimeDelta || 0;
            if (delta <= 0) return;

            var html = '<div id="regime-banner" class="warning-box info" style="margin-bottom:16px;">';
            html += '<i class="fas fa-balance-scale"></i>';
            html += '<span><strong>Regime matrimonial applique</strong> : ' + fmt(delta) + ' exclus de la masse (part du conjoint sur les biens communs). ';
            html += 'Masse successorale ajustee = ' + fmt(pat.actifNet) + ' au lieu de ' + fmt(pat.actifNet + delta) + '.';
            html += '<br><span style="font-size:.70rem;color:var(--text-muted);">Art. 1401+ CC — seule la quote-part du defunt est taxable.</span>';
            html += '</span></div>';

            // Inserer avant le hero
            var hero = document.getElementById('results-hero');
            if (hero) hero.insertAdjacentHTML('beforebegin', html);
            else {
                var map = document.getElementById('transmission-map');
                if (map) map.insertAdjacentHTML('beforebegin', html);
            }
        }

        // ============================================================
        // HELPERS
        // ============================================================
        function fmt(n) { return SD._fiscal.fmt(n); }
        function esc(s) { return SD._fiscal.esc(s); }
    }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1200); });
    } else {
        setTimeout(init, 1200);
    }
})();
