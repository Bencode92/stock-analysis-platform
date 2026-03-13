/**
 * inheritance-rules.js — Règles de dévolution successorale
 *
 * 4 mécanismes du Code civil intégrés dans les résultats :
 * 1. Représentation (art. 751-755 CC) — enfant décédé → petits-enfants héritent par souche
 * 2. Droit de retour des parents (art. 738-2 CC) — biens donnés remontent
 * 3. Fente successorale (art. 746-749 CC) — 50% branche paternelle / 50% maternelle
 * 4. Adoption simple (art. 786 CGI) — barème ligne directe sous conditions
 *
 * Charge APRÈS civil-rights.js et fiscal-optimizations.js
 * @version 1.0.0 — 2026-03-13
 */
const InheritanceRules = (function() {
    'use strict';

    // ============================================================
    // 1. REPRÉSENTATION (art. 751-755 CC)
    // ============================================================

    /**
     * Calcule la répartition par souche quand un enfant est décédé.
     * Les petits-enfants "représentent" l'enfant décédé : ils se partagent
     * SA part (pas une part par tête).
     *
     * IMPACT FISCAL CLÉ : en représentation, les petits-enfants bénéficient
     * de l'abattement de l'enfant représenté (100 000€), pas de l'abattement
     * petit-enfant (31 865€). Art. 779 bis CGI.
     *
     * @param {Array} enfants - [{id, nom, decede, enfantsDe: [petitsEnfants]}]
     * @param {number} montantTotal - Montant à répartir
     * @returns {Object} { souches, warnings, repartition[] }
     */
    function computeRepresentation(enfants, montantTotal) {
        if (!enfants || enfants.length === 0) return { souches: [], warnings: [], repartition: [], hasRepresentation: false };

        var souches = [];
        var warnings = [];
        var hasRepresentation = false;

        enfants.forEach(function(enf) {
            var souche = {
                nom: enf.nom || 'Enfant',
                id: enf.id,
                decede: !!enf.decede,
                representants: [],
                partFraction: 1 / enfants.length
            };

            if (enf.decede) {
                hasRepresentation = true;
                var petitsEnfants = enf.enfantsDe || [];

                if (petitsEnfants.length === 0) {
                    // Enfant décédé sans descendant → sa part va aux autres souches
                    souche.partFraction = 0;
                    warnings.push('\u26a0\ufe0f ' + enf.nom + ' est décédé(e) sans descendant. Sa part est répartie entre les autres souches.');
                } else {
                    // Petits-enfants représentent l'enfant décédé
                    petitsEnfants.forEach(function(pe) {
                        souche.representants.push({
                            id: pe.id,
                            nom: pe.nom || 'Petit-enfant',
                            partDansSouche: 1 / petitsEnfants.length,
                            // IMPORTANT : abattement enfant (100k) pas petit-enfant (31 865)
                            abattementApplicable: 100000,
                            baremeApplicable: 'ligne_directe',
                            lienFiscalOverride: 'enfant_representation'
                        });
                    });
                    warnings.push('\u2139\ufe0f ' + enf.nom + ' est décédé(e) → ' + petitsEnfants.length + ' petit(s)-enfant(s) héritent par représentation (art. 751 CC). Abattement 100 000€ chacun (art. 779 bis CGI), pas 31 865€.');
                }
            } else {
                // Enfant vivant → hérite normalement
                souche.representants.push({
                    id: enf.id,
                    nom: enf.nom,
                    partDansSouche: 1,
                    abattementApplicable: 100000,
                    baremeApplicable: 'ligne_directe',
                    lienFiscalOverride: null
                });
            }

            souches.push(souche);
        });

        // Recalculer les fractions si un enfant décédé sans descendant
        var souchesActives = souches.filter(function(s) { return s.partFraction > 0; });
        if (souchesActives.length < enfants.length && souchesActives.length > 0) {
            var newFraction = 1 / souchesActives.length;
            souchesActives.forEach(function(s) { s.partFraction = newFraction; });
        }

        // Calculer la répartition finale
        var repartition = [];
        souches.forEach(function(s) {
            if (s.partFraction <= 0) return;
            var montantSouche = Math.round(montantTotal * s.partFraction);
            s.representants.forEach(function(rep) {
                repartition.push({
                    id: rep.id,
                    nom: rep.nom,
                    montant: Math.round(montantSouche * rep.partDansSouche),
                    souche: s.nom,
                    enRepresentation: s.decede,
                    abattement: rep.abattementApplicable,
                    bareme: rep.baremeApplicable
                });
            });
        });

        return { souches: souches, warnings: warnings, repartition: repartition, hasRepresentation: hasRepresentation };
    }

    /**
     * Calcule les droits avec représentation.
     * Différence clé : abattement 100k au lieu de 31 865 pour les petits-enfants.
     */
    function computeDroitsAvecRepresentation(enfants, montantTotal, nbDonors) {
        var rep = computeRepresentation(enfants, montantTotal);
        if (!rep.hasRepresentation) return null;

        var F = SD._fiscal;
        var totalDroits = 0;
        var totalDroitsSansRep = 0;
        var details = [];

        rep.repartition.forEach(function(r) {
            var abat = r.abattement * (nbDonors || 1);
            var base = Math.max(0, r.montant - abat);
            var droits = F.calcDroits(base, F.getBareme('enfant'));

            // Calcul sans représentation (abattement petit-enfant 31 865)
            var abatSansRep = r.enRepresentation ? 31865 * (nbDonors || 1) : abat;
            var baseSansRep = Math.max(0, r.montant - abatSansRep);
            var droitsSansRep = r.enRepresentation ? F.calcDroits(baseSansRep, F.getBareme('enfant')) : droits;

            totalDroits += droits;
            totalDroitsSansRep += droitsSansRep;

            details.push({
                nom: r.nom, souche: r.souche, montant: r.montant,
                enRepresentation: r.enRepresentation,
                abattement: r.abattement, droits: droits,
                droitsSansRepresentation: droitsSansRep,
                economie: droitsSansRep - droits
            });
        });

        return {
            totalDroits: totalDroits,
            totalDroitsSansRepresentation: totalDroitsSansRep,
            economie: totalDroitsSansRep - totalDroits,
            details: details,
            repartition: rep.repartition,
            warnings: rep.warnings,
            article: 'Art. 751-755 CC (représentation) + art. 779 bis CGI (abattement)'
        };
    }

    // ============================================================
    // 2. DROIT DE RETOUR DES PARENTS (art. 738-2 CC)
    // ============================================================

    /**
     * Calcule le droit de retour des parents sur les biens donnés.
     * Si le défunt meurt sans descendant, les biens qu'il avait reçus
     * de ses parents par donation leur reviennent EN NATURE (pas en valeur).
     * Ce retour est EXONÉRÉ de droits de succession.
     *
     * @param {number} valeurBiensDonnes - Valeur des biens reçus par donation des parents
     * @param {boolean} hasDescendants - Le défunt a-t-il des descendants ?
     * @param {boolean} parentVivant - Le parent donateur est-il en vie ?
     * @param {number} patrimoineTotal - Patrimoine total du défunt
     * @returns {Object} { applicable, montantRetour, montantResiduel, explanation }
     */
    function computeDroitRetour(valeurBiensDonnes, hasDescendants, parentVivant, patrimoineTotal) {
        // Le droit de retour ne s'applique que sans descendant et si le parent est en vie
        if (hasDescendants || !parentVivant || valeurBiensDonnes <= 0) {
            return {
                applicable: false,
                montantRetour: 0,
                montantResiduel: patrimoineTotal,
                explanation: hasDescendants
                    ? 'Droit de retour non applicable : le défunt a des descendants.'
                    : 'Droit de retour non applicable : parent donateur décédé ou aucun bien donné.'
            };
        }

        // Le retour porte sur les biens donnés EN NATURE, plafonnés au patrimoine
        var montantRetour = Math.min(valeurBiensDonnes, patrimoineTotal);
        var montantResiduel = patrimoineTotal - montantRetour;

        return {
            applicable: true,
            montantRetour: montantRetour,
            montantResiduel: montantResiduel,
            exonere: true,
            explanation: 'Droit de retour (art. 738-2 CC) : ' + fmt(montantRetour) + ' reviennent au parent donateur, EXONÉRÉS de droits. Patrimoine résiduel à partager : ' + fmt(montantResiduel) + '.',
            conditions: [
                'Le défunt n\'a pas de descendants',
                'Le parent donateur est en vie',
                'Porte sur les biens donnés en nature (pas en valeur)',
                'Limité à la valeur des biens existants dans la succession'
            ],
            article: 'Art. 738-2 Code civil'
        };
    }

    // ============================================================
    // 3. FENTE SUCCESSORALE (art. 746-749 CC)
    // ============================================================

    /**
     * Calcule la fente successorale : partage 50/50 entre branche paternelle
     * et branche maternelle, quand il n'y a ni descendant ni conjoint.
     *
     * @param {Object} params
     * @param {boolean} params.hasDescendants
     * @param {boolean} params.hasConjoint
     * @param {Object} params.branchePaternelle - { parents: [], freressoeurs: [] }
     * @param {Object} params.brancheMaternelle - { parents: [], freressoeurs: [] }
     * @param {number} params.patrimoineTotal
     * @returns {Object} { applicable, brancheP, brancheM, repartition, explanation }
     */
    function computeFente(params) {
        var p = params || {};
        if (p.hasDescendants || p.hasConjoint) {
            return {
                applicable: false,
                explanation: 'Fente non applicable : ' + (p.hasDescendants ? 'le défunt a des descendants.' : 'le conjoint survivant est prioritaire.')
            };
        }

        var patrimoine = p.patrimoineTotal || 0;
        var moitie = Math.round(patrimoine / 2);
        var bP = p.branchePaternelle || { parents: [], freressoeurs: [] };
        var bM = p.brancheMaternelle || { parents: [], freressoeurs: [] };

        function repartirBranche(branche, montant, nomBranche) {
            var heritiers = [];
            var parentVivant = branche.parents.filter(function(p) { return !p.decede; });
            var fs = branche.freressoeurs || [];

            if (parentVivant.length > 0 && fs.length > 0) {
                // Parent + frères/sœurs : parent reçoit 25% (1/4 du total = 1/2 de la moitié)
                var partParent = Math.round(montant / 2);
                var partFS = montant - partParent;
                parentVivant.forEach(function(par) {
                    heritiers.push({ nom: par.nom, lien: 'parent', montant: Math.round(partParent / parentVivant.length), branche: nomBranche });
                });
                fs.forEach(function(f) {
                    heritiers.push({ nom: f.nom, lien: 'frere_soeur', montant: Math.round(partFS / fs.length), branche: nomBranche });
                });
            } else if (parentVivant.length > 0) {
                // Parent seul
                parentVivant.forEach(function(par) {
                    heritiers.push({ nom: par.nom, lien: 'parent', montant: Math.round(montant / parentVivant.length), branche: nomBranche });
                });
            } else if (fs.length > 0) {
                // Frères/sœurs seuls
                fs.forEach(function(f) {
                    heritiers.push({ nom: f.nom, lien: 'frere_soeur', montant: Math.round(montant / fs.length), branche: nomBranche });
                });
            }
            // Sinon : pas d'héritier dans cette branche → la moitié va à l'autre branche
            return heritiers;
        }

        var heritiersPat = repartirBranche(bP, moitie, 'paternelle');
        var heritiersMat = repartirBranche(bM, moitie, 'maternelle');

        // Si une branche est vide, sa moitié va à l'autre
        if (heritiersPat.length === 0 && heritiersMat.length > 0) {
            heritiersMat = repartirBranche(bM, patrimoine, 'maternelle');
        } else if (heritiersMat.length === 0 && heritiersPat.length > 0) {
            heritiersPat = repartirBranche(bP, patrimoine, 'paternelle');
        }

        var repartition = heritiersPat.concat(heritiersMat);

        return {
            applicable: true,
            branchePaternelle: heritiersPat,
            brancheMaternelle: heritiersMat,
            repartition: repartition,
            explanation: 'Fente successorale (art. 746-749 CC) : la succession est divisée en 2 parts égales entre la branche paternelle et la branche maternelle.',
            warnings: [
                repartition.length === 0 ? '\u26a0\ufe0f Aucun héritier dans les 2 branches → l\'État recueille la succession.' : null,
                heritiersPat.length === 0 && heritiersMat.length > 0 ? '\u2139\ufe0f Branche paternelle vide → la totalité va à la branche maternelle.' : null,
                heritiersMat.length === 0 && heritiersPat.length > 0 ? '\u2139\ufe0f Branche maternelle vide → la totalité va à la branche paternelle.' : null
            ].filter(Boolean),
            article: 'Art. 746-749 Code civil'
        };
    }

    // ============================================================
    // 4. ADOPTION SIMPLE (art. 786 CGI)
    // ============================================================

    /**
     * Détermine si un enfant adopté simple bénéficie du barème ligne directe.
     *
     * Conditions avantageuses (barème enfant 5-45% + abat. 100k) :
     * a) Enfant issu du 1er mariage du conjoint (loi 2016)
     * b) À la charge principale du parent adoptif pendant ≥ 10 ans (5 ans si mineur)
     * c) Pupille de l'État ou de la Nation
     *
     * Sinon : taxé à 60% comme tiers (0€ abattement sauf 1 594€).
     *
     * @param {Object} params
     * @param {boolean} params.isEnfantConjoint - Enfant du conjoint
     * @param {number}  params.anneesACharge - Années à charge du parent adoptif
     * @param {boolean} params.estMineur - L'adopté est-il mineur
     * @param {boolean} params.pupilleEtat - Pupille de l'État
     * @returns {Object} { baremeAvantageux, abattement, bareme, explanation, economie }
     */
    function computeAdoptionSimple(params) {
        var p = params || {};
        var isEnfantConjoint = !!p.isEnfantConjoint;
        var anneesACharge = p.anneesACharge || 0;
        var estMineur = !!p.estMineur;
        var pupilleEtat = !!p.pupilleEtat;
        var seuilCharge = estMineur ? 5 : 10;

        var baremeAvantageux = isEnfantConjoint || anneesACharge >= seuilCharge || pupilleEtat;

        if (baremeAvantageux) {
            var raison = isEnfantConjoint ? 'enfant du conjoint (loi 2016)'
                : pupilleEtat ? 'pupille de l\'État/Nation'
                : 'à charge ≥ ' + seuilCharge + ' ans';
            return {
                baremeAvantageux: true,
                abattement: 100000,
                bareme: 'ligne_directe',
                tauxMax: 0.45,
                explanation: 'Adoption simple — barème LIGNE DIRECTE (5-45%) + abattement 100 000€. Raison : ' + raison + '.',
                article: 'Art. 786 CGI',
                conseil: null
            };
        } else {
            return {
                baremeAvantageux: false,
                abattement: 1594,
                bareme: 'tiers',
                tauxMax: 0.60,
                explanation: 'Adoption simple — taxé comme TIERS (60%, abat. 1 594€). Conditions non remplies : ni enfant du conjoint, ni ' + seuilCharge + '+ ans à charge.',
                article: 'Art. 786 CGI',
                conseil: 'Pour bénéficier du barème avantageux : attendre ' + Math.max(0, seuilCharge - anneesACharge) + ' an(s) supplémentaire(s) à charge, ou demander l\'adoption plénière (rompt filiation d\'origine).'
            };
        };
    }

    /**
     * Calcule l'économie de l'adoption simple par rapport au statut tiers.
     */
    function computeEconomieAdoption(montantTransmis, params) {
        var adoption = computeAdoptionSimple(params);
        var F = SD._fiscal;

        // Droits en tant que tiers (60%)
        var baseTiers = Math.max(0, montantTransmis - 1594);
        var droitsTiers = Math.round(baseTiers * 0.60);

        if (adoption.baremeAvantageux) {
            // Droits en ligne directe
            var baseLigne = Math.max(0, montantTransmis - 100000);
            var droitsLigne = F.calcDroits(baseLigne, F.getBareme('enfant'));
            return {
                droitsTiers: droitsTiers,
                droitsAdoption: droitsLigne,
                economie: droitsTiers - droitsLigne,
                adoption: adoption
            };
        } else {
            return {
                droitsTiers: droitsTiers,
                droitsAdoption: droitsTiers,
                economie: 0,
                adoption: adoption
            };
        }
    }

    // ============================================================
    // RENDU — Panneau dans step 5
    // ============================================================

    function renderInheritancePanel() {
        var state = getState();
        if (!state) return;
        var existing = document.getElementById('inheritance-rules-panel');
        if (existing) existing.remove();

        var html = '';
        var hasContent = false;

        // --- Détection représentation dans l'arbre ---
        if (typeof FamilyGraph !== 'undefined') {
            var donors = FamilyGraph.getDonors();
            donors.forEach(function(d) {
                var enfants = FamilyGraph.children(d.id);
                var hasDecede = enfants.some(function(e) { return e.decede; });
                if (hasDecede && enfants.length > 0) {
                    var enfantsList = enfants.map(function(e) {
                        return { id: e.id, nom: e.nom, decede: !!e.decede, enfantsDe: FamilyGraph.children(e.id) };
                    });
                    var F = SD._fiscal, pat = F.computePatrimoine();
                    var repResult = computeDroitsAvecRepresentation(enfantsList, pat.actifNet, state.mode === 'couple' ? 2 : 1);
                    if (repResult) {
                        hasContent = true;
                        html += renderRepresentationCard(repResult);
                    }
                }
            });
        }

        // --- Détection beaux-enfants → suggestion adoption simple ---
        if (typeof CivilRights !== 'undefined') {
            var beauxEnfants = CivilRights.detectBeauxEnfants();
            beauxEnfants.forEach(function(be) {
                hasContent = true;
                var ecoAdopt = computeEconomieAdoption(100000, { isEnfantConjoint: true });
                html += '<div style="padding:16px 18px;border-radius:12px;background:rgba(167,139,250,.04);border:1px solid rgba(167,139,250,.15);margin-bottom:12px;">';
                html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><i class="fas fa-child" style="color:var(--accent-purple);"></i>';
                html += '<strong style="font-size:.85rem;">Adoption simple — ' + be.enfantNom + '</strong>';
                html += '<span style="padding:3px 10px;border-radius:15px;font-size:.72rem;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.1);">Économie potentielle : ' + fmt(ecoAdopt.economie) + '</span></div>';
                html += '<div style="font-size:.78rem;color:var(--text-secondary);line-height:1.6;">';
                html += be.enfantNom + ' est actuellement taxé(e) à <strong style="color:var(--accent-coral);">60%</strong> (tiers). ';
                html += 'Si adoption simple (enfant du conjoint, loi 2016) → <strong style="color:var(--accent-green);">barème 5-45% + abat. 100 000€</strong>.</div>';
                html += '<div style="font-size:.78rem;padding:8px 12px;margin-top:8px;border-radius:8px;background:rgba(167,139,250,.06);border-left:3px solid var(--accent-purple);">';
                html += '<strong>Action :</strong> Adoption simple chez le notaire (~1 500€). Conditions : enfant du conjoint OU à charge ≥ 10 ans (5 ans si mineur).';
                html += '</div><div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>Art. 786 CGI — Loi 2016</div></div>';
            });
        }

        // --- Warning global arbre : lister les décédés ---
        if (typeof FamilyGraph !== 'undefined') {
            var allPersons = FamilyGraph.getPersons();
            var hasAnyDecede = allPersons.some(function(p) { return p.decede; });
            if (!hasAnyDecede && allPersons.length > 2) {
                html += '<div style="padding:12px 16px;border-radius:10px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.1);margin-bottom:12px;font-size:.78rem;color:var(--text-secondary);">';
                html += '<i class="fas fa-info-circle" style="color:var(--primary-color);margin-right:8px;"></i>';
                html += '<strong>Pensez à indiquer les personnes décédées</strong> dans l\'arbre familial. ';
                html += 'Si un enfant est décédé, ses propres enfants héritent à sa place par <strong>représentation</strong> ';
                html += '(art. 751 CC) avec l\'abattement de 100 000€ au lieu de 31 865€. Cela peut changer significativement le calcul.';
                html += '</div>';
                hasContent = true;
            }
        }

        if (!hasContent) return;

        var panel = '<div class="section-card" id="inheritance-rules-panel" style="border-color:rgba(167,139,250,.2);margin-bottom:20px;">';
        panel += '<div class="section-title"><i class="fas fa-sitemap" style="background:linear-gradient(135deg,rgba(167,139,250,.2),rgba(167,139,250,.1));color:var(--accent-purple);"></i> Dévolution successorale</div>';
        panel += '<div class="section-subtitle">Représentation, adoption simple, droit de retour — impact sur la répartition et les droits</div>';
        panel += html;
        panel += '</div>';

        var anchor = document.getElementById('fiscal-optimizations-panel') || document.getElementById('union-comparison-table') || document.getElementById('civil-rights-corrected') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', panel);
    }

    function renderRepresentationCard(repResult) {
        var html = '<div style="padding:16px 18px;border-radius:12px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.15);margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<div style="display:flex;align-items:center;gap:10px;"><i class="fas fa-project-diagram" style="color:var(--accent-blue);"></i>';
        html += '<strong style="font-size:.85rem;">Représentation successorale</strong></div>';
        if (repResult.economie > 0) {
            html += '<span style="padding:3px 10px;border-radius:15px;font-size:.72rem;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.1);">−' + fmt(repResult.economie) + ' vs sans représentation</span>';
        }
        html += '</div>';

        // Tableau répartition par souche
        html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.08);margin-bottom:10px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:.78rem;">';
        html += '<thead><tr style="background:rgba(198,134,66,.04);"><th style="padding:8px 12px;text-align:left;">Héritier</th><th style="padding:8px 12px;text-align:left;">Souche</th><th style="padding:8px 12px;text-align:right;">Montant</th><th style="padding:8px 12px;text-align:right;">Abattement</th><th style="padding:8px 12px;text-align:right;">Droits</th></tr></thead><tbody>';
        repResult.details.forEach(function(d) {
            var repBadge = d.enRepresentation ? ' <span style="font-size:.6rem;padding:2px 6px;border-radius:8px;background:rgba(59,130,246,.1);color:var(--accent-blue);">représentation</span>' : '';
            html += '<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(198,134,66,.05);">' + d.nom + repBadge + '</td>';
            html += '<td style="padding:8px 12px;border-bottom:1px solid rgba(198,134,66,.05);color:var(--text-muted);">' + d.souche + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(d.montant) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(d.abattement) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);font-weight:600;">' + fmt(d.droits) + '</td></tr>';
        });
        html += '</tbody></table></div>';

        // Warnings
        repResult.warnings.forEach(function(w) {
            html += '<div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px;">' + w + '</div>';
        });

        html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:8px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + repResult.article + '</div>';
        html += '</div>';
        return html;
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(renderInheritancePanel, 400);
        };
        console.log('[InheritanceRules v1] Loaded — représentation, retour, fente, adoption simple');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 500); });
    else setTimeout(init, 500);

    return {
        computeRepresentation: computeRepresentation,
        computeDroitsAvecRepresentation: computeDroitsAvecRepresentation,
        computeDroitRetour: computeDroitRetour,
        computeFente: computeFente,
        computeAdoptionSimple: computeAdoptionSimple,
        computeEconomieAdoption: computeEconomieAdoption
    };
})();
