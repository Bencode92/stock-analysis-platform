/**
 * fiscal-optimizations.js v2.1 — Don familial 31 865€ intégré
 *
 * 5 leviers avec calcul RÉEL :
 * 1. SCI décote 15%
 * 2. AV exagérées
 * 3. Démembrement croisé SCI concubins
 * 4. Foncier rural 75%
 * 5. NEW: Don familial 31 865€ (art. 790 G CGI) — cumulable avec abattement classique
 *
 * @version 2.1.0 — 2026-03-13
 */
const FiscalOptimizations = (function() {
    'use strict';

    var SCI_DECOTE = 0.15;
    var SCI_FRAIS_NOTAIRE = 1500;
    var AV_SEUIL_EXAGERE = 0.35;
    var AV_SEUIL_REVENUS_ANNUELS = 0.50;
    var FONCIER_RURAL_EXONERATION = 0.75;
    var FONCIER_RURAL_PLAFOND = 500000;
    var FONCIER_RURAL_RENDEMENT_MIN = 0.015;
    var FONCIER_RURAL_RENDEMENT_MAX = 0.02;
    var FONCIER_RURAL_TICKET_ENTREE = 5000;
    var DON_FAMILIAL_MONTANT = 31865;
    var DON_FAMILIAL_AGE_DONATEUR_MAX = 80;
    var DON_FAMILIAL_AGE_DONATAIRE_MIN = 18;

    // ============================================================
    // 1. SCI DÉCOTE 15%
    // ============================================================

    function applySCIDecote(valeurBien, detention) {
        var isSCI = detention === 'sci_is' || detention === 'sci_ir';
        if (!isSCI || valeurBien <= 0) return { valeurFiscale: valeurBien, decote: 0, economie: 0, applicable: false, explanation: 'Détention directe — pas de décote SCI.' };
        var decote = Math.round(valeurBien * SCI_DECOTE);
        return { valeurFiscale: valeurBien - decote, decote: decote, economie: decote, applicable: true, fraisCreation: SCI_FRAIS_NOTAIRE,
            explanation: 'SCI : décote 15% (illiquidité). ' + fmt(valeurBien) + ' → ' + fmt(valeurBien - decote) + ' (−' + fmt(decote) + ').' };
    }

    function computeSCIImpact() {
        var state = getState(); if (!state) return null;
        var biens = state.immos || [], totalDecote = 0, biensEligibles = 0, details = [];
        biens.forEach(function(b) {
            var r = applySCIDecote(b.valeur || 0, b.detention || 'direct');
            if (r.applicable) { totalDecote += r.decote; biensEligibles++; details.push({ nom: b.nom || 'Bien', valeur: b.valeur, decote: r.decote, valeurFiscale: r.valeurFiscale }); }
        });
        return { totalDecote: totalDecote, biensEligibles: biensEligibles, details: details };
    }

    // ============================================================
    // 2. PRIMES AV EXAGÉRÉES
    // ============================================================

    function checkPrimesExagerees(totalPrimesAV, patrimoineTotal, revenusAnnuels) {
        if (patrimoineTotal <= 0) return { isExagere: false, ratio: 0, risque: 'aucun', warnings: [], recommandations: [] };
        var ratio = totalPrimesAV / patrimoineTotal;
        var ratioRevenus = revenusAnnuels > 0 ? totalPrimesAV / revenusAnnuels : 0;
        var warnings = [], recommandations = [], risque = 'aucun';
        if (ratio > AV_SEUIL_EXAGERE) {
            risque = ratioRevenus > AV_SEUIL_REVENUS_ANNUELS ? 'eleve' : 'moyen';
            warnings.push('Primes AV = ' + Math.round(ratio * 100) + '% du patrimoine (seuil 35%). Risque réintégration.');
            if (ratioRevenus > AV_SEUIL_REVENUS_ANNUELS) warnings.push('AV > 50% revenus annuels → risque élevé (Cass. 2ème civ.).');
            recommandations.push('Limiter AV à ' + fmt(Math.round(patrimoineTotal * AV_SEUIL_EXAGERE)) + ' (35%).');
            recommandations.push('Diversifier : démembrement NP, SCI décote 15%, GFV/GFA.');
            recommandations.push('Étaler les versements dans le temps.');
        }
        return { isExagere: ratio > AV_SEUIL_EXAGERE, ratio: ratio, ratioRevenus: ratioRevenus, risque: risque,
            seuilMax: Math.round(patrimoineTotal * AV_SEUIL_EXAGERE),
            depassement: ratio > AV_SEUIL_EXAGERE ? totalPrimesAV - Math.round(patrimoineTotal * AV_SEUIL_EXAGERE) : 0,
            warnings: warnings, recommandations: recommandations };
    }

    function detectAVExagerees() {
        var state = getState(); if (!state) return null;
        var F = SD._fiscal, pat = F.computePatrimoine(), totalAV = 0;
        (state.financials || []).forEach(function(f) { if (f.type === 'assurance_vie' || f.type === 'av_capitalisation') totalAV += (f.montant || 0); });
        return checkPrimesExagerees(totalAV, pat.actifNet, 0);
    }

    // ============================================================
    // 3. DÉMEMBREMENT CROISÉ SCI CONCUBINS
    // ============================================================

    function computeDemembrementCroiseSCI(valeurBien, ageA, ageB, nbEnfantsA, nbEnfantsB) {
        var F = SD._fiscal;
        var partChacun = valeurBien / 2;
        var decotePartChacun = Math.round(partChacun * (1 - SCI_DECOTE));
        var npRatioA = F.getNPRatio(ageA || 50);
        var droitsDirect = Math.round(Math.max(0, partChacun - 1594) * 0.60);
        var npPartsA = Math.round(decotePartChacun * npRatioA);
        var abatEnfantA = 100000 * Math.max(1, nbEnfantsA);
        var baseEnfantsA = Math.max(0, npPartsA - abatEnfantA);
        var droitsEnfantsA = baseEnfantsA > 0 ? F.calcDroits(baseEnfantsA / Math.max(1, nbEnfantsA), F.getBareme('enfant')) * Math.max(1, nbEnfantsA) : 0;
        return {
            valeurBien: valeurBien, partChacun: partChacun, decotePartChacun: decotePartChacun,
            scenarioDirect: { droits: droitsDirect, taux: 0.60, explanation: 'Concubin tiers : 60% sur ' + fmt(partChacun) },
            scenarioCroise: { droitsSurvivant: 0, droitsEnfants: droitsEnfantsA, npValeur: npPartsA,
                explanation: 'SCI croisée : survivant 0€. Enfants NP ' + fmt(npPartsA) + ' en ligne directe.' },
            economie: droitsDirect - droitsEnfantsA, fraisCreation: SCI_FRAIS_NOTAIRE + 500, applicable: true,
            conditions: ['Détention 50/50', 'NP ses parts + US parts de l\'autre', 'Clause dans statuts SCI'],
            warnings: nbEnfantsA === 0 ? ['Sans enfant, NP va aux héritiers légaux'] : []
        };
    }

    // ============================================================
    // 4. FONCIER RURAL 75%
    // ============================================================

    function computeFoncierRural(valeur, type, nbBeneficiaires) {
        if (valeur <= 0) return { valeurTaxable: valeur, exoneration: 0, economieEstimee: 0, applicable: false };
        var nBen = Math.max(1, nbBeneficiaires || 1), partParBen = valeur / nBen;
        var isForet = type === 'foret' || type === 'gfi';
        var baseExo = isForet ? partParBen : Math.min(partParBen, FONCIER_RURAL_PLAFOND);
        var exoParBen = Math.round(baseExo * FONCIER_RURAL_EXONERATION);
        var totalExo = exoParBen * nBen, totalTaxable = (partParBen - exoParBen) * nBen;
        var typeLabel = { foret: 'Forêt/GFI', vigne: 'Vigne/GFV', terre_agricole: 'Terre/GFA', gfv: 'GFV', gfa: 'GFA', gfi: 'GFI' };
        return { valeurTaxable: totalTaxable, exoneration: totalExo, economieEstimee: Math.round(totalExo * 0.20),
            applicable: true, type: typeLabel[type] || type, ticketEntree: FONCIER_RURAL_TICKET_ENTREE,
            explanation: (typeLabel[type] || type) + ' : exo 75%. ' + fmt(valeur) + ' → taxable ' + fmt(totalTaxable),
            conditions: isForet ? ['Gestion durable 30 ans', 'Pas de plafond'] : ['Bail rural ≥ 18 ans', 'Plafond ' + fmt(FONCIER_RURAL_PLAFOND) + '/bén.', 'Conservation 5 ans min.'] };
    }

    // ============================================================
    // 5. DON FAMILIAL 31 865€ (art. 790 G CGI)
    // ============================================================

    /**
     * Calcule l'abattement supplémentaire du don familial de sommes d'argent.
     * CUMULABLE avec l'abattement classique (100k enfant, 31 865 PE, etc.)
     * Conditions : donateur < 80 ans, donataire ≥ 18 ans, don d'argent.
     * Renouvelable tous les 15 ans.
     *
     * @param {Object} params
     * @param {number} params.ageDonateur - Âge du donateur
     * @param {number} params.ageDonataire - Âge du donataire
     * @param {string} params.lien - 'enfant', 'petit_enfant', 'arriere_petit_enfant', 'neveu_niece'
     * @param {number} params.nbDonors - Nombre de donateurs (1 ou 2 si couple)
     * @param {number} params.nbBeneficiaires - Nombre de bénéficiaires éligibles
     * @param {boolean} params.dejaUtilise - Don familial déjà utilisé dans les 15 dernières années
     * @returns {Object} { eligible, montantParBenParDonateur, totalExonere, economieEstimee, conditions }
     */
    function computeDonFamilial(params) {
        var p = params || {};
        var ageDonateur = p.ageDonateur || 50;
        var ageDonataire = p.ageDonataire || 30;
        var lien = p.lien || 'enfant';
        var nbDonors = p.nbDonors || 1;
        var nbBen = Math.max(1, p.nbBeneficiaires || 1);
        var dejaUtilise = !!p.dejaUtilise;

        // Liens éligibles au don familial
        var liensEligibles = ['enfant', 'petit_enfant', 'arriere_petit_enfant', 'neveu_niece'];
        var lienEligible = liensEligibles.indexOf(lien) >= 0;

        // Vérifications
        var donateurEligible = ageDonateur < DON_FAMILIAL_AGE_DONATEUR_MAX;
        var donataireEligible = ageDonataire >= DON_FAMILIAL_AGE_DONATAIRE_MIN;
        var eligible = lienEligible && donateurEligible && donataireEligible && !dejaUtilise;

        if (!eligible) {
            var raisons = [];
            if (!lienEligible) raisons.push('lien ' + lien + ' non éligible (doit être enfant/PE/APE/neveu)');
            if (!donateurEligible) raisons.push('donateur ≥ 80 ans (' + ageDonateur + 'a)');
            if (!donataireEligible) raisons.push('donataire < 18 ans (' + ageDonataire + 'a)');
            if (dejaUtilise) raisons.push('déjà utilisé (rappel fiscal 15 ans)');
            return {
                eligible: false, montantParBenParDonateur: 0, totalExonere: 0, economieEstimee: 0,
                raisons: raisons,
                explanation: 'Don familial 790 G non applicable : ' + raisons.join(', ') + '.'
            };
        }

        var montantParBenParDonateur = DON_FAMILIAL_MONTANT;
        var totalExonere = montantParBenParDonateur * nbDonors * nbBen;

        // Estimation économie : taux moyen ~20% sur les montants qui auraient été taxés
        var economieEstimee = Math.round(totalExonere * 0.20);

        return {
            eligible: true,
            montantParBenParDonateur: montantParBenParDonateur,
            totalExonere: totalExonere,
            economieEstimee: economieEstimee,
            nbDonors: nbDonors,
            nbBeneficiaires: nbBen,
            conditions: [
                'Donateur < 80 ans (actuellement ' + ageDonateur + 'a ✅)',
                'Donataire ≥ 18 ans (actuellement ' + ageDonataire + 'a ✅)',
                'Don de sommes d\'argent uniquement (espèces, chèque, virement)',
                'Cumulable avec abattement classique (100k enfant, 80 724€ conjoint...)',
                'Renouvelable tous les 15 ans',
                'Déclaration en ligne obligatoire sur impots.gouv.fr (depuis 01/2026)'
            ],
            cumulExemple: {
                abattementClassique: lien === 'enfant' ? 100000 : lien === 'petit_enfant' ? 31865 : lien === 'neveu_niece' ? 7967 : 5310,
                donFamilial: montantParBenParDonateur,
                totalParBenParDonateur: (lien === 'enfant' ? 100000 : lien === 'petit_enfant' ? 31865 : lien === 'neveu_niece' ? 7967 : 5310) + montantParBenParDonateur,
                totalParBenCouple: ((lien === 'enfant' ? 100000 : lien === 'petit_enfant' ? 31865 : lien === 'neveu_niece' ? 7967 : 5310) + montantParBenParDonateur) * Math.min(2, nbDonors)
            },
            explanation: 'Don familial (art. 790 G CGI) : ' + fmt(montantParBenParDonateur) + ' supplémentaires exonérés par bénéficiaire et par donateur. ' +
                'Total pour ' + nbBen + ' bénéficiaire(s) × ' + nbDonors + ' donateur(s) = ' + fmt(totalExonere) + ' hors impôts.',
            article: 'Art. 790 G CGI — Don familial de sommes d\'argent'
        };
    }

    /**
     * Calcule les droits AVEC et SANS don familial pour comparaison.
     */
    function computeDonFamilialImpact(montantDonation, lien, ageDonateur, ageDonataire, nbDonors) {
        var F = SD._fiscal;
        var donFam = computeDonFamilial({
            ageDonateur: ageDonateur || 55, ageDonataire: ageDonataire || 30,
            lien: lien || 'enfant', nbDonors: nbDonors || 1, nbBeneficiaires: 1
        });
        if (!donFam.eligible) return { eligible: false, economie: 0, donFamilial: donFam };

        var abatClassique = F.getAbattement(lien || 'enfant', false) * (nbDonors || 1);

        // SANS don familial
        var baseSans = Math.max(0, montantDonation - abatClassique);
        var droitsSans = F.calcDroits(baseSans, F.getBareme(lien || 'enfant'));

        // AVEC don familial
        var abatAvec = abatClassique + DON_FAMILIAL_MONTANT * (nbDonors || 1);
        var baseAvec = Math.max(0, montantDonation - abatAvec);
        var droitsAvec = F.calcDroits(baseAvec, F.getBareme(lien || 'enfant'));

        return {
            eligible: true,
            droitsSansDonFamilial: droitsSans,
            droitsAvecDonFamilial: droitsAvec,
            economie: droitsSans - droitsAvec,
            abatClassique: abatClassique,
            abatTotal: abatAvec,
            donFamilial: donFam
        };
    }

    // ============================================================
    // 6. CALCUL GLOBAL OPTIMISÉ
    // ============================================================

    function computeOptimizedScenario() {
        var state = getState(); if (!state) return null;
        var F = SD._fiscal, FISCAL = F.getFISCAL(), pat = F.computePatrimoine();
        var totalBrut = pat.actifNet;
        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
        var nbDonors = state.mode === 'couple' ? 2 : 1;
        if (totalBrut <= 0 || bens.length === 0) return null;

        var droitsBrut = calcDroitsForBens(totalBrut, bens, nbDonors, true, false);
        var optimisations = [];
        var assietteOptimisee = totalBrut;

        // 1. SCI décote 15%
        var sciResult = computeSCIImpact();
        if (sciResult && sciResult.totalDecote > 0) {
            assietteOptimisee -= sciResult.totalDecote;
            optimisations.push({
                id: 'sci_decote', label: 'SCI — Décote 15% illiquidité', icon: 'fa-building', color: 'var(--accent-blue)',
                reduction: sciResult.totalDecote, biensCount: sciResult.biensEligibles,
                detail: sciResult.details.map(function(d) { return d.nom + ' : ' + fmt(d.valeur) + ' → ' + fmt(d.valeurFiscale); }).join(' · '),
                conseil: 'Loger les biens immobiliers en SCI pour bénéficier de la décote 15%. Coût : ~' + fmt(SCI_FRAIS_NOTAIRE) + '/SCI.',
                article: 'Jurisprudence constante — illiquidité des parts sociales'
            });
        }

        // 2. Suggestion SCI pour biens en direct
        var biensDirectSCI = (state.immos || []).filter(function(b) { return (b.detention === 'direct' || !b.detention) && (b.valeur || 0) > 50000; });
        if (biensDirectSCI.length > 0 && (!sciResult || sciResult.biensEligibles === 0)) {
            var potentielDecote = 0;
            biensDirectSCI.forEach(function(b) { potentielDecote += Math.round((b.valeur || 0) * SCI_DECOTE); });
            if (potentielDecote > 5000) {
                optimisations.push({
                    id: 'sci_suggestion', label: 'SCI — Potentiel si mise en société', icon: 'fa-lightbulb', color: 'var(--accent-amber)',
                    reduction: 0, potentiel: potentielDecote,
                    detail: biensDirectSCI.length + ' bien(s) en détention directe éligible(s)',
                    conseil: 'En logeant ces biens en SCI, décote potentielle de ' + fmt(potentielDecote) + '. Coût création ~' + fmt(SCI_FRAIS_NOTAIRE) + '.',
                    article: 'Art. 1845+ Code civil'
                });
            }
        }

        // 3. Foncier rural
        var foncierTotal = { exo: 0, count: 0, items: [] };
        (state.financials || []).forEach(function(f) {
            var types = ['gfv', 'gfa', 'gfi', 'foret', 'vigne', 'terre_agricole'];
            if (types.indexOf(f.type) >= 0) {
                var r = computeFoncierRural(f.montant || 0, f.type, nbEnfants || 1);
                if (r.applicable) { foncierTotal.exo += r.exoneration; foncierTotal.count++; foncierTotal.items.push(r); }
            }
        });
        if (foncierTotal.exo > 0) {
            assietteOptimisee -= foncierTotal.exo;
            optimisations.push({
                id: 'foncier_rural', label: 'Foncier rural — Exonération 75%', icon: 'fa-tree', color: 'var(--accent-green)',
                reduction: foncierTotal.exo, biensCount: foncierTotal.count,
                detail: foncierTotal.items.map(function(i) { return i.type + ' : exo ' + fmt(i.exoneration); }).join(' · '),
                conseil: 'Seuls 25% de la valeur sont taxés. Rendement 1,5-2%/an. Ticket dès ' + fmt(FONCIER_RURAL_TICKET_ENTREE) + '.',
                article: 'Art. 793 CGI (GFV/GFA/GFI)'
            });
        }

        // 4. Suggestion foncier
        if (foncierTotal.count === 0 && totalBrut > 300000 && nbEnfants > 0) {
            var suggestionMontant = Math.min(100000, Math.round(totalBrut * 0.10));
            var suggFoncier = computeFoncierRural(suggestionMontant, 'gfv', nbEnfants);
            optimisations.push({
                id: 'foncier_suggestion', label: 'Foncier rural — Piste de diversification', icon: 'fa-seedling', color: 'var(--accent-emerald)',
                reduction: 0, potentiel: suggFoncier.exoneration,
                detail: 'Ex : ' + fmt(suggestionMontant) + ' en GFV → exo 75% = ' + fmt(suggFoncier.exoneration) + ' hors assiette',
                conseil: 'Investir 5-10% du patrimoine en GFV/GFA/GFI. Exonération 75%, rendement 1,5-2%/an.',
                article: 'Art. 793 CGI'
            });
        }

        // 5. AV exagérées
        var avCheck = detectAVExagerees();
        if (avCheck && avCheck.isExagere) {
            var droitsReintegration = calcDroitsReintegrationAV(avCheck.depassement, bens, nbDonors);
            optimisations.push({
                id: 'av_exagerees', label: 'AV exagérées — Risque réintégration', icon: 'fa-exclamation-triangle', color: 'var(--accent-coral)',
                reduction: 0, risque: droitsReintegration,
                detail: 'AV = ' + Math.round(avCheck.ratio * 100) + '% patrimoine (seuil 35%). Dépassement ' + fmt(avCheck.depassement),
                conseil: 'Réduire l\'AV à ' + fmt(avCheck.seuilMax) + ' max. Réallouer vers donation NP, SCI, ou GFV.',
                article: 'L132-13 Code assurances — Cass. 2ème civ.'
            });
        }

        // 6. Démembrement croisé concubins
        if (state._unionType === 'concubinage') {
            var totalImmo = 0; var ageD = 50;
            (state.immos || []).forEach(function(b) { totalImmo += (b.valeur || 0); });
            var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
            if (donors.length > 0 && donors[0].age) ageD = donors[0].age;
            if (totalImmo > 0) {
                var dcResult = computeDemembrementCroiseSCI(totalImmo, ageD, ageD, nbEnfants, 0);
                optimisations.push({
                    id: 'croise_concubins', label: 'SCI croisée — Protection concubin', icon: 'fa-key', color: 'var(--accent-purple)',
                    reduction: 0, economie: dcResult.economie,
                    detail: 'Sans montage : ' + fmt(dcResult.scenarioDirect.droits) + ' (60%). Avec SCI croisée : ' + fmt(dcResult.scenarioCroise.droitsEnfants) + ' (ligne directe)',
                    conseil: 'Survivant reste dans le logement SANS droits. Enfants héritent en NP au barème 5-45%. Économie : ' + fmt(dcResult.economie) + '.',
                    article: 'Art. 1845+ CC — SCI démembrée'
                });
            }
        }

        // 7. DON FAMILIAL 31 865€ (art. 790 G CGI)
        var donFamilialEligible = false;
        var donFamilialTotal = 0;
        var donFamilialDetails = [];
        var ageDonateur = 55; // âge par défaut
        var donorsList = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donorsList.length > 0 && donorsList[0].age) ageDonateur = donorsList[0].age;

        if (ageDonateur < DON_FAMILIAL_AGE_DONATEUR_MAX) {
            bens.forEach(function(b) {
                var liensOK = ['enfant', 'petit_enfant', 'arriere_petit_enfant', 'neveu_niece'];
                if (liensOK.indexOf(b.lien) >= 0) {
                    var ageBen = b.age || 30;
                    if (ageBen >= DON_FAMILIAL_AGE_DONATAIRE_MIN) {
                        donFamilialEligible = true;
                        var montantBen = DON_FAMILIAL_MONTANT * nbDonors;
                        donFamilialTotal += montantBen;
                        donFamilialDetails.push({ nom: b.nom || b.lien, lien: b.lien, montant: montantBen });
                    }
                }
            });
        }

        if (donFamilialEligible && donFamilialTotal > 0) {
            // Calcul de l'économie réelle : droits SANS vs AVEC don familial
            var droitsSansDonFam = calcDroitsForBens(assietteOptimisee, bens, nbDonors, true, false);
            var droitsAvecDonFam = calcDroitsForBens(assietteOptimisee, bens, nbDonors, true, true);
            var economieDonFam = droitsSansDonFam - droitsAvecDonFam;

            var abatClassique = bens[0] && bens[0].lien === 'enfant' ? 100000 : 31865;
            var cumulTotal = (abatClassique + DON_FAMILIAL_MONTANT) * nbDonors;

            optimisations.push({
                id: 'don_familial', label: 'Don familial — 31 865€ supplémentaires', icon: 'fa-gift', color: 'var(--accent-cyan)',
                reduction: 0, economie: economieDonFam,
                detail: donFamilialDetails.map(function(d) {
                    return d.nom + ' (' + d.lien + ') : +' + fmt(d.montant) + ' exonéré';
                }).join(' · ') + ' — Total : ' + fmt(donFamilialTotal) + ' d\'abattement supplémentaire',
                conseil: 'Don de sommes d\'argent : ' + fmt(DON_FAMILIAL_MONTANT) + '/bénéficiaire/donateur, ' +
                    'CUMULABLE avec abattement classique (' + fmt(abatClassique) + '). ' +
                    'Cumul par enfant' + (nbDonors > 1 ? ' (2 parents)' : '') + ' : ' + fmt(cumulTotal) + ' sans droits. ' +
                    'Conditions : donateur < 80 ans, donataire ≥ 18 ans. Déclaration en ligne impots.gouv.fr (obligatoire depuis 01/2026).',
                article: 'Art. 790 G CGI — Renouvelable tous les 15 ans'
            });
        }

        // --- Calcul droits OPTIMISÉ (avec don familial inclus) ---
        var assietteCorrigee = Math.max(0, assietteOptimisee);
        var droitsOptimises = calcDroitsForBens(assietteCorrigee, bens, nbDonors, true, donFamilialEligible);
        var economieDroits = droitsBrut - droitsOptimises;

        var economieConcubin = 0;
        optimisations.forEach(function(o) { if (o.id === 'croise_concubins' && o.economie) economieConcubin = o.economie; });

        return {
            brut: { assiette: totalBrut, droits: droitsBrut },
            optimise: { assiette: assietteCorrigee, droits: droitsOptimises },
            economieDroits: economieDroits,
            economieTotale: economieDroits + economieConcubin,
            optimisations: optimisations,
            nbEnfants: nbEnfants,
            nbDonors: nbDonors,
            donFamilialInclus: donFamilialEligible
        };
    }

    /**
     * Calcul des droits avec option don familial.
     * @param {boolean} avecDonFamilial - Si true, ajoute 31 865€ d'abattement par bén. éligible
     */
    function calcDroitsForBens(montant, bens, nbDonors, isSuccession, avecDonFamilial) {
        var F = SD._fiscal, FISCAL = F.getFISCAL();
        if (montant <= 0 || bens.length === 0) return 0;
        var total = 0;
        var liensEligiblesDonFam = ['enfant', 'petit_enfant', 'arriere_petit_enfant', 'neveu_niece'];
        bens.forEach(function(b) {
            var part = montant / bens.length;
            var abat = F.getAbattement(b.lien, isSuccession) * nbDonors - (b.donationAnterieure || 0);
            var handicapAbat = b.handicap ? FISCAL.abattements.handicap : 0;
            // Ajouter don familial si éligible
            var donFamAbat = 0;
            if (avecDonFamilial && liensEligiblesDonFam.indexOf(b.lien) >= 0) {
                donFamAbat = DON_FAMILIAL_MONTANT * nbDonors;
            }
            total += F.calcDroits(Math.max(0, part - abat - handicapAbat - donFamAbat), F.getBareme(b.lien));
        });
        return total;
    }

    function calcDroitsReintegrationAV(depassement, bens, nbDonors) {
        var bensEnfants = bens.filter(function(b) { return b.lien === 'enfant'; });
        if (bensEnfants.length === 0) return 0;
        return calcDroitsForBens(depassement, bensEnfants, nbDonors, true, false);
    }

    // ============================================================
    // 7. RENDU — Panneau step 5
    // ============================================================

    function renderOptimizationsPanel() {
        var result = computeOptimizedScenario();
        if (!result || result.optimisations.length === 0) return;

        var existing = document.getElementById('fiscal-optimizations-panel');
        if (existing) existing.remove();

        var html = '<div class="section-card" id="fiscal-optimizations-panel" style="border-color:rgba(16,185,129,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-chess" style="background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(5,150,105,.1));color:var(--accent-green);"></i> Solutions d\'optimisation fiscale</div>';
        html += '<div class="section-subtitle">Leviers concrets pour réduire les droits de succession — impact chiffré sur votre patrimoine</div>';

        if (result.economieTotale > 0) {
            html += '<div style="padding:20px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);margin-bottom:20px;text-align:center;">';
            html += '<div style="font-size:.78rem;color:var(--text-muted);">ÉCONOMIE TOTALE ESTIMÉE</div>';
            html += '<div style="font-size:1.8rem;font-weight:900;color:var(--accent-green);">' + fmt(result.economieTotale) + '</div>';
            html += '<div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px;">Droits bruts ' + fmt(result.brut.droits) + ' → optimisés ' + fmt(result.optimise.droits) + '</div>';
            if (result.donFamilialInclus) html += '<div style="font-size:.68rem;color:var(--accent-cyan);margin-top:4px;">✅ Don familial 31 865€ inclus (art. 790 G CGI)</div>';
            html += '</div>';
        }

        // Tableau
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);margin-bottom:20px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem;"><thead><tr style="background:rgba(198,134,66,.06);">';
        html += '<th style="padding:12px 16px;text-align:left;font-weight:600;color:var(--text-muted);">Critère</th>';
        html += '<th style="padding:12px 16px;text-align:right;font-weight:600;color:var(--text-muted);">Actuel</th>';
        html += '<th style="padding:12px 16px;text-align:right;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.04);">Optimisé</th>';
        html += '</tr></thead><tbody>';
        html += '<tr><td style="padding:10px 16px;border-bottom:1px solid rgba(198,134,66,.05);">Assiette taxable</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(result.brut.assiette) + '</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);background:rgba(16,185,129,.02);font-weight:700;">' + fmt(result.optimise.assiette) + '</td></tr>';
        html += '<tr style="font-weight:700;border-top:2px solid rgba(198,134,66,.15);"><td style="padding:14px 16px;">Droits de succession</td>';
        html += '<td style="padding:14px 16px;text-align:right;">' + fmt(result.brut.droits) + '</td>';
        html += '<td style="padding:14px 16px;text-align:right;background:rgba(16,185,129,.04);color:var(--accent-green);">' + fmt(result.optimise.droits);
        if (result.economieDroits > 0) html += ' <span style="font-size:.7rem;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,.12);">−' + fmt(result.economieDroits) + '</span>';
        html += '</td></tr></tbody></table></div>';

        // Détail optimisations
        result.optimisations.forEach(function(opt) {
            var isRisque = opt.id === 'av_exagerees';
            var isSuggestion = opt.id.indexOf('suggestion') >= 0;
            var isDonFam = opt.id === 'don_familial';
            var borderColor = isRisque ? 'rgba(255,107,107,.2)' : isSuggestion ? 'rgba(255,179,0,.15)' : isDonFam ? 'rgba(198,134,66,.2)' : 'rgba(16,185,129,.15)';
            var bgColor = isRisque ? 'rgba(255,107,107,.03)' : isSuggestion ? 'rgba(255,179,0,.03)' : isDonFam ? 'rgba(198,134,66,.04)' : 'rgba(16,185,129,.03)';

            html += '<div style="padding:16px 18px;border-radius:12px;background:' + bgColor + ';border:1px solid ' + borderColor + ';margin-bottom:12px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:10px;"><i class="fas ' + opt.icon + '" style="color:' + opt.color + ';font-size:.9rem;"></i>';
            html += '<strong style="font-size:.85rem;">' + opt.label + '</strong></div>';

            if (opt.reduction > 0) html += '<span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.1);">−' + fmt(opt.reduction) + ' d\'assiette</span>';
            else if (opt.economie > 0) html += '<span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;color:var(--accent-green);background:rgba(16,185,129,.1);">−' + fmt(opt.economie) + ' de droits</span>';
            else if (opt.potentiel > 0) html += '<span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:600;color:var(--accent-amber);background:rgba(255,179,0,.1);">Potentiel : −' + fmt(opt.potentiel) + '</span>';
            else if (opt.risque > 0) html += '<span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;color:var(--accent-coral);background:rgba(255,107,107,.1);">Risque : +' + fmt(opt.risque) + '</span>';
            html += '</div>';

            if (opt.detail) html += '<div style="font-size:.78rem;color:var(--text-secondary);line-height:1.6;margin-bottom:6px;">' + opt.detail + '</div>';
            html += '<div style="font-size:.78rem;color:var(--text-primary);line-height:1.6;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.04);border-left:3px solid ' + opt.color + ';"><strong>Action :</strong> ' + opt.conseil + '</div>';
            if (opt.article) html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + opt.article + '</div>';
            html += '</div>';
        });

        html += '</div>';

        var anchor = document.getElementById('civil-rights-corrected') || document.getElementById('union-comparison-table') || document.getElementById('results-warnings') || document.getElementById('transmission-map');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    function renderOptimizationWarnings() {}

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
            setTimeout(renderOptimizationsPanel, 350);
        };
        console.log('[FiscalOptimizations v2.1] Patched — don familial 31 865€ intégré');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 400); });
    else setTimeout(init, 400);

    return {
        applySCIDecote: applySCIDecote, computeSCIImpact: computeSCIImpact,
        checkPrimesExagerees: checkPrimesExagerees, detectAVExagerees: detectAVExagerees,
        computeDemembrementCroiseSCI: computeDemembrementCroiseSCI,
        computeFoncierRural: computeFoncierRural,
        computeDonFamilial: computeDonFamilial,
        computeDonFamilialImpact: computeDonFamilialImpact,
        computeOptimizedScenario: computeOptimizedScenario,
        SCI_DECOTE: SCI_DECOTE, AV_SEUIL_EXAGERE: AV_SEUIL_EXAGERE,
        FONCIER_RURAL_EXONERATION: FONCIER_RURAL_EXONERATION, FONCIER_RURAL_PLAFOND: FONCIER_RURAL_PLAFOND,
        DON_FAMILIAL_MONTANT: DON_FAMILIAL_MONTANT,
        DON_FAMILIAL_AGE_DONATEUR_MAX: DON_FAMILIAL_AGE_DONATEUR_MAX,
        DON_FAMILIAL_AGE_DONATAIRE_MIN: DON_FAMILIAL_AGE_DONATAIRE_MIN
    };
})();
