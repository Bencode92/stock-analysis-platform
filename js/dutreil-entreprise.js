/**
 * dutreil-entreprise.js — Pacte Dutreil : transmission entreprise 75% exo
 *
 * 1. computeDutreil() : calcul droits avec/sans Dutreil, donation NP + Dutreil
 * 2. computeDutreilDonationNP() : combo donation NP + Dutreil = quasi gratuit
 * 3. computePaiementDiffere() : facilités paiement (différé 5a + fractionné 10a)
 * 4. Intégration recommandations step 5
 *
 * Règles 2026 : conservation 6 ans (loi 2026, avant = 4 ans)
 * Art. 787 B CGI (société) / Art. 787 C CGI (entreprise individuelle)
 *
 * @version 1.0.0 — 2026-03-16
 */
const DutreilEntreprise = (function() {
    'use strict';

    // ============================================================
    // 1. PACTE DUTREIL — Calcul principal
    // ============================================================

    /**
     * Calcule l'impact du Pacte Dutreil sur la transmission d'entreprise.
     *
     * @param {Object} params
     * @param {number} params.valeurEntreprise - Valeur totale de l'entreprise/parts
     * @param {number} params.pctDetenu - % détenu par le défunt/donateur (0-100)
     * @param {string} params.typeEntreprise - 'societe' | 'individuelle'
     * @param {number} params.nbHeritiers - Nombre d'héritiers repreneurs
     * @param {string} params.lienHeritier - 'enfant', 'conjoint_pacs', etc.
     * @param {number} params.nbDonors - 1 ou 2
     * @param {boolean} params.engagementCollectif - Engagement collectif signé (2 ans min)
     * @param {number} params.pctEngagement - % couvert par l'engagement collectif (min 17% cotées, 34% non cotées)
     * @param {boolean} params.heritierRepreneur - Au moins 1 héritier continue l'activité
     * @param {number} params.ageDonateur - Âge du donateur (pour donation NP)
     * @returns {Object}
     */
    function computeDutreil(params) {
        var p = params || {};
        var valeurTotale = p.valeurEntreprise || 1000000;
        var pctDetenu = Math.min(100, p.pctDetenu || 100);
        var type = p.typeEntreprise || 'societe';
        var nbHer = Math.max(1, p.nbHeritiers || 2);
        var lien = p.lienHeritier || 'enfant';
        var nbDonors = p.nbDonors || 1;
        var engCol = p.engagementCollectif !== false;
        var pctEng = p.pctEngagement || (type === 'societe' ? 34 : 100);
        var heritierRepreneur = p.heritierRepreneur !== false;
        var ageDon = p.ageDonateur || 55;
        var F = SD._fiscal;

        var valeurTransmise = Math.round(valeurTotale * pctDetenu / 100);
        var exoConj = lien === 'conjoint_pacs';

        // --- Conditions Dutreil ---
        var eligible = true;
        var warnings = [];

        // Engagement collectif : min 17% cotées ou 34% non cotées
        var seuilPct = type === 'societe' ? 34 : 100;
        if (type === 'societe' && pctEng < seuilPct) {
            warnings.push('Engagement collectif insuffisant : ' + pctEng + '% < seuil ' + seuilPct + '% (non cotée)');
            eligible = false;
        }

        if (!engCol && type === 'societe') {
            // Engagement réputé acquis si le défunt détenait seul > seuil + dirigeant depuis 2 ans
            warnings.push('Sans engagement collectif formel : vérifier si engagement réputé acquis (détention > ' + seuilPct + '% + direction > 2 ans)');
        }

        if (!heritierRepreneur) {
            warnings.push('AUCUN héritier repreneur désigné → Dutreil impossible (au moins 1 doit diriger l\'entreprise)');
            eligible = false;
        }

        // --- SANS Dutreil ---
        var abatSans = exoConj ? 0 : F.getAbattement(lien, true) * nbDonors;
        var partSans = valeurTransmise / nbHer;
        var droitsSans = exoConj ? 0 : F.calcDroits(Math.max(0, partSans - abatSans), F.getBareme(lien)) * nbHer;

        // --- AVEC Dutreil : 75% exonération ---
        var tauxExo = 0.75;
        var valeurExoneree = Math.round(valeurTransmise * tauxExo);
        var valeurTaxable = valeurTransmise - valeurExoneree; // 25% seulement
        var partAvec = valeurTaxable / nbHer;
        var droitsAvec = exoConj ? 0 : F.calcDroits(Math.max(0, partAvec - abatSans), F.getBareme(lien)) * nbHer;
        var economie = droitsSans - droitsAvec;

        // --- COMBO : Donation NP + Dutreil ---
        var npRatio = F.getNPRatio(ageDon);
        var valeurNP = Math.round(valeurTransmise * npRatio);
        var valeurNPapresDutreil = Math.round(valeurNP * (1 - tauxExo)); // 25% de la NP
        var partNPDutreil = valeurNPapresDutreil / nbHer;
        var droitsNPDutreil = exoConj ? 0 : F.calcDroits(Math.max(0, partNPDutreil - abatSans), F.getBareme(lien)) * nbHer;
        var economieNPDutreil = droitsSans - droitsNPDutreil;

        // Conservation 2026
        var dureeConservation = type === 'societe' ? 6 : 4; // 6 ans société (loi 2026), 4 ans individuelle
        var dureeExploitation = type === 'individuelle' ? 3 : 0;

        return {
            eligible: eligible,
            valeurEntreprise: valeurTotale,
            valeurTransmise: valeurTransmise,
            pctDetenu: pctDetenu,
            typeEntreprise: type,

            sansDutreil: { droits: droitsSans, valeurTaxable: valeurTransmise },
            avecDutreil: { droits: droitsAvec, valeurTaxable: valeurTaxable, exoneration: valeurExoneree, tauxExo: 75 },
            economie: economie,

            comboDonationNP: {
                ageDonateur: ageDon, npRatio: npRatio,
                valeurNP: valeurNP,
                valeurNPapresDutreil: valeurNPapresDutreil,
                droits: droitsNPDutreil,
                economie: economieNPDutreil,
                explanation: 'Donation NP (' + Math.round(npRatio * 100) + '%) + Dutreil 75% → taxé sur ' + fmt(valeurNPapresDutreil) + ' (= ' + Math.round(npRatio * 25) + '% de ' + fmt(valeurTransmise) + '). ' +
                    'Donateur garde l\'usufruit (dividendes). Héritiers NP récupèrent PP au décès 0€ droits.'
            },

            conditions: {
                engagementCollectif: { duree: '2 ans minimum', seuil: type === 'societe' ? (seuilPct + '% des droits de vote') : 'Totalité de l\'activité' },
                engagementIndividuel: { duree: dureeConservation + ' ans (depuis 2026)', description: 'Chaque héritier conserve ses parts ' + dureeConservation + ' ans' },
                directionActivite: { description: 'Au moins 1 héritier dirige l\'entreprise pendant ' + (type === 'societe' ? dureeConservation : dureeExploitation) + ' ans' },
                exploitationIndividuelle: type === 'individuelle' ? { duree: dureeExploitation + ' ans', description: 'L\'héritier exploite l\'entreprise ' + dureeExploitation + ' ans' } : null,
                interdictions: [
                    'Ne pas céder les parts avant ' + dureeConservation + ' ans',
                    'Ne pas incorporer de biens personnels (logement, voiture) → sinon perte exo',
                    type === 'societe' ? 'Fournir attestation engagement au fisc chaque année' : null
                ].filter(Boolean)
            },

            paiement: computePaiementDiffere({ droits: droitsAvec, typeEntreprise: type, pctDetenuParHeritier: pctDetenu / nbHer }),

            warnings: warnings,
            conseil: eligible
                ? (economie > 0
                    ? 'Pacte Dutreil : économie ' + fmt(economie) + ' (' + fmt(droitsSans) + ' → ' + fmt(droitsAvec) + '). ' +
                      'Combo donation NP + Dutreil : seulement ' + fmt(droitsNPDutreil) + ' de droits !'
                    : 'Dutreil applicable mais héritier exonéré (conjoint/pacsé).')
                : 'Dutreil NON applicable dans cette configuration. Voir warnings.',

            article: type === 'societe' ? 'Art. 787 B CGI — Pacte Dutreil (société)' : 'Art. 787 C CGI — Transmission entreprise individuelle'
        };
    }

    // ============================================================
    // 2. FACILITÉS DE PAIEMENT
    // ============================================================

    function computePaiementDiffere(params) {
        var p = params || {};
        var droits = p.droits || 0;
        var type = p.typeEntreprise || 'societe';
        var pctParHer = p.pctDetenuParHeritier || 10;
        var tauxBase = 0.02; // 2% en 2026
        var tauxReduit = 0.006; // 0.60% si > 10% chacun ou > 1/3 transmis

        var tauxApplicable = pctParHer >= 10 ? tauxReduit : tauxBase;

        // Entreprise : différé 5 ans + fractionné 10 ans
        var interetsDiffere = Math.round(droits * tauxApplicable * 5);
        var mensualiteFractionne = droits > 0 ? Math.round(droits / 20) : 0; // 20 versements sur 10 ans (tous les 6 mois)
        var interetsFractionne = Math.round(droits * tauxApplicable * 10 / 2); // simplifié

        // Standard : fractionné 1-3 ans
        var fractionneStandard = { duree: '1 an (3 ans si > 50% non liquide)', versements: 3, taux: tauxBase };

        return {
            entreprise: {
                differe: { duree: '5 ans', description: 'Aucun paiement pendant 5 ans après le décès', interets: interetsDiffere },
                fractionne: { duree: '10 ans après le différé', versements: 20, frequence: 'Tous les 6 mois', montantParVersement: mensualiteFractionne, interets: interetsFractionne },
                dureeTotal: '15 ans',
                tauxInteret: Math.round(tauxApplicable * 10000) / 100 + '%',
                tauxReduit: pctParHer >= 10,
                explanation: 'Différé 5 ans (0€ à payer) + fractionné 10 ans (' + mensualiteFractionne + '€/6 mois). Taux ' + (tauxApplicable * 100) + '%. Total durée : 15 ans.'
            },
            standard: fractionneStandard,
            garanties: ['Hypothèque sur un bien immobilier', 'Nantissement contrat AV', 'Caution personnelle ou bancaire'],
            article: 'Art. 1717 CGI + art. 396-404 annexe III CGI'
        };
    }

    // ============================================================
    // 3. RENDU — Panneau step 5
    // ============================================================

    function renderDutreilPanel() {
        var state = getState(); if (!state) return;
        var existing = document.getElementById('dutreil-panel');
        if (existing) existing.remove();

        // Chercher si le patrimoine contient une entreprise
        var hasEntreprise = false;
        var valeurEntreprise = 0;
        (state.financials || []).forEach(function(f) {
            if (f.type === 'parts_societe' || f.type === 'entreprise' || f.type === 'actions_non_cotees') {
                hasEntreprise = true;
                valeurEntreprise += (f.montant || 0);
            }
        });

        if (!hasEntreprise || valeurEntreprise === 0) return;

        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
        var lien = nbEnfants > 0 ? 'enfant' : (bens[0] || {}).lien || 'enfant';

        var ageDon = 55;
        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].age) ageDon = donors[0].age;

        var result = computeDutreil({
            valeurEntreprise: valeurEntreprise, pctDetenu: 100,
            typeEntreprise: 'societe', nbHeritiers: Math.max(1, nbEnfants),
            lienHeritier: lien, nbDonors: state.mode === 'couple' ? 2 : 1,
            ageDonateur: ageDon
        });

        if (!result.eligible) return;

        var html = '<div class="section-card" id="dutreil-panel" style="border-color:rgba(168,85,247,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-industry" style="background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(168,85,247,.1));color:var(--accent-purple);"></i> Pacte Dutreil — Transmission entreprise</div>';
        html += '<div class="section-subtitle">75% d\'exonération sur les parts transmises</div>';

        // Comparatif
        html += '<div style="display:flex;gap:12px;margin-bottom:16px;">';
        // Sans Dutreil
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">SANS DUTREIL</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-coral);">' + fmt(result.sansDutreil.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">Taxé sur ' + fmt(result.sansDutreil.valeurTaxable) + '</div></div>';
        // Avec Dutreil
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">AVEC DUTREIL (75% exo)</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-green);">' + fmt(result.avecDutreil.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">Taxé sur ' + fmt(result.avecDutreil.valeurTaxable) + ' (25%)</div></div>';
        // Combo NP + Dutreil
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">DONATION NP + DUTREIL</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-purple);">' + fmt(result.comboDonationNP.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">NP ' + Math.round(result.comboDonationNP.npRatio * 100) + '% × 25% = ' + fmt(result.comboDonationNP.valeurNPapresDutreil) + '</div></div>';
        html += '</div>';

        // Économie
        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(16,185,129,.08);margin-bottom:12px;font-size:.82rem;font-weight:600;color:var(--accent-green);text-align:center;">';
        html += '\ud83d\udca1 Économie Dutreil : ' + fmt(result.economie) + ' | Combo NP+Dutreil : ' + fmt(result.comboDonationNP.economie);
        html += '</div>';

        // Paiement
        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.1);margin-bottom:12px;font-size:.78rem;">';
        html += '<i class="fas fa-calendar" style="color:var(--accent-blue);margin-right:6px;"></i><strong>Facilités de paiement</strong> : ' + result.paiement.entreprise.explanation;
        html += '</div>';

        // Conditions
        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(255,179,0,.04);border:1px solid rgba(255,179,0,.1);font-size:.75rem;color:var(--text-secondary);">';
        html += '<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px;"></i>';
        html += '<strong>Conditions</strong> : Conservation parts ' + result.conditions.engagementIndividuel.duree + ' | Direction activité par 1 héritier | Engagement collectif 2 ans min (' + result.conditions.engagementCollectif.seuil + ')';
        html += '</div>';

        html += '</div>';

        var anchor = document.getElementById('strategy-recommendations-panel') || document.getElementById('fiscal-optimizations-panel');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    function init() {
        if (typeof SD === 'undefined') return;
        var _orig = SD.calculateResults;
        SD.calculateResults = function() { _orig.call(SD); setTimeout(renderDutreilPanel, 650); };
        console.log('[DutreilEntreprise v1] Loaded — 75% exo, donation NP, paiement différé');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 850); });
    else setTimeout(init, 850);

    return { computeDutreil: computeDutreil, computePaiementDiffere: computePaiementDiffere };
})();
