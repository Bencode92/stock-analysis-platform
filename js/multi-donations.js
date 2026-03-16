/**
 * multi-donations.js — Permet N donations par bénéficiaire (rappel fiscal précis)
 *
 * Problème : path-optimizer.js stocke 1 seule donation par paire donateur→bénéficiaire.
 * Si Mère→Enfant1 a fait 50k€ en 2012 (hors rappel) + 30k€ en 2018 (dans rappel),
 * le total affiché devrait être 30k€ (seul dans rappel), pas 80k€.
 *
 * Solution : ce module ajoute un bouton "+" pour créer plusieurs lignes de donation.
 * Il surcharge getEffectiveDonation et getDonorDonationForBen pour sommer correctement.
 *
 * @version 1.0.0 — 2026-03-16
 */
const MultiDonations = (function() {
    'use strict';

    // Store : donorId → benId → [{montant, date, type}]
    var _store = {};

    var RAPPEL_ANS = 15;

    function key(donorId, benId) { return donorId + ':' + benId; }

    function getEntries(donorId, benId) {
        var k = key(donorId, benId);
        if (!_store[k]) _store[k] = [];
        return _store[k];
    }

    function isDonationInRappel(dateStr) {
        if (!dateStr) return true; // conservateur
        var d = new Date(dateStr), now = new Date();
        return (now - d) / (365.25 * 24 * 60 * 60 * 1000) < RAPPEL_ANS;
    }

    // Somme des donations dans le rappel 15 ans
    function getEffectiveTotal(donorId, benId) {
        var entries = getEntries(donorId, benId);
        if (entries.length === 0) return 0;
        var total = 0;
        entries.forEach(function(e) {
            if (e.montant > 0 && isDonationInRappel(e.date)) total += e.montant;
        });
        return total;
    }

    // Somme brute (toutes donations, dans ou hors rappel)
    function getRawTotal(donorId, benId) {
        var entries = getEntries(donorId, benId);
        return entries.reduce(function(s, e) { return s + (e.montant || 0); }, 0);
    }

    // ============================================================
    // CRUD
    // ============================================================

    function addDonation(donorId, benId, montant, date, type) {
        var entries = getEntries(donorId, benId);
        entries.push({ montant: +montant || 0, date: date || null, type: type || 'inconnue' });
        syncToPathOptimizer(donorId, benId);
        renderDonationRows(donorId, benId);
    }

    function updateDonation(donorId, benId, idx, field, value) {
        var entries = getEntries(donorId, benId);
        if (!entries[idx]) return;
        if (field === 'montant') entries[idx].montant = +value || 0;
        else if (field === 'date') entries[idx].date = value || null;
        else if (field === 'type') entries[idx].type = value;
        syncToPathOptimizer(donorId, benId);
        updateBarDisplay(donorId, benId);
    }

    function removeDonation(donorId, benId, idx) {
        var entries = getEntries(donorId, benId);
        entries.splice(idx, 1);
        syncToPathOptimizer(donorId, benId);
        renderDonationRows(donorId, benId);
    }

    // Sync le total effectif vers PathOptimizer (qui ne voit qu'1 montant)
    function syncToPathOptimizer(donorId, benId) {
        if (typeof PathOptimizer === 'undefined' || !PathOptimizer.updateDonorDonation) return;
        var total = getEffectiveTotal(donorId, benId);
        // Mettre le total dans le champ principal (PathOptimizer ne voit que ça)
        PathOptimizer.updateDonorDonation(+donorId, +benId, total);
    }

    // ============================================================
    // UI — Injecter les lignes de donation multiples
    // ============================================================

    function renderDonationRows(donorId, benId) {
        var containerId = 'multi-don-' + donorId + '-' + benId;
        var container = document.getElementById(containerId);
        if (!container) return;

        var entries = getEntries(donorId, benId);

        var html = '';
        entries.forEach(function(e, idx) {
            var inRappel = isDonationInRappel(e.date);
            var statusHtml = '';
            if (e.montant > 0) {
                if (e.date && !inRappel) statusHtml = '<span style="font-size:.55rem;color:var(--accent-green);white-space:nowrap;">\u2705 > 15 ans</span>';
                else if (e.date) statusHtml = '<span style="font-size:.55rem;color:var(--accent-coral);white-space:nowrap;">\u23f3 rappel</span>';
                else statusHtml = '<span style="font-size:.55rem;color:var(--accent-amber);white-space:nowrap;">\ud83d\udcc5?</span>';
            }

            html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;" class="multi-don-row">';
            html += '<input type="number" value="' + (e.montant || '') + '" min="0" step="1000" placeholder="Montant" ';
            html += 'style="font-size:.72rem;height:28px;width:100px;text-align:right;padding:2px 6px;' + (e.montant > 0 ? 'border-color:rgba(255,107,107,.25);' : '') + '" ';
            html += 'onchange="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'montant\',this.value)">';
            html += '<input type="date" value="' + (e.date || '') + '" style="font-size:.60rem;height:28px;width:120px;padding:2px 4px;" ';
            html += 'title="Date de la donation" onchange="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'date\',this.value)">';
            html += '<select style="font-size:.58rem;height:28px;width:95px;padding:0 4px;" ';
            html += 'onchange="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'type\',this.value)">';
            html += '<option value="inconnue"' + (e.type === 'inconnue' ? ' selected' : '') + '>Type?</option>';
            html += '<option value="notariee"' + (e.type === 'notariee' ? ' selected' : '') + '>Notari\u00e9e</option>';
            html += '<option value="don_manuel"' + (e.type === 'don_manuel' ? ' selected' : '') + '>Don manuel</option>';
            html += '<option value="don_familial"' + (e.type === 'don_familial' ? ' selected' : '') + '>Don familial</option>';
            html += '</select>';
            html += statusHtml;
            if (entries.length > 1) {
                html += '<button onclick="MultiDonations.removeDonation(' + donorId + ',' + benId + ',' + idx + ')" ';
                html += 'style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(255,82,82,.1);color:var(--accent-coral);cursor:pointer;font-size:.5rem;display:flex;align-items:center;justify-content:center;" title="Supprimer cette donation">';
                html += '<i class="fas fa-times"></i></button>';
            }
            html += '</div>';
        });

        // Résumé
        var effectif = getEffectiveTotal(donorId, benId);
        var raw = getRawTotal(donorId, benId);
        if (entries.length > 1 && raw > 0) {
            var horsRappel = raw - effectif;
            html += '<div style="font-size:.60rem;color:var(--text-muted);padding:2px 0;display:flex;gap:8px;">';
            html += '<span>Total brut : ' + fmt(raw) + '</span>';
            if (horsRappel > 0) html += '<span style="color:var(--accent-green);">\u2705 Hors rappel : ' + fmt(horsRappel) + '</span>';
            html += '<span style="color:var(--accent-coral);">\u23f3 Dans rappel : ' + fmt(effectif) + '</span>';
            html += '</div>';
        }

        // Bouton "+"
        html += '<button onclick="MultiDonations.addDonation(' + donorId + ',' + benId + ',0,null,\'inconnue\')" ';
        html += 'style="display:flex;align-items:center;gap:4px;padding:3px 10px;margin-top:2px;border:1px dashed rgba(255,107,107,.2);border-radius:6px;background:none;color:var(--accent-coral);font-size:.58rem;cursor:pointer;font-family:inherit;" title="Ajouter une donation ant\u00e9rieure">';
        html += '<i class="fas fa-plus" style="font-size:.45rem;"></i> Donation ant\u00e9rieure</button>';

        container.innerHTML = html;
    }

    function updateBarDisplay(donorId, benId) {
        // Mettre à jour la barre via PathOptimizer
        syncToPathOptimizer(donorId, benId);
    }

    // ============================================================
    // INJECTION — Observer les donation rows pour ajouter le conteneur multi
    // ============================================================

    function injectMultiContainers() {
        // Chercher toutes les lignes de donation existantes et ajouter un conteneur multi en dessous
        var donationInputs = document.querySelectorAll('input[onchange*="PathOptimizer.updateDonorDonation"]');
        donationInputs.forEach(function(input) {
            var match = input.getAttribute('onchange').match(/updateDonorDonation\((\d+),(\d+)/);
            if (!match) return;
            var did = match[1], bid = match[2];
            var containerId = 'multi-don-' + did + '-' + bid;
            if (document.getElementById(containerId)) return;

            // Trouver la ligne date/type juste après
            var parent = input.closest('div[style*="grid-template-columns"]');
            if (!parent) return;
            var nextRow = parent.nextElementSibling;

            // Créer le conteneur multi
            var div = document.createElement('div');
            div.id = containerId;
            div.style.cssText = 'margin-top:4px;padding:4px 0;';
            if (nextRow) nextRow.insertAdjacentElement('afterend', div);
            else parent.insertAdjacentElement('afterend', div);

            // Migrer la donation existante si montant > 0
            var entries = getEntries(did, bid);
            if (entries.length === 0) {
                var montant = +input.value || 0;
                var dateInput = nextRow ? nextRow.querySelector('input[type="date"]') : null;
                var typeSelect = nextRow ? nextRow.querySelector('select') : null;
                if (montant > 0) {
                    entries.push({
                        montant: montant,
                        date: dateInput ? dateInput.value : null,
                        type: typeSelect ? typeSelect.value : 'inconnue'
                    });
                }
            }

            // Ne rendre que s'il y a des donations multiples
            if (entries.length > 1) {
                renderDonationRows(did, bid);
                // Masquer la ligne unique originale
                if (parent) parent.style.display = 'none';
                if (nextRow) nextRow.style.display = 'none';
            }
        });
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function fmt(n) {
        if (n === undefined || n === null) return '0 \u20ac';
        return n.toLocaleString('fr-FR') + ' \u20ac';
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        // Observer le DOM pour injecter les conteneurs quand les donor cards sont rendues
        var interval = setInterval(function() {
            if (typeof PathOptimizer === 'undefined') return;
            injectMultiContainers();

            // Re-injecter quand le DOM change
            var donorsList = document.getElementById('donors-list');
            if (donorsList) {
                var obs = new MutationObserver(function() {
                    setTimeout(injectMultiContainers, 300);
                });
                obs.observe(donorsList, { childList: true, subtree: true });
            }
            clearInterval(interval);
        }, 1500);

        // Re-injecter quand on change de step
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item') || e.target.closest('.preset-btn')) {
                setTimeout(injectMultiContainers, 800);
            }
        });

        console.log('[MultiDonations v1.0] Loaded \u2014 N donations par b\u00e9n\u00e9ficiaire');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    else setTimeout(init, 1500);

    return {
        addDonation: addDonation,
        updateDonation: updateDonation,
        removeDonation: removeDonation,
        getEffectiveTotal: getEffectiveTotal,
        getRawTotal: getRawTotal,
        getEntries: getEntries,
        renderDonationRows: renderDonationRows,
        injectMultiContainers: injectMultiContainers
    };
})();
