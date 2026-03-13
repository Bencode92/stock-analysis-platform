/**
 * per-av-clause.js — PER succession + Warning SCI RP + Clause bénéficiaire
 *
 * 1. PER (Plan Épargne Retraite) : mêmes règles que AV pour la succession
 *    - < 70 ans : art. 990 I (abat. 152 500€, puis 20%/31,25%)
 *    - ≥ 70 ans : art. 757 B (abat. 30 500€ global, puis DMTG)
 *    - PER + AV partagent le même abattement 152 500€/bénéficiaire
 * 2. SCI + RP : warning perte droit habitation conjoint (art. 764 CC)
 * 3. Clause bénéficiaire : utilise les désignations du profil
 *
 * @version 1.0.0 — 2026-03-13
 */
const PERAvClause = (function() {
    'use strict';

    // ============================================================
    // 1. PER — PLAN ÉPARGNE RETRAITE
    // ============================================================

    var PER_ABAT_AVANT_70 = 152500; // par bénéficiaire, partagé avec AV
    var PER_TAUX_TRANCHE1 = 0.20;
    var PER_SEUIL_TRANCHE2 = 700000;
    var PER_TAUX_TRANCHE2 = 0.3125;
    var PER_ABAT_APRES_70 = 30500; // global, partagé avec AV

    /**
     * Calcule les droits sur un PER au décès du titulaire.
     * Le PER suit les mêmes règles que l'AV depuis la loi PACTE 2019.
     *
     * IMPORTANT : les abattements 152 500€ (990 I) et 30 500€ (757 B)
     * sont PARTAGÉS entre AV et PER. Si le titulaire a les deux,
     * l'abattement se répartit sur l'ensemble AV + PER.
     *
     * @param {Object} params
     * @param {number} params.capitalPER - Capital du PER au décès
     * @param {number} params.capitalAV - Capital AV (pour calculer le partage abattement)
     * @param {number} params.ageDeces - Âge du titulaire au décès
     * @param {number} params.nbBeneficiaires - Nombre de bénéficiaires désignés
     * @param {number} params.versementsAvant70 - Part des versements faits avant 70 ans (0 à 1)
     * @returns {Object}
     */
    function computePERSuccession(params) {
        var p = params || {};
        var capitalPER = p.capitalPER || 0;
        var capitalAV = p.capitalAV || 0;
        var ageDeces = p.ageDeces || 65;
        var nbBen = Math.max(1, p.nbBeneficiaires || 1);
        var versAvant70 = p.versementsAvant70 !== undefined ? p.versementsAvant70 : (ageDeces < 70 ? 1 : 0.5);

        if (capitalPER <= 0) return { applicable: false, droitsTotal: 0 };

        var partAvant70 = Math.round(capitalPER * versAvant70);
        var partApres70 = capitalPER - partAvant70;

        // TOTAL AV + PER (pour partager l'abattement)
        var totalAVPER_avant70 = partAvant70 + capitalAV; // simplifié : on suppose AV = avant 70

        // --- Art. 990 I (avant 70 ans) ---
        var abat990I_total = PER_ABAT_AVANT_70 * nbBen; // 152.5k × nb bén
        var baseAvant70 = Math.max(0, totalAVPER_avant70 - abat990I_total);
        // Part PER dans la base taxable (proportionnelle)
        var ratioPER = totalAVPER_avant70 > 0 ? partAvant70 / totalAVPER_avant70 : 0;
        var basePER_avant70 = Math.round(baseAvant70 * ratioPER);

        // Droits 990 I : 20% jusqu'à 700k, 31.25% au-delà
        var droits990I_PER = 0;
        if (basePER_avant70 > 0) {
            var parBen = basePER_avant70 / nbBen;
            for (var i = 0; i < nbBen; i++) {
                if (parBen <= PER_SEUIL_TRANCHE2 - PER_ABAT_AVANT_70) {
                    droits990I_PER += Math.round(parBen * PER_TAUX_TRANCHE1);
                } else {
                    var t1 = PER_SEUIL_TRANCHE2 - PER_ABAT_AVANT_70;
                    droits990I_PER += Math.round(t1 * PER_TAUX_TRANCHE1 + (parBen - t1) * PER_TAUX_TRANCHE2);
                }
            }
        }

        // --- Art. 757 B (après 70 ans) ---
        var droits757B_PER = 0;
        if (partApres70 > 0) {
            // Abattement 30 500€ global (partagé avec AV après 70 ans)
            var baseApres70 = Math.max(0, partApres70 - PER_ABAT_APRES_70);
            // Soumis aux DMTG classiques (barème ligne directe si enfants)
            if (baseApres70 > 0 && typeof SD !== 'undefined' && SD._fiscal) {
                var F = SD._fiscal;
                droits757B_PER = F.calcDroits(baseApres70 / nbBen, F.getBareme('enfant')) * nbBen;
            }
        }

        var droitsTotal = droits990I_PER + droits757B_PER;

        // Comparaison : s'il n'avait QUE de l'AV (pas de PER), les abattements seraient mieux utilisés ?
        // Non, c'est le même abattement. Mais le PER a un avantage : déductibilité des versements.

        return {
            applicable: true,
            capitalPER: capitalPER,
            partAvant70: partAvant70,
            partApres70: partApres70,
            droits990I: droits990I_PER,
            droits757B: droits757B_PER,
            droitsTotal: droitsTotal,
            abattementPartage: true,
            abattement990I_parBen: PER_ABAT_AVANT_70,
            abattement757B_global: PER_ABAT_APRES_70,
            nbBeneficiaires: nbBen,
            explanation: 'PER au décès : même régime que l\'AV (loi PACTE 2019). ' +
                'Avant 70 ans : ' + fmt(partAvant70) + ' soumis art. 990 I (abat. ' + fmt(PER_ABAT_AVANT_70) + '/bén). ' +
                'Après 70 ans : ' + fmt(partApres70) + ' soumis art. 757 B (abat. ' + fmt(PER_ABAT_APRES_70) + ' global). ' +
                'Droits estimés : ' + fmt(droitsTotal) + '.',
            warnings: [
                capitalAV > 0 ? '\u26a0\ufe0f Les abattements 152 500€ (990 I) et 30 500€ (757 B) sont PARTAGÉS entre AV et PER. Ils ne se cumulent pas !' : null,
                partApres70 > 0 ? '\u26a0\ufe0f Versements PER après 70 ans : abat. limité à 30 500€ global, puis DMTG classiques.' : null,
                'Avantage PER vs AV : les versements sont déductibles du revenu imposable (économie IR immédiate).'
            ].filter(Boolean),
            conseil: capitalAV > 0
                ? 'PER + AV = même abattement successoral. L\'avantage du PER est la déductibilité fiscale des versements. Stratégie : PER pour l\'économie IR, AV pour la souplesse.'
                : 'PER : même fiscalité successorale que l\'AV. Privilégier les versements AVANT 70 ans (abat. 152 500€/bén vs 30 500€ global après).',
            article: 'Art. 990 I + 757 B CGI — Loi PACTE 2019 (art. L224-1 Code monétaire)'
        };
    }

    /**
     * Compare PER vs AV vs succession directe.
     */
    function comparerPERAV(capital, ageDeces, nbBen) {
        // 100% en AV
        var avSeul = computePERSuccession({ capitalPER: 0, capitalAV: capital, ageDeces: ageDeces, nbBeneficiaires: nbBen });
        // 100% en PER
        var perSeul = computePERSuccession({ capitalPER: capital, capitalAV: 0, ageDeces: ageDeces, nbBeneficiaires: nbBen });
        // 50/50
        var mixte = computePERSuccession({ capitalPER: capital/2, capitalAV: capital/2, ageDeces: ageDeces, nbBeneficiaires: nbBen });
        // En succession directe (barème DMTG)
        var F = SD._fiscal;
        var droitsDirects = F.calcDroits(Math.max(0, capital/nbBen - 100000), F.getBareme('enfant')) * nbBen;

        return {
            avSeul: { droits: avSeul.droitsTotal || 0, label: '100% AV' },
            perSeul: { droits: perSeul.droitsTotal, label: '100% PER' },
            mixte: { droits: mixte.droitsTotal, label: '50% AV + 50% PER' },
            succession: { droits: droitsDirects, label: 'Succession directe' },
            meilleur: 'PER et AV = mêmes droits successoraux. PER avantageux pour la déductibilité IR.',
            note: 'Les droits sont identiques car l\'abattement est partagé. Le choix PER vs AV dépend de l\'économie IR souhaitée.'
        };
    }

    // ============================================================
    // 2. WARNING SCI + RÉSIDENCE PRINCIPALE
    // ============================================================

    /**
     * Détecte si la RP est logée en SCI et génère le warning.
     * Un couple marié/pacsé perd le droit d'habitation viager (art. 764 CC)
     * et l'abattement 20% RP (art. 764 bis CGI) si la RP est en SCI.
     */
    function checkSCIResidencePrincipale() {
        var state = getState();
        if (!state) return null;
        var immos = state.immos || [];
        var warnings = [];
        var rpEnSCI = false;

        immos.forEach(function(b) {
            var isSCI = b.detention === 'sci_ir' || b.detention === 'sci_is';
            var isRP = b.usage === 'rp' || b.usage === 'residence_principale' || b.isRP;
            if (isSCI && isRP) {
                rpEnSCI = true;
                var unionType = state._unionType || 'mariage';

                if (unionType === 'mariage' || unionType === 'pacs') {
                    warnings.push({
                        severity: 'error',
                        bien: b.nom || 'Résidence principale',
                        message: '\ud83d\udea8 RÉSIDENCE PRINCIPALE EN SCI — Le conjoint' + (unionType === 'pacs' ? '/pacsé' : '') + ' survivant PERD :',
                        impacts: [
                            'Droit d\'habitation viager (art. 764 CC) — le survivant peut être contraint de quitter le logement',
                            'Abattement 20% sur la valeur de la RP (art. 764 bis CGI) — surcoût fiscal',
                            'Droit préférentiel d\'attribution — impossibilité de demander la RP en priorité lors du partage'
                        ],
                        conseil: 'Pour un couple marié/pacsé, la RP ne doit PAS être en SCI. Sortir le bien de la SCI ou ne pas y loger sa RP. La SCI est utile pour l\'immobilier LOCATIF, pas pour la RP du couple.',
                        valeurImpact: Math.round((b.valeur || 0) * 0.20), // perte abattement 20%
                        article: 'Art. 764 + 764 bis CGI'
                    });
                }

                if (unionType === 'concubinage') {
                    // Pour les concubins, c'est l'inverse : la SCI croisée PROTÈGE le logement
                    warnings.push({
                        severity: 'info',
                        bien: b.nom || 'Résidence principale',
                        message: '\u2139\ufe0f RP en SCI + concubinage : la SCI à démembrement croisé PROTÈGE le survivant (il peut rester dans le logement).',
                        conseil: 'Pour les concubins, la SCI croisée est recommandée pour la RP.',
                        article: 'Art. 1845 CC'
                    });
                }
            }
        });

        return { rpEnSCI: rpEnSCI, warnings: warnings };
    }

    // ============================================================
    // 3. CLAUSE BÉNÉFICIAIRE AV / PER
    // ============================================================

    /**
     * Analyse la clause bénéficiaire et calcule l'impact fiscal.
     * Utilise les désignations saisies dans le profil des personnes.
     *
     * @param {Array} contrats - [{type:'av'|'per', montant, ageSouscripteur, beneficiaires:[{nom, lien, part}]}]
     * @returns {Object} Analyse complète avec warnings
     */
    function analyserClauseBeneficiaire(contrats) {
        if (!contrats || contrats.length === 0) return { contrats: [], warnings: [], totalAV: 0, totalPER: 0 };

        var totalAV = 0, totalPER = 0;
        var analyses = [];
        var globalWarnings = [];

        contrats.forEach(function(c, idx) {
            var type = c.type || 'av';
            var montant = c.montant || 0;
            var age = c.ageSouscripteur || 55;
            var bens = c.beneficiaires || [];
            if (type === 'per') totalPER += montant; else totalAV += montant;

            var analyse = {
                contrat: type.toUpperCase() + ' #' + (idx + 1),
                montant: montant,
                type: type,
                beneficiaires: [],
                warnings: []
            };

            // Vérifier que les parts totalisent 100%
            var totalParts = 0;
            bens.forEach(function(b) { totalParts += (b.part || 0); });
            if (bens.length > 0 && Math.abs(totalParts - 1) > 0.01) {
                analyse.warnings.push('\u26a0\ufe0f Parts ne totalisent pas 100% (total = ' + Math.round(totalParts * 100) + '%). Vérifier la clause.');
            }

            // Pas de bénéficiaire désigné → réintégration succession
            if (bens.length === 0) {
                analyse.warnings.push('\ud83d\udea8 Pas de bénéficiaire désigné ! Le capital sera réintégré dans la succession et soumis aux DMTG classiques.');
            }

            // Bénéficiaire unique sans second rang
            if (bens.length === 1) {
                analyse.warnings.push('\u26a0\ufe0f Un seul bénéficiaire sans second rang. Si cette personne décède avant vous, le capital rejoint la succession. Ajoutez « à défaut mes héritiers ».');
            }

            // Analyser chaque bénéficiaire
            bens.forEach(function(b) {
                var partMontant = Math.round(montant * (b.part || 0));
                var lien = b.lien || 'tiers';
                var exonere = lien === 'conjoint_pacs';

                // Pour concubin : 990 I applicable (abat 152.5k)
                var droitsEstimes = 0;
                if (!exonere) {
                    if (age < 70) {
                        var base = Math.max(0, partMontant - PER_ABAT_AVANT_70);
                        droitsEstimes = base <= PER_SEUIL_TRANCHE2 - PER_ABAT_AVANT_70
                            ? Math.round(base * PER_TAUX_TRANCHE1)
                            : Math.round((PER_SEUIL_TRANCHE2 - PER_ABAT_AVANT_70) * PER_TAUX_TRANCHE1 + (base - PER_SEUIL_TRANCHE2 + PER_ABAT_AVANT_70) * PER_TAUX_TRANCHE2);
                    } else {
                        // Après 70 : DMTG classiques
                        if (typeof SD !== 'undefined' && SD._fiscal) {
                            var abat = SD._fiscal.getAbattement(lien, true);
                            droitsEstimes = SD._fiscal.calcDroits(Math.max(0, partMontant - abat), SD._fiscal.getBareme(lien));
                        }
                    }
                }

                // Ex-conjoint désigné par nom ?
                if (b.exConjoint) {
                    analyse.warnings.push('\ud83d\udea8 ' + (b.nom || 'Bénéficiaire') + ' est un ex-conjoint désigné par nom. En cas de divorce, c\'est LUI qui perçoit le capital ! Préférez la mention « mon conjoint » sans le nommer.');
                }

                analyse.beneficiaires.push({
                    nom: b.nom || 'Bénéficiaire',
                    lien: lien,
                    part: b.part || 0,
                    montant: partMontant,
                    exonere: exonere,
                    droitsEstimes: droitsEstimes
                });
            });

            analyses.push(analyse);
        });

        // Warning global : abattement partagé AV + PER
        if (totalAV > 0 && totalPER > 0) {
            globalWarnings.push('\u26a0\ufe0f AV (' + fmt(totalAV) + ') + PER (' + fmt(totalPER) + ') = ' + fmt(totalAV + totalPER) + '. Les abattements 152 500€ et 30 500€ sont PARTAGÉS entre les deux enveloppes.');
        }

        return { contrats: analyses, warnings: globalWarnings, totalAV: totalAV, totalPER: totalPER, totalAVPER: totalAV + totalPER };
    }

    // ============================================================
    // RENDU — Panneaux dans step 5
    // ============================================================

    function renderPanels() {
        var state = getState();
        if (!state) return;

        var existing = document.getElementById('per-av-clause-panel');
        if (existing) existing.remove();

        var html = '';
        var hasContent = false;

        // --- PER détecté ---
        var financials = state.financials || [];
        var totalPER = 0, totalAV = 0;
        financials.forEach(function(f) {
            if (f.type === 'per') totalPER += (f.montant || 0);
            if (f.type === 'assurance_vie' || f.type === 'av_capitalisation') totalAV += (f.montant || 0);
        });

        if (totalPER > 0) {
            hasContent = true;
            var ageDonateur = 55;
            var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
            if (donors.length > 0 && donors[0].age) ageDonateur = donors[0].age;

            var nbBen = (state.beneficiaries || []).filter(function(b) { return b.lien === 'enfant'; }).length || 1;
            var perResult = computePERSuccession({ capitalPER: totalPER, capitalAV: totalAV, ageDeces: ageDonateur, nbBeneficiaires: nbBen });

            html += '<div style="padding:16px 18px;border-radius:12px;background:rgba(167,139,250,.04);border:1px solid rgba(167,139,250,.15);margin-bottom:12px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:10px;"><i class="fas fa-piggy-bank" style="color:var(--accent-purple);font-size:.9rem;"></i>';
            html += '<strong style="font-size:.85rem;">PER — Plan Épargne Retraite (' + fmt(totalPER) + ')</strong></div>';
            if (perResult.droitsTotal > 0) html += '<span style="padding:3px 10px;border-radius:15px;font-size:.72rem;font-weight:700;color:var(--accent-coral);background:rgba(255,107,107,.1);">Droits : ' + fmt(perResult.droitsTotal) + '</span>';
            else html += '<span style="padding:3px 10px;border-radius:15px;font-size:.72rem;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.1);">Exonéré</span>';
            html += '</div>';
            html += '<div style="font-size:.78rem;color:var(--text-secondary);line-height:1.6;">' + perResult.explanation + '</div>';

            // Warnings
            perResult.warnings.forEach(function(w) {
                html += '<div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">' + w + '</div>';
            });

            html += '<div style="font-size:.78rem;padding:8px 12px;margin-top:8px;border-radius:8px;background:rgba(167,139,250,.06);border-left:3px solid var(--accent-purple);">';
            html += '<strong>Conseil :</strong> ' + perResult.conseil + '</div>';
            html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + perResult.article + '</div>';
            html += '</div>';
        }

        // --- Warning SCI + RP ---
        var sciRP = checkSCIResidencePrincipale();
        if (sciRP && sciRP.warnings.length > 0) {
            hasContent = true;
            sciRP.warnings.forEach(function(w) {
                var isError = w.severity === 'error';
                html += '<div style="padding:16px 18px;border-radius:12px;background:' + (isError ? 'rgba(255,107,107,.04)' : 'rgba(59,130,246,.04)') + ';border:1px solid ' + (isError ? 'rgba(255,107,107,.2)' : 'rgba(59,130,246,.15)') + ';margin-bottom:12px;">';
                html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><i class="fas fa-home" style="color:' + (isError ? 'var(--accent-coral)' : 'var(--accent-blue)') + ';"></i>';
                html += '<strong style="font-size:.85rem;">' + w.message + '</strong></div>';
                if (w.impacts) {
                    w.impacts.forEach(function(imp) {
                        html += '<div style="font-size:.78rem;color:var(--text-secondary);padding:4px 0 4px 24px;">• ' + imp + '</div>';
                    });
                }
                if (w.valeurImpact > 0) {
                    html += '<div style="font-size:.78rem;color:var(--accent-coral);font-weight:600;margin-top:6px;">Surcoût fiscal estimé : +' + fmt(w.valeurImpact) + ' (perte abat. 20% RP)</div>';
                }
                html += '<div style="font-size:.78rem;padding:8px 12px;margin-top:8px;border-radius:8px;background:rgba(198,134,66,.04);border-left:3px solid ' + (isError ? 'var(--accent-coral)' : 'var(--accent-blue)') + ';">';
                html += '<strong>Action :</strong> ' + w.conseil + '</div>';
                html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + w.article + '</div>';
                html += '</div>';
            });
        }

        if (!hasContent) return;

        var panel = '<div class="section-card" id="per-av-clause-panel" style="border-color:rgba(167,139,250,.2);margin-bottom:20px;">';
        panel += '<div class="section-title"><i class="fas fa-shield-alt" style="background:linear-gradient(135deg,rgba(167,139,250,.2),rgba(167,139,250,.1));color:var(--accent-purple);"></i> Enveloppes fiscales & alertes</div>';
        panel += '<div class="section-subtitle">PER, assurance vie, clauses bénéficiaires et alertes immobilières</div>';
        panel += html;
        panel += '</div>';

        var anchor = document.getElementById('fiscal-optimizations-panel') || document.getElementById('inheritance-rules-panel') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', panel);
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
            setTimeout(renderPanels, 500);
        };
        console.log('[PERAvClause v1] Loaded — PER succession, SCI+RP warning, clause bénéficiaire');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 700); });
    else setTimeout(init, 700);

    return {
        computePERSuccession: computePERSuccession,
        comparerPERAV: comparerPERAV,
        checkSCIResidencePrincipale: checkSCIResidencePrincipale,
        analyserClauseBeneficiaire: analyserClauseBeneficiaire,
        PER_ABAT_AVANT_70: PER_ABAT_AVANT_70,
        PER_ABAT_APRES_70: PER_ABAT_APRES_70
    };
})();
