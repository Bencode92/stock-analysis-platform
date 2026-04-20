/**
 * estimation-mode.js — Mode estimation par fourchette
 *
 * Quand l'utilisateur choisit "Simulation rapide" dans l'onboarding POV :
 *   - Le champ "Montant total à transmettre" du mode simplifié
 *     est remplacé par des boutons de fourchettes (Faible / Modéré / Moyen / Élevé / Très élevé)
 *   - Le calcul utilise la valeur médiane de la fourchette
 *   - Un disclaimer indicatif est affiché
 *   - L'utilisateur peut basculer vers saisie libre à tout moment
 *
 * Dépendances : pov-onboarding.js (event 'pov:ready')
 *
 * @version 1.0.0 — 2026-04-20
 */
const EstimationMode = (function() {
    'use strict';

    // ============================================================
    // FOURCHETTES de patrimoine
    // ============================================================
    const FOURCHETTES = [
        { key: 'faible',      icon: '💵', label: 'Faible',      min: 50000,    max: 200000,   median: 120000 },
        { key: 'modere',      icon: '💰', label: 'Modéré',      min: 200000,   max: 500000,   median: 350000 },
        { key: 'moyen',       icon: '💎', label: 'Moyen',       min: 500000,   max: 1000000,  median: 750000 },
        { key: 'eleve',       icon: '🏦', label: 'Élevé',       min: 1000000,  max: 2500000,  median: 1500000 },
        { key: 'tres_eleve',  icon: '🏛️', label: 'Très élevé',  min: 2500000,  max: 10000000, median: 5000000 }
    ];

    const FOURCHETTES_RP = [
        { key: 'rp_aucune',   icon: '🏠', label: 'Pas de RP',   median: 0 },
        { key: 'rp_modeste',  icon: '🏠', label: '< 300 k€',    median: 200000 },
        { key: 'rp_moyenne',  icon: '🏡', label: '300-600 k€',  median: 450000 },
        { key: 'rp_cossue',   icon: '🏘️', label: '600 k€ - 1 M€', median: 800000 },
        { key: 'rp_luxe',     icon: '🏰', label: '> 1 M€',      median: 1500000 }
    ];

    let currentFourchetteKey = null;
    let currentRPKey = null;

    // ============================================================
    // HELPERS
    // ============================================================
    function fmt(v) {
        if (v >= 1000000) {
            const m = v / 1000000;
            return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + ' M€';
        }
        if (v >= 1000) return Math.round(v / 1000) + ' k€';
        return v + ' €';
    }

    function fmtRange(f) {
        if (!f.min && !f.max) return '';
        if (!f.min) return '< ' + fmt(f.max);
        if (!f.max) return '> ' + fmt(f.min);
        return fmt(f.min) + ' — ' + fmt(f.max);
    }

    function injectStyles() {
        if (document.getElementById('estim-styles')) return;
        const css = `
.estim-wrap {
    display: flex; flex-direction: column; gap: 10px;
    animation: estimFadeIn .3s ease-out;
}
@keyframes estimFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.estim-grid {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
}
@media (max-width: 900px) { .estim-grid { grid-template-columns: repeat(2, 1fr); } }
.estim-btn {
    padding: 12px 6px 10px; border-radius: 10px;
    border: 1px solid var(--border-input, rgba(198,134,66,0.18));
    background: rgba(198,134,66,0.03);
    color: var(--text-secondary, #CBD5E1);
    cursor: pointer; font-family: inherit;
    transition: all .2s ease;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    text-align: center;
}
.estim-btn:hover:not(.selected) {
    border-color: var(--primary-color, #C68642);
    background: rgba(198,134,66,0.07);
    transform: translateY(-1px);
}
.estim-btn.selected {
    border-color: var(--primary-color, #C68642);
    background: rgba(198,134,66,0.14);
    box-shadow: 0 0 0 1px rgba(198,134,66,0.35), 0 4px 14px rgba(198,134,66,0.2);
    color: var(--text-primary, #fff);
}
.estim-icon { font-size: 1.3rem; line-height: 1; }
.estim-label { font-size: .74rem; font-weight: 700; margin-top: 2px; }
.estim-range { font-size: .62rem; color: var(--text-muted, #8B9CB0); }
.estim-btn.selected .estim-range { color: var(--primary-light, #D4995A); }
.estim-info {
    font-size: .72rem; color: var(--text-muted, #8B9CB0);
    padding: 10px 14px;
    background: rgba(198,134,66,0.05);
    border-radius: 10px;
    border-left: 3px solid var(--accent-amber, #FFB300);
    display: flex; align-items: flex-start; gap: 8px;
    line-height: 1.5;
}
.estim-info i { color: var(--accent-amber, #FFB300); margin-top: 2px; }
.estim-toggle {
    font-size: .72rem; color: var(--primary-color, #C68642);
    background: none; border: none; cursor: pointer;
    padding: 6px 10px; border-radius: 6px;
    align-self: flex-start; font-family: inherit; font-weight: 600;
    transition: background .2s;
}
.estim-toggle:hover { background: rgba(198,134,66,0.08); }
.estim-badge {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    background: rgba(255,179,0,0.15); color: var(--accent-amber, #FFB300);
    font-size: .62rem; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; margin-left: 8px;
}
`;
        const style = document.createElement('style');
        style.id = 'estim-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // RENDERER : remplace #total-patrimoine par des fourchettes
    // ============================================================
    function buildFourchettesHTML(fourchettes, selectedKey, onClickId) {
        return `<div class="estim-grid">
            ${fourchettes.map(f => `
                <button type="button" class="estim-btn ${f.key === selectedKey ? 'selected' : ''}"
                        data-key="${f.key}" data-median="${f.median}" data-cb="${onClickId}"
                        aria-label="${f.label}">
                    <span class="estim-icon">${f.icon}</span>
                    <span class="estim-label">${f.label}</span>
                    <span class="estim-range">${f.min != null ? fmtRange(f) : fmt(f.median)}</span>
                </button>
            `).join('')}
        </div>`;
    }

    function enableOnTotalPatrimoine() {
        const input = document.getElementById('total-patrimoine');
        if (!input) return false;
        if (document.getElementById('estim-fourchette-wrap')) return true;

        injectStyles();

        const container = input.closest('.form-group') || input.parentElement;
        if (!container) return false;

        // Badge "mode estimation" sur le label
        const label = container.querySelector('.form-label');
        if (label && !label.querySelector('.estim-badge')) {
            const badge = document.createElement('span');
            badge.className = 'estim-badge';
            badge.textContent = 'Estimation';
            label.appendChild(badge);
        }

        // Ajouter le widget fourchettes
        const wrap = document.createElement('div');
        wrap.id = 'estim-fourchette-wrap';
        wrap.className = 'estim-wrap';
        wrap.innerHTML = `
            ${buildFourchettesHTML(FOURCHETTES, currentFourchetteKey, 'patrimoine')}
            <div class="estim-info">
                <i class="fas fa-info-circle"></i>
                <span>
                    <strong>Mode estimation.</strong>
                    Le calcul utilise la médiane de la fourchette choisie. Idéal si vous ne connaissez pas les chiffres exacts — affinez plus tard pour un résultat précis.
                </span>
            </div>
            <button type="button" class="estim-toggle" data-action="toggle-exact">
                <i class="fas fa-keyboard"></i> Je connais le montant exact — saisir manuellement
            </button>
        `;
        input.style.display = 'none';
        container.appendChild(wrap);

        // Handlers
        wrap.querySelectorAll('.estim-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const median = +btn.dataset.median;
                currentFourchetteKey = key;
                wrap.querySelectorAll('.estim-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                input.value = median;
                // Déclenche les événements que le code SD écoute
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });

        // Toggle pour revenir au saisie exacte
        const toggleBtn = wrap.querySelector('[data-action="toggle-exact"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                disableOnTotalPatrimoine();
            });
        }

        // Si une fourchette était déjà sélectionnée, la remettre
        if (currentFourchetteKey) {
            const btn = wrap.querySelector(`.estim-btn[data-key="${currentFourchetteKey}"]`);
            if (btn) btn.click();
        }

        return true;
    }

    function disableOnTotalPatrimoine() {
        const wrap = document.getElementById('estim-fourchette-wrap');
        if (wrap) wrap.remove();
        const input = document.getElementById('total-patrimoine');
        if (input) input.style.display = '';
        // Retire le badge
        const badge = document.querySelector('.form-label .estim-badge');
        if (badge) badge.remove();
    }

    // ============================================================
    // RENDERER RP (en complément, plus tard — stub)
    // ============================================================
    function enableOnRP() {
        const input = document.getElementById('montant-rp');
        if (!input) return false;
        if (document.getElementById('estim-rp-wrap')) return true;

        injectStyles();

        const container = input.closest('.form-group') || input.parentElement;
        if (!container) return false;

        const label = container.querySelector('.form-label');
        if (label && !label.querySelector('.estim-badge')) {
            const badge = document.createElement('span');
            badge.className = 'estim-badge';
            badge.textContent = 'Estimation';
            label.appendChild(badge);
        }

        const wrap = document.createElement('div');
        wrap.id = 'estim-rp-wrap';
        wrap.className = 'estim-wrap';
        wrap.innerHTML = buildFourchettesHTML(FOURCHETTES_RP, currentRPKey, 'rp');
        input.style.display = 'none';
        container.appendChild(wrap);

        wrap.querySelectorAll('.estim-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentRPKey = btn.dataset.key;
                wrap.querySelectorAll('.estim-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                input.value = +btn.dataset.median;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        return true;
    }

    // ============================================================
    // INIT : écoute 'pov:ready' pour s'activer auto
    // ============================================================
    function tryEnableAll() {
        // Si le step 3 (patrimoine) n'est pas encore rendu, on attend
        let tries = 0;
        const maxTries = 60; // 60 × 300ms = 18 s
        const attempt = () => {
            tries++;
            const ok1 = enableOnTotalPatrimoine();
            const ok2 = enableOnRP();
            if ((ok1 && ok2) || tries >= maxTries) return;
            setTimeout(attempt, 300);
        };
        attempt();
    }

    document.addEventListener('pov:ready', (e) => {
        const pov = e && e.detail;
        if (!pov || !pov.isEstimation) {
            // Mode détaillé → s'assurer qu'on est bien désactivés
            disableOnTotalPatrimoine();
            return;
        }
        tryEnableAll();
        // Tente à nouveau après chaque changement de step
        // (le user peut arriver en step 3 après le POV)
        const observer = new MutationObserver(() => tryEnableAll());
        observer.observe(document.body, { childList: true, subtree: true });
        // Arrêt après 30s pour éviter la surcharge
        setTimeout(() => observer.disconnect(), 30000);
    });

    // Si l'utilisateur navigue manuellement vers le step 3, retenter
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-step], .step-item, .toggle-btn');
        if (target && window.__POV__ && window.__POV__.isEstimation) {
            setTimeout(tryEnableAll, 150);
        }
    });

    return {
        FOURCHETTES, FOURCHETTES_RP,
        enableOnTotalPatrimoine, disableOnTotalPatrimoine,
        enableOnRP,
        tryEnableAll,
        getCurrent: () => ({ patrimoine: currentFourchetteKey, rp: currentRPKey })
    };
})();

if (typeof window !== 'undefined') window.EstimationMode = EstimationMode;
