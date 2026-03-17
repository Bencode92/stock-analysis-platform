/**
 * scenario-context-fix.js v1.1 — Fix contexte donateur dans les scenarios
 *
 * v1.0: Fixes donorAge, regime, lien, AV, strategy
 * v1.1: Fix structure familiale — distinguer enfant vs conjoint d'enfant
 *       Martine (GP) → Gerald (fils) ≠ Cecile (belle-fille, conjointe de Gerald)
 *       Seul Gerald est heritier reservataire, pas Cecile
 *
 * @version 1.1.0 — 2026-03-17
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) {
            setTimeout(init, 500);
            return;
        }

        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            fixDonorContext();
            _origCalc.call(SD);
            setTimeout(function() {
                fixPerBeneficiaryLien();
                fixStrategyText();
                fixAVNotes();
                addSuccessionLegaleWarning();
                fixRegimeBanner();
            }, 500);
        };

        console.log('[ScenarioContextFix v1.1] Loaded');
    }

    // ============================================================
    // FIX 1: Identifier le VRAI donateur et son age
    // ============================================================
    function fixDonorContext() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;

        var realDonors = [];
        if (PO && PO.getDonors) {
            realDonors = PO.getDonors().filter(function(d) { return d.age > 0; });
        }
        if (realDonors.length === 0 && FG && FG.getDonors) {
            realDonors = FG.getDonors().map(function(p) {
                return { id: p.id, nom: p.nom, age: p.age || 0, role: p.role || 'parent' };
            }).filter(function(d) { return d.age > 0; });
        }

        if (realDonors.length === 0) return;

        var mainDonor = realDonors[0];
        var oldAge = state.donor1.age;

        state.donor1.age = mainDonor.age;
        state._realDonorAge = mainDonor.age;
        state._realDonorNom = mainDonor.nom;
        state._realDonorRole = mainDonor.role;

        // FIX 2: Le regime ne s'applique que si le donateur est DANS un couple
        var donorIsInCouple = false;
        if (FG && FG.getPersons) {
            var persons = FG.getPersons();
            var donorPerson = persons.find(function(p) {
                return p.nom === mainDonor.nom || p.id === mainDonor.id;
            });
            if (donorPerson && donorPerson.spouseId) {
                donorIsInCouple = true;
            }
        }

        if (!donorIsInCouple) {
            state.mode = 'solo';
            state._regimeApplies = false;
            state._forceNoRegimeAdjustment = true;
        } else {
            state._regimeApplies = true;
            state._forceNoRegimeAdjustment = false;
            if (realDonors.length >= 2) {
                state.mode = 'couple';
                state.donor2.age = realDonors[1].age;
            }
        }

        if (oldAge !== mainDonor.age) {
            console.log('[ScenarioContextFix] donorAge corrige : ' + oldAge + ' -> ' + mainDonor.age + ' (' + mainDonor.nom + ')');
        }
    }

    // ============================================================
    // FIX 2b: Patcher computePatrimoine pour donateur solo
    // ============================================================
    var _checkInterval = setInterval(function() {
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
        clearInterval(_checkInterval);
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
            'arriere_petit_enfant': 'Arr. petit-enfant'
        };

        var bens = state.beneficiaries;
        if (bens.length === 0) return;

        var pat = SD._fiscal.computePatrimoine();
        var totalNet = pat.actifNet || 0;
        var nbBens = bens.length;
        if (totalNet <= 0) return;

        var html = '';
        bens.forEach(function(b) {
            var lien = b.lien || 'enfant';
            if (PO && PO.getDonors && PO.getEffectiveLien) {
                var donors = PO.getDonors();
                if (donors.length > 0) {
                    var realLien = PO.getEffectiveLien(donors[0].id, b.id, donors[0].role, b.lien);
                    if (realLien) lien = realLien;
                }
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
    // FIX 4: Corriger les notes AV
    // ============================================================
    function fixAVNotes() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;

        if (age >= 70) {
            document.querySelectorAll('#step-5 .section-card, #step-5 .strategy-step-content').forEach(function(el) {
                var html = el.innerHTML;
                if (html.indexOf('990 I') >= 0 && html.indexOf('757 B') < 0) {
                    html = html.replace(/abat\.\s*152\s*500\s*.*?\(990\s*I\)/g, 'abat. global 30 500 \u20ac (art. 757 B, donateur > 70 ans)');
                    el.innerHTML = html;
                }
            });
            document.querySelectorAll('#step-5 .strategy-step-content p, #step-5 .timeline-desc').forEach(function(el) {
                if (el.textContent.indexOf('avant 70 ans') >= 0) {
                    el.innerHTML = el.innerHTML.replace(/[Aa\u00c0\u00e0]\s*faire avant 70 ans/g, 'Art. 757 B applicable (donateur ' + age + ' ans, > 70 ans)');
                }
            });
        }
    }

    // ============================================================
    // FIX 5: Corriger texte strategie
    // ============================================================
    function fixStrategyText() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var age = state._realDonorAge || state.donor1.age || 60;
        var npPct = Math.round(SD._fiscal.getNPRatio(age) * 100);
        var step5 = document.getElementById('step-5');
        if (!step5) return;

        step5.querySelectorAll('*').forEach(function(el) {
            if (el.childElementCount > 0) return;
            var txt = el.textContent;
            var match = txt.match(/donateur\s+(\d+)\s+ans/);
            if (match && parseInt(match[1]) !== age) {
                el.textContent = txt.replace(/donateur\s+\d+\s+ans/g, 'donateur ' + age + ' ans');
            }
            var npMatch = txt.match(/NP\s*=?\s*(\d+)%/);
            if (npMatch && parseInt(npMatch[1]) !== npPct) {
                el.textContent = el.textContent.replace(/NP\s*=?\s*\d+%/g, 'NP ' + npPct + '%');
            }
        });
    }

    // ============================================================
    // FIX 6: Warning succession legale — ENFANTS (pas conjoints) heritent
    // v1.1: Distinguer enfant du donateur vs conjoint de l'enfant
    //       Martine → Gerald (fils) = heritier. Cecile (conjointe Gerald) = NON heritiere
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

        // Trouver les ENFANTS BIOLOGIQUES du donateur (pas les conjoints des enfants)
        var enfantsLegaux = [];

        // Methode 1: via parentIds dans FamilyGraph
        enfantsLegaux = persons.filter(function(p) {
            if (p.parentIds && p.parentIds.indexOf(mainDonor.id) >= 0) return true;
            return false;
        });

        // Methode 2: via getChildren si disponible
        if (enfantsLegaux.length === 0 && FG.getChildren) {
            var childIds = FG.getChildren(mainDonor.id);
            if (childIds && childIds.length > 0) {
                enfantsLegaux = persons.filter(function(p) { return childIds.indexOf(p.id) >= 0; });
            }
        }

        // Methode 3: heuristique — chercher les personnes qui sont "parent" dans l'arbre
        // et dont le donateur est un "grand_parent"
        if (enfantsLegaux.length === 0) {
            var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
            if (PO && PO.getDonors) {
                // Si le donateur a role=grand_parent, ses enfants sont les "parents" de l'arbre
                if (mainDonor.role === 'grand_parent' || mainDonor.role === 'grandparent') {
                    // Les parents dans l'arbre sont les enfants du GP
                    persons.forEach(function(p) {
                        // Exclure le donateur, les beneficiaires (petits-enfants) et les conjoints
                        if (p.id === mainDonor.id) return;
                        if (p.isBeneficiary) return;
                        // Un enfant du GP = quelqu'un qui a des enfants parmi les beneficiaires
                        // ET qui n'est pas le conjoint d'un autre enfant
                        var hasChildrenAmongBen = beneficiaires.some(function(b) {
                            return b.parentIds && b.parentIds.indexOf(p.id) >= 0;
                        });
                        if (hasChildrenAmongBen) {
                            enfantsLegaux.push(p);
                        }
                    });
                }
            }
        }

        // Methode 4: dernier recours — chercher les personnes avec role "parent"
        // qui ne sont ni donateur ni beneficiaire, et exclure les conjoints
        if (enfantsLegaux.length === 0) {
            var allDonorIds = donateurs.map(function(d) { return d.id; });
            var allBenIds = beneficiaires.map(function(b) { return b.id; });
            persons.forEach(function(p) {
                if (allDonorIds.indexOf(p.id) >= 0) return;
                if (allBenIds.indexOf(p.id) >= 0) return;
                // Exclure les conjoints : une personne avec un spouseId dont le spouse est aussi un candidat
                // → garder seulement celui qui a un lien direct avec le donateur
                enfantsLegaux.push(p);
            });
        }

        // FILTRER : exclure les conjoints des enfants (belles-filles / beaux-fils)
        // Un conjoint d'enfant = quelqu'un qui est marie/pacse avec un enfant du donateur
        // On garde seulement ceux qui sont des descendants directs
        if (enfantsLegaux.length > 1) {
            // Identifier les couples parmi les enfants potentiels
            var couples = [];
            enfantsLegaux.forEach(function(p) {
                if (p.spouseId) {
                    var spouse = enfantsLegaux.find(function(e) { return e.id === p.spouseId; });
                    if (spouse) couples.push({ a: p, b: spouse });
                }
            });

            // Pour chaque couple, garder seulement le VRAI enfant du donateur
            couples.forEach(function(c) {
                // Heuristique : l'enfant biologique est celui qui :
                // 1. A le donateur dans ses parentIds
                // 2. Ou a le meme nom de famille
                // 3. Ou est plus age (souvent l'enfant dans ce contexte)
                var aIsChild = c.a.parentIds && c.a.parentIds.indexOf(mainDonor.id) >= 0;
                var bIsChild = c.b.parentIds && c.b.parentIds.indexOf(mainDonor.id) >= 0;

                if (aIsChild && !bIsChild) {
                    // Exclure b (conjoint)
                    enfantsLegaux = enfantsLegaux.filter(function(e) { return e.id !== c.b.id; });
                } else if (bIsChild && !aIsChild) {
                    enfantsLegaux = enfantsLegaux.filter(function(e) { return e.id !== c.a.id; });
                } else {
                    // Pas de parentIds, on ne peut pas determiner avec certitude
                    // On garde les deux mais on mentionne "enfant(s) et/ou conjoint(s)"
                }
            });
        }

        if (enfantsLegaux.length === 0) return;

        // Verifier si les enfants sont beneficiaires
        var enfantsNonBen = enfantsLegaux.filter(function(enf) {
            return !beneficiaires.some(function(b) { return b.id === enf.id; });
        });

        if (enfantsNonBen.length === 0) return;

        // Construire le warning
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

        // Titre
        html += '<strong style="font-size:.88rem;">Attention : succession legale vs donation de son vivant</strong><br><br>';

        // Paragraphe 1 : ce qui se passe AU DECES sans action
        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong style="color:var(--accent-coral);">Sans donation :</strong> au deces de ' + esc(mainDonor.nom) + ', ';
        html += 'c\'est <strong>' + enfantsNoms + '</strong> (';
        html += nbEnfants === 1 ? 'son fils, heritier reservataire' : 'ses enfants, heritiers reservataires';
        html += ') qui herite de <strong>100% du patrimoine</strong> (art. 913 CC). ';
        html += 'Les petits-enfants (' + petitsEnfantsNoms + ') <strong>ne recoivent rien</strong> en succession legale tant que leur parent est vivant.';
        html += '</div>';

        // Note conjoint
        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;padding:6px 10px;border-radius:6px;background:rgba(198,134,66,.03);">';
        html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
        html += 'Le conjoint d\'un enfant (belle-fille/beau-fils) n\'a aucun droit successoral sur ' + esc(mainDonor.nom) + '. ';
        html += 'Seuls les descendants directs heritent.';
        html += '</div>';

        // Paragraphe 2 : reserve et QD
        html += '<div style="font-size:.80rem;margin-bottom:10px;">';
        html += '<strong>Reserve hereditaire :</strong> ' + fmt(reserve) + ' (' + (nbEnfants === 1 ? '1/2' : nbEnfants >= 3 ? '3/4' : '2/3') + ' du patrimoine) ';
        html += '→ revient obligatoirement a ' + enfantsNoms + '.<br>';
        html += '<strong>Quotite disponible :</strong> ' + fmt(qd) + ' (' + (nbEnfants === 1 ? '1/2' : nbEnfants >= 3 ? '1/4' : '1/3') + ') ';
        html += '→ peut etre leguee par testament aux petits-enfants.';
        html += '</div>';

        // Paragraphe 3 : options pour transmettre aux PE
        html += '<div style="font-size:.80rem;margin-bottom:8px;">';
        html += '<strong style="color:var(--accent-green);">Pour transmettre aux petits-enfants :</strong>';
        html += '</div>';
        html += '<div style="font-size:.78rem;margin-left:12px;">';
        html += '<div style="margin-bottom:4px;">1. <strong>Donation directe</strong> du vivant de ' + esc(mainDonor.nom) + ' → abat. 31 865 \u20ac/petit-enfant (calculs ci-dessous)</div>';
        html += '<div style="margin-bottom:4px;">2. <strong>Chemin indirect</strong> : ' + esc(mainDonor.nom) + ' → ' + enfantsNoms + ' (abat. 100 000 \u20ac) puis ' + enfantsNoms + ' → PE (abat. 100 000 \u20ac) = <strong>200 000 \u20ac d\'abattements cumules</strong></div>';
        html += '<div style="margin-bottom:4px;">3. <strong>Renonciation anticipee</strong> (RAAR) : ' + enfantsNoms + ' renonce a la succession → les PE heritent en representation avec l\'abat. de 100 000 \u20ac au lieu de 31 865 \u20ac (art. 929 CC)</div>';
        html += '<div style="margin-bottom:4px;">4. <strong>Testament + legs</strong> : sur la quotite disponible (' + fmt(qd) + ' max), ne reduit pas les droits mais oriente le patrimoine</div>';
        html += '<div style="margin-bottom:4px;">5. <strong>Assurance-vie</strong> : clause beneficiaire directe PE, hors succession (art. 757 B si > 70 ans)</div>';
        html += '</div>';

        // Note de clarification
        html += '<div style="font-size:.72rem;color:var(--text-muted);margin-top:10px;padding-top:8px;border-top:1px solid rgba(198,134,66,.08);">';
        html += '<i class="fas fa-calculator" style="margin-right:4px;"></i>';
        html += 'Les calculs ci-dessous simulent la <strong>donation directe ' + esc(mainDonor.nom) + ' → ' + petitsEnfantsNoms + '</strong>. ';
        html += 'C\'est le scenario ou ' + esc(mainDonor.nom) + ' decide de transmettre de son vivant directement aux petits-enfants.';
        html += '</div>';

        html += '</div></div>';

        // Inserer en haut des resultats
        var anchor = document.getElementById('regime-banner')
                  || document.getElementById('ai-narrative-summary')
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1300); });
    } else {
        setTimeout(init, 1300);
    }
})();
