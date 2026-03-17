/**
 * partage-succession.js v1.3 — + RegimeBiens quote-part successorale
 *
 * v1.1: Rendement/loyers dans simulation partage
 * v1.2: Fix state.immos->state.immo, state.financials->state.finance
 * v1.3: Integration RegimeBiens - valeur dans masse = valeurBrute * quotePart
 *
 * @version 1.3.0 — 2026-03-17
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
        if (biens.length === 0 || heritiers.length === 0) return { applicable: false, raison: 'Pas de biens ou pas d\'heritiers' };
        var masseTotal = 0, revenuTotal = 0;
        biens.forEach(function(b) { masseTotal += (b.valeur || 0); b._revenuAnnuel = Math.round((b.valeur || 0) * (b.rendement || 0)); revenuTotal += b._revenuAnnuel; });
        var masseNette = masseTotal - dettes;
        var partsLegales = [];
        heritiers.forEach(function(h) {
            var frac = h.partLegale || (1 / heritiers.length);
            partsLegales.push({ nom: h.nom, lien: h.lien, partLegale: frac, montantDu: Math.round(masseNette * frac), revenuDu: Math.round(revenuTotal * frac), souhaite: h.souhaite || [], attributionPref: !!h.attributionPref });
        });
        var attributionPref = null;
        var conjoint = partsLegales.find(function(h) { return h.attributionPref || h.lien === 'conjoint_pacs'; });
        if (conjoint && hasConjoint) {
            var rpBien = biens.find(function(b) { return b.type === 'immo' && b.isRP; });
            if (rpBien) { attributionPref = { beneficiaire: conjoint.nom, bien: rpBien.nom, valeur: rpBien.valeur, dePleinDroit: unionType === 'mariage', soulteAPayer: Math.max(0, rpBien.valeur - conjoint.montantDu), delaiPaiement: unionType === 'mariage' ? '10 ans' : 'Immediat', article: 'Art. 831-2 CC' }; }
        }
        var lots = composerLots(biens, partsLegales, attributionPref);
        var equite = calculerEquite(lots, partsLegales, masseNette, revenuTotal);
        var lesion = detecterLesion(lots);
        var alertes = genererAlertes(biens, lots, partsLegales, equite, lesion, revenuTotal);
        var alternatives = proposerAlternatives(biens, lots, equite, lesion);
        return { applicable: true, massePartageable: masseTotal, dettes: dettes, masseNette: masseNette, revenuTotalAnnuel: revenuTotal,
            rendementMoyenPatrimoine: masseTotal > 0 ? Math.round(revenuTotal / masseTotal * 10000) / 100 : 0,
            nbHeritiers: heritiers.length, nbBiens: biens.length, partsLegales: partsLegales, lots: lots, attributionPreferentielle: attributionPref,
            equite: equite, lesion: lesion, alertes: alertes, alternatives: alternatives };
    }

    function composerLots(biens, heritiers, attrPref) {
        var lots = [];
        var biensDisp = biens.map(function(b) { return { nom: b.nom, valeur: b.valeur, type: b.type, divisible: b.divisible !== false, attribue: false, affectif: !!b.affectif, rendement: b.rendement || 0, revenuAnnuel: b._revenuAnnuel || 0 }; });
        heritiers.forEach(function(h) {
            var lot = { heritier: h.nom, biens: [], valeurLot: 0, revenuLot: 0, montantDu: h.montantDu, revenuDu: h.revenuDu || 0, soulte: 0 };
            if (attrPref && attrPref.beneficiaire === h.nom) {
                var rpIdx = biensDisp.findIndex(function(b) { return !b.attribue && b.type === 'immo' && (b.nom.indexOf('RP') >= 0 || b.nom.indexOf('principal') >= 0); });
                if (rpIdx < 0) rpIdx = biensDisp.findIndex(function(b) { return !b.attribue && b.type === 'immo'; });
                if (rpIdx >= 0) { lot.biens.push(biensDisp[rpIdx]); lot.valeurLot += biensDisp[rpIdx].valeur; lot.revenuLot += biensDisp[rpIdx].revenuAnnuel; biensDisp[rpIdx].attribue = true; }
            }
            if (h.souhaite && h.souhaite.length > 0) { h.souhaite.forEach(function(souhait) { var idx = biensDisp.findIndex(function(b) { return !b.attribue && b.nom === souhait; }); if (idx >= 0 && lot.valeurLot + biensDisp[idx].valeur <= h.montantDu * 1.30) { lot.biens.push(biensDisp[idx]); lot.valeurLot += biensDisp[idx].valeur; lot.revenuLot += biensDisp[idx].revenuAnnuel; biensDisp[idx].attribue = true; } }); }
            lots.push(lot);
        });
        var restants = biensDisp.filter(function(b) { return !b.attribue; });
        restants.sort(function(a, b) { return b.valeur - a.valeur; });
        restants.forEach(function(bien) { var meilleur = null, meilleurEcart = -Infinity; lots.forEach(function(lot) { var ecart = lot.montantDu - lot.valeurLot; if (ecart > meilleurEcart) { meilleurEcart = ecart; meilleur = lot; } }); if (meilleur) { meilleur.biens.push(bien); meilleur.valeurLot += bien.valeur; meilleur.revenuLot += bien.revenuAnnuel; bien.attribue = true; } });
        lots.forEach(function(lot) { lot.soulte = lot.valeurLot - lot.montantDu; lot.ecartPct = lot.montantDu > 0 ? Math.round(Math.abs(lot.soulte) / lot.montantDu * 100) : 0; lot.rendementLot = lot.valeurLot > 0 ? Math.round(lot.revenuLot / lot.valeurLot * 10000) / 100 : 0; lot.ecartRevenu = lot.revenuLot - (lot.revenuDu || 0); });
        return lots;
    }

    function calculerEquite(lots, heritiers, masseNette, revenuTotal) {
        if (lots.length === 0) return { score: 0, scoreValeur: 0, scoreRevenu: 0, niveau: 'inconnu' };
        var ecartMaxVal = 0; lots.forEach(function(lot) { var e = Math.abs(lot.soulte); if (e > ecartMaxVal) ecartMaxVal = e; });
        var ratioVal = masseNette > 0 ? ecartMaxVal / masseNette : 0;
        var scoreValeur = Math.max(0, Math.min(100, Math.round(100 - ratioVal * 400)));
        var ecartMaxRev = 0; lots.forEach(function(lot) { var e = Math.abs(lot.ecartRevenu || 0); if (e > ecartMaxRev) ecartMaxRev = e; });
        var ratioRev = revenuTotal > 0 ? ecartMaxRev / revenuTotal : 0;
        var scoreRevenu = revenuTotal > 0 ? Math.max(0, Math.min(100, Math.round(100 - ratioRev * 400))) : 100;
        var score = revenuTotal > 0 ? Math.round(scoreValeur * 0.70 + scoreRevenu * 0.30) : scoreValeur;
        var niveau = score >= 90 ? 'excellent' : score >= 70 ? 'bon' : score >= 50 ? 'acceptable' : score >= 30 ? 'desequilibre' : 'critique';
        var couleur = score >= 70 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';
        return { score: score, scoreValeur: scoreValeur, scoreRevenu: scoreRevenu, niveau: niveau, couleur: couleur, ecartMax: ecartMaxVal, soulteMaximale: ecartMaxVal, ecartMaxRevenu: ecartMaxRev,
            interpretation: score >= 90 ? 'Partage quasi parfait.' : score >= 70 ? 'Partage equilibre.' : score >= 50 ? 'Soultes significatives.' : 'Tres desequilibre.' };
    }

    function detecterLesion(lots) {
        var lesions = [];
        lots.forEach(function(lot) { if (lot.montantDu > 0 && lot.valeurLot < lot.montantDu * 0.75) lesions.push({ heritier: lot.heritier, montantDu: lot.montantDu, valeurRecue: lot.valeurLot, deficit: lot.montantDu - lot.valeurLot, deficitPct: Math.round((1 - lot.valeurLot / lot.montantDu) * 100), article: 'Art. 889 CC' }); });
        return { lesionDetectee: lesions.length > 0, cas: lesions, warning: lesions.length > 0 ? 'LESION : ' + lesions.length + ' heritier(s) < 75%. Annulable (art. 889 CC, 2 ans).' : '' };
    }

    function genererAlertes(biens, lots, heritiers, equite, lesion, revenuTotal) {
        var alertes = [];
        var indivisibles = biens.filter(function(b) { return b.divisible === false; });
        if (indivisibles.length > 0 && heritiers.length > 1) alertes.push({ type: 'warning', icon: 'fa-puzzle-piece', message: indivisibles.length + ' bien(s) indivisible(s)', conseil: 'Un heritier prend le bien + soulte, ou licitation.' });
        var affectifs = biens.filter(function(b) { return b.affectif; });
        if (affectifs.length > 0) alertes.push({ type: 'info', icon: 'fa-heart', message: 'Biens sentimentaux : ' + affectifs.map(function(b) { return b.nom; }).join(', '), conseil: 'Discussion familiale AVANT. Donation-partage vivant = paix assuree.' });
        var maxSoulte = 0; lots.forEach(function(l) { if (Math.abs(l.soulte) > maxSoulte) maxSoulte = Math.abs(l.soulte); });
        if (maxSoulte > 50000) alertes.push({ type: 'warning', icon: 'fa-euro-sign', message: 'Soulte maximale : ' + fmt(maxSoulte), conseil: 'Conjoint : delai 10 ans. Autres : immediat.' });
        if (lesion.lesionDetectee) alertes.push({ type: 'error', icon: 'fa-gavel', message: lesion.warning, conseil: 'Reequilibrer les lots.' });
        if (revenuTotal > 0 && lots.length >= 2) { var rendements = lots.map(function(l) { return l.rendementLot || 0; }); var maxRdt = Math.max.apply(null, rendements), minRdt = Math.min.apply(null, rendements); if (maxRdt - minRdt > 2) alertes.push({ type: 'warning', icon: 'fa-chart-line', message: 'Rendement desequilibre (ecart ' + Math.round((maxRdt - minRdt) * 10) / 10 + ' pts)', conseil: 'Melanger biens a fort et faible rendement par lot.' }); }
        // v1.3: Alert if regime affects mass
        var biensCommuns = biens.filter(function(b) { return b.natureBien && b.natureBien < 100; });
        if (biensCommuns.length > 0) alertes.push({ type: 'info', icon: 'fa-balance-scale', message: biensCommuns.length + ' bien(s) en communaute/indivision - valeur ajustee dans la masse', conseil: 'Seule la quote-part du defunt entre dans la succession (art. 1401+ CC).' });
        return alertes;
    }

    function proposerAlternatives(biens, lots, equite, lesion) {
        var alternatives = [];
        if (equite.score < 70 || lesion.lesionDetectee) alternatives.push({ id: 'vente_partielle', label: 'Vente de certains biens + partage du produit', adapte: equite.score < 50 });
        alternatives.push({ id: 'convention_indivision', label: 'Convention d\'indivision (5 ans renouvelables)', article: 'Art. 1873-1 CC', adapte: true });
        alternatives.push({ id: 'donation_partage_vivant', label: 'Donation-partage DE SON VIVANT', article: 'Art. 1076+ CC', recommande: true, adapte: true });
        return alternatives;
    }

    function renderPartagePanel() {
        var state = getState(); if (!state) return;
        var existing = document.getElementById('partage-succession-panel');
        if (existing) existing.remove();
        var biens = [];
        // v1.3: Use RegimeBiens.getValeurSuccessorale for adjusted mass
        (state.immo || []).forEach(function(b) {
            var loyer = b.loyerMensuel || 0;
            var valeurBrute = b.valeur || 0;
            var valeur = typeof RegimeBiens !== 'undefined' && RegimeBiens.getValeurSuccessorale ? RegimeBiens.getValeurSuccessorale(b.id, valeurBrute) : valeurBrute;
            var rendement = valeur > 0 ? loyer * 12 / valeur : 0;
            var naturePct = typeof RegimeBiens !== 'undefined' && RegimeBiens.getQuotePartSuccessorale ? RegimeBiens.getQuotePartSuccessorale(b.id) : 100;
            biens.push({ nom: b.label || b.nom || 'Bien immobilier', valeur: valeur, type: 'immo', divisible: false, isRP: b.usageActuel === 'rp', affectif: !!b.affectif, rendement: rendement, natureBien: naturePct });
        });
        (state.finance || []).forEach(function(f) { if (f.type !== 'assurance_vie' && f.type !== 'per') biens.push({ nom: f.nom || f.type, valeur: f.montant || 0, type: 'financier', divisible: true, rendement: 0 }); });
        (state.pro || []).forEach(function(p) { if (p.valeur > 0) biens.push({ nom: p.nom || 'Actif pro', valeur: Math.round(p.valeur * (p.pctDetention || 100) / 100), type: 'pro', divisible: false, rendement: 0 }); });
        var heritiers = [], bens = state.beneficiaries || [];
        bens.forEach(function(b) { heritiers.push({ nom: b.nom || b.prenom || b.lien, lien: b.lien, partLegale: 1 / bens.length, attributionPref: b.lien === 'conjoint_pacs' }); });
        if (biens.length < 2 || heritiers.length < 2) return;
        var result = simulerPartage({ biens: biens, heritiers: heritiers, unionType: state._unionType || 'mariage' });
        if (!result.applicable) return;
        var hasRevenu = result.revenuTotalAnnuel > 0;
        var html = '<div class="section-card" id="partage-succession-panel" style="border-color:rgba(59,130,246,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-balance-scale" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Simulation du partage</div>';
        html += '<div style="display:flex;gap:12px;margin-bottom:16px;">';
        html += '<div style="flex:1;padding:16px;border-radius:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);text-align:center;">';
        html += '<div style="font-size:.68rem;color:var(--text-muted);">EQUITE GLOBALE</div>';
        html += '<div style="font-size:1.8rem;font-weight:900;color:' + result.equite.couleur + ';">' + result.equite.score + '/100</div>';
        html += '<div style="font-size:.72rem;color:var(--text-secondary);">' + result.equite.niveau + '</div></div>';
        if (hasRevenu) { html += '<div style="flex:1;padding:16px;border-radius:12px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.1);text-align:center;"><div style="font-size:.68rem;color:var(--text-muted);">REVENUS</div><div style="font-size:1.2rem;font-weight:700;color:var(--text-primary);">' + fmt(result.revenuTotalAnnuel) + '/an</div><div style="font-size:.72rem;color:var(--text-secondary);">Rendement moy. ' + result.rendementMoyenPatrimoine + '%</div></div>'; }
        html += '</div>';
        var cols = ['Heritier', 'Part legale', 'Biens recus', 'Valeur lot'];
        if (hasRevenu) cols.push('Revenu/an', 'Rdt');
        cols.push('Soulte');
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);margin-bottom:16px;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr style="background:rgba(198,134,66,.06);">';
        cols.forEach(function(h) { html += '<th style="padding:10px 8px;text-align:' + (h.indexOf('ritier') >= 0 || h.indexOf('Biens') >= 0 ? 'left' : 'right') + ';font-weight:600;font-size:.72rem;">' + h + '</th>'; });
        html += '</tr></thead><tbody>';
        result.lots.forEach(function(lot) {
            var sc = lot.soulte > 0 ? 'var(--accent-coral)' : lot.soulte < 0 ? 'var(--accent-green)' : 'var(--text-muted)';
            var sl = lot.soulte > 0 ? 'Doit ' + fmt(lot.soulte) : lot.soulte < 0 ? 'Recoit ' + fmt(Math.abs(lot.soulte)) : '--';
            html += '<tr style="border-bottom:1px solid rgba(198,134,66,.05);">';
            html += '<td style="padding:8px;font-weight:600;">' + lot.heritier + '</td>';
            html += '<td style="padding:8px;text-align:right;">' + fmt(lot.montantDu) + '</td>';
            html += '<td style="padding:8px;font-size:.70rem;">' + lot.biens.map(function(b) { return b.nom; }).join(', ') + '</td>';
            html += '<td style="padding:8px;text-align:right;font-weight:600;">' + fmt(lot.valeurLot) + '</td>';
            if (hasRevenu) { html += '<td style="padding:8px;text-align:right;color:var(--accent-green);font-weight:600;">' + fmt(lot.revenuLot) + '</td>'; html += '<td style="padding:8px;text-align:right;font-size:.70rem;">' + lot.rendementLot + '%</td>'; }
            html += '<td style="padding:8px;text-align:right;color:' + sc + ';font-weight:600;">' + sl + '</td></tr>';
        });
        html += '</tbody></table></div>';
        result.alertes.forEach(function(a) {
            var bg = a.type === 'error' ? 'rgba(255,107,107,.04)' : a.type === 'warning' ? 'rgba(255,179,0,.04)' : 'rgba(59,130,246,.04)';
            var bc = a.type === 'error' ? 'rgba(255,107,107,.15)' : a.type === 'warning' ? 'rgba(255,179,0,.15)' : 'rgba(59,130,246,.1)';
            html += '<div style="padding:10px 14px;border-radius:10px;background:' + bg + ';border:1px solid ' + bc + ';margin-bottom:8px;font-size:.78rem;">';
            html += '<i class="fas ' + a.icon + '" style="margin-right:6px;"></i><strong>' + a.message + '</strong>';
            html += '<div style="color:var(--text-muted);margin-top:4px;font-size:.72rem;">-> ' + a.conseil + '</div></div>';
        });
        html += '<div style="padding:12px 14px;border-radius:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);font-size:.78rem;">';
        html += '<i class="fas fa-lightbulb" style="color:var(--accent-green);margin-right:6px;"></i>';
        html += '<strong>Conseil : Donation-partage DE SON VIVANT</strong> -- Repartir maintenant evite tout conflit. (Art. 1076+ CC)</div></div>';
        var anchor = document.getElementById('dutreil-panel') || document.getElementById('strategy-recommendations-panel') || document.getElementById('fiscal-optimizations-panel');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
        else { var tm = document.getElementById('transmission-map'); if (tm) tm.insertAdjacentHTML('afterend', html); }
    }

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) { if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n); return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }

    function init() {
        if (typeof SD === 'undefined') return;
        var _orig = SD.calculateResults;
        SD.calculateResults = function() { _orig.call(SD); setTimeout(renderPartagePanel, 700); };
        console.log('[PartageSuccession v1.3] Loaded -- + RegimeBiens quote-part successorale');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 900); });
    else setTimeout(init, 900);

    return { simulerPartage: simulerPartage, calculerEquite: calculerEquite, detecterLesion: detecterLesion };
})();
