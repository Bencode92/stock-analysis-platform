/**
 * civil-rights.js — Module droits civils du conjoint survivant
 * 
 * Corrige 3 lacunes dans le moteur succession/donation :
 * 1. Part civile du conjoint (art. 757 CC) — calcul de l'assiette taxable
 * 2. Distinction Mariage / PACS / Concubinage (unionType)
 * 3. Warnings famille recomposée (beaux-enfants = tiers fiscal 60%)
 *
 * v2.0 : Intégration DANS le calcul (pas seulement warnings)
 *   - Recalcule l'assiette taxable enfants selon la part civile du conjoint
 *   - Injecte un panneau "Succession corrigée (droits civils)" dans step 5
 *   - Compare avec le scénario brut pour montrer l'impact
 *
 * Réf. juridiques :
 *   - Art. 757, 757-1, 758-5, 763, 764 Code civil (conjoint marié)
 *   - Art. 515-6 CC (PACS)
 *   - Art. 913 CC (réserve héréditaire / quotité disponible)
 *   - Art. 1094-1 CC (donation au dernier vivant)
 *   - Art. 796-0 bis CGI (exonération DMTG conjoint/pacsé)
 *   - Art. 669 CGI (valorisation NP en cas d'usufruit conjoint)
 *
 * Charge APRÈS successions-donations.js et path-optimizer.js
 * @version 2.0.0 — 2026-03-13
 */
