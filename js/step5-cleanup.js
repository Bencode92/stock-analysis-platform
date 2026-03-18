/**
 * step5-cleanup.js v1.0 — Masque les panneaux legacy, garde 3 sections
 *
 * GARDE :
 * 1. succession-baseline-panel (baseline)
 * 2. succession-legale-warning (warning GP->PE)
 * 3. per-asset-results-panel (par actif + strategie combinee)
 * 4. transmission-map (cartes donateur->beneficiaire)
 *
 * MASQUE :
 * - results-hero (doublon avec baseline)
 * - strategy-card + strategy-steps (doublon avec strategie combinee)
 * - legacy-scenarios + comparison-table (tableau abstrait)
 * - per-beneficiary-detail de results-fixes (doublon)
 * - strategy-recommendations-panel
 * - fiscal-optimizations-panel
 * - inheritance-rules-panel
 * - civil-rights-panel
 * - expat-succession-panel
 * - comparison-table-unions-panel
 * - ai-narrative-summary (CORS error)
 * - path-results-wrapper (redondant avec transmission-map)
 * - results-warnings
 * - partage-succession doublon info
 * - regime-banner (integre dans baseline)
 *
 * @version 1.0.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined') { setTimeout(init, 500); return; }

        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(cleanup, 1200);
        };
        console.log('[Step5Cleanup v1.0] Loaded — masque panneaux legacy');
    }

    function cleanup() {
        // IDs a masquer completement
        var hideIds = [
            'results-hero',
            'strategy-card',
            'path-results-wrapper',
            'ai-narrative-summary',
            'results-warnings',
            'regime-banner',
            'strategy-recommendations-panel',
            'fiscal-optimizations-panel',
            'inheritance-rules-panel',
            'civil-rights-panel',
            'expat-succession-panel',
            'comparison-table-unions-panel'
        ];

        hideIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Masquer le tableau comparatif legacy (parent section-card)
        var legacyScenarios = document.getElementById('legacy-scenarios');
        if (legacyScenarios) {
            var parentCard = legacyScenarios.closest('.section-card');
            if (parentCard) parentCard.style.display = 'none';
        }

        // Masquer "Pourquoi ces scenarios" et barres
        var chartBars = document.getElementById('chart-bars');
        if (chartBars) {
            var chartParent = chartBars.closest('.chart-container');
            if (chartParent) chartParent.style.display = 'none';
        }

        // Masquer le plan d'action legacy (timeline)
        var timeline = document.getElementById('timeline');
        if (timeline) {
            var timelineCard = timeline.closest('.section-card');
            if (timelineCard) timelineCard.style.display = 'none';
        }

        // Masquer ancien "Detail par beneficiaire" si per-asset-results existe
        if (document.getElementById('per-asset-results-panel')) {
            var perBen = document.getElementById('per-beneficiary-detail');
            if (perBen) {
                var perBenCard = perBen.closest('.section-card');
                if (perBenCard) perBenCard.style.display = 'none';
            }
        }

        // Masquer "Devolution successorale" panel (inheritance-rules)
        document.querySelectorAll('#step-5 .section-card').forEach(function(card) {
            var title = card.querySelector('.section-title');
            if (!title) return;
            var text = title.textContent || '';
            if (text.indexOf('volution successorale') >= 0) card.style.display = 'none';
            if (text.indexOf('comparatif des sc') >= 0) card.style.display = 'none';
            if (text.indexOf('Optimisation des chemins') >= 0 && document.getElementById('per-asset-results-panel')) card.style.display = 'none';
        });

        // Masquer la section "Solutions d'optimisation fiscale" (fiscal-optimizations)
        document.querySelectorAll('#step-5 .section-card').forEach(function(card) {
            var title = card.querySelector('.section-title');
            if (!title) return;
            var text = title.textContent || '';
            if (text.indexOf('optimisation fiscale') >= 0) card.style.display = 'none';
            if (text.indexOf('recommandations') >= 0 && text.indexOf('Strat') >= 0) card.style.display = 'none';
        });

        // Garder uniquement :
        // 1. succession-baseline-panel
        // 2. succession-legale-warning
        // 3. per-asset-results-panel
        // 4. transmission-map (les cartes par paire)
        // 5. partage-succession-panel (si present)
        // 6. disclaimer (avertissement legal)

        console.log('[Step5Cleanup] Legacy panels hidden');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1600); });
    else setTimeout(init, 1600);
})();
