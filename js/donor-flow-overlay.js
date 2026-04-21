/**
 * donor-flow-overlay.js — Overlay SVG des flèches "donateur → bénéficiaire"
 *
 * Dessine un 2e calque SVG par-dessus l'arbre familial existant pour
 * matérialiser visuellement QUI donne à QUI :
 *   - 🟢 Vert plein     : transmission directe (parent → enfant)
 *   - 🟡 Jaune pointillé : génération sautée (GP → petit-enfant) — économie d'abattement
 *   - 🔵 Bleu           : transmission au conjoint
 *
 * + Bandeau au-dessus de l'arbre : détection auto des chemins de génération
 *   sautée et estimation des économies fiscales.
 *
 * Réutilise :
 *   - FamilyGraph.getDonors() / getBeneficiaries() / computeFiscalLien()
 *   - Le canvas .ft-canvas et les nodes .ft-node[data-pid] déjà rendus
 *   - L'event 'pov:ready' pour s'activer après l'onboarding
 *
 * Non-destructif : 100% additif, n'altère pas le SVG existant (.ft-svg).
 *
 * @version 1.0.0 — 2026-04-21
 */
const DonorFlowOverlay = (function() {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const OVERLAY_CLASS = 'dfo-svg';
    const BANNER_ID = 'dfo-banner';
    let _redrawTO = null;
    let _observer = null;

    // ============================================================
    // CONFIG : couleurs et abattements de référence (FALLBACK)
    // ============================================================
    const ABATTEMENTS_FALLBACK = {
        enfant:                   100000,
        petit_enfant:              31865,
        arriere_petit_enfant:       5310,
        conjoint_pacs_donation:    80724,
        conjoint_pacs_succession: Infinity,
        frere_soeur:               15932,
        neveu_niece:                7967,
        tiers:                      1594
    };

    function getAbat(lien) {
        try {
            if (typeof window.__FISCAL__ !== 'undefined' && window.__FISCAL__.abattements) {
                const a = window.__FISCAL__.abattements[lien];
                if (typeof a === 'number') return a;
            }
        } catch (e) { /* ignore */ }
        return ABATTEMENTS_FALLBACK[lien] != null ? ABATTEMENTS_FALLBACK[lien] : 1594;
    }

    function fmt(v) {
        if (v == null || !isFinite(v)) return '—';
        return new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' €';
    }

    // ============================================================
    // STYLES (injection unique)
    // ============================================================
    function injectStyles() {
        if (document.getElementById('dfo-styles')) return;
        const css = `
/* Élargit le canvas de l'arbre pour donner de l'air aux flèches */
#family-persons-list .ft-canvas.ft-levels {
    min-width: min(100%, 1100px) !important;
    padding: 36px 48px !important;
}
.${OVERLAY_CLASS} {
    position: absolute; left: 0; top: 0; pointer-events: none;
    z-index: 2;  /* au-dessus du .ft-svg (z=0) et des .ft-node (z=1) */
    overflow: visible;
}
.dfo-path { fill: none; transition: stroke-width .2s; }
.dfo-path.dfo-direct      { stroke: rgba(16,185,129,.55); stroke-width: 1.6; }
.dfo-path.dfo-skip        { stroke: rgba(255,179,0,.85); stroke-width: 1.8; stroke-dasharray: 5 4; }
.dfo-path.dfo-conjoint    { stroke: rgba(59,130,246,.6); stroke-width: 1.6; }
.dfo-path.dfo-other       { stroke: rgba(167,139,250,.5); stroke-width: 1.4; stroke-dasharray: 3 3; }
.dfo-arrow { fill: currentColor; }
.dfo-label {
    font-size: 10px; font-weight: 700;
    fill: rgba(255,179,0,.95);
    paint-order: stroke; stroke: rgba(25,21,16,.85); stroke-width: 3px;
    pointer-events: none;
}
#${BANNER_ID} {
    margin: 8px 0 14px;
    padding: 12px 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255,179,0,.1), rgba(198,134,66,.06));
    border: 1px solid rgba(255,179,0,.25);
    color: var(--text-primary, #fff);
    display: flex; align-items: center; gap: 12px;
    font-size: .82rem; line-height: 1.4;
    animation: dfoFadeIn .35s ease-out;
}
@keyframes dfoFadeIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
#${BANNER_ID} .dfo-banner-icon {
    font-size: 1.35rem;
    background: rgba(255,179,0,.18);
    width: 36px; height: 36px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
#${BANNER_ID} strong { color: var(--accent-amber, #FFB300); }
#${BANNER_ID} .dfo-banner-amount {
    margin-left: auto;
    padding: 6px 12px; border-radius: 20px;
    background: rgba(16,185,129,.12); color: var(--accent-green, #10B981);
    font-weight: 800; font-size: .82rem;
    white-space: nowrap;
}
.dfo-legend {
    display: flex; gap: 14px; flex-wrap: wrap;
    margin-top: 8px;
    font-size: .68rem; color: var(--text-muted, #8B9CB0);
}
.dfo-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.dfo-legend-swatch {
    width: 22px; height: 3px; border-radius: 2px; flex-shrink: 0;
}
`;
        const s = document.createElement('style');
        s.id = 'dfo-styles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ============================================================
    // CALCUL DES PAIRES donateur → bénéficiaire
    // ============================================================
    function computePairs() {
        if (typeof FamilyGraph === 'undefined') return [];
        const donors = FamilyGraph.getDonors();
        const bens = FamilyGraph.getBeneficiaries();
        if (!donors.length || !bens.length) return [];

        const pairs = [];
        donors.forEach(d => {
            bens.forEach(b => {
                if (d.id === b.id) return;
                let lien = 'tiers';
                try { lien = FamilyGraph.computeFiscalLien(d.id, b.id) || 'tiers'; } catch (e) {}
                const lienNorm = lien.replace(/-/g, '_');
                let category = null;
                // ⚠️ On NE DESSINE PAS les flux 'direct' (parent→enfant) :
                // l'arbre généalogique existant montre déjà cette relation,
                // les flèches en plus créent du bruit visuel inutile.
                if (lienNorm === 'petit_enfant' || lienNorm === 'arriere_petit_enfant') category = 'skip';
                else if (lienNorm.startsWith('conjoint')) category = 'conjoint';
                else if (lienNorm === 'frere_soeur' || lienNorm === 'neveu_niece') category = 'other';
                else if (lienNorm === 'tiers' || lienNorm === 'enfant') return; // skip
                if (!category) return;
                pairs.push({
                    from: d, to: b,
                    lien: lienNorm,
                    category,
                    abat: getAbat(lienNorm)
                });
            });
        });
        return pairs;
    }

    // ============================================================
    // GÉOMÉTRIE : récupère bbox d'un node depuis son data-pid
    // ============================================================
    function getNodeRect(canvas, personId) {
        const el = canvas.querySelector('.ft-node[data-pid="' + personId + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        return {
            x: r.left - c.left,
            y: r.top - c.top,
            w: r.width,
            h: r.height,
            cx: r.left - c.left + r.width / 2,
            cy: r.top - c.top + r.height / 2,
            top:    r.top - c.top,
            bottom: r.top - c.top + r.height,
            left:   r.left - c.left,
            right:  r.left - c.left + r.width
        };
    }

    // ============================================================
    // DESSIN d'une courbe Bézier orientée donateur → bénéficiaire
    // ============================================================
    /**
     * Construit un path Bézier qui ÉVITE les nodes intermédiaires (notamment la rangée des parents).
     * Pour la génération sautée (GP → PE), on sort PAR LE CÔTÉ :
     *   - si le bénéficiaire est à gauche du donateur → sweep par la gauche
     *   - si à droite → sweep par la droite
     *   - si en-dessous strict → on sort du côté le plus proche de l'arête
     */
    function buildPath(from, to, offsetIdx, total, category, canvasW) {
        const goingRight = to.cx > from.cx;
        const goingDown = to.cy > from.cy;

        if (category === 'skip') {
            // On part du CÔTÉ du donateur (pas du centre-bas), ce qui évite
            // immédiatement de plonger sur la rangée des parents.
            const sx = goingRight ? from.right - 6 : from.left + 6;
            const sy = from.cy;
            // On arrive par le HAUT du bénéficiaire, légèrement du côté "intérieur"
            const ex = to.cx + (goingRight ? -6 : 6);
            const ey = to.top - 6;

            // Largeur de la déviation latérale : proportionnelle au dx ET à la largeur canvas
            const dx = Math.abs(ex - sx);
            const sideBase = Math.max(60, Math.min(dx * 0.45, (canvasW || 800) * 0.18));
            const sideSign = goingRight ? 1 : -1;

            // Deux control points en dehors de la rangée parents :
            //   ctrl1 : au niveau du donateur, poussé latéralement
            //   ctrl2 : au niveau du bénéficiaire, poussé latéralement
            const ctrl1x = sx + sideSign * sideBase;
            const ctrl1y = sy + 20;  // tire vers le bas pour sortir du bandeau donateur
            const ctrl2x = ex + sideSign * sideBase * 0.75;
            const ctrl2y = ey - 40;  // remonte depuis l'extérieur vers l'enfant
            return `M ${sx} ${sy} C ${ctrl1x} ${ctrl1y}, ${ctrl2x} ${ctrl2y}, ${ex} ${ey}`;
        }

        // Conjoint : arc latéral doux (reste proche de la rangée)
        if (category === 'conjoint') {
            const sx = goingRight ? from.right : from.left;
            const ex = goingRight ? to.left    : to.right;
            const sy = from.cy;
            const ey = to.cy;
            const midY = (sy + ey) / 2;
            const sideSign = goingRight ? 1 : -1;
            const sideAmp = Math.max(20, Math.abs(ex - sx) * 0.15);
            return `M ${sx} ${sy} Q ${(sx+ex)/2 + sideSign * sideAmp} ${midY}, ${ex} ${ey}`;
        }

        // Autres (frère/sœur, neveu/nièce) : courbe simple, pointillée côté CSS
        let spread = 0;
        if (total > 1) {
            spread = (offsetIdx - (total - 1) / 2) * Math.min(16, from.w / (total + 1));
        }
        const sx = from.cx + spread;
        const ex = to.cx - spread * 0.5;
        const startY = goingDown ? from.bottom + 2 : from.top - 2;
        const endY   = goingDown ? to.top - 6      : to.bottom + 6;
        const dy = Math.abs(endY - startY);
        const c1y = startY + (goingDown ? dy * 0.5 : -dy * 0.5);
        const c2y = endY   - (goingDown ? dy * 0.5 : -dy * 0.5);
        return `M ${sx} ${startY} C ${sx} ${c1y}, ${ex} ${c2y}, ${ex} ${endY}`;
    }

    function makeArrowMarker(svg, id, color) {
        const defs = svg.querySelector('defs') || (() => {
            const d = document.createElementNS(SVG_NS, 'defs');
            svg.appendChild(d);
            return d;
        })();
        if (defs.querySelector('#' + id)) return;
        const marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '8');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '7');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', color);
        path.setAttribute('opacity', '0.85');
        marker.appendChild(path);
        defs.appendChild(marker);
    }

    // ============================================================
    // RENDER OVERLAY (SVG par-dessus le canvas)
    // ============================================================
    function render() {
        injectStyles();

        const canvas = document.querySelector('#family-persons-list .ft-canvas');
        if (!canvas) { renderBanner([]); return; }

        // Nettoie l'ancien overlay
        canvas.querySelectorAll('.' + OVERLAY_CLASS).forEach(s => s.remove());

        const pairs = computePairs();
        if (pairs.length === 0) { renderBanner([]); return; }

        const w = canvas.scrollWidth;
        const h = canvas.scrollHeight;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', OVERLAY_CLASS);
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.style.width = w + 'px';
        svg.style.height = h + 'px';

        // Marqueurs de flèche par couleur
        makeArrowMarker(svg, 'dfo-arrow-direct',   '#10B981');
        makeArrowMarker(svg, 'dfo-arrow-skip',     '#FFB300');
        makeArrowMarker(svg, 'dfo-arrow-conjoint', '#3B82F6');
        makeArrowMarker(svg, 'dfo-arrow-other',    '#A78BFA');

        const skipPaths = [];

        // Regroupe les paires par donateur pour permettre l'étalement horizontal
        const byDonor = {};
        pairs.forEach(p => {
            const k = p.from.id;
            if (!byDonor[k]) byDonor[k] = [];
            byDonor[k].push(p);
        });

        Object.keys(byDonor).forEach(donorId => {
            const list = byDonor[donorId];
            list.forEach((pair, idx) => {
                const from = getNodeRect(canvas, pair.from.id);
                const to   = getNodeRect(canvas, pair.to.id);
                if (!from || !to) return;

                const d = buildPath(from, to, idx, list.length, pair.category, w);
                const path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', 'dfo-path dfo-' + pair.category);
                path.setAttribute('marker-end', 'url(#dfo-arrow-' + pair.category + ')');
                svg.appendChild(path);

                if (pair.category === 'skip') skipPaths.push(pair);
            });
        });

        // Labels uniquement en HAUT de chaque bénéficiaire recevant une génération sautée
        // → 1 label par PE (somme des abattements), pas 1 par flèche
        const benAggregate = {};
        skipPaths.forEach(p => {
            const k = p.to.id;
            if (!benAggregate[k]) benAggregate[k] = { ben: p.to, total: 0, count: 0 };
            benAggregate[k].total += isFinite(p.abat) ? p.abat : 0;
            benAggregate[k].count++;
        });
        Object.keys(benAggregate).forEach(bid => {
            const agg = benAggregate[bid];
            const rect = getNodeRect(canvas, agg.ben.id);
            if (!rect) return;
            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', rect.cx);
            text.setAttribute('y', rect.top - 8);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'dfo-label');
            const label = agg.count > 1
                ? '+ ' + fmt(agg.total) + ' abat. (×' + agg.count + ' GP)'
                : '+ ' + fmt(agg.total) + ' abat.';
            text.textContent = label;
            svg.appendChild(text);
        });

        canvas.appendChild(svg);
        renderBanner(skipPaths);
    }

    // ============================================================
    // BANDEAU "génération sautée détectée"
    // ============================================================
    function renderBanner(skipPaths) {
        const treeContainer = document.getElementById('family-persons-list');
        if (!treeContainer) return;

        const old = document.getElementById(BANNER_ID);
        if (old) old.remove();

        if (!skipPaths || skipPaths.length === 0) return;

        const totalEcon = skipPaths.reduce((s, p) => s + (isFinite(p.abat) ? p.abat : 0), 0);

        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.innerHTML = `
            <div class="dfo-banner-icon">✨</div>
            <div>
                <strong>${skipPaths.length} chemin${skipPaths.length > 1 ? 's' : ''} de génération sautée détecté${skipPaths.length > 1 ? 's' : ''}.</strong><br>
                <span style="font-size:.74rem;color:var(--text-muted,#8B9CB0);">
                    Vos grands-parents peuvent donner directement aux petits-enfants — abattement enfant <strong>non consommé</strong>, abattement petit-enfant en plus.
                </span>
                <div class="dfo-legend">
                    <span class="dfo-legend-item"><span class="dfo-legend-swatch" style="background:rgba(16,185,129,.55);"></span>Direct</span>
                    <span class="dfo-legend-item"><span class="dfo-legend-swatch" style="background:rgba(255,179,0,.85);outline:1px dashed rgba(255,179,0,.85);outline-offset:-1px;"></span>Génération sautée</span>
                    <span class="dfo-legend-item"><span class="dfo-legend-swatch" style="background:rgba(59,130,246,.6);"></span>Conjoint</span>
                </div>
            </div>
            <div class="dfo-banner-amount" title="Somme des abattements petit-enfant disponibles via génération sautée">
                +${fmt(totalEcon)} d'abattement
            </div>
        `;
        treeContainer.parentNode.insertBefore(banner, treeContainer);
    }

    // ============================================================
    // SCHEDULER : debounce + observer + events
    // ============================================================
    function scheduleRender() {
        clearTimeout(_redrawTO);
        _redrawTO = setTimeout(render, 120);
    }

    function attachObserver() {
        if (_observer) return;
        const tree = document.getElementById('family-persons-list');
        if (!tree) return;
        _observer = new MutationObserver(() => scheduleRender());
        _observer.observe(tree, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-pid'] });
    }

    function init() {
        injectStyles();
        attachObserver();
        // Premier render après que l'arbre ait eu le temps de s'afficher
        setTimeout(scheduleRender, 600);
        // Resize → redraw
        window.addEventListener('resize', scheduleRender, { passive: true });
        // Fonts loaded → recalcul des positions
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleRender).catch(() => {});
        }
        // Re-render après onboarding POV
        document.addEventListener('pov:ready', () => setTimeout(scheduleRender, 800));
        // Re-render après chaque toggle des rôles donateur/bénéf
        document.addEventListener('change', (e) => {
            if (e.target && e.target.matches && e.target.matches('input[type=checkbox]')) {
                const onChange = e.target.getAttribute('onchange') || '';
                if (onChange.indexOf('toggleRole') >= 0) scheduleRender();
            }
        });
        document.addEventListener('click', (e) => {
            const t = e.target && e.target.closest && e.target.closest('.preset-btn, .ft-ctx-item');
            if (t) setTimeout(scheduleRender, 400);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { render, scheduleRender, computePairs };
})();

if (typeof window !== 'undefined') window.DonorFlowOverlay = DonorFlowOverlay;
