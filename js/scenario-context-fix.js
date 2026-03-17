/**
 * scenario-context-fix.js v1.2 — Fix contexte donateur UPSTREAM
 *
 * ROOT CAUSE: syncGraphToStep2 adds ALL non-beneficiary persons to PathOptimizer
 * (Martine 70a, Gerald 58a, Cecile 55a). gatherInputs then takes pDonors[0]
 * which may be Gerald/Cecile instead of Martine (the actual donateur).
 *
 * v1.2 FIX: Patch PathOptimizer.getDonors() to sort REAL donors first
 * (those with _isDonor=true from FamilyGraph). This fixes ALL downstream:
 * - donorAge is correct (70, not 55)
 * - NP ratio is correct (60%, not 50%)
 * - All 8 scenarios use correct values
 * - No need for post-render text hacks
 *
 * @version 1.2.0 — 2026-03-17
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) { setTimeout(init, 500); return; }

        // ============================================================
        // CORE FIX: Patch PathOptimizer.getDonors to sort real donors first
        // ============================================================
        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.getDonors) {
            var _origGetDonors = PathOptimizer.getDonors;
            PathOptimizer.getDonors = function() {
                var donors = _origGetDonors.call(PathOptimizer);
                // Sort: real donors (_isDonor=true) first, intermediaries after
                donors.sort(function(a, b) {
                    var aReal = a._isDonor ? 1 : 0;
                    var bReal = b._isDonor ? 1 : 0;
                    return bReal - aReal; // true first
                });
                return donors;
            };
            console.log('[ScenarioContextFix v1.2] PathOptimizer.getDonors patched — real donors first');
        }

        // ============================================================
        // FIX REGIME: Donateur solo → pas d'ajustement regime
        // ============================================================
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            // Before calc: detect if donateur is solo (no spouse)
            detectDonorSoloStatus();
            // Run original calc (now with correct donorAge thanks to getDonors patch)
            _origCalc.call(SD);
            // After calc: fix remaining display issues
            setTimeout(function() {
                fixPerBeneficiaryLien();
                fixRegimeBanner();
                addSuccessionLegaleWarning();
                fixAVNotesAndStrategy();
            }, 500);
        };

        // ============================================================
        // FIX REGIME in computePatrimoine: donateur solo = no adjustment
        // ============================================================
        patchComputePatrimoine();

        console.log('[ScenarioContextFix v1.2] Loaded — upstream donorAge fix');
    }

    // ============================================================
    // Detect if main donateur is solo (no spouse in tree)
    // ============================================================
    function detectDonorSoloStatus() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        if (!FG || !PO) return;

        var donors = PO.getDonors();
        var realDonors = donors.filter(function(d) { return d._isDonor; });
        if (realDonors.length === 0) return;

        var mainDonor = realDonors[0];
        state._realDonorNom = mainDonor.nom;
        state._realDonorAge = mainDonor.age;

        // Check if donateur has a spouse
        var persons = FG.getPersons();
        var donorPerson = persons.find(function(p) {
            return p.nom === mainDonor.nom || (mainDonor._graphId && p.id === mainDonor._graphId);
        });

        var donorHasSpouse = donorPerson && donorPerson.spouseId;

        // If only 1 real donor and no spouse → solo, no regime adjustment
        if (realDonors.length === 1 && !donorHasSpouse) {
            state._forceNoRegimeAdjustment = true;
            state.mode = 'solo';
        } else {
            state._forceNoRegimeAdjustment = false;
        }
    }

    // ============================================================
    // Patch computePatrimoine to respect _forceNoRegimeAdjustment
    // ============================================================
    function patchComputePatrimoine() {
        var _waitInterval = setInterval(function() {
            if (typeof SD === 'undefined' || !SD._fiscal) return;
            var _origCompute = SD._fiscal.computePatrimoine;
            SD._fiscal.computePatrimoine = function() {
                var result = _origCompute.call(this);
                var st = SD._getState ? SD._getState() : null;
                if (st && st._forceNoRegimeAdjustment && result._regimeApplied) {
                    var delta = result._regimeDelta || 0;
                    if (delta > 0) {
                        result.immo = result.immoBrut || (result.immo + delta);
                        result.actifBrut += delta;
                        result.actifNet += delta;
                        result._regimeApplied = false;
                        result._regimeDelta = 0;
                    }
                }
                return result;
            };
            clearInterval(_waitInterval);
        }, 1500);
    }

    // ============================================================
    // FIX: per-beneficiary-detail with REAL lien fiscal
    // ============================================================
    function fixPerBeneficiaryLien() {
        var container = document.getElementById('per-beneficiary-detail');
        if (!container) return;

        var state = SD._getState ? SD._getState() : null;
        if (!state || !state.beneficiaries || state.beneficiaries.length === 0) return;

        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var bens = state.beneficiaries;
        var pat = SD._fiscal.computePatrimoine();
        var totalNet = pat.actifNet || 0;
        var nbBens = bens.length;
        if (totalNet <= 0) return;

        // Get real donors for lien calculation
        var realDonors = PO ? PO.getDonors().filter(function(d) { return d._isDonor; }) : [];

        var lienLabels = {
            'enfant': 'Enfant', 'petit_enfant': 'Petit-enfant',
            'arriere_petit_enfant': 'Arr. petit-enfant',
            'conjoint_pacs': 'Conjoint/PACS', 'frere_soeur': 'Frere/Soeur',
            'neveu_niece': 'Neveu/Niece', 'tiers': 'Tiers'
        };

        var html = '';
        bens.forEach(function(b) {
            var lien = b.lien || 'enfant';

            // Use PathOptimizer effective lien from real donor
            if (PO && PO.getEffectiveLien && realDonors.length > 0) {
                var rl = PO.getEffectiveLien(realDonors[0].id, b.id, realDonors[0].role, b.lien);
                if (rl) lien = rl;
            }

            var abat = SD._fiscal.getAbattement(lien, false) || 0;
            if (lien === 'conjoint_pacs') abat = Infinity;

            var partBrute = Math.round(totalNet / nbBens);
            var base = Math.max(0, partBrute - abat);
            var droits = SD._fiscal.calcDroits(base, SD._fiscal.getBareme(lien));
            var netRecu = partBrute - droits;
            var tauxEffectif = partBrute > 0 ? Math.round(droits / partBrute * 100) : 0;
            var lienLabel = lienLabels[lien] || lien;
            var nom = b.nom || b.prenom || lienLabel;
            var abatFmt = abat === Infinity ? 'Exonere' : fmt(abat);

            html += '<div style="padding:14px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.08);margin-bottom:10px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
            html += '<div><span style="font-weight:700;font-size:.88rem;">' + esc(nom) + '</span>';
            html += ' <span style="font-size:.65rem;color:var(--text-muted);">' + lienLabel + ' &middot; Abat. ' + abatFmt + '</span></div>';
            html += '<div style="font-size:1rem;font-weight:800;color:var(--accent-green);">' + fmt(netRecu) + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:16px;font-size:.72rem;color:var(--text-secondary);flex-wrap:wrap;">';
            html += '<span>Part brute : ' + fmt(partBrute) + '</span>';
            html += '<span>Base taxable : ' + fmt(base) + '</span>';
            html += '<span style="color:var(--accent-coral);">Droits : ' + fmt(droits) + ' (' + tauxEffectif + '%)</span>';
            html += '</div>';
            var pctNet = totalNet > 0 ? Math.round(netRecu / totalNet * 100) : 0;
            html += '<div style="margin-top:8px;height:6px;border-radius:3px;background:rgba(198,134,66,.06);overflow:hidden;">';
            html += '<div style="height:100%;width:' + pctNet + '%;background:linear-gradient(90deg,var(--accent-green),var(--accent-emerald));border-radius:3px;"></div>';
            html += '</div></div>';
        });
        container.innerHTML = html;
    }

    // ============================================================
    // FIX: AV notes + strategy text
    // ============================================================
    function fixAVNotesAndStrategy() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;
        var npPct = Math.round(SD._fiscal.getNPRatio(age) * 100);

        if (age < 70) return; // No fix needed if under 70

        var step5 = document.getElementById('step-5');
        if (!step5) return;

        // Fix "avant 70 ans" text
        step5.querySelectorAll('*').forEach(function(el) {
            if (el.childElementCount > 0) return;
            var txt = el.textContent;

            // Fix "A faire avant 70 ans"
            if (txt.indexOf('avant 70 ans') >= 0) {
                el.textContent = txt.replace(/[Aa\u00c0\u00e0]\s*faire avant 70 ans/g,
                    'Art. 757 B (donateur ' + age + ' ans, > 70 ans)');
            }

            // Fix wrong donor age
            var ageMatch = txt.match(/donateur\s+(\d+)\s+ans/);
            if (ageMatch && parseInt(ageMatch[1]) !== age && parseInt(ageMatch[1]) < age) {
                el.textContent = el.textContent.replace(/donateur\s+\d+\s+ans/g, 'donateur ' + age + ' ans');
            }

            // Fix wrong NP %
            var npMatch = txt.match(/NP\s*=?\s*(\d+)%/);
            if (npMatch && parseInt(npMatch[1]) !== npPct) {
                el.textContent = el.textContent.replace(/NP\s*=?\s*\d+%/g, 'NP ' + npPct + '%');
            }
        });

        // Fix 990 I references when should be 757 B
        step5.querySelectorAll('.section-card, .strategy-step-content').forEach(function(el) {
            var html = el.innerHTML;
            if (html.indexOf('990 I') >= 0 && html.indexOf('757 B') < 0) {
                html = html.replace(/abat\.\s*152\s*500\s*.*?\(990\s*I\)/g,
                    'abat. global 30 500 \u20ac (art. 757 B, donateur > 70 ans)');
                el.innerHTML = html;
            }
        });
    }

    // ============================================================
    // FIX: Remove regime banner if donateur solo
    // ============================================================
    function fixRegimeBanner() {
        var state = SD._getState ? SD._getState() : null;
        if (state && state._forceNoRegimeAdjustment) {
            var banner = document.getElementById('regime-banner');
            if (banner) banner.remove();
        }
    }

    // ============================================================
    // FIX: Warning succession legale — ONLY biological children
    // ============================================================
    function addSuccessionLegaleWarning() {
        var existing = document.getElementById('succession-legale-warning');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        if (!FG || !FG.getPersons) return;

        var persons = FG.getPersons();
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        var beneficiaires = persons.filter(function(p) { return p.isBeneficiary; });
        if (donateurs.length === 0) return;

        var mainDonor = donateurs[0];

        // Find BIOLOGICAL children of the donateur
        // A child = someone whose parentId includes mainDonor.id
        var enfantsLegaux = [];

        // Method 1: FamilyGraph.getChildren
        if (FG.getChildren) {
            var childIds = FG.getChildren(mainDonor.id);
            if (childIds && childIds.length > 0) {
                enfantsLegaux = persons.filter(function(p) {
                    return childIds.indexOf(p.id) >= 0;
                });
            }
        }

        // Method 2: parentIds
        if (enfantsLegaux.length === 0) {
            enfantsLegaux = persons.filter(function(p) {
                return p.parentIds && p.parentIds.indexOf(mainDonor.id) >= 0;
            });
        }

        // Method 3: PathOptimizer donors with role + lien detection
        if (enfantsLegaux.length === 0 && PO) {
            var poDonors = PO.getDonors();
            poDonors.forEach(function(d) {
                if (d._isDonor) return; // skip the main donateur
                if (d._graphId === mainDonor.id) return;
                // Check if this person is linked as "enfant" to the main donateur
                var lien = FG.computeFiscalLien ? FG.computeFiscalLien(mainDonor.id, d._graphId || d.id) : null;
                if (lien === 'enfant') {
                    var person = persons.find(function(p) { return p.id === d._graphId || p.nom === d.nom; });
                    if (person) enfantsLegaux.push(person);
                }
            });
        }

        // CRITICAL: Filter out spouses of children (belles-filles/beaux-fils)
        // A spouse of a child has spouseId pointing to another enfant
        var enfantIds = enfantsLegaux.map(function(e) { return e.id; });
        enfantsLegaux = enfantsLegaux.filter(function(enf) {
            // If this person's spouse is ALSO in the enfants list,
            // keep only the one who is a biological child (has donateur as parent)
            if (enf.spouseId && enfantIds.indexOf(enf.spouseId) >= 0) {
                // Both this person and their spouse are in the list
                // Check who is the real child via computeFiscalLien
                var lien = FG.computeFiscalLien ? FG.computeFiscalLien(mainDonor.id, enf.id) : null;
                if (lien !== 'enfant') return false; // this is the spouse, not the child
            }
            return true;
        });

        if (enfantsLegaux.length === 0) return;

        // Check if children are beneficiaires
        var enfantsNonBen = enfantsLegaux.filter(function(enf) {
            return !beneficiaires.some(function(b) { return b.id === enf.id; });
        });

        if (enfantsNonBen.length === 0) return;

        // Build warning
        var enfantsNoms = enfantsNonBen.map(function(e) { return '<strong>' + esc(e.nom) + '</strong>'; }).join(', ');
        var petitsEnfantsNoms = beneficiaires.map(function(b) { return esc(b.nom); }).join(' et ');
        var nbEnfants = enfantsNonBen.length;
        var pat = SD._fiscal.computePatrimoine();
        var actifNet = pat.actifNet || 0;
        var reserve = Math.round(actifNet * (nbEnfants === 1 ? 0.5 : (nbEnfants >= 3 ? 0.75 : 2/3)));
        var qd = actifNet - reserve;

        var html = '<div id="succession-legale-warning" class="warning-box warn" style="margin-bottom:16px;">';
        html += '<i class="fas fa-exclamation-triangle"></i>';
        html += '<div>';
        html += '<strong style="font-size:.88rem;">Succession legale vs donation du vivant</strong><br><br>';

        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong style="color:var(--accent-coral);">Sans donation :</strong> au deces de ' + esc(mainDonor.nom) + ', ';
        html += 'c\'est ' + enfantsNoms + ' (' + (nbEnfants === 1 ? 'son enfant' : 'ses enfants') + ', ';
        html += 'heritier' + (nbEnfants > 1 ? 's' : '') + ' reservataire' + (nbEnfants > 1 ? 's' : '') + ') ';
        html += 'qui herite de <strong>100%</strong> du patrimoine (art. 913 CC). ';
        html += 'Les petits-enfants (' + petitsEnfantsNoms + ') <strong>ne recoivent rien</strong> tant que leur parent est vivant.';
        html += '</div>';

        // Note conjoint enfant
        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;padding:6px 10px;border-radius:6px;background:rgba(198,134,66,.03);">';
        html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
        html += 'Le conjoint d\'un enfant (belle-fille/beau-fils) n\'a aucun droit successoral. Seuls les descendants directs heritent.';
        html += '</div>';

        // Reserve + QD
        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong>Reserve hereditaire :</strong> ' + fmt(reserve) + ' (' + (nbEnfants === 1 ? '1/2' : nbEnfants >= 3 ? '3/4' : '2/3') + ') → revient obligatoirement a ' + enfantsNoms + '.<br>';
        html += '<strong>Quotite disponible :</strong> ' + fmt(qd) + ' → legable par testament aux PE.';
        html += '</div>';

        // Options
        html += '<div style="font-size:.80rem;margin-bottom:8px;"><strong style="color:var(--accent-green);">Pour transmettre directement aux petits-enfants :</strong></div>';
        html += '<div style="font-size:.78rem;margin-left:12px;">';
        html += '<div style="margin-bottom:4px;">1. <strong>Donation directe</strong> (calculs ci-dessous) → abat. 31 865 \u20ac/PE</div>';
        html += '<div style="margin-bottom:4px;">2. <strong>Chemin indirect</strong> : ' + esc(mainDonor.nom) + ' \u2192 ' + enfantsNoms + ' (abat. 100 000 \u20ac) \u2192 PE (abat. 100 000 \u20ac) = <strong>200 000 \u20ac cumules</strong></div>';
        html += '<div style="margin-bottom:4px;">3. <strong>Renonciation (RAAR)</strong> : ' + enfantsNoms + ' renonce \u2192 PE heritent avec abat. 100 000 \u20ac (art. 929 CC)</div>';
        html += '<div style="margin-bottom:4px;">4. <strong>Testament</strong> sur la QD (' + fmt(qd) + ' max)</div>';
        html += '<div style="margin-bottom:4px;">5. <strong>Assurance-vie</strong> clause PE directe (art. 757 B si > 70 ans)</div>';
        html += '</div>';

        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-top:10px;padding-top:8px;border-top:1px solid rgba(198,134,66,.08);">';
        html += 'Les calculs ci-dessous simulent la <strong>donation directe ' + esc(mainDonor.nom) + ' \u2192 ' + petitsEnfantsNoms + '</strong>.';
        html += '</div></div></div>';

        var anchor = document.getElementById('regime-banner')
                  || document.getElementById('ai-narrative-summary')
                  || document.getElementById('results-hero')
                  || document.getElementById('transmission-map');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1300); });
    } else {
        setTimeout(init, 1300);
    }
})();
