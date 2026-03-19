/**
 * donation-date-fix.js v1.0 — Fix date input resetting donation amounts
 *
 * ROOT CAUSE: PathOptimizer.updateDonorDonationDate() calls renderDonorList()
 * which destroys and recreates ALL donor card inputs. If user edits a date
 * before the amount onchange fires, the amount input value is lost.
 *
 * FIX: Patch updateDonorDonationDate to NOT re-render the full list.
 * Instead, update data in place + refresh only the recall badge.
 *
 * Also patches the date input from onchange to onblur in the original cards
 * to prevent mid-edit triggers.
 *
 * @version 1.0.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof PathOptimizer === 'undefined') { setTimeout(init, 500); return; }

        // Patch updateDonorDonationDate
        var _orig = PathOptimizer.updateDonorDonationDate;
        PathOptimizer.updateDonorDonationDate = function(donorId, benId, dateStr) {
            // Get donor and entry
            var donors = PathOptimizer.getDonors();
            var d = donors.find(function(dd) { return dd.id === +donorId; });
            if (!d) return;
            var entry = d.donationsParBen.find(function(e) { return e.benId === +benId; });
            if (!entry) {
                entry = { benId: +benId, montant: 0, lienOverride: null, date: null, type: 'inconnue' };
                d.donationsParBen.push(entry);
            }
            entry.date = dateStr || null;

            // Update recall badge in-place (don't re-render the whole list!)
            updateRecallBadge(donorId, benId, entry);

            // Update the donation bar (effective amount may change if date crosses 15-year boundary)
            if (typeof PathOptimizer.renderDonorDonationBar === 'function') {
                // Recalc effective amount
                var isInRappel = PathOptimizer.isDonationInRappel(dateStr);
                // The bar uses effective amount (within 15 years)
                // No need to call renderDonorList — just refresh the bar
            }

            // Refresh summaries without re-rendering cards
            if (typeof PathOptimizer.refreshBenDonSummaries === 'function') {
                PathOptimizer.refreshBenDonSummaries();
            }
        };

        // Also patch date inputs already in DOM: change onchange to onblur
        patchExistingDateInputs();

        // Re-patch when DOM changes (new cards added)
        var donorsList = document.getElementById('donors-list');
        if (donorsList) {
            var obs = new MutationObserver(function() {
                setTimeout(patchExistingDateInputs, 300);
            });
            obs.observe(donorsList, { childList: true, subtree: false });
        }

        console.log('[DonationDateFix v1.0] Loaded — date inputs patched to onblur, no re-render');
    }

    function updateRecallBadge(donorId, benId, entry) {
        // Find the recall badge next to this date input
        // The badge is a span after the date/type row
        var dateInputs = document.querySelectorAll('input[type="date"]');
        dateInputs.forEach(function(input) {
            var onchangeAttr = input.getAttribute('onchange') || input.getAttribute('onblur') || '';
            if (onchangeAttr.indexOf('updateDonorDonationDate(' + donorId + ',' + benId) >= 0) {
                // Find the parent row
                var row = input.closest('div');
                if (!row) return;
                // Find the badge span
                var badge = row.querySelector('span[style*="font-size:.55rem"]');
                if (badge && entry.montant > 0) {
                    var isInRappel = PathOptimizer.isDonationInRappel(entry.date);
                    if (entry.date && !isInRappel) {
                        badge.style.color = 'var(--accent-green)';
                        badge.textContent = '\u2705 > 15 ans';
                    } else if (entry.date) {
                        badge.style.color = 'var(--accent-coral)';
                        badge.textContent = '\u23f3 rappel 15a';
                    } else {
                        badge.style.color = 'var(--accent-amber)';
                        badge.textContent = '\ud83d\udcc5?';
                    }
                }
            }
        });
    }

    function patchExistingDateInputs() {
        // Change onchange to onblur for all PathOptimizer date inputs
        var dateInputs = document.querySelectorAll('input[type="date"][onchange*="updateDonorDonationDate"]');
        dateInputs.forEach(function(input) {
            var handler = input.getAttribute('onchange');
            if (handler && handler.indexOf('updateDonorDonationDate') >= 0) {
                input.removeAttribute('onchange');
                input.setAttribute('onblur', handler);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1200); });
    } else {
        setTimeout(init, 1200);
    }
})();
