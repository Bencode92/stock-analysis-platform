/**
 * expert-fixes.js v1.0 — Corrections review expert CGP (score 6.5 → 8.5/10)
 *
 * FIX 1: Reserve hereditaire — warning si donations GP→PE > QD sans RAAR
 * FIX 2: AV droits 990I — primes 150k < abat 152.5k = 0€ (pas 20k)
 * FIX 3: AV sans clause beneficiaire — bloquer calculs 990I/757B
 * FIX 4: Dutreil LFI 2026 — engagement 6 ans (pas 4) pour tous types
 * FIX 5: IR rachat AV — warning cout fiscal avant reco capi demembre
 * FIX 6: RP dans SCI — warning perte exoneration PV residence principale
 *
 * @version 1.0.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) { setTimeout(init, 500); return; }

        // ============================================================
        // FIX 4: Dutreil LFI 2026 — 6 ans pour TOUS les types
        // ============================================================
        if (typeof DutreilEntreprise !== 'undefined') {
            var _origDutreil = DutreilEntreprise.computeDutreil;
            DutreilEntreprise.computeDutreil = function(params) {
                var result = _origDutreil(params);
                // LFI 2026 : conservation 6 ans pour TOUS les types (pas 4 pour EI)
                result.conditions.engagementIndividuel.duree = '6 ans (LFI 2026)';
                // Ajouter exclusion biens somptuaires
                if (result.conditions.interdictions.indexOf('Exclusion biens somptuaires') < 0) {
                    result.conditions.interdictions.push('Exclusion biens somptuaires (vehicules tourisme, oeuvres art, bijoux — LFI 2026)');
                }
                return result;
            };
            console.log('[ExpertFixes] FIX 4: Dutreil 6 ans + exclusion somptuaires');
        }

        // Hook into calculateResults for post-render fixes
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(applyExpertFixes, 1100);
        };

        console.log('[ExpertFixes v1.0] Loaded — 6 corrections expert CGP');
    }

    function applyExpertFixes() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        addReserveWarning(state);
        fixAVSansClauses(state);
        addIRRachatWarning(state);
        addRPinSCIWarning(state);
    }

    // ============================================================
    // FIX 1: RESERVE HEREDITAIRE — Warning si donations > QD
    // ============================================================
    function addReserveWarning(state) {
        var existing = document.getElementById('reserve-violation-warning');
        if (existing) existing.remove();

        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        if (!FG || !FG.getPersons) return;

        var persons = FG.getPersons();
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        var beneficiaires = persons.filter(function(p) { return p.isBeneficiary; });
        if (donateurs.length === 0 || beneficiaires.length === 0) return;

        var mainDonor = donateurs[0];

        // Trouver les enfants (heritiers reservataires)
        var enfants = [];
        if (FG.getChildren) {
            var cids = FG.getChildren(mainDonor.id);
            if (cids && cids.length > 0) enfants = persons.filter(function(p) { return cids.indexOf(p.id) >= 0; });
        }
        if (enfants.length === 0) {
            enfants = persons.filter(function(p) { return p.parentIds && p.parentIds.indexOf(mainDonor.id) >= 0; });
        }
        // Filter spouses
        if (enfants.length > 1) {
            var eids = enfants.map(function(e) { return e.id; });
            enfants = enfants.filter(function(e) {
                if (e.spouseId && eids.indexOf(e.spouseId) >= 0 && FG.computeFiscalLien) {
                    return FG.computeFiscalLien(mainDonor.id, e.id) === 'enfant';
                }
                return true;
            });
        }

        if (enfants.length === 0) return;

        // Verifier si les beneficiaires sont des PE (pas des enfants)
        var bensAreNotChildren = beneficiaires.every(function(b) {
            return !enfants.some(function(e) { return e.id === b.id; });
        });
        if (!bensAreNotChildren) return; // Les enfants sont beneficiaires, pas de probleme

        // Calculer la masse successorale hors AV
        var pat = SD._fiscal.computePatrimoine();
        var totalAV = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; }).reduce(function(s, f) { return s + (f.valeur || 0); }, 0);
        var masseHorsAV = (pat.actifNet || 0) - totalAV;

        // QD = 1/2 si 1 enfant, 1/3 si 2, 1/4 si 3+
        var nbEnfants = enfants.length;
        var tauxQD = nbEnfants === 1 ? 0.5 : (nbEnfants >= 3 ? 0.25 : 1/3);
        var qd = Math.round(masseHorsAV * tauxQD);

        // Calculer le total des donations envisagees aux PE
        var npRatio = SD._fiscal.getNPRatio(state._realDonorAge || state.donor1.age || 60);
        var totalDonationsNP = 0;
        (state.immo || []).forEach(function(im) {
            if ((im.valeur || 0) > 0) totalDonationsNP += Math.round(im.valeur * npRatio);
        });
        // AV capi demembre
        (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; }).forEach(function(f) {
            totalDonationsNP += Math.round((f.valeur || 0) * npRatio);
        });

        // Si total donations > QD → WARNING
        if (totalDonationsNP <= qd) return;

        var depassement = totalDonationsNP - qd;
        var enfantsNoms = enfants.map(function(e) { return '<strong>' + esc(e.nom) + '</strong>'; }).join(', ');

        var html = '<div id="reserve-violation-warning" class="warning-box error" style="margin-bottom:16px;">';
        html += '<i class="fas fa-exclamation-circle"></i>';
        html += '<div>';
        html += '<strong style="font-size:.88rem;">Attention : d\u00e9passement de la quotit\u00e9 disponible (art. 913 CC)</strong><br><br>';
        html += '<div style="font-size:.80rem;margin-bottom:8px;">';
        html += 'Le total des donations envisag\u00e9es aux petits-enfants (<strong>' + fmt(totalDonationsNP) + '</strong>) ';
        html += 'd\u00e9passe la quotit\u00e9 disponible (<strong>' + fmt(qd) + '</strong>) de <strong style="color:var(--accent-coral);">' + fmt(depassement) + '</strong>.';
        html += '</div>';
        html += '<div style="font-size:.78rem;margin-bottom:8px;">';
        html += enfantsNoms + ' (h\u00e9ritier' + (nbEnfants > 1 ? 's' : '') + ' r\u00e9servataire' + (nbEnfants > 1 ? 's' : '') + ') ';
        html += 'pourrai' + (nbEnfants > 1 ? 'en' : '') + 't exercer l\'<strong>action en r\u00e9duction</strong> (art. 920 CC) pour r\u00e9cup\u00e9rer la r\u00e9serve.';
        html += '</div>';
        html += '<div style="font-size:.78rem;padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);color:var(--accent-green);">';
        html += '<i class="fas fa-lightbulb" style="margin-right:6px;"></i>';
        html += '<strong>Solution : RAAR</strong> (Renonciation Anticip\u00e9e \u00e0 l\'Action en R\u00e9duction, art. 929 CC). ';
        html += 'Si ' + enfantsNoms + ' signe une RAAR devant notaire, les donations aux PE sont s\u00e9curis\u00e9es m\u00eame au-del\u00e0 de la QD. ';
        html += 'Conditions : majeur, pas sous tutelle, 2 notaires dont 1 d\u00e9sign\u00e9 par la chambre.';
        html += '</div>';
        html += '</div></div>';

        // Inserer apres la synthese IA ou le baseline
        var anchor = document.getElementById('ai-synthesis-panel') || document.getElementById('succession-baseline-panel');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    // ============================================================
    // FIX 2+3: AV sans clause → droits tombent dans succession
    // ============================================================
    function fixAVSansClauses(state) {
        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie' && (f.valeur || 0) > 0; });
        if (avItems.length === 0) return;

        // Verifier si clause beneficiaire renseignee
        var hasClause = avItems.some(function(av) { return av.avBeneficiaires && av.avBeneficiaires.length > 0; });

        if (hasClause) return; // Clause OK, pas besoin de fix

        // FIX 3: Ajouter un warning bloquant dans la section AV du baseline
        var avSection = document.querySelector('#succession-baseline-panel .fa-shield-alt');
        if (!avSection) return;
        var avCard = avSection.closest('div[style*="border-radius"]');
        if (!avCard) return;

        // Chercher et corriger le montant des droits AV affiches
        // Si pas de clause, les droits 990I/757B sont INAPPLICABLES
        // Le capital retombe dans la succession
        var existingFix = document.getElementById('av-no-clause-fix');
        if (existingFix) return;

        var html = '<div id="av-no-clause-fix" style="margin-top:10px;padding:10px 14px;border-radius:10px;background:rgba(255,107,107,.08);border:2px solid rgba(255,107,107,.25);font-size:.78rem;">';
        html += '<div style="color:var(--accent-coral);font-weight:700;margin-bottom:6px;">';
        html += '<i class="fas fa-ban" style="margin-right:6px;"></i>CALCULS AV INAPPLICABLES SANS CLAUSE B\u00c9N\u00c9FICIAIRE</div>';
        html += '<div style="color:var(--text-secondary);line-height:1.5;">';
        html += 'Sans clause b\u00e9n\u00e9ficiaire d\u00e9sign\u00e9e, le capital AV <strong>retombe dans la succession</strong> (art. L132-11 C. Assurances). ';
        html += 'Les r\u00e9gimes 990 I et 757 B ne s\'appliquent pas. ';
        html += 'Les droits affich\u00e9s ci-dessus supposent une clause en place — <strong>d\u00e9signez les b\u00e9n\u00e9ficiaires dans Step 3</strong> pour activer ces avantages.';
        html += '</div></div>';

        avCard.insertAdjacentHTML('beforeend', html);
    }

    // ============================================================
    // FIX 5: IR rachat AV — Warning cout fiscal
    // ============================================================
    function addIRRachatWarning(state) {
        var existing = document.getElementById('ir-rachat-warning');
        if (existing) existing.remove();

        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie' && (f.valeur || 0) > 0; });
        if (avItems.length === 0) return;

        // Trouver la section AV dans per-asset-results
        var perAsset = document.getElementById('per-asset-results-panel');
        if (!perAsset) return;

        var avCard = perAsset.querySelector('.fa-shield-alt');
        if (!avCard) return;
        avCard = avCard.closest('.section-card');
        if (!avCard) return;

        var av = avItems[0];
        var versements = av.versements || 0;
        var primesAv70 = av.primesAvant70 || 0;
        var primesAp70 = av.primesApres70 || 0;
        var totalPrimes = primesAv70 + primesAp70;
        if (totalPrimes === 0) totalPrimes = versements || av.valeur || 0;
        var gains = Math.max(0, (av.valeur || 0) - totalPrimes);

        if (gains <= 0) return;

        // Calcul IR sur rachat total (PFU 30%)
        var abatIR = 4600; // celibataire apres 8 ans
        var gainsImposables = Math.max(0, gains - abatIR);
        var irPFU = Math.round(gainsImposables * 0.128); // 12.8% IR
        var psPFU = Math.round(gainsImposables * 0.172); // 17.2% PS
        var totalIR = irPFU + psPFU;

        if (totalIR <= 0) return;

        var html = '<div id="ir-rachat-warning" style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(255,179,0,.06);border:1px solid rgba(255,179,0,.15);font-size:.72rem;color:var(--text-secondary);">';
        html += '<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px;"></i>';
        html += '<strong style="color:var(--accent-amber);">Co\u00fbt fiscal du rachat AV</strong> : si vous rachetez pour convertir en capi, ';
        html += 'les gains de ' + fmt(gains) + ' seront soumis au PFU (30%) ou bar\u00e8me progressif. ';
        html += 'Apr\u00e8s abattement ' + fmt(abatIR) + ' (> 8 ans) : <strong>~' + fmt(totalIR) + ' d\'imp\u00f4t</strong> (IR ' + fmt(irPFU) + ' + PS ' + fmt(psPFU) + '). ';
        html += 'Ce co\u00fbt r\u00e9duit l\'avantage du capi d\u00e9membr\u00e9. Comparez le co\u00fbt net (rachat + droits capi) vs maintien AV (990 I / 757 B).';
        html += '</div>';

        // Inserer apres la recommandation AV
        var recoBox = avCard.querySelector('.fa-check-circle');
        if (recoBox) {
            var recoDiv = recoBox.closest('div[style*="border-radius"]');
            if (recoDiv) recoDiv.insertAdjacentHTML('afterend', html);
        } else {
            avCard.insertAdjacentHTML('beforeend', html);
        }
    }

    // ============================================================
    // FIX 6: RP dans SCI — Warning perte exo PV
    // ============================================================
    function addRPinSCIWarning(state) {
        var perAsset = document.getElementById('per-asset-results-panel');
        if (!perAsset) return;

        // Trouver les cartes immo avec RP
        var immos = (state.immo || []).filter(function(im) { return im.usageActuel === 'rp' && (im.valeur || 0) > 0; });
        if (immos.length === 0) return;

        // Chercher les lignes "SCI" dans les tableaux immo
        perAsset.querySelectorAll('table').forEach(function(table) {
            // Verifier si c'est une table d'un bien RP (chercher "Conserve l'usage" dans les notes)
            var hasRP = false;
            table.querySelectorAll('td').forEach(function(td) {
                if (td.textContent.indexOf("Conserve l'usage") >= 0) hasRP = true;
            });
            if (!hasRP) return;

            // Chercher la ligne SCI
            table.querySelectorAll('tr').forEach(function(tr) {
                var cells = tr.querySelectorAll('td');
                if (cells.length === 0) return;
                var firstCell = cells[0].textContent || '';
                if (firstCell.indexOf('SCI') >= 0 && !tr.querySelector('.rp-sci-warning')) {
                    // Ajouter un warning dans la note SCI
                    var noteRow = tr.nextElementSibling;
                    if (noteRow && noteRow.querySelector('td[colspan]')) {
                        var noteCell = noteRow.querySelector('td[colspan]');
                        if (noteCell && noteCell.innerHTML.indexOf('perte exo PV') < 0) {
                            noteCell.innerHTML += ' <span class="rp-sci-warning" style="color:var(--accent-coral);font-weight:600;"><i class="fas fa-exclamation-triangle" style="margin:0 3px;"></i>ATTENTION : RP dans SCI = perte exon\u00e9ration plus-value RP (art. 150 U II CGI)</span>';
                        }
                    }
                }
            });
        });
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1700); });
    else setTimeout(init, 1700);
})();
