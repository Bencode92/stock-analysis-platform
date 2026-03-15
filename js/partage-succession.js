/**
 * partage-succession.js — Simulation du partage des biens entre héritiers
 *
 * @version 1.0.0 — 2026-03-15
 */
const PartageSuccession = (function() {
    'use strict';

    function simulerPartage(params) {
        var p = params || {};
        var biens = p.biens || [];
        var heritiers = p.heritiers || [];
        var dettes = p.dettes || 0;
        var unionType = p.unionType || 'mariage';
        var hasConjoint = p.hasConjointSurvivant !== false;

        if (biens.length === 0 || heritiers.length === 0) return { applicable: false, raison: 'Pas de biens ou pas d\'héritiers' };

        var masseTotal = 0;
        biens.forEach(function(b) { masseTotal += (b.valeur || 0); });
        var masseNette = masseTotal - dettes;

        var partsLegales = [];
        heritiers.forEach(function(h) {
            partsLegales.push({ nom: h.nom, lien: h.lien, partLegale: h.partLegale || (1 / heritiers.length),
                montantDu: Math.round(masseNette * (h.partLegale || (1 / heritiers.length))),
                souhaite: h.souhaite || [], attributionPref: !!h.attributionPref });
        });

        var attributionPref = null;
        var conjoint = partsLegales.find(function(h) { return h.attributionPref || h.lien === 'conjoint_pacs'; });
        if (conjoint && hasConjoint) {
            var rpBien = biens.find(function(b) { return b.type === 'immo' && (b.isRP || b.usage === 'rp'); });
            if (rpBien) {
                attributionPref = { beneficiaire: conjoint.nom, bien: rpBien.nom, valeur: rpBien.valeur,
                    dePleinDroit: unionType === 'mariage',
                    soulteAPayer: Math.max(0, rpBien.valeur - conjoint.montantDu),
                    delaiPaiement: unionType === 'mariage' ? '10 ans (50% comptant + solde étalé, taux légal 6,67%)' : 'Immédiat',
                    article: 'Art. 831-2 CC',
                    warnings: rpBien.valeur > conjoint.montantDu * 2 ? ['Soulte très élevée'] : [] };
            }
        }

        var lots = composerLots(biens, partsLegales, attributionPref);
        var equite = calculerEquite(lots, partsLegales, masseNette);
        var lesion = detecterLesion(lots);
        var alertes = genererAlertes(biens, lots, partsLegales, equite, lesion);
        var alternatives = proposerAlternatives(biens, lots, equite, lesion);

        return { applicable: true, massePartageable: masseTotal, dettes: dettes, masseNette: masseNette,
            nbHeritiers: heritiers.length, nbBiens: biens.length, partsLegales: partsLegales, lots: lots,
            attributionPreferentielle: attributionPref, equite: equite, lesion: lesion, alertes: alertes, alternatives: alternatives };
    }

    function composerLots(biens, heritiers, attrPref) {
        var lots = [];
        var biensDisp = biens.map(function(b) {
            return { nom: b.nom, valeur: b.valeur, type: b.type, divisible: b.divisible !== false,
                attribue: false, affectif: !!b.affectif, rendement: b.rendement || 0, localisation: b.localisation || '' };
        });

        heritiers.forEach(function(h) {
            var lot = { heritier: h.nom, biens: [], valeurLot: 0, montantDu: h.montantDu, soulte: 0 };
            if (attrPref && attrPref.beneficiaire === h.nom) {
                var rpIdx = biensDisp.findIndex(function(b) {
                    return !b.attribue && b.type === 'immo' && (b.nom.indexOf('RP') >= 0 || b.nom.indexOf('résidence') >= 0 || b.nom.indexOf('principal') >= 0);
                });
                if (rpIdx < 0) rpIdx = biensDisp.findIndex(function(b) { return !b.attribue && b.type === 'immo'; });
                if (rpIdx >= 0) { lot.biens.push(biensDisp[rpIdx]); lot.valeurLot += biensDisp[rpIdx].valeur; biensDisp[rpIdx].attribue = true; }
            }
            if (h.souhaite && h.souhaite.length > 0) {
                h.souhaite.forEach(function(souhait) {
                    var idx = biensDisp.findIndex(function(b) { return !b.attribue && b.nom === souhait; });
                    if (idx >= 0 && lot.valeurLot + biensDisp[idx].valeur <= h.montantDu * 1.30) {
                        lot.biens.push(biensDisp[idx]); lot.valeurLot += biensDisp[idx].valeur; biensDisp[idx].attribue = true;
                    }
                });
            }
            lots.push(lot);
        });

        var restants = biensDisp.filter(function(b) { return !b.attribue; });
        restants.sort(function(a, b) { return b.valeur - a.valeur; });
        restants.forEach(function(bien) {
            var meilleur = null, meilleurEcart = -Infinity;
            lots.forEach(function(lot) { var ecart = lot.montantDu - lot.valeurLot; if (ecart > meilleurEcart) { meilleurEcart = ecart; meilleur = lot; } });
            if (meilleur) { meilleur.biens.push(bien); meilleur.valeurLot += bien.valeur; bien.attribue = true; }
        });

        lots.forEach(function(lot) {
            lot.soulte = lot.valeurLot - lot.montantDu;
            lot.ecartPct = lot.montantDu > 0 ? Math.round(Math.abs(lot.soulte) / lot.montantDu * 100) : 0;
        });
        return lots;
    }

    function calculerEquite(lots, heritiers, masseNette) {
        if (lots.length === 0) return { score: 0, niveau: 'inconnu' };
        var ecartMax = 0, ecartTotal = 0;
        lots.forEach(function(lot) { var ecart = Math.abs(lot.soulte); ecartTotal += ecart; if (ecart > ecartMax) ecartMax = ecart; });
        var ecartMoyen = ecartTotal / lots.length;
        var ratio = masseNette > 0 ? ecartMax / masseNette : 0;
        var score = Math.max(0, Math.min(100, Math.round(100 - ratio * 400)));
        var niveau = score >= 90 ? 'excellent' : score >= 70 ? 'bon' : score >= 50 ? 'acceptable' : score >= 30 ? 'déséquilibré' : 'critique';
        var couleur = score >= 70 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';
        return { score: score, niveau: niveau, couleur: couleur, ecartMax: ecartMax, ecartMoyen: Math.round(ecartMoyen), soulteMaximale: ecartMax,
            interpretation: score >= 90 ? 'Partage quasi parfait — écarts minimes.'
                : score >= 70 ? 'Partage équilibré — soultes raisonnables.'
                : score >= 50 ? 'Partage délicat — soultes significatives. Envisager vente partielle.'
                : 'Partage très déséquilibré — risque de conflit élevé.' };
    }

    function detecterLesion(lots) {
        var lesions = [];
        lots.forEach(function(lot) {
            if (lot.montantDu > 0 && lot.valeurLot < lot.montantDu * 0.75) {
                lesions.push({ heritier: lot.heritier, montantDu: lot.montantDu, valeurRecue: lot.valeurLot,
                    deficit: lot.montantDu - lot.valeurLot, deficitPct: Math.round((1 - lot.valeurLot / lot.montantDu) * 100),
                    annulable: true, article: 'Art. 889 CC', delaiAction: '2 ans',
                    explanation: lot.heritier + ' lésé de ' + Math.round((1 - lot.valeurLot / lot.montantDu) * 100) + '%. Annulable.' });
            }
        });
        return { lesionDetectee: lesions.length > 0, cas: lesions,
            warning: lesions.length > 0 ? '\ud83d\udea8 LÉSION : ' + lesions.length + ' héritier(s) < 75%. Annulation possible (art. 889 CC, 2 ans).' : 'Aucune lésion.' };
    }

    function genererAlertes(biens, lots, heritiers, equite, lesion) {
        var alertes = [];
        var indivisibles = biens.filter(function(b) { return b.divisible === false; });
        if (indivisibles.length > 0 && heritiers.length > 1)
            alertes.push({ type: 'warning', icon: 'fa-puzzle-piece', message: indivisibles.length + ' bien(s) indivisible(s) : ' + indivisibles.map(function(b) { return b.nom; }).join(', '),
                conseil: 'Un héritier prend le bien + soulte, ou vente aux enchères (licitation).' });
        var affectifs = biens.filter(function(b) { return b.affectif; });
        if (affectifs.length > 0)
            alertes.push({ type: 'info', icon: 'fa-heart', message: 'Biens sentimentaux : ' + affectifs.map(function(b) { return b.nom; }).join(', '),
                conseil: 'Discussion familiale AVANT. Donation-partage vivant = paix assurée.' });
        var maxSoulte = 0;
        lots.forEach(function(l) { if (Math.abs(l.soulte) > maxSoulte) maxSoulte = Math.abs(l.soulte); });
        if (maxSoulte > 50000)
            alertes.push({ type: 'warning', icon: 'fa-euro-sign', message: 'Soulte maximale : ' + fmt(maxSoulte),
                conseil: 'Conjoint : délai 10 ans (50% comptant). Autres : immédiat. Alternative : vente partielle.' });
        if (lesion.lesionDetectee)
            alertes.push({ type: 'error', icon: 'fa-gavel', message: lesion.warning, conseil: 'Rééquilibrer les lots. Risque annulation (art. 889 CC, 2 ans).' });
        var nbImmo = biens.filter(function(b) { return b.type === 'immo'; }).length;
        if (nbImmo >= 2 && heritiers.length >= 2) {
            var valImmo = 0; biens.forEach(function(b) { if (b.type === 'immo') valImmo += b.valeur; });
            var pctImmo = Math.round(valImmo / (biens.reduce(function(s,b) { return s + b.valeur; }, 0) || 1) * 100);
            if (pctImmo > 70)
                alertes.push({ type: 'info', icon: 'fa-building', message: 'Patrimoine ' + pctImmo + '% immobilier — liquidité insuffisante pour soultes',
                    conseil: 'Envisager vente d\'un bien locatif pour financer les soultes.' });
        }
        return alertes;
    }

    function proposerAlternatives(biens, lots, equite, lesion) {
        var alternatives = [];
        if (equite.score < 70 || lesion.lesionDetectee)
            alternatives.push({ id: 'vente_partielle', label: 'Vente de certains biens + partage du produit',
                avantage: 'Partage parfaitement équitable', inconvenient: 'Perte patrimoine + PV', adapte: equite.score < 50 });
        alternatives.push({ id: 'convention_indivision', label: 'Convention d\'indivision (5 ans renouvelables)',
            avantage: 'Temps de réflexion, revenus partagés', inconvenient: 'Décisions à 2/3, blocage possible',
            cout: '~500-1 500€ notaire', article: 'Art. 1873-1 CC', adapte: true });
        alternatives.push({ id: 'mandataire', label: 'Mandataire de gestion (1 héritier désigné)',
            avantage: 'Décisions rapides', inconvenient: 'Responsable, révocable', adapte: lots.length >= 3 });
        if (equite.score >= 70 && equite.score < 90)
            alternatives.push({ id: 'tirage_sort', label: 'Tirage au sort des lots (art. 834 CC)',
                avantage: 'Impartial', inconvenient: 'Pas de choix personnel', adapte: true });
        alternatives.push({ id: 'donation_partage_vivant', label: '\u2b50 Donation-partage DE SON VIVANT',
            avantage: 'Zéro conflit, valeurs figées, paix familiale', inconvenient: 'Irrévocable',
            article: 'Art. 1076+ CC', adapte: true, recommande: true });
        return alternatives;
    }

    function renderPartagePanel() {
        var state = getState(); if (!state) return;
        var existing = document.getElementById('partage-succession-panel');
        if (existing) existing.remove();

        var biens = [];
        (state.immos || []).forEach(function(b) { biens.push({ nom: b.nom || 'Bien immobilier', valeur: b.valeur || 0, type: 'immo', divisible: false, isRP: b.usage === 'rp' || b.isRP }); });
        (state.financials || []).forEach(function(f) { if (f.type !== 'assurance_vie' && f.type !== 'per') biens.push({ nom: f.nom || f.type, valeur: f.montant || 0, type: 'financier', divisible: true }); });
        var heritiers = [], bens = state.beneficiaries || [];
        bens.forEach(function(b) { heritiers.push({ nom: b.nom || b.lien, lien: b.lien, partLegale: 1 / bens.length, attributionPref: b.lien === 'conjoint_pacs' }); });
        if (biens.length < 2 || heritiers.length < 2) return;

        var result = simulerPartage({ biens: biens, heritiers: heritiers, unionType: state._unionType || 'mariage' });
        if (!result.applicable) return;

        var html = '<div class="section-card" id="partage-succession-panel" style="border-color:rgba(59,130,246,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-balance-scale" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Simulation du partage</div>';
        html += '<div class="section-subtitle">Répartition des biens — équité, soultes et alertes</div>';
        html += '<div style="padding:16px;border-radius:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);margin-bottom:16px;text-align:center;">';
        html += '<div style="font-size:.72rem;color:var(--text-muted);">INDICE D\'ÉQUITÉ</div>';
        html += '<div style="font-size:2rem;font-weight:900;color:' + result.equite.couleur + ';">' + result.equite.score + '/100</div>';
        html += '<div style="font-size:.78rem;color:var(--text-secondary);">' + result.equite.interpretation + '</div></div>';
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);margin-bottom:16px;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr style="background:rgba(198,134,66,.06);">';
        ['Héritier', 'Part légale', 'Biens reçus', 'Valeur lot', 'Soulte'].forEach(function(h) { html += '<th style="padding:10px 12px;text-align:' + (h === 'Héritier' ? 'left' : 'right') + ';font-weight:600;">' + h + '</th>'; });
        html += '</tr></thead><tbody>';
        result.lots.forEach(function(lot) {
            var sc = lot.soulte > 0 ? 'var(--accent-coral)' : lot.soulte < 0 ? 'var(--accent-green)' : 'var(--text-muted)';
            var sl = lot.soulte > 0 ? 'Doit ' + fmt(lot.soulte) : lot.soulte < 0 ? 'Reçoit ' + fmt(Math.abs(lot.soulte)) : '\u2014';
            html += '<tr style="border-bottom:1px solid rgba(198,134,66,.05);"><td style="padding:8px 12px;font-weight:600;">' + lot.heritier + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;">' + fmt(lot.montantDu) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;font-size:.72rem;">' + lot.biens.map(function(b) { return b.nom; }).join(', ') + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;font-weight:600;">' + fmt(lot.valeurLot) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;color:' + sc + ';font-weight:600;">' + sl + '</td></tr>';
        });
        html += '</tbody></table></div>';
        result.alertes.forEach(function(a) {
            var bg = a.type === 'error' ? 'rgba(255,107,107,.04)' : a.type === 'warning' ? 'rgba(255,179,0,.04)' : 'rgba(59,130,246,.04)';
            var bc = a.type === 'error' ? 'rgba(255,107,107,.15)' : a.type === 'warning' ? 'rgba(255,179,0,.15)' : 'rgba(59,130,246,.1)';
            html += '<div style="padding:10px 14px;border-radius:10px;background:' + bg + ';border:1px solid ' + bc + ';margin-bottom:8px;font-size:.78rem;">';
            html += '<i class="fas ' + a.icon + '" style="margin-right:6px;"></i><strong>' + a.message + '</strong>';
            html += '<div style="color:var(--text-muted);margin-top:4px;font-size:.72rem;">\u2192 ' + a.conseil + '</div></div>';
        });
        html += '<div style="padding:12px 14px;border-radius:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);font-size:.78rem;">';
        html += '<i class="fas fa-lightbulb" style="color:var(--accent-green);margin-right:6px;"></i>';
        html += '<strong>Conseil : Donation-partage DE SON VIVANT</strong> — Répartir maintenant évite tout conflit. Valeurs figées, paix familiale. (Art. 1076+ CC)</div></div>';

        var anchor = document.getElementById('strategy-recommendations-panel') || document.getElementById('fiscal-optimizations-panel');
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
        SD.calculateResults = function() { _orig.call(SD); setTimeout(renderPartagePanel, 700); };
        console.log('[PartageSuccession v1] Loaded — lots, soultes, équité, lésion, alternatives');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 900); });
    else setTimeout(init, 900);

    return { simulerPartage: simulerPartage, calculerEquite: calculerEquite, detecterLesion: detecterLesion };
})();
