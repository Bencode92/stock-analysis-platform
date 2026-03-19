/**
 * multi-donations.js v2.1 — Fix injection: remove activeElement guard + periodic retry
 *
 * v2.1 fixes:
 * - REMOVED activeElement guard from injectMultiContainers (it only creates new divs,
 *   never modifies existing inputs — no risk of focus loss)
 * - Added periodic retry every 2s for first 30s to catch late-rendered cards
 * - Added step-change listener for Steps 2→anything to re-inject
 *
 * @version 2.1.0 — 2026-03-19
 */
const MultiDonations = (function() {
    'use strict';

    var _store = {};
    var RAPPEL_ANS = 15;
    var _injecting = false;

    function key(donorId, benId) { return donorId + ':' + benId; }

    function getEntries(donorId, benId) {
        var k = key(donorId, benId);
        if (!_store[k]) _store[k] = [];
        return _store[k];
    }

    function isDonationInRappel(dateStr) {
        if (!dateStr) return true;
        var d = new Date(dateStr), now = new Date();
        return (now - d) / (365.25 * 24 * 60 * 60 * 1000) < RAPPEL_ANS;
    }

    function getEffectiveTotal(donorId, benId) {
        var entries = getEntries(donorId, benId);
        var total = 0;
        entries.forEach(function(e) {
            if (e.montant > 0 && isDonationInRappel(e.date)) total += e.montant;
        });
        return total;
    }

    function getRawTotal(donorId, benId) {
        return getEntries(donorId, benId).reduce(function(s, e) { return s + (e.montant || 0); }, 0);
    }

    // ============================================================
    // CRUD
    // ============================================================
    function addDonation(donorId, benId, montant, date, type) {
        getEntries(donorId, benId).push({ montant: +montant || 0, date: date || null, type: type || 'inconnue' });
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
        updateSummaryDisplay(donorId, benId);
    }

    function removeDonation(donorId, benId, idx) {
        getEntries(donorId, benId).splice(idx, 1);
        syncToPathOptimizer(donorId, benId);
        renderDonationRows(donorId, benId);
    }

    function syncToPathOptimizer(donorId, benId) {
        if (typeof PathOptimizer === 'undefined' || !PathOptimizer.updateDonorDonation) return;
        var total = getEffectiveTotal(donorId, benId);
        PathOptimizer._skipRender = true;
        PathOptimizer.updateDonorDonation(+donorId, +benId, total);
        setTimeout(function() { PathOptimizer._skipRender = false; }, 100);
    }

    // ============================================================
    // UI — Render donation rows
    // ============================================================
    function renderDonationRows(donorId, benId) {
        var containerId = 'multi-don-' + donorId + '-' + benId;
        var container = document.getElementById(containerId);
        if (!container) return;

        var entries = getEntries(donorId, benId);
        var lienFiscal = getLienForPair(donorId, benId);
        var abat = getAbatForLien(lienFiscal);

        var html = '';

        html += '<div style="font-size:.62rem;font-weight:700;color:var(--accent-coral);margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
        html += '<i class="fas fa-history" style="font-size:.55rem;"></i> Donations ant\u00e9rieures';
        if (entries.length > 0) html += ' <span style="font-size:.55rem;color:var(--text-muted);">(' + entries.length + ' enregistr\u00e9e' + (entries.length > 1 ? 's' : '') + ')</span>';
        html += '</div>';

        entries.forEach(function(e, idx) {
            var inRappel = isDonationInRappel(e.date);
            var badgeHtml = '';
            if (e.montant > 0) {
                if (e.date && !inRappel) badgeHtml = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);white-space:nowrap;">\u2705 Hors rappel (> 15 ans)</span>';
                else if (e.date) badgeHtml = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(255,107,107,.1);color:var(--accent-coral);white-space:nowrap;">\u23f3 Dans rappel (' + yearsAgo(e.date) + ' ans)</span>';
                else badgeHtml = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(255,179,0,.1);color:var(--accent-amber);white-space:nowrap;">\ud83d\udcc5 Date ? (compt\u00e9 dans rappel)</span>';
            }

            html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;padding:4px 6px;border-radius:6px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.04);">';
            html += '<span style="font-size:.55rem;color:var(--text-muted);width:14px;text-align:center;">#' + (idx + 1) + '</span>';
            html += '<input type="number" value="' + (e.montant || '') + '" min="0" step="1000" placeholder="Montant \u20ac" style="font-size:.72rem;height:28px;width:90px;text-align:right;padding:2px 6px;' + (e.montant > 0 ? 'border-color:rgba(255,107,107,.25);' : '') + '" onblur="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'montant\',this.value)">';
            html += '<input type="date" value="' + (e.date || '') + '" style="font-size:.58rem;height:28px;width:115px;padding:2px 4px;" onblur="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'date\',this.value)">';
            html += '<select style="font-size:.56rem;height:28px;width:85px;padding:0 4px;" onchange="MultiDonations.updateDonation(' + donorId + ',' + benId + ',' + idx + ',\'type\',this.value)">';
            html += '<option value="inconnue"' + (e.type === 'inconnue' ? ' selected' : '') + '>Type?</option>';
            html += '<option value="notariee"' + (e.type === 'notariee' ? ' selected' : '') + '>Notari\u00e9e</option>';
            html += '<option value="don_manuel"' + (e.type === 'don_manuel' ? ' selected' : '') + '>Don manuel</option>';
            html += '<option value="don_familial"' + (e.type === 'don_familial' ? ' selected' : '') + '>Don familial</option>';
            html += '</select>';
            html += badgeHtml;
            html += '<button onclick="MultiDonations.removeDonation(' + donorId + ',' + benId + ',' + idx + ')" style="width:20px;height:20px;border-radius:5px;border:none;background:rgba(255,82,82,.08);color:var(--accent-coral);cursor:pointer;font-size:.45rem;display:flex;align-items:center;justify-content:center;" title="Supprimer"><i class="fas fa-times"></i></button>';
            html += '</div>';
        });

        html += '<button onclick="MultiDonations.addDonation(' + donorId + ',' + benId + ',0,null,\'inconnue\')" style="display:flex;align-items:center;gap:5px;padding:4px 12px;margin-top:4px;border:1px dashed rgba(255,107,107,.25);border-radius:6px;background:rgba(255,107,107,.03);color:var(--accent-coral);font-size:.60rem;cursor:pointer;font-family:inherit;" onmouseover="this.style.background=\'rgba(255,107,107,.08)\'" onmouseout="this.style.background=\'rgba(255,107,107,.03)\'">';
        html += '<i class="fas fa-plus" style="font-size:.45rem;"></i> Ajouter une donation ant\u00e9rieure</button>';

        html += '<div id="multi-don-summary-' + donorId + '-' + benId + '">';
        html += buildSummaryHtml(donorId, benId, abat);
        html += '</div>';

        container.innerHTML = html;
    }

    function buildSummaryHtml(donorId, benId, abat) {
        var entries = getEntries(donorId, benId);
        var effectif = getEffectiveTotal(donorId, benId);
        var raw = getRawTotal(donorId, benId);
        var horsRappel = raw - effectif;
        var restant = Math.max(0, abat - effectif);
        var pct = abat > 0 ? Math.min(100, (effectif / abat) * 100) : 0;
        if (entries.length === 0) return '';

        var h = '<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);font-size:.62rem;">';
        if (horsRappel > 0 && effectif > 0) {
            h += '<div style="display:flex;gap:12px;margin-bottom:4px;flex-wrap:wrap;">';
            h += '<span style="color:var(--accent-green);">\u2705 Hors rappel : ' + fmt(horsRappel) + ' (non compt\u00e9)</span>';
            h += '<span style="color:var(--accent-coral);">\u23f3 Dans rappel : ' + fmt(effectif) + ' (consomme l\'abattement)</span>';
            h += '</div>';
        } else if (effectif > 0) {
            h += '<div style="margin-bottom:4px;color:var(--accent-coral);">\u23f3 Total dans rappel : ' + fmt(effectif) + '</div>';
        } else if (horsRappel > 0) {
            h += '<div style="margin-bottom:4px;color:var(--accent-green);">\u2705 Toutes hors rappel (' + fmt(horsRappel) + '). Abattement intact.</div>';
        }
        h += '<div style="display:flex;align-items:center;gap:8px;">';
        h += '<div style="flex:1;height:6px;border-radius:3px;background:rgba(198,134,66,.08);overflow:hidden;">';
        var barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';
        h += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;"></div>';
        h += '</div>';
        h += '<div style="white-space:nowrap;font-weight:600;color:' + (restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)') + ';">';
        h += restant > 0 ? 'Restant : ' + fmt(restant) : '\u26a0\ufe0f \u00c9puis\u00e9';
        h += ' <span style="color:var(--text-muted);font-weight:400;">/ ' + fmt(abat) + '</span></div></div>';
        if (effectif > 0 && restant > 0) {
            h += '<div style="margin-top:4px;color:var(--text-muted);font-size:.58rem;">\ud83d\udca1 Encore <strong style="color:var(--accent-green);">' + fmt(restant) + '</strong> sans droits.</div>';
        } else if (effectif > 0 && restant === 0) {
            var oldest = getOldestInRappel(donorId, benId);
            if (oldest) { var rd = new Date(oldest); rd.setFullYear(rd.getFullYear() + 15); h += '<div style="margin-top:4px;color:var(--text-muted);font-size:.58rem;">\ud83d\udcc5 Renouvellement : <strong>' + rd.toLocaleDateString('fr-FR') + '</strong></div>'; }
        }
        h += '</div>';
        return h;
    }

    function updateSummaryDisplay(donorId, benId) {
        var el = document.getElementById('multi-don-summary-' + donorId + '-' + benId);
        if (!el) return;
        el.innerHTML = buildSummaryHtml(donorId, benId, getAbatForLien(getLienForPair(donorId, benId)));
        var mainInput = document.querySelector('input[onchange*="updateDonorDonation(' + donorId + ',' + benId + ')"]');
        if (mainInput) mainInput.value = getEffectiveTotal(donorId, benId);
    }

    // ============================================================
    // INJECTION — v2.1: NO activeElement guard + periodic retry
    // ============================================================
    var _debounceTimer = null;

    function injectMultiContainers() {
        // v2.1: REMOVED activeElement guard — injection only CREATES new divs,
        // never modifies existing inputs, so there's no focus loss risk
        if (_injecting) return;
        _injecting = true;

        var injected = 0;
        var donationInputs = document.querySelectorAll('input[onchange*="PathOptimizer.updateDonorDonation"]');
        donationInputs.forEach(function(input) {
            var match = input.getAttribute('onchange').match(/updateDonorDonation\((\d+),(\d+)/);
            if (!match) return;
            var did = match[1], bid = match[2];
            var containerId = 'multi-don-' + did + '-' + bid;
            if (document.getElementById(containerId)) return; // already injected

            var parent = input.closest('div[style*="grid-template-columns"]');
            if (!parent) return;
            var nextRow = parent.nextElementSibling;

            var div = document.createElement('div');
            div.id = containerId;
            div.style.cssText = 'margin-top:6px;padding:6px 0;';
            if (nextRow) nextRow.insertAdjacentElement('afterend', div);
            else parent.insertAdjacentElement('afterend', div);

            var entries = getEntries(did, bid);
            if (entries.length === 0) {
                var montant = +input.value || 0;
                var dateInput = nextRow ? nextRow.querySelector('input[type="date"]') : null;
                var typeSelect = nextRow ? nextRow.querySelector('select') : null;
                if (montant > 0) {
                    entries.push({ montant: montant, date: dateInput ? dateInput.value : null, type: typeSelect ? typeSelect.value : 'inconnue' });
                }
            }

            renderDonationRows(did, bid);
            injected++;

            if (entries.length > 0) {
                if (parent) parent.style.display = 'none';
                if (nextRow) nextRow.style.display = 'none';
            }
        });

        if (injected > 0) console.log('[MultiDonations v2.1] Injected ' + injected + ' containers');
        _injecting = false;
    }

    function injectDebounced() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(injectMultiContainers, 500);
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function getLienForPair(donorId, benId) {
        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.getEffectiveLien) {
            var donors = PathOptimizer.getDonors();
            var d = donors.find(function(dd) { return dd.id === +donorId; });
            if (d) {
                var bens = PathOptimizer.getBeneficiaries();
                var b = bens.find(function(bb) { return String(bb.id) === String(benId); });
                if (b) return PathOptimizer.getEffectiveLien(d.id, b.id, d.role, b.lien);
            }
        }
        return 'enfant';
    }

    function getAbatForLien(lien) {
        return { enfant:100000, petit_enfant:31865, arriere_petit_enfant:5310, conjoint_pacs_donation:80724, frere_soeur:15932, neveu_niece:7967, tiers:1594 }[lien] || 1594;
    }

    function yearsAgo(dateStr) {
        if (!dateStr) return '?';
        return Math.floor((new Date() - new Date(dateStr)) / (365.25 * 24 * 60 * 60 * 1000));
    }

    function getOldestInRappel(donorId, benId) {
        var oldest = null;
        getEntries(donorId, benId).forEach(function(e) {
            if (e.date && isDonationInRappel(e.date) && (!oldest || new Date(e.date) < new Date(oldest))) oldest = e.date;
        });
        return oldest;
    }

    function fmt(n) { return (n == null ? 0 : n).toLocaleString('fr-FR') + ' \u20ac'; }

    // ============================================================
    // INIT — v2.1: periodic retry for 30s + step change listener
    // ============================================================
    function init() {
        if (typeof PathOptimizer === 'undefined') { setTimeout(init, 500); return; }

        // Initial injection
        injectMultiContainers();

        // MutationObserver on donors-list
        var donorsList = document.getElementById('donors-list');
        if (donorsList) {
            new MutationObserver(injectDebounced).observe(donorsList, { childList: true, subtree: true });
        }

        // v2.1: Periodic retry every 2s for first 30s (catches late-rendered cards)
        var retryCount = 0;
        var retryInterval = setInterval(function() {
            injectMultiContainers();
            retryCount++;
            if (retryCount >= 15) clearInterval(retryInterval);
        }, 2000);

        // v2.1: Re-inject on ANY step navigation
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item') || e.target.closest('.preset-btn') || e.target.closest('.btn-primary') || e.target.closest('.btn-secondary')) {
                setTimeout(injectMultiContainers, 600);
                setTimeout(injectMultiContainers, 1500);
            }
        });

        console.log('[MultiDonations v2.1] Loaded');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    else setTimeout(init, 1500);

    return { addDonation:addDonation, updateDonation:updateDonation, removeDonation:removeDonation, getEffectiveTotal:getEffectiveTotal, getRawTotal:getRawTotal, getEntries:getEntries, renderDonationRows:renderDonationRows, injectMultiContainers:injectMultiContainers };
})();
