/**
 * scenario-context-fix.js v1.0 — Fix contexte donateur dans les scenarios
 *
 * PROBLEME RACINE : le moteur de scenarios utilise state.donor1.age et state.regime
 * qui viennent du COUPLE de l'arbre (Gerald/Cecile) au lieu du DONATEUR REEL (Martine).
 *
 * FIX 1: donorAge = age du vrai donateur (pas du premier parent du couple)
 * FIX 2: regime = ne s'applique que si le donateur est DANS un couple
 * FIX 3: per-beneficiary utilise le vrai lien fiscal (petit-enfant, pas enfant)
 * FIX 4: Notes AV 990I/757B coherentes avec l'age reel
 * FIX 5: Strategie adaptee a l'age reel (pas "avant 70 ans" si 73 ans)
 * FIX 6: Warning succession legale quand enfants existent mais pas beneficiaires
 *
 * @version 1.0.0 — 2026-03-17
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) {
            setTimeout(init, 500);
            return;
        }

        // ============================================================
        // FIX 1+2: Patch gatherInputs pour corriger donorAge et regime
        // ============================================================
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            // AVANT le calcul, corriger le contexte donateur
            fixDonorContext();
            // Appeler le calcul original
            _origCalc.call(SD);
            // APRES le calcul, corriger l'affichage
            setTimeout(function() {
                fixPerBeneficiaryLien();
                fixStrategyText();
                fixAVNotes();
                addSuccessionLegaleWarning();
                fixRegimeBanner();
            }, 500);
        };

        console.log('[ScenarioContextFix v1.0] Loaded — fixes donorAge, regime, lien, AV, strategy');
    }

    // ============================================================
    // FIX 1: Identifier le VRAI donateur et son age
    // ============================================================
    function fixDonorContext() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;

        // Trouver le vrai donateur principal
        var realDonors = [];

        // Source 1: PathOptimizer donors (Step 2)
        if (PO && PO.getDonors) {
            realDonors = PO.getDonors().filter(function(d) { return d.age > 0; });
        }

        // Source 2: FamilyGraph donors (Step 1) si PathOptimizer vide
        if (realDonors.length === 0 && FG && FG.getDonors) {
            realDonors = FG.getDonors().map(function(p) {
                return { id: p.id, nom: p.nom, age: p.age || 0, role: p.role || 'parent' };
            }).filter(function(d) { return d.age > 0; });
        }

        if (realDonors.length === 0) return;

        // Le donateur principal = le premier avec un age
        var mainDonor = realDonors[0];
        var oldAge = state.donor1.age;

        // Corriger l'age
        state.donor1.age = mainDonor.age;
        state._realDonorAge = mainDonor.age;
        state._realDonorNom = mainDonor.nom;
        state._realDonorRole = mainDonor.role;

        // FIX 2: Le regime ne s'applique que si le donateur est dans un couple
        var donorIsInCouple = false;

        // Verifier si le donateur a un conjoint dans l'arbre
        if (FG && FG.getPersons) {
            var persons = FG.getPersons();
            var donorPerson = persons.find(function(p) {
                return p.nom === mainDonor.nom || p.id === mainDonor.id;
            });
            if (donorPerson && donorPerson.spouseId) {
                donorIsInCouple = true;
            }
        }

        // Si donateur pas en couple, ou si role = grand_parent sans conjoint visible
        if (!donorIsInCouple) {
            // Forcer mode solo et regime sans impact
            state.mode = 'solo';
            state._regimeApplies = false;
            // Supprimer l'ajustement regime-biens pour ce calcul
            state._forceNoRegimeAdjustment = true;
        } else {
            state._regimeApplies = true;
            state._forceNoRegimeAdjustment = false;
            // Mode couple si 2 donateurs du meme couple
            if (realDonors.length >= 2) {
                state.mode = 'couple';
                state.donor2.age = realDonors[1].age;
            }
        }

        if (oldAge !== mainDonor.age) {
            console.log('[ScenarioContextFix] donorAge corrige : ' + oldAge + ' -> ' + mainDonor.age + ' (' + mainDonor.nom + ')');
        }
        if (!donorIsInCouple) {
            console.log('[ScenarioContextFix] Donateur solo — regime matrimonial NON applique aux biens');
        }
    }

    // ============================================================
    // FIX 2b: Patcher computePatrimoine pour respecter _forceNoRegimeAdjustment
    // ============================================================
    // On patche le computePatrimoine de results-fixes.js (qui patche celui de SD)
    // pour annuler l'ajustement regime si le donateur n'est pas en couple
    var _checkInterval = setInterval(function() {
        if (typeof SD === 'undefined' || !SD._fiscal) return;
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var _origCompute = SD._fiscal.computePatrimoine;
        SD._fiscal.computePatrimoine = function() {
            var result = _origCompute.call(this);
            var st = SD._getState ? SD._getState() : null;
            // Si le donateur est solo, annuler tout ajustement regime
            if (st && st._forceNoRegimeAdjustment && result._regimeApplied) {
                // Restaurer les valeurs originales
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
        clearInterval(_checkInterval);
        console.log('[ScenarioContextFix] computePatrimoine patche pour donateur solo');
    }, 1500);

    // ============================================================
    // FIX 3: Corriger le lien fiscal dans per-beneficiary-detail
    // ============================================================
    function fixPerBeneficiaryLien() {
        var container = document.getElementById('per-beneficiary-detail');
        if (!container) return;

        var state = SD._getState ? SD._getState() : null;
        if (!state || !state.beneficiaries) return;

        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;

        var lienLabels = {
            'enfant': 'Enfant', 'conjoint_pacs': 'Conjoint/PACS',
            'petit_enfant': 'Petit-enfant', 'frere_soeur': 'Frere/Soeur',
            'neveu_niece': 'Neveu/Niece', 'tiers': 'Tiers',
            'arriere_petit_enfant': 'Arr. petit-enfant',
            'grand_parent': 'Grand-parent'
        };

        var bens = state.beneficiaries;
        if (bens.length === 0) return;

        var pat = SD._fiscal.computePatrimoine();
        var totalNet = pat.actifNet || 0;
        var nbBens = bens.length;
        if (totalNet <= 0) return;

        var html = '';
        bens.forEach(function(b) {
            // FIX: utiliser le VRAI lien fiscal
            var lien = b.lien || 'enfant';

            // Si PathOptimizer disponible, obtenir le lien precis
            if (PO && PO.getDonors && PO.getEffectiveLien) {
                var donors = PO.getDonors();
                if (donors.length > 0) {
                    var realLien = PO.getEffectiveLien(donors[0].id, b.id, donors[0].role, b.lien);
                    if (realLien) lien = realLien;
                }
            }

            var abat = SD._fiscal.getAbattement(lien, false) || 0;
            // Conjoint = exonere en succession
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
            html += ' <span style="font-size:.65rem;color:var(--text-muted);">' + lienLabel + '</span></div>';
            html += '<div style="font-size:1rem;font-weight:800;color:var(--accent-green);">' + fmt(netRecu) + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:16px;font-size:.72rem;color:var(--text-secondary);flex-wrap:wrap;">';
            html += '<span>Part brute : ' + fmt(partBrute) + '</span>';
            html += '<span>Abattement : ' + abatFmt + '</span>';
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
    // FIX 4: Corriger les notes AV dans le tableau comparatif
    // ============================================================
    function fixAVNotes() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;

        // Trouver les notes qui mentionnent 990 I alors que donateur > 70 ans
        if (age >= 70) {
            document.querySelectorAll('#step-5 .section-card, #step-5 .strategy-step-content').forEach(function(el) {
                var html = el.innerHTML;
                if (html.indexOf('990 I') >= 0 && html.indexOf('757 B') < 0) {
                    // Remplacer la note incorrecte
                    html = html.replace(
                        /abat\.\s*152\s*500\s*.*?\(990\s*I\)/g,
                        'abat. global 30 500 \u20ac (art. 757 B, donateur > 70 ans)'
                    );
                    el.innerHTML = html;
                }
            });
        }

        // Corriger le texte "A faire avant 70 ans" si donateur deja > 70
        if (age >= 70) {
            document.querySelectorAll('#step-5 .strategy-step-content p, #step-5 .timeline-desc').forEach(function(el) {
                if (el.textContent.indexOf('avant 70 ans') >= 0 || el.textContent.indexOf('before 70') >= 0) {
                    el.innerHTML = el.innerHTML.replace(
                        /[AaÀà]\s*faire avant 70 ans/g,
                        'Art. 757 B applicable (donateur ' + age + ' ans, > 70 ans)'
                    );
                }
            });
        }
    }

    // ============================================================
    // FIX 5: Corriger le texte de la strategie recommandee
    // ============================================================
    function fixStrategyText() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;
        var nom = state._realDonorNom || 'le donateur';

        // Corriger NP ratio affiche
        var FISCAL = SD._fiscal.getFISCAL();
        var npRatio = SD._fiscal.getNPRatio(age);
        var npPct = Math.round(npRatio * 100);

        // Chercher les textes avec mauvais NP ratio dans tout le step 5
        var step5 = document.getElementById('step-5');
        if (!step5) return;

        // Corriger "NP = 50% (donateur 55 ans)" → "NP = 70% (donateur 73 ans)"
        step5.querySelectorAll('*').forEach(function(el) {
            if (el.childElementCount > 0) return; // ne modifier que les feuilles
            var txt = el.textContent;
            // Corriger age dans les notes
            var match = txt.match(/donateur\s+(\d+)\s+ans/);
            if (match && parseInt(match[1]) !== age) {
                el.textContent = txt.replace(/donateur\s+\d+\s+ans/g, 'donateur ' + age + ' ans');
            }
            // Corriger NP ratio
            var npMatch = txt.match(/NP\s*=?\s*(\d+)%/);
            if (npMatch && parseInt(npMatch[1]) !== npPct) {
                el.textContent = el.textContent.replace(/NP\s*=?\s*\d+%/g, 'NP ' + npPct + '%');
            }
        });
    }

    // ============================================================
    // FIX 6: Warning succession legale — enfants heritent meme si pas beneficiaires
    // ============================================================
    function addSuccessionLegaleWarning() {
        var existing = document.getElementById('succession-legale-warning');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        if (!FG || !FG.getPersons) return;

        var persons = FG.getPersons();
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        var beneficiaires = persons.filter(function(p) { return p.isBeneficiary; });

        if (donateurs.length === 0) return;

        var mainDonor = donateurs[0];

        // Trouver les ENFANTS du donateur (heritiers legaux)
        var enfantsLegaux = persons.filter(function(p) {
            // Un enfant du donateur = quelqu'un dont le parent est le donateur
            return p.parentIds && p.parentIds.indexOf(mainDonor.id) >= 0;
        });

        // Si pas trouve via parentIds, chercher via l'arbre familial
        if (enfantsLegaux.length === 0 && FG.getChildren) {
            var childIds = FG.getChildren(mainDonor.id);
            enfantsLegaux = persons.filter(function(p) { return childIds.indexOf(p.id) >= 0; });
        }

        if (enfantsLegaux.length === 0) return;

        // Verifier si les enfants sont beneficiaires
        var enfantsNonBen = enfantsLegaux.filter(function(enf) {
            return !beneficiaires.some(function(b) { return b.id === enf.id; });
        });

        if (enfantsNonBen.length === 0) return;

        // Il y a des enfants qui ne sont pas beneficiaires → warning
        var enfantsNoms = enfantsNonBen.map(function(e) { return '<strong>' + esc(e.nom) + '</strong>'; }).join(', ');
        var petitsEnfantsNoms = beneficiaires.map(function(b) { return esc(b.nom); }).join(', ');

        var html = '<div id="succession-legale-warning" class="warning-box warn" style="margin-bottom:16px;">';
        html += '<i class="fas fa-exclamation-triangle"></i>';
        html += '<div>';
        html += '<strong>Succession legale vs Donation</strong><br>';
        html += '<span style="font-size:.80rem;">';
        html += 'Au deces de ' + esc(mainDonor.nom) + ', ses enfants (' + enfantsNoms + ') sont <strong>heritiers reservataires</strong> (art. 913 CC). ';
        html += 'Ils heritent obligatoirement d\'au moins 2/3 du patrimoine (reserve = ' + fmt(Math.round((state._realDonorAge ? SD._fiscal.computePatrimoine().actifNet : 0) * 2/3)) + ').</span><br><br>';
        html += '<span style="font-size:.80rem;">';
        html += 'Les petits-enfants (' + petitsEnfantsNoms + ') ne recoivent que :<br>';
        html += '&bull; Par <strong>testament</strong> : sur la quotite disponible (1/3 max)<br>';
        html += '&bull; Par <strong>donation directe</strong> : du vivant de ' + esc(mainDonor.nom) + ' (abat. 31 865 &euro;/PE)<br>';
        html += '&bull; Par <strong>chemin indirect</strong> : ' + esc(mainDonor.nom) + ' → enfant → PE (abat. cumules 200 000 &euro;)<br>';
        html += '&bull; Par <strong>renonciation</strong> : si ' + enfantsNoms + ' renonce(nt), les PE heritent en representation (abat. 100 000 &euro; au lieu de 31 865 &euro;)</span><br><br>';
        html += '<span style="font-size:.75rem;color:var(--text-muted);">';
        html += 'Les calculs ci-dessous simulent la <strong>donation directe ' + esc(mainDonor.nom) + ' → petits-enfants</strong>. ';
        html += 'En l\'absence de donation, le patrimoine irait d\'abord a ' + enfantsNoms + ' (succession legale), puis eventuellement aux petits-enfants plus tard.</span>';
        html += '</div></div>';

        // Inserer avant la transmission map ou le hero
        var anchor = document.getElementById('regime-banner')
                  || document.getElementById('results-hero')
                  || document.getElementById('transmission-map');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
    }

    // ============================================================
    // FIX 2c: Corriger la banniere regime si donateur solo
    // ============================================================
    function fixRegimeBanner() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        if (state._forceNoRegimeAdjustment) {
            var banner = document.getElementById('regime-banner');
            if (banner) banner.remove();
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1300); });
    } else {
        setTimeout(init, 1300);
    }
})();
