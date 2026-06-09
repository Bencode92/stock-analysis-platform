/**
 * succession-baseline.js v1.1 — Section 1 : Succession brute baseline
 *
 * v1.1: SEPARATION AV / MASSE SUCCESSORALE
 *   L'AV est HORS succession (art. L132-12 C.Ass.)
 *   Masse successorale = patrimoine HORS AV
 *   AV affichee separement avec 990I ou 757B selon age
 *   Warning clause beneficiaire obligatoire
 *   Reserve/QD calculees sur masse hors AV
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
            setTimeout(renderBaseline, 300);
        };
        console.log('[SuccessionBaseline v1.1] Loaded — AV hors succession');
    }

    function renderBaseline() {
        var existing = document.getElementById('succession-baseline-panel');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var pat = SD._fiscal.computePatrimoine();
        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var FISCAL = SD._fiscal.getFISCAL();

        // ============================================================
        // SEPARER AV DU PATRIMOINE SUCCESSORAL
        // ============================================================
        var avItems = (state.finance || []).filter(function(f) { return f.type === 'assurance_vie'; });
        var totalAV = avItems.reduce(function(s, f) { return s + (f.valeur || 0); }, 0);
        var totalPrimesAv70 = avItems.reduce(function(s, f) { return s + (f.primesAvant70 || 0); }, 0);
        var totalPrimesAp70 = avItems.reduce(function(s, f) { return s + (f.primesApres70 || 0); }, 0);
        // Si primes non ventilees, tout est considere apres 70 ans si donateur > 70
        var donorAge = state._realDonorAge || state.donor1.age || 60;
        if (totalPrimesAv70 === 0 && totalPrimesAp70 === 0 && totalAV > 0 && donorAge >= 70) {
            totalPrimesAp70 = avItems.reduce(function(s, f) { return s + (f.versements || f.valeur || 0); }, 0);
        }
        var totalGainsAV = Math.max(0, totalAV - totalPrimesAv70 - totalPrimesAp70);

        // MASSE SUCCESSORALE = patrimoine HORS AV
        var masseSuccessorale = (pat.actifNet || 0) - totalAV;
        if (masseSuccessorale <= 0 && totalAV <= 0) return;

        // ============================================================
        // IDENTIFIER LES HERITIERS LEGAUX
        // ============================================================
        var persons = FG ? FG.getPersons() : [];
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        var beneficiaires = persons.filter(function(p) { return p.isBeneficiary; });
        var mainDonor = donateurs.length > 0 ? donateurs[0] : null;
        if (!mainDonor) return;

        var enfantsLegaux = findBiologicalChildren(mainDonor, persons, FG);
        var nbEnfants = enfantsLegaux.length;

        var heritiersLegaux = [];
        var lienHeritier = 'enfant';
        if (nbEnfants > 0) {
            heritiersLegaux = enfantsLegaux;
            lienHeritier = 'enfant';
        } else if (beneficiaires.length > 0) {
            heritiersLegaux = beneficiaires;
            if (PO && PO.getDonors && PO.getEffectiveLien) {
                var poDonors = PO.getDonors().filter(function(d) { return d._isDonor; });
                if (poDonors.length > 0 && beneficiaires.length > 0) {
                    lienHeritier = PO.getEffectiveLien(poDonors[0].id, beneficiaires[0].id, poDonors[0].role, beneficiaires[0].lien) || 'enfant';
                }
            }
        }
        if (heritiersLegaux.length === 0) return;

        var nbHeritiers = heritiersLegaux.length;
        var abatParHeritier = SD._fiscal.getAbattement(lienHeritier, true);
        var bareme = SD._fiscal.getBareme(lienHeritier);
        var isConjointExonere = lienHeritier === 'conjoint_pacs';

        // ============================================================
        // CALCUL SUCCESSION (HORS AV)
        // ============================================================
        var partParHeritier = masseSuccessorale > 0 ? Math.round(masseSuccessorale / nbHeritiers) : 0;
        var baseParHeritier = Math.max(0, partParHeritier - abatParHeritier);
        var tranches = calcTranches(baseParHeritier, bareme);
        var droitsParHeritier = tranches.total;
        var droitsTotal = droitsParHeritier * nbHeritiers;
        var netParHeritier = partParHeritier - droitsParHeritier;
        var tauxEffectif = partParHeritier > 0 ? (droitsParHeritier / partParHeritier * 100).toFixed(1) : '0';
        var fraisNotaire = Math.round(masseSuccessorale * (FISCAL.fraisNotaireSuccPct || 0.012));

        // CALCUL AV SEPAREMENT
        var droitsAV = 0;
        var avRegime = '';
        if (totalAV > 0) {
            // Donateurs PathOptimizer (pour resoudre le lien reel de chaque beneficiaire)
            var poDonorsAV = (PO && PO.getDonors) ? PO.getDonors().filter(function(d) { return d._isDonor; }) : [];
            var listBenAV = beneficiaires.length > 0 ? beneficiaires : [{ lien: 'enfant', id: null }];
            function lienReel(ben) {
                if (PO && PO.getEffectiveLien && poDonorsAV.length > 0 && ben.id) {
                    return PO.getEffectiveLien(poDonorsAV[0].id, ben.id, poDonorsAV[0].role, ben.lien) || 'enfant';
                }
                return ben.lien || 'enfant';
            }
            if (totalPrimesAv70 > 0) {
                // Art. 990 I : abat. 152 500 PAR beneficiaire, sur le CAPITAL transmis
                // (primes avant 70 + produits/gains correspondants), pas sur les primes seules.
                var nbBenAV = listBenAV.length;
                var basePrimesAV = totalPrimesAv70 + totalPrimesAp70;
                var capital990I = basePrimesAV > 0 ? totalAV * (totalPrimesAv70 / basePrimesAV) : totalPrimesAv70;
                var parBen990I = capital990I / nbBenAV;
                var base990I = Math.max(0, parBen990I - FISCAL.av990I.abattement);
                var seuil = FISCAL.av990I.seuil2 - FISCAL.av990I.abattement;
                var tr1 = Math.min(base990I, seuil);
                var tr2 = Math.max(0, base990I - seuil);
                droitsAV += Math.round((tr1 * FISCAL.av990I.taux1 + tr2 * FISCAL.av990I.taux2) * nbBenAV);
                avRegime = '990 I';
            }
            if (totalPrimesAp70 > 0) {
                // Art. 757 B : abattement GLOBAL 30 500 reparti au prorata entre beneficiaires,
                // puis CHAQUE beneficiaire taxe au bareme de SON propre lien (progressivite respectee).
                var nbBen757B = listBenAV.length;
                var abatParBen757B = FISCAL.av757B.abattementGlobal / nbBen757B;
                var partPrimes757B = totalPrimesAp70 / nbBen757B;
                listBenAV.forEach(function(ben) {
                    var base757B = Math.max(0, partPrimes757B - abatParBen757B);
                    droitsAV += SD._fiscal.calcDroits(base757B, SD._fiscal.getBareme(lienReel(ben)));
                });
                avRegime = avRegime ? avRegime + ' + 757 B' : '757 B';
            }
        }

        var droitsTotalGlobal = droitsTotal + droitsAV;

        // Reserve hereditaire (calculee sur masse HORS AV)
        var tauxReserve = nbEnfants === 1 ? 0.5 : (nbEnfants >= 3 ? 0.75 : 2/3);
        var reserve = Math.round(masseSuccessorale * tauxReserve);
        var qd = masseSuccessorale - reserve;
        var reserveLabel = nbEnfants === 1 ? '1/2' : (nbEnfants >= 3 ? '3/4' : '2/3');
        var qdLabel = nbEnfants === 1 ? '1/2' : (nbEnfants >= 3 ? '1/4' : '1/3');

        // ============================================================
        // RENDER HTML
        // ============================================================
        var html = '';
        html += '<div id="succession-baseline-panel" class="section-card" style="border-color:rgba(255,107,107,.3);margin-bottom:20px;background:linear-gradient(135deg,rgba(51,44,32,.95),rgba(60,40,35,.3));">';

        // TITRE
        html += '<div class="section-title" style="margin-bottom:18px;">';
        html += '<i class="fas fa-skull-crossbones" style="background:linear-gradient(135deg,rgba(255,107,107,.2),rgba(255,82,82,.12));color:var(--accent-coral);box-shadow:0 4px 12px rgba(255,107,107,.2);"></i>';
        html += ' Si rien n\'est fait : succession au d\u00e9c\u00e8s de ' + esc(mainDonor.nom);
        html += '</div>';

        // QUI HERITE
        html += '<div style="padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);margin-bottom:16px;">';
        html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:8px;">';
        html += '<i class="fas fa-gavel" style="margin-right:6px;"></i>Qui h\u00e9rite l\u00e9galement ?</div>';

        if (nbEnfants > 0) {
            var enfantsNoms = enfantsLegaux.map(function(e) { return '<strong>' + esc(e.nom) + '</strong>'; }).join(', ');
            html += '<div style="font-size:.82rem;color:var(--text-primary);margin-bottom:6px;">';
            html += enfantsNoms + ' (' + (nbEnfants === 1 ? 'enfant unique' : nbEnfants + ' enfants') + ') \u2014 h\u00e9ritier' + (nbEnfants > 1 ? 's' : '') + ' r\u00e9servataire' + (nbEnfants > 1 ? 's' : '') + ' (art. 913 CC)';
            html += '</div>';
            var peNoms = beneficiaires.map(function(b) { return esc(b.nom); }).join(', ');
            if (beneficiaires.length > 0 && enfantsLegaux.every(function(e) { return !beneficiaires.some(function(b) { return b.id === e.id; }); })) {
                html += '<div style="font-size:.75rem;color:var(--accent-amber);margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(255,179,0,.04);border:1px solid rgba(255,179,0,.08);">';
                html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
                html += 'Les b\u00e9n\u00e9ficiaires coch\u00e9s (' + peNoms + ') ne re\u00e7oivent <strong>rien</strong> en succession l\u00e9gale. ';
                html += 'Il faut une <strong>donation</strong>, un <strong>testament</strong>, ou une <strong>renonciation</strong> de ' + enfantsNoms + '.';
                html += '</div>';
            }
        } else {
            html += '<div style="font-size:.82rem;color:var(--text-primary);">';
            html += heritiersLegaux.map(function(h) { return '<strong>' + esc(h.nom) + '</strong>'; }).join(', ');
            html += '</div>';
        }
        html += '</div>';

        // ============================================================
        // SECTION A : MASSE SUCCESSORALE (HORS AV)
        // ============================================================
        html += '<div style="font-size:.78rem;font-weight:700;color:var(--text-label);margin-bottom:10px;">';
        html += '<i class="fas fa-home" style="margin-right:6px;font-size:.65rem;color:var(--primary-color);"></i>';
        html += 'Masse successorale (hors assurance-vie)';
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Patrimoine taxable</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--text-primary);">' + fmt(masseSuccessorale) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">Immo ' + fmt(pat.immo) + (pat.financier - totalAV > 0 ? ' \u00b7 Fin. (hors AV) ' + fmt(pat.financier - totalAV) : '') + '</div>';
        html += '</div>';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Droits de succession</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-coral);">' + fmt(droitsTotal) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">+ frais notaire ' + fmt(fraisNotaire) + '</div>';
        html += '</div>';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.12);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Net re\u00e7u par ' + esc(heritiersLegaux[0].nom) + '</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-green);">' + fmt(masseSuccessorale - droitsTotal - fraisNotaire) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">Taux effectif ' + tauxEffectif + '%</div>';
        html += '</div>';
        html += '</div>';

        // BAREME DETAILLE
        if (!isConjointExonere && masseSuccessorale > 0) {
            html += '<div style="margin-bottom:16px;">';
            html += '<div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:10px;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">';
            html += 'Part brute : <strong>' + fmt(partParHeritier) + '</strong>';
            html += ' \u2212 abattement ' + formatLien(lienHeritier) + ' : <strong>' + fmt(abatParHeritier) + '</strong>';
            html += ' = base taxable : <strong style="color:var(--accent-coral);">' + fmt(baseParHeritier) + '</strong>';
            html += '</div>';

            html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.1);">';
            html += '<table style="width:100%;border-collapse:collapse;font-size:.75rem;">';
            html += '<thead><tr style="background:rgba(198,134,66,.06);">';
            html += '<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-label);">Tranche (art. 777 CGI)</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Taux</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Montant</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Droits</th>';
            html += '</tr></thead><tbody>';

            tranches.detail.forEach(function(tr) {
                html += '<tr style="border-top:1px solid rgba(198,134,66,.04);">';
                html += '<td style="padding:6px 12px;color:var(--text-secondary);">' + tr.label + '</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--text-secondary);">' + tr.tauxPct + '%</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--text-secondary);">' + fmt(tr.montant) + '</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--accent-coral);">' + fmt(tr.droits) + '</td>';
                html += '</tr>';
            });

            html += '<tr style="border-top:2px solid rgba(198,134,66,.15);font-weight:700;">';
            html += '<td style="padding:8px 12px;" colspan="2">TOTAL</td>';
            html += '<td style="padding:8px 12px;text-align:right;">' + fmt(baseParHeritier) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;color:var(--accent-coral);font-size:.85rem;">' + fmt(droitsTotal) + '</td>';
            html += '</tr>';
            html += '</tbody></table></div>';
            html += '</div>';
        }

        // ============================================================
        // SECTION B : ASSURANCE-VIE (HORS SUCCESSION)
        // ============================================================
        if (totalAV > 0) {
            html += '<div style="margin-top:6px;margin-bottom:16px;padding:16px 18px;border-radius:12px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.12);">';
            html += '<div style="font-size:.78rem;font-weight:700;color:var(--accent-blue);margin-bottom:10px;display:flex;align-items:center;gap:8px;">';
            html += '<i class="fas fa-shield-alt" style="font-size:.7rem;"></i>';
            html += 'Assurance-vie \u2014 HORS succession (art. L132-12 C. Assurances)';
            html += '</div>';

            html += '<div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:10px;">';
            html += 'L\'assurance-vie n\'entre <strong>pas</strong> dans la masse successorale. Elle est transmise directement aux b\u00e9n\u00e9ficiaires d\u00e9sign\u00e9s dans la clause, avec une fiscalit\u00e9 sp\u00e9cifique.';
            html += '</div>';

            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
            html += '<div style="padding:10px;border-radius:8px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.06);text-align:center;">';
            html += '<div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Capital AV</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-blue);">' + fmt(totalAV) + '</div>';
            html += '</div>';
            html += '<div style="padding:10px;border-radius:8px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.06);text-align:center;">';
            html += '<div style="font-size:.55rem;text-transform:uppercase;color:var(--text-muted);">Droits AV (art. ' + (avRegime || '757 B') + ')</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(droitsAV) + '</div>';
            html += '</div>';
            html += '</div>';

            // Detail regime AV
            if (donorAge >= 70) {
                html += '<div style="font-size:.72rem;color:var(--text-secondary);padding:8px 10px;border-radius:6px;background:rgba(255,179,0,.03);border:1px solid rgba(255,179,0,.06);margin-bottom:8px;">';
                html += '<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:4px;"></i>';
                html += '<strong>Art. 757 B</strong> (donateur > 70 ans) : abattement global <strong>30 500 \u20ac</strong> seulement (partag\u00e9 entre tous les b\u00e9n\u00e9ficiaires). ';
                html += 'Les <strong>int\u00e9r\u00eats</strong> (' + fmt(totalGainsAV) + ') sont <strong>exon\u00e9r\u00e9s</strong>. Seules les primes (' + fmt(totalPrimesAp70) + ') sont tax\u00e9es au bar\u00e8me DMTG.';
                html += '</div>';

                if (totalPrimesAv70 > 0) {
                    html += '<div style="font-size:.72rem;color:var(--accent-green);padding:6px 10px;border-radius:6px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.06);margin-bottom:8px;">';
                    html += '<i class="fas fa-check-circle" style="margin-right:4px;"></i>';
                    html += '<strong>Art. 990 I</strong> (primes avant 70 ans) : ' + fmt(totalPrimesAv70) + ' b\u00e9n\u00e9ficient de l\'abattement <strong>152 500 \u20ac/b\u00e9n\u00e9ficiaire</strong>.';
                    html += '</div>';
                }
            } else {
                html += '<div style="font-size:.72rem;color:var(--accent-green);padding:8px 10px;border-radius:6px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.06);margin-bottom:8px;">';
                html += '<i class="fas fa-check-circle" style="margin-right:4px;"></i>';
                html += '<strong>Art. 990 I</strong> (donateur < 70 ans) : abattement <strong>152 500 \u20ac par b\u00e9n\u00e9ficiaire</strong>. Tr\u00e8s avantageux.';
                html += '</div>';
            }

            // Verifier clause beneficiaire
            var hasClause = avItems.some(function(f) { return f.avBeneficiaires && f.avBeneficiaires.length > 0; });
            if (!hasClause) {
                html += '<div style="font-size:.72rem;color:var(--accent-coral);padding:8px 10px;border-radius:6px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.1);">';
                html += '<i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>';
                html += '<strong>Clause b\u00e9n\u00e9ficiaire non renseign\u00e9e !</strong> Sans clause, le capital retombe dans la succession et perd tout avantage fiscal. ';
                html += 'D\u00e9signez les b\u00e9n\u00e9ficiaires dans le Step 3 (section Actifs financiers → AV → B\u00e9n\u00e9ficiaires).';
                html += '</div>';
            }

            html += '</div>';
        }

        // ============================================================
        // TOTAL GLOBAL
        // ============================================================
        if (totalAV > 0) {
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">';
            html += '<div style="padding:14px;border-radius:12px;background:rgba(255,107,107,.06);border:1px solid rgba(255,107,107,.15);text-align:center;">';
            html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Droits totaux (succession + AV)</div>';
            html += '<div style="font-size:1.3rem;font-weight:900;color:var(--accent-coral);">' + fmt(droitsTotalGlobal) + '</div>';
            html += '<div style="font-size:.62rem;color:var(--text-muted);">Succession ' + fmt(droitsTotal) + ' + AV ' + fmt(droitsAV) + '</div>';
            html += '</div>';
            html += '<div style="padding:14px;border-radius:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);text-align:center;">';
            html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Net total transmis</div>';
            html += '<div style="font-size:1.3rem;font-weight:900;color:var(--accent-green);">' + fmt((pat.actifNet || 0) - droitsTotalGlobal - fraisNotaire) + '</div>';
            html += '</div>';
            html += '</div>';
        }

        // RESERVE + QD (calculees sur masse HORS AV)
        if (nbEnfants > 0 && !isConjointExonere && masseSuccessorale > 0) {
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">';
            html += '<div style="padding:12px;border-radius:10px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.08);">';
            html += '<div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;">R\u00e9serve h\u00e9r\u00e9ditaire (' + reserveLabel + ')</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(reserve) + '</div>';
            html += '<div style="font-size:.60rem;color:var(--text-muted);">Calcul\u00e9e sur la masse successorale hors AV. Revient obligatoirement \u00e0 ' + enfantsNoms + '.</div>';
            html += '</div>';
            html += '<div style="padding:12px;border-radius:10px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.08);">';
            html += '<div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;">Quotit\u00e9 disponible (' + qdLabel + ')</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-green);">' + fmt(qd) + '</div>';
            html += '<div style="font-size:.60rem;color:var(--text-muted);">L\u00e9gable par testament aux PE. L\'AV s\'ajoute en plus (hors QD).</div>';
            html += '</div>';
            html += '</div>';
        }

        // TRANSITION
        html += '<div style="margin-top:14px;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,rgba(198,134,66,.06),rgba(16,185,129,.04));border:1px solid rgba(198,134,66,.12);font-size:.78rem;color:var(--text-secondary);text-align:center;">';
        html += '<i class="fas fa-arrow-down" style="color:var(--primary-color);margin-right:6px;"></i>';
        html += 'Les sections suivantes montrent comment <strong>r\u00e9duire ces ' + fmt(droitsTotalGlobal) + ' de droits</strong> gr\u00e2ce \u00e0 des donations, du d\u00e9membrement, ou de l\'optimisation AV.';
        html += '</div>';

        html += '</div>';

        // INSERER EN PREMIER
        var step5 = document.getElementById('step-5');
        if (!step5) return;
        var firstCard = step5.querySelector('.step-helper');
        if (firstCard) firstCard.insertAdjacentHTML('afterend', html);
        else step5.insertAdjacentHTML('afterbegin', html);
    }

    function calcTranches(base, bareme) {
        if (base <= 0) return { total: 0, detail: [] };
        var detail = [], prev = 0, total = 0;
        bareme.forEach(function(tr) {
            var taxable = Math.min(base, tr.max) - prev;
            if (taxable <= 0) return;
            var droits = Math.round(taxable * tr.taux);
            total += droits;
            detail.push({ label: fmt(prev) + ' \u2192 ' + (tr.max === Infinity ? 'au-del\u00e0' : fmt(tr.max)), taux: tr.taux, tauxPct: Math.round(tr.taux * 100), montant: taxable, droits: droits });
            prev = tr.max;
        });
        return { total: Math.round(total), detail: detail };
    }

    function findBiologicalChildren(donor, persons, FG) {
        var enfants = [];
        if (FG && FG.getChildren) {
            var childIds = FG.getChildren(donor.id);
            if (childIds && childIds.length > 0) enfants = persons.filter(function(p) { return childIds.indexOf(p.id) >= 0; });
        }
        if (enfants.length === 0) {
            enfants = persons.filter(function(p) { return p.parentIds && p.parentIds.indexOf(donor.id) >= 0; });
        }
        if (enfants.length === 0 && FG && FG.computeFiscalLien) {
            persons.forEach(function(p) {
                if (p.id === donor.id || p.isBeneficiary) return;
                if (FG.computeFiscalLien(donor.id, p.id) === 'enfant') {
                    if (!enfants.some(function(e) { return e.spouseId === p.id; })) enfants.push(p);
                }
            });
        }
        if (enfants.length > 1) {
            var eIds = enfants.map(function(e) { return e.id; });
            enfants = enfants.filter(function(enf) {
                if (enf.spouseId && eIds.indexOf(enf.spouseId) >= 0) {
                    return FG && FG.computeFiscalLien ? FG.computeFiscalLien(donor.id, enf.id) === 'enfant' : true;
                }
                return true;
            });
        }
        return enfants;
    }

    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }
    function formatLien(lien) {
        return { 'enfant':'Enfant', 'petit_enfant':'Petit-enfant', 'conjoint_pacs':'Conjoint', 'frere_soeur':'Fr\u00e8re/S\u0153ur', 'neveu_niece':'Neveu/Ni\u00e8ce', 'tiers':'Tiers' }[lien] || lien;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1400); });
    else setTimeout(init, 1400);
})();
