/**
 * civil-rights.js — Module droits civils du conjoint survivant
 * 
 * Corrige 3 lacunes dans le moteur succession/donation :
 * 1. Part civile du conjoint (art. 757 CC) — calcul de l'assiette taxable
 * 2. Distinction Mariage / PACS / Concubinage (unionType)
 * 3. Warnings famille recomposée (beaux-enfants = tiers fiscal 60%)
 *
 * Réf. juridiques :
 *   - Art. 757, 757-1, 758-5, 763, 764 Code civil (conjoint marié)
 *   - Art. 515-6 CC (PACS)
 *   - Art. 913 CC (réserve héréditaire / quotité disponible)
 *   - Art. 1094-1 CC (donation au dernier vivant)
 *   - Art. 796-0 bis CGI (exonération DMTG conjoint/pacsé)
 *
 * Charge APRÈS successions-donations.js et path-optimizer.js
 * @version 1.0.0 — 2026-03-13
 */
const CivilRights = (function() {
    'use strict';

    // ============================================================
    // 1. CONSTANTES DROIT CIVIL (Code civil, pas CGI)
    // ============================================================

    /**
     * Art. 913 CC — Réserve héréditaire
     * La réserve est la part du patrimoine que la loi réserve aux héritiers
     * réservataires (enfants). La quotité disponible (QD) est le complément.
     */
    function getQuotiteDisponible(nbEnfants) {
        if (nbEnfants <= 0) return 1;      // Pas d'enfant → QD = 100%
        if (nbEnfants === 1) return 0.50;   // 1 enfant → réserve 50%, QD 50%
        if (nbEnfants === 2) return 1 / 3;  // 2 enfants → réserve 2/3, QD 1/3
        return 0.25;                         // 3+ enfants → réserve 3/4, QD 1/4
    }

    // ============================================================
    // 2. UNION TYPE — Extension de FamilyGraph
    // ============================================================

    // Stockage des types d'union : clé = "minId-maxId", valeur = type
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

    // Expose sur FamilyGraph si disponible
    if (typeof FamilyGraph !== 'undefined') {
        FamilyGraph.setUnionType = setUnionType;
        FamilyGraph.getUnionType = getUnionType;
    }

    // ============================================================
    // 3. CALCUL PART CIVILE DU CONJOINT SURVIVANT
    // ============================================================

    /**
     * Calcule la part civile du conjoint survivant selon le Code civil.
     *
     * @param {Object} params
     * @param {string} params.unionType        'mariage' | 'pacs' | 'concubinage'
     * @param {boolean} params.hasDDV          Donation au dernier vivant
     * @param {boolean} params.hasTestament    Testament en faveur du partenaire
     * @param {number}  params.nbEnfants       Nombre total d'enfants du défunt
     * @param {boolean} params.hasEnfantsAutreLit  Enfants d'une précédente union
     * @param {string}  params.conjointOption  'pp' | 'usufruit' | 'mixte'
     * @param {number}  params.conjointAge     Âge du conjoint (pour valorisation US)
     *
     * @returns {Object} {
     *   ppFraction,           // Part en pleine propriété [0-1]
     *   usufruitFraction,     // Part en usufruit [0-1]
     *   npFractionChildren,   // Part en NP pour les enfants [0-1]
     *   explanation,          // Texte explicatif
     *   warnings,             // Tableau de warnings
     *   civilArticle          // Article(s) de loi applicable(s)
     * }
     */
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
                result.explanation = 'Concubin sans testament : aucun droit successoral. Les enfants héritent de 100%.';
                result.warnings.push('\u26a0\ufe0f Le concubin survivant ne recevra RIEN sans testament. Envisagez un testament ou une assurance-vie.');
                result.civilArticle = 'Aucun article — le concubinage n\'ouvre aucun droit successoral';
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

        // Sans enfant : le conjoint hérite de tout
        if (nbEnfants === 0) {
            result.ppFraction = 1;
            result.npFractionChildren = 0;
            result.explanation = 'Conjoint mari\u00e9 sans enfant : h\u00e9rite de la totalit\u00e9 en PP (exon\u00e9r\u00e9 de droits). Les parents survivants ont un droit de retour l\u00e9gal (art. 757-3 CC).';
            result.civilArticle = 'Art. 757-2 CC';
            return result;
        }

        // Avec DDV (art. 1094-1 CC) : quotité disponible spéciale
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
                result.explanation = 'DDV \u2014 Option PP : conjoint re\u00e7oit ' + Math.round(qdDDV * 100) + '% en pleine propri\u00e9t\u00e9 (quotit\u00e9 disponible). Enfants se partagent ' + Math.round((1 - qdDDV) * 100) + '%.';
                result.civilArticle = 'Art. 1094-1 CC (DDV) \u2014 Option PP';
            }
            return result;
        }

        // Sans DDV — avec enfants d'un autre lit (art. 757 al. 2)
        if (hasEnfantsAutreLit) {
            result.ppFraction = 0.25;
            result.npFractionChildren = 0.75;
            result.explanation = 'Conjoint mari\u00e9 avec enfants d\'un autre lit : 25% en PP (art. 757 al. 2 CC). Pas d\'option usufruit possible.';
            result.warnings.push('\u26a0\ufe0f Enfants d\'un autre lit d\u00e9tect\u00e9s \u2192 le conjoint ne peut choisir que 25% en PP (pas d\'option 100% usufruit). Envisagez une DDV pour augmenter ses droits.');
            result.civilArticle = 'Art. 757 al. 2 CC';
            return result;
        }

        // Sans DDV — enfants tous communs (art. 757 al. 1)
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

    /**
     * Détecte les beaux-enfants dans l'arbre familial.
     * Un beau-enfant = enfant du conjoint mais PAS du donateur → tiers fiscal 60%.
     */
    function detectBeauxEnfants() {
        if (typeof FamilyGraph === 'undefined') return [];
        var persons = FamilyGraph.getPersons();
        var warnings = [];

        persons.forEach(function(p) {
            if (!p.isBeneficiary) return;
            var donors = FamilyGraph.getDonors();

            donors.forEach(function(d) {
                var lien = FamilyGraph.computeFiscalLien(d.id, p.id);
                if (lien !== 'tiers') return;

                // Vérifier si ce "tiers" est un beau-enfant
                var spouse = FamilyGraph.spouse(d.id);
                if (!spouse) return;

                var isChildOfSpouse = FamilyGraph.children(spouse.id).some(function(c) { return c.id === p.id; });
                var isChildOfDonor = FamilyGraph.children(d.id).some(function(c) { return c.id === p.id; });

                if (isChildOfSpouse && !isChildOfDonor) {
                    warnings.push({
                        type: 'beau_enfant',
                        severity: 'error',
                        donorId: d.id,
                        donorNom: d.nom,
                        enfantId: p.id,
                        enfantNom: p.nom,
                        message: p.nom + ' est l\'enfant de ' + spouse.nom + ' mais pas de ' + d.nom +
                            ' \u2192 trait\u00e9 comme TIERS fiscal (60%). Pour le prot\u00e9ger : adoption simple (\u2192 ligne directe, abat. 100k\u20ac), ' +
                            'testament + assurance-vie (art. 990 I, abat. 152 500 \u20ac/b\u00e9n\u00e9ficiaire), ou donation-partage conjonctive.'
                    });
                }
            });
        });

        return warnings;
    }

    /**
     * Détecte si le défunt a des enfants d'un précédent lit.
     */
    function hasEnfantsAutreLit(donorId) {
        if (typeof FamilyGraph === 'undefined') return false;
        var spouse = FamilyGraph.spouse(donorId);
        if (!spouse) return false;

        var donorChildren = FamilyGraph.children(donorId);
        var spouseChildren = FamilyGraph.children(spouse.id);

        // Enfants du donateur qui ne sont PAS enfants du conjoint
        var donorOnly = donorChildren.filter(function(dc) {
            return !spouseChildren.some(function(sc) { return sc.id === dc.id; });
        });
        // Enfants du conjoint qui ne sont PAS enfants du donateur
        var spouseOnly = spouseChildren.filter(function(sc) {
            return !donorChildren.some(function(dc) { return dc.id === sc.id; });
        });

        return donorOnly.length > 0 || spouseOnly.length > 0;
    }

    // ============================================================
    // 5. PATCHES — Hook into SD.calculateResults & renderWarnings
    // ============================================================

    function patchSD() {
        if (typeof SD === 'undefined') return;

        // --- Patch calculateResults ---
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            injectConjointContext();
            _origCalc.call(SD);
            // Inject civil rights warnings after DOM update
            setTimeout(addCivilRightsWarnings, 150);
        };

        // --- Patch refreshObjectives ---
        var _origRefresh = SD.refreshObjectives;
        SD.refreshObjectives = function() {
            _origRefresh.call(SD);
            setTimeout(injectPacsWarningInObjectives, 50);
        };

        console.log('[CivilRights] Patched SD.calculateResults + refreshObjectives');
    }

    /**
     * Inject conjoint civil share info into SD state before calculation.
     * This data is used by addCivilRightsWarnings() after render.
     */
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

    /**
     * Inject civil rights warnings into the results page (step 5).
     */
    function addCivilRightsWarnings() {
        var warningsEl = document.getElementById('results-warnings');
        if (!warningsEl) return;

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var html = '';

        // --- Part civile du conjoint ---
        if (state._civilRights && state._civilRights.explanation) {
            var cr = state._civilRights;
            var isError = cr.warnings.some(function(w) { return w.indexOf('\ud83d\udea8') >= 0; });
            var cssClass = isError ? 'error' : 'info';

            html += '<div class="warning-box ' + cssClass + '" style="margin-top:8px;">' +
                '<i class="fas fa-balance-scale"></i>' +
                '<span>' +
                '<strong>Droits civils du conjoint survivant</strong> (' + cr.civilArticle + ')<br>' +
                cr.explanation +
                '</span></div>';

            cr.warnings.forEach(function(w) {
                var isU = w.indexOf('\ud83d\udea8') >= 0;
                var isW = w.indexOf('\u26a0\ufe0f') >= 0;
                var cls = isU ? 'error' : isW ? 'warn' : 'info';
                var icon = isU ? 'fa-exclamation-circle' : isW ? 'fa-exclamation-triangle' : 'fa-info-circle';
                html += '<div class="warning-box ' + cls + '" style="margin-top:4px;">' +
                    '<i class="fas ' + icon + '"></i>' +
                    '<span>' + w + '</span></div>';
            });
        }

        // --- Beaux-enfants ---
        var beauxEnfants = detectBeauxEnfants();
        beauxEnfants.forEach(function(w) {
            html += '<div class="warning-box warn" style="margin-top:4px;">' +
                '<i class="fas fa-user-friends"></i>' +
                '<span><strong>Famille recompos\u00e9e :</strong> ' + w.message + '</span></div>';
        });

        // --- Info PACS ---
        if (state._unionType === 'pacs' && (!state._civilRights || !state._civilRights.warnings || state._civilRights.warnings.length === 0)) {
            html += '<div class="warning-box info" style="margin-top:4px;">' +
                '<i class="fas fa-ring"></i>' +
                '<span><strong>PACS d\u00e9tect\u00e9 :</strong> le partenaire pacs\u00e9 est exon\u00e9r\u00e9 de droits de succession (art. 796-0 bis CGI), ' +
                'mais n\'h\u00e9rite pas automatiquement sans testament (art. 515-6 CC). ' +
                'Pensez au testament et \u00e0 l\'assurance-vie.</span></div>';
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

        if (html) {
            warningsEl.insertAdjacentHTML('beforeend', html);
        }
    }

    /**
     * Inject PACS/concubinage warning in the objectives panel (step 4).
     */
    function injectPacsWarningInObjectives() {
        var state = (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null;
        if (!state) return;

        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length === 0) return;

        var primaryDonor = donors[0];
        var spouse = typeof FamilyGraph !== 'undefined' ? FamilyGraph.spouse(primaryDonor.id) : null;
        if (!spouse) return;

        var uType = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getUnionType)
            ? FamilyGraph.getUnionType(primaryDonor.id, spouse.id)
            : 'mariage';

        var objConjEl = document.getElementById('obj-conjoint');
        if (!objConjEl) return;
        var row = objConjEl.closest('.switch-row');
        if (!row) return;
        var contextEl = row.querySelector('.obj-context');
        if (!contextEl) return;

        if (uType === 'pacs') {
            if (contextEl.innerHTML.indexOf('PACS d\u00e9tect\u00e9') >= 0) return; // already injected
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
    // 6. UI — Sélecteur type d'union dans le context menu
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
                ? FamilyGraph.getUnionType(pid, spouse.id)
                : 'mariage';

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

        console.log('[CivilRights] Patched showContextMenu with union type selector');
    }

    function setUnionAndRefresh(id1, id2, type) {
        setUnionType(id1, id2, type);
        if (typeof SD !== 'undefined') {
            SD.closeCtx();
            SD.renderFamilyTree();
        }
    }

    // ============================================================
    // 7. INIT
    // ============================================================

    function init() {
        patchSD();
        patchFamilyTreeUI();
        console.log('[CivilRights] Module loaded \u2014 art. 757/515-6/913 CC');
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
        getQuotiteDisponible: getQuotiteDisponible,
        detectBeauxEnfants: detectBeauxEnfants,
        hasEnfantsAutreLit: hasEnfantsAutreLit,
        setUnionType: setUnionType,
        getUnionType: getUnionType,
        setUnionAndRefresh: setUnionAndRefresh
    };

})();
