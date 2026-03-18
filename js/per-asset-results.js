/**
 * per-asset-results.js v1.1 — Phase 2+3 : Options par actif + strategie combinee
 *
 * v1.1: Lit state.obj + StrategyAdvisor.getDecisions() pour adapter les recos
 *       Ajoute section "Strategie combinee" (SCI multi-biens, mix AV+immo)
 *       Timeline actionnable avec etapes concretes et couts
 *
 * @version 1.1.0 — 2026-03-18
 */
(function() {
    'use strict';

    function init() {
        if (typeof SD === 'undefined' || !SD._fiscal) { setTimeout(init, 500); return; }
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(renderPerAsset, 800);
        };
        console.log('[PerAssetResults v1.1] Loaded — objectives-aware + combined strategy');
    }

    // ============================================================
    // CONTEXT : lire objectifs + decisions
    // ============================================================
    function getContext(state) {
        var obj = state.obj || {};
        var decisions = {};
        if (typeof StrategyAdvisor !== 'undefined' && StrategyAdvisor.getDecisions) {
            decisions = StrategyAdvisor.getDecisions() || {};
        }
        var donorAge = state._realDonorAge || state.donor1.age || 60;
        var npRatio = SD._fiscal.getNPRatio(donorAge);
        var npPct = Math.round(npRatio * 100);
        var FISCAL = SD._fiscal.getFISCAL();
        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var bens = state.beneficiaries || [];
        var nbBens = Math.max(1, bens.length);
        var lienBen = 'enfant';
        if (PO && PO.getDonors && PO.getEffectiveLien && bens.length > 0) {
            var rd = PO.getDonors().filter(function(d) { return d._isDonor; });
            if (rd.length > 0) lienBen = PO.getEffectiveLien(rd[0].id, bens[0].id, rd[0].role, bens[0].lien) || 'enfant';
        }
        var abatBen = SD._fiscal.getAbattement(lienBen, false);
        var baremeBen = SD._fiscal.getBareme(lienBen);
        var donorNom = state._realDonorNom || 'le donateur';

        // Decode key decisions
        var wantsControl = obj.revenus || obj.controle || findDecision(decisions, 'revenus', 'essentiels') || findDecision(decisions, 'revenus', 'complementaires');
        var wantsDirect = findDecision(decisions, 'indirect', 'non');
        var wantsIndirect = findDecision(decisions, 'indirect', 'oui') || findDecision(decisions, 'indirect', 'a_discuter');
        var wantsKeepAll = findDecision(decisions, 'immo-vision', 'garder');
        var wantsSCI = findDecision(decisions, 'immo-vision', 'restructurer') || obj.controle;
        var wantsSell = obj.vendre || findDecision(decisions, 'immo-vision', 'vendre_certains');

        return {
            obj: obj, decisions: decisions, donorAge: donorAge, npRatio: npRatio, npPct: npPct,
            FISCAL: FISCAL, bens: bens, nbBens: nbBens, lienBen: lienBen, abatBen: abatBen,
            baremeBen: baremeBen, donorNom: donorNom, PO: PO,
            wantsControl: wantsControl, wantsDirect: wantsDirect, wantsIndirect: wantsIndirect,
            wantsKeepAll: wantsKeepAll, wantsSCI: wantsSCI, wantsSell: wantsSell
        };
    }

    function findDecision(decisions, keyPart, valuePart) {
        var keys = Object.keys(decisions);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(keyPart) >= 0 && decisions[keys[i]] === valuePart) return true;
        }
        return false;
    }

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    function renderPerAsset() {
        var existing = document.getElementById('per-asset-results-panel');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var ctx = getContext(state);
        var immos = (state.immo || []).filter(function(im) { return (im.valeur || 0) > 0; });
        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie' && (f.valeur || 0) > 0; });
        var pros = (state.pro || []).filter(function(p) { return (p.valeur || 0) > 0; });

        if (immos.length === 0 && avItems.length === 0 && pros.length === 0) return;

        var html = '<div id="per-asset-results-panel">';

        // Section titre
        html += '<div class="section-card" style="border-color:rgba(16,185,129,.25);margin-bottom:4px;padding:20px 28px;">';
        html += '<div class="section-title"><i class="fas fa-th-list" style="background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(5,150,105,.12));color:var(--accent-green);"></i> Que faire de chaque actif ?</div>';
        html += '<div style="font-size:.75rem;color:var(--text-muted);">Bar\u00e8me art. 669 : NP = ' + ctx.npPct + '% (donateur ' + ctx.donorAge + ' ans). Abattement ' + formatLien(ctx.lienBen) + ' : ' + fmt(ctx.abatBen) + '. Recommandations adapt\u00e9es \u00e0 vos objectifs.</div>';

        // Objectifs actifs
        var activeObjs = [];
        if (ctx.obj.minimiser) activeObjs.push('\ud83d\udcb0 Min. droits');
        if (ctx.obj.revenus) activeObjs.push('\ud83d\udcca Revenus');
        if (ctx.obj.controle) activeObjs.push('\ud83d\udd12 Contr\u00f4le');
        if (ctx.obj.conjoint) activeObjs.push('\u2764\ufe0f Conjoint');
        if (ctx.obj.egalite) activeObjs.push('\u2696\ufe0f \u00c9galit\u00e9');
        if (ctx.obj.generation) activeObjs.push('\ud83d\udc76 G\u00e9n\u00e9ration');
        if (activeObjs.length > 0) {
            html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">';
            activeObjs.forEach(function(o) {
                html += '<span style="font-size:.62rem;padding:3px 8px;border-radius:6px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);">' + o + '</span>';
            });
            html += '</div>';
        }
        html += '</div>';

        // IMMOBILIER
        var totalImmo = 0;
        var recoParActif = [];
        immos.forEach(function(im) {
            totalImmo += im.valeur;
            var r = renderImmoBien(im, ctx, state);
            html += r.html;
            recoParActif.push(r.reco);
        });

        // AV
        avItems.forEach(function(av) {
            var r = renderAVContrat(av, ctx);
            html += r.html;
            recoParActif.push(r.reco);
        });

        // PRO
        pros.forEach(function(pro) {
            html += renderProActif(pro, ctx);
        });

        // ============================================================
        // STRATEGIE COMBINEE
        // ============================================================
        html += renderCombinedStrategy(immos, avItems, pros, ctx, totalImmo, recoParActif);

        html += '</div>';

        // Insert
        var warning = document.getElementById('succession-legale-warning');
        var baseline = document.getElementById('succession-baseline-panel');
        var anchor = warning || baseline;
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
        else {
            var step5 = document.getElementById('step-5');
            if (step5) { var h = step5.querySelector('.step-helper'); if (h) h.insertAdjacentHTML('afterend', html); }
        }
    }

    // ============================================================
    // IMMOBILIER
    // ============================================================
    function renderImmoBien(im, ctx, state) {
        var val = im.valeur;
        var nom = im.label || 'Bien immobilier';
        var isRP = im.usageActuel === 'rp';
        var isLocatif = im.usageActuel === 'locatif';
        var loyer = im.loyerMensuel || 0;
        var loyerAn = loyer * 12;
        var icon = isRP ? 'fa-home' : 'fa-building';
        var typeLabel = isRP ? 'R\u00e9sidence principale' : (isLocatif ? 'Bien locatif' : 'Immobilier');

        var partParBen = Math.round(val / ctx.nbBens);

        // A: Succession
        var baseSucc = Math.max(0, partParBen - SD._fiscal.getAbattement(ctx.lienBen, true));
        var droitsSucc = SD._fiscal.calcDroits(baseSucc, ctx.baremeBen) * ctx.nbBens;

        // B: Donation NP
        var valNP = Math.round(val * ctx.npRatio);
        var partNP = Math.round(valNP / ctx.nbBens);
        var baseNP = Math.max(0, partNP - ctx.abatBen);
        var droitsNP = SD._fiscal.calcDroits(baseNP, ctx.baremeBen) * ctx.nbBens;
        var fraisNP = Math.round(valNP * 0.018);
        var ecoNP = droitsSucc - droitsNP;

        // C: SCI + NP
        var valSCI = Math.round(val * 0.85);
        var valSCINP = Math.round(valSCI * ctx.npRatio);
        var partSCINP = Math.round(valSCINP / ctx.nbBens);
        var baseSCINP = Math.max(0, partSCINP - ctx.abatBen);
        var droitsSCI = SD._fiscal.calcDroits(baseSCINP, ctx.baremeBen) * ctx.nbBens;
        var fraisSCI = Math.round(valSCINP * 0.018) + 2000;
        var ecoSCI = droitsSucc - droitsSCI;

        // Determine best option based on objectives
        var bestOption = 'B';
        var bestReason = '';
        if (isRP) {
            bestOption = 'B';
            bestReason = esc(ctx.donorNom) + ' conserve l\'usage du logement (usufruit). Droits sur ' + ctx.npPct + '% seulement.';
            if (ctx.wantsIndirect) bestReason += ' Chemin indirect via enfant possible (+68k\u20ac d\'abattements cumul\u00e9s).';
        } else if (isLocatif) {
            if (ctx.wantsControl || ctx.wantsSCI) {
                bestOption = 'C';
                bestReason = 'SCI recommand\u00e9e : ' + esc(ctx.donorNom) + ' reste g\u00e9rant (contr\u00f4le total) + conserve les loyers (' + fmt(loyerAn) + '/an). D\u00e9cote 15%.';
            } else {
                bestOption = 'B';
                bestReason = 'NP simple : ' + esc(ctx.donorNom) + ' conserve les loyers (' + fmt(loyerAn) + '/an). Plus simple que la SCI.';
            }
            if (ctx.wantsSell) {
                bestReason += ' \u26a0\ufe0f Vente envisag\u00e9e : comparer vente avant/apr\u00e8s donation (purge PV).';
            }
        }

        var reco = { nom: nom, type: isRP ? 'rp' : 'locatif', val: val, option: bestOption, droitsOpt: bestOption === 'C' ? droitsSCI : droitsNP, droitsSucc: droitsSucc, eco: bestOption === 'C' ? ecoSCI : ecoNP };

        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(198,134,66,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
        h += '<i class="fas ' + icon + '" style="font-size:.9rem;color:var(--primary-color);width:32px;height:32px;border-radius:8px;background:rgba(198,134,66,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">' + esc(nom) + '</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + typeLabel + ' \u00b7 ' + fmt(val);
        if (loyerAn > 0) h += ' \u00b7 Loyer ' + fmt(loyer) + '/mois';
        h += '</div></div></div>';

        // Tableau options
        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.08);margin-bottom:10px;">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;">';
        h += '<thead><tr style="background:rgba(198,134,66,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;">Option</th>';
        h += '<th style="padding:8px 10px;text-align:right;">Droits</th>';
        h += '<th style="padding:8px 10px;text-align:right;">Frais</th>';
        h += '<th style="padding:8px 10px;text-align:right;">\u00c9conomie vs succession</th>';
        h += '</tr></thead><tbody>';

        h += optRow('A', 'Ne rien faire (succession)', droitsSucc, Math.round(val * 0.012), 0, false, '');
        h += optRow('B', 'Donation NP (' + ctx.npPct + '%)', droitsNP, fraisNP, ecoNP, bestOption === 'B', isRP ? 'Conserve l\'usage' : 'Conserve les loyers');
        if (val > 150000) h += optRow('C', 'SCI + NP parts (\u221215%)', droitsSCI, fraisSCI, ecoSCI, bestOption === 'C', 'D\u00e9cote 15% + contr\u00f4le g\u00e9rance');

        h += '</tbody></table></div>';

        // Recommandation
        h += '<div style="padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-check-circle" style="margin-right:6px;"></i><strong>Option ' + bestOption + '</strong> : ' + bestReason;
        h += ' <strong>\u00c9conomie ' + fmt(reco.eco) + '</strong>.';
        h += '</div>';

        h += '</div>';
        return { html: h, reco: reco };
    }

    // ============================================================
    // AV
    // ============================================================
    function renderAVContrat(av, ctx) {
        var val = av.valeur || 0;
        var versements = av.versements || 0;
        var primesAp70 = av.primesApres70 || 0;
        var primesAv70 = av.primesAvant70 || 0;
        if (primesAv70 === 0 && primesAp70 === 0 && ctx.donorAge >= 70) primesAp70 = versements || val;
        var gains = Math.max(0, val - primesAv70 - primesAp70);
        var is757B = ctx.donorAge >= 70 || primesAp70 > 0;

        // A: Garder (757B)
        var droitsA = 0;
        if (primesAp70 > 0) {
            var base757B = Math.max(0, primesAp70 - 30500);
            droitsA += SD._fiscal.calcDroits(Math.round(base757B / ctx.nbBens), ctx.baremeBen) * ctx.nbBens;
        }
        if (primesAv70 > 0) {
            var par = Math.round(primesAv70 / ctx.nbBens);
            var b = Math.max(0, par - 152500);
            droitsA += Math.round((Math.min(b, 547500) * 0.20 + Math.max(0, b - 547500) * 0.3125) * ctx.nbBens);
        }

        // C: Capi demembre
        var valNPCapi = Math.round(val * ctx.npRatio);
        var partNP = Math.round(valNPCapi / ctx.nbBens);
        var baseNP = Math.max(0, partNP - ctx.abatBen);
        var droitsCapi = SD._fiscal.calcDroits(baseNP, ctx.baremeBen) * ctx.nbBens;
        var fraisCapi = Math.round(valNPCapi * 0.018);
        var ecoCapi = droitsA - droitsCapi;
        var creance = val - valNPCapi;

        // B: Rachats
        var donManuel = 31865 * ctx.nbBens;
        var sur10ans = 4600 * 10 + donManuel;

        // Best option
        var bestOption = 'C';
        var bestReason = '';
        if (val > 150000 && is757B) {
            bestOption = 'C';
            bestReason = 'Capi d\u00e9membr\u00e9 : droits sur NP (' + ctx.npPct + '%) seulement. ' + esc(ctx.donorNom) + ' garde le quasi-usufruit. Cr\u00e9ance ' + fmt(creance) + ' d\u00e9ductible au d\u00e9c\u00e8s. Ant\u00e9riorit\u00e9 fiscale conserv\u00e9e.';
        } else if (val <= 150000) {
            bestOption = 'B';
            bestReason = 'Rachats progressifs + dons manuels : montant mod\u00e9r\u00e9, mieux transmis progressivement.';
        }
        if (ctx.obj.revenus || ctx.wantsControl) {
            bestReason += ' Compatible avec objectif revenus/contr\u00f4le.';
        }

        var reco = { nom: 'Assurance-vie', type: 'av', val: val, option: bestOption, droitsOpt: bestOption === 'C' ? droitsCapi : 0, droitsSucc: droitsA, eco: bestOption === 'C' ? ecoCapi : droitsA };

        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(59,130,246,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
        h += '<i class="fas fa-shield-alt" style="font-size:.9rem;color:var(--accent-blue);width:32px;height:32px;border-radius:8px;background:rgba(59,130,246,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">Assurance-vie</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + fmt(val) + ' \u00b7 Gains ' + fmt(gains) + ' exon\u00e9r\u00e9s \u00b7 Art. ' + (is757B ? '757 B' : '990 I') + '</div></div></div>';

        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(59,130,246,.08);margin-bottom:10px;">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;">';
        h += '<thead><tr style="background:rgba(59,130,246,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;">Option</th>';
        h += '<th style="padding:8px 10px;text-align:right;">Droits</th>';
        h += '<th style="padding:8px 10px;text-align:right;">Net transmis</th>';
        h += '<th style="padding:8px 10px;text-align:right;">D\u00e9tail</th>';
        h += '</tr></thead><tbody>';

        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'A' ? 'background:rgba(16,185,129,.02);' : '') + '">';
        h += '<td style="padding:6px 10px;"><strong>A</strong> Garder (art. ' + (is757B ? '757 B' : '990 I') + ')</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsA) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;">' + fmt(val - droitsA) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">Abat. ' + (is757B ? '30 500 \u20ac global' : '152 500 \u20ac/b\u00e9n.') + '</td></tr>';

        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'B' ? 'background:rgba(16,185,129,.02);' : '') + '">';
        h += '<td style="padding:6px 10px;"><strong>B</strong> Rachats + dons manuels</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-green);">0 \u20ac</td>';
        h += '<td style="padding:6px 10px;text-align:right;">~' + fmt(sur10ans) + '/10 ans</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">4 600 \u20ac/an exo IR + don ' + fmt(donManuel) + '</td></tr>';

        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'C' ? 'background:rgba(16,185,129,.02);' : '') + '">';
        h += '<td style="padding:6px 10px;"><strong>C</strong> Capi d\u00e9membr\u00e9 (NP ' + ctx.npPct + '%)</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsCapi) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-green);font-weight:600;">' + fmt(val - droitsCapi - fraisCapi) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">Cr\u00e9ance ' + fmt(creance) + ' d\u00e9ductible</td></tr>';

        h += '</tbody></table></div>';

        h += '<div style="padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-check-circle" style="margin-right:6px;"></i><strong>Option ' + bestOption + '</strong> : ' + bestReason;
        if (ecoCapi > 0 && bestOption === 'C') h += ' <strong>\u00c9conomie ' + fmt(ecoCapi) + '</strong> vs garder en 757 B.';
        h += '</div>';

        if (!(av.avBeneficiaires && av.avBeneficiaires.length > 0)) {
            h += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.1);font-size:.68rem;color:var(--accent-coral);">';
            h += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i><strong>D\u00e9signez les b\u00e9n\u00e9ficiaires AV</strong> dans Step 3.</div>';
        }

        h += '</div>';
        return { html: h, reco: reco };
    }

    // ============================================================
    // PRO
    // ============================================================
    function renderProActif(pro, ctx) {
        var val = pro.valeur || 0;
        var pct = pro.pctDetention || 100;
        var valPart = Math.round(val * pct / 100);
        var nom = pro.nom || 'Actif professionnel';

        var partBrut = Math.round(valPart / ctx.nbBens);
        var droitsBrut = SD._fiscal.calcDroits(Math.max(0, partBrut - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var valDutreil = Math.round(valPart * 0.25);
        var droitsDutreil = SD._fiscal.calcDroits(Math.max(0, Math.round(valDutreil / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        if (ctx.donorAge < 70) droitsDutreil = Math.round(droitsDutreil * 0.5);

        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(167,139,250,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
        h += '<i class="fas fa-briefcase" style="font-size:.9rem;color:var(--accent-purple);width:32px;height:32px;border-radius:8px;background:rgba(167,139,250,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">' + esc(nom) + '</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + fmt(valPart) + ' \u00b7 ' + pct + '% d\u00e9tention</div></div></div>';
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.06);text-align:center;">';
        h += '<div style="font-size:.58rem;color:var(--text-muted);">SANS Dutreil</div><div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(droitsBrut) + '</div></div>';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.06);text-align:center;">';
        h += '<div style="font-size:.58rem;color:var(--text-muted);">AVEC Dutreil' + (ctx.donorAge < 70 ? ' + r\u00e9duc. 50%' : '') + '</div>';
        h += '<div style="font-size:1rem;font-weight:700;color:var(--accent-green);">' + fmt(droitsDutreil) + '</div>';
        h += '<div style="font-size:.62rem;color:var(--accent-green);">\u00c9co. ' + fmt(droitsBrut - droitsDutreil) + '</div></div></div>';
        h += '</div>';
        return h;
    }

    // ============================================================
    // STRATEGIE COMBINEE
    // ============================================================
    function renderCombinedStrategy(immos, avItems, pros, ctx, totalImmo, recoParActif) {
        var h = '<div class="section-card" style="margin-bottom:20px;border-color:rgba(198,134,66,.25);background:linear-gradient(135deg,rgba(51,44,32,.98),rgba(40,35,25,.95));padding:24px 28px;">';
        h += '<div class="section-title"><i class="fas fa-chess" style="background:linear-gradient(135deg,rgba(198,134,66,.25),rgba(198,134,66,.1));color:var(--primary-color);"></i> Strat\u00e9gie combin\u00e9e recommand\u00e9e</div>';

        // Evaluer si SCI multi-biens vaut le coup
        var nbImmos = immos.length;
        var sciMultiBiens = nbImmos >= 2 && totalImmo > 400000;
        var totalDroitsSucc = 0;
        var totalDroitsOpt = 0;
        var totalFraisOpt = 0;
        var steps = [];
        var stepNum = 0;

        // ETAPES
        // 1. Don manuel immediat
        var donManuelTotal = 31865 * ctx.nbBens;
        steps.push({ num: ++stepNum, quand: 'Imm\u00e9diat', action: 'Don manuel + familial', detail: fmt(31865) + ' \u00d7 ' + ctx.nbBens + ' b\u00e9n\u00e9f. = <strong>' + fmt(donManuelTotal) + '</strong> \u00e0 0% de droits (art. 790 G).', eco: donManuelTotal > 0 ? 'Transmis sans droits' : '', cout: 'Gratuit (d\u00e9claration en ligne)' });

        // 2. AV : clause beneficiaire ou capi
        avItems.forEach(function(av) {
            var reco = recoParActif.find(function(r) { return r.type === 'av'; });
            if (!reco) return;
            totalDroitsSucc += reco.droitsSucc;
            totalDroitsOpt += reco.droitsOpt;
            if (reco.option === 'C') {
                var valNP = Math.round(av.valeur * ctx.npRatio);
                steps.push({ num: ++stepNum, quand: 'Mois 1-3', action: 'Convertir AV \u2192 Capi d\u00e9membr\u00e9', detail: 'Rachat AV ' + fmt(av.valeur) + ' \u2192 souscription contrat de capitalisation \u2192 donation NP (' + ctx.npPct + '% = ' + fmt(valNP) + '). Quasi-usufruit conserv\u00e9.', eco: fmt(reco.eco), cout: 'Frais notaire ~' + fmt(Math.round(valNP * 0.018)) });
                totalFraisOpt += Math.round(valNP * 0.018);
            } else {
                steps.push({ num: ++stepNum, quand: 'Imm\u00e9diat', action: 'Modifier clause b\u00e9n\u00e9ficiaire AV', detail: 'D\u00e9signer les b\u00e9n\u00e9ficiaires : 50% ' + (ctx.bens[0] ? esc(ctx.bens[0].nom || ctx.bens[0].prenom) : 'b\u00e9n\u00e9f. 1') + ', 50% ' + (ctx.bens[1] ? esc(ctx.bens[1].nom || ctx.bens[1].prenom) : 'b\u00e9n\u00e9f. 2'), eco: '', cout: 'Gratuit (lettre \u00e0 l\'assureur)' });
            }
        });

        // 3. Immobilier
        if (sciMultiBiens && (ctx.wantsControl || ctx.wantsSCI || ctx.obj.controle)) {
            // SCI multi-biens
            var valSCITotal = Math.round(totalImmo * 0.85);
            var valSCINP = Math.round(valSCITotal * ctx.npRatio);
            var partSCINP = Math.round(valSCINP / ctx.nbBens);
            var baseSCINP = Math.max(0, partSCINP - ctx.abatBen);
            var droitsSCITotal = SD._fiscal.calcDroits(baseSCINP, ctx.baremeBen) * ctx.nbBens;
            var droitsSuccImmo = 0;
            immos.forEach(function(im) {
                var p = Math.round(im.valeur / ctx.nbBens);
                droitsSuccImmo += SD._fiscal.calcDroits(Math.max(0, p - SD._fiscal.getAbattement(ctx.lienBen, true)), ctx.baremeBen) * ctx.nbBens;
            });
            totalDroitsSucc += droitsSuccImmo;
            totalDroitsOpt += droitsSCITotal;
            var fraisSCITotal = Math.round(valSCINP * 0.018) + 2000;
            totalFraisOpt += fraisSCITotal;

            steps.push({ num: ++stepNum, quand: 'Mois 3-6', action: 'Cr\u00e9er SCI avec TOUS les biens immo', detail: 'Apport des ' + nbImmos + ' biens (' + fmt(totalImmo) + ') \u2192 SCI. D\u00e9cote 15% \u2192 valeur parts = ' + fmt(valSCITotal) + '. ' + esc(ctx.donorNom) + ' = g\u00e9rant.', eco: fmt(droitsSuccImmo - droitsSCITotal), cout: 'Cr\u00e9ation ~2 000 \u20ac + compta ~1 100 \u20ac/an' });

            steps.push({ num: ++stepNum, quand: 'Mois 6-9', action: 'Donation NP des parts SCI', detail: 'NP (' + ctx.npPct + '%) = ' + fmt(valSCINP) + '. R\u00e9partis entre ' + ctx.nbBens + ' b\u00e9n\u00e9f. Droits ~' + fmt(droitsSCITotal) + '.', eco: '', cout: 'Frais notaire ~' + fmt(Math.round(valSCINP * 0.018)) });
        } else {
            // Par bien separement
            recoParActif.forEach(function(r) {
                if (r.type === 'av') return;
                totalDroitsSucc += r.droitsSucc;
                totalDroitsOpt += r.droitsOpt;
                var frais = Math.round(r.val * ctx.npRatio * 0.018);
                totalFraisOpt += frais;
                steps.push({ num: ++stepNum, quand: 'Mois 3-9', action: 'Donation NP de ' + esc(r.nom), detail: 'NP (' + ctx.npPct + '%) = ' + fmt(Math.round(r.val * ctx.npRatio)) + '. Option ' + r.option + '.', eco: fmt(r.eco), cout: 'Notaire ~' + fmt(frais) });
            });
        }

        // 4. +15 ans
        steps.push({ num: ++stepNum, quand: '+15 ans', action: 'Renouvellement des abattements', detail: 'Les abattements (' + fmt(ctx.abatBen) + '/' + formatLien(ctx.lienBen) + ') se rechargent. Nouvelle donation possible.', eco: '', cout: '' });

        // RENDER STEPS
        steps.forEach(function(s) {
            h += '<div style="display:flex;gap:14px;margin-bottom:12px;padding:14px;border-radius:12px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.05);">';
            h += '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary-color),var(--primary-dark));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;flex-shrink:0;">' + s.num + '</div>';
            h += '<div style="flex:1;">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
            h += '<div style="font-size:.82rem;font-weight:700;color:var(--text-primary);">' + s.action + '</div>';
            h += '<span style="font-size:.62rem;padding:2px 8px;border-radius:4px;background:rgba(198,134,66,.08);color:var(--text-muted);">' + s.quand + '</span>';
            h += '</div>';
            h += '<div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:4px;">' + s.detail + '</div>';
            if (s.eco || s.cout) {
                h += '<div style="display:flex;gap:12px;font-size:.65rem;">';
                if (s.eco) h += '<span style="color:var(--accent-green);font-weight:600;">\u2714 \u00c9conomie : ' + s.eco + '</span>';
                if (s.cout) h += '<span style="color:var(--text-muted);">\ud83d\udcb3 ' + s.cout + '</span>';
                h += '</div>';
            }
            h += '</div></div>';
        });

        // BILAN GLOBAL
        var ecoTotale = totalDroitsSucc - totalDroitsOpt;
        h += '<div style="margin-top:16px;padding:18px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(16,185,129,.03));border:1px solid rgba(16,185,129,.2);">';
        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">';

        h += '<div><div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Droits sans optimisation</div>';
        h += '<div style="font-size:1.1rem;font-weight:800;color:var(--accent-coral);text-decoration:line-through;">' + fmt(totalDroitsSucc) + '</div></div>';

        h += '<div><div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Droits apr\u00e8s optimisation</div>';
        h += '<div style="font-size:1.1rem;font-weight:800;color:var(--accent-green);">' + fmt(totalDroitsOpt) + '</div>';
        h += '<div style="font-size:.60rem;color:var(--text-muted);">+ frais ' + fmt(totalFraisOpt) + '</div></div>';

        h += '<div><div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">\u00c9CONOMIE TOTALE</div>';
        h += '<div style="font-size:1.3rem;font-weight:900;color:var(--accent-green);">' + fmt(ecoTotale) + '</div></div>';

        h += '</div></div>';

        // Note SCI multi-biens
        if (sciMultiBiens && (ctx.wantsControl || ctx.wantsSCI || ctx.obj.controle)) {
            h += '<div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);font-size:.68rem;color:var(--text-secondary);">';
            h += '<i class="fas fa-info-circle" style="color:var(--primary-color);margin-right:6px;"></i>';
            h += '<strong>SCI regroup\u00e9e</strong> : en regroupant les ' + nbImmos + ' biens dans une seule SCI, les co\u00fbts fixes sont amortis (1 seul acte notari\u00e9, 1 compta). La d\u00e9cote 15% s\'applique sur le total (' + fmt(totalImmo) + ' \u2192 ' + fmt(Math.round(totalImmo * 0.85)) + ').';
            h += '</div>';
        }

        h += '</div>';
        return h;
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function optRow(letter, label, droits, frais, eco, isBest, note) {
        var bg = isBest ? 'background:rgba(16,185,129,.02);' : '';
        var h = '<tr style="border-top:1px solid rgba(198,134,66,.04);' + bg + '">';
        h += '<td style="padding:7px 10px;"><strong>' + letter + '</strong> ' + label;
        if (isBest) h += ' <span style="font-size:.55rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);">\u2714</span>';
        h += '</td>';
        h += '<td style="padding:7px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droits) + '</td>';
        h += '<td style="padding:7px 10px;text-align:right;">' + fmt(frais) + '</td>';
        h += '<td style="padding:7px 10px;text-align:right;color:' + (eco > 0 ? 'var(--accent-green)' : 'var(--text-muted)') + ';font-weight:600;">' + (eco > 0 ? '+' + fmt(eco) : '\u2014') + '</td>';
        h += '</tr>';
        if (note) h += '<tr style="' + bg + '"><td colspan="4" style="padding:0 10px 6px;font-size:.60rem;color:var(--text-muted);">\u2192 ' + note + '</td></tr>';
        return h;
    }

    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }
    function formatLien(l) { return { 'enfant':'enfant', 'petit_enfant':'petit-enfant', 'conjoint_pacs':'conjoint', 'frere_soeur':'fr\u00e8re/soeur', 'tiers':'tiers' }[l] || l; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    else setTimeout(init, 1500);
})();
