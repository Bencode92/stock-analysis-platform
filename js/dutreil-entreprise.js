/**
 * dutreil-entreprise.js v1.1 — Pacte Dutreil + UI enrichment actifs pro
 *
 * v1.0: computeDutreil(), computePaiementDiffere(), renderDutreilPanel()
 * v1.1: UI injection dans #pro-list quand Dutreil = Oui
 *       → champs : nom entreprise, cotée, engagement collectif, % engagement,
 *         repreneur désigné, nom repreneur
 *       → wire enriched fields into state.pro[i]
 *       → renderDutreilPanel lit state.pro au lieu de state.financials
 *
 * @version 1.1.0 — 2026-03-16
 */
const DutreilEntreprise = (function() {
    'use strict';

    // ============================================================
    // 1. PACTE DUTREIL — Calcul principal
    // ============================================================

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
        var eligible = true, warnings = [];

        var seuilPct = type === 'societe' ? 34 : 100;
        if (type === 'societe' && pctEng < seuilPct) {
            warnings.push('Engagement collectif insuffisant : ' + pctEng + '% < seuil ' + seuilPct + '%');
            eligible = false;
        }
        if (!engCol && type === 'societe') {
            warnings.push('Sans engagement collectif formel : v\u00e9rifier si engagement r\u00e9put\u00e9 acquis (d\u00e9tention > ' + seuilPct + '% + direction > 2 ans)');
        }
        if (!heritierRepreneur) {
            warnings.push('AUCUN h\u00e9ritier repreneur d\u00e9sign\u00e9 \u2192 Dutreil impossible');
            eligible = false;
        }

        var abatSans = exoConj ? 0 : F.getAbattement(lien, true) * nbDonors;
        var partSans = valeurTransmise / nbHer;
        var droitsSans = exoConj ? 0 : F.calcDroits(Math.max(0, partSans - abatSans), F.getBareme(lien)) * nbHer;

        var tauxExo = 0.75;
        var valeurExoneree = Math.round(valeurTransmise * tauxExo);
        var valeurTaxable = valeurTransmise - valeurExoneree;
        var partAvec = valeurTaxable / nbHer;
        var droitsAvec = exoConj ? 0 : F.calcDroits(Math.max(0, partAvec - abatSans), F.getBareme(lien)) * nbHer;
        var economie = droitsSans - droitsAvec;

        var npRatio = F.getNPRatio(ageDon);
        var valeurNP = Math.round(valeurTransmise * npRatio);
        var valeurNPapresDutreil = Math.round(valeurNP * (1 - tauxExo));
        var partNPDutreil = valeurNPapresDutreil / nbHer;
        var droitsNPDutreil = exoConj ? 0 : F.calcDroits(Math.max(0, partNPDutreil - abatSans), F.getBareme(lien)) * nbHer;
        var economieNPDutreil = droitsSans - droitsNPDutreil;

        var dureeConservation = type === 'societe' ? 6 : 4;
        var dureeExploitation = type === 'individuelle' ? 3 : 0;

        return {
            eligible: eligible, valeurEntreprise: valeurTotale, valeurTransmise: valeurTransmise,
            pctDetenu: pctDetenu, typeEntreprise: type,
            sansDutreil: { droits: droitsSans, valeurTaxable: valeurTransmise },
            avecDutreil: { droits: droitsAvec, valeurTaxable: valeurTaxable, exoneration: valeurExoneree, tauxExo: 75 },
            economie: economie,
            comboDonationNP: {
                ageDonateur: ageDon, npRatio: npRatio, valeurNP: valeurNP,
                valeurNPapresDutreil: valeurNPapresDutreil, droits: droitsNPDutreil, economie: economieNPDutreil
            },
            conditions: {
                engagementCollectif: { duree: '2 ans minimum', seuil: type === 'societe' ? (seuilPct + '% des droits de vote') : 'Totalit\u00e9' },
                engagementIndividuel: { duree: dureeConservation + ' ans (depuis 2026)' },
                directionActivite: { description: 'Au moins 1 h\u00e9ritier dirige ' + (type === 'societe' ? dureeConservation : dureeExploitation) + ' ans' },
                interdictions: ['Ne pas c\u00e9der les parts avant ' + dureeConservation + ' ans', 'Ne pas incorporer biens personnels', type === 'societe' ? 'Attestation engagement annuelle au fisc' : null].filter(Boolean)
            },
            paiement: computePaiementDiffere({ droits: droitsAvec, typeEntreprise: type, pctDetenuParHeritier: pctDetenu / nbHer }),
            warnings: warnings,
            article: type === 'societe' ? 'Art. 787 B CGI' : 'Art. 787 C CGI'
        };
    }

    // ============================================================
    // 2. FACILIT\u00c9S DE PAIEMENT
    // ============================================================

    function computePaiementDiffere(params) {
        var p = params || {};
        var droits = p.droits || 0;
        var pctParHer = p.pctDetenuParHeritier || 10;
        var tauxApplicable = pctParHer >= 10 ? 0.006 : 0.02;
        var interetsDiffere = Math.round(droits * tauxApplicable * 5);
        var mensualiteFractionne = droits > 0 ? Math.round(droits / 20) : 0;
        var interetsFractionne = Math.round(droits * tauxApplicable * 5);
        return {
            entreprise: {
                differe: { duree: '5 ans', interets: interetsDiffere },
                fractionne: { duree: '10 ans apr\u00e8s le diff\u00e9r\u00e9', versements: 20, montantParVersement: mensualiteFractionne, interets: interetsFractionne },
                dureeTotal: '15 ans',
                tauxInteret: Math.round(tauxApplicable * 10000) / 100 + '%',
                explanation: 'Diff\u00e9r\u00e9 5 ans (0\u20ac) + fractionn\u00e9 10 ans (' + mensualiteFractionne + '\u20ac/6 mois). Taux ' + (tauxApplicable * 100) + '%.'
            },
            garanties: ['Hypoth\u00e8que sur un bien immobilier', 'Nantissement contrat AV', 'Caution bancaire'],
            article: 'Art. 1717 CGI + art. 396-404 annexe III CGI'
        };
    }

    // ============================================================
    // 3. UI — Enrichir les actifs pro quand Dutreil = Oui
    // ============================================================

    function enrichProItem(proEl, proId) {
        if (proEl.querySelector('.dutreil-details')) return; // d\u00e9j\u00e0 enrichi

        var state = getState(); if (!state) return;
        var proItem = (state.pro || []).find(function(p) { return p.id === proId; });
        if (!proItem || !proItem.dutreil) return;

        // Injecter les champs Dutreil suppl\u00e9mentaires
        var h = '<div class="dutreil-details" style="margin-top:12px;padding:12px 14px;border-radius:10px;background:rgba(168,85,247,.04);border:1px solid rgba(168,85,247,.12);">';
        h += '<div style="font-size:.72rem;font-weight:700;color:var(--accent-purple);margin-bottom:8px;"><i class="fas fa-shield-alt" style="margin-right:4px;"></i> D\u00e9tails Pacte Dutreil</div>';
        h += '<div class="form-grid cols-3" style="gap:10px;">';

        // Nom entreprise
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">Nom entreprise</label>';
        h += '<input type="text" placeholder="Ex: Ma SARL" style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'nom\',this.value)"></div>';

        // Soci\u00e9t\u00e9 cot\u00e9e
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">Soci\u00e9t\u00e9 cot\u00e9e ?</label>';
        h += '<select style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'cotee\',this.value===\'oui\')">';
        h += '<option value="non">Non cot\u00e9e</option><option value="oui">Cot\u00e9e</option></select></div>';

        // Engagement collectif
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">Engagement collectif sign\u00e9 ?</label>';
        h += '<select style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'engagementCollectif\',this.value===\'oui\')">';
        h += '<option value="oui" selected>Oui (2 ans min)</option><option value="non">Non</option></select></div>';

        // % engagement
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">% droits de vote engag\u00e9s</label>';
        h += '<input type="number" min="1" max="100" value="34" style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'pctEngagement\',+this.value)"></div>';

        // Repreneur d\u00e9sign\u00e9
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">H\u00e9ritier repreneur ?</label>';
        h += '<select style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'heritierRepreneur\',this.value===\'oui\')">';
        h += '<option value="oui" selected>Oui</option><option value="non">Non</option></select></div>';

        // Nom repreneur
        h += '<div class="form-group"><label class="form-label" style="font-size:.62rem;">Nom du repreneur</label>';
        h += '<input type="text" placeholder="Enfant 1" style="height:34px;font-size:.78rem;" onchange="DutreilEntreprise.updateProDutreil(' + proId + ',\'nomRepreneur\',this.value)"></div>';

        h += '</div>'; // close form-grid

        // Info box
        h += '<div style="margin-top:8px;font-size:.68rem;padding:6px 10px;border-radius:6px;background:rgba(168,85,247,.06);color:var(--text-secondary);line-height:1.4;">';
        h += '<i class="fas fa-info-circle" style="color:var(--accent-purple);margin-right:4px;"></i>';
        h += '<strong>75% exon\u00e9ration</strong> sur la valeur des parts. Conservation ' + (proItem.type === 'ei' || proItem.type === 'fonds' ? '4' : '6') + ' ans (2026). ';
        h += 'Combo donation NP + Dutreil = quasi gratuit si donateur < 70 ans.';
        h += '</div>';
        h += '</div>';

        var formGrid = proEl.querySelector('.form-grid');
        if (formGrid) formGrid.insertAdjacentHTML('afterend', h);

        // Init default values
        if (!proItem.engagementCollectif) proItem.engagementCollectif = true;
        if (!proItem.pctEngagement) proItem.pctEngagement = 34;
        if (proItem.heritierRepreneur === undefined) proItem.heritierRepreneur = true;
    }

    function removeProDutreilDetails(proEl) {
        var details = proEl.querySelector('.dutreil-details');
        if (details) details.remove();
    }

    function updateProDutreil(proId, field, value) {
        var state = getState(); if (!state) return;
        var proItem = (state.pro || []).find(function(p) { return p.id === proId; });
        if (proItem) proItem[field] = value;
    }

    // Observer le toggle Dutreil dans chaque actif pro
    function observeProList() {
        var proList = document.getElementById('pro-list');
        if (!proList) return;

        // Listener sur les changements de select (capture Dutreil toggle)
        proList.addEventListener('change', function(e) {
            var sel = e.target;
            if (!sel || sel.tagName !== 'SELECT') return;

            // D\u00e9tecter si c'est le select Dutreil (valeur = "oui" ou "non")
            var opts = sel.querySelectorAll('option');
            var isDutreilToggle = false;
            opts.forEach(function(o) { if (o.value === 'oui' && o.textContent.indexOf('75%') >= 0) isDutreilToggle = true; });
            if (!isDutreilToggle) return;

            var listItem = sel.closest('.list-item');
            if (!listItem) return;
            var proId = parseInt(listItem.id.replace('pro-', ''));
            if (isNaN(proId)) return;

            if (sel.value === 'oui') {
                setTimeout(function() { enrichProItem(listItem, proId); }, 100);
            } else {
                removeProDutreilDetails(listItem);
            }
        });

        // V\u00e9rifier les items existants
        proList.querySelectorAll('.list-item').forEach(function(item) {
            var proId = parseInt(item.id.replace('pro-', ''));
            if (isNaN(proId)) return;
            var state = getState();
            var proItem = state ? (state.pro || []).find(function(p) { return p.id === proId; }) : null;
            if (proItem && proItem.dutreil) enrichProItem(item, proId);
        });
    }

    // ============================================================
    // 4. RENDU — Panneau step 5 (lit state.pro + state.financials)
    // ============================================================

    function renderDutreilPanel() {
        var state = getState(); if (!state) return;
        var existing = document.getElementById('dutreil-panel');
        if (existing) existing.remove();

        // Chercher dans state.pro (prioritaire) et state.financials
        var valeurEntreprise = 0;
        var hasDutreil = false;
        var proItem = null;

        (state.pro || []).forEach(function(p) {
            if (p.dutreil && p.valeur > 0) {
                valeurEntreprise += p.valeur * (p.pctDetention || 100) / 100;
                hasDutreil = true;
                if (!proItem) proItem = p;
            }
        });

        // Fallback: financials
        if (!hasDutreil) {
            (state.financials || []).forEach(function(f) {
                if (f.type === 'parts_societe' || f.type === 'entreprise' || f.type === 'actions_non_cotees') {
                    valeurEntreprise += (f.montant || 0);
                    hasDutreil = true;
                }
            });
        }

        if (!hasDutreil || valeurEntreprise === 0) return;

        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
        var lien = nbEnfants > 0 ? 'enfant' : (bens[0] || {}).lien || 'enfant';

        var ageDon = 55;
        var donors = typeof FamilyGraph !== 'undefined' && FamilyGraph.getDonors ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].age) ageDon = donors[0].age;

        var result = computeDutreil({
            valeurEntreprise: valeurEntreprise,
            pctDetenu: proItem ? (proItem.pctDetention || 100) : 100,
            typeEntreprise: proItem && (proItem.type === 'ei' || proItem.type === 'fonds') ? 'individuelle' : 'societe',
            nbHeritiers: Math.max(1, nbEnfants),
            lienHeritier: lien,
            nbDonors: donors.length > 1 ? 2 : 1,
            engagementCollectif: proItem ? proItem.engagementCollectif !== false : true,
            pctEngagement: proItem ? (proItem.pctEngagement || 34) : 34,
            heritierRepreneur: proItem ? proItem.heritierRepreneur !== false : true,
            ageDonateur: ageDon
        });

        if (!result.eligible) return;

        var html = '<div class="section-card" id="dutreil-panel" style="border-color:rgba(168,85,247,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-industry" style="background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(168,85,247,.1));color:var(--accent-purple);"></i> Pacte Dutreil \u2014 Transmission entreprise</div>';

        // Comparatif 3 colonnes
        html += '<div style="display:flex;gap:12px;margin-bottom:16px;">';
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">SANS DUTREIL</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-coral);">' + fmt(result.sansDutreil.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">Tax\u00e9 sur ' + fmt(result.sansDutreil.valeurTaxable) + '</div></div>';
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">AVEC DUTREIL (75% exo)</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-green);">' + fmt(result.avecDutreil.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">Tax\u00e9 sur ' + fmt(result.avecDutreil.valeurTaxable) + '</div></div>';
        html += '<div style="flex:1;padding:14px;border-radius:12px;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">DONATION NP + DUTREIL</div>';
        html += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-purple);">' + fmt(result.comboDonationNP.droits) + '</div>';
        html += '<div style="font-size:.70rem;color:var(--text-secondary);">NP ' + Math.round(result.comboDonationNP.npRatio * 100) + '% \u00d7 25%</div></div>';
        html += '</div>';

        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(16,185,129,.08);margin-bottom:12px;font-size:.82rem;font-weight:600;color:var(--accent-green);text-align:center;">';
        html += '\ud83d\udca1 \u00c9conomie Dutreil : ' + fmt(result.economie) + ' | Combo NP+Dutreil : ' + fmt(result.comboDonationNP.economie) + '</div>';

        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.1);margin-bottom:12px;font-size:.78rem;">';
        html += '<i class="fas fa-calendar" style="color:var(--accent-blue);margin-right:6px;"></i><strong>Paiement</strong> : ' + result.paiement.entreprise.explanation + '</div>';

        html += '<div style="padding:10px 14px;border-radius:10px;background:rgba(255,179,0,.04);border:1px solid rgba(255,179,0,.1);font-size:.75rem;color:var(--text-secondary);">';
        html += '<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px;"></i>';
        html += '<strong>Conditions</strong> : Conservation ' + result.conditions.engagementIndividuel.duree + ' | ' + result.conditions.directionActivite.description + ' | Engagement collectif ' + result.conditions.engagementCollectif.seuil + '</div>';

        if (result.warnings.length > 0) {
            html += '<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(255,107,107,.06);border:1px solid rgba(255,107,107,.12);font-size:.72rem;color:var(--accent-coral);">';
            html += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>' + result.warnings.join(' | ') + '</div>';
        }

        html += '</div>';

        var anchor = document.getElementById('strategy-recommendations-panel') || document.getElementById('fiscal-optimizations-panel') || document.getElementById('transmission-map');
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

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;
        var _orig = SD.calculateResults;
        SD.calculateResults = function() { _orig.call(SD); setTimeout(renderDutreilPanel, 650); };

        // Observer #pro-list pour enrichir les items Dutreil
        var iv = setInterval(function() {
            var proList = document.getElementById('pro-list');
            if (proList) { observeProList(); clearInterval(iv); }
        }, 1000);

        // Re-observer apr\u00e8s changement de step
        document.addEventListener('click', function(e) {
            if (e.target.closest('.step-item')) setTimeout(observeProList, 500);
        });

        console.log('[DutreilEntreprise v1.1] Loaded \u2014 75% exo + UI enrichment actifs pro');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 850); });
    else setTimeout(init, 850);

    return {
        computeDutreil: computeDutreil,
        computePaiementDiffere: computePaiementDiffere,
        updateProDutreil: updateProDutreil
    };
})();
