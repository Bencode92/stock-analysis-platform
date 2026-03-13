/**
 * civil-rights.js — Module droits civils du conjoint survivant
 * v2.0 — Intégration DANS le calcul + warnings
 * @version 2.0.0 — 2026-03-13
 */
const CivilRights = (function() {
    'use strict';

    function getQuotiteDisponible(nbEnfants) {
        if (nbEnfants <= 0) return 1;
        if (nbEnfants === 1) return 0.50;
        if (nbEnfants === 2) return 1 / 3;
        return 0.25;
    }

    var unionTypes = {};
    function getUnionKey(id1, id2) { return Math.min(+id1, +id2) + '-' + Math.max(+id1, +id2); }
    function setUnionType(id1, id2, type) { unionTypes[getUnionKey(id1, id2)] = type || 'mariage'; }
    function getUnionType(id1, id2) { return unionTypes[getUnionKey(id1, id2)] || 'mariage'; }

    if (typeof FamilyGraph !== 'undefined') {
        FamilyGraph.setUnionType = setUnionType;
        FamilyGraph.getUnionType = getUnionType;
    }

    function computeConjointCivilShare(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var hasDDV = !!p.hasDDV;
        var hasTestament = !!p.hasTestament;
        var nbEnfants = p.nbEnfants || 0;
        var hasEnfantsAutreLit = !!p.hasEnfantsAutreLit;
        var conjointOption = p.conjointOption || 'pp';
        var result = { ppFraction: 0, usufruitFraction: 0, npFractionChildren: 1, explanation: '', warnings: [], civilArticle: '' };

        if (unionType === 'concubinage') {
            if (!hasTestament) {
                result.explanation = 'Concubin sans testament : aucun droit successoral. Les enfants h\u00e9ritent de 100%.';
                result.warnings.push('\u26a0\ufe0f Le concubin survivant ne recevra RIEN sans testament. Envisagez un testament ou une assurance-vie.');
                result.civilArticle = 'Aucun article \u2014 le concubinage n\'ouvre aucun droit successoral';
            } else {
                var qd = getQuotiteDisponible(nbEnfants);
                result.ppFraction = qd; result.npFractionChildren = 1 - qd;
                result.explanation = 'Concubin avec testament : re\u00e7oit la quotit\u00e9 disponible (' + Math.round(qd * 100) + '% PP). ATTENTION : tax\u00e9 \u00e0 60% (tiers fiscal).';
                result.warnings.push('\u26a0\ufe0f Legs au concubin tax\u00e9 \u00e0 60% sur ' + Math.round(qd * 100) + '% du patrimoine. L\'assurance-vie (art. 990 I) est bien plus efficace.');
                result.civilArticle = 'Art. 913 CC (quotit\u00e9 disponible)';
            }
            return result;
        }

        if (unionType === 'pacs') {
            if (!hasTestament) {
                result.explanation = 'Partenaire pacs\u00e9 sans testament : aucun droit successoral (art. 515-6 CC). Seul droit : jouissance gratuite du logement pendant 1 an.';
                result.warnings.push('\ud83d\udea8 Le pacs\u00e9 survivant ne recevra RIEN de la succession sans testament ! Droit au logement limit\u00e9 \u00e0 1 an.');
                result.civilArticle = 'Art. 515-6 CC';
            } else {
                var qdp = getQuotiteDisponible(nbEnfants);
                result.ppFraction = qdp; result.npFractionChildren = 1 - qdp;
                result.explanation = 'Pacs\u00e9 avec testament : re\u00e7oit la quotit\u00e9 disponible (' + Math.round(qdp * 100) + '% PP). Exon\u00e9r\u00e9 de droits (art. 796-0 bis CGI).';
                result.civilArticle = 'Art. 515-6 CC + art. 913 CC + art. 796-0 bis CGI';
            }
            result.warnings.push('\u2139\ufe0f Pacs\u00e9 : droit de jouissance gratuite du logement commun pendant 1 an (art. 515-6 al. 3 CC).');
            return result;
        }

        if (nbEnfants === 0) {
            result.ppFraction = 1; result.npFractionChildren = 0;
            result.explanation = 'Conjoint mari\u00e9 sans enfant : h\u00e9rite de la totalit\u00e9 en PP (exon\u00e9r\u00e9 de droits).';
            result.civilArticle = 'Art. 757-2 CC';
            return result;
        }

        if (hasDDV) {
            var qdDDV = getQuotiteDisponible(nbEnfants);
            if (conjointOption === 'usufruit') {
                result.usufruitFraction = 1; result.npFractionChildren = 1;
                result.explanation = 'DDV \u2014 Option usufruit : conjoint re\u00e7oit 100% en usufruit. Enfants nus-propri\u00e9taires.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option 100% US';
            } else if (conjointOption === 'mixte') {
                result.ppFraction = 0.25; result.usufruitFraction = 0.75; result.npFractionChildren = 0.75;
                result.explanation = 'DDV \u2014 Option mixte : conjoint re\u00e7oit 25% PP + usufruit sur 75%.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option mixte';
            } else {
                result.ppFraction = qdDDV; result.npFractionChildren = 1 - qdDDV;
                result.explanation = 'DDV \u2014 Option PP : conjoint re\u00e7oit ' + Math.round(qdDDV * 100) + '% en PP.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option PP';
            }
            return result;
        }

        if (hasEnfantsAutreLit) {
            result.ppFraction = 0.25; result.npFractionChildren = 0.75;
            result.explanation = 'Conjoint mari\u00e9 avec enfants d\'un autre lit : 25% en PP (art. 757 al. 2 CC).';
            result.warnings.push('\u26a0\ufe0f Enfants d\'un autre lit \u2192 conjoint limit\u00e9 \u00e0 25% PP. Envisagez une DDV.');
            result.civilArticle = 'Art. 757 al. 2 CC';
            return result;
        }

        if (conjointOption === 'usufruit') {
            result.usufruitFraction = 1; result.npFractionChildren = 1;
            result.explanation = 'Conjoint mari\u00e9 (enfants communs) \u2014 Option usufruit : 100% en usufruit.';
            result.civilArticle = 'Art. 757 al. 1 CC \u2014 Option 100% US';
        } else {
            result.ppFraction = 0.25; result.npFractionChildren = 0.75;
            result.explanation = 'Conjoint mari\u00e9 (enfants communs) \u2014 Option PP : 25% en PP. Enfants 75%.';
            result.civilArticle = 'Art. 757 al. 1 CC \u2014 Option 25% PP';
        }
        return result;
    }

    function detectBeauxEnfants() {
        if (typeof FamilyGraph === 'undefined') return [];
        var warnings = [];
        FamilyGraph.getPersons().forEach(function(p) {
            if (!p.isBeneficiary) return;
            FamilyGraph.getDonors().forEach(function(d) {
                var lien = FamilyGraph.computeFiscalLien(d.id, p.id);
                if (lien !== 'tiers') return;
                var spouse = FamilyGraph.spouse(d.id);
                if (!spouse) return;
                var isChildOfSpouse = FamilyGraph.children(spouse.id).some(function(c) { return c.id === p.id; });
                var isChildOfDonor = FamilyGraph.children(d.id).some(function(c) { return c.id === p.id; });
                if (isChildOfSpouse && !isChildOfDonor) {
                    warnings.push({ type: 'beau_enfant', severity: 'error', donorId: d.id, donorNom: d.nom, enfantId: p.id, enfantNom: p.nom,
                        message: p.nom + ' est l\'enfant de ' + spouse.nom + ' mais pas de ' + d.nom + ' \u2192 TIERS fiscal (60%). Adoption simple, AV ou donation-partage conjonctive recommand\u00e9es.' });
                }
            });
        });
        return warnings;
    }

    function hasEnfantsAutreLit(donorId) {
        if (typeof FamilyGraph === 'undefined') return false;
        var spouse = FamilyGraph.spouse(donorId);
        if (!spouse) return false;
        var dc = FamilyGraph.children(donorId), sc = FamilyGraph.children(spouse.id);
        var dOnly = dc.filter(function(d) { return !sc.some(function(s) { return s.id === d.id; }); });
        var sOnly = sc.filter(function(s) { return !dc.some(function(d) { return d.id === s.id; }); });
        return dOnly.length > 0 || sOnly.length > 0;
    }

    // ============================================================
    // CALCUL CORRIGÉ — Assiette taxable enfants (v2)
    // ============================================================

    function computeChildrenTaxableBase(totalNet, civilShare, conjointAge) {
        var F = SD._fiscal;
        var ppAmount = Math.round(totalNet * civilShare.ppFraction);
        var usAmount = 0, npRatio = 1, childrenBase;

        if (civilShare.usufruitFraction > 0) {
            npRatio = F.getNPRatio(conjointAge || 65);
            var usPortion = totalNet * civilShare.usufruitFraction;
            childrenBase = Math.round(usPortion * npRatio);
            usAmount = usPortion;
        } else {
            childrenBase = Math.round(totalNet * (1 - civilShare.ppFraction));
        }

        if (civilShare.ppFraction === 1) childrenBase = 0;

        var explanation = '';
        if (civilShare.ppFraction === 1) explanation = 'Conjoint h\u00e9rite de 100% en PP (exon\u00e9r\u00e9). Enfants : 0\u20ac.';
        else if (civilShare.ppFraction === 0.25 && civilShare.usufruitFraction === 0) explanation = 'Conjoint : 25% PP (exon\u00e9r\u00e9). Enfants : 75% = ' + F.fmt(childrenBase) + '.';
        else if (civilShare.ppFraction === 0.25 && civilShare.usufruitFraction === 0.75) explanation = 'Conjoint : 25% PP + US 75%. Enfants NP ' + Math.round(npRatio*100) + '% de 75% = ' + F.fmt(childrenBase) + '.';
        else if (civilShare.usufruitFraction === 1) explanation = 'Conjoint : 100% US. Enfants NP ' + Math.round(npRatio*100) + '% = ' + F.fmt(childrenBase) + ' (art. 669).';
        else if (civilShare.ppFraction > 0) explanation = 'Conjoint : ' + Math.round(civilShare.ppFraction*100) + '% PP. Enfants : ' + Math.round((1-civilShare.ppFraction)*100) + '% = ' + F.fmt(childrenBase) + '.';

        return { childrenBase: childrenBase, conjointPPAmount: ppAmount, conjointUSAmount: usAmount, npRatio: npRatio, explanation: explanation };
    }

    function computeCorrectedSuccession() {
        var state = SD._getState ? SD._getState() : null;
        if (!state || !state._civilRights) return null;
        var F = SD._fiscal, FISCAL = F.getFISCAL(), pat = F.computePatrimoine(), totalNet = pat.actifNet;
        var bens = state.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; });
        var nbDonors = state.mode === 'couple' ? 2 : 1;
        var civilShare = state._civilRights, conjointAge = 65;

        if (state._spouseId && typeof FamilyGraph !== 'undefined') {
            var sp = FamilyGraph.getPerson(state._spouseId);
            if (sp && sp.age) conjointAge = sp.age;
        }
        if (bens.length === 0) return null;

        var droitsBrut = _calcDroitsForBens(totalNet, bens, nbDonors, true);
        var fraisBrut = Math.round(totalNet * FISCAL.fraisNotaireSuccPct);
        var adjusted = computeChildrenTaxableBase(totalNet, civilShare, conjointAge);
        var droitsCorrige = _calcDroitsForBens(adjusted.childrenBase, bens, nbDonors, true);
        var fraisCorrige = Math.round(adjusted.childrenBase * FISCAL.fraisNotaireSuccPct);

        var droitsConcubin = 0;
        if (state._unionType === 'concubinage' && civilShare.ppFraction > 0) {
            var concubinPart = Math.round(totalNet * civilShare.ppFraction);
            var baseConcubin = Math.max(0, concubinPart - (FISCAL.abattements.tiers || 1594));
            droitsConcubin = Math.round(baseConcubin * 0.60);
        }

        var totalDroitsCorrige = droitsCorrige + droitsConcubin;
        return {
            brut: { assiette: totalNet, droits: droitsBrut, frais: fraisBrut, net: totalNet - droitsBrut - fraisBrut },
            corrige: { assietteEnfants: adjusted.childrenBase, conjointPP: adjusted.conjointPPAmount, conjointUS: adjusted.conjointUSAmount, npRatio: adjusted.npRatio, droitsEnfants: droitsCorrige, droitsConcubin: droitsConcubin, totalDroits: totalDroitsCorrige, frais: fraisCorrige, netEnfants: adjusted.childrenBase - droitsCorrige - fraisCorrige, explanation: adjusted.explanation },
            delta: droitsBrut - totalDroitsCorrige, civilShare: civilShare, conjointAge: conjointAge, unionType: state._unionType, nbEnfants: bens.length, totalNet: totalNet
        };
    }

    function _calcDroitsForBens(montant, bens, nbDonors, isSuccession) {
        var F = SD._fiscal, FISCAL = F.getFISCAL();
        if (montant <= 0 || bens.length === 0) return 0;
        var total = 0;
        bens.forEach(function(b) {
            var part = montant / bens.length;
            var abat = F.getAbattement(b.lien, isSuccession) * nbDonors - (b.donationAnterieure || 0);
            var handicapAbat = b.handicap ? FISCAL.abattements.handicap : 0;
            total += F.calcDroits(Math.max(0, part - abat - handicapAbat), F.getBareme(b.lien));
        });
        return total;
    }

    // ============================================================
    // PATCHES
    // ============================================================

    function patchSD() {
        if (typeof SD === 'undefined') return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            injectConjointContext();
            _origCalc.call(SD);
            setTimeout(function() { renderCorrectedScenario(); addCivilRightsWarnings(); }, 150);
        };
        var _origRefresh = SD.refreshObjectives;
        SD.refreshObjectives = function() { _origRefresh.call(SD); setTimeout(injectPacsWarningInObjectives, 50); };
        console.log('[CivilRights v2] Patched SD.calculateResults');
    }

    function injectConjointContext() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length === 0) { state._civilRights = null; return; }
        var primaryDonor = donors[0];
        var spouse = typeof FamilyGraph !== 'undefined' ? FamilyGraph.spouse(primaryDonor.id) : null;
        if (!spouse) { state._civilRights = null; return; }
        var uType = FamilyGraph.getUnionType ? FamilyGraph.getUnionType(primaryDonor.id, spouse.id) : 'mariage';
        var nbEnfants = state.beneficiaries.filter(function(b) { return b.lien === 'enfant'; }).length;
        var civilShare = computeConjointCivilShare({ unionType: uType, hasDDV: state.ddv || false, hasTestament: state._hasTestament || false, nbEnfants: nbEnfants, hasEnfantsAutreLit: hasEnfantsAutreLit(primaryDonor.id), conjointOption: state._conjointOption || 'pp', conjointAge: spouse.age || 65 });
        state._civilRights = civilShare; state._unionType = uType; state._spouseId = spouse.id; state._spouseNom = spouse.nom;
    }

    function renderCorrectedScenario() {
        var result = computeCorrectedSuccession();
        if (!result) return;
        if (result.delta === 0 && !result.civilShare.usufruitFraction && !result.civilShare.ppFraction) return;
        var F = SD._fiscal, fmt = F.fmt, cr = result.civilShare;
        var existing = document.getElementById('civil-rights-corrected');
        if (existing) existing.remove();
        var deltaColor = result.delta > 0 ? 'var(--accent-green)' : result.delta < 0 ? 'var(--accent-coral)' : 'var(--text-muted)';
        var deltaLabel = result.delta > 0 ? '\ud83d\udcb0 ' + fmt(result.delta) + ' d\'\u00e9conomie' : result.delta < 0 ? '\u26a0\ufe0f ' + fmt(Math.abs(result.delta)) + ' suppl\u00e9mentaires' : 'Pas de diff\u00e9rence';
        var html = '<div class="section-card" id="civil-rights-corrected" style="border-color:rgba(59,130,246,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-balance-scale" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Succession r\u00e9elle (droits civils)</div>';
        html += '<div style="padding:16px;border-radius:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);margin-bottom:16px;">';
        html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-blue);margin-bottom:8px;"><i class="fas fa-gavel"></i> ' + cr.civilArticle + '</div>';
        html += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.7;">' + cr.explanation + '</div></div>';
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);"><table style="width:100%;border-collapse:collapse;font-size:.82rem;">';
        html += '<thead><tr style="background:rgba(198,134,66,.06);"><th style="padding:12px 16px;text-align:left;">Crit\u00e8re</th><th style="padding:12px 16px;text-align:right;">Brut</th><th style="padding:12px 16px;text-align:right;color:var(--accent-blue);background:rgba(59,130,246,.04);">\u2696\ufe0f Corrig\u00e9</th></tr></thead><tbody>';
        html += '<tr><td style="padding:10px 16px;">Assiette enfants</td><td style="padding:10px 16px;text-align:right;">' + fmt(result.brut.assiette) + '</td><td style="padding:10px 16px;text-align:right;background:rgba(59,130,246,.02);font-weight:700;">' + fmt(result.corrige.assietteEnfants) + '</td></tr>';
        html += '<tr><td style="padding:10px 16px;">Droits enfants</td><td style="padding:10px 16px;text-align:right;">' + fmt(result.brut.droits) + '</td><td style="padding:10px 16px;text-align:right;background:rgba(59,130,246,.02);font-weight:700;">' + fmt(result.corrige.droitsEnfants) + '</td></tr>';
        if (result.corrige.droitsConcubin > 0) html += '<tr><td style="padding:10px 16px;color:var(--accent-coral);">Droits concubin 60%</td><td style="padding:10px 16px;text-align:right;">\u2014</td><td style="padding:10px 16px;text-align:right;background:rgba(59,130,246,.02);color:var(--accent-coral);">' + fmt(result.corrige.droitsConcubin) + '</td></tr>';
        html += '<tr style="font-weight:700;border-top:2px solid rgba(198,134,66,.15);"><td style="padding:14px 16px;">TOTAL</td><td style="padding:14px 16px;text-align:right;">' + fmt(result.brut.droits) + '</td><td style="padding:14px 16px;text-align:right;background:rgba(59,130,246,.04);color:var(--accent-blue);">' + fmt(result.corrige.totalDroits) + '</td></tr>';
        html += '<tr><td colspan="2"></td><td style="padding:10px 16px;text-align:right;background:rgba(59,130,246,.04);"><span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;color:' + deltaColor + ';">' + deltaLabel + '</span></td></tr>';
        html += '</tbody></table></div></div>';
        var anchor = document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
    }

    function addCivilRightsWarnings() {
        var warningsEl = document.getElementById('results-warnings');
        if (!warningsEl) return;
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var html = '';
        detectBeauxEnfants().forEach(function(w) { html += '<div class="warning-box warn" style="margin-top:4px;"><i class="fas fa-user-friends"></i><span><strong>Famille recompos\u00e9e :</strong> ' + w.message + '</span></div>'; });
        if (state._unionType === 'concubinage') html += '<div class="warning-box error" style="margin-top:4px;"><i class="fas fa-heart-broken"></i><span><strong>Concubinage :</strong> aucun droit successoral. Tax\u00e9 \u00e0 60%. Seule l\'AV (art. 990 I) est efficace.</span></div>';
        if (html) warningsEl.insertAdjacentHTML('beforeend', html);
    }

    function injectPacsWarningInObjectives() {
        var state = (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null;
        if (!state) return;
        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length === 0) return;
        var spouse = FamilyGraph.spouse(donors[0].id);
        if (!spouse) return;
        var uType = FamilyGraph.getUnionType ? FamilyGraph.getUnionType(donors[0].id, spouse.id) : 'mariage';
        var objConjEl = document.getElementById('obj-conjoint');
        if (!objConjEl) return;
        var row = objConjEl.closest('.switch-row'); if (!row) return;
        var contextEl = row.querySelector('.obj-context'); if (!contextEl) return;
        if (uType === 'pacs' && contextEl.innerHTML.indexOf('PACS') < 0) contextEl.innerHTML = '<strong style="color:var(--accent-coral);">PACS</strong> \u2014 N\'h\u00e9rite PAS sans testament. Privil\u00e9giez AV + testament.';
        if (uType === 'concubinage' && contextEl.innerHTML.indexOf('Concubinage') < 0) contextEl.innerHTML = '<strong style="color:var(--accent-coral);">Concubinage</strong> \u2014 Tax\u00e9 60%. Seule solution : AV (art. 990 I).';
    }

    function patchFamilyTreeUI() {
        if (typeof SD === 'undefined' || !SD.showContextMenu) return;
        var _origShowCtx = SD.showContextMenu;
        SD.showContextMenu = function(pid, e) {
            _origShowCtx.call(SD, pid, e);
            if (typeof FamilyGraph === 'undefined') return;
            var spouse = FamilyGraph.spouse(pid); if (!spouse) return;
            var ctx = document.getElementById('ft-ctx'); if (!ctx) return;
            var currentType = FamilyGraph.getUnionType ? FamilyGraph.getUnionType(pid, spouse.id) : 'mariage';
            var check = function(t) { return currentType === t ? '\u2713 ' : ''; };
            var bold = function(t) { return currentType === t ? 'color:var(--accent-green);font-weight:700;' : ''; };
            ctx.insertAdjacentHTML('beforeend', '<div class="ft-ctx-sep"></div><div style="padding:6px 12px;font-size:.65rem;color:var(--text-muted);font-weight:600;">Type d\'union</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'mariage\')" style="' + bold('mariage') + '">' + check('mariage') + '\ud83d\udc8d Mariage</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'pacs\')" style="' + bold('pacs') + '">' + check('pacs') + '\ud83d\udccb PACS</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'concubinage\')" style="' + bold('concubinage') + '">' + check('concubinage') + '\ud83e\udd1d Concubinage</div>');
        };
    }

    function setUnionAndRefresh(id1, id2, type) { setUnionType(id1, id2, type); if (typeof SD !== 'undefined') { SD.closeCtx(); SD.renderFamilyTree(); } }

    function init() { patchSD(); patchFamilyTreeUI(); console.log('[CivilRights v2] Loaded'); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 200);

    return {
        computeConjointCivilShare: computeConjointCivilShare,
        computeChildrenTaxableBase: computeChildrenTaxableBase,
        computeCorrectedSuccession: computeCorrectedSuccession,
        getQuotiteDisponible: getQuotiteDisponible,
        detectBeauxEnfants: detectBeauxEnfants,
        hasEnfantsAutreLit: hasEnfantsAutreLit,
        setUnionType: setUnionType,
        getUnionType: getUnionType,
        setUnionAndRefresh: setUnionAndRefresh
    };
})();
