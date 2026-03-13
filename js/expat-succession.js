/**
 * expat-succession.js — Successions internationales & cas spéciaux
 *
 * 1. Divorcé : ex-conjoint = tiers 60%, sauf si divorce non prononcé
 * 2. Barèmes succession pays EU (15 pays + comparatif)
 * 3. Règlement UE 650/2012 : loi du dernier pays de résidence
 * 4. Option testament "loi française" (art. 22)
 * 5. Certificat successoral européen (~120€)
 *
 * @version 1.0.0 — 2026-03-13
 */
const ExpatSuccession = (function() {
    'use strict';

    // ============================================================
    // 1. DIVORCÉ — Ex-conjoint = tiers fiscal
    // ============================================================

    /**
     * Calcule les droits pour un ex-conjoint (divorcé).
     * Divorcé = tiers fiscal (60%, abat. 1 594€).
     * SAUF si divorce non encore prononcé → droits de conjoint maintenus.
     *
     * @param {Object} params
     * @param {number} params.montant - Montant du legs testamentaire
     * @param {boolean} params.divorcePrononce - true si divorce définitif
     * @param {boolean} params.separationCorps - true si jugement de séparation
     * @returns {Object}
     */
    function computeDivorce(params) {
        var p = params || {};
        var montant = p.montant || 0;
        var divorcePrononce = p.divorcePrononce !== false; // true par défaut
        var separationCorps = !!p.separationCorps;

        if (!divorcePrononce) {
            // Divorce en cours ou séparation de corps → droits conjoint maintenus
            return {
                statut: separationCorps ? 'separation_corps' : 'divorce_en_cours',
                bareme: 'conjoint',
                abattement: 0,
                exonere: true,
                droits: 0,
                explanation: separationCorps
                    ? 'Séparation de corps : les droits successoraux du conjoint sont MAINTENUS. Exonéré (art. 796-0 bis CGI).'
                    : 'Divorce non encore prononcé : les droits successoraux du conjoint sont MAINTENUS jusqu\'au jugement définitif.',
                warnings: ['Le divorce doit être définitivement prononcé pour que l\'ex-conjoint perde ses droits successoraux.'],
                article: 'Art. 732 CC'
            };
        }

        // Divorce prononcé → tiers fiscal
        var base = Math.max(0, montant - 1594);
        var droits = Math.round(base * 0.60);

        return {
            statut: 'divorce_prononce',
            bareme: 'tiers',
            abattement: 1594,
            exonere: false,
            droits: droits,
            montantTransmis: montant,
            baseImposable: base,
            tauxEffectif: montant > 0 ? Math.round((droits / montant) * 100) : 0,
            explanation: 'Ex-conjoint (divorcé) = TIERS fiscal. Taxé à 60% après abat. 1 594€. ' +
                'Sur ' + fmt(montant) + ' : droits = ' + fmt(droits) + ' (' + Math.round((droits / Math.max(1, montant)) * 100) + '%).\n' +
                'Aucun droit successoral automatique. Uniquement par testament (legs).',
            alternatives: [
                'Assurance-vie (art. 990 I) : abat. 152 500€ puis 20%/31,25% — bien plus avantageux',
                'Donation avant divorce : attention à la révocabilité',
                'Prestation compensatoire : exonérée de droits si versée dans les 12 mois'
            ],
            warnings: [
                'L\'ex-conjoint ne peut recevoir que par testament (legs). Il n\'est PLUS héritier légal.',
                'Le legs à l\'ex-conjoint est limité à la quotité disponible (si enfants).'
            ],
            article: 'Art. 732 CC + art. 777 CGI (barème tiers)'
        };
    }

    // ============================================================
    // 2. BARÈMES SUCCESSION PAR PAYS EU
    // ============================================================

    var PAYS_EU = {
        france: {
            nom: 'France', code: 'FR', emoji: '🇫🇷',
            conjoint_exonere: true,
            taux_enfants_min: 5, taux_enfants_max: 45,
            abattement_enfant: 100000,
            reserve_hereditaire: true,
            note: 'Barème progressif 5-45%. Conjoint/pacsé exonéré. Réserve héréditaire protège les enfants.',
            avantage: 'Conjoint exonéré, abattements généreux',
            inconvenient: 'Taux marginal élevé (45%)'
        },
        allemagne: {
            nom: 'Allemagne', code: 'DE', emoji: '🇩🇪',
            conjoint_exonere: false,
            taux_enfants_min: 7, taux_enfants_max: 30,
            taux_conjoint_min: 7, taux_conjoint_max: 30,
            abattement_enfant: 400000,
            abattement_conjoint: 500000,
            reserve_hereditaire: true,
            note: 'Abattements très élevés (400k enfant, 500k conjoint) mais conjoint taxé. Barème 7-30%.',
            avantage: 'Abattements très élevés',
            inconvenient: 'Conjoint taxé (7-30%)'
        },
        belgique: {
            nom: 'Belgique', code: 'BE', emoji: '🇧🇪',
            conjoint_exonere: false,
            taux_enfants_min: 3, taux_enfants_max: 30,
            taux_conjoint_min: 3, taux_conjoint_max: 30,
            abattement_enfant: 0,
            abattement_conjoint: 0,
            reserve_hereditaire: true,
            note: 'Barème régional (Flandre/Wallonie/Bruxelles). Pas d\'abattement mais taux plus bas. Conjoint taxé.',
            avantage: 'Taux plus bas (3-30%)',
            inconvenient: 'Pas d\'abattement, conjoint taxé'
        },
        espagne: {
            nom: 'Espagne', code: 'ES', emoji: '🇪🇸',
            conjoint_exonere: false,
            taux_enfants_min: 7.65, taux_enfants_max: 34,
            taux_conjoint_min: 7.65, taux_conjoint_max: 34,
            abattement_enfant: 15957,
            reserve_hereditaire: true,
            note: 'Conjoint droits restreints. Abattements régionaux variables. Taux 7,65-34%.',
            avantage: 'Exonérations régionales (Madrid, Andalousie...)',
            inconvenient: 'Conjoint droits successoraux limités'
        },
        italie: {
            nom: 'Italie', code: 'IT', emoji: '🇮🇹',
            conjoint_exonere: false,
            taux_enfants_min: 4, taux_enfants_max: 4,
            taux_conjoint_min: 4, taux_conjoint_max: 4,
            abattement_enfant: 1000000,
            abattement_conjoint: 1000000,
            reserve_hereditaire: true,
            note: 'Taux très bas (4% ligne directe). Abattement 1M€. Enfants moins protégés par la réserve.',
            avantage: 'Taux 4% + abattement 1M€',
            inconvenient: 'Réserve héréditaire réduite'
        },
        portugal: {
            nom: 'Portugal', code: 'PT', emoji: '🇵🇹',
            conjoint_exonere: true,
            taux_enfants_min: 0, taux_enfants_max: 0,
            abattement_enfant: null,
            reserve_hereditaire: true,
            note: 'Conjoint et descendants EXONÉRÉS (droit de timbre 10% seulement sur immobilier). Paradis successoral.',
            avantage: '0% pour conjoint et enfants',
            inconvenient: '10% timbre sur immobilier'
        },
        suede: {
            nom: 'Suède', code: 'SE', emoji: '🇸🇪',
            conjoint_exonere: true,
            taux_enfants_min: 0, taux_enfants_max: 0,
            abattement_enfant: null,
            reserve_hereditaire: false,
            note: 'Droits de succession SUPPRIMÉS en 2005. Aucune taxe. Mais pas de réserve héréditaire !',
            avantage: '0% de droits',
            inconvenient: 'Pas de réserve héréditaire (enfants non protégés)'
        },
        pays_bas: {
            nom: 'Pays-Bas', code: 'NL', emoji: '🇳🇱',
            conjoint_exonere: false,
            taux_enfants_min: 10, taux_enfants_max: 20,
            taux_conjoint_min: 10, taux_conjoint_max: 20,
            abattement_enfant: 22918,
            abattement_conjoint: 723526,
            reserve_hereditaire: false,
            note: 'Barème 10-20%. Abattement conjoint très élevé (723k€). Pas de réserve héréditaire.',
            avantage: 'Abattement conjoint 723k€',
            inconvenient: 'Taux 10-20%, pas de réserve'
        },
        autriche: {
            nom: 'Autriche', code: 'AT', emoji: '🇦🇹',
            conjoint_exonere: true,
            taux_enfants_min: 0, taux_enfants_max: 0,
            abattement_enfant: null,
            reserve_hereditaire: true,
            note: 'Droits de succession supprimés en 2008. Aucune taxe successorale.',
            avantage: '0% de droits',
            inconvenient: 'Aucun'
        },
        grece: {
            nom: 'Grèce', code: 'GR', emoji: '🇬🇷',
            conjoint_exonere: false,
            taux_enfants_min: 1, taux_enfants_max: 10,
            taux_conjoint_min: 1, taux_conjoint_max: 10,
            abattement_enfant: 150000,
            abattement_conjoint: 150000,
            reserve_hereditaire: true,
            note: 'Taux très bas (1-10%). Abattement 150k€. Réserve héréditaire protège enfants et conjoint.',
            avantage: 'Taux très bas',
            inconvenient: 'Abattement modéré'
        },
        luxembourg: {
            nom: 'Luxembourg', code: 'LU', emoji: '🇱🇺',
            conjoint_exonere: false,
            taux_enfants_min: 0, taux_enfants_max: 2.5,
            taux_conjoint_min: 5, taux_conjoint_max: 5,
            abattement_enfant: 0,
            reserve_hereditaire: true,
            note: 'Ligne directe : 0-2,5%. Conjoint : 5%. Taux très avantageux.',
            avantage: 'Taux très bas (0-2,5% LD)',
            inconvenient: 'Conjoint taxé à 5%'
        },
        suisse: {
            nom: 'Suisse', code: 'CH', emoji: '🇨🇭',
            conjoint_exonere: true,
            taux_enfants_min: 0, taux_enfants_max: 0,
            abattement_enfant: null,
            reserve_hereditaire: true,
            note: 'Conjoint et descendants exonérés dans la plupart des cantons. Taux cantonal variable.',
            avantage: 'Exonéré dans la majorité des cantons',
            inconvenient: 'Varie selon le canton'
        },
        uk: {
            nom: 'Royaume-Uni', code: 'GB', emoji: '🇬🇧',
            conjoint_exonere: true,
            taux_enfants_min: 40, taux_enfants_max: 40,
            abattement_enfant: 325000,
            reserve_hereditaire: false,
            note: 'Taux unique 40% au-dessus de 325k£ (~380k€). Conjoint exonéré. Pas de réserve héréditaire.',
            avantage: 'Conjoint exonéré, abattement 325k£',
            inconvenient: 'Taux 40% unique, pas de réserve'
        },
        bulgarie: {
            nom: 'Bulgarie', code: 'BG', emoji: '🇧🇬',
            conjoint_exonere: true,
            taux_enfants_min: 0, taux_enfants_max: 0,
            abattement_enfant: null,
            reserve_hereditaire: true,
            note: 'Ligne directe et conjoint exonérés. Collatéraux : 0,4-0,8%.',
            avantage: '0% pour famille directe',
            inconvenient: 'Aucun'
        },
        finlande: {
            nom: 'Finlande', code: 'FI', emoji: '🇫🇮',
            conjoint_exonere: false,
            taux_enfants_min: 7, taux_enfants_max: 19,
            taux_conjoint_min: 7, taux_conjoint_max: 19,
            abattement_enfant: 20000,
            abattement_conjoint: 90000,
            reserve_hereditaire: true,
            note: 'Barème 7-19%. Conjoint taxé mais abattement 90k€.',
            avantage: 'Taux modérés',
            inconvenient: 'Conjoint taxé'
        }
    };

    function getBaremePays(codeOuNom) {
        var key = (codeOuNom || '').toLowerCase().replace(/[^a-z_]/g, '');
        if (PAYS_EU[key]) return PAYS_EU[key];
        // Chercher par code
        for (var k in PAYS_EU) {
            if (PAYS_EU[k].code.toLowerCase() === key) return PAYS_EU[k];
        }
        return null;
    }

    function getListePays() {
        var liste = [];
        for (var k in PAYS_EU) {
            liste.push({ key: k, nom: PAYS_EU[k].nom, emoji: PAYS_EU[k].emoji, code: PAYS_EU[k].code });
        }
        return liste.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
    }

    /**
     * Compare la fiscalité française avec celle d'un pays donné.
     */
    function comparerAvecFrance(paysKey, montant, nbEnfants) {
        var pays = getBaremePays(paysKey);
        if (!pays) return null;
        var france = PAYS_EU.france;
        var F = SD._fiscal;
        var nEnf = Math.max(1, nbEnfants || 1);

        // Droits France
        var partFR = montant / nEnf;
        var droitsFR = F.calcDroits(Math.max(0, partFR - france.abattement_enfant), F.getBareme('enfant')) * nEnf;

        // Droits pays (estimation simplifiée)
        var abatPays = pays.abattement_enfant || 0;
        var tauxMoyenPays = (pays.taux_enfants_min + pays.taux_enfants_max) / 2 / 100;
        var droitsPays = Math.round(Math.max(0, montant - abatPays * nEnf) * tauxMoyenPays);
        if (pays.taux_enfants_max === 0) droitsPays = 0;

        var delta = droitsFR - droitsPays;

        return {
            pays: pays,
            france: { droits: droitsFR, abattement: france.abattement_enfant, taux: france.taux_enfants_min + '-' + france.taux_enfants_max + '%' },
            etranger: { droits: droitsPays, abattement: abatPays, taux: pays.taux_enfants_min + '-' + pays.taux_enfants_max + '%' },
            delta: delta,
            plusAvantageux: delta > 0 ? paysKey : 'france',
            economie: Math.abs(delta),
            montant: montant,
            nbEnfants: nEnf
        };
    }

    // ============================================================
    // 3. RÈGLEMENT UE 650/2012 — Loi résidence
    // ============================================================

    /**
     * Détermine quelle loi s'applique et les options disponibles.
     *
     * @param {Object} params
     * @param {string} params.nationalite - 'FR', 'DE', etc.
     * @param {string} params.paysResidence - Pays de résidence du défunt
     * @param {boolean} params.optionLoiNationale - true si testament choisit loi nationale
     * @param {string} params.paysConjoint - Pays de résidence du conjoint (optionnel)
     * @returns {Object}
     */
    function computeLoiApplicable(params) {
        var p = params || {};
        var nationalite = (p.nationalite || 'FR').toUpperCase();
        var paysResidence = (p.paysResidence || 'FR').toUpperCase();
        var optionLoi = !!p.optionLoiNationale;
        var paysConjoint = (p.paysConjoint || '').toUpperCase();

        var memesPays = nationalite === paysResidence;
        var paysExclus = ['DK', 'IE']; // Danemark et Irlande n'ont pas ratifié
        var isPaysExclu = paysExclus.indexOf(paysResidence) >= 0;

        var loiApplicable = optionLoi ? nationalite : paysResidence;
        var warnings = [];
        var conseils = [];

        if (memesPays) {
            return {
                loiApplicable: nationalite,
                reglementUE: false,
                explanation: 'Résidence et nationalité dans le même pays (' + nationalite + '). Pas de conflit de lois.',
                warnings: [],
                conseils: [],
                certificatUtile: false
            };
        }

        if (isPaysExclu) {
            warnings.push('⚠️ ' + paysResidence + ' n\'a pas ratifié le règlement UE 650/2012. Les biens immobiliers sont soumis à la loi du pays où ils sont situés.');
        }

        // Comparer les fiscalités
        var residenceInfo = getBaremePays(paysResidence);
        var nationInfo = getBaremePays(nationalite);

        if (!optionLoi && nationalite === 'FR') {
            // Français résidant à l'étranger SANS option → loi étrangère s'applique
            warnings.push('\u26a0\ufe0f Loi de ' + paysResidence + ' s\'applique à TOUTE la succession (y compris biens en France).');

            if (residenceInfo && !residenceInfo.reserve_hereditaire) {
                warnings.push('\ud83d\udea8 ATTENTION : ' + residenceInfo.nom + ' n\'a PAS de réserve héréditaire. Vos enfants pourraient être déshérités !');
                conseils.push('URGENT : ajoutez dans votre testament la clause "loi française" (art. 22 règlement UE 650/2012) pour protéger vos enfants.');
            }

            if (residenceInfo && residenceInfo.conjoint_exonere === false && nationInfo && nationInfo.conjoint_exonere === true) {
                warnings.push('\u26a0\ufe0f En ' + residenceInfo.nom + ', le conjoint est TAXÉ (contrairement à la France). Impact potentiel significatif.');
            }

            conseils.push('Rédigez un testament avec mention : "Je soumets l\'ensemble de ma succession à la loi française" (art. 22 du règlement UE 650/2012).');
        }

        if (optionLoi && nationalite === 'FR') {
            conseils.push('✅ Loi française choisie par testament. Réserve héréditaire protégée. Conjoint exonéré.');
            conseils.push('Attention : la FISCALITÉ reste celle du pays où se trouvent les biens. Seules les règles CIVILES (répartition) suivent la loi française.');
        }

        // Conjoint à l'étranger
        if (paysConjoint && paysConjoint !== paysResidence && paysConjoint !== nationalite) {
            warnings.push('\u2139\ufe0f Conjoint réside en ' + paysConjoint + '. Possible conflit de lois sur le régime matrimonial.');
            conseils.push('Consultez un notaire international pour déterminer la loi applicable au régime matrimonial.');
        }

        return {
            loiApplicable: loiApplicable,
            loiResidence: paysResidence,
            loiNationale: nationalite,
            reglementUE: true,
            optionLoiNationale: optionLoi,
            explanation: optionLoi
                ? 'Loi ' + nationalite + ' choisie par testament (art. 22 règlement UE 650/2012). Règles civiles françaises s\'appliquent.'
                : 'Loi de résidence ' + paysResidence + ' s\'applique (règlement UE 650/2012). Toute la succession suit cette loi.',
            warnings: warnings,
            conseils: conseils,
            certificatUtile: true,
            certificatCout: 120,
            certificatExplanation: 'Certificat successoral européen (~120€) : permet de faire reconnaître ses droits dans tous les pays signataires sans procédure de traduction/certification.',
            article: 'Règlement UE n°650/2012 du 4 juillet 2012 — art. 21 (loi résidence) + art. 22 (option loi nationale)'
        };
    }

    // ============================================================
    // 4. RENDU — Panneau dans step 5
    // ============================================================

    function renderExpatPanel() {
        var state = getState();
        if (!state) return;
        var existing = document.getElementById('expat-succession-panel');
        if (existing) existing.remove();

        var html = '';
        var hasContent = false;

        // Détecter si résidence étranger est renseignée
        var residenceEtranger = state._residenceEtranger || null;
        var nationalite = state._nationalite || 'FR';

        if (residenceEtranger && residenceEtranger !== 'FR') {
            hasContent = true;
            var loi = computeLoiApplicable({
                nationalite: nationalite,
                paysResidence: residenceEtranger,
                optionLoiNationale: state._optionLoiFrancaise || false,
                paysConjoint: state._paysConjoint || ''
            });

            // Panneau loi applicable
            html += '<div style="padding:16px 18px;border-radius:12px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.15);margin-bottom:12px;">';
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><i class="fas fa-globe-europe" style="color:var(--accent-blue);font-size:1rem;"></i>';
            html += '<strong style="font-size:.88rem;">Succession internationale — Règlement UE 650/2012</strong></div>';
            html += '<div style="font-size:.80rem;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;">' + loi.explanation + '</div>';

            // Warnings
            loi.warnings.forEach(function(w) {
                var isAlert = w.indexOf('ATTENTION') >= 0 || w.indexOf('\ud83d\udea8') >= 0;
                html += '<div style="padding:8px 12px;border-radius:8px;margin-bottom:6px;font-size:.78rem;background:' + (isAlert ? 'rgba(255,107,107,.06)' : 'rgba(255,179,0,.06)') + ';border:1px solid ' + (isAlert ? 'rgba(255,107,107,.15)' : 'rgba(255,179,0,.15)') + ';color:var(--text-secondary);">' + w + '</div>';
            });

            // Conseils
            loi.conseils.forEach(function(c) {
                html += '<div style="padding:8px 12px;border-radius:8px;margin-bottom:6px;font-size:.78rem;background:rgba(16,185,129,.06);border-left:3px solid var(--accent-green);color:var(--text-secondary);">' + c + '</div>';
            });

            // Comparatif fiscal
            var F = SD._fiscal, pat = F.computePatrimoine();
            var nbEnf = (state.beneficiaries || []).filter(function(b) { return b.lien === 'enfant'; }).length || 1;
            var comp = comparerAvecFrance(residenceEtranger, pat.actifNet, nbEnf);
            if (comp) {
                html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.1);margin-top:10px;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;">';
                html += '<thead><tr style="background:rgba(198,134,66,.04);"><th style="padding:8px 12px;text-align:left;">Critère</th><th style="padding:8px 12px;text-align:right;">🇫🇷 France</th><th style="padding:8px 12px;text-align:right;">' + comp.pays.emoji + ' ' + comp.pays.nom + '</th></tr></thead><tbody>';
                html += '<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(198,134,66,.05);">Taux enfants</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + comp.france.taux + '</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + comp.etranger.taux + '</td></tr>';
                html += '<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(198,134,66,.05);">Abattement/enfant</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(comp.france.abattement) + '</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + (comp.etranger.abattement ? fmt(comp.etranger.abattement) : 'N/A') + '</td></tr>';
                html += '<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(198,134,66,.05);">Conjoint exonéré</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">Oui</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + (comp.pays.conjoint_exonere ? 'Oui' : 'Non') + '</td></tr>';
                html += '<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(198,134,66,.05);">Réserve héréditaire</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">Oui</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + (comp.pays.reserve_hereditaire ? 'Oui' : '\u26a0\ufe0f Non') + '</td></tr>';
                html += '<tr style="font-weight:700;border-top:2px solid rgba(198,134,66,.15);"><td style="padding:10px 12px;">Droits estimés</td><td style="padding:10px 12px;text-align:right;">' + fmt(comp.france.droits) + '</td><td style="padding:10px 12px;text-align:right;color:' + (comp.delta > 0 ? 'var(--accent-green)' : 'var(--accent-coral)') + ';">' + fmt(comp.etranger.droits) + '</td></tr>';
                html += '</tbody></table></div>';
                if (comp.delta !== 0) {
                    var mieux = comp.delta > 0 ? comp.pays.emoji + ' ' + comp.pays.nom : '🇫🇷 France';
                    html += '<div style="text-align:center;margin-top:8px;font-size:.78rem;color:' + (comp.delta > 0 ? 'var(--accent-green)' : 'var(--accent-coral)') + ';font-weight:600;">' + mieux + ' plus avantageux de ' + fmt(comp.economie) + '</div>';
                }
            }

            // Certificat
            if (loi.certificatUtile) {
                html += '<div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.04);font-size:.75rem;color:var(--text-muted);">';
                html += '<i class="fas fa-file-alt" style="color:var(--primary-color);margin-right:6px;"></i>' + loi.certificatExplanation;
                html += '</div>';
            }

            html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:8px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + loi.article + '</div>';
            html += '</div>';
        }

        // Divorcé
        if (state._exConjointLegs && state._exConjointLegs > 0) {
            hasContent = true;
            var div = computeDivorce({ montant: state._exConjointLegs, divorcePrononce: state._divorcePrononce !== false });
            html += '<div style="padding:16px 18px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.15);margin-bottom:12px;">';
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><i class="fas fa-user-slash" style="color:var(--accent-coral);"></i>';
            html += '<strong style="font-size:.85rem;">Ex-conjoint (divorcé) — ' + (div.exonere ? 'Droits maintenus' : 'Tiers fiscal 60%') + '</strong>';
            if (!div.exonere) html += '<span style="padding:3px 10px;border-radius:15px;font-size:.72rem;font-weight:700;color:var(--accent-coral);background:rgba(255,107,107,.1);">Droits : ' + fmt(div.droits) + '</span>';
            html += '</div>';
            html += '<div style="font-size:.78rem;color:var(--text-secondary);line-height:1.6;">' + div.explanation + '</div>';
            if (div.alternatives) {
                html += '<div style="margin-top:8px;font-size:.75rem;color:var(--text-muted);">';
                html += '<strong>Alternatives :</strong><br>';
                div.alternatives.forEach(function(a) { html += '• ' + a + '<br>'; });
                html += '</div>';
            }
            html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;"><i class="fas fa-gavel" style="margin-right:4px;"></i>' + div.article + '</div>';
            html += '</div>';
        }

        if (!hasContent) return;

        var panel = '<div class="section-card" id="expat-succession-panel" style="border-color:rgba(59,130,246,.2);margin-bottom:20px;">';
        panel += '<div class="section-title"><i class="fas fa-globe-europe" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> International & cas spéciaux</div>';
        panel += html + '</div>';

        var anchor = document.getElementById('inheritance-rules-panel') || document.getElementById('fiscal-optimizations-panel') || document.getElementById('results-warnings');
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
            setTimeout(renderExpatPanel, 450);
        };
        console.log('[ExpatSuccession v1] Loaded — divorcé, barèmes EU, règlement 650/2012');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 600); });
    else setTimeout(init, 600);

    return {
        computeDivorce: computeDivorce,
        getBaremePays: getBaremePays,
        getListePays: getListePays,
        comparerAvecFrance: comparerAvecFrance,
        computeLoiApplicable: computeLoiApplicable,
        PAYS_EU: PAYS_EU
    };
})();
