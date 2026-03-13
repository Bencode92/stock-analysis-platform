/**
 * strategy-recommendations.js v1.1 — + Renonciation, Réversion usufruit, Contrat capitalisation
 *
 * 1. Changement d'union : concubinage → PACS → mariage (impact chiffré)
 * 2. Changement de régime matrimonial
 * 3. Objectifs + checklist + urgences
 * 4. NEW: Renonciation succession avec calcul (art. 805+ CC)
 * 5. NEW: Réversion d'usufruit pour PACS (donation NP + clause réversion)
 * 6. NEW: Contrat capitalisation vs AV (comparatif transmissibilité)
 *
 * @version 1.1.0 — 2026-03-13
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
        var age = p.ageDefunt || 55;
        var nbEnf = p.nbEnfants || 2;
        var autresLit = !!p.hasEnfantsAutreLit;
        var montantAV = p.montantAV || 0;
        var F = SD._fiscal;

        var scenarios = {};

        var droitsConc = F.calcDroits(Math.max(0, montantConj - 1594), F.getBareme('tiers'));
        var droitsAVConc = 0;
        if (montantAV > 152500) droitsAVConc = Math.round((montantAV - 152500) * 0.20);
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

        var optionDDV = !autresLit ? '100% usufruit ou QD en PP' : '25% PP (enfants autre lit)';
        scenarios.mariage = {
            label: 'Mariage', droitsConjoint: 0, droitsAV: 0, droitsTotal: 0,
            exonereConjoint: true, droitLogement: 'Viager (art. 764 CC) + 1 an gratuit',
            heritageAuto: true, ddvPossible: !autresLit, optionDDV: optionDDV,
            protections: ['Exonéré de droits', 'Héritage automatique', 'Droit viager logement', 'DDV (usufruit 100%)', 'AV exonérée'],
            risques: autresLit ? ['Action en retranchement enfants 1er lit'] : [],
            actions: ['DDV chez notaire (~140€)', 'Clause AV bénéficiaire "mon conjoint"'],
            couleur: 'var(--accent-green)'
        };

        return {
            scenarios: scenarios,
            economies: {
                concubinage_vers_pacs: scenarios.concubinage.droitsTotal - scenarios.pacs.droitsTotal,
                concubinage_vers_mariage: scenarios.concubinage.droitsTotal - scenarios.mariage.droitsTotal,
                pacs_vers_mariage: 0
            },
            meilleur: 'mariage',
            recommendation: scenarios.concubinage.droitsTotal > 0
                ? 'Passage concubinage → PACS : économie immédiate de ' + fmt(scenarios.concubinage.droitsTotal) + '. Mariage : + DDV + droit viager.'
                : 'Le mariage offre la meilleure protection (DDV + droit viager + exonération).'
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
        var droitsAcquets = F.calcDroits(Math.max(0, masseAcquets / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.acquets = { label: 'Communauté réduite aux acquêts (défaut)', masseSuccession: masseAcquets, droitsEnfants: droitsAcquets, article: 'Art. 1400-1491 CC',
            avantages: ['Régime par défaut, simple', 'Biens propres protégés'], inconvenients: ['Conjoint ne récupère que 50% des communs'] };

        var masseUniv = Math.round(patrimoine / 2);
        var droitsUniv = F.calcDroits(Math.max(0, masseUniv / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.universelle = { label: 'Communauté universelle', masseSuccession: masseUniv, droitsEnfants: droitsUniv, article: 'Art. 1526 CC',
            avantages: ['Tout est commun', 'Conjoint garante 50% minimum'], inconvenients: ['Biens propres perdent leur caractère propre'] };

        regimes.attribution_integrale = { label: 'Communauté universelle + clause attribution intégrale', masseSuccession: 0, droitsEnfants: 0, article: 'Art. 1526 CC + clause',
            droitsAu1erDeces: 0, droitsAu2ndDeces: F.calcDroits(Math.max(0, patrimoine / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants,
            perte1Abattement: 100000 * nbEnfants,
            avantages: ['0€ droits au 1er décès', 'Conjoint reçoit TOUT', 'Pas d\'ouverture de succession'],
            inconvenients: ['Enfants perdent 1 abattement (100k × ' + nbEnfants + ' = ' + fmt(100000 * nbEnfants) + ')', 'Droits plus élevés au 2nd décès : ' + fmt(F.calcDroits(Math.max(0, patrimoine / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants)],
            warnings: autresLit ? ['\ud83d\udea8 Enfants 1er lit : ACTION EN RETRANCHEMENT possible !'] : [],
            recommandePour: 'Couples SANS enfant ou enfants communs uniquement' };

        var masseSep = biensPropres;
        var droitsSep = F.calcDroits(Math.max(0, masseSep / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.separation = { label: 'Séparation de biens', masseSuccession: masseSep, droitsEnfants: droitsSep, article: 'Art. 1536-1543 CC',
            avantages: ['Patrimoines séparés', 'Protection si activité à risque'], inconvenients: ['Conjoint peu fortuné : pas de protection automatique'] };

        return { regimes: regimes, actuel: 'acquets', meilleurFiscal: 'attribution_integrale',
            meilleurProtection: autresLit ? 'acquets' : 'attribution_integrale',
            coutChangement: '~1 500 – 3 000€ notaire + homologation tribunal', delai: '2 ans minimum après le mariage' };
    }

    // ============================================================
    // 3. RENONCIATION SUCCESSION (art. 805+ CC)
    // ============================================================

    /**
     * Calcule l'impact fiscal d'une renonciation à succession.
     * L'héritier qui renonce est censé n'avoir jamais hérité.
     * Sa part va à ses descendants (représentation) ou accroît les autres héritiers.
     *
     * @param {Object} params
     * @param {number} params.montantSuccession - Masse successorale totale
     * @param {number} params.nbHeritiers - Nombre d'héritiers de base
     * @param {string} params.lienRenoncant - 'enfant', 'frere_soeur', etc.
     * @param {number} params.nbDescendantsRenoncant - PE du renonçant (représentation)
     * @param {number} params.ageDescendants - Âge moyen des descendants (pour don familial)
     * @param {number} params.nbDonors - 1 ou 2
     * @returns {Object} Comparatif sans/avec renonciation
     */
    function computeRenonciation(params) {
        var p = params || {};
        var montant = p.montantSuccession || 500000;
        var nbHer = Math.max(1, p.nbHeritiers || 2);
        var lien = p.lienRenoncant || 'enfant';
        var nbDesc = p.nbDescendantsRenoncant || 0;
        var ageDesc = p.ageDescendants || 25;
        var nbDonors = p.nbDonors || 1;
        var F = SD._fiscal;

        // --- SANS renonciation ---
        var partSans = montant / nbHer;
        var abatSans = F.getAbattement(lien, true) * nbDonors;
        var droitsSansParHer = F.calcDroits(Math.max(0, partSans - abatSans), F.getBareme(lien));
        var droitsSansTotal = droitsSansParHer * nbHer;

        // --- AVEC renonciation ---
        var droitsAvecTotal = 0;
        var nbRestants = nbHer - 1;
        var explication = '';

        if (nbDesc > 0) {
            // REPRÉSENTATION : les descendants du renonçant prennent sa place
            // Abattement enfant 100k (représentation) au lieu de PE 31.8k
            var partRenonçant = partSans; // même part que le renonçant aurait eu
            var partParDesc = partRenonçant / nbDesc;
            var abatDesc = 100000 * nbDonors; // abat. enfant en représentation (art. 779 bis CGI)
            var droitsDesc = F.calcDroits(Math.max(0, partParDesc - abatDesc), F.getBareme('enfant')) * nbDesc;

            // Autres héritiers : inchangés
            var droitsAutres = droitsSansParHer * nbRestants;
            droitsAvecTotal = droitsDesc + droitsAutres;

            explication = 'Renonciation + représentation : ' + nbDesc + ' PE héritent avec abat. 100k (au lieu de 31 865€). ' +
                'Part du renonçant (' + fmt(partRenonçant) + ') répartie entre ' + nbDesc + ' PE = ' + fmt(partParDesc) + ' chacun.';
        } else {
            // PAS de descendants → accroissement aux autres héritiers
            var partAccrue = montant / nbRestants;
            var droitsAccrusParHer = F.calcDroits(Math.max(0, partAccrue - abatSans), F.getBareme(lien));
            droitsAvecTotal = droitsAccrusParHer * nbRestants;

            explication = 'Renonciation sans descendants : part accroît aux ' + nbRestants + ' autres héritiers. ' +
                'Chacun reçoit ' + fmt(partAccrue) + ' au lieu de ' + fmt(partSans) + '.';
        }

        var economie = droitsSansTotal - droitsAvecTotal;
        var avantageux = economie > 0;

        return {
            sansRenonciation: { droitsTotal: droitsSansTotal, partParHeritier: partSans, nbHeritiers: nbHer },
            avecRenonciation: { droitsTotal: droitsAvecTotal, nbHeritiers: nbDesc > 0 ? nbRestants + nbDesc : nbRestants },
            economie: economie,
            avantageux: avantageux,
            nbDescendantsRenoncant: nbDesc,
            explanation: explication,
            conseil: avantageux
                ? 'La renonciation génère une économie de ' + fmt(economie) + '. ' + (nbDesc > 0 ? 'Les PE bénéficient de l\'abattement 100k en représentation.' : 'Les parts sont plus concentrées mais avec le même abattement.')
                : 'La renonciation n\'est PAS avantageuse fiscalement dans cette configuration.',
            article: 'Art. 805-808 CC (renonciation) + art. 751-755 CC (représentation)',
            warnings: [
                'La renonciation est irrévocable (sauf si aucun autre héritier n\'a accepté)',
                nbDesc === 0 && nbRestants <= 0 ? '\u26a0\ufe0f Aucun héritier restant → succession vacante (État)' : null,
                'Délai : 4 mois minimum, 10 ans maximum après le décès pour renoncer'
            ].filter(Boolean)
        };
    }

    // ============================================================
    // 4. RÉVERSION D'USUFRUIT (stratégie PACS)
    // ============================================================

    /**
     * Calcule l'impact de la réversion d'usufruit pour protéger le pacsé.
     * Stratégie : donation NP du logement aux enfants + réserve US + clause réversion au pacsé.
     *
     * Au décès du donateur :
     * - Pacsé reçoit l'usufruit → 0€ droits (exonéré art. 796-0 bis)
     * - Enfants déjà nu-propriétaires → récupèrent PP au 2nd décès → 0€ droits
     * - La réversion n'est PAS une donation, pas de droits supplémentaires
     *
     * @param {Object} params
     * @param {number} params.valeurBien - Valeur du bien (ex: logement)
     * @param {number} params.ageDonateur - Âge du donateur (pour barème 669)
     * @param {number} params.agePartenaire - Âge du partenaire pacsé
     * @param {number} params.nbEnfants - Nombre d'enfants
     * @param {string} params.unionType - 'pacs' ou 'concubinage'
     * @param {number} params.nbDonors - 1 ou 2
     * @returns {Object}
     */
    function computeReversionUsufruit(params) {
        var p = params || {};
        var valeur = p.valeurBien || 300000;
        var ageDon = p.ageDonateur || 55;
        var agePart = p.agePartenaire || 53;
        var nbEnf = Math.max(1, p.nbEnfants || 2);
        var unionType = p.unionType || 'pacs';
        var nbDonors = p.nbDonors || 1;
        var F = SD._fiscal;

        var npRatio = F.getNPRatio(ageDon);
        var usRatio = 1 - npRatio;
        var valeurNP = Math.round(valeur * npRatio);
        var valeurUS = valeur - valeurNP;

        // Droits donation NP aux enfants
        var abatEnfant = 100000 * nbDonors;
        var partNPparEnf = valeurNP / nbEnf;
        var droitsDonationNP = F.calcDroits(Math.max(0, partNPparEnf - abatEnfant), F.getBareme('enfant')) * nbEnf;

        // --- SCÉNARIO SANS réversion (classique) ---
        // Au décès : enfants héritent la NP restante + US s'éteint
        // Si testament lègue US au pacsé : pacsé exonéré mais QD limitée
        var droitsSansReversion = droitsDonationNP;
        // + si pas de réversion, le pacsé doit racheter l'US ou quitter le logement (droit 1 an seulement)

        // --- SCÉNARIO AVEC réversion d'usufruit ---
        // Même donation NP → mêmes droits donation
        // + clause réversion US au pacsé → 0€ droits supplémentaires (pas une donation)
        // Avantage : pacsé reste à vie dans le logement SANS aucun droit à payer
        var droitsAvecReversion = droitsDonationNP; // identique
        // MAIS : protection du pacsé = VIAGER, irrévocable

        // Comparatif avec succession directe sans montage
        var droitsSuccessionDirecte = 0;
        if (unionType === 'concubinage') {
            // Concubin : 60% sur tout
            droitsSuccessionDirecte = F.calcDroits(Math.max(0, valeur - 1594), F.getBareme('tiers'));
        } else if (unionType === 'pacs') {
            // Pacsé exonéré mais SANS droit viager au logement
            droitsSuccessionDirecte = 0; // exonéré
            // Mais risque de devoir quitter le logement après 1 an
        }

        var economieVsDirecte = droitsSuccessionDirecte - droitsAvecReversion;

        return {
            applicable: true,
            valeurBien: valeur,
            valeurNP: valeurNP,
            valeurUS: valeurUS,
            npRatio: npRatio,
            droitsDonationNP: droitsDonationNP,
            droitsReversion: 0, // la réversion n'est PAS taxée
            droitsTotal: droitsAvecReversion,
            protectionPartenaire: 'Usufruit viager — reste dans le logement à vie',
            protectionEnfants: 'NP — récupèrent PP au décès du pacsé sans droits',
            economieVsConcubin: unionType === 'concubinage' ? economieVsDirecte : 0,
            irrevocable: true,
            explanation: 'Donation NP (' + fmt(valeurNP) + ', ' + Math.round(npRatio * 100) + '%) aux enfants + réserve US + clause réversion US au partenaire ' + unionType + '. ' +
                'Droits donation NP : ' + fmt(droitsDonationNP) + '. Réversion US : 0€ (pas une donation). ' +
                'Le partenaire reste à vie dans le logement. Enfants récupèrent PP au 2nd décès sans droits.',
            avantages: [
                'Partenaire protégé à vie (usufruit viager)',
                'Pas de droits de succession sur la réversion',
                unionType === 'pacs' ? 'Compense l\'absence de droit viager du pacsé (vs conjoint marié)' : 'Évite les 60% de droits concubin sur le logement',
                'Enfants récupèrent PP automatiquement au 2nd décès',
                'Pas de droits au 2nd décès (extinction usufruit = gratuit)'
            ],
            inconvenients: [
                'IRRÉVOCABLE — même en cas de rupture du PACS',
                'Ne protège que le logement (pas les liquidités)',
                'Les enfants ne peuvent ni habiter ni vendre avant le 2nd décès'
            ],
            conseil: unionType === 'pacs'
                ? 'Stratégie IDÉALE pour pacsés : compense l\'absence de droit viager. Donation NP + réversion US = partenaire logé à vie, enfants protégés, 0€ droits réversion.'
                : 'Pour concubins : évite 60% de droits sur le logement. Économie : ' + fmt(economieVsDirecte) + '. ATTENTION : irrévocable.',
            article: 'Art. 949 + 1094-1 CC — Réversion d\'usufruit'
        };
    }

    // ============================================================
    // 5. CONTRAT DE CAPITALISATION vs AV
    // ============================================================

    /**
     * Compare contrat de capitalisation vs assurance vie pour la transmission.
     * Le contrat de capitalisation est transmissible EN L'ÉTAT (≠ AV fermée au décès).
     *
     * @param {Object} params
     * @param {number} params.montant - Montant du placement
     * @param {string} params.unionType - Type d'union du bénéficiaire
     * @param {string} params.lienBeneficiaire - Lien avec le bénéficiaire
     * @param {number} params.dureeContrat - Durée en années (pour fiscalité gains)
     * @returns {Object}
     */
    function comparerAVCapitalisation(params) {
        var p = params || {};
        var montant = p.montant || 200000;
        var unionType = p.unionType || 'pacs';
        var lien = p.lienBeneficiaire || 'conjoint_pacs';
        var duree = p.dureeContrat || 10;
        var F = SD._fiscal;

        var exoConjoint = lien === 'conjoint_pacs';

        // --- ASSURANCE VIE ---
        var av = {
            label: 'Assurance vie',
            transmission: 'Hors succession (art. 990 I / 757 B)',
            auDeces: 'Contrat FERMÉ — capital versé au bénéficiaire',
            droits: exoConjoint ? 0 : (montant > 152500 ? Math.round((montant - 152500) * 0.20) : 0),
            avantages: [
                'Hors succession (ne lèse pas les héritiers)',
                'Abattement 152 500€/bénéficiaire (avant 70 ans)',
                'Choix libre du bénéficiaire',
                exoConjoint ? 'Conjoint/pacsé exonéré à 100%' : 'Concubin : abat. 152.5k puis 20%/31.25%'
            ],
            inconvenients: [
                'Contrat fermé au décès → le bénéficiaire doit replacer les fonds',
                'Primes exagérées = risque réintégration (seuil ~35% patrimoine)',
                'Gains soumis aux PS (17,2%) même après 8 ans'
            ]
        };

        // --- CONTRAT DE CAPITALISATION ---
        var abatSuccession = exoConjoint ? 0 : F.getAbattement(lien, true);
        var droitsCapi = exoConjoint ? 0 : F.calcDroits(Math.max(0, montant - abatSuccession), F.getBareme(lien));
        var capi = {
            label: 'Contrat de capitalisation',
            transmission: 'Intégré à la succession (DMTG classiques)',
            auDeces: 'Contrat CONTINUE — transmis en l\'état au bénéficiaire',
            droits: droitsCapi,
            avantages: [
                'Transmissible EN L\'ÉTAT (continue de fructifier)',
                'Pas besoin de replacer les fonds',
                'Antériorité fiscale conservée (date de souscription maintenue)',
                exoConjoint ? 'Conjoint/pacsé exonéré → AUCUN inconvénient vs AV' : 'Pas de risque primes exagérées',
                'Peut être donné de son vivant (donation NP possible)',
                duree >= 8 ? 'Fiscalité gains allégée (> 8 ans)' : 'Fiscalité gains optimisée après 8 ans'
            ],
            inconvenients: [
                exoConjoint ? 'Aucun pour conjoint/pacsé (exonéré)' : 'Soumis aux DMTG classiques (pas d\'abat. 152.5k)',
                !exoConjoint ? 'Droits potentiellement plus élevés que AV pour non-conjoint' : null,
                'Fait partie de la succession → entre dans le calcul de la réserve'
            ].filter(Boolean)
        };

        // Recommandation
        var recommandation = '';
        if (exoConjoint) {
            recommandation = 'Pour un pacsé/conjoint (exonéré), le contrat de capitalisation est AUSSI avantageux que l\'AV en succession : 0€ de droits dans les deux cas. ' +
                'BONUS : le contrat continue de fructifier sans interruption. Idéal si le partenaire n\'a pas de compétences financières.';
        } else if (lien === 'tiers') {
            recommandation = 'Pour un concubin (tiers), l\'AV est NETTEMENT plus avantageuse : abat. 152 500€ + taux 20% vs DMTG 60%. ' +
                'Contrat capitalisation = ' + fmt(droitsCapi) + ' vs AV = ' + fmt(av.droits) + '. Économie AV : ' + fmt(droitsCapi - av.droits) + '.';
        } else {
            recommandation = 'Pour un enfant, l\'AV est souvent plus avantageuse (152.5k exo avant 70 ans). Contrat capitalisation utile si donation NP de son vivant.';
        }

        return {
            assuranceVie: av,
            contratCapitalisation: capi,
            meilleurPourConjointPacse: 'equivalent', // les deux = 0€
            meilleurPourConcubin: 'assurance_vie',
            meilleurPourEnfant: 'assurance_vie',
            recommandation: recommandation,
            economieAV: droitsCapi - av.droits // positif = AV moins cher
        };
    }

    // ============================================================
    // 6. RECOMMANDATIONS BASÉES SUR OBJECTIFS
    // ============================================================

    function genererRecommandations(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var nbEnfants = p.nbEnfants || 0;
        var autresLit = !!p.hasEnfantsAutreLit;
        var patrimoine = p.patrimoine || 0;
        var age = p.ageDonateur || 55;
        var hasAV = !!p.hasAV;
        var hasPER = !!p.hasPER;
        var hasSCI = !!p.hasSCI;
        var hasDDV = !!p.hasDDV;
        var hasTestament = !!p.hasTestament;
        var paysResidence = p.paysResidence || 'FR';

        var recs = [];
        var urgences = [];

        // --- PROTECTION CONJOINT ---
        if (unionType === 'concubinage') {
            recs.push({
                objectif: 'Protéger votre concubin(e)',
                priorite: 'CRITIQUE', icon: 'fa-heart', color: 'var(--accent-coral)',
                actions: [
                    { action: 'Passer au PACS → exonération droits succession', impact: 'Économie 60% droits', urgence: true },
                    { action: 'Ou mieux : se marier → DDV + droit viager logement', impact: 'Protection maximale', urgence: true },
                    { action: 'Si maintien concubinage : AV bénéficiaire < 152.5k', impact: 'Exo art. 990 I', urgence: false },
                    { action: 'SCI à démembrement croisé pour protéger le logement', impact: 'Survivant reste 0€ droits', urgence: false },
                    { action: 'Testament pour léguer la QD', impact: 'Mais taxé à 60%', urgence: false }
                ]
            });
        }

        if (unionType === 'pacs' && !hasTestament) {
            recs.push({
                objectif: 'Rédiger un TESTAMENT (obligatoire PACS !)',
                priorite: 'CRITIQUE', icon: 'fa-exclamation-circle', color: 'var(--accent-coral)',
                actions: [
                    { action: 'PACS = 0€ d\'héritage sans testament !', impact: 'Partenaire reçoit RIEN', urgence: true },
                    { action: 'Testament olographe (gratuit) ou notarié (136€)', impact: 'Protège le partenaire', urgence: true },
                    { action: 'Inscrire au FCDDV (18€)', impact: 'Garantit la découverte', urgence: false }
                ]
            });
        }

        // --- RÉVERSION USUFRUIT (PACS) ---
        if (unionType === 'pacs' && nbEnfants > 0 && patrimoine > 100000) {
            var revUS = computeReversionUsufruit({ valeurBien: Math.round(patrimoine * 0.40), ageDonateur: age, agePartenaire: age - 2, nbEnfants: nbEnfants, unionType: 'pacs', nbDonors: 1 });
            recs.push({
                objectif: 'Réversion d\'usufruit — Logement à vie pour le pacsé',
                priorite: 'HAUTE', icon: 'fa-home', color: 'var(--accent-cyan)',
                actions: [
                    { action: 'Donation NP logement aux enfants + réserve US + clause réversion au pacsé', impact: 'Pacsé logé à vie, 0€ droits réversion', urgence: false },
                    { action: 'Droits donation NP : ' + fmt(revUS.droitsDonationNP) + ' (NP ' + Math.round(revUS.npRatio * 100) + '%)', impact: 'Compense l\'absence de droit viager', urgence: false },
                    { action: 'Contrat de capitalisation pour compléter (transmis en l\'état)', impact: 'Continue de fructifier pour le pacsé', urgence: false },
                    { action: '⚠️ IRRÉVOCABLE même si rupture du PACS', impact: 'Bien réfléchir avant', urgence: true }
                ]
            });
        }

        if (unionType === 'mariage' && !hasDDV && nbEnfants > 0) {
            recs.push({
                objectif: 'Donation au dernier vivant (DDV)',
                priorite: 'HAUTE', icon: 'fa-ring', color: 'var(--accent-amber)',
                actions: [
                    { action: 'DDV chez notaire : ~140€', impact: 'Conjoint choisit entre 100% US / QD PP / mixte', urgence: false },
                    { action: '100% usufruit recommandé si > 60 ans', impact: 'Revenus + logement protégés', urgence: false },
                    { action: autresLit ? '\u26a0\ufe0f Enfants autre lit : DDV limitée à 25% PP' : 'Sans enfants autre lit : toutes options disponibles', impact: '', urgence: autresLit }
                ]
            });
        }

        // --- OPTIMISATION FISCALE ---
        if (patrimoine > 200000 && nbEnfants > 0) {
            var optActions = [];

            if (!hasAV) {
                optActions.push({ action: 'Ouvrir une AV : abat. 152 500€/bénéficiaire (art. 990 I)', impact: 'Hors succession', urgence: false });
            }

            if (age < 80) {
                var donFamTotal = 31865 * nbEnfants * (p.nbDonors || 1);
                optActions.push({ action: 'Don familial 31 865€ × ' + nbEnfants + ' enfant(s) = ' + fmt(donFamTotal), impact: 'Art. 790 G — cumulable', urgence: age >= 75 });
                if (age >= 75) urgences.push('\u23f0 Don familial : donateur ' + age + 'a \u2192 plus que ' + (80 - age) + ' an(s) avant la limite !');
            }

            if (patrimoine > 300000 && !hasSCI) {
                optActions.push({ action: 'Loger l\'immobilier locatif en SCI : décote 15%', impact: fmt(Math.round(patrimoine * 0.15 * 0.3)) + ' d\'économie potentielle', urgence: false });
            }

            if (patrimoine > 500000) {
                optActions.push({ action: 'Investir 5-10% en GFV/GFA/GFI : exonération 75%', impact: fmt(Math.round(patrimoine * 0.075 * 0.75)) + ' hors assiette', urgence: false });
            }

            if (hasPER && hasAV) {
                optActions.push({ action: '\u26a0\ufe0f PER + AV : abattement 152.5k PARTAGÉ (pas cumulé !)', impact: 'Vérifier la répartition', urgence: false });
            }

            // Contrat de capitalisation pour pacsé
            if (unionType === 'pacs') {
                optActions.push({ action: 'Contrat de capitalisation : transmis EN L\'ÉTAT (≠ AV fermée)', impact: 'Pacsé exonéré → aussi avantageux qu\'AV + continue de fructifier', urgence: false });
            }

            // Renonciation si > 2 enfants et patrimoine élevé
            if (nbEnfants >= 2 && patrimoine > 500000) {
                optActions.push({ action: 'Étudier la renonciation partielle si un enfant a des PE (représentation)', impact: 'PE héritent avec abat. 100k au lieu de 31.8k', urgence: false });
            }

            if (optActions.length > 0) {
                recs.push({
                    objectif: 'Réduire les droits de succession',
                    priorite: 'HAUTE', icon: 'fa-piggy-bank', color: 'var(--accent-green)',
                    actions: optActions
                });
            }
        }

        // --- ENFANTS AUTRE LIT ---
        if (autresLit) {
            recs.push({
                objectif: 'Protéger les enfants du premier lit',
                priorite: 'HAUTE', icon: 'fa-child', color: 'var(--accent-purple)',
                actions: [
                    { action: '\u26a0\ufe0f Communauté universelle + clause intégrale = action en retranchement', impact: 'Enfants 1er lit récupèrent leur réserve', urgence: true },
                    { action: 'DDV limitée à 25% PP avec enfants autre lit', impact: 'Art. 757 al. 2 CC', urgence: false },
                    { action: 'AV bénéficiaire enfants 1er lit (hors succession)', impact: 'Protection indépendante du conjoint', urgence: false },
                    { action: 'Donation-partage transgénérationnelle pour figer les valeurs', impact: 'Pas de réévaluation au décès', urgence: false }
                ]
            });
        }

        // --- INTERNATIONAL ---
        if (paysResidence !== 'FR') {
            recs.push({
                objectif: 'Sécuriser la succession internationale',
                priorite: 'HAUTE', icon: 'fa-globe', color: 'var(--accent-blue)',
                actions: [
                    { action: 'Testament avec option "loi française" (art. 22 UE 650/2012)', impact: 'Protège la réserve héréditaire', urgence: true },
                    { action: 'Certificat successoral européen (~120€)', impact: 'Reconnu dans tous les pays UE (sauf DK, IE)', urgence: false },
                    { action: 'Vérifier convention fiscale bilatérale', impact: 'Éviter double imposition', urgence: false }
                ]
            });
        }

        // --- URGENCES ---
        urgences.push('\ud83d\udcc5 Exonération logement 790 A bis : expire le 31/12/2026 — jusqu\'à 100k€/donateur');
        if (nbEnfants > 0 && patrimoine > 100000) {
            urgences.push('\u23f3 Abattements renouvelables tous les 15 ans — commencer le plus tôt possible');
        }

        return {
            recommandations: recs,
            urgences: urgences,
            nbActions: recs.reduce(function(sum, r) { return sum + r.actions.length; }, 0)
        };
    }

    // ============================================================
    // 7. CHECKLIST
    // ============================================================

    function genererChecklist(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var items = [];

        items.push({ done: !!p.hasTestament, label: 'Testament rédigé' + (unionType === 'pacs' ? ' (OBLIGATOIRE pour PACS !)' : ''), priorite: unionType === 'pacs' ? 'critique' : 'haute' });
        items.push({ done: !!p.hasAV, label: 'Assurance vie souscrite (abat. 152 500€/bén.)', priorite: 'haute' });
        items.push({ done: false, label: 'Clause bénéficiaire AV vérifiée + second rang', priorite: 'haute' });

        if (unionType === 'mariage') {
            items.push({ done: !!p.hasDDV, label: 'Donation au dernier vivant (~140€ notaire)', priorite: 'haute' });
            items.push({ done: false, label: 'Régime matrimonial adapté (vérifier avec notaire)', priorite: 'moyenne' });
        }

        if (unionType === 'pacs') {
            items.push({ done: false, label: 'Réversion usufruit logement envisagée (notaire)', priorite: 'haute' });
            items.push({ done: false, label: 'Contrat capitalisation étudié (transmis en l\'état)', priorite: 'moyenne' });
        }

        if (unionType === 'concubinage') {
            items.push({ done: false, label: '\u26a0\ufe0f Étudier le passage au PACS ou mariage', priorite: 'critique' });
            items.push({ done: !!p.hasSCI, label: 'SCI à démembrement croisé pour le logement', priorite: 'haute' });
        }

        if (p.nbEnfants > 0 && (p.ageDonateur || 50) < 80) {
            items.push({ done: false, label: 'Don familial 31 865€ effectué (art. 790 G)', priorite: 'haute' });
            items.push({ done: false, label: 'Donation 100k€/enfant/parent planifiée', priorite: 'moyenne' });
        }

        if (p.patrimoine > 300000) {
            items.push({ done: !!p.hasSCI, label: 'Immobilier locatif logé en SCI (décote 15%)', priorite: 'moyenne' });
            items.push({ done: false, label: 'GFV/GFA/GFI envisagé (exo 75%)', priorite: 'basse' });
        }

        items.push({ done: false, label: 'Déclaration en ligne dons manuels (obligatoire 01/2026)', priorite: 'haute' });
        items.push({ done: false, label: 'Exo logement 790 A bis avant 31/12/2026', priorite: 'moyenne' });

        return { items: items, nbTodo: items.filter(function(i) { return !i.done; }).length };
    }

    // ============================================================
    // 8. RENDU — Panneau step 5
    // ============================================================

    function renderRecommendationsPanel() {
        var state = getState();
        if (!state) return;

        var existing = document.getElementById('strategy-recommendations-panel');
        if (existing) existing.remove();

        var F = SD._fiscal, pat = F.computePatrimoine();
        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
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
            var montantConj = Math.round(pat.actifNet * 0.25);
            var avConj = 0;
            (state.financials || []).forEach(function(f) { if (f.type === 'assurance_vie') avConj += (f.montant || 0); });
            unionSim = simulerChangementUnion({ patrimoine: pat.actifNet, montantConjoint: montantConj, ageDefunt: ageDon, nbEnfants: nbEnfants, hasEnfantsAutreLit: autresLit, montantAV: avConj });
        }

        var recs = genererRecommandations({
            unionType: unionType, nbEnfants: nbEnfants, hasEnfantsAutreLit: autresLit,
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
                var style = h === '' ? 'text-align:left;' : 'text-align:center;';
                if (h.toLowerCase() === unionType) style += 'background:rgba(255,179,0,.08);font-weight:700;';
                html += '<th style="padding:8px;' + style + '">' + h + (h.toLowerCase() === unionType ? ' (actuel)' : '') + '</th>';
            });
            html += '</tr></thead><tbody>';
            [
                ['Droits conjoint', fmt(sc.concubinage.droitsTotal), fmt(sc.pacs.droitsTotal), fmt(sc.mariage.droitsTotal)],
                ['Exonéré', '\u274c Non (60%)', '\u2705 Oui', '\u2705 Oui'],
                ['Héritage auto', '\u274c Non', '\u274c Non (testament !)', '\u2705 Oui'],
                ['DDV', '\u274c', '\u274c', autresLit ? '\u26a0\ufe0f 25% PP' : '\u2705 100% US'],
                ['Droit logement', '\u274c Aucun', '1 an', '\u2705 Viager'],
                ['AV', '152.5k exo', '\u2705 Exonérée', '\u2705 Exonérée']
            ].forEach(function(row) {
                html += '<tr>';
                row.forEach(function(cell, i) {
                    html += '<td style="padding:6px 8px;border-bottom:1px solid rgba(198,134,66,.05);' + (i === 0 ? 'font-weight:600;' : '') + '">' + cell + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            if (unionSim.economies.concubinage_vers_pacs > 0 && unionType === 'concubinage') {
                html += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(16,185,129,.08);font-size:.8rem;font-weight:600;color:var(--accent-green);text-align:center;">';
                html += '\ud83d\udca1 Passage PACS : économie ' + fmt(unionSim.economies.concubinage_vers_pacs) + ' | Mariage : économie ' + fmt(unionSim.economies.concubinage_vers_mariage) + ' + DDV + droit viager';
                html += '</div>';
            }
            html += '</div>';
        }

        recs.recommandations.forEach(function(rec) {
            var prioColor = rec.priorite === 'CRITIQUE' ? 'var(--accent-coral)' : rec.priorite === 'HAUTE' ? 'var(--accent-amber)' : 'var(--accent-blue)';
            html += '<div style="padding:14px 16px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.1);margin-bottom:12px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;"><i class="fas ' + rec.icon + '" style="color:' + rec.color + ';"></i>';
            html += '<strong style="font-size:.85rem;">' + rec.objectif + '</strong></div>';
            html += '<span style="padding:2px 10px;border-radius:12px;font-size:.68rem;font-weight:700;color:white;background:' + prioColor + ';">' + rec.priorite + '</span></div>';
            rec.actions.forEach(function(a) {
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;font-size:.78rem;">';
                html += '<span style="color:' + (a.urgence ? 'var(--accent-coral)' : 'var(--accent-green)') + ';font-size:.7rem;margin-top:2px;">' + (a.urgence ? '\ud83d\udd34' : '\ud83d\udfe2') + '</span>';
                html += '<div><span style="color:var(--text-primary);">' + a.action + '</span>';
                if (a.impact) html += '<span style="color:var(--text-muted);font-size:.72rem;"> \u2192 ' + a.impact + '</span>';
                html += '</div></div>';
            });
            html += '</div>';
        });

        if (recs.urgences.length > 0) {
            html += '<div style="padding:12px 16px;border-radius:10px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);margin-bottom:12px;">';
            html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:6px;"><i class="fas fa-clock" style="margin-right:6px;"></i>Échéances à surveiller</div>';
            recs.urgences.forEach(function(u) { html += '<div style="font-size:.75rem;color:var(--text-secondary);padding:3px 0;">' + u + '</div>'; });
            html += '</div>';
        }

        html += '</div>';

        var anchor = document.getElementById('per-av-clause-panel') || document.getElementById('fiscal-optimizations-panel') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
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
            setTimeout(renderRecommendationsPanel, 600);
        };
        console.log('[StrategyRecommendations v1.1] Loaded — + renonciation, réversion US, contrat capitalisation');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 800); });
    else setTimeout(init, 800);

    return {
        simulerChangementUnion: simulerChangementUnion,
        simulerChangementRegime: simulerChangementRegime,
        computeRenonciation: computeRenonciation,
        computeReversionUsufruit: computeReversionUsufruit,
        comparerAVCapitalisation: comparerAVCapitalisation,
        genererRecommandations: genererRecommandations,
        genererChecklist: genererChecklist
    };
})();
