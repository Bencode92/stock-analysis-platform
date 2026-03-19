/**
 * multi-donations.js v2.3 — Show beneficiary name header + lien fiscal
 *
 * v2.3: Each donation block shows:
 *   "→ Enfant 1 (Ligne directe · abat. 100 000 €)"
 *   before the donation rows, so user knows WHO they're entering donations for
 *
 * @version 2.3.0 — 2026-03-19
 */
const MultiDonations = (function() {
    'use strict';

    var _store = {};
    var RAPPEL_ANS = 15;
    var _injecting = false;

    function key(did, bid) { return did + ':' + bid; }
    function getEntries(did, bid) { var k = key(did, bid); if (!_store[k]) _store[k] = []; return _store[k]; }

    function isDonationInRappel(dateStr) {
        if (!dateStr) return true;
        return (new Date() - new Date(dateStr)) / (365.25*24*60*60*1000) < RAPPEL_ANS;
    }

    function getEffectiveTotal(did, bid) {
        var t = 0;
        getEntries(did, bid).forEach(function(e) { if (e.montant > 0 && isDonationInRappel(e.date)) t += e.montant; });
        return t;
    }

    function getRawTotal(did, bid) {
        return getEntries(did, bid).reduce(function(s, e) { return s + (e.montant || 0); }, 0);
    }

    // ============================================================
    // CRUD
    // ============================================================
    function addDonation(did, bid, montant, date, type) {
        getEntries(did, bid).push({ montant: +montant || 0, date: date || null, type: type || 'inconnue' });
        sync(did, bid);
        render(did, bid);
    }

    function updateDonation(did, bid, idx, field, value) {
        var e = getEntries(did, bid)[idx];
        if (!e) return;
        if (field === 'montant') e.montant = +value || 0;
        else if (field === 'date') e.date = value || null;
        else if (field === 'type') e.type = value;
        sync(did, bid);
        updateSummary(did, bid);
    }

    function removeDonation(did, bid, idx) {
        getEntries(did, bid).splice(idx, 1);
        sync(did, bid);
        render(did, bid);
    }

    function sync(did, bid) {
        if (typeof PathOptimizer === 'undefined' || !PathOptimizer.updateDonorDonation) return;
        PathOptimizer._skipRender = true;
        PathOptimizer.updateDonorDonation(+did, +bid, getEffectiveTotal(did, bid));
        setTimeout(function() { PathOptimizer._skipRender = false; }, 100);
    }

    // ============================================================
    // RENDER — v2.3: with beneficiary name header
    // ============================================================
    function render(did, bid) {
        var c = document.getElementById('multi-don-' + did + '-' + bid);
        if (!c) return;
        var entries = getEntries(did, bid);
        var lien = getLien(did, bid);
        var abat = getAbat(lien);
        var benName = getBenName(bid);
        var lienLabel = getLienLabel(lien);
        var h = '';

        // v2.3: Beneficiary header
        h += '<div style="margin-bottom:6px;padding:6px 10px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.08;">';
        h += '<div style="font-size:.78rem;font-weight:600;color:var(--text-primary);">';
        h += '\u2192 <strong>' + esc(benName) + '</strong> ';
        h += '<span style="font-size:.62rem;color:var(--text-muted);">(' + lienLabel + ' \u00b7 abat. ' + fmt(abat) + ')</span>';
        h += '</div></div>';

        // Donation rows
        entries.forEach(function(e, i) {
            var inR = isDonationInRappel(e.date);
            var badge = '';
            if (e.montant > 0) {
                if (e.date && !inR) badge = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);white-space:nowrap;">\u2705 Hors rappel (' + yearsAgo(e.date) + ' ans)</span>';
                else if (e.date) badge = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(255,107,107,.1);color:var(--accent-coral);white-space:nowrap;">\u23f3 Dans rappel (' + yearsAgo(e.date) + ' ans)</span>';
                else badge = '<span style="font-size:.52rem;padding:1px 6px;border-radius:4px;background:rgba(255,179,0,.1);color:var(--accent-amber);white-space:nowrap;">\ud83d\udcc5 Date ? (compt\u00e9)</span>';
            }
            h += '<div style="display:flex;gap:5px;align-items:center;margin-bottom:3px;padding:3px 6px;border-radius:6px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.04);">';
            h += '<span style="font-size:.52rem;color:var(--text-muted);width:16px;">#' + (i+1) + '</span>';
            h += '<input type="number" value="' + (e.montant||'') + '" min="0" step="1000" placeholder="\u20ac" style="font-size:.72rem;height:28px;width:90px;text-align:right;padding:2px 6px;' + (e.montant > 0 ? 'border-color:rgba(255,107,107,.25);':'') + '" onblur="MultiDonations.updateDonation(' + did + ',' + bid + ',' + i + ',\'montant\',this.value)">';
            h += '<input type="date" value="' + (e.date||'') + '" style="font-size:.56rem;height:28px;width:110px;padding:2px 3px;" onblur="MultiDonations.updateDonation(' + did + ',' + bid + ',' + i + ',\'date\',this.value)">';
            h += '<select style="font-size:.54rem;height:28px;width:80px;padding:0 3px;" onchange="MultiDonations.updateDonation(' + did + ',' + bid + ',' + i + ',\'type\',this.value)">';
            h += '<option value="inconnue"' + (e.type==='inconnue'?' selected':'') + '>Type?</option>';
            h += '<option value="notariee"' + (e.type==='notariee'?' selected':'') + '>Notari\u00e9e</option>';
            h += '<option value="don_manuel"' + (e.type==='don_manuel'?' selected':'') + '>Don manuel</option>';
            h += '<option value="don_familial"' + (e.type==='don_familial'?' selected':'') + '>Don familial</option>';
            h += '</select>';
            h += badge;
            h += '<button onclick="MultiDonations.removeDonation(' + did + ',' + bid + ',' + i + ')" style="width:18px;height:18px;border-radius:4px;border:none;background:rgba(255,82,82,.08);color:var(--accent-coral);cursor:pointer;font-size:.42rem;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button>';
            h += '</div>';
        });

        // Add button
        h += '<button onclick="MultiDonations.addDonation(' + did + ',' + bid + ',0,null,\'inconnue\')" style="display:flex;align-items:center;gap:5px;padding:4px 12px;margin-top:3px;border:1px dashed rgba(255,107,107,.25);border-radius:6px;background:rgba(255,107,107,.03);color:var(--accent-coral);font-size:.60rem;cursor:pointer;font-family:inherit;" onmouseover="this.style.background=\'rgba(255,107,107,.08)\'" onmouseout="this.style.background=\'rgba(255,107,107,.03)\'">';
        h += '<i class="fas fa-plus" style="font-size:.42rem;"></i> Ajouter une donation</button>';

        // Summary
        h += '<div id="mds-' + did + '-' + bid + '">' + buildSummary(did, bid, abat) + '</div>';
        c.innerHTML = h;
    }

    function buildSummary(did, bid, abat) {
        var entries = getEntries(did, bid);
        var eff = getEffectiveTotal(did, bid);
        var raw = getRawTotal(did, bid);
        var hr = raw - eff;
        var rest = Math.max(0, abat - eff);
        var pct = abat > 0 ? Math.min(100, eff / abat * 100) : 0;
        if (entries.length === 0 && eff === 0) return '';

        var h = '<div style="margin-top:5px;padding:6px 8px;border-radius:6px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);font-size:.60rem;">';
        if (hr > 0 && eff > 0) {
            h += '<div style="display:flex;gap:10px;margin-bottom:3px;flex-wrap:wrap;">';
            h += '<span style="color:var(--accent-green);">\u2705 Hors rappel : ' + fmt(hr) + '</span>';
            h += '<span style="color:var(--accent-coral);">\u23f3 Dans rappel : ' + fmt(eff) + '</span>';
            h += '</div>';
        } else if (eff > 0) {
            h += '<div style="margin-bottom:3px;color:var(--accent-coral);">\u23f3 Dans rappel : ' + fmt(eff) + '</div>';
        } else if (hr > 0) {
            h += '<div style="margin-bottom:3px;color:var(--accent-green);">\u2705 Tout hors rappel. Abattement intact.</div>';
        }
        var bc = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';
        h += '<div style="display:flex;align-items:center;gap:8px;">';
        h += '<div style="flex:1;height:5px;border-radius:3px;background:rgba(198,134,66,.08);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+bc+';border-radius:3px;"></div></div>';
        h += '<div style="white-space:nowrap;font-weight:600;color:' + (rest > 0 ? 'var(--accent-green)' : 'var(--accent-coral)') + ';">';
        h += rest > 0 ? 'Reste ' + fmt(rest) : '\u26a0\ufe0f \u00c9puis\u00e9';
        h += ' <span style="color:var(--text-muted);font-weight:400;">/ ' + fmt(abat) + '</span></div></div>';
        if (eff > 0 && rest > 0) {
            h += '<div style="margin-top:3px;color:var(--text-muted);">\ud83d\udca1 Encore <strong style="color:var(--accent-green);">' + fmt(rest) + '</strong> sans droits.</div>';
        } else if (eff > 0 && rest === 0) {
            var o = getOldest(did, bid);
            if (o) { var rd = new Date(o); rd.setFullYear(rd.getFullYear()+15); h += '<div style="margin-top:3px;color:var(--text-muted);">\ud83d\udcc5 Renouvellement : ' + rd.toLocaleDateString('fr-FR') + '</div>'; }
        }
        h += '</div>';
        return h;
    }

    function updateSummary(did, bid) {
        var el = document.getElementById('mds-' + did + '-' + bid);
        if (el) el.innerHTML = buildSummary(did, bid, getAbat(getLien(did, bid)));
        if (typeof PathOptimizer !== 'undefined') {
            try { PathOptimizer.renderDonorDonationBar(+did, +bid); } catch(e) {}
            try { PathOptimizer.refreshBenDonSummaries(); } catch(e) {}
        }
    }

    // ============================================================
    // INJECTION — REPLACE original inputs
    // ============================================================
    function inject() {
        if (_injecting) return;
        _injecting = true;
        var count = 0;

        var inputs = document.querySelectorAll('input[onchange*="PathOptimizer.updateDonorDonation"]');
        inputs.forEach(function(input) {
            var m = input.getAttribute('onchange').match(/updateDonorDonation\((\d+),(\d+)/);
            if (!m) return;
            var did = m[1], bid = m[2];
            var cid = 'multi-don-' + did + '-' + bid;
            if (document.getElementById(cid)) return;

            var gridRow = input.closest('div[style*="grid-template-columns"]');
            if (!gridRow) return;
            var dateRow = gridRow.nextElementSibling;

            // Also hide the label row above (the "→ Enfant 1 (Ligne directe...)" text)
            // We'll recreate it inside multi-donations
            var labelRow = gridRow.previousElementSibling;

            // Migrate existing data
            var entries = getEntries(did, bid);
            if (entries.length === 0) {
                var montant = +input.value || 0;
                var dateVal = dateRow ? (dateRow.querySelector('input[type="date"]') || {}).value : null;
                var typeVal = dateRow ? (dateRow.querySelector('select') || {}).value : null;
                if (montant > 0) {
                    entries.push({ montant: montant, date: dateVal || null, type: typeVal || 'inconnue' });
                }
            }

            // HIDE original inputs
            gridRow.style.display = 'none';
            if (dateRow && (dateRow.querySelector('input[type="date"]') || dateRow.querySelector('select'))) {
                dateRow.style.display = 'none';
            }
            // Also hide the original label if it exists (we recreate it)
            if (labelRow && labelRow.id && labelRow.id.indexOf('don-label') >= 0) {
                labelRow.style.display = 'none';
            }

            // Create container
            var div = document.createElement('div');
            div.id = cid;
            div.style.cssText = 'margin-top:6px;margin-bottom:10px;padding:8px 10px;border-radius:10px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.06);';
            var anchor = dateRow && dateRow.style.display === 'none' ? dateRow : gridRow;
            anchor.insertAdjacentElement('afterend', div);

            render(did, bid);
            count++;
        });

        if (count > 0) console.log('[MultiDonations v2.3] Replaced ' + count + ' donation inputs');
        _injecting = false;
    }

    var _dt = null;
    function injectDebounced() { clearTimeout(_dt); _dt = setTimeout(inject, 400); }

    // ============================================================
    // HELPERS
    // ============================================================
    function getLien(did, bid) {
        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.getEffectiveLien) {
            var ds = PathOptimizer.getDonors(), d = ds.find(function(x){return x.id===+did;});
            if (d) { var bs = PathOptimizer.getBeneficiaries(), b = bs.find(function(x){return String(x.id)===String(bid);}); if (b) return PathOptimizer.getEffectiveLien(d.id,b.id,d.role,b.lien); }
        }
        return 'enfant';
    }

    function getBenName(bid) {
        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.getBeneficiaries) {
            var bs = PathOptimizer.getBeneficiaries();
            var b = bs.find(function(x) { return String(x.id) === String(bid); });
            if (b && b.prenom) return b.prenom;
            if (b && b.nom) return b.nom;
        }
        // Fallback: try SD beneficiaries
        if (typeof SD !== 'undefined' && SD._getState) {
            var state = SD._getState();
            if (state && state.beneficiaries) {
                var sb = state.beneficiaries.find(function(x) { return String(x.id) === String(bid); });
                if (sb) return sb.nom || sb.prenom || 'B\u00e9n\u00e9ficiaire';
            }
        }
        return 'B\u00e9n\u00e9ficiaire ' + bid;
    }

    function getLienLabel(lien) {
        var map = {
            enfant: 'Ligne directe',
            petit_enfant: 'Petit-enfant',
            arriere_petit_enfant: 'Arr. petit-enfant',
            conjoint_pacs_donation: 'Conjoint/PACS',
            frere_soeur: 'Fr\u00e8re/S\u0153ur',
            neveu_niece: 'Neveu/Ni\u00e8ce',
            tiers: 'Tiers'
        };
        return map[lien] || lien;
    }

    function getAbat(l) { return {enfant:100000,petit_enfant:31865,arriere_petit_enfant:5310,conjoint_pacs_donation:80724,frere_soeur:15932,neveu_niece:7967,tiers:1594}[l]||1594; }
    function yearsAgo(d) { return d ? Math.floor((new Date()-new Date(d))/(365.25*24*60*60*1000)) : '?'; }
    function getOldest(did, bid) { var o=null; getEntries(did,bid).forEach(function(e){if(e.date&&isDonationInRappel(e.date)&&(!o||new Date(e.date)<new Date(o)))o=e.date;}); return o; }
    function fmt(n) { return (n==null?0:n).toLocaleString('fr-FR')+' \u20ac'; }
    function esc(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        if (typeof PathOptimizer === 'undefined') { setTimeout(init, 500); return; }
        inject();
        var dl = document.getElementById('donors-list');
        if (dl) new MutationObserver(injectDebounced).observe(dl, {childList:true, subtree:true});
        var n = 0, iv = setInterval(function() { inject(); if (++n >= 15) clearInterval(iv); }, 2000);
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item,.preset-btn,.btn-primary,.btn-secondary,.aside-cta'))
                { setTimeout(inject, 600); setTimeout(inject, 1500); }
        });
        console.log('[MultiDonations v2.3] Loaded');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){setTimeout(init,1500);});
    else setTimeout(init, 1500);

    return { addDonation:addDonation, updateDonation:updateDonation, removeDonation:removeDonation, getEffectiveTotal:getEffectiveTotal, getRawTotal:getRawTotal, getEntries:getEntries, renderDonationRows:render, injectMultiContainers:inject };
})();
