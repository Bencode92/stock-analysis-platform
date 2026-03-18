/**
 * per-asset-results.js v1.2 — Phase 2+3 : Options par actif + strategie combinee
 *
 * v1.2: Ajout synthese IA en tete des resultats
 *       Resume narratif genere a partir des donnees calculees
 *       Pas d'appel API — template intelligent depuis les data
 *
 * @version 1.2.0 — 2026-03-18
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
        console.log('[PerAssetResults v1.2] Loaded — with AI synthesis');
    }

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
        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
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

        // Find biological children for succession context
        var enfantsLegaux = [];
        if (FG && FG.getPersons) {
            var persons = FG.getPersons();
            var donateurs = persons.filter(function(p) { return p.isDonor; });
            if (donateurs.length > 0) {
                if (FG.getChildren) {
                    var cids = FG.getChildren(donateurs[0].id);
                    if (cids && cids.length > 0) enfantsLegaux = persons.filter(function(p) { return cids.indexOf(p.id) >= 0; });
                }
                if (enfantsLegaux.length === 0) {
                    enfantsLegaux = persons.filter(function(p) { return p.parentIds && p.parentIds.indexOf(donateurs[0].id) >= 0; });
                }
                // Filter spouses
                if (enfantsLegaux.length > 1) {
                    var eids = enfantsLegaux.map(function(e) { return e.id; });
                    enfantsLegaux = enfantsLegaux.filter(function(e) {
                        if (e.spouseId && eids.indexOf(e.spouseId) >= 0 && FG.computeFiscalLien) {
                            return FG.computeFiscalLien(donateurs[0].id, e.id) === 'enfant';
                        }
                        return true;
                    });
                }
            }
        }

        var wantsControl = obj.revenus || obj.controle || findDecision(decisions, 'revenus', 'essentiels') || findDecision(decisions, 'revenus', 'complementaires');
        var wantsDirect = findDecision(decisions, 'indirect', 'non');
        var wantsIndirect = findDecision(decisions, 'indirect', 'oui') || findDecision(decisions, 'indirect', 'a_discuter');
        var wantsKeepAll = findDecision(decisions, 'immo-vision', 'garder');
        var wantsSCI = findDecision(decisions, 'immo-vision', 'restructurer') || obj.controle;
        var wantsSell = obj.vendre || findDecision(decisions, 'immo-vision', 'vendre_certains');

        return {
            obj: obj, decisions: decisions, donorAge: donorAge, npRatio: npRatio, npPct: npPct,
            FISCAL: FISCAL, bens: bens, nbBens: nbBens, lienBen: lienBen, abatBen: abatBen,
            baremeBen: baremeBen, donorNom: donorNom, PO: PO, FG: FG,
            enfantsLegaux: enfantsLegaux,
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

    function renderPerAsset() {
        var existing = document.getElementById('per-asset-results-panel');
        if (existing) existing.remove();
        var existingSynth = document.getElementById('ai-synthesis-panel');
        if (existingSynth) existingSynth.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var ctx = getContext(state);
        var immos = (state.immo || []).filter(function(im) { return (im.valeur || 0) > 0; });
        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie' && (f.valeur || 0) > 0; });
        var pros = (state.pro || []).filter(function(p) { return (p.valeur || 0) > 0; });

        if (immos.length === 0 && avItems.length === 0 && pros.length === 0) return;

        // Compute all recos first for synthesis
        var recoParActif = [];
        var totalImmo = 0;
        immos.forEach(function(im) {
            totalImmo += im.valeur;
            recoParActif.push(computeImmoReco(im, ctx));
        });
        avItems.forEach(function(av) {
            recoParActif.push(computeAVReco(av, ctx));
        });

        // ============================================================
        // SYNTHESE IA — insere AVANT le baseline
        // ============================================================
        var pat = SD._fiscal.computePatrimoine();
        var totalAV = avItems.reduce(function(s, f) { return s + (f.valeur || 0); }, 0);
        var masseSucc = (pat.actifNet || 0) - totalAV;
        var totalDroitsSucc = 0;
        var totalDroitsOpt = 0;
        recoParActif.forEach(function(r) { totalDroitsSucc += r.droitsSucc; totalDroitsOpt += r.droitsOpt; });
        var ecoTotale = totalDroitsSucc - totalDroitsOpt;

        renderSynthesis(ctx, immos, avItems, masseSucc, totalAV, totalDroitsSucc, totalDroitsOpt, ecoTotale, recoParActif);

        // ============================================================
        // PER ASSET PANEL
        // ============================================================
        var html = '<div id="per-asset-results-panel">';

        html += '<div class="section-card" style="border-color:rgba(16,185,129,.25);margin-bottom:4px;padding:20px 28px;">';
        html += '<div class="section-title"><i class="fas fa-th-list" style="background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(5,150,105,.12));color:var(--accent-green);"></i> Que faire de chaque actif ?</div>';
        html += '<div style="font-size:.75rem;color:var(--text-muted);">Bar\u00e8me art. 669 : NP = ' + ctx.npPct + '% (donateur ' + ctx.donorAge + ' ans). Abattement ' + formatLien(ctx.lienBen) + ' : ' + fmt(ctx.abatBen) + '.</div>';

        var activeObjs = [];
        if (ctx.obj.minimiser) activeObjs.push('\ud83d\udcb0 Min. droits');
        if (ctx.obj.revenus) activeObjs.push('\ud83d\udcca Revenus');
        if (ctx.obj.controle) activeObjs.push('\ud83d\udd12 Contr\u00f4le');
        if (ctx.obj.conjoint) activeObjs.push('\u2764\ufe0f Conjoint');
        if (ctx.obj.egalite) activeObjs.push('\u2696\ufe0f \u00c9galit\u00e9');
        if (ctx.obj.generation) activeObjs.push('\ud83d\udc76 G\u00e9n\u00e9ration');
        if (activeObjs.length > 0) {
            html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">';
            activeObjs.forEach(function(o) { html += '<span style="font-size:.62rem;padding:3px 8px;border-radius:6px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);">' + o + '</span>'; });
            html += '</div>';
        }
        html += '</div>';

        immos.forEach(function(im, idx) { html += renderImmoBien(im, ctx, recoParActif[idx]); });
        avItems.forEach(function(av, idx) { html += renderAVContrat(av, ctx, recoParActif[immos.length + idx]); });
        pros.forEach(function(pro) { html += renderProActif(pro, ctx); });

        html += renderCombinedStrategy(immos, avItems, pros, ctx, totalImmo, recoParActif);
        html += '</div>';

        var warning = document.getElementById('succession-legale-warning');
        var baseline = document.getElementById('succession-baseline-panel');
        var anchor = warning || baseline;
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
        else {
            var step5 = document.getElementById('step-5');
            if (step5) { var h2 = step5.querySelector('.step-helper'); if (h2) h2.insertAdjacentHTML('afterend', html); }
        }
    }

    // ============================================================
    // SYNTHESE IA NARRATIVE
    // ============================================================
    function renderSynthesis(ctx, immos, avItems, masseSucc, totalAV, droitsSucc, droitsOpt, eco, recos) {
        var h = '<div id="ai-synthesis-panel" class="section-card" style="border-color:rgba(198,134,66,.3);margin-bottom:16px;padding:24px 28px;background:linear-gradient(135deg,rgba(51,44,32,.98),rgba(45,38,28,.95));">';

        // Header
        h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">';
        h += '<div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,rgba(198,134,66,.25),rgba(198,134,66,.1));display:flex;align-items:center;justify-content:center;"><i class="fas fa-brain" style="font-size:1.1rem;color:var(--primary-color);"></i></div>';
        h += '<div><div style="font-size:1rem;font-weight:800;color:var(--text-primary);">Synth\u00e8se de votre situation</div>';
        h += '<div style="font-size:.62rem;color:var(--text-muted);">Analyse personnalis\u00e9e bas\u00e9e sur votre patrimoine et vos objectifs</div></div></div>';

        // Paragraph 1: Situation
        var bensNoms = ctx.bens.map(function(b) { return b.nom || b.prenom || 'b\u00e9n\u00e9ficiaire'; }).join(' et ');
        var enfantsNoms = ctx.enfantsLegaux.map(function(e) { return e.nom; }).join(' et ');
        var lienLabel = ctx.lienBen === 'petit_enfant' ? 'petits-enfants' : (ctx.lienBen === 'enfant' ? 'enfants' : 'b\u00e9n\u00e9ficiaires');
        var nbImmos = immos.length;
        var immoDesc = immos.map(function(im) {
            var type = im.usageActuel === 'rp' ? 'r\u00e9sidence principale' : (im.usageActuel === 'locatif' ? 'bien locatif' : 'bien immobilier');
            return type + ' (' + fmt(im.valeur) + ')';
        }).join(', ');

        h += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;">';
        h += '<strong style="color:var(--text-primary);">' + esc(ctx.donorNom) + '</strong>, ' + ctx.donorAge + ' ans, souhaite transmettre \u00e0 ses ' + lienLabel + ' <strong>' + esc(bensNoms) + '</strong>. ';
        h += 'Son patrimoine comprend ' + (nbImmos > 0 ? nbImmos + ' bien' + (nbImmos > 1 ? 's' : '') + ' immobilier' + (nbImmos > 1 ? 's' : '') + ' (' + immoDesc + ')' : '') + (totalAV > 0 ? ' et une assurance-vie de ' + fmt(totalAV) : '') + ', soit <strong>' + fmt(masseSucc + totalAV) + '</strong> au total.';
        h += '</div>';

        // Paragraph 2: Probleme
        if (ctx.enfantsLegaux.length > 0 && ctx.lienBen === 'petit_enfant') {
            h += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;padding:10px 14px;border-radius:8px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.08);">';
            h += '<strong style="color:var(--accent-coral);">Le probl\u00e8me :</strong> en succession l\u00e9gale, c\'est <strong>' + esc(enfantsNoms) + '</strong> qui h\u00e9rite de tout \u2014 pas les petits-enfants. ';
            h += 'Sans action de son vivant, ' + esc(bensNoms) + ' ne re\u00e7oi' + (ctx.nbBens > 1 ? 'ven' : '') + 't <strong>rien</strong>. ';
            h += 'De plus, les droits de succession pour ' + esc(enfantsNoms) + ' s\'\u00e9l\u00e8veraient \u00e0 <strong style="color:var(--accent-coral);">' + fmt(droitsSucc) + '</strong>';
            if (totalAV > 0) h += ' (succession + AV)';
            h += '.';
            h += '</div>';
        } else {
            h += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;padding:10px 14px;border-radius:8px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.08);">';
            h += '<strong style="color:var(--accent-coral);">Sans optimisation :</strong> les droits de succession s\'\u00e9l\u00e8veraient \u00e0 <strong style="color:var(--accent-coral);">' + fmt(droitsSucc) + '</strong>, soit un taux effectif de ' + (masseSucc > 0 ? Math.round(droitsSucc / (masseSucc + totalAV) * 100) : 0) + '%.';
            h += '</div>';
        }

        // Paragraph 3: Solution
        h += '<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;padding:10px 14px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.08);">';
        h += '<strong style="color:var(--accent-green);">La strat\u00e9gie recommand\u00e9e</strong> combine ';

        var strategies = [];
        var hasNP = recos.some(function(r) { return r.option === 'B' && (r.type === 'rp' || r.type === 'locatif'); });
        var hasSCI = recos.some(function(r) { return r.option === 'C'; });
        var hasCapi = recos.some(function(r) { return r.type === 'av' && r.option === 'C'; });
        if (hasNP) strategies.push('la <strong>donation en nue-propri\u00e9t\u00e9</strong> (droits sur ' + ctx.npPct + '% seulement, ' + esc(ctx.donorNom) + ' conserve l\'usage et les revenus)');
        if (hasSCI) strategies.push('une <strong>SCI</strong> pour regrouper les biens (d\u00e9cote 15% + contr\u00f4le via la g\u00e9rance)');
        if (hasCapi) strategies.push('la <strong>conversion de l\'AV en contrat de capitalisation d\u00e9membr\u00e9</strong> (cr\u00e9ance de restitution d\u00e9ductible)');
        strategies.push('des <strong>dons manuels</strong> imm\u00e9diats (' + fmt(31865) + '/b\u00e9n\u00e9ficiaire, 0% de droits)');

        h += strategies.join(', ') + '. ';
        h += 'R\u00e9sultat : les droits passent de <strong style="color:var(--accent-coral);text-decoration:line-through;">' + fmt(droitsSucc) + '</strong> \u00e0 <strong style="color:var(--accent-green);">' + fmt(droitsOpt) + '</strong>, ';
        h += 'soit une <strong style="color:var(--accent-green);">\u00e9conomie de ' + fmt(eco) + '</strong>.';
        h += '</div>';

        // KPI boxes
        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';

        h += '<div style="padding:14px;border-radius:12px;background:rgba(255,107,107,.06);border:1px solid rgba(255,107,107,.12);text-align:center;">';
        h += '<div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Sans optimisation</div>';
        h += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-coral);text-decoration:line-through;">' + fmt(droitsSucc) + '</div></div>';

        h += '<div style="padding:14px;border-radius:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.12);text-align:center;">';
        h += '<div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Apr\u00e8s optimisation</div>';
        h += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-green);">' + fmt(droitsOpt) + '</div></div>';

        h += '<div style="padding:14px;border-radius:12px;background:linear-gradient(135deg,rgba(16,185,129,.1),rgba(5,150,105,.06));border:1px solid rgba(16,185,129,.2);text-align:center;">';
        h += '<div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">\u00c9conomie</div>';
        h += '<div style="font-size:1.4rem;font-weight:900;color:var(--accent-green);">' + fmt(eco) + '</div></div>';

        h += '</div>';
        h += '</div>';

        // Insert BEFORE baseline
        var baseline = document.getElementById('succession-baseline-panel');
        if (baseline) {
            baseline.insertAdjacentHTML('beforebegin', h);
        } else {
            var step5 = document.getElementById('step-5');
            if (step5) {
                var helper = step5.querySelector('.step-helper');
                if (helper) helper.insertAdjacentHTML('afterend', h);
            }
        }
    }

    // ============================================================
    // COMPUTE RECOS (sans render, pour synthese)
    // ============================================================
    function computeImmoReco(im, ctx) {
        var val = im.valeur;
        var nom = im.label || 'Bien immobilier';
        var isRP = im.usageActuel === 'rp';
        var isLocatif = im.usageActuel === 'locatif';
        var partParBen = Math.round(val / ctx.nbBens);
        var baseSucc = Math.max(0, partParBen - SD._fiscal.getAbattement(ctx.lienBen, true));
        var droitsSucc = SD._fiscal.calcDroits(baseSucc, ctx.baremeBen) * ctx.nbBens;
        var valNP = Math.round(val * ctx.npRatio);
        var droitsNP = SD._fiscal.calcDroits(Math.max(0, Math.round(valNP / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var valSCINP = Math.round(val * 0.85 * ctx.npRatio);
        var droitsSCI = SD._fiscal.calcDroits(Math.max(0, Math.round(valSCINP / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var bestOption = 'B';
        if (isLocatif && (ctx.wantsControl || ctx.wantsSCI)) bestOption = 'C';
        return { nom: nom, type: isRP ? 'rp' : 'locatif', val: val, option: bestOption, droitsOpt: bestOption === 'C' ? droitsSCI : droitsNP, droitsSucc: droitsSucc, eco: droitsSucc - (bestOption === 'C' ? droitsSCI : droitsNP) };
    }

    function computeAVReco(av, ctx) {
        var val = av.valeur || 0;
        var primesAp70 = av.primesApres70 || 0;
        var primesAv70 = av.primesAvant70 || 0;
        if (primesAv70 === 0 && primesAp70 === 0 && ctx.donorAge >= 70) primesAp70 = av.versements || val;
        var droitsA = 0;
        if (primesAp70 > 0) droitsA += SD._fiscal.calcDroits(Math.round(Math.max(0, primesAp70 - 30500) / ctx.nbBens), ctx.baremeBen) * ctx.nbBens;
        if (primesAv70 > 0) { var b = Math.max(0, Math.round(primesAv70 / ctx.nbBens) - 152500); droitsA += Math.round((Math.min(b, 547500) * 0.20 + Math.max(0, b - 547500) * 0.3125) * ctx.nbBens); }
        var valNPCapi = Math.round(val * ctx.npRatio);
        var droitsCapi = SD._fiscal.calcDroits(Math.max(0, Math.round(valNPCapi / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var bestOption = val > 150000 && ctx.donorAge >= 70 ? 'C' : 'B';
        return { nom: 'Assurance-vie', type: 'av', val: val, option: bestOption, droitsOpt: bestOption === 'C' ? droitsCapi : 0, droitsSucc: droitsA, eco: droitsA - (bestOption === 'C' ? droitsCapi : 0) };
    }

    // ============================================================
    // RENDER IMMO
    // ============================================================
    function renderImmoBien(im, ctx, reco) {
        var val = im.valeur; var nom = im.label || 'Bien immobilier';
        var isRP = im.usageActuel === 'rp'; var isLocatif = im.usageActuel === 'locatif';
        var loyer = im.loyerMensuel || 0; var loyerAn = loyer * 12;
        var icon = isRP ? 'fa-home' : 'fa-building';
        var typeLabel = isRP ? 'R\u00e9sidence principale' : (isLocatif ? 'Bien locatif' : 'Immobilier');

        var partParBen = Math.round(val / ctx.nbBens);
        var baseSucc = Math.max(0, partParBen - SD._fiscal.getAbattement(ctx.lienBen, true));
        var droitsSucc = SD._fiscal.calcDroits(baseSucc, ctx.baremeBen) * ctx.nbBens;
        var valNP = Math.round(val * ctx.npRatio);
        var droitsNP = SD._fiscal.calcDroits(Math.max(0, Math.round(valNP / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var fraisNP = Math.round(valNP * 0.018);
        var ecoNP = droitsSucc - droitsNP;
        var valSCINP = Math.round(val * 0.85 * ctx.npRatio);
        var droitsSCI = SD._fiscal.calcDroits(Math.max(0, Math.round(valSCINP / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var fraisSCI = Math.round(valSCINP * 0.018) + 2000;
        var ecoSCI = droitsSucc - droitsSCI;

        var bestOption = reco.option;
        var bestReason = '';
        if (isRP) { bestReason = esc(ctx.donorNom) + ' conserve l\'usage du logement (usufruit). Droits sur ' + ctx.npPct + '% seulement.'; if (ctx.wantsIndirect) bestReason += ' Chemin indirect possible (+68k\u20ac abattements).'; }
        else if (isLocatif) { bestReason = bestOption === 'C' ? ('SCI : ' + esc(ctx.donorNom) + ' reste g\u00e9rant + conserve les loyers (' + fmt(loyerAn) + '/an). D\u00e9cote 15%.') : ('NP simple : conserve les loyers (' + fmt(loyerAn) + '/an).'); }

        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(198,134,66,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
        h += '<i class="fas ' + icon + '" style="font-size:.9rem;color:var(--primary-color);width:32px;height:32px;border-radius:8px;background:rgba(198,134,66,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">' + esc(nom) + '</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + typeLabel + ' \u00b7 ' + fmt(val);
        if (loyerAn > 0) h += ' \u00b7 Loyer ' + fmt(loyer) + '/mois';
        h += '</div></div></div>';

        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.08);margin-bottom:10px;">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;"><thead><tr style="background:rgba(198,134,66,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;">Option</th><th style="padding:8px 10px;text-align:right;">Droits</th><th style="padding:8px 10px;text-align:right;">Frais</th><th style="padding:8px 10px;text-align:right;">\u00c9conomie</th></tr></thead><tbody>';
        h += optRow('A', 'Ne rien faire (succession)', droitsSucc, Math.round(val * 0.012), 0, false, '');
        h += optRow('B', 'Donation NP (' + ctx.npPct + '%)', droitsNP, fraisNP, ecoNP, bestOption === 'B', isRP ? 'Conserve l\'usage' : 'Conserve les loyers');
        if (val > 150000) h += optRow('C', 'SCI + NP parts (\u221215%)', droitsSCI, fraisSCI, ecoSCI, bestOption === 'C', 'D\u00e9cote 15% + g\u00e9rance');
        h += '</tbody></table></div>';

        h += '<div style="padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-check-circle" style="margin-right:6px;"></i><strong>Option ' + bestOption + '</strong> : ' + bestReason + ' <strong>\u00c9conomie ' + fmt(reco.eco) + '</strong>.</div>';
        h += '</div>';
        return h;
    }

    // ============================================================
    // RENDER AV
    // ============================================================
    function renderAVContrat(av, ctx, reco) {
        var val = av.valeur || 0; var versements = av.versements || 0;
        var primesAp70 = av.primesApres70 || 0; var primesAv70 = av.primesAvant70 || 0;
        if (primesAv70 === 0 && primesAp70 === 0 && ctx.donorAge >= 70) primesAp70 = versements || val;
        var gains = Math.max(0, val - primesAv70 - primesAp70);
        var is757B = ctx.donorAge >= 70 || primesAp70 > 0;

        var droitsA = reco.droitsSucc;
        var valNPCapi = Math.round(val * ctx.npRatio);
        var droitsCapi = reco.option === 'C' ? reco.droitsOpt : SD._fiscal.calcDroits(Math.max(0, Math.round(valNPCapi / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var fraisCapi = Math.round(valNPCapi * 0.018);
        var ecoCapi = droitsA - droitsCapi;
        var creance = val - valNPCapi;
        var donManuel = 31865 * ctx.nbBens;
        var sur10ans = 4600 * 10 + donManuel;

        var bestOption = reco.option;
        var bestReason = bestOption === 'C' ? ('Capi d\u00e9membr\u00e9 : droits sur NP (' + ctx.npPct + '%) seulement. Cr\u00e9ance ' + fmt(creance) + ' d\u00e9ductible. Ant\u00e9riorit\u00e9 conserv\u00e9e.') : 'Rachats progressifs + dons manuels pour montant mod\u00e9r\u00e9.';

        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(59,130,246,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
        h += '<i class="fas fa-shield-alt" style="font-size:.9rem;color:var(--accent-blue);width:32px;height:32px;border-radius:8px;background:rgba(59,130,246,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">Assurance-vie</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + fmt(val) + ' \u00b7 Gains ' + fmt(gains) + ' exon\u00e9r\u00e9s \u00b7 Art. ' + (is757B ? '757 B' : '990 I') + '</div></div></div>';

        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(59,130,246,.08);margin-bottom:10px;">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;"><thead><tr style="background:rgba(59,130,246,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;">Option</th><th style="padding:8px 10px;text-align:right;">Droits</th><th style="padding:8px 10px;text-align:right;">Net transmis</th><th style="padding:8px 10px;text-align:right;">D\u00e9tail</th></tr></thead><tbody>';
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'A' ? 'background:rgba(16,185,129,.02);' : '') + '"><td style="padding:6px 10px;"><strong>A</strong> Garder (art. ' + (is757B ? '757 B' : '990 I') + ')</td><td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsA) + '</td><td style="padding:6px 10px;text-align:right;">' + fmt(val - droitsA) + '</td><td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">Abat. ' + (is757B ? '30 500 \u20ac global' : '152 500 \u20ac/b\u00e9n.') + '</td></tr>';
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'B' ? 'background:rgba(16,185,129,.02);' : '') + '"><td style="padding:6px 10px;"><strong>B</strong> Rachats + dons manuels</td><td style="padding:6px 10px;text-align:right;color:var(--accent-green);">0 \u20ac</td><td style="padding:6px 10px;text-align:right;">~' + fmt(sur10ans) + '/10 ans</td><td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">4 600 \u20ac/an exo IR + don ' + fmt(donManuel) + '</td></tr>';
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);' + (bestOption === 'C' ? 'background:rgba(16,185,129,.02);' : '') + '"><td style="padding:6px 10px;"><strong>C</strong> Capi d\u00e9membr\u00e9 (NP ' + ctx.npPct + '%)</td><td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsCapi) + '</td><td style="padding:6px 10px;text-align:right;color:var(--accent-green);font-weight:600;">' + fmt(val - droitsCapi - fraisCapi) + '</td><td style="padding:6px 10px;text-align:right;font-size:.60rem;color:var(--text-muted);">Cr\u00e9ance ' + fmt(creance) + ' d\u00e9ductible</td></tr>';
        h += '</tbody></table></div>';

        h += '<div style="padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-check-circle" style="margin-right:6px;"></i><strong>Option ' + bestOption + '</strong> : ' + bestReason;
        if (ecoCapi > 0 && bestOption === 'C') h += ' <strong>\u00c9conomie ' + fmt(ecoCapi) + '</strong>.';
        h += '</div>';

        if (!(av.avBeneficiaires && av.avBeneficiaires.length > 0)) {
            h += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.1);font-size:.68rem;color:var(--accent-coral);">';
            h += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i><strong>D\u00e9signez les b\u00e9n\u00e9ficiaires AV</strong> dans Step 3.</div>';
        }
        h += '</div>';
        return h;
    }

    function renderProActif(pro, ctx) {
        var val = pro.valeur || 0; var pct = pro.pctDetention || 100; var valPart = Math.round(val * pct / 100); var nom = pro.nom || 'Actif pro';
        var droitsBrut = SD._fiscal.calcDroits(Math.max(0, Math.round(valPart / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        var droitsDutreil = SD._fiscal.calcDroits(Math.max(0, Math.round(valPart * 0.25 / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
        if (ctx.donorAge < 70) droitsDutreil = Math.round(droitsDutreil * 0.5);
        var h = '<div class="section-card" style="margin-bottom:4px;border-color:rgba(167,139,250,.12);padding:18px 28px;">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><i class="fas fa-briefcase" style="font-size:.9rem;color:var(--accent-purple);width:32px;height:32px;border-radius:8px;background:rgba(167,139,250,.1);display:flex;align-items:center;justify-content:center;"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">' + esc(nom) + '</div><div style="font-size:.65rem;color:var(--text-muted);">' + fmt(valPart) + '</div></div></div>';
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.06);text-align:center;"><div style="font-size:.58rem;color:var(--text-muted);">SANS Dutreil</div><div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(droitsBrut) + '</div></div>';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.06);text-align:center;"><div style="font-size:.58rem;color:var(--text-muted);">AVEC Dutreil</div><div style="font-size:1rem;font-weight:700;color:var(--accent-green);">' + fmt(droitsDutreil) + '</div></div></div></div>';
        return h;
    }

    // ============================================================
    // STRATEGIE COMBINEE (inchange par rapport a v1.1)
    // ============================================================
    function renderCombinedStrategy(immos, avItems, pros, ctx, totalImmo, recoParActif) {
        var h = '<div class="section-card" style="margin-bottom:20px;border-color:rgba(198,134,66,.25);background:linear-gradient(135deg,rgba(51,44,32,.98),rgba(40,35,25,.95));padding:24px 28px;">';
        h += '<div class="section-title"><i class="fas fa-chess" style="background:linear-gradient(135deg,rgba(198,134,66,.25),rgba(198,134,66,.1));color:var(--primary-color);"></i> Plan d\'action</div>';

        var nbImmos = immos.length; var sciMultiBiens = nbImmos >= 2 && totalImmo > 400000;
        var totalDroitsSucc = 0, totalDroitsOpt = 0, totalFraisOpt = 0;
        var steps = [], stepNum = 0;

        var donManuelTotal = 31865 * ctx.nbBens;
        steps.push({ num: ++stepNum, quand: 'Imm\u00e9diat', action: 'Don manuel + familial', detail: fmt(31865) + ' \u00d7 ' + ctx.nbBens + ' = <strong>' + fmt(donManuelTotal) + '</strong> \u00e0 0% (art. 790 G).', eco: 'Transmis sans droits', cout: 'Gratuit' });

        avItems.forEach(function(av) {
            var reco = recoParActif.find(function(r) { return r.type === 'av'; });
            if (!reco) return;
            totalDroitsSucc += reco.droitsSucc; totalDroitsOpt += reco.droitsOpt;
            if (reco.option === 'C') {
                var valNP = Math.round(av.valeur * ctx.npRatio);
                steps.push({ num: ++stepNum, quand: 'Mois 1-3', action: 'AV \u2192 Capi d\u00e9membr\u00e9', detail: 'Rachat ' + fmt(av.valeur) + ' \u2192 capi \u2192 NP ' + ctx.npPct + '% = ' + fmt(valNP) + '. Quasi-usufruit conserv\u00e9.', eco: fmt(reco.eco), cout: 'Notaire ~' + fmt(Math.round(valNP * 0.018)) });
                totalFraisOpt += Math.round(valNP * 0.018);
            } else {
                steps.push({ num: ++stepNum, quand: 'Imm\u00e9diat', action: 'Clause AV \u2192 b\u00e9n\u00e9ficiaires', detail: '50% ' + (ctx.bens[0] ? esc(ctx.bens[0].nom || ctx.bens[0].prenom) : '') + ', 50% ' + (ctx.bens[1] ? esc(ctx.bens[1].nom || ctx.bens[1].prenom) : ''), eco: '', cout: 'Gratuit' });
            }
        });

        if (sciMultiBiens && (ctx.wantsControl || ctx.wantsSCI || ctx.obj.controle)) {
            var valSCITotal = Math.round(totalImmo * 0.85); var valSCINP = Math.round(valSCITotal * ctx.npRatio);
            var droitsSCITotal = SD._fiscal.calcDroits(Math.max(0, Math.round(valSCINP / ctx.nbBens) - ctx.abatBen), ctx.baremeBen) * ctx.nbBens;
            var droitsSuccImmo = 0;
            immos.forEach(function(im) { droitsSuccImmo += SD._fiscal.calcDroits(Math.max(0, Math.round(im.valeur / ctx.nbBens) - SD._fiscal.getAbattement(ctx.lienBen, true)), ctx.baremeBen) * ctx.nbBens; });
            totalDroitsSucc += droitsSuccImmo; totalDroitsOpt += droitsSCITotal;
            totalFraisOpt += Math.round(valSCINP * 0.018) + 2000;
            steps.push({ num: ++stepNum, quand: 'Mois 3-6', action: 'SCI + donation NP parts', detail: nbImmos + ' biens (' + fmt(totalImmo) + ') \u2192 SCI \u2192 NP ' + ctx.npPct + '% = ' + fmt(valSCINP) + '. D\u00e9cote 15%.', eco: fmt(droitsSuccImmo - droitsSCITotal), cout: '~' + fmt(2000) + ' + compta ' + fmt(1100) + '/an' });
        } else {
            recoParActif.forEach(function(r) {
                if (r.type === 'av') return;
                totalDroitsSucc += r.droitsSucc; totalDroitsOpt += r.droitsOpt;
                var frais = Math.round(r.val * ctx.npRatio * 0.018); totalFraisOpt += frais;
                steps.push({ num: ++stepNum, quand: 'Mois 3-9', action: 'Donation NP ' + esc(r.nom), detail: 'NP ' + ctx.npPct + '% = ' + fmt(Math.round(r.val * ctx.npRatio)) + '.', eco: fmt(r.eco), cout: 'Notaire ~' + fmt(frais) });
            });
        }

        steps.push({ num: ++stepNum, quand: '+15 ans', action: 'Renouvellement abattements', detail: 'Les abattements se rechargent. Nouvelle donation possible.', eco: '', cout: '' });

        steps.forEach(function(s) {
            h += '<div style="display:flex;gap:14px;margin-bottom:10px;padding:12px;border-radius:12px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.05);">';
            h += '<div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--primary-color),var(--primary-dark));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.75rem;flex-shrink:0;">' + s.num + '</div>';
            h += '<div style="flex:1;">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">';
            h += '<div style="font-size:.80rem;font-weight:700;color:var(--text-primary);">' + s.action + '</div>';
            h += '<span style="font-size:.60rem;padding:2px 6px;border-radius:4px;background:rgba(198,134,66,.08);color:var(--text-muted);">' + s.quand + '</span></div>';
            h += '<div style="font-size:.70rem;color:var(--text-secondary);">' + s.detail + '</div>';
            if (s.eco || s.cout) {
                h += '<div style="display:flex;gap:10px;font-size:.62rem;margin-top:3px;">';
                if (s.eco) h += '<span style="color:var(--accent-green);font-weight:600;">\u2714 ' + s.eco + '</span>';
                if (s.cout) h += '<span style="color:var(--text-muted);">\ud83d\udcb3 ' + s.cout + '</span>';
                h += '</div>';
            }
            h += '</div></div>';
        });

        h += '</div>';
        return h;
    }

    function optRow(letter, label, droits, frais, eco, isBest, note) {
        var bg = isBest ? 'background:rgba(16,185,129,.02);' : '';
        var h = '<tr style="border-top:1px solid rgba(198,134,66,.04);' + bg + '"><td style="padding:7px 10px;"><strong>' + letter + '</strong> ' + label;
        if (isBest) h += ' <span style="font-size:.55rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);">\u2714</span>';
        h += '</td><td style="padding:7px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droits) + '</td>';
        h += '<td style="padding:7px 10px;text-align:right;">' + fmt(frais) + '</td>';
        h += '<td style="padding:7px 10px;text-align:right;color:' + (eco > 0 ? 'var(--accent-green)' : 'var(--text-muted)') + ';font-weight:600;">' + (eco > 0 ? '+' + fmt(eco) : '\u2014') + '</td></tr>';
        if (note) h += '<tr style="' + bg + '"><td colspan="4" style="padding:0 10px 6px;font-size:.60rem;color:var(--text-muted);">\u2192 ' + note + '</td></tr>';
        return h;
    }

    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }
    function formatLien(l) { return { 'enfant':'enfant', 'petit_enfant':'petit-enfant', 'conjoint_pacs':'conjoint', 'frere_soeur':'fr\u00e8re/soeur', 'tiers':'tiers' }[l] || l; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    else setTimeout(init, 1500);
})();
