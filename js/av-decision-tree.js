/**
 * av-decision-tree.js v1.0 — Arbre de decision AV corrige (expert review)
 *
 * Remplace la logique simpliste "AV > 150k + age > 70 → capi"
 * par un arbre de decision complet qui compare:
 *   1. Garder en 990I/757B (cout au deces)
 *   2. Rachats partiels optimises (cout IR+PS annuel)
 *   3. Conversion capi demembre (cout rachat + droits NP)
 *
 * Corrections critiques:
 * - PS 17.2% sur rachats meme sous abattement IR (pas 0€)
 * - 990I: si primes_av70 / nb_benef < 152500 → 0 droits → GARDER
 * - Capi: cout total = IR + PS + droits DMTG + notaire
 * - SCI locatif: PV latente a l'apport si detention < 22 ans
 *
 * @version 1.0.0 — 2026-03-18
 */
(function() {
    'use strict';

    // Expose globally for per-asset-results.js to use
    window.AVDecisionTree = {

        /**
         * Main decision: what to do with an AV contract
         * Returns { recommandation, garder, rachats, capi, alertes }
         */
        recommander: function(params) {
            var p = params || {};
            var capital = p.capital || 0;
            var primesAv70 = p.primesAv70 || 0;
            var primesAp70 = p.primesAp70 || 0;
            var gains = p.gains || Math.max(0, capital - primesAv70 - primesAp70);
            var anciennete = p.anciennete || 0;
            var situation = p.situation || 'celibataire'; // ou 'couple'
            var nbBenef = Math.max(1, p.nbBenef || 1);
            var lienBenef = p.lienBenef || 'petit_enfant';
            var ageSouscripteur = p.ageSouscripteur || 70;
            var besoinRevenus = p.besoinRevenus || false;
            var clauseDefinie = p.clauseDefinie || false;
            var abatParBenef = p.abatParBenef || 31865;
            var F = SD._fiscal;

            var alertes = [];

            // ETAPE 0: Clause beneficiaire
            if (!clauseDefinie) {
                alertes.push({
                    niveau: 'CRITIQUE',
                    message: 'Clause beneficiaire non definie. Le capital AV tombe dans la succession civile (art. L132-11). Les regimes 990I et 757B sont inapplicables.',
                    action: 'Definir immediatement la clause beneficiaire'
                });
            }

            // ============================================================
            // OPTION 1: GARDER (deces)
            // ============================================================
            var garder = this.coutGarder(capital, primesAv70, primesAp70, gains, nbBenef, lienBenef, F);

            // ============================================================
            // OPTION 2: RACHATS PARTIELS OPTIMISES
            // ============================================================
            var rachats = this.rachatPartielOptimal(capital, gains, anciennete, situation);

            // ============================================================
            // OPTION 3: CONVERSION CAPI DEMEMBRE
            // ============================================================
            var capi = this.coutConversionCapi(capital, gains, anciennete, situation, ageSouscripteur, nbBenef, abatParBenef, F);

            // ============================================================
            // DECISION
            // ============================================================
            var recommandation;

            if (garder.total === 0) {
                recommandation = {
                    choix: 'GARDER_990I',
                    label: 'Garder l\'AV (990 I)',
                    raison: 'Primes avant 70 ans (' + fmt(primesAv70) + ') / ' + nbBenef + ' benef. = ' + fmt(Math.round(primesAv70 / nbBenef)) + ' < abattement 152 500 \u20ac. Droits 990I = 0 \u20ac.',
                    conditionInversion: 'Si primes avant 70 ans > ' + fmt(152500 * nbBenef) + ' (abattement total pour ' + nbBenef + ' benef.)',
                    optionCode: 'A'
                };
            } else if (garder.total <= capi.coutTotal) {
                recommandation = {
                    choix: 'GARDER',
                    label: 'Garder l\'AV (' + (primesAp70 > 0 ? '757 B' : '990 I') + ')',
                    raison: 'Garder (' + fmt(garder.total) + ') \u2264 Capi demembre (' + fmt(capi.coutTotal) + '). L\'anteriorite fiscale (' + anciennete + ' ans) est preservee.',
                    conditionInversion: 'Si masse successorale > 2M, la creance QU (' + fmt(capi.creanceQU) + ') peut compenser le delta.',
                    delta: capi.coutTotal - garder.total,
                    optionCode: 'A'
                };
            } else {
                recommandation = {
                    choix: 'CAPI_DEMEMBRE',
                    label: 'Capi demembre (NP ' + Math.round(F.getNPRatio(ageSouscripteur) * 100) + '%)',
                    raison: 'Capi (' + fmt(capi.coutTotal) + ') < Garder (' + fmt(garder.total) + '). Creance QU ' + fmt(capi.creanceQU) + ' deductible au deces.',
                    conditionInversion: 'Si besoin revenus + perte anteriorite (nouveau capi = date 0)',
                    optionCode: 'C'
                };
                if (besoinRevenus && anciennete >= 8) {
                    alertes.push({
                        niveau: 'ATTENTION',
                        message: 'Perte anteriorite fiscale: nouveau capi = date 0. Pas d\'abattement IR sur les rachats pendant 8 ans. Si revenus necessaires, privilegier les rachats partiels.'
                    });
                }
            }

            // Score complexite
            var complexite = 'simple';
            if (primesAp70 > 0 && primesAv70 > 0) complexite = 'modere';
            if (Math.abs(garder.total - capi.coutTotal) < garder.total * 0.2) complexite = 'expert';

            return {
                garder: garder,
                rachats: rachats,
                capi: capi,
                recommandation: recommandation,
                alertes: alertes,
                complexite: complexite,
                orientationCGP: complexite === 'expert'
            };
        },

        /**
         * Cout de garder l'AV jusqu'au deces (990I + 757B)
         */
        coutGarder: function(capital, primesAv70, primesAp70, gains, nbBenef, lienBenef, F) {
            var totalPrimes = primesAv70 + primesAp70;
            if (totalPrimes === 0) totalPrimes = capital; // fallback

            // 990I: sur capital attribuable aux primes av70
            // Le capital-deces inclut les gains proportionnels
            var capitalAv70 = totalPrimes > 0 ? capital * (primesAv70 / totalPrimes) : 0;
            var parBenef990I = capitalAv70 / nbBenef;
            var droits990I = 0;

            for (var i = 0; i < nbBenef; i++) {
                var excedent = Math.max(parBenef990I - 152500, 0);
                if (excedent <= 700000) {
                    droits990I += Math.round(excedent * 0.20);
                } else {
                    droits990I += Math.round(700000 * 0.20 + (excedent - 700000) * 0.3125);
                }
            }

            // 757B: sur primes ap70 (gains exoneres)
            var base757B = Math.max(primesAp70 - 30500, 0);
            var droits757B = 0;
            if (base757B > 0) {
                var partBenef757B = base757B / nbBenef;
                var bareme = F.getBareme(lienBenef);
                for (var j = 0; j < nbBenef; j++) {
                    droits757B += F.calcDroits(partBenef757B, bareme);
                }
            }

            return {
                droits990I: droits990I,
                droits757B: droits757B,
                total: droits990I + droits757B,
                netTransmis: capital - droits990I - droits757B,
                detail: {
                    capitalAv70: Math.round(capitalAv70),
                    parBenef990I: Math.round(parBenef990I),
                    base757B: Math.round(base757B)
                }
            };
        },

        /**
         * Rachats partiels annuels optimises
         * CORRECTION: PS 17.2% s'appliquent TOUJOURS sur les gains (pas couverts par l'abattement IR)
         */
        rachatPartielOptimal: function(capital, gains, anciennete, situation) {
            if (anciennete < 8 || gains <= 0 || capital <= 0) {
                return {
                    rachatMaxAnnuel: 0,
                    psAnnuel: 0,
                    message: anciennete < 8 ? 'Contrat < 8 ans: pas d\'abattement IR' : 'Pas de gains',
                    applicable: false
                };
            }

            var abatIR = (situation === 'couple') ? 9200 : 4600;
            var ratio = gains / capital;
            if (ratio <= 0) return { rachatMaxAnnuel: 0, psAnnuel: 0, applicable: false };

            var rachatMax = Math.round(abatIR / ratio);
            var gainsDansRachat = Math.round(rachatMax * ratio); // = abatIR

            // CORRECTION CRITIQUE: PS s'appliquent sur la totalite des gains dans le rachat
            // L'abattement 4600/9200 ne couvre que l'IR (12.8%), pas les PS (17.2%)
            var irAnnuel = 0; // couvert par abattement
            var psAnnuel = Math.round(gainsDansRachat * 0.172); // PS NON couverts

            return {
                rachatMaxAnnuel: rachatMax,
                gainsDansRachat: gainsDansRachat,
                irAnnuel: irAnnuel,
                psAnnuel: psAnnuel,
                coutAnnuel: psAnnuel,
                ratio: Math.round(ratio * 1000) / 1000,
                abatIR: abatIR,
                applicable: true,
                sur10ans: {
                    totalRachete: rachatMax * 10,
                    totalPS: psAnnuel * 10,
                    netDistribue: (rachatMax - psAnnuel) * 10
                },
                message: 'Rachat max ' + fmt(rachatMax) + '/an (gains ' + fmt(gainsDansRachat) + ' \u2264 abat. ' + fmt(abatIR) + '). IR = 0\u20ac. PS = ' + fmt(psAnnuel) + '/an (17,2% sur gains).'
            };
        },

        /**
         * Cout total de la conversion en capi demembre
         */
        coutConversionCapi: function(capital, gains, anciennete, situation, ageDonateur, nbBenef, abatParBenef, F) {
            // 1. Cout rachat total
            var abatIR = (anciennete >= 8) ? ((situation === 'couple') ? 9200 : 4600) : 0;
            var gainsImposablesIR = Math.max(gains - abatIR, 0);
            var irRachat = Math.round(gainsImposablesIR * 0.128);
            var psRachat = Math.round(gains * 0.172);
            var coutRachat = irRachat + psRachat;

            // 2. Net pour capi
            var netCapi = capital - coutRachat;

            // 3. NP
            var npPct = F.getNPRatio(ageDonateur);
            var valeurNP = Math.round(netCapi * npPct);
            var valeurUS = netCapi - valeurNP;

            // 4. Droits DMTG
            var droitsDMTG = 0;
            var bareme = F.getBareme('petit_enfant') || F.getBareme('enfant');
            for (var i = 0; i < nbBenef; i++) {
                var partNP = Math.round(valeurNP / nbBenef);
                var base = Math.max(partNP - abatParBenef, 0);
                droitsDMTG += F.calcDroits(base, bareme);
            }

            // 5. Frais notaire (approximation emoluments proportionnels)
            var fraisNotaire = Math.round(Math.max(valeurNP * 0.015, 1500) + 500);

            // 6. Enregistrement convention quasi-usufruit
            var fraisQU = 125;

            var coutTotal = coutRachat + droitsDMTG + fraisNotaire + fraisQU;

            return {
                irRachat: irRachat,
                psRachat: psRachat,
                coutRachat: coutRachat,
                netCapi: Math.round(netCapi),
                npPct: Math.round(npPct * 100),
                valeurNP: valeurNP,
                valeurUS: Math.round(valeurUS),
                droitsDMTG: droitsDMTG,
                fraisNotaire: fraisNotaire,
                fraisQU: fraisQU,
                coutTotal: coutTotal,
                creanceQU: Math.round(valeurUS),
                netTransmis: Math.round(netCapi) // PP a terme
            };
        },

        /**
         * Verifie si une SCI est pertinente pour un bien
         * Retourne { pertinent, raisons, risques, pvLatente }
         */
        sciPertinente: function(params) {
            var p = params || {};
            var valeur = p.valeur || 0;
            var prixAcquisition = p.prixAcquisition || 0;
            var anneeAcquisition = p.anneeAcquisition || 2020;
            var isRP = p.isRP || false;
            var isMeuble = p.isMeuble || false;
            var nbBiens = p.nbBiensSCI || 1;
            var objectifControle = p.objectifControle || false;

            var raisons = [];
            var risques = [];
            var pertinent = true;
            var anneesCourante = 2026;
            var detention = anneesCourante - anneeAcquisition;

            // RP: JAMAIS
            if (isRP) {
                pertinent = false;
                risques.push('Perte exoneration PV residence principale (art. 150 U II CGI)');
                risques.push('Perte abattement 30% IFI sur RP');
                risques.push('Bien devient actif SCI, pas RP au sens fiscal');
                return { pertinent: false, raisons: [], risques: risques, pvLatente: 0, message: 'RP dans SCI: DECONSEILLE. Perte exo PV + IFI.' };
            }

            // Meuble + SCI IR
            if (isMeuble) {
                risques.push('SCI IR + location meublee > 10% CA = requalification IS');
                risques.push('Requalification IS: perte regime PV des particuliers');
            }

            // PV latente a l'apport
            var pvBrute = Math.max(0, valeur - prixAcquisition);
            var pvImposable = 0;
            if (pvBrute > 0 && detention < 22) {
                // Abattement PV immo IR
                var abatIR = 0;
                if (detention >= 6) abatIR = Math.min((detention - 5) * 0.06, 1.0);
                if (detention >= 22) abatIR = 1.0;
                // Abattement PV immo PS
                var abatPS = 0;
                if (detention >= 6 && detention <= 21) abatPS = (detention - 5) * 0.0165;
                else if (detention === 22) abatPS = 0.28;
                else if (detention > 22 && detention <= 30) abatPS = 0.28 + (detention - 22) * 0.09;
                else if (detention > 30) abatPS = 1.0;

                var pvNetteIR = Math.round(pvBrute * (1 - abatIR));
                var pvNettePS = Math.round(pvBrute * (1 - abatPS));
                var impotIR = Math.round(pvNetteIR * 0.19);
                var impotPS = Math.round(pvNettePS * 0.172);
                pvImposable = impotIR + impotPS;

                if (pvImposable > 0) {
                    risques.push('PV latente a l\'apport: ' + fmt(pvBrute) + ' brute, impot ' + fmt(pvImposable) + ' (detention ' + detention + ' ans, abat. IR ' + Math.round(abatIR * 100) + '%)');
                }
            }

            // Valeur seuil
            if (valeur < 300000 && !objectifControle) {
                pertinent = false;
                raisons.push('Valeur < 300k: couts fixes SCI (~4-6k creation + ~1-1.5k/an) disproportionnes');
            }

            // Mono-bien
            if (nbBiens === 1) {
                risques.push('SCI mono-bien: decote limitee (10-15%), contestable par l\'administration');
            }

            // Decote estimee
            var decote = nbBiens >= 2 ? 0.15 : 0.10;
            var economieDMTG = Math.round(valeur * decote * 0.60 * 0.20); // NP 60% × taux marginal 20%
            var coutsFixes10ans = 4000 + 1100 * 10 + pvImposable; // creation + 10 ans compta + PV

            if (economieDMTG < coutsFixes10ans) {
                pertinent = false;
                raisons.push('Economie DMTG (' + fmt(economieDMTG) + ') < couts fixes 10 ans (' + fmt(coutsFixes10ans) + ')');
            } else {
                raisons.push('Economie DMTG (' + fmt(economieDMTG) + ') > couts fixes (' + fmt(coutsFixes10ans) + ')');
            }

            if (objectifControle) {
                raisons.push('Controle via gerance SCI (objectif active)');
                if (!pertinent && valeur >= 200000) pertinent = true; // override si controle voulu
            }

            return {
                pertinent: pertinent,
                raisons: raisons,
                risques: risques,
                pvLatente: pvImposable,
                pvBrute: pvBrute,
                detention: detention,
                decote: decote,
                economieDMTG: economieDMTG,
                coutsFixes10ans: coutsFixes10ans,
                message: pertinent ? 'SCI pertinente' : 'SCI non recommandee pour ce bien'
            };
        }
    };

    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    console.log('[AVDecisionTree v1.0] Loaded — arbre decision AV + SCI pertinence');
})();
