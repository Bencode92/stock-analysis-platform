/**
 * scenario-context-fix.js v1.3 — Fix contexte donateur UPSTREAM
 *
 * v1.3: Fix reserve/QD dans warning — calcul HORS AV (coherent avec baseline)
 *       Repositionne warning apres baseline panel
 *
 * @version 1.3.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) { setTimeout(init, 500); return; }

        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.getDonors) {
            var _origGetDonors = PathOptimizer.getDonors;
            PathOptimizer.getDonors = function() {
                var donors = _origGetDonors.call(PathOptimizer);
                donors.sort(function(a, b) { return (b._isDonor ? 1 : 0) - (a._isDonor ? 1 : 0); });
                return donors;
            };
        }

        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            detectDonorSoloStatus();
            _origCalc.call(SD);
            setTimeout(function() {
                fixPerBeneficiaryLien();
                fixRegimeBanner();
                addSuccessionLegaleWarning();
                fixAVNotesAndStrategy();
            }, 500);
        };

        patchComputePatrimoine();
        console.log('[ScenarioContextFix v1.3] Loaded');
    }

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
        var persons = FG.getPersons();
        var donorPerson = persons.find(function(p) { return p.nom === mainDonor.nom || (mainDonor._graphId && p.id === mainDonor._graphId); });
        var donorHasSpouse = donorPerson && donorPerson.spouseId;
        if (realDonors.length === 1 && !donorHasSpouse) {
            state._forceNoRegimeAdjustment = true;
            state.mode = 'solo';
        } else {
            state._forceNoRegimeAdjustment = false;
        }
    }

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
        var realDonors = PO ? PO.getDonors().filter(function(d) { return d._isDonor; }) : [];
        var lienLabels = { 'enfant':'Enfant', 'petit_enfant':'Petit-enfant', 'arriere_petit_enfant':'Arr. PE', 'conjoint_pacs':'Conjoint', 'frere_soeur':'Frere/Soeur', 'neveu_niece':'Neveu/Niece', 'tiers':'Tiers' };
        var html = '';
        bens.forEach(function(b) {
            var lien = b.lien || 'enfant';
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
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div><span style="font-weight:700;font-size:.88rem;">' + esc(nom) + '</span> <span style="font-size:.65rem;color:var(--text-muted);">' + lienLabel + ' &middot; Abat. ' + abatFmt + '</span></div>';
            html += '<div style="font-size:1rem;font-weight:800;color:var(--accent-green);">' + fmt(netRecu) + '</div></div>';
            html += '<div style="display:flex;gap:16px;font-size:.72rem;color:var(--text-secondary);flex-wrap:wrap;"><span>Part brute : ' + fmt(partBrute) + '</span><span>Base taxable : ' + fmt(base) + '</span><span style="color:var(--accent-coral);">Droits : ' + fmt(droits) + ' (' + tauxEffectif + '%)</span></div>';
            html += '</div>';
        });
        container.innerHTML = html;
    }

    function fixAVNotesAndStrategy() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;
        var npPct = Math.round(SD._fiscal.getNPRatio(age) * 100);
        if (age < 70) return;
        var step5 = document.getElementById('step-5');
        if (!step5) return;
        step5.querySelectorAll('*').forEach(function(el) {
            if (el.childElementCount > 0) return;
            var txt = el.textContent;
            if (txt.indexOf('avant 70 ans') >= 0) el.textContent = txt.replace(/[Aa\u00c0\u00e0]\s*faire avant 70 ans/g, 'Art. 757 B (donateur ' + age + ' ans, > 70 ans)');
            var ageMatch = txt.match(/donateur\s+(\d+)\s+ans/);
            if (ageMatch && parseInt(ageMatch[1]) !== age && parseInt(ageMatch[1]) < age) el.textContent = el.textContent.replace(/donateur\s+\d+\s+ans/g, 'donateur ' + age + ' ans');
            var npMatch = txt.match(/NP\s*=?\s*(\d+)%/);
            if (npMatch && parseInt(npMatch[1]) !== npPct) el.textContent = el.textContent.replace(/NP\s*=?\s*\d+%/g, 'NP ' + npPct + '%');
        });
        step5.querySelectorAll('.section-card, .strategy-step-content').forEach(function(el) {
            var html = el.innerHTML;
            if (html.indexOf('990 I') >= 0 && html.indexOf('757 B') < 0) {
                html = html.replace(/abat\.\s*152\s*500\s*.*?\(990\s*I\)/g, 'abat. global 30 500 \u20ac (art. 757 B, donateur > 70 ans)');
                el.innerHTML = html;
            }
        });
    }

    function fixRegimeBanner() {
        var state = SD._getState ? SD._getState() : null;
        if (state && state._forceNoRegimeAdjustment) {
            var banner = document.getElementById('regime-banner');
            if (banner) banner.remove();
        }
    }

    // ============================================================
    // WARNING SUCCESSION LEGALE — v1.3: reserve HORS AV
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
        var enfantsLegaux = findBiologicalChildren(mainDonor, persons, FG, PO);
        if (enfantsLegaux.length === 0) return;

        var enfantsNonBen = enfantsLegaux.filter(function(enf) {
            return !beneficiaires.some(function(b) { return b.id === enf.id; });
        });
        if (enfantsNonBen.length === 0) return;

        var enfantsNoms = enfantsNonBen.map(function(e) { return '<strong>' + esc(e.nom) + '</strong>'; }).join(', ');
        var petitsEnfantsNoms = beneficiaires.map(function(b) { return esc(b.nom); }).join(' et ');
        var nbEnfants = enfantsNonBen.length;

        // v1.3 FIX: Calcul reserve HORS AV (coherent avec baseline)
        var pat = SD._fiscal.computePatrimoine();
        var totalAV = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; }).reduce(function(s, f) { return s + (f.valeur || 0); }, 0);
        var masseHorsAV = (pat.actifNet || 0) - totalAV;
        var tauxReserve = nbEnfants === 1 ? 0.5 : (nbEnfants >= 3 ? 0.75 : 2/3);
        var reserve = Math.round(masseHorsAV * tauxReserve);
        var qd = masseHorsAV - reserve;
        var reserveLabel = nbEnfants === 1 ? '1/2' : (nbEnfants >= 3 ? '3/4' : '2/3');

        var html = '<div id="succession-legale-warning" class="warning-box warn" style="margin-bottom:16px;">';
        html += '<i class="fas fa-exclamation-triangle"></i>';
        html += '<div>';
        html += '<strong style="font-size:.88rem;">Succession l\u00e9gale vs donation du vivant</strong><br><br>';

        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong style="color:var(--accent-coral);">Sans donation :</strong> au d\u00e9c\u00e8s de ' + esc(mainDonor.nom) + ', ';
        html += 'c\'est ' + enfantsNoms + ' (' + (nbEnfants === 1 ? 'son enfant' : 'ses enfants') + ', ';
        html += 'h\u00e9ritier' + (nbEnfants > 1 ? 's' : '') + ' r\u00e9servataire' + (nbEnfants > 1 ? 's' : '') + ') ';
        html += 'qui h\u00e9rite de <strong>100%</strong> du patrimoine (art. 913 CC). ';
        html += 'Les petits-enfants (' + petitsEnfantsNoms + ') <strong>ne re\u00e7oivent rien</strong> tant que leur parent est vivant.';
        html += '</div>';

        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;padding:6px 10px;border-radius:6px;background:rgba(198,134,66,.03);">';
        html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
        html += 'Le conjoint d\'un enfant (belle-fille/beau-fils) n\'a aucun droit successoral. Seuls les descendants directs h\u00e9ritent.';
        html += '</div>';

        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong>R\u00e9serve h\u00e9r\u00e9ditaire :</strong> ' + fmt(reserve) + ' (' + reserveLabel + ' de la masse hors AV) \u2192 revient obligatoirement \u00e0 ' + enfantsNoms + '.<br>';
        html += '<strong>Quotit\u00e9 disponible :</strong> ' + fmt(qd) + ' \u2192 l\u00e9gable par testament aux PE.';
        if (totalAV > 0) html += ' L\'AV (' + fmt(totalAV) + ') s\'ajoute hors succession.';
        html += '</div>';

        html += '<div style="font-size:.80rem;margin-bottom:8px;"><strong style="color:var(--accent-green);">Pour transmettre directement aux petits-enfants :</strong></div>';
        html += '<div style="font-size:.78rem;margin-left:12px;">';
        html += '<div style="margin-bottom:4px;">1. <strong>Donation directe</strong> (calculs ci-dessous) \u2192 abat. 31 865 \u20ac/PE</div>';
        html += '<div style="margin-bottom:4px;">2. <strong>Chemin indirect</strong> : ' + esc(mainDonor.nom) + ' \u2192 ' + enfantsNoms + ' (abat. 100 000 \u20ac) \u2192 PE (abat. 100 000 \u20ac) = <strong>200 000 \u20ac cumul\u00e9s</strong></div>';
        html += '<div style="margin-bottom:4px;">3. <strong>Renonciation (RAAR)</strong> : ' + enfantsNoms + ' renonce \u2192 PE h\u00e9ritent avec abat. 100 000 \u20ac (art. 929 CC)</div>';
        html += '<div style="margin-bottom:4px;">4. <strong>Testament</strong> sur la QD (' + fmt(qd) + ' max)</div>';
        html += '<div style="margin-bottom:4px;">5. <strong>Assurance-vie</strong> clause PE directe (art. 757 B si > 70 ans)</div>';
        html += '</div>';

        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-top:10px;padding-top:8px;border-top:1px solid rgba(198,134,66,.08);">';
        html += 'Les calculs ci-dessous simulent la <strong>donation directe ' + esc(mainDonor.nom) + ' \u2192 ' + petitsEnfantsNoms + '</strong>.';
        html += '</div></div></div>';

        // v1.3: Insert AFTER baseline panel (not at hidden anchors)
        var baseline = document.getElementById('succession-baseline-panel');
        if (baseline) {
            baseline.insertAdjacentHTML('afterend', html);
        } else {
            var anchor = document.getElementById('ai-synthesis-panel')
                      || document.getElementById('results-hero')
                      || document.getElementById('transmission-map');
            if (anchor) anchor.insertAdjacentHTML('afterend', html);
        }
    }

    function findBiologicalChildren(donor, persons, FG, PO) {
        var enfants = [];
        if (FG.getChildren) {
            var childIds = FG.getChildren(donor.id);
            if (childIds && childIds.length > 0) enfants = persons.filter(function(p) { return childIds.indexOf(p.id) >= 0; });
        }
        if (enfants.length === 0) enfants = persons.filter(function(p) { return p.parentIds && p.parentIds.indexOf(donor.id) >= 0; });
        if (enfants.length === 0 && PO) {
            PO.getDonors().forEach(function(d) {
                if (d._isDonor || d._graphId === donor.id) return;
                var lien = FG.computeFiscalLien ? FG.computeFiscalLien(donor.id, d._graphId || d.id) : null;
                if (lien === 'enfant') { var p = persons.find(function(pp) { return pp.id === d._graphId || pp.nom === d.nom; }); if (p) enfants.push(p); }
            });
        }
        if (enfants.length > 1) {
            var eids = enfants.map(function(e) { return e.id; });
            enfants = enfants.filter(function(enf) {
                if (enf.spouseId && eids.indexOf(enf.spouseId) >= 0) {
                    return FG.computeFiscalLien ? FG.computeFiscalLien(donor.id, enf.id) === 'enfant' : true;
                }
                return true;
            });
        }
        return enfants;
    }

    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1300); });
    else setTimeout(init, 1300);
})();
