/**
 * souhaits-partage.js — UI pour les souhaits de partage par héritier
 *
 * Injecte dans Step 4 un panneau où chaque bénéficiaire peut cocher
 * les biens qu'il souhaite recevoir en priorité.
 * → Alimente state.beneficiaries[i].souhaite = ['Appart Paris', 'Maison familiale']
 * → Lu par partage-succession.js dans composerLots()
 *
 * @version 1.0.0 — 2026-03-17
 */
const SouhaitsPartage = (function() {
    'use strict';

    // ============================================================
    // 1. COLLECTER LES BIENS DISPONIBLES
    // ============================================================

    function getBiens() {
        var state = getState(); if (!state) return [];
        var biens = [];

        (state.immo || []).forEach(function(b) {
            if (b.valeur > 0) {
                var nom = b.label || 'Bien immo #' + (b.id + 1);
                var usage = b.usageActuel === 'rp' ? 'RP' : b.usageActuel === 'locatif' ? 'Locatif' : b.usageActuel === 'rs' ? 'R\u00e9s. sec.' : 'Vacant';
                biens.push({ nom: nom, valeur: b.valeur, type: 'immo', icon: 'fa-home', color: 'var(--accent-coral)',
                    detail: usage + ' \u00b7 ' + fmt(b.valeur), affectif: !!b.affectif });
            }
        });

        (state.finance || []).forEach(function(f) {
            if ((f.montant || 0) > 0 && f.type !== 'assurance_vie' && f.type !== 'per') {
                var nom = f.nom || f.type || 'Actif financier';
                biens.push({ nom: nom, valeur: f.montant, type: 'financier', icon: 'fa-piggy-bank', color: 'var(--primary-color)',
                    detail: fmt(f.montant), affectif: false });
            }
        });

        (state.pro || []).forEach(function(p) {
            if (p.valeur > 0) {
                var nom = p.nom || 'Actif pro #' + (p.id + 1);
                biens.push({ nom: nom, valeur: Math.round(p.valeur * (p.pctDetention || 100) / 100), type: 'pro',
                    icon: 'fa-briefcase', color: 'var(--accent-purple)', detail: p.type + ' \u00b7 ' + fmt(p.valeur), affectif: false });
            }
        });

        return biens;
    }

    function getHeritiers() {
        var state = getState(); if (!state) return [];
        return (state.beneficiaries || []).map(function(b) {
            return { id: b.id, nom: b.nom || b.prenom || b.lien || 'H\u00e9ritier', lien: b.lien, souhaite: b.souhaite || [] };
        });
    }

    // ============================================================
    // 2. RENDU UI — Panneau dans Step 4
    // ============================================================

    function renderSouhaitsPanel() {
        var existing = document.getElementById('souhaits-partage-panel');
        if (existing) existing.remove();

        var biens = getBiens();
        var heritiers = getHeritiers();

        if (biens.length === 0 || heritiers.length < 2) return; // pas pertinent

        var html = '<div class="section-card" id="souhaits-partage-panel" style="border-color:rgba(167,139,250,.2);margin-top:16px;">';
        html += '<div class="section-title"><i class="fas fa-hand-pointer" style="background:linear-gradient(135deg,rgba(167,139,250,.2),rgba(167,139,250,.1));color:var(--accent-purple);"></i> Souhaits de partage</div>';
        html += '<div class="section-subtitle">Chaque h\u00e9ritier peut exprimer une pr\u00e9f\u00e9rence sur les biens qu\'il souhaite recevoir. L\'optimiseur en tiendra compte dans la simulation de partage (Step 5).</div>';

        // Un bloc par héritier
        heritiers.forEach(function(h) {
            html += '<div class="souhaits-heritier" data-ben-id="' + h.id + '" style="margin-bottom:14px;padding:14px 16px;border-radius:12px;background:rgba(167,139,250,.03);border:1px solid rgba(167,139,250,.08);">';
            html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-purple);margin-bottom:10px;display:flex;align-items:center;gap:8px;">';
            html += '<i class="fas fa-user" style="font-size:.7rem;"></i> ' + esc(h.nom);
            html += ' <span style="font-size:.62rem;color:var(--text-muted);font-weight:400;">(' + formatLien(h.lien) + ')</span>';
            if (h.souhaite.length > 0) html += ' <span style="font-size:.58rem;padding:2px 8px;border-radius:10px;background:rgba(167,139,250,.12);color:var(--accent-purple);">' + h.souhaite.length + ' souhait(s)</span>';
            html += '</div>';

            html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
            biens.forEach(function(b) {
                var isChecked = h.souhaite.indexOf(b.nom) >= 0;
                html += '<label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:.72rem;';
                html += 'background:' + (isChecked ? 'rgba(167,139,250,.1)' : 'rgba(198,134,66,.02)') + ';';
                html += 'border:1px solid ' + (isChecked ? 'rgba(167,139,250,.3)' : 'rgba(198,134,66,.08)') + ';';
                html += 'color:' + (isChecked ? 'var(--accent-purple)' : 'var(--text-secondary)') + ';';
                html += 'transition:all .15s;">';
                html += '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="SouhaitsPartage.toggleSouhait(' + h.id + ',\'' + escAttr(b.nom) + '\',this.checked)" style="accent-color:var(--accent-purple);width:14px;height:14px;cursor:pointer;">';
                html += '<i class="fas ' + b.icon + '" style="color:' + b.color + ';font-size:.55rem;"></i> ';
                html += esc(b.nom);
                if (b.affectif) html += ' <i class="fas fa-heart" style="color:var(--accent-coral);font-size:.45rem;" title="Bien sentimental"></i>';
                html += ' <span style="color:var(--text-muted);font-size:.60rem;">' + fmt(b.valeur) + '</span>';
                html += '</label>';
            });
            html += '</div>';
            html += '</div>';
        });

        // Info
        html += '<div style="font-size:.68rem;color:var(--text-muted);padding:6px 0;"><i class="fas fa-info-circle" style="margin-right:4px;color:var(--accent-purple);"></i>';
        html += 'Les souhaits ne sont pas contraignants \u2014 l\'algorithme de partage les respecte dans la limite de la part l\u00e9gale (+30% max). Les biens sentimentaux <i class="fas fa-heart" style="color:var(--accent-coral);font-size:.5rem;"></i> sont signal\u00e9s.';
        html += '</div>';

        html += '</div>';

        // Insérer après le panneau objectifs ou strategy-advisor
        var anchor = document.getElementById('strategy-advisor-container');
        if (!anchor) anchor = document.getElementById('exo-logement-section');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    // ============================================================
    // 3. TOGGLE — Mettre à jour state
    // ============================================================

    function toggleSouhait(benId, bienNom, checked) {
        var state = getState(); if (!state) return;
        var ben = (state.beneficiaries || []).find(function(b) { return b.id === benId || b.id === +benId; });
        if (!ben) return;

        if (!ben.souhaite) ben.souhaite = [];

        if (checked && ben.souhaite.indexOf(bienNom) < 0) {
            ben.souhaite.push(bienNom);
        } else if (!checked) {
            ben.souhaite = ben.souhaite.filter(function(n) { return n !== bienNom; });
        }

        // Re-render pour mettre à jour le compteur et les styles
        renderSouhaitsPanel();
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }
    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
    function formatLien(l) {
        var m = { enfant: 'Enfant', conjoint_pacs: 'Conjoint/PACS', petit_enfant: 'Petit-enfant',
            neveu_niece: 'Neveu/Ni\u00e8ce', frere_soeur: 'Fr\u00e8re/S\u0153ur', beau_enfant: 'Beau-enfant', tiers: 'Tiers' };
        return m[l] || l || '\u2014';
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        // Render quand on arrive sur Step 4
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item')) {
                var step = e.target.closest('.step-item').dataset.step;
                if (step === '4') setTimeout(renderSouhaitsPanel, 500);
            }
        });

        // Re-render si on navigue via les boutons prev/next
        var checkStep4 = setInterval(function() {
            var panel = document.getElementById('step-4');
            if (panel && panel.classList.contains('active') && !document.getElementById('souhaits-partage-panel')) {
                var biens = getBiens();
                var heritiers = getHeritiers();
                if (biens.length > 0 && heritiers.length >= 2) renderSouhaitsPanel();
            }
        }, 2000);

        console.log('[SouhaitsPartage v1.0] Loaded \u2014 pr\u00e9f\u00e9rences de partage par h\u00e9ritier');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1000); });
    else setTimeout(init, 1000);

    return { toggleSouhait: toggleSouhait, renderSouhaitsPanel: renderSouhaitsPanel };
})();
