/**
 * per-asset-results.js v1.0 — Phase 2 : Options par actif
 *
 * Pour CHAQUE bien (immo, AV, pro), affiche les options concretes :
 * - Ne rien faire (succession brute)
 * - Donation NP
 * - SCI + NP (si immo)
 * - Capi demembre (si AV)
 * - Vente + donation (si applicable)
 * Avec calculs chiffres et recommandation
 *
 * @version 1.0.0 — 2026-03-18
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
        console.log('[PerAssetResults v1.0] Loaded');
    }

    function renderPerAsset() {
        var existing = document.getElementById('per-asset-results-panel');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var FISCAL = SD._fiscal.getFISCAL();
        var donorAge = state._realDonorAge || state.donor1.age || 60;
        var npRatio = SD._fiscal.getNPRatio(donorAge);
        var npPct = Math.round(npRatio * 100);

        // Identifier les beneficiaires et leur lien
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

        var html = '<div id="per-asset-results-panel" class="section-card" style="border-color:rgba(16,185,129,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-th-list" style="background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(5,150,105,.12));color:var(--accent-green);"></i> Que faire de chaque actif ?</div>';
        html += '<div style="font-size:.75rem;color:var(--text-muted);margin-bottom:16px;">Pour chaque bien, voici les options concretes avec calcul des droits. Le bar\u00e8me art. 669 donne NP = ' + npPct + '% pour un donateur de ' + donorAge + ' ans.</div>';

        // ============================================================
        // IMMOBILIER — par bien
        // ============================================================
        (state.immo || []).forEach(function(im) {
            if (!im.valeur || im.valeur <= 0) return;
            html += renderImmoBien(im, donorAge, npRatio, npPct, nbBens, lienBen, abatBen, baremeBen, FISCAL, donorNom, state);
        });

        // ============================================================
        // ASSURANCE-VIE — par contrat
        // ============================================================
        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie' && (f.valeur || 0) > 0; });
        avItems.forEach(function(av) {
            html += renderAVContrat(av, donorAge, npRatio, npPct, nbBens, lienBen, abatBen, baremeBen, FISCAL, donorNom);
        });

        // ============================================================
        // ACTIFS PRO (si Dutreil)
        // ============================================================
        (state.pro || []).forEach(function(pro) {
            if (!pro.valeur || pro.valeur <= 0) return;
            html += renderProActif(pro, donorAge, npRatio, nbBens, lienBen, abatBen, baremeBen, FISCAL);
        });

        html += '</div>';

        // Inserer apres le baseline panel
        var baseline = document.getElementById('succession-baseline-panel');
        var warning = document.getElementById('succession-legale-warning');
        var anchor = warning || baseline;
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
        else {
            var step5 = document.getElementById('step-5');
            if (step5) {
                var helper = step5.querySelector('.step-helper');
                if (helper) helper.insertAdjacentHTML('afterend', html);
            }
        }
    }

    // ============================================================
    // BIEN IMMOBILIER
    // ============================================================
    function renderImmoBien(im, donorAge, npRatio, npPct, nbBens, lienBen, abatBen, baremeBen, FISCAL, donorNom, state) {
        var val = im.valeur;
        var nom = im.label || 'Bien immobilier';
        var isRP = im.usageActuel === 'rp';
        var isLocatif = im.usageActuel === 'locatif';
        var loyer = im.loyerMensuel || 0;
        var loyerAn = loyer * 12;
        var rendement = val > 0 ? (loyerAn / val * 100).toFixed(1) : '0';
        var icon = isRP ? 'fa-home' : (isLocatif ? 'fa-building' : 'fa-home');
        var typeLabel = isRP ? 'R\u00e9sidence principale' : (isLocatif ? 'Bien locatif' : 'Immobilier');

        var h = '<div style="margin-bottom:18px;padding:18px;border-radius:14px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.1);">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
        h += '<i class="fas ' + icon + '" style="font-size:.9rem;color:var(--primary-color);"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;color:var(--text-primary);">' + esc(nom) + '</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + typeLabel + ' \u00b7 ' + fmt(val);
        if (loyerAn > 0) h += ' \u00b7 Loyer ' + fmt(loyer) + '/mois (' + rendement + '%)';
        h += '</div></div></div>';

        // Calculer les options
        var partParBen = Math.round(val / nbBens);

        // Option A : Ne rien faire
        var baseSucc = Math.max(0, partParBen - SD._fiscal.getAbattement(lienBen, true));
        var droitsSucc = SD._fiscal.calcDroits(baseSucc, baremeBen) * nbBens;
        // Note RP : abat 20% art 764 bis seulement si conjoint/enfant y habite
        var abatRP = isRP ? Math.round(val * 0.20) : 0;
        var rpNote = isRP ? ' (abat. 20% art. 764 bis SI conjoint y habite)' : '';

        // Option B : Donation NP directe
        var valNP = Math.round(val * npRatio);
        var partNP = Math.round(valNP / nbBens);
        var baseNP = Math.max(0, partNP - abatBen);
        var droitsNP = SD._fiscal.calcDroits(baseNP, baremeBen) * nbBens;
        var fraisNP = Math.round(valNP * (FISCAL.fraisNotairePct || 0.018));
        var ecoNP = droitsSucc - droitsNP;

        // Option C : SCI + donation NP parts
        var decote = 0.15;
        var valSCI = Math.round(val * (1 - decote));
        var valSCINP = Math.round(valSCI * npRatio);
        var partSCINP = Math.round(valSCINP / nbBens);
        var baseSCINP = Math.max(0, partSCINP - abatBen);
        var droitsSCI = SD._fiscal.calcDroits(baseSCINP, baremeBen) * nbBens;
        var fraisSCI = Math.round(valSCINP * (FISCAL.fraisNotairePct || 0.018)) + (FISCAL.fraisStructure.creation || 2000);
        var ecoSCI = droitsSucc - droitsSCI;

        // Option D : Vente (si locatif avec PV potentielle)
        var showVente = isLocatif && im.prixAcquisition > 0;
        var pvBrute = 0, pvTotal = 0, netVendeur = 0;
        if (showVente) {
            pvBrute = val - (im.prixAcquisition || 0);
            // Simplification : pas d'abattement duree si < 6 ans
            pvTotal = pvBrute > 0 ? Math.round(pvBrute * 0.362) : 0; // 19% IR + 17.2% PS
            netVendeur = val - pvTotal;
        }

        // TABLEAU OPTIONS
        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.08);">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;">';
        h += '<thead><tr style="background:rgba(198,134,66,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text-label);">Option</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--text-label);">Base taxable</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--text-label);">Droits</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--text-label);">Frais</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--text-label);">\u00c9conomie</th>';
        h += '</tr></thead><tbody>';

        // Row A : Succession
        h += optionRow('A', 'Ne rien faire (succession)', fmt(Math.round(baseSucc * nbBens)), fmt(droitsSucc), fmt(Math.round(val * 0.012)), '\u2014', 'var(--text-muted)', rpNote);

        // Row B : Donation NP
        h += optionRow('B', 'Donation NP (' + npPct + '%) aux b\u00e9n\u00e9ficiaires', fmt(Math.round(baseNP * nbBens)), fmt(droitsNP), fmt(fraisNP), '+' + fmt(ecoNP), 'var(--accent-green)', donorNom + ' conserve l\'usufruit' + (isLocatif ? ' (loyers ' + fmt(loyerAn) + '/an)' : isRP ? ' (habite le bien)' : ''));

        // Row C : SCI + NP
        if (val > 150000) {
            h += optionRow('C', 'SCI + donation NP parts (\u221215%)', fmt(Math.round(baseSCINP * nbBens)), fmt(droitsSCI), fmt(fraisSCI), '+' + fmt(ecoSCI), 'var(--accent-green)', 'D\u00e9cote 15% + NP ' + npPct + '%. ' + donorNom + ' reste g\u00e9rant. Co\u00fbt SCI ~' + fmt(FISCAL.fraisStructure.sci_ir || 1100) + '/an');
        }

        // Row D : Vente
        if (showVente) {
            var droitsVenteDon = SD._fiscal.calcDroits(Math.max(0, Math.round(netVendeur / nbBens) - abatBen), baremeBen) * nbBens;
            h += optionRow('D', 'Vendre + donner le cash', fmt(Math.round(netVendeur)), fmt(droitsVenteDon + pvTotal), fmt(Math.round(netVendeur * 0.018)), pvBrute > 0 ? 'PV ' + fmt(pvTotal) : '\u2014', 'var(--accent-amber)', 'PV brute ' + fmt(pvBrute) + '. Alternative : donner AVANT de vendre (purge PV)');
        }

        h += '</tbody></table></div>';

        // RECOMMANDATION
        var reco = '';
        if (isRP) {
            reco = '<strong>Option B recommand\u00e9e</strong> : donation NP permet \u00e0 ' + esc(donorNom) + ' de rester dans le logement tout en transmettant. \u00c9conomie <strong>' + fmt(ecoNP) + '</strong> vs succession.';
        } else if (isLocatif && val > 200000) {
            reco = '<strong>Option C recommand\u00e9e</strong> (SCI + NP) pour le locatif : d\u00e9cote 15% + NP + contr\u00f4le total. \u00c9conomie <strong>' + fmt(ecoSCI) + '</strong>. Si < 200k\u20ac, option B suffit.';
        } else {
            reco = '<strong>Option B recommand\u00e9e</strong> : donation NP simple. \u00c9conomie <strong>' + fmt(ecoNP) + '</strong>.';
        }
        h += '<div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-lightbulb" style="margin-right:6px;"></i>' + reco + '</div>';

        h += '</div>';
        return h;
    }

    // ============================================================
    // ASSURANCE-VIE
    // ============================================================
    function renderAVContrat(av, donorAge, npRatio, npPct, nbBens, lienBen, abatBen, baremeBen, FISCAL, donorNom) {
        var val = av.valeur || 0;
        var versements = av.versements || 0;
        var primesAv70 = av.primesAvant70 || 0;
        var primesAp70 = av.primesApres70 || 0;
        if (primesAv70 === 0 && primesAp70 === 0 && donorAge >= 70) {
            primesAp70 = versements || val;
        }
        var gains = Math.max(0, val - primesAv70 - primesAp70);
        var is757B = donorAge >= 70 || primesAp70 > 0;

        var h = '<div style="margin-bottom:18px;padding:18px;border-radius:14px;background:rgba(59,130,246,.03);border:1px solid rgba(59,130,246,.1);">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
        h += '<i class="fas fa-shield-alt" style="font-size:.9rem;color:var(--accent-blue);"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;color:var(--text-primary);">Assurance-vie</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + fmt(val) + ' \u00b7 Vers\u00e9 ' + fmt(versements || primesAv70 + primesAp70) + ' \u00b7 Gains ' + fmt(gains) + '</div></div></div>';

        // Option A : Garder (757B ou 990I)
        var droitsA = 0;
        if (is757B && primesAp70 > 0) {
            var base757B = Math.max(0, primesAp70 - (FISCAL.av757B.abattementGlobal || 30500));
            droitsA = SD._fiscal.calcDroits(Math.round(base757B / nbBens), baremeBen) * nbBens;
        }
        if (primesAv70 > 0) {
            var par990I = Math.round(primesAv70 / nbBens);
            var base990I = Math.max(0, par990I - (FISCAL.av990I.abattement || 152500));
            var s = (FISCAL.av990I.seuil2 || 700000) - (FISCAL.av990I.abattement || 152500);
            var t1 = Math.min(base990I, s);
            var t2 = Math.max(0, base990I - s);
            droitsA += Math.round((t1 * 0.20 + t2 * 0.3125) * nbBens);
        }
        var netA = val - droitsA;

        // Option B : Rachats progressifs + dons manuels
        var rachatAnExoIR = 4600; // celibataire apres 8 ans
        var donManuelPE = (FISCAL.abattements.don_familial_argent || 31865) * nbBens;
        var sur10ans = rachatAnExoIR * 10 + donManuelPE;

        // Option C : Capi demembre
        var valNPCapi = Math.round(val * npRatio);
        var partNPCapi = Math.round(valNPCapi / nbBens);
        var baseNPCapi = Math.max(0, partNPCapi - abatBen);
        var droitsCapi = SD._fiscal.calcDroits(baseNPCapi, baremeBen) * nbBens;
        var fraisCapi = Math.round(valNPCapi * (FISCAL.fraisNotairePct || 0.018));
        var netCapi = val - droitsCapi - fraisCapi;
        var ecoCapi = droitsA - droitsCapi;
        // Creance de restitution si quasi-usufruit
        var creanceRestitution = val - valNPCapi;

        // Option D : Clause demembree
        var droitsD = 0; // complexe, simplifie

        // TABLEAU
        h += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(59,130,246,.08);">';
        h += '<table style="width:100%;border-collapse:collapse;font-size:.72rem;">';
        h += '<thead><tr style="background:rgba(59,130,246,.04);">';
        h += '<th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--accent-blue);">Option</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--accent-blue);">Droits</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--accent-blue);">Net transmis</th>';
        h += '<th style="padding:8px 10px;text-align:right;color:var(--accent-blue);">D\u00e9tail</th>';
        h += '</tr></thead><tbody>';

        // A
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);">';
        h += '<td style="padding:6px 10px;"><strong>A</strong> Garder jusqu\'au d\u00e9c\u00e8s (art. ' + (is757B ? '757 B' : '990 I') + ')</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsA) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-green);">' + fmt(netA) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.62rem;color:var(--text-muted);">';
        if (is757B) h += 'Abat. global 30 500 \u20ac. Gains ' + fmt(gains) + ' exon\u00e9r\u00e9s.';
        else h += 'Abat. 152 500 \u20ac/b\u00e9n\u00e9ficiaire.';
        h += '</td></tr>';

        // B
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);">';
        h += '<td style="padding:6px 10px;"><strong>B</strong> Rachats progressifs + dons manuels</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-green);">0 \u20ac</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--text-muted);">~' + fmt(sur10ans) + '/10 ans</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.62rem;color:var(--text-muted);">Rachat ' + fmt(rachatAnExoIR) + '/an exo IR + don ' + fmt(donManuelPE) + ' (art. 790 G). Lent mais 0 droits.</td></tr>';

        // C
        h += '<tr style="border-top:1px solid rgba(59,130,246,.04);background:rgba(16,185,129,.02);">';
        h += '<td style="padding:6px 10px;"><strong>C</strong> Convertir en capi d\u00e9membr\u00e9 <span style="font-size:.55rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);">RECOMMAND\u00c9</span></td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + fmt(droitsCapi) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-green);font-weight:600;">' + fmt(netCapi) + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;font-size:.62rem;color:var(--text-muted);">NP ' + npPct + '% = ' + fmt(valNPCapi) + '. Quasi-US = cr\u00e9ance ' + fmt(creanceRestitution) + ' d\u00e9ductible. Ant\u00e9riorit\u00e9 conserv\u00e9e.</td></tr>';

        h += '</tbody></table></div>';

        // Recommandation
        var recoAV = '';
        if (val > 150000 && is757B) {
            recoAV = '<strong>Option C recommand\u00e9e</strong> : convertir en contrat de capitalisation d\u00e9membr\u00e9. \u00c9conomie <strong>' + fmt(ecoCapi) + '</strong> vs garder en 757 B. ' + esc(donorNom) + ' conserve le quasi-usufruit (capital disponible) + cr\u00e9ance de restitution de ' + fmt(creanceRestitution) + ' d\u00e9ductible au d\u00e9c\u00e8s.';
        } else if (val <= 150000) {
            recoAV = '<strong>Option B recommand\u00e9e</strong> : rachats progressifs + dons manuels pour les petits montants.';
        } else {
            recoAV = '<strong>Option A</strong> si primes vers\u00e9es avant 70 ans (990 I tr\u00e8s avantageux). Sinon <strong>Option C</strong>.';
        }
        h += '<div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.1);font-size:.72rem;color:var(--accent-green);">';
        h += '<i class="fas fa-lightbulb" style="margin-right:6px;"></i>' + recoAV + '</div>';

        // Warning clause
        var hasClause = av.avBeneficiaires && av.avBeneficiaires.length > 0;
        if (!hasClause) {
            h += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.1);font-size:.68rem;color:var(--accent-coral);">';
            h += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>';
            h += '<strong>D\u00e9signez les b\u00e9n\u00e9ficiaires AV</strong> dans Step 3 pour que le capital soit transmis hors succession.';
            h += '</div>';
        }

        h += '</div>';
        return h;
    }

    // ============================================================
    // ACTIF PROFESSIONNEL
    // ============================================================
    function renderProActif(pro, donorAge, npRatio, nbBens, lienBen, abatBen, baremeBen, FISCAL) {
        var val = pro.valeur || 0;
        var pct = pro.pctDetention || 100;
        var valPart = Math.round(val * pct / 100);
        var nom = pro.nom || 'Actif professionnel';
        var hasDutreil = typeof DutreilEntreprise !== 'undefined';

        var h = '<div style="margin-bottom:18px;padding:18px;border-radius:14px;background:rgba(167,139,250,.03);border:1px solid rgba(167,139,250,.1);">';
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
        h += '<i class="fas fa-briefcase" style="font-size:.9rem;color:var(--accent-purple);"></i>';
        h += '<div><div style="font-size:.88rem;font-weight:700;">' + esc(nom) + '</div>';
        h += '<div style="font-size:.65rem;color:var(--text-muted);">' + fmt(valPart) + ' (' + pct + '% de ' + fmt(val) + ')</div></div></div>';

        // Sans Dutreil
        var partBrut = Math.round(valPart / nbBens);
        var baseBrut = Math.max(0, partBrut - abatBen);
        var droitsBrut = SD._fiscal.calcDroits(baseBrut, baremeBen) * nbBens;

        // Avec Dutreil (75% exo)
        var valDutreil = Math.round(valPart * 0.25);
        var partDutreil = Math.round(valDutreil / nbBens);
        var baseDutreil = Math.max(0, partDutreil - abatBen);
        var droitsDutreil = SD._fiscal.calcDroits(baseDutreil, baremeBen) * nbBens;
        // Reduction 50% si donation PP < 70 ans
        if (donorAge < 70) droitsDutreil = Math.round(droitsDutreil * 0.5);
        var ecoDutreil = droitsBrut - droitsDutreil;

        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.06);text-align:center;">';
        h += '<div style="font-size:.58rem;color:var(--text-muted);">SANS Dutreil</div>';
        h += '<div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(droitsBrut) + '</div>';
        h += '</div>';
        h += '<div style="padding:10px;border-radius:8px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.06);text-align:center;">';
        h += '<div style="font-size:.58rem;color:var(--text-muted);">AVEC Dutreil (75% exo' + (donorAge < 70 ? ' + 50% r\u00e9duc.' : '') + ')</div>';
        h += '<div style="font-size:1rem;font-weight:700;color:var(--accent-green);">' + fmt(droitsDutreil) + '</div>';
        h += '<div style="font-size:.62rem;color:var(--accent-green);">\u00c9conomie ' + fmt(ecoDutreil) + '</div>';
        h += '</div></div>';

        h += '<div style="margin-top:8px;font-size:.68rem;color:var(--text-muted);">Conditions Dutreil : engagement collectif 2 ans, engagement individuel 4 ans, fonction direction 3 ans. Art. 787 B/C CGI.</div>';
        h += '</div>';
        return h;
    }

    // ============================================================
    // HELPER : ligne de tableau option
    // ============================================================
    function optionRow(letter, label, baseTaxable, droits, frais, eco, ecoColor, note) {
        var isBest = eco && eco.indexOf('+') >= 0 && eco !== '\u2014';
        var bg = isBest ? 'background:rgba(16,185,129,.02);' : '';
        var h = '<tr style="border-top:1px solid rgba(198,134,66,.04);' + bg + '">';
        h += '<td style="padding:6px 10px;"><strong>' + letter + '</strong> ' + label;
        if (isBest) h += ' <span style="font-size:.55rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);">RECOMMAND\u00c9</span>';
        h += '</td>';
        h += '<td style="padding:6px 10px;text-align:right;">' + baseTaxable + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:var(--accent-coral);">' + droits + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;">' + frais + '</td>';
        h += '<td style="padding:6px 10px;text-align:right;color:' + ecoColor + ';font-weight:600;">' + eco + '</td>';
        h += '</tr>';
        if (note) {
            h += '<tr style="' + bg + '"><td colspan="5" style="padding:2px 10px 6px;font-size:.62rem;color:var(--text-muted);">' + note + '</td></tr>';
        }
        return h;
    }

    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    else setTimeout(init, 1500);
})();
