/**
 * fiscal-optimizations.js — Optimisations fiscales avancées
 * 
 * 4 leviers issus de la presse patrimoniale (Capital mars 2026) :
 * 1. SCI décote 15% sur parts (illiquidité admise par le fisc)
 * 2. Primes AV exagérées (seuil 35% patrimoine → risque réintégration)
 * 3. Démembrement croisé SCI concubins (protection logement sans taxe 60%)
 * 4. Foncier rural (forêts, vignes, GFV/GFA/GFI) — exonération 75%
 *
 * Charge APRÈS civil-rights.js et comparison-table-unions.js
 * @version 1.0.0 — 2026-03-13
 */
const FiscalOptimizations = (function() {
    'use strict';

    // ============================================================
    // 1. SCI — DÉCOTE 15% SUR PARTS SOCIALES
    // ============================================================
    var SCI_DECOTE = 0.15;
    var SCI_FRAIS_NOTAIRE = 1500;

    /**
     * Applique la décote SCI de 15% sur la valeur d'un bien détenu via SCI.
     * Les parts de SCI sont réputées illiquides → le fisc admet 15% de décote.
     * @param {number} valeurBien - Valeur vénale du bien
     * @param {string} detention - Mode de détention ('direct', 'sci_is', 'sci_ir', 'indivision')
     * @returns {Object} { valeurFiscale, decote, economie, applicable, explanation }
     */
    function applySCIDecote(valeurBien, detention) {
        var isSCI = detention === 'sci_is' || detention === 'sci_ir';
        if (!isSCI || valeurBien <= 0) {
            return { valeurFiscale: valeurBien, decote: 0, economie: 0, applicable: false, explanation: 'Détention directe — pas de décote SCI.' };
        }
        var decote = Math.round(valeurBien * SCI_DECOTE);
        var valeurFiscale = valeurBien - decote;
        return {
            valeurFiscale: valeurFiscale,
            decote: decote,
            economie: decote,
            applicable: true,
            fraisCreation: SCI_FRAIS_NOTAIRE,
            explanation: 'SCI : décote 15% admise par le fisc (illiquidité des parts). Valeur ' + fmt(valeurBien) + ' → assiette fiscale ' + fmt(valeurFiscale) + ' (économie ' + fmt(decote) + ').' +
                ' Frais de création SCI ~' + fmt(SCI_FRAIS_NOTAIRE) + '.'
        };
    }

    /**
     * Calcule l'impact fiscal total de la décote SCI sur un patrimoine immobilier.
     * Scanne tous les biens en mode détaillé et applique la décote si SCI.
     */
    function computeSCIImpact() {
        var state = getState();
        if (!state) return null;
        var biens = state.immos || [];
        var totalDecote = 0, biensEligibles = 0, details = [];
        biens.forEach(function(b) {
            var r = applySCIDecote(b.valeur || 0, b.detention || 'direct');
            if (r.applicable) {
                totalDecote += r.decote;
                biensEligibles++;
                details.push({ nom: b.nom || 'Bien immobilier', valeur: b.valeur, decote: r.decote, valeurFiscale: r.valeurFiscale });
            }
        });
        return { totalDecote: totalDecote, biensEligibles: biensEligibles, details: details };
    }

    // ============================================================
    // 2. PRIMES AV EXAGÉRÉES — ALERTE RÉINTÉGRATION
    // ============================================================
    var AV_SEUIL_EXAGERE = 0.35;
    var AV_SEUIL_REVENUS_ANNUELS = 0.50;

    /**
     * Vérifie si les primes AV sont exagérées eu égard au patrimoine.
     * Si > 35% du patrimoine total → risque de réintégration dans la succession.
     * Si > 50% des revenus annuels → risque aggravé (jurisprudence Cass. 2ème civ.).
     *
     * @param {number} totalPrimesAV - Total des primes versées en AV
     * @param {number} patrimoineTotal - Patrimoine total (actif net)
     * @param {number} revenusAnnuels - Revenus annuels du souscripteur (optionnel)
     * @returns {Object} { isExagere, ratio, risque, warnings, recommandations }
     */
    function checkPrimesExagerees(totalPrimesAV, patrimoineTotal, revenusAnnuels) {
        if (patrimoineTotal <= 0) return { isExagere: false, ratio: 0, risque: 'aucun', warnings: [], recommandations: [] };
        var ratio = totalPrimesAV / patrimoineTotal;
        var ratioRevenus = revenusAnnuels > 0 ? totalPrimesAV / revenusAnnuels : 0;
        var warnings = [], recommandations = [];
        var risque = 'aucun';

        if (ratio > AV_SEUIL_EXAGERE) {
            risque = ratioRevenus > AV_SEUIL_REVENUS_ANNUELS ? 'eleve' : 'moyen';
            warnings.push('\u26a0\ufe0f Primes AV = ' + Math.round(ratio * 100) + '% du patrimoine (seuil alerte : 35%). ' +
                'Les héritiers réservataires peuvent demander la réintégration du contrat dans la succession.');
            if (ratioRevenus > AV_SEUIL_REVENUS_ANNUELS) {
                warnings.push('\ud83d\udea8 Primes AV > 50% des revenus annuels → risque élevé de requalification (Cass. 2\u00e8me civ., arrêts constants).');
            }
            recommandations.push('Limiter les primes AV à ' + fmt(Math.round(patrimoineTotal * AV_SEUIL_EXAGERE)) + ' (35% du patrimoine).');
            recommandations.push('Diversifier : démembrement immobilier, donation NP, SCI + décote 15%.');
            recommandations.push('Étaler les versements dans le temps pour réduire le ratio annuel.');
            if (revenusAnnuels > 0) recommandations.push('Plafond prudent/an : ' + fmt(Math.round(revenusAnnuels * 0.30)) + ' (30% des revenus).');
        }

        return {
            isExagere: ratio > AV_SEUIL_EXAGERE,
            ratio: ratio,
            ratioRevenus: ratioRevenus,
            risque: risque,
            seuilMax: Math.round(patrimoineTotal * AV_SEUIL_EXAGERE),
            depassement: ratio > AV_SEUIL_EXAGERE ? totalPrimesAV - Math.round(patrimoineTotal * AV_SEUIL_EXAGERE) : 0,
            warnings: warnings,
            recommandations: recommandations
        };
    }

    /**
     * Scanne le patrimoine et détecte les AV exagérées.
     */
    function detectAVExagerees() {
        var state = getState();
        if (!state) return null;
        var F = SD._fiscal;
        var pat = F.computePatrimoine();
        var totalAV = 0;
        (state.financials || []).forEach(function(f) {
            if (f.type === 'assurance_vie' || f.type === 'av_capitalisation') totalAV += (f.montant || 0);
        });
        return checkPrimesExagerees(totalAV, pat.actifNet, 0);
    }

    // ============================================================
    // 3. DÉMEMBREMENT CROISÉ SCI CONCUBINS
    // ============================================================

    /**
     * Calcule le montage "démembrement croisé SCI" pour concubins.
     * Chaque concubin détient la NP de ses parts + l'US des parts de l'autre.
     * Au décès, le survivant récupère la PP de ses parts (US s'éteint) SANS DROITS
     * et conserve l'US des parts du défunt → reste dans le logement.
     * Les héritiers du défunt récupèrent la NP.
     *
     * @param {number} valeurBien - Valeur du bien en SCI
     * @param {number} ageA - Âge du concubin A
     * @param {number} ageB - Âge du concubin B
     * @param {number} nbEnfantsA - Enfants du concubin A
     * @param {number} nbEnfantsB - Enfants du concubin B
     * @returns {Object} Montage complet avec économie vs direct
     */
    function computeDemembrementCroiseSCI(valeurBien, ageA, ageB, nbEnfantsA, nbEnfantsB) {
        var F = SD._fiscal;
        var partChacun = valeurBien / 2;
        var decotePartChacun = Math.round(partChacun * (1 - SCI_DECOTE));

        // NP ratio selon âge (art. 669)
        var npRatioA = F.getNPRatio(ageA || 50);
        var npRatioB = F.getNPRatio(ageB || 50);

        // Scénario 1: SANS montage (concubin = tiers 60%)
        var droitsDirect = Math.round(Math.max(0, partChacun - 1594) * 0.60);

        // Scénario 2: AVEC démembrement croisé SCI
        // Au décès de A : le survivant B ne paie RIEN (l'US des parts de A qu'il détient s'éteint,
        // et la NP de ses propres parts se reconstitue en PP sans droits).
        // Les enfants de A héritent de la NP des parts de A (valorisée en NP après décote SCI).
        var npPartsA = Math.round(decotePartChacun * npRatioA);
        var npPartsB = Math.round(decotePartChacun * npRatioB);

        // Droits succession enfants sur NP (ligne directe, pas tiers !)
        var abatEnfantA = 100000 * Math.max(1, nbEnfantsA);
        var baseEnfantsA = Math.max(0, npPartsA - abatEnfantA);
        var droitsEnfantsA = baseEnfantsA > 0 ? F.calcDroits(baseEnfantsA / Math.max(1, nbEnfantsA), F.getBareme('enfant')) * Math.max(1, nbEnfantsA) : 0;

        var economie = droitsDirect - droitsEnfantsA;

        return {
            valeurBien: valeurBien,
            partChacun: partChacun,
            decotePartChacun: decotePartChacun,
            scenarioDirect: { droits: droitsDirect, taux: 0.60, explanation: 'Concubin tiers : 60% sur ' + fmt(partChacun) + ' après abat. 1 594\u20ac.' },
            scenarioCroise: {
                droitsSurvivant: 0,
                droitsEnfants: droitsEnfantsA,
                npValeur: npPartsA,
                explanation: 'D\u00e9membrement crois\u00e9 SCI : survivant exon\u00e9r\u00e9 (US s\'\u00e9teint + NP→PP sans droits). Enfants h\u00e9ritent NP ' + fmt(npPartsA) + ' (ligne directe, barème 5-45%).'
            },
            economie: economie,
            fraisCreation: SCI_FRAIS_NOTAIRE + 500,
            applicable: true,
            conditions: ['Les 2 concubins doivent détenir 50/50', 'Chacun détient NP de ses parts + US des parts de l\'autre', 'Statuts SCI doivent prévoir la clause de démembrement croisé'],
            warnings: nbEnfantsA === 0 ? ['Sans enfant de A, les parts NP vont aux héritiers légaux (parents, frères...)'] : []
        };
    }

    // ============================================================
    // 4. FONCIER RURAL — EXONÉRATION 75% (GFV/GFA/GFI)
    // ============================================================
    var FONCIER_RURAL_EXONERATION = 0.75;
    var FONCIER_RURAL_PLAFOND = 500000;
    var FONCIER_RURAL_RENDEMENT_MIN = 0.015;
    var FONCIER_RURAL_RENDEMENT_MAX = 0.02;
    var FONCIER_RURAL_TICKET_ENTREE = 5000;

    /**
     * Calcule l'exonération 75% pour les actifs fonciers ruraux.
     * S'applique aux : forêts (GFI), vignes (GFV), terres agricoles (GFA).
     * Plafond : 500 000€ par bénéficiaire pour vignes/terres.
     * Forêts : régime Monichon, pas de plafond mais engagement de gestion 30 ans.
     *
     * @param {number} valeur - Valeur de l'investissement foncier
     * @param {string} type - 'foret'|'vigne'|'terre_agricole'|'gfv'|'gfa'|'gfi'
     * @param {number} nbBeneficiaires - Nombre de bénéficiaires
     * @returns {Object} { valeurTaxable, exoneration, economieEstimee, conditions }
     */
    function computeFoncierRural(valeur, type, nbBeneficiaires) {
        if (valeur <= 0) return { valeurTaxable: valeur, exoneration: 0, economieEstimee: 0, applicable: false };
        var nBen = Math.max(1, nbBeneficiaires || 1);
        var partParBen = valeur / nBen;
        var isForet = type === 'foret' || type === 'gfi';

        // Plafond 500k€/bénéficiaire pour vigne/terre, pas de plafond forêt
        var baseExo = isForet ? partParBen : Math.min(partParBen, FONCIER_RURAL_PLAFOND);
        var exoParBen = Math.round(baseExo * FONCIER_RURAL_EXONERATION);
        var taxableParBen = partParBen - exoParBen;
        var totalExo = exoParBen * nBen;
        var totalTaxable = taxableParBen * nBen;

        // Estimation droits économisés (barème ligne directe ~20% moyen)
        var economieEstimee = Math.round(totalExo * 0.20);

        var typeLabel = { foret: 'For\u00eat (GFI)', vigne: 'Vigne (GFV)', terre_agricole: 'Terre agricole (GFA)', gfv: 'GFV', gfa: 'GFA', gfi: 'GFI' };

        return {
            valeurTaxable: totalTaxable,
            exoneration: totalExo,
            economieEstimee: economieEstimee,
            applicable: true,
            type: typeLabel[type] || type,
            rendementEstime: FONCIER_RURAL_RENDEMENT_MIN + ' - ' + FONCIER_RURAL_RENDEMENT_MAX,
            ticketEntree: FONCIER_RURAL_TICKET_ENTREE,
            explanation: (typeLabel[type] || type) + ' : exonération 75% (seuls 25% taxés). ' +
                fmt(valeur) + ' → assiette ' + fmt(totalTaxable) + '. ' +
                '\u00c9conomie estim\u00e9e ~' + fmt(economieEstimee) + '.',
            conditions: isForet
                ? ['Engagement de gestion durable 30 ans (régime Monichon)', 'Pas de plafond par bénéficiaire', 'Rendement ~1,5-2%/an']
                : ['Bail rural en cours (min. 18 ans pour terres, 25 ans pour vignes)', 'Plafond ' + fmt(FONCIER_RURAL_PLAFOND) + '/bénéficiaire', 'Conservation 5 ans minimum', 'Rendement ~1,5-2%/an', 'Ticket entrée dès ' + fmt(FONCIER_RURAL_TICKET_ENTREE)]
        };
    }

    // ============================================================
    // PATCH SD — Injection des warnings dans step 5
    // ============================================================

    function renderOptimizationWarnings() {
        var warningsEl = document.getElementById('results-warnings');
        if (!warningsEl) return;
        var html = '';

        // --- SCI Décote ---
        var sciImpact = computeSCIImpact();
        if (sciImpact && sciImpact.biensEligibles > 0) {
            html += '<div class="warning-box success" style="margin-top:8px;"><i class="fas fa-building"></i><span>';
            html += '<strong>SCI — Décote 15% applicable</strong> sur ' + sciImpact.biensEligibles + ' bien(s). ';
            html += 'Réduction d\'assiette : <strong>' + fmt(sciImpact.totalDecote) + '</strong>. ';
            html += 'Les parts de SCI étant illiquides, le fisc admet cette décote sur leur valeur vénale.';
            html += '</span></div>';
        }

        // --- AV Exagérées ---
        var avCheck = detectAVExagerees();
        if (avCheck && avCheck.isExagere) {
            var cssClass = avCheck.risque === 'eleve' ? 'error' : 'warn';
            var icon = avCheck.risque === 'eleve' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
            html += '<div class="warning-box ' + cssClass + '" style="margin-top:8px;"><i class="fas ' + icon + '"></i><span>';
            html += '<strong>\u26a0\ufe0f Primes AV potentiellement exagérées</strong> (' + Math.round(avCheck.ratio * 100) + '% du patrimoine, seuil 35%). ';
            html += 'Risque : réintégration du contrat dans la succession par les héritiers réservataires. ';
            html += '<br><strong>Plafond prudent :</strong> ' + fmt(avCheck.seuilMax) + '. ';
            html += '<strong>Dépassement :</strong> ' + fmt(avCheck.depassement) + '.';
            if (avCheck.recommandations.length > 0) {
                html += '<br><em>Alternatives : ' + avCheck.recommandations.slice(0, 2).join(' · ') + '</em>';
            }
            html += '</span></div>';
        }

        // --- Démembrement croisé SCI concubins ---
        var state = getState();
        if (state && state._unionType === 'concubinage') {
            var immos = state.immos || [];
            var totalImmo = 0;
            immos.forEach(function(b) { totalImmo += (b.valeur || 0); });
            if (totalImmo > 0) {
                html += '<div class="warning-box info" style="margin-top:8px;"><i class="fas fa-key"></i><span>';
                html += '<strong>\ud83c\udfe0 Concubinage + immobilier → SCI à démembrement croisé</strong><br>';
                html += 'Permet au survivant de rester dans le logement sans payer 60%. ';
                html += 'Chaque concubin détient la NP de ses parts + l\'US des parts de l\'autre. ';
                html += 'Au décès : le survivant reconstitue la PP de ses parts (US s\'éteint) sans droits. ';
                html += 'Les enfants héritent de la NP des parts du défunt au <strong>barème ligne directe (5-45%)</strong> au lieu de 60%. ';
                html += 'Coût de mise en place : ~' + fmt(SCI_FRAIS_NOTAIRE + 500) + '.';
                html += '</span></div>';
            }
        }

        // --- Foncier rural ---
        var financials = state ? (state.financials || []) : [];
        financials.forEach(function(f) {
            if (f.type === 'gfv' || f.type === 'gfa' || f.type === 'gfi' || f.type === 'foret' || f.type === 'vigne' || f.type === 'terre_agricole') {
                var nBen = state.beneficiaries ? state.beneficiaries.filter(function(b) { return b.lien === 'enfant'; }).length : 1;
                var r = computeFoncierRural(f.montant || 0, f.type, nBen);
                if (r.applicable) {
                    html += '<div class="warning-box success" style="margin-top:8px;"><i class="fas fa-tree"></i><span>';
                    html += '<strong>\ud83c\udf3e ' + r.type + ' — Exonération 75%</strong>. ';
                    html += r.explanation;
                    html += '</span></div>';
                }
            }
        });

        if (html) warningsEl.insertAdjacentHTML('beforeend', html);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() {
        return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null;
    }

    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    // ============================================================
    // INIT — Patch SD.calculateResults
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(renderOptimizationWarnings, 300);
        };
        console.log('[FiscalOptimizations] Patched — SCI décote 15%, AV exagérées, démembrement croisé, foncier rural 75%');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 400); });
    else setTimeout(init, 400);

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        applySCIDecote: applySCIDecote,
        computeSCIImpact: computeSCIImpact,
        checkPrimesExagerees: checkPrimesExagerees,
        detectAVExagerees: detectAVExagerees,
        computeDemembrementCroiseSCI: computeDemembrementCroiseSCI,
        computeFoncierRural: computeFoncierRural,
        SCI_DECOTE: SCI_DECOTE,
        AV_SEUIL_EXAGERE: AV_SEUIL_EXAGERE,
        FONCIER_RURAL_EXONERATION: FONCIER_RURAL_EXONERATION,
        FONCIER_RURAL_PLAFOND: FONCIER_RURAL_PLAFOND
    };
})();