const CivilRights = (function() {
    'use strict';

    // ============================================================
    // 1. CONSTANTES DROIT CIVIL (Code civil, pas CGI)
    // ============================================================

    /**
     * Art. 913 CC — Réserve héréditaire
     */
    function getQuotiteDisponible(nbEnfants) {
        if (nbEnfants <= 0) return 1;
        if (nbEnfants === 1) return 0.50;
        if (nbEnfants === 2) return 1 / 3;
        return 0.25;
    }

    // ============================================================
    // 2. UNION TYPE — Extension de FamilyGraph
    // ============================================================

    var unionTypes = {};

    function getUnionKey(id1, id2) {
        return Math.min(+id1, +id2) + '-' + Math.max(+id1, +id2);
    }

    function setUnionType(id1, id2, type) {
        unionTypes[getUnionKey(id1, id2)] = type || 'mariage';
    }

    function getUnionType(id1, id2) {
        return unionTypes[getUnionKey(id1, id2)] || 'mariage';
    }

    if (typeof FamilyGraph !== 'undefined') {
        FamilyGraph.setUnionType = setUnionType;
        FamilyGraph.getUnionType = getUnionType;
    }

    // ============================================================
    // 3. CALCUL PART CIVILE DU CONJOINT SURVIVANT
    // ============================================================

    function computeConjointCivilShare(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var hasDDV = !!p.hasDDV;
        var hasTestament = !!p.hasTestament;
        var nbEnfants = p.nbEnfants || 0;
        var hasEnfantsAutreLit = !!p.hasEnfantsAutreLit;
        var conjointOption = p.conjointOption || 'pp';

        var result = {
            ppFraction: 0,
            usufruitFraction: 0,
            npFractionChildren: 1,
            explanation: '',
            warnings: [],
            civilArticle: ''
        };

        // ── CONCUBINAGE ──────────────────────────────────────────
        if (unionType === 'concubinage') {
            if (!hasTestament) {
                result.explanation = 'Concubin sans testament : aucun droit successoral. Les enfants h\u00e9ritent de 100%.';
                result.warnings.push('\u26a0\ufe0f Le concubin survivant ne recevra RIEN sans testament. Envisagez un testament ou une assurance-vie.');
                result.civilArticle = 'Aucun article \u2014 le concubinage n\'ouvre aucun droit successoral';
            } else {
                var qd = getQuotiteDisponible(nbEnfants);
                result.ppFraction = qd;
                result.npFractionChildren = 1 - qd;
                result.explanation = 'Concubin avec testament : re\u00e7oit la quotit\u00e9 disponible (' + Math.round(qd * 100) + '% PP). ATTENTION : tax\u00e9 \u00e0 60% (tiers fiscal).';
                result.warnings.push('\u26a0\ufe0f Legs au concubin tax\u00e9 \u00e0 60% sur ' + Math.round(qd * 100) + '% du patrimoine. L\'assurance-vie (art. 990 I) est bien plus efficace.');
                result.civilArticle = 'Art. 913 CC (quotit\u00e9 disponible)';
            }
            return result;
        }

        // ── PACS ─────────────────────────────────────────────────
        if (unionType === 'pacs') {
            if (!hasTestament) {
                result.explanation = 'Partenaire pacs\u00e9 sans testament : aucun droit successoral (art. 515-6 CC). Seul droit : jouissance gratuite du logement pendant 1 an.';
                result.warnings.push('\ud83d\udea8 Le pacs\u00e9 survivant ne recevra RIEN de la succession sans testament ! Droit au logement limit\u00e9 \u00e0 1 an. R\u00e9digez un testament ou souscrivez une assurance-vie.');
                result.civilArticle = 'Art. 515-6 CC';
            } else {
                var qdp = getQuotiteDisponible(nbEnfants);
                result.ppFraction = qdp;
                result.npFractionChildren = 1 - qdp;
                result.explanation = 'Pacs\u00e9 avec testament : re\u00e7oit jusqu\'\u00e0 la quotit\u00e9 disponible (' + Math.round(qdp * 100) + '% PP). Exon\u00e9r\u00e9 de droits de succession (art. 796-0 bis CGI).';
                result.civilArticle = 'Art. 515-6 CC + art. 913 CC + art. 796-0 bis CGI';
            }
            result.warnings.push('\u2139\ufe0f Pacs\u00e9 : droit de jouissance gratuite du logement commun pendant 1 an (art. 515-6 al. 3 CC).');
            return result;
        }

        // ── MARIAGE ──────────────────────────────────────────────
        if (nbEnfants === 0) {
            result.ppFraction = 1;
            result.npFractionChildren = 0;
            result.explanation = 'Conjoint mari\u00e9 sans enfant : h\u00e9rite de la totalit\u00e9 en PP (exon\u00e9r\u00e9 de droits). Les parents survivants ont un droit de retour l\u00e9gal (art. 757-3 CC).';
            result.civilArticle = 'Art. 757-2 CC';
            return result;
        }

        if (hasDDV) {
            var qdDDV = getQuotiteDisponible(nbEnfants);
            if (conjointOption === 'usufruit') {
                result.usufruitFraction = 1;
                result.npFractionChildren = 1;
                result.explanation = 'DDV \u2014 Option usufruit : conjoint re\u00e7oit 100% en usufruit. Enfants nus-propri\u00e9taires de la totalit\u00e9. Au d\u00e9c\u00e8s du conjoint, la PP est reconstitu\u00e9e sans droits suppl\u00e9mentaires.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option 100% US';
            } else if (conjointOption === 'mixte') {
                result.ppFraction = 0.25;
                result.usufruitFraction = 0.75;
                result.npFractionChildren = 0.75;
                result.explanation = 'DDV \u2014 Option mixte : conjoint re\u00e7oit 25% PP + usufruit sur 75%. Enfants nus-propri\u00e9taires de 75%.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option mixte';
            } else {
                result.ppFraction = qdDDV;
                result.npFractionChildren = 1 - qdDDV;
                result.explanation = 'DDV \u2014 Option PP : conjoint re\u00e7oit ' + Math.round(qdDDV * 100) + '% en PP (quotit\u00e9 disponible). Enfants se partagent ' + Math.round((1 - qdDDV) * 100) + '%.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option PP';
            }
            return result;
        }

        if (hasEnfantsAutreLit) {
            result.ppFraction = 0.25;
            result.npFractionChildren = 0.75;
            result.explanation = 'Conjoint mari\u00e9 avec enfants d\'un autre lit : 25% en PP (art. 757 al. 2 CC). Pas d\'option usufruit possible.';
            result.warnings.push('\u26a0\ufe0f Enfants d\'un autre lit d\u00e9tect\u00e9s \u2192 le conjoint ne peut choisir que 25% en PP (pas d\'option 100% usufruit). Envisagez une DDV pour augmenter ses droits.');
            result.civilArticle = 'Art. 757 al. 2 CC';
            return result;
        }

        if (conjointOption === 'usufruit') {
            result.usufruitFraction = 1;
            result.npFractionChildren = 1;
            result.explanation = 'Conjoint mari\u00e9 (enfants communs) \u2014 Option usufruit : 100% en usufruit. Enfants nus-propri\u00e9taires. Reconstitution PP au d\u00e9c\u00e8s du conjoint, sans droits.';
            result.civilArticle = 'Art. 757 al. 1 CC \u2014 Option 100% US';
        } else {
            result.ppFraction = 0.25;
            result.npFractionChildren = 0.75;
            result.explanation = 'Conjoint mari\u00e9 (enfants communs) \u2014 Option PP : 25% en pleine propri\u00e9t\u00e9. Enfants se partagent 75%.';
            result.civilArticle = 'Art. 757 al. 1 CC \u2014 Option 25% PP';
        }

        return result;
    }

    // ============================================================
    // 4. DÉTECTION FAMILLE RECOMPOSÉE
    // ============================================================

    function detectBeauxEnfants() {
        if (typeof FamilyGraph === 'undefined') return [];
        var warnings = [];

        FamilyGraph.getPersons().forEach(function(p) {
            if (!p.isBeneficiary) return;
            FamilyGraph.getDonors().forEach(function(d) {
                var lien = FamilyGraph.computeFiscalLien(d.id, p.id);
                if (lien !== 'tiers') return;
                var spouse = FamilyGraph.spouse(d.id);
                if (!spouse) return;
                var isChildOfSpouse = FamilyGraph.children(spouse.id).some(function(c) { return c.id === p.id; });
                var isChildOfDonor = FamilyGraph.children(d.id).some(function(c) { return c.id === p.id; });

                if (isChildOfSpouse && !isChildOfDonor) {
                    warnings.push({
                        type: 'beau_enfant', severity: 'error',
                        donorId: d.id, donorNom: d.nom,
                        enfantId: p.id, enfantNom: p.nom,
                        message: p.nom + ' est l\'enfant de ' + spouse.nom + ' mais pas de ' + d.nom +
                            ' \u2192 trait\u00e9 comme TIERS fiscal (60%). Pour le prot\u00e9ger : adoption simple (\u2192 ligne directe, abat. 100k\u20ac), ' +
                            'testament + assurance-vie (art. 990 I, abat. 152 500 \u20ac/b\u00e9n\u00e9ficiaire), ou donation-partage conjonctive.'
                    });
                }
            });
        });
        return warnings;
    }

    function hasEnfantsAutreLit(donorId) {
        if (typeof FamilyGraph === 'undefined') return false;
        var spouse = FamilyGraph.spouse(donorId);
        if (!spouse) return false;
        var donorChildren = FamilyGraph.children(donorId);
        var spouseChildren = FamilyGraph.children(spouse.id);
        var donorOnly = donorChildren.filter(function(dc) {
            return !spouseChildren.some(function(sc) { return sc.id === dc.id; });
        });
        var spouseOnly = spouseChildren.filter(function(sc) {
            return !donorChildren.some(function(dc) { return dc.id === sc.id; });
        });
        return donorOnly.length > 0 || spouseOnly.length > 0;
    }

    // ============================================================
    // 5. CALCUL CORRIGÉ — Assiette taxable enfants
    // ============================================================

    /**
     * Reconstruit calcDroitsForBens() à partir de SD._fiscal (exposé)
     * pour pouvoir calculer les droits corrigés sans modifier successions-donations.js
     */
    function _calcDroitsForBens(montant, bens, nbDonors, isSuccession) {
        var F = SD._fiscal;
        var FISCAL = F.getFISCAL();
        if (montant <= 0 || bens.length === 0) return 0;
        var total = 0;
        bens.forEach(function(b) {
            var part = montant / bens.length;
            var abat = F.getAbattement(b.lien, isSuccession) * nbDonors - (b.donationAnterieure || 0);
            var handicapAbat = b.handicap ? FISCAL.abattements.handicap : 0;
            var base = Math.max(0, part - abat - handicapAbat);
            total += F.calcDroits(base, F.getBareme(b.lien));
        });
        return total;
    }

    /**
     * Calcule l'assiette taxable des enfants en tenant compte de la part civile
     * du conjoint survivant.
     *
     * Règles fiscales clés :
     * - Conjoint PP : part exonérée (art. 796-0 bis), enfants taxés sur le reste en PP
     * - Conjoint US : enfants taxés sur la NP (art. 669 CGI, table viager)
     * - Conjoint PP + US (mixte) : PP exonéré + enfants NP sur la portion US
     *
     * @returns {Object} { childrenBase, conjointPPAmount, conjointUSAmount, npRatio, explanation }
     */
    function computeChildrenTaxableBase(totalNet, civilShare, conjointAge) {
        var F = SD._fiscal;
        var ppAmount = Math.round(totalNet * civilShare.ppFraction);
        var usAmount = 0;
        var npRatio = 1;
        var childrenBase;

        if (civilShare.usufruitFraction > 0) {
            // Conjoint prend l'usufruit → enfants taxés sur NP (art. 669)
            npRatio = F.getNPRatio(conjointAge || 65);
            var usPortion = totalNet * civilShare.usufruitFraction;
            var npValue = Math.round(usPortion * npRatio);
            usAmount = usPortion;

            // Si mixte (25% PP + 75% US) : enfants taxés sur NP de la portion US
            // Les 25% PP vont au conjoint (exonéré)
            childrenBase = npValue;
        } else {
            // Conjoint prend uniquement en PP
            childrenBase = Math.round(totalNet * (1 - civilShare.ppFraction));
        }

        var explanation = '';
        if (civilShare.ppFraction === 1) {
            explanation = 'Conjoint h\u00e9rite de 100% en PP (exon\u00e9r\u00e9). Enfants : 0 \u20ac taxable.';
            childrenBase = 0;
        } else if (civilShare.ppFraction === 0.25 && civilShare.usufruitFraction === 0) {
            explanation = 'Conjoint : 25% PP (exon\u00e9r\u00e9). Enfants : 75% = ' + F.fmt(childrenBase) + ' taxable en PP.';
        } else if (civilShare.ppFraction === 0.25 && civilShare.usufruitFraction === 0.75) {
            explanation = 'Conjoint : 25% PP + US sur 75%. Enfants : NP ' + Math.round(npRatio * 100) + '% de 75% = ' + F.fmt(childrenBase) + ' taxable.';
        } else if (civilShare.usufruitFraction === 1) {
            explanation = 'Conjoint : 100% usufruit (exon\u00e9r\u00e9). Enfants : NP ' + Math.round(npRatio * 100) + '% = ' + F.fmt(childrenBase) + ' taxable (art. 669).';
        } else if (civilShare.ppFraction > 0) {
            explanation = 'Conjoint : ' + Math.round(civilShare.ppFraction * 100) + '% PP (exon\u00e9r\u00e9). Enfants : ' + Math.round((1 - civilShare.ppFraction) * 100) + '% = ' + F.fmt(childrenBase) + ' taxable.';
        }

        return {
            childrenBase: childrenBase,
            conjointPPAmount: ppAmount,
            conjointUSAmount: usAmount,
            npRatio: npRatio,
            explanation: explanation
        };
    }

    /**
     * Calcule le scénario "Succession corrigée" avec droits civils intégrés.
     * Compare avec le brut et retourne le delta.
     */
    function computeCorrectedSuccession() {
        var state = SD._getState ? SD._getState() : null;
        if (!state || !state._civilRights) return null;

        var F = SD._fiscal;
        var FISCAL = F.getFISCAL();
        var pat = F.computePatrimoine();
        var totalNet = pat.actifNet;
        var bens = state.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; });
        var nbBens = Math.max(1, bens.length);
        var nbDonors = state.mode === 'couple' ? 2 : 1;
        var civilShare = state._civilRights;
        var conjointAge = 65;

        // Déterminer l'âge du conjoint
        if (state._spouseId && typeof FamilyGraph !== 'undefined') {
            var sp = FamilyGraph.getPerson(state._spouseId);
            if (sp && sp.age) conjointAge = sp.age;
        }

        if (bens.length === 0) return null;

        // --- Scénario brut (sans droits civils) = ce que SD calcule ---
        var droitsBrut = _calcDroitsForBens(totalNet, bens, nbDonors, true);
        var fraisBrut = Math.round(totalNet * FISCAL.fraisNotaireSuccPct);

        // --- Scénario corrigé (avec droits civils) ---
        var adjusted = computeChildrenTaxableBase(totalNet, civilShare, conjointAge);
        var droitsCorrige = _calcDroitsForBens(adjusted.childrenBase, bens, nbDonors, true);
        var fraisCorrige = Math.round(adjusted.childrenBase * FISCAL.fraisNotaireSuccPct);

        // Droits concubin si applicable (60% sur sa part)
        var droitsConcubin = 0;
        if (state._unionType === 'concubinage' && civilShare.ppFraction > 0) {
            var concubinPart = Math.round(totalNet * civilShare.ppFraction);
            var abatTiers = FISCAL.abattements.tiers || 1594;
            var baseConcubin = Math.max(0, concubinPart - abatTiers);
            droitsConcubin = Math.round(baseConcubin * 0.60);
        }

        var totalDroitsCorrige = droitsCorrige + droitsConcubin;
        var delta = droitsBrut - totalDroitsCorrige;

        return {
            // Brut (référence SD actuelle)
            brut: {
                assiette: totalNet,
                droits: droitsBrut,
                frais: fraisBrut,
                net: totalNet - droitsBrut - fraisBrut
            },
            // Corrigé (avec droits civils)
            corrige: {
                assietteEnfants: adjusted.childrenBase,
                conjointPP: adjusted.conjointPPAmount,
                conjointUS: adjusted.conjointUSAmount,
                npRatio: adjusted.npRatio,
                droitsEnfants: droitsCorrige,
                droitsConcubin: droitsConcubin,
                totalDroits: totalDroitsCorrige,
                frais: fraisCorrige,
                netEnfants: adjusted.childrenBase - droitsCorrige - fraisCorrige,
                explanation: adjusted.explanation
            },
            delta: delta,
            civilShare: civilShare,
            conjointAge: conjointAge,
            unionType: state._unionType,
            nbEnfants: bens.length,
            totalNet: totalNet
        };
    }

    // ============================================================
    // 6. PATCHES — Hook into SD.calculateResults
    // ============================================================

    function patchSD() {
        if (typeof SD === 'undefined') return;

        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            injectConjointContext();
            _origCalc.call(SD);
            setTimeout(function() {
                renderCorrectedScenario();
                addCivilRightsWarnings();
            }, 150);
        };

        var _origRefresh = SD.refreshObjectives;
        SD.refreshObjectives = function() {
            _origRefresh.call(SD);
            setTimeout(injectPacsWarningInObjectives, 50);
        };

        console.log('[CivilRights v2] Patched SD.calculateResults (computation + render)');
    }

    function injectConjointContext() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length === 0) { state._civilRights = null; return; }

        var primaryDonor = donors[0];
        var spouse = typeof FamilyGraph !== 'undefined' ? FamilyGraph.spouse(primaryDonor.id) : null;
        if (!spouse) { state._civilRights = null; return; }

        var uType = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getUnionType)
            ? FamilyGraph.getUnionType(primaryDonor.id, spouse.id)
            : 'mariage';

        var nbEnfants = state.beneficiaries.filter(function(b) {
            return b.lien === 'enfant';
        }).length;

        var civilShare = computeConjointCivilShare({
            unionType: uType,
            hasDDV: state.ddv || false,
            hasTestament: state._hasTestament || false,
            nbEnfants: nbEnfants,
            hasEnfantsAutreLit: hasEnfantsAutreLit(primaryDonor.id),
            conjointOption: state._conjointOption || 'pp',
            conjointAge: spouse.age || 65
        });

        state._civilRights = civilShare;
        state._unionType = uType;
        state._spouseId = spouse.id;
        state._spouseNom = spouse.nom;
    }

    // ============================================================
    // 7. RENDER — Panneau "Succession corrigée" dans step 5
    // ============================================================

    function renderCorrectedScenario() {
        var result = computeCorrectedSuccession();
        if (!result) return;

        // Ne rien afficher si pas d'impact (pas de conjoint ou même résultat)
        if (result.delta === 0 && !result.civilShare.usufruitFraction && !result.civilShare.ppFraction) return;

        var F = SD._fiscal;
        var fmt = F.fmt;
        var cr = result.civilShare;

        // Supprimer le panneau précédent s'il existe
        var existing = document.getElementById('civil-rights-corrected');
        if (existing) existing.remove();

        var deltaSign = result.delta > 0 ? '+' : '';
        var deltaColor = result.delta > 0 ? 'var(--accent-green)' : result.delta < 0 ? 'var(--accent-coral)' : 'var(--text-muted)';
        var deltaLabel = result.delta > 0
            ? '\ud83d\udcb0 ' + fmt(result.delta) + ' d\'\u00e9conomie vs calcul brut'
            : result.delta < 0
                ? '\u26a0\ufe0f ' + fmt(Math.abs(result.delta)) + ' de droits suppl\u00e9mentaires'
                : 'Pas de diff\u00e9rence';

        var html = '<div class="section-card" id="civil-rights-corrected" style="border-color:rgba(59,130,246,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-balance-scale" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Succession r\u00e9elle (droits civils int\u00e9gr\u00e9s)</div>';
        html += '<div class="section-subtitle">Le sc\u00e9nario \u00ab Succession brute \u00bb suppose une r\u00e9partition \u00e9gale entre enfants. En r\u00e9alit\u00e9, le conjoint survivant a des droits civils (art. 757 CC) qui modifient l\'assiette taxable.</div>';

        // === Explication civile ===
        html += '<div style="padding:16px;border-radius:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);margin-bottom:16px;">';
        html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-blue);margin-bottom:8px;"><i class="fas fa-gavel"></i> ' + cr.civilArticle + '</div>';
        html += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.7;">' + cr.explanation + '</div>';
        html += '</div>';

        // === Tableau comparatif ===
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem;">';
        html += '<thead><tr style="background:rgba(198,134,66,.06);">';
        html += '<th style="padding:12px 16px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid rgba(198,134,66,.1);">Crit\u00e8re</th>';
        html += '<th style="padding:12px 16px;text-align:right;font-weight:600;color:var(--text-muted);border-bottom:1px solid rgba(198,134,66,.1);">Brut (sans civil)</th>';
        html += '<th style="padding:12px 16px;text-align:right;font-weight:700;color:var(--accent-blue);border-bottom:1px solid rgba(59,130,246,.15);background:rgba(59,130,246,.04);">\u2696\ufe0f Corrig\u00e9 (droits civils)</th>';
        html += '</tr></thead><tbody>';

        // Ligne : part conjoint
        if (cr.ppFraction > 0 || cr.usufruitFraction > 0) {
            var conjLabel = '';
            if (cr.ppFraction > 0 && cr.usufruitFraction > 0) {
                conjLabel = Math.round(cr.ppFraction * 100) + '% PP + US ' + Math.round(cr.usufruitFraction * 100) + '%';
            } else if (cr.ppFraction > 0) {
                conjLabel = Math.round(cr.ppFraction * 100) + '% PP';
            } else {
                conjLabel = '100% usufruit';
            }
            var conjExo = result.unionType === 'concubinage' ? ' (tax\u00e9 60%)' : ' (exon\u00e9r\u00e9)';
            html += '<tr><td style="padding:10px 16px;border-bottom:1px solid rgba(198,134,66,.05);">Part conjoint (' + (result.unionType === 'mariage' ? 'mari\u00e9' : result.unionType) + ')</td>';
            html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);color:var(--text-muted);">Non calcul\u00e9e</td>';
            html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);background:rgba(59,130,246,.02);font-weight:600;">' + conjLabel + conjExo + '</td></tr>';
        }

        // Ligne : assiette enfants
        html += '<tr><td style="padding:10px 16px;border-bottom:1px solid rgba(198,134,66,.05);">Assiette taxable enfants</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(result.brut.assiette) + '</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);background:rgba(59,130,246,.02);font-weight:700;">' + fmt(result.corrige.assietteEnfants);
        if (cr.usufruitFraction > 0) {
            html += ' <span style="font-size:.7rem;color:var(--text-muted);">(NP ' + Math.round(result.corrige.npRatio * 100) + '%)</span>';
        }
        html += '</td></tr>';

        // Ligne : droits enfants
        html += '<tr><td style="padding:10px 16px;border-bottom:1px solid rgba(198,134,66,.05);">Droits de succession (enfants)</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">' + fmt(result.brut.droits) + '</td>';
        html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);background:rgba(59,130,246,.02);font-weight:700;">' + fmt(result.corrige.droitsEnfants) + '</td></tr>';

        // Ligne : droits concubin (si applicable)
        if (result.corrige.droitsConcubin > 0) {
            html += '<tr><td style="padding:10px 16px;border-bottom:1px solid rgba(198,134,66,.05);color:var(--accent-coral);">Droits concubin (60%)</td>';
            html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);">\u2014</td>';
            html += '<td style="padding:10px 16px;text-align:right;border-bottom:1px solid rgba(198,134,66,.05);background:rgba(59,130,246,.02);font-weight:700;color:var(--accent-coral);">' + fmt(result.corrige.droitsConcubin) + '</td></tr>';
        }

        // Ligne : total droits
        html += '<tr style="font-weight:700;border-top:2px solid rgba(198,134,66,.15);"><td style="padding:14px 16px;">TOTAL DROITS</td>';
        html += '<td style="padding:14px 16px;text-align:right;">' + fmt(result.brut.droits) + '</td>';
        html += '<td style="padding:14px 16px;text-align:right;background:rgba(59,130,246,.04);color:var(--accent-blue);">' + fmt(result.corrige.totalDroits) + '</td></tr>';

        // Ligne : delta
        html += '<tr><td style="padding:10px 16px;" colspan="2"></td>';
        html += '<td style="padding:10px 16px;text-align:right;background:rgba(59,130,246,.04);"><span style="padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;color:' + deltaColor + ';background:' + (result.delta > 0 ? 'rgba(16,185,129,.1)' : result.delta < 0 ? 'rgba(255,107,107,.1)' : 'rgba(198,134,66,.05)') + ';">' + deltaLabel + '</span></td></tr>';

        html += '</tbody></table></div>';

        // === Explication pédagogique ===
        html += '<div style="margin-top:16px;padding:14px 18px;border-radius:10px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);font-size:.78rem;color:var(--text-secondary);line-height:1.7;">';
        html += '<strong>\ud83d\udcda Pourquoi la diff\u00e9rence ?</strong><br>';
        if (result.delta > 0 && cr.usufruitFraction > 0) {
            html += 'L\'option usufruit du conjoint est doublement avantageuse : le conjoint est exon\u00e9r\u00e9 (art. 796-0 bis CGI) ET les enfants ne sont tax\u00e9s que sur la nue-propri\u00e9t\u00e9 (' + Math.round(result.corrige.npRatio * 100) + '% \u00e0 ' + result.conjointAge + ' ans, art. 669 CGI). Au d\u00e9c\u00e8s du conjoint, la PP est reconstitu\u00e9e sans droits suppl\u00e9mentaires.';
        } else if (result.delta > 0) {
            html += 'Le conjoint pr\u00e9l\u00e8ve sa part civile en PP (exon\u00e9r\u00e9e de droits, art. 796-0 bis CGI). L\'assiette taxable des enfants est donc r\u00e9duite de ' + Math.round(cr.ppFraction * 100) + '%.';
        } else if (result.delta < 0) {
            html += 'Le concubin est tax\u00e9 \u00e0 60% (tiers fiscal). Cela augmente le co\u00fbt global de la transmission par rapport au sc\u00e9nario brut qui ignore cette r\u00e9alit\u00e9.';
        } else {
            html += 'Le conjoint ne re\u00e7oit rien automatiquement dans cette configuration. L\'assiette des enfants est inchang\u00e9e.';
        }
        html += '</div>';

        // === Recommandation si PACS/concubinage ===
        if (result.unionType === 'pacs' && !result.civilShare.ppFraction) {
            html += '<div class="warning-box error" style="margin-top:12px;">';
            html += '<i class="fas fa-exclamation-circle"></i>';
            html += '<span><strong>Action requise :</strong> sans testament, le pacs\u00e9 survivant ne re\u00e7oit <strong>rien</strong>. ';
            html += 'Deux options compl\u00e9mentaires : <strong>1)</strong> testament (gratuit pour la QD, exon\u00e9r\u00e9 de droits) + ';
            html += '<strong>2)</strong> assurance-vie (art. 990 I, abat. 152 500 \u20ac, hors succession).</span></div>';
        }

        html += '</div>';

        // Injecter AVANT le bloc results-warnings
        var warningsEl = document.getElementById('results-warnings');
        if (warningsEl) {
            warningsEl.insertAdjacentHTML('beforebegin', html);
        } else {
            var txMap = document.getElementById('transmission-map');
            if (txMap) txMap.insertAdjacentHTML('afterend', html);
        }
    }

    // ============================================================
    // 8. WARNINGS — Famille recomposée + PACS/concubinage
    // ============================================================

    function addCivilRightsWarnings() {
        var warningsEl = document.getElementById('results-warnings');
        if (!warningsEl) return;
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var html = '';

        // --- Beaux-enfants ---
        detectBeauxEnfants().forEach(function(w) {
            html += '<div class="warning-box warn" style="margin-top:4px;">' +
                '<i class="fas fa-user-friends"></i>' +
                '<span><strong>Famille recompos\u00e9e :</strong> ' + w.message + '</span></div>';
        });

        // --- Info PACS (si pas déjà dans le panneau corrigé) ---
        if (state._unionType === 'pacs' && state._civilRights && state._civilRights.ppFraction > 0) {
            html += '<div class="warning-box info" style="margin-top:4px;">' +
                '<i class="fas fa-ring"></i>' +
                '<span><strong>PACS + testament :</strong> exon\u00e9ration totale des droits (art. 796-0 bis CGI). ' +
                'Le pacs\u00e9 re\u00e7oit jusqu\'\u00e0 la quotit\u00e9 disponible. Compl\u00e9tez avec une assurance-vie pour optimiser.</span></div>';
        }

        // --- Info Concubinage ---
        if (state._unionType === 'concubinage') {
            html += '<div class="warning-box error" style="margin-top:4px;">' +
                '<i class="fas fa-heart-broken"></i>' +
                '<span><strong>Concubinage :</strong> aucun droit successoral. ' +
                'Toute transmission (y compris par testament) est tax\u00e9e \u00e0 60%. ' +
                'L\'assurance-vie (art. 990 I) est le seul outil efficace : ' +
                'abattement 152 500 \u20ac par b\u00e9n\u00e9ficiaire, puis taux r\u00e9duit (20%/31,25%).</span></div>';
        }

        if (html) warningsEl.insertAdjacentHTML('beforeend', html);
    }

    function injectPacsWarningInObjectives() {
        var state = (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null;
        if (!state) return;

        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length === 0) return;

        var primaryDonor = donors[0];
        var spouse = typeof FamilyGraph !== 'undefined' ? FamilyGraph.spouse(primaryDonor.id) : null;
        if (!spouse) return;

        var uType = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getUnionType)
            ? FamilyGraph.getUnionType(primaryDonor.id, spouse.id) : 'mariage';

        var objConjEl = document.getElementById('obj-conjoint');
        if (!objConjEl) return;
        var row = objConjEl.closest('.switch-row');
        if (!row) return;
        var contextEl = row.querySelector('.obj-context');
        if (!contextEl) return;

        if (uType === 'pacs') {
            if (contextEl.innerHTML.indexOf('PACS d\u00e9tect\u00e9') >= 0) return;
            contextEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--accent-coral);margin-right:6px;"></i>' +
                '<strong style="color:var(--accent-coral);">PACS d\u00e9tect\u00e9</strong> \u2014 ' +
                'Le pacs\u00e9 n\'h\u00e9rite PAS automatiquement (art. 515-6 CC). ' +
                'Sans testament, il ne recevra rien de la succession. Exon\u00e9r\u00e9 de droits si testament (art. 796-0 bis CGI). ' +
                'DDV non applicable au PACS \u2192 privil\u00e9giez <strong>assurance-vie + testament</strong>.';
            contextEl.style.borderLeftColor = 'rgba(255,107,107,.3)';
        } else if (uType === 'concubinage') {
            if (contextEl.innerHTML.indexOf('Concubinage d\u00e9tect\u00e9') >= 0) return;
            contextEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--accent-coral);margin-right:6px;"></i>' +
                '<strong style="color:var(--accent-coral);">Concubinage d\u00e9tect\u00e9</strong> \u2014 ' +
                'Aucun droit successoral. Taxation \u00e0 60% m\u00eame avec testament. ' +
                'Seule solution efficace : <strong>assurance-vie (art. 990 I)</strong>.';
            contextEl.style.borderLeftColor = 'rgba(255,107,107,.3)';
        }
    }

    // ============================================================
    // 9. UI — Sélecteur type d'union dans le context menu
    // ============================================================

    function patchFamilyTreeUI() {
        if (typeof SD === 'undefined' || !SD.showContextMenu) return;

        var _origShowCtx = SD.showContextMenu;
        SD.showContextMenu = function(pid, e) {
            _origShowCtx.call(SD, pid, e);

            if (typeof FamilyGraph === 'undefined') return;
            var spouse = FamilyGraph.spouse(pid);
            if (!spouse) return;

            var ctx = document.getElementById('ft-ctx');
            if (!ctx) return;

            var currentType = FamilyGraph.getUnionType
                ? FamilyGraph.getUnionType(pid, spouse.id) : 'mariage';

            var spNom = spouse.nom || 'conjoint';
            var check = function(t) { return currentType === t ? '\u2713 ' : ''; };
            var bold = function(t) { return currentType === t ? 'color:var(--accent-green);font-weight:700;' : ''; };

            var unionHtml = '<div class="ft-ctx-sep"></div>' +
                '<div style="padding:6px 12px;font-size:.65rem;color:var(--text-muted);font-weight:600;">Type d\'union avec ' + spNom + '</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'mariage\')" style="' + bold('mariage') + '">' +
                    check('mariage') + '\ud83d\udc8d Mariage</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'pacs\')" style="' + bold('pacs') + '">' +
                    check('pacs') + '\ud83d\udccb PACS</div>' +
                '<div class="ft-ctx-item" onclick="CivilRights.setUnionAndRefresh(' + pid + ',' + spouse.id + ',\'concubinage\')" style="' + bold('concubinage') + '">' +
                    check('concubinage') + '\ud83e\udd1d Concubinage</div>';

            ctx.insertAdjacentHTML('beforeend', unionHtml);
        };

        console.log('[CivilRights v2] Patched showContextMenu with union type selector');
    }

    function setUnionAndRefresh(id1, id2, type) {
        setUnionType(id1, id2, type);
        if (typeof SD !== 'undefined') {
            SD.closeCtx();
            SD.renderFamilyTree();
        }
    }

    // ============================================================
    // 10. INIT
    // ============================================================

    function init() {
        patchSD();
        patchFamilyTreeUI();
        console.log('[CivilRights v2] Module loaded \u2014 art. 757/515-6/913 CC + computation');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 200);
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        computeConjointCivilShare: computeConjointCivilShare,
        computeChildrenTaxableBase: computeChildrenTaxableBase,
        computeCorrectedSuccession: computeCorrectedSuccession,
        getQuotiteDisponible: getQuotiteDisponible,
        detectBeauxEnfants: detectBeauxEnfants,
        hasEnfantsAutreLit: hasEnfantsAutreLit,
        setUnionType: setUnionType,
        getUnionType: getUnionType,
        setUnionAndRefresh: setUnionAndRefresh
    };

})();
