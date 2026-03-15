/**
 * strategy-recommendations.js v1.2 — + Donation graduelle, Donation-partage conjonctive, Pacte famille
 *
 * 1. Changement d'union + régime matrimonial
 * 2. Renonciation succession (art. 805+ CC)
 * 3. Réversion d'usufruit (PACS)
 * 4. Contrat capitalisation vs AV
 * 5. NEW: Donation graduelle (bien → conjoint → enfants au 2nd décès)
 * 6. NEW: Donation-partage conjonctive (beaux-enfants au barème LD !)
 * 7. NEW: Pacte de famille (renonciation anticipée réserve)
 *
 * @version 1.2.0 — 2026-03-15
 */
const StrategyRecommendations = (function() {
    'use strict';

    // ============================================================
    // 1. SIMULATEUR CHANGEMENT D'UNION
    // ============================================================

    function simulerChangementUnion(params) {
        var p = params || {};
        var patrimoine = p.patrimoine || 500000;
        var montantConj = p.montantConjoint || Math.round(patrimoine * 0.25);
        var autresLit = !!p.hasEnfantsAutreLit;
        var montantAV = p.montantAV || 0;
        var F = SD._fiscal;
        var scenarios = {};

        var droitsConc = F.calcDroits(Math.max(0, montantConj - 1594), F.getBareme('tiers'));
        var droitsAVConc = montantAV > 152500 ? Math.round((montantAV - 152500) * 0.20) : 0;
        scenarios.concubinage = {
            label: 'Concubinage', droitsConjoint: droitsConc, droitsAV: droitsAVConc,
            droitsTotal: droitsConc + droitsAVConc, exonereConjoint: false,
            droitLogement: 'Aucun', heritageAuto: false, ddvPossible: false,
            protections: ['AV (152.5k exo)', 'SCI croisée', 'Testament (QD)'],
            risques: ['60% de droits sur tout hors AV', 'Pas de droit au logement', 'Pas d\'héritage automatique'],
            couleur: 'var(--accent-coral)'
        };
        scenarios.pacs = {
            label: 'PACS', droitsConjoint: 0, droitsAV: 0, droitsTotal: 0,
            exonereConjoint: true, droitLogement: '1 an (art. 515-6 CC)',
            heritageAuto: false, ddvPossible: false, testamentRequis: true,
            protections: ['Exonéré de droits', 'Droit logement 1 an', 'AV exonérée'],
            risques: ['RIEN sans testament !', 'Pas de DDV', 'Pas de droit viager au logement'],
            actions: ['Rédiger un testament (obligatoire !)', 'Clause AV bénéficiaire "mon partenaire"'],
            couleur: 'var(--accent-amber)'
        };
        scenarios.mariage = {
            label: 'Mariage', droitsConjoint: 0, droitsAV: 0, droitsTotal: 0,
            exonereConjoint: true, droitLogement: 'Viager (art. 764 CC) + 1 an gratuit',
            heritageAuto: true, ddvPossible: !autresLit,
            optionDDV: !autresLit ? '100% usufruit ou QD en PP' : '25% PP (enfants autre lit)',
            protections: ['Exonéré de droits', 'Héritage automatique', 'Droit viager logement', 'DDV (usufruit 100%)', 'AV exonérée'],
            risques: autresLit ? ['Action en retranchement enfants 1er lit'] : [],
            actions: ['DDV chez notaire (~140€)', 'Clause AV bénéficiaire "mon conjoint"'],
            couleur: 'var(--accent-green)'
        };
        return {
            scenarios: scenarios,
            economies: {
                concubinage_vers_pacs: scenarios.concubinage.droitsTotal,
                concubinage_vers_mariage: scenarios.concubinage.droitsTotal,
                pacs_vers_mariage: 0
            },
            meilleur: 'mariage',
            recommendation: scenarios.concubinage.droitsTotal > 0
                ? 'Passage concubinage → PACS : économie ' + fmt(scenarios.concubinage.droitsTotal) + '. Mariage : + DDV + droit viager.'
                : 'Le mariage offre la meilleure protection.'
        };
    }

    // ============================================================
    // 2. SIMULATEUR CHANGEMENT DE RÉGIME MATRIMONIAL
    // ============================================================

    function simulerChangementRegime(params) {
        var p = params || {};
        var patrimoine = p.patrimoine || 500000;
        var biensCommuns = p.biensCommuns || Math.round(patrimoine * 0.60);
        var biensPropres = patrimoine - biensCommuns;
        var nbEnfants = p.nbEnfants || 2;
        var autresLit = !!p.hasEnfantsAutreLit;
        var F = SD._fiscal;
        var regimes = {};

        var masseAcquets = Math.round(biensCommuns / 2) + biensPropres;
        regimes.acquets = { label: 'Communauté réduite aux acquêts (défaut)', masseSuccession: masseAcquets,
            droitsEnfants: F.calcDroits(Math.max(0, masseAcquets / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants,
            article: 'Art. 1400-1491 CC', avantages: ['Régime par défaut', 'Biens propres protégés'], inconvenients: ['Conjoint ne récupère que 50% communs'] };

        var masseUniv = Math.round(patrimoine / 2);
        regimes.universelle = { label: 'Communauté universelle', masseSuccession: masseUniv,
            droitsEnfants: F.calcDroits(Math.max(0, masseUniv / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants,
            article: 'Art. 1526 CC', avantages: ['Tout est commun'], inconvenients: ['Biens propres perdent caractère propre'] };

        var droits2nd = F.calcDroits(Math.max(0, patrimoine / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.attribution_integrale = { label: 'Communauté universelle + clause attribution intégrale',
            masseSuccession: 0, droitsEnfants: 0, article: 'Art. 1526 CC + clause',
            droitsAu1erDeces: 0, droitsAu2ndDeces: droits2nd, perte1Abattement: 100000 * nbEnfants,
            avantages: ['0€ droits au 1er décès', 'Conjoint reçoit TOUT'],
            inconvenients: ['Perte 1 abattement ('+fmt(100000*nbEnfants)+')', 'Droits élevés 2nd décès : '+fmt(droits2nd)],
            warnings: autresLit ? ['\ud83d\udea8 Enfants 1er lit : ACTION EN RETRANCHEMENT possible !'] : [],
            recommandePour: 'Couples SANS enfant ou enfants communs uniquement' };

        var masseSep = biensPropres;
        regimes.separation = { label: 'Séparation de biens', masseSuccession: masseSep,
            droitsEnfants: F.calcDroits(Math.max(0, masseSep / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants,
            article: 'Art. 1536-1543 CC', avantages: ['Patrimoines séparés', 'Favorise enfants 1er lit'], inconvenients: ['Conjoint peu fortuné non protégé'] };

        return { regimes: regimes, actuel: 'acquets', meilleurFiscal: 'attribution_integrale',
            meilleurProtection: autresLit ? 'acquets' : 'attribution_integrale',
            coutChangement: '~1 500 – 3 000€ notaire + homologation', delai: '2 ans minimum après mariage' };
    }

    // ============================================================
    // 3. RENONCIATION SUCCESSION (art. 805+ CC)
    // ============================================================

    function computeRenonciation(params) {
        var p = params || {};
        var montant = p.montantSuccession || 500000;
        var nbHer = Math.max(1, p.nbHeritiers || 2);
        var lien = p.lienRenoncant || 'enfant';
        var nbDesc = p.nbDescendantsRenoncant || 0;
        var nbDonors = p.nbDonors || 1;
        var F = SD._fiscal;

        var partSans = montant / nbHer;
        var abatSans = F.getAbattement(lien, true) * nbDonors;
        var droitsSansParHer = F.calcDroits(Math.max(0, partSans - abatSans), F.getBareme(lien));
        var droitsSansTotal = droitsSansParHer * nbHer;
        var droitsAvecTotal = 0, nbRestants = nbHer - 1, explication = '';

        if (nbDesc > 0) {
            var partParDesc = partSans / nbDesc;
            var abatDesc = 100000 * nbDonors;
            var droitsDesc = F.calcDroits(Math.max(0, partParDesc - abatDesc), F.getBareme('enfant')) * nbDesc;
            droitsAvecTotal = droitsDesc + droitsSansParHer * nbRestants;
            explication = 'Renonciation + représentation : ' + nbDesc + ' PE héritent avec abat. 100k. Part ' + fmt(partSans) + ' → ' + nbDesc + ' PE = ' + fmt(partParDesc) + '/PE.';
        } else {
            var partAccrue = montant / nbRestants;
            droitsAvecTotal = F.calcDroits(Math.max(0, partAccrue - abatSans), F.getBareme(lien)) * nbRestants;
            explication = 'Renonciation sans descendants : part accroît aux ' + nbRestants + ' autres. Chacun reçoit ' + fmt(partAccrue) + '.';
        }
        var economie = droitsSansTotal - droitsAvecTotal;
        return {
            sansRenonciation: { droitsTotal: droitsSansTotal, partParHeritier: partSans, nbHeritiers: nbHer },
            avecRenonciation: { droitsTotal: droitsAvecTotal, nbHeritiers: nbDesc > 0 ? nbRestants + nbDesc : nbRestants },
            economie: economie, avantageux: economie > 0, nbDescendantsRenoncant: nbDesc,
            explanation: explication,
            conseil: economie > 0 ? 'Économie de ' + fmt(economie) + '.' : 'Renonciation PAS avantageuse ici.',
            article: 'Art. 805-808 CC + art. 751-755 CC (représentation)',
            warnings: ['La renonciation est irrévocable', nbDesc === 0 && nbRestants <= 0 ? '\u26a0\ufe0f Succession vacante (État)' : null, 'Délai : 4 mois min, 10 ans max'].filter(Boolean)
        };
    }

    // ============================================================
    // 4. RÉVERSION D'USUFRUIT (PACS)
    // ============================================================

    function computeReversionUsufruit(params) {
        var p = params || {};
        var valeur = p.valeurBien || 300000;
        var ageDon = p.ageDonateur || 55;
        var nbEnf = Math.max(1, p.nbEnfants || 2);
        var unionType = p.unionType || 'pacs';
        var nbDonors = p.nbDonors || 1;
        var F = SD._fiscal;

        var npRatio = F.getNPRatio(ageDon);
        var valeurNP = Math.round(valeur * npRatio);
        var valeurUS = valeur - valeurNP;
        var abatEnfant = 100000 * nbDonors;
        var droitsDonationNP = F.calcDroits(Math.max(0, valeurNP / nbEnf - abatEnfant), F.getBareme('enfant')) * nbEnf;
        var droitsSuccessionDirecte = unionType === 'concubinage' ? F.calcDroits(Math.max(0, valeur - 1594), F.getBareme('tiers')) : 0;

        return {
            applicable: true, valeurBien: valeur, valeurNP: valeurNP, valeurUS: valeurUS, npRatio: npRatio,
            droitsDonationNP: droitsDonationNP, droitsReversion: 0, droitsTotal: droitsDonationNP,
            protectionPartenaire: 'Usufruit viager — reste dans le logement à vie',
            protectionEnfants: 'NP — récupèrent PP au décès du pacsé sans droits',
            economieVsConcubin: unionType === 'concubinage' ? droitsSuccessionDirecte - droitsDonationNP : 0,
            irrevocable: true,
            explanation: 'Donation NP (' + fmt(valeurNP) + ') aux enfants + réserve US + clause réversion. Droits NP : ' + fmt(droitsDonationNP) + '. Réversion : 0€.',
            avantages: ['Partenaire protégé à vie', 'Pas de droits sur la réversion', unionType === 'pacs' ? 'Compense absence droit viager' : 'Évite 60% concubin', 'PP gratuite au 2nd décès', 'Pas de droits au 2nd décès'],
            inconvenients: ['IRRÉVOCABLE même si rupture PACS', 'Ne protège que le logement', 'Enfants ne peuvent pas vendre'],
            conseil: unionType === 'pacs' ? 'IDÉAL pour pacsés : logé à vie, 0€ réversion.' : 'Concubins : éco ' + fmt(droitsSuccessionDirecte - droitsDonationNP) + ' vs 60%. IRRÉVOCABLE.',
            article: 'Art. 949 + 1094-1 CC'
        };
    }

    // ============================================================
    // 5. CONTRAT DE CAPITALISATION vs AV
    // ============================================================

    function comparerAVCapitalisation(params) {
        var p = params || {};
        var montant = p.montant || 200000;
        var lien = p.lienBeneficiaire || 'conjoint_pacs';
        var duree = p.dureeContrat || 10;
        var F = SD._fiscal;
        var exoConj = lien === 'conjoint_pacs';

        var av = { label: 'Assurance vie', transmission: 'Hors succession (990 I / 757 B)', auDeces: 'Contrat FERMÉ',
            droits: exoConj ? 0 : (montant > 152500 ? Math.round((montant - 152500) * 0.20) : 0),
            avantages: ['Hors succession', 'Abat 152.5k/bén (avant 70a)', 'Choix libre bén.', exoConj ? 'Conjoint exonéré' : 'Concubin: 152.5k exo puis 20%'],
            inconvenients: ['Fermé au décès', 'Primes exagérées = risque', 'PS 17.2%'] };

        var abat = exoConj ? 0 : F.getAbattement(lien, true);
        var droitsCapi = exoConj ? 0 : F.calcDroits(Math.max(0, montant - abat), F.getBareme(lien));
        var capi = { label: 'Contrat de capitalisation', transmission: 'Intégré succession (DMTG)', auDeces: 'Continue EN L\'ÉTAT',
            droits: droitsCapi,
            avantages: ['Transmis EN L\'ÉTAT', 'Antériorité conservée', exoConj ? 'Exonéré = identique AV' : 'Pas de risque exagéré', 'Donation NP possible', duree >= 8 ? 'Gains allégés (>8a)' : ''],
            inconvenients: [exoConj ? 'Aucun (exonéré)' : 'DMTG classiques (pas 152.5k)', 'Entre dans la réserve'].filter(Boolean) };

        var recommandation = exoConj
            ? 'Pacsé/conjoint : capitalisation = AV (0€ les 2). BONUS : continue de fructifier + donation NP possible.'
            : lien === 'tiers'
                ? 'Concubin : AV NETTEMENT meilleure. Éco : ' + fmt(droitsCapi - av.droits) + '.'
                : 'Enfant : AV souvent meilleure (152.5k). Capitalisation utile si donation NP vivant.';

        return { assuranceVie: av, contratCapitalisation: capi, meilleurPourConjointPacse: 'equivalent',
            meilleurPourConcubin: 'assurance_vie', meilleurPourEnfant: 'assurance_vie',
            recommandation: recommandation, economieAV: droitsCapi - av.droits };
    }

    // ============================================================
    // 6. DONATION GRADUELLE (art. 1048+ CC)
    // ============================================================

    /**
     * Donation graduelle : bien → conjoint → revient aux enfants au 2nd décès.
     * Le bien reste dans la famille d'origine. Le conjoint en profite à vie
     * mais ne peut PAS le vendre (≠ donation résiduelle).
     *
     * Idéal pour : famille recomposée, protéger le conjoint SANS léser les enfants 1er lit.
     *
     * @param {Object} params
     * @param {number} params.valeurBien - Valeur du bien (logement, portefeuille...)
     * @param {number} params.ageConjoint - Âge du conjoint bénéficiaire
     * @param {number} params.nbEnfants - Nombre d'enfants (bénéficiaires finaux)
     * @param {number} params.nbDonors - 1 ou 2
     * @param {string} params.unionType - 'mariage', 'pacs'
     * @param {boolean} params.hasEnfantsAutreLit - Enfants d'un autre lit
     * @returns {Object}
     */
    function computeDonationGraduelle(params) {
        var p = params || {};
        var valeur = p.valeurBien || 300000;
        var ageConj = p.ageConjoint || 55;
        var nbEnf = Math.max(1, p.nbEnfants || 2);
        var nbDonors = p.nbDonors || 1;
        var unionType = p.unionType || 'mariage';
        var autresLit = !!p.hasEnfantsAutreLit;
        var F = SD._fiscal;

        // Au 1er décès : conjoint reçoit le bien
        // Conjoint exonéré (marié/pacsé) → 0€ droits
        var exoConj = unionType === 'mariage' || unionType === 'pacs';
        var droits1erDeces = exoConj ? 0 : F.calcDroits(Math.max(0, valeur - 1594), F.getBareme('tiers'));

        // Au 2nd décès : le bien revient aux enfants du PREMIER défunt
        // Les enfants paient les droits sur la valeur au 2nd décès
        // MAIS : abattement enfant 100k applicable (ils héritent du 1er parent, pas du conjoint)
        var droits2ndDeces = F.calcDroits(Math.max(0, valeur / nbEnf - 100000 * nbDonors), F.getBareme('enfant')) * nbEnf;

        // Comparaison SANS donation graduelle (succession classique)
        // Si le conjoint hérite normalement, au 2nd décès le bien va aux enfants DU CONJOINT
        // Les enfants du 1er lit ne reçoivent RIEN du conjoint (pas de lien de parenté)
        var perteSansGraduelle = autresLit ? valeur : 0; // les enfants 1er lit perdent le bien

        // Comparaison avec donation résiduelle (le conjoint PEUT vendre)
        var risqueResiduelle = 'Le conjoint peut vendre le bien → enfants ne récupèrent RIEN';

        return {
            applicable: true,
            valeurBien: valeur,
            droits1erDeces: droits1erDeces,
            droits2ndDeces: droits2ndDeces,
            droitsTotal: droits1erDeces + droits2ndDeces,
            conjointProtege: true,
            conjointPeutVendre: false, // GRADUELLE = incessible
            bienResteEnFamille: true,
            perteSansGraduelle: perteSansGraduelle,
            explanation: 'Donation graduelle : ' + fmt(valeur) + ' → conjoint (jouissance à vie, 0€ si exonéré) → enfants au 2nd décès. ' +
                'Le bien revient OBLIGATOIREMENT aux enfants. Le conjoint ne peut PAS le vendre.',
            avantages: [
                'Conjoint protégé à vie (jouissance/usufruit)',
                exoConj ? 'Conjoint exonéré → 0€ au 1er décès' : 'Droits tiers au 1er décès',
                'Bien revient OBLIGATOIREMENT aux enfants au 2nd décès',
                'Enfants du 1er lit protégés (le bien ne va PAS aux enfants du conjoint)',
                'Le conjoint ne peut pas vendre (≠ donation résiduelle)',
                'Droits enfants au 2nd décès : ' + fmt(droits2ndDeces) + ' (barème LD)'
            ],
            inconvenients: [
                'Conjoint ne peut ni vendre ni donner le bien (charge de conservation)',
                'Les enfants doivent attendre le 2nd décès',
                'Si le bien perd de la valeur, les enfants assument la perte'
            ],
            vsResiduelle: {
                graduelle: 'Bien GARANTI pour les enfants. Conjoint ne peut pas vendre.',
                residuelle: risqueResiduelle,
                conseil: autresLit
                    ? 'Avec enfants autre lit : TOUJOURS privilégier la graduelle (résiduelle = risque de perte totale)'
                    : 'Enfants communs : la résiduelle est acceptable (le conjoint est aussi leur parent)'
            },
            conseil: autresLit
                ? 'STRATÉGIE CLEF famille recomposée : le bien va au conjoint à vie, puis revient OBLIGATOIREMENT à vos enfants. Les enfants du conjoint ne reçoivent rien de ce bien.'
                : 'Protège le conjoint tout en garantissant le retour du bien aux enfants.',
            article: 'Art. 1048-1061 CC — Donation graduelle (libéralités résiduelles art. 1057+ CC)'
        };
    }

    // ============================================================
    // 7. DONATION-PARTAGE CONJONCTIVE (art. 1076-1 CC)
    // ============================================================

    /**
     * Donation-partage conjonctive : les 2 époux donnent ensemble à TOUS les enfants
     * y compris les beaux-enfants → barème ligne directe + abat 100k !
     *
     * Sans conjonctive : beau-enfant = tiers = 60% + abat 1 594€
     * Avec conjonctive : beau-enfant reçoit des biens COMMUNS → barème LD + abat 100k
     *
     * Condition : être MARIÉS (pas PACS ni concubins)
     *
     * @param {Object} params
     * @param {number} params.valeurBiensCommuns - Valeur des biens communs transmis
     * @param {number} params.nbEnfantsPropres - Enfants biologiques
     * @param {number} params.nbBeauxEnfants - Enfants du conjoint (beaux-enfants)
     * @param {number} params.montantParBeauEnfant - Part que chaque beau-enfant reçoit
     * @param {number} params.agesDonateurs - Âge moyen des donateurs (pour NP)
     * @returns {Object}
     */
    function computeDonationPartageConjonctive(params) {
        var p = params || {};
        var biensCommuns = p.valeurBiensCommuns || 400000;
        var nbPropres = Math.max(1, p.nbEnfantsPropres || 2);
        var nbBeaux = p.nbBeauxEnfants || 1;
        var nbTotal = nbPropres + nbBeaux;
        var montantParBE = p.montantParBeauEnfant || Math.round(biensCommuns / nbTotal);
        var F = SD._fiscal;

        // --- SANS conjonctive : beau-enfant = tiers ---
        var abatTiers = 1594;
        var droitsBE_sans = F.calcDroits(Math.max(0, montantParBE - abatTiers), F.getBareme('tiers'));
        var tauxEffectifSans = montantParBE > 0 ? Math.round(droitsBE_sans / montantParBE * 100) : 60;

        // --- AVEC conjonctive : beau-enfant = barème LD + abat 100k ---
        var abatLD = 100000; // abattement enfant sur biens communs du couple
        var droitsBE_avec = F.calcDroits(Math.max(0, montantParBE - abatLD), F.getBareme('enfant'));
        var tauxEffectifAvec = montantParBE > 0 ? Math.round(droitsBE_avec / montantParBE * 100) : 0;

        var economieParBE = droitsBE_sans - droitsBE_avec;
        var economieTotale = economieParBE * nbBeaux;

        // Enfants propres : idem barème LD (pas de changement)
        var montantParPropre = Math.round((biensCommuns - montantParBE * nbBeaux) / nbPropres);
        var droitsEnfPropre = F.calcDroits(Math.max(0, montantParPropre - abatLD), F.getBareme('enfant'));

        return {
            applicable: true,
            conditionMariage: true, // UNIQUEMENT pour époux mariés
            biensCommuns: biensCommuns,
            nbEnfantsPropres: nbPropres,
            nbBeauxEnfants: nbBeaux,
            montantParBeauEnfant: montantParBE,
            sansConjonctive: {
                droitsParBE: droitsBE_sans,
                abattement: abatTiers,
                bareme: 'tiers (60%)',
                tauxEffectif: tauxEffectifSans
            },
            avecConjonctive: {
                droitsParBE: droitsBE_avec,
                abattement: abatLD,
                bareme: 'ligne directe (5-45%)',
                tauxEffectif: tauxEffectifAvec
            },
            economieParBeauEnfant: economieParBE,
            economieTotale: economieTotale,
            enfantsPropres: { montantChacun: montantParPropre, droitsChacun: droitsEnfPropre },
            explanation: 'Donation-partage conjonctive : les 2 époux donnent ensemble les biens COMMUNS. ' +
                'Les beaux-enfants passent de tiers (60% + abat 1 594€) à barème LD (5-45% + abat 100k). ' +
                'Économie par beau-enfant : ' + fmt(economieParBE) + '. Total : ' + fmt(economieTotale) + '.',
            avantages: [
                'Beaux-enfants au barème ligne directe (5-45%) au lieu de 60%',
                'Abattement 100k au lieu de 1 594€ — différence ' + fmt(abatLD - abatTiers),
                'Valeur figée au jour de la donation (pas de réévaluation au décès)',
                'Paix familiale : tous les enfants traités dans le même acte',
                'Économie totale : ' + fmt(economieTotale)
            ],
            inconvenients: [
                'Réservé aux couples MARIÉS (pas PACS ni concubinage)',
                'Uniquement sur les biens COMMUNS du couple',
                'Nécessite un notaire (acte plus complexe)',
                'Tous les enfants doivent être présents à l\'acte',
                'Les enfants propres doivent accepter le partage avec les beaux-enfants'
            ],
            warnings: [
                'Attention à respecter la réserve héréditaire des enfants propres',
                nbBeaux > nbPropres ? '\u26a0\ufe0f Plus de beaux-enfants que d\'enfants propres → risque de contestation' : null
            ].filter(Boolean),
            conseil: 'STRATÉGIE MAJEURE famille recomposée. Sans conjonctive : beau-enfant paie ' + fmt(droitsBE_sans) + ' (' + tauxEffectifSans + '%). ' +
                'Avec conjonctive : ' + fmt(droitsBE_avec) + ' (' + tauxEffectifAvec + '%). Économie : ' + fmt(economieParBE) + ' par beau-enfant.',
            article: 'Art. 1076-1 CC — Donation-partage conjonctive entre époux'
        };
    }

    // ============================================================
    // 8. PACTE DE FAMILLE (art. 929+ CC)
    // ============================================================

    /**
     * Les enfants renoncent par anticipation à leur action en réduction
     * pour permettre des donations/legs aux beaux-enfants ou au conjoint
     * empiétant sur la réserve.
     */
    function computePacteFamille(params) {
        var p = params || {};
        var patrimoine = p.patrimoine || 500000;
        var nbEnfants = Math.max(1, p.nbEnfants || 2);
        var montantHorsReserve = p.montantHorsReserve || 100000; // ce qu'on veut donner aux beaux-enfants
        var F = SD._fiscal;

        // Réserve héréditaire
        var reserveFraction = nbEnfants === 1 ? 0.50 : nbEnfants === 2 ? 2/3 : 0.75;
        var reserveMontant = Math.round(patrimoine * reserveFraction);
        var qdMontant = patrimoine - reserveMontant;
        var empiete = montantHorsReserve > qdMontant;
        var depassement = Math.max(0, montantHorsReserve - qdMontant);

        return {
            applicable: empiete,
            patrimoine: patrimoine,
            reserve: reserveMontant,
            quotiteDisponible: qdMontant,
            montantSouhaite: montantHorsReserve,
            empiete: empiete,
            depassement: depassement,
            explanation: empiete
                ? 'Le montant souhaité (' + fmt(montantHorsReserve) + ') dépasse la QD (' + fmt(qdMontant) + ') de ' + fmt(depassement) + '. ' +
                  'Sans pacte de famille, les enfants pourraient demander la réduction. ' +
                  'Avec le pacte, ils renoncent à contester → les beaux-enfants sont sécurisés.'
                : 'Le montant (' + fmt(montantHorsReserve) + ') est dans la QD (' + fmt(qdMontant) + '). Pas de pacte nécessaire.',
            conditions: [
                'Signé devant DEUX notaires (obligatoire)',
                'Chaque enfant doit consentir librement (personne ne peut l\'y obliger)',
                'L\'enfant renonce à son action en réduction (art. 929 CC)',
                'Le pacte est irrévocable (sauf vice du consentement)'
            ],
            conseil: empiete
                ? 'Pacte de famille recommandé : vos enfants renoncent à contester les ' + fmt(depassement) + ' qui dépassent la QD. ' +
                  'Coût : ~1 500-2 500€ (2 notaires). Sécurise les beaux-enfants définitivement.'
                : 'Pas besoin de pacte : le montant est dans la quotité disponible.',
            article: 'Art. 929-930-5 CC — Renonciation anticipée à l\'action en réduction (RAAR)'
        };
    }

    // ============================================================
    // 9. RECOMMANDATIONS BASÉES SUR OBJECTIFS
    // ============================================================

    function genererRecommandations(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var nbEnfants = p.nbEnfants || 0;
        var autresLit = !!p.hasEnfantsAutreLit;
        var nbBeauxEnfants = p.nbBeauxEnfants || 0;
        var patrimoine = p.patrimoine || 0;
        var age = p.ageDonateur || 55;
        var hasAV = !!p.hasAV;
        var hasPER = !!p.hasPER;
        var hasSCI = !!p.hasSCI;
        var hasDDV = !!p.hasDDV;
        var hasTestament = !!p.hasTestament;
        var paysResidence = p.paysResidence || 'FR';
        var recs = [], urgences = [];

        // --- PROTECTION CONJOINT ---
        if (unionType === 'concubinage') {
            recs.push({ objectif: 'Protéger votre concubin(e)', priorite: 'CRITIQUE', icon: 'fa-heart', color: 'var(--accent-coral)',
                actions: [
                    { action: 'Passer au PACS → exonération droits', impact: 'Économie 60%', urgence: true },
                    { action: 'Se marier → DDV + droit viager', impact: 'Protection maximale', urgence: true },
                    { action: 'AV bénéficiaire < 152.5k', impact: 'Exo art. 990 I', urgence: false },
                    { action: 'SCI démembrement croisé', impact: 'Logement protégé', urgence: false },
                    { action: 'Testament QD', impact: 'Taxé 60%', urgence: false }
                ] });
        }

        if (unionType === 'pacs' && !hasTestament) {
            recs.push({ objectif: 'Rédiger un TESTAMENT (obligatoire PACS !)', priorite: 'CRITIQUE', icon: 'fa-exclamation-circle', color: 'var(--accent-coral)',
                actions: [
                    { action: 'PACS = 0€ d\'héritage sans testament !', impact: 'Partenaire RIEN', urgence: true },
                    { action: 'Testament olographe (gratuit) ou notarié (136€)', impact: 'Protège partenaire', urgence: true },
                    { action: 'Inscrire au FCDDV (18€)', impact: 'Garantit découverte', urgence: false }
                ] });
        }

        // RÉVERSION USUFRUIT (PACS)
        if (unionType === 'pacs' && nbEnfants > 0 && patrimoine > 100000) {
            var revUS = computeReversionUsufruit({ valeurBien: Math.round(patrimoine * 0.40), ageDonateur: age, nbEnfants: nbEnfants, unionType: 'pacs' });
            recs.push({ objectif: 'Réversion d\'usufruit — Logement à vie pour le pacsé', priorite: 'HAUTE', icon: 'fa-home', color: 'var(--accent-cyan)',
                actions: [
                    { action: 'Donation NP logement + réserve US + clause réversion', impact: 'Pacsé logé à vie, 0€ réversion', urgence: false },
                    { action: 'Droits NP : ' + fmt(revUS.droitsDonationNP), impact: 'Compense absence droit viager', urgence: false },
                    { action: 'Contrat capitalisation complémentaire', impact: 'Transmis en l\'état', urgence: false },
                    { action: '\u26a0\ufe0f IRRÉVOCABLE même si rupture PACS', impact: 'Bien réfléchir', urgence: true }
                ] });
        }

        if (unionType === 'mariage' && !hasDDV && nbEnfants > 0) {
            recs.push({ objectif: 'Donation au dernier vivant (DDV)', priorite: 'HAUTE', icon: 'fa-ring', color: 'var(--accent-amber)',
                actions: [
                    { action: 'DDV notaire ~140€', impact: '100% US / QD PP / mixte', urgence: false },
                    { action: age >= 60 ? '100% usufruit recommandé (>60a)' : 'QD en PP si jeune', impact: 'Revenus + logement', urgence: false },
                    { action: autresLit ? '\u26a0\ufe0f Enfants autre lit : DDV = 25% PP max' : 'Toutes options disponibles', impact: '', urgence: autresLit }
                ] });
        }

        // --- FAMILLE RECOMPOSÉE — DONATION GRADUELLE ---
        if (autresLit && unionType === 'mariage' && patrimoine > 100000) {
            var grad = computeDonationGraduelle({ valeurBien: Math.round(patrimoine * 0.30), ageConjoint: age - 2, nbEnfants: nbEnfants, unionType: unionType, hasEnfantsAutreLit: true });
            recs.push({ objectif: 'Donation graduelle — Protéger conjoint PUIS enfants 1er lit', priorite: 'HAUTE', icon: 'fa-exchange-alt', color: 'var(--accent-purple)',
                actions: [
                    { action: 'Donation graduelle : bien → conjoint (à vie) → revient aux enfants', impact: 'Bien GARANTI pour vos enfants', urgence: false },
                    { action: 'Conjoint profite du bien mais ne peut PAS le vendre', impact: 'Charge de conservation', urgence: false },
                    { action: 'Au 2nd décès : enfants récupèrent, droits ' + fmt(grad.droits2ndDeces), impact: 'Barème LD', urgence: false },
                    { action: '\u26a0\ufe0f ÉVITER donation résiduelle si enfants autre lit', impact: 'Conjoint pourrait vendre → enfants 0€', urgence: true }
                ] });
        }

        // --- FAMILLE RECOMPOSÉE — DONATION-PARTAGE CONJONCTIVE ---
        if (nbBeauxEnfants > 0 && unionType === 'mariage' && patrimoine > 100000) {
            var conj = computeDonationPartageConjonctive({ valeurBiensCommuns: Math.round(patrimoine * 0.50), nbEnfantsPropres: nbEnfants, nbBeauxEnfants: nbBeauxEnfants });
            recs.push({ objectif: 'Donation-partage conjonctive — Beaux-enfants au barème LD', priorite: 'HAUTE', icon: 'fa-users', color: 'var(--accent-green)',
                actions: [
                    { action: 'Les 2 époux donnent ensemble les biens communs', impact: 'Beaux-enfants passent de 60% à 5-45%', urgence: false },
                    { action: 'Abattement 100k (au lieu de 1 594€)', impact: 'Économie ' + fmt(conj.economieParBeauEnfant) + '/beau-enfant', urgence: false },
                    { action: 'Valeur figée au jour de la donation', impact: 'Pas de réévaluation', urgence: false },
                    { action: 'Tous les enfants présents à l\'acte', impact: 'Paix familiale', urgence: false }
                ] });
        }

        // --- PACTE DE FAMILLE ---
        if (autresLit && nbBeauxEnfants > 0 && patrimoine > 200000) {
            var pacte = computePacteFamille({ patrimoine: patrimoine, nbEnfants: nbEnfants, montantHorsReserve: Math.round(patrimoine * 0.20) });
            if (pacte.empiete) {
                recs.push({ objectif: 'Pacte de famille — Sécuriser les beaux-enfants', priorite: 'MOYENNE', icon: 'fa-handshake', color: 'var(--accent-blue)',
                    actions: [
                        { action: 'Enfants renoncent à contester les donations aux beaux-enfants', impact: 'Sécurité juridique', urgence: false },
                        { action: 'Signé devant 2 notaires (~2 000€)', impact: 'Irrévocable', urgence: false },
                        { action: 'Dépassement réserve : ' + fmt(pacte.depassement), impact: 'Art. 929 CC', urgence: false }
                    ] });
            }
        }

        // --- ENFANTS AUTRE LIT ---
        if (autresLit && nbBeauxEnfants === 0) {
            recs.push({ objectif: 'Protéger les enfants du premier lit', priorite: 'HAUTE', icon: 'fa-child', color: 'var(--accent-purple)',
                actions: [
                    { action: '\u26a0\ufe0f Attribution intégrale = action en retranchement', impact: 'Enfants 1er lit récupèrent réserve', urgence: true },
                    { action: 'DDV limitée 25% PP', impact: 'Art. 757 al. 2', urgence: false },
                    { action: 'AV bénéficiaire enfants 1er lit', impact: 'Hors succession', urgence: false },
                    { action: 'Donation-partage pour figer valeurs', impact: 'Pas de réévaluation', urgence: false }
                ] });
        }

        // --- OPTIMISATION FISCALE ---
        if (patrimoine > 200000 && nbEnfants > 0) {
            var optActions = [];
            if (!hasAV) optActions.push({ action: 'Ouvrir AV : abat. 152 500€/bén (990 I)', impact: 'Hors succession', urgence: false });
            if (age < 80) {
                var donFamTotal = 31865 * nbEnfants * (p.nbDonors || 1);
                optActions.push({ action: 'Don familial 31 865€ × ' + nbEnfants + ' = ' + fmt(donFamTotal), impact: '790 G cumulable', urgence: age >= 75 });
                if (age >= 75) urgences.push('\u23f0 Don familial : ' + age + 'a → ' + (80 - age) + ' an(s) avant limite !');
            }
            if (patrimoine > 300000 && !hasSCI) optActions.push({ action: 'SCI immobilier locatif : décote 15%', impact: fmt(Math.round(patrimoine * 0.045)) + ' éco', urgence: false });
            if (patrimoine > 500000) optActions.push({ action: 'GFV/GFA/GFI : exo 75%', impact: fmt(Math.round(patrimoine * 0.056)) + ' hors assiette', urgence: false });
            if (hasPER && hasAV) optActions.push({ action: '\u26a0\ufe0f PER + AV : abat 152.5k PARTAGÉ', impact: 'Vérifier répartition', urgence: false });
            if (unionType === 'pacs') optActions.push({ action: 'Contrat capitalisation (transmis en l\'état)', impact: 'Aussi avantageux qu\'AV + NP possible', urgence: false });
            if (nbEnfants >= 2 && patrimoine > 500000) optActions.push({ action: 'Renonciation si enfant a des PE', impact: 'PE abat. 100k vs 31.8k', urgence: false });
            if (optActions.length > 0) recs.push({ objectif: 'Réduire les droits de succession', priorite: 'HAUTE', icon: 'fa-piggy-bank', color: 'var(--accent-green)', actions: optActions });
        }

        // --- INTERNATIONAL ---
        if (paysResidence !== 'FR') {
            recs.push({ objectif: 'Sécuriser succession internationale', priorite: 'HAUTE', icon: 'fa-globe', color: 'var(--accent-blue)',
                actions: [
                    { action: 'Testament "loi française" (art. 22 UE 650/2012)', impact: 'Protège réserve', urgence: true },
                    { action: 'Certificat successoral européen (~120€)', impact: 'Reconnu UE', urgence: false },
                    { action: 'Convention fiscale bilatérale', impact: 'Éviter double imposition', urgence: false }
                ] });
        }

        urgences.push('\ud83d\udcc5 Exo logement 790 A bis : expire 31/12/2026');
        if (nbEnfants > 0 && patrimoine > 100000) urgences.push('\u23f3 Abattements renouvelables 15 ans — commencer tôt');

        return { recommandations: recs, urgences: urgences, nbActions: recs.reduce(function(s, r) { return s + r.actions.length; }, 0) };
    }

    // ============================================================
    // 10. CHECKLIST
    // ============================================================

    function genererChecklist(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var autresLit = !!p.hasEnfantsAutreLit;
        var nbBeaux = p.nbBeauxEnfants || 0;
        var items = [];

        items.push({ done: !!p.hasTestament, label: 'Testament rédigé' + (unionType === 'pacs' ? ' (OBLIGATOIRE PACS !)' : ''), priorite: unionType === 'pacs' ? 'critique' : 'haute' });
        items.push({ done: !!p.hasAV, label: 'Assurance vie souscrite (abat. 152 500€/bén.)', priorite: 'haute' });
        items.push({ done: false, label: 'Clause bénéficiaire AV vérifiée + second rang', priorite: 'haute' });

        if (unionType === 'mariage') {
            items.push({ done: !!p.hasDDV, label: 'Donation au dernier vivant (~140€)', priorite: 'haute' });
            items.push({ done: false, label: 'Régime matrimonial adapté', priorite: 'moyenne' });
            if (autresLit) items.push({ done: false, label: 'Donation graduelle étudiée (bien → conjoint → enfants)', priorite: 'haute' });
            if (nbBeaux > 0) items.push({ done: false, label: 'Donation-partage conjonctive envisagée (beaux-enfants barème LD)', priorite: 'haute' });
            if (autresLit && nbBeaux > 0) items.push({ done: false, label: 'Pacte de famille si dépassement réserve', priorite: 'moyenne' });
        }
        if (unionType === 'pacs') {
            items.push({ done: false, label: 'Réversion usufruit logement (notaire)', priorite: 'haute' });
            items.push({ done: false, label: 'Contrat capitalisation (transmis en l\'état)', priorite: 'moyenne' });
        }
        if (unionType === 'concubinage') {
            items.push({ done: false, label: '\u26a0\ufe0f Étudier passage PACS ou mariage', priorite: 'critique' });
            items.push({ done: !!p.hasSCI, label: 'SCI démembrement croisé logement', priorite: 'haute' });
        }
        if (p.nbEnfants > 0 && (p.ageDonateur || 50) < 80) {
            items.push({ done: false, label: 'Don familial 31 865€ (art. 790 G)', priorite: 'haute' });
            items.push({ done: false, label: 'Donation 100k€/enfant/parent', priorite: 'moyenne' });
        }
        if (p.patrimoine > 300000) {
            items.push({ done: !!p.hasSCI, label: 'SCI locatif (décote 15%)', priorite: 'moyenne' });
            items.push({ done: false, label: 'GFV/GFA/GFI (exo 75%)', priorite: 'basse' });
        }
        items.push({ done: false, label: 'Déclaration dons en ligne (01/2026)', priorite: 'haute' });
        items.push({ done: false, label: 'Exo logement 790 A bis avant 31/12/2026', priorite: 'moyenne' });

        return { items: items, nbTodo: items.filter(function(i) { return !i.done; }).length };
    }

    // ============================================================
    // 11. RENDU — Panneau step 5 (inchangé dans la structure)
    // ============================================================

    function renderRecommendationsPanel() {
        var state = getState(); if (!state) return;
        var existing = document.getElementById('strategy-recommendations-panel');
        if (existing) existing.remove();

        var F = SD._fiscal, pat = F.computePatrimoine();
        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
        var nbBeaux = bens.filter(function(b) { return b.isBeauEnfant || b.lien === 'beau_enfant'; }).length;
        var unionType = state._unionType || 'mariage';
        var autresLit = bens.some(function(b) { return b.isAutreLit; });
        var ageDon = 55;
        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].age) ageDon = donors[0].age;
        var hasAV = (state.financials || []).some(function(f) { return f.type === 'assurance_vie'; });
        var hasPER = (state.financials || []).some(function(f) { return f.type === 'per'; });
        var hasSCI = (state.immos || []).some(function(b) { return b.detention === 'sci_ir' || b.detention === 'sci_is'; });

        var unionSim = null;
        if (unionType !== 'mariage') {
            var avConj = 0;
            (state.financials || []).forEach(function(f) { if (f.type === 'assurance_vie') avConj += (f.montant || 0); });
            unionSim = simulerChangementUnion({ patrimoine: pat.actifNet, montantConjoint: Math.round(pat.actifNet * 0.25), nbEnfants: nbEnfants, hasEnfantsAutreLit: autresLit, montantAV: avConj });
        }

        var recs = genererRecommandations({
            unionType: unionType, nbEnfants: nbEnfants, nbBeauxEnfants: nbBeaux, hasEnfantsAutreLit: autresLit,
            patrimoine: pat.actifNet, ageDonateur: ageDon, hasAV: hasAV, hasPER: hasPER,
            hasSCI: hasSCI, hasDDV: state._hasDDV, hasTestament: state._hasTestament,
            nbDonors: state.mode === 'couple' ? 2 : 1, paysResidence: state._paysResidence || 'FR'
        });

        if (recs.recommandations.length === 0 && !unionSim) return;

        var html = '<div class="section-card" id="strategy-recommendations-panel" style="border-color:rgba(255,179,0,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-compass" style="background:linear-gradient(135deg,rgba(255,179,0,.2),rgba(255,152,0,.1));color:var(--accent-amber);"></i> Stratégie & recommandations</div>';
        html += '<div class="section-subtitle">Actions concrètes pour optimiser votre transmission — par ordre de priorité</div>';

        if (unionSim && unionType !== 'mariage') {
            var sc = unionSim.scenarios;
            html += '<div style="padding:16px;border-radius:12px;background:rgba(255,179,0,.06);border:1px solid rgba(255,179,0,.15);margin-bottom:16px;">';
            html += '<div style="font-size:.85rem;font-weight:700;margin-bottom:10px;"><i class="fas fa-exchange-alt" style="color:var(--accent-amber);margin-right:6px;"></i>Et si vous changiez de statut ?</div>';
            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr>';
            ['', 'Concubinage', 'PACS', 'Mariage'].forEach(function(h) {
                var st = h === '' ? 'text-align:left;' : 'text-align:center;';
                if (h.toLowerCase() === unionType) st += 'background:rgba(255,179,0,.08);font-weight:700;';
                html += '<th style="padding:8px;'+st+'">'+h+(h.toLowerCase()===unionType?' (actuel)':'')+'</th>';
            });
            html += '</tr></thead><tbody>';
            [['Droits',fmt(sc.concubinage.droitsTotal),fmt(sc.pacs.droitsTotal),fmt(sc.mariage.droitsTotal)],
             ['Exonéré','\u274c 60%','\u2705 Oui','\u2705 Oui'],
             ['Héritage auto','\u274c','\u274c (testament!)','\u2705'],
             ['DDV','\u274c','\u274c',autresLit?'\u26a0\ufe0f 25%PP':'\u2705 100%US'],
             ['Logement','\u274c','1 an','\u2705 Viager'],
             ['AV','152.5k exo','\u2705 Exo','\u2705 Exo']
            ].forEach(function(row){html+='<tr>';row.forEach(function(c,i){html+='<td style="padding:6px 8px;border-bottom:1px solid rgba(198,134,66,.05);'+(i===0?'font-weight:600;':'')+'">'+c+'</td>';});html+='</tr>';});
            html += '</tbody></table></div>';
            if (unionSim.economies.concubinage_vers_pacs > 0 && unionType === 'concubinage') {
                html += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(16,185,129,.08);font-size:.8rem;font-weight:600;color:var(--accent-green);text-align:center;">\ud83d\udca1 PACS : éco '+fmt(unionSim.economies.concubinage_vers_pacs)+' | Mariage : éco '+fmt(unionSim.economies.concubinage_vers_mariage)+' + DDV + viager</div>';
            }
            html += '</div>';
        }

        recs.recommandations.forEach(function(rec) {
            var pc = rec.priorite === 'CRITIQUE' ? 'var(--accent-coral)' : rec.priorite === 'HAUTE' ? 'var(--accent-amber)' : 'var(--accent-blue)';
            html += '<div style="padding:14px 16px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.1);margin-bottom:12px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div style="display:flex;align-items:center;gap:8px;"><i class="fas '+rec.icon+'" style="color:'+rec.color+';"></i><strong style="font-size:.85rem;">'+rec.objectif+'</strong></div>';
            html += '<span style="padding:2px 10px;border-radius:12px;font-size:.68rem;font-weight:700;color:white;background:'+pc+';">'+rec.priorite+'</span></div>';
            rec.actions.forEach(function(a) {
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;font-size:.78rem;"><span style="color:'+(a.urgence?'var(--accent-coral)':'var(--accent-green)')+';font-size:.7rem;margin-top:2px;">'+(a.urgence?'\ud83d\udd34':'\ud83d\udfe2')+'</span><div><span style="color:var(--text-primary);">'+a.action+'</span>';
                if (a.impact) html += '<span style="color:var(--text-muted);font-size:.72rem;"> \u2192 '+a.impact+'</span>';
                html += '</div></div>';
            });
            html += '</div>';
        });

        if (recs.urgences.length > 0) {
            html += '<div style="padding:12px 16px;border-radius:10px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);margin-bottom:12px;">';
            html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:6px;"><i class="fas fa-clock" style="margin-right:6px;"></i>Échéances</div>';
            recs.urgences.forEach(function(u){html+='<div style="font-size:.75rem;color:var(--text-secondary);padding:3px 0;">'+u+'</div>';});
            html += '</div>';
        }
        html += '</div>';

        var anchor = document.getElementById('per-av-clause-panel') || document.getElementById('fiscal-optimizations-panel') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    function init() {
        if (typeof SD === 'undefined') return;
        var _orig = SD.calculateResults;
        SD.calculateResults = function() { _orig.call(SD); setTimeout(renderRecommendationsPanel, 600); };
        console.log('[StrategyRecommendations v1.2] Loaded — + donation graduelle, conjonctive, pacte famille');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 800); });
    else setTimeout(init, 800);

    return {
        simulerChangementUnion: simulerChangementUnion, simulerChangementRegime: simulerChangementRegime,
        computeRenonciation: computeRenonciation, computeReversionUsufruit: computeReversionUsufruit,
        comparerAVCapitalisation: comparerAVCapitalisation,
        computeDonationGraduelle: computeDonationGraduelle,
        computeDonationPartageConjonctive: computeDonationPartageConjonctive,
        computePacteFamille: computePacteFamille,
        genererRecommandations: genererRecommandations, genererChecklist: genererChecklist
    };
})();
