/**
 * succession-baseline.js v1.0 — Section 1 : Succession brute baseline
 *
 * Affiche EN PREMIER dans le Step 5 :
 * 1. Qui herite legalement (enfants = reservataires, pas les PE)
 * 2. Bareme detaille tranche par tranche
 * 3. Cout total des droits = baseline pour mesurer les economies
 * 4. Reserve hereditaire + quotite disponible
 *
 * @version 1.0.0 — 2026-03-17
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
        console.log('[SuccessionBaseline v1.0] Loaded');
    }

    function renderBaseline() {
        var existing = document.getElementById('succession-baseline-panel');
        if (existing) existing.remove();

        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var pat = SD._fiscal.computePatrimoine();
        var actifNet = pat.actifNet || 0;
        if (actifNet <= 0) return;

        var FG = (typeof FamilyGraph !== 'undefined') ? FamilyGraph : null;
        var PO = (typeof PathOptimizer !== 'undefined') ? PathOptimizer : null;
        var FISCAL = SD._fiscal.getFISCAL();

        // ============================================================
        // 1. IDENTIFIER LES HERITIERS LEGAUX
        // ============================================================
        var persons = FG ? FG.getPersons() : [];
        var donateurs = persons.filter(function(p) { return p.isDonor; });
        var beneficiaires = persons.filter(function(p) { return p.isBeneficiary; });
        var mainDonor = donateurs.length > 0 ? donateurs[0] : null;

        if (!mainDonor) return;

        // Trouver les enfants biologiques du donateur
        var enfantsLegaux = findBiologicalChildren(mainDonor, persons, FG);
        var nbEnfants = enfantsLegaux.length;

        // Si pas d'enfants trouves, les beneficiaires sont peut-etre les heritiers directs
        var heritiersLegaux = [];
        var lienHeritier = 'enfant';

        if (nbEnfants > 0) {
            heritiersLegaux = enfantsLegaux;
            lienHeritier = 'enfant';
        } else if (beneficiaires.length > 0) {
            // Les beneficiaires coches sont les heritiers
            heritiersLegaux = beneficiaires;
            // Determiner le lien
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
        // 2. CALCUL BAREME DETAILLE
        // ============================================================
        var partParHeritier = Math.round(actifNet / nbHeritiers);
        var baseParHeritier = Math.max(0, partParHeritier - abatParHeritier);

        // Calcul tranche par tranche
        var tranches = calcTranches(baseParHeritier, bareme);
        var droitsParHeritier = tranches.total;
        var droitsTotal = droitsParHeritier * nbHeritiers;
        var netParHeritier = partParHeritier - droitsParHeritier;
        var tauxEffectif = partParHeritier > 0 ? (droitsParHeritier / partParHeritier * 100).toFixed(1) : '0';
        var fraisNotaire = Math.round(actifNet * (FISCAL.fraisNotaireSuccPct || 0.012));

        // Reserve hereditaire
        var tauxReserve = nbEnfants === 1 ? 0.5 : (nbEnfants >= 3 ? 0.75 : 2/3);
        var reserve = Math.round(actifNet * tauxReserve);
        var qd = actifNet - reserve;
        var reserveLabel = nbEnfants === 1 ? '1/2' : (nbEnfants >= 3 ? '3/4' : '2/3');
        var qdLabel = nbEnfants === 1 ? '1/2' : (nbEnfants >= 3 ? '1/4' : '1/3');

        // ============================================================
        // 3. RENDER HTML
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

            // Verifier si les PE sont les beneficiaires coches (donation scenario)
            var peNoms = beneficiaires.map(function(b) { return esc(b.nom); }).join(', ');
            if (beneficiaires.length > 0 && enfantsLegaux.every(function(e) { return !beneficiaires.some(function(b) { return b.id === e.id; }); })) {
                html += '<div style="font-size:.75rem;color:var(--accent-amber);margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(255,179,0,.04);border:1px solid rgba(255,179,0,.08);">';
                html += '<i class="fas fa-info-circle" style="margin-right:4px;"></i>';
                html += 'Les b\u00e9n\u00e9ficiaires coch\u00e9s (' + peNoms + ') ne re\u00e7oivent <strong>rien</strong> en succession l\u00e9gale. ';
                html += 'Pour qu\'ils re\u00e7oivent, il faut une <strong>donation du vivant</strong>, un <strong>testament</strong>, ou une <strong>renonciation</strong> de ' + enfantsNoms + '.';
                html += '</div>';
            }
        } else {
            html += '<div style="font-size:.82rem;color:var(--text-primary);">';
            html += heritiersLegaux.map(function(h) { return '<strong>' + esc(h.nom) + '</strong>'; }).join(', ');
            html += '</div>';
        }
        html += '</div>';

        // PATRIMOINE TAXABLE
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Patrimoine taxable</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--text-primary);">' + fmt(actifNet) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">Immo ' + fmt(pat.immo) + ' \u00b7 Fin. ' + fmt(pat.financier) + (pat.pro > 0 ? ' \u00b7 Pro ' + fmt(pat.pro) : '') + '</div>';
        html += '</div>';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Droits de succession</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-coral);">' + fmt(droitsTotal) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">+ frais notaire ' + fmt(fraisNotaire) + '</div>';
        html += '</div>';

        html += '<div style="padding:14px;border-radius:12px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.12);text-align:center;">';
        html += '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">Net re\u00e7u' + (nbHeritiers > 1 ? ' (total)' : '') + '</div>';
        html += '<div style="font-size:1.2rem;font-weight:800;color:var(--accent-green);">' + fmt(actifNet - droitsTotal - fraisNotaire) + '</div>';
        html += '<div style="font-size:.62rem;color:var(--text-muted);">Taux effectif ' + tauxEffectif + '%</div>';
        html += '</div>';
        html += '</div>';

        // BAREME DETAILLE
        if (!isConjointExonere) {
            html += '<div style="margin-bottom:16px;">';
            html += '<div style="font-size:.78rem;font-weight:700;color:var(--text-label);margin-bottom:8px;display:flex;align-items:center;gap:6px;">';
            html += '<i class="fas fa-table" style="font-size:.65rem;color:var(--primary-color);"></i>';
            html += 'Bar\u00e8me d\u00e9taill\u00e9 par h\u00e9ritier (art. 777 CGI)';
            html += '</div>';

            // Info abattement
            html += '<div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:10px;padding:8px 12px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">';
            html += 'Part brute : <strong>' + fmt(partParHeritier) + '</strong>';
            html += ' \u2212 abattement ' + formatLien(lienHeritier) + ' : <strong>' + fmt(abatParHeritier) + '</strong>';
            html += ' = base taxable : <strong style="color:var(--accent-coral);">' + fmt(baseParHeritier) + '</strong>';
            html += '</div>';

            // Tableau tranches
            html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(198,134,66,.1);">';
            html += '<table style="width:100%;border-collapse:collapse;font-size:.75rem;">';
            html += '<thead><tr style="background:rgba(198,134,66,.06);">';
            html += '<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-label);">Tranche</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Taux</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Montant tax\u00e9</th>';
            html += '<th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-label);">Droits</th>';
            html += '</tr></thead><tbody>';

            tranches.detail.forEach(function(tr, i) {
                var isLast = i === tranches.detail.length - 1;
                html += '<tr style="border-top:1px solid rgba(198,134,66,.04);' + (isLast ? 'font-weight:600;' : '') + '">';
                html += '<td style="padding:6px 12px;color:var(--text-secondary);">' + tr.label + '</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--text-secondary);">' + tr.tauxPct + '%</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--text-secondary);">' + fmt(tr.montant) + '</td>';
                html += '<td style="padding:6px 12px;text-align:right;color:var(--accent-coral);">' + fmt(tr.droits) + '</td>';
                html += '</tr>';
            });

            // Total
            html += '<tr style="border-top:2px solid rgba(198,134,66,.15);font-weight:700;font-size:.82rem;">';
            html += '<td style="padding:8px 12px;" colspan="2">TOTAL par h\u00e9ritier</td>';
            html += '<td style="padding:8px 12px;text-align:right;">' + fmt(baseParHeritier) + '</td>';
            html += '<td style="padding:8px 12px;text-align:right;color:var(--accent-coral);">' + fmt(droitsParHeritier) + '</td>';
            html += '</tr>';

            if (nbHeritiers > 1) {
                html += '<tr style="font-weight:700;font-size:.85rem;background:rgba(255,107,107,.03);">';
                html += '<td style="padding:8px 12px;" colspan="2">TOTAL (' + nbHeritiers + ' h\u00e9ritiers)</td>';
                html += '<td style="padding:8px 12px;text-align:right;">' + fmt(baseParHeritier * nbHeritiers) + '</td>';
                html += '<td style="padding:8px 12px;text-align:right;color:var(--accent-coral);font-size:.92rem;">' + fmt(droitsTotal) + '</td>';
                html += '</tr>';
            }
            html += '</tbody></table></div>';

            // Detail par heritier si > 1
            if (nbHeritiers > 1) {
                html += '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">';
                heritiersLegaux.forEach(function(h) {
                    html += '<div style="flex:1;min-width:200px;padding:12px;border-radius:10px;background:rgba(198,134,66,.02);border:1px solid rgba(198,134,66,.06);">';
                    html += '<div style="font-size:.78rem;font-weight:700;">' + esc(h.nom) + '</div>';
                    html += '<div style="font-size:.65rem;color:var(--text-muted);">' + formatLien(lienHeritier) + '</div>';
                    html += '<div style="display:flex;justify-content:space-between;margin-top:6px;">';
                    html += '<span style="font-size:.72rem;color:var(--text-secondary);">Re\u00e7oit : ' + fmt(partParHeritier) + '</span>';
                    html += '<span style="font-size:.72rem;color:var(--accent-coral);">Droits : ' + fmt(droitsParHeritier) + '</span>';
                    html += '</div>';
                    html += '<div style="font-size:.85rem;font-weight:800;color:var(--accent-green);margin-top:4px;">Net : ' + fmt(netParHeritier) + '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        } else {
            html += '<div style="padding:14px;border-radius:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);margin-bottom:16px;font-size:.82rem;">';
            html += '<i class="fas fa-check-circle" style="color:var(--accent-green);margin-right:6px;"></i>';
            html += '<strong>Conjoint/PACS exon\u00e9r\u00e9</strong> de droits de succession (art. 796-0 bis CGI). Seuls les frais notariaux s\'appliquent.';
            html += '</div>';
        }

        // RESERVE + QD (si enfants existent)
        if (nbEnfants > 0 && !isConjointExonere) {
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">';

            html += '<div style="padding:12px;border-radius:10px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.08);">';
            html += '<div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;">R\u00e9serve h\u00e9r\u00e9ditaire (' + reserveLabel + ')</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-coral);">' + fmt(reserve) + '</div>';
            html += '<div style="font-size:.62rem;color:var(--text-muted);">Revient obligatoirement aux enfants (art. 913 CC)</div>';
            html += '</div>';

            html += '<div style="padding:12px;border-radius:10px;background:rgba(16,185,129,.03);border:1px solid rgba(16,185,129,.08);">';
            html += '<div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;">Quotit\u00e9 disponible (' + qdLabel + ')</div>';
            html += '<div style="font-size:1rem;font-weight:700;color:var(--accent-green);">' + fmt(qd) + '</div>';
            html += '<div style="font-size:.62rem;color:var(--text-muted);">L\u00e9gable par testament (PE, tiers, association...)</div>';
            html += '</div>';

            html += '</div>';
        }

        // MESSAGE DE TRANSITION
        html += '<div style="margin-top:14px;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,rgba(198,134,66,.06),rgba(16,185,129,.04));border:1px solid rgba(198,134,66,.12);font-size:.78rem;color:var(--text-secondary);text-align:center;">';
        html += '<i class="fas fa-arrow-down" style="color:var(--primary-color);margin-right:6px;"></i>';
        html += 'Les sections suivantes montrent comment <strong>r\u00e9duire ces ' + fmt(droitsTotal) + ' de droits</strong> gr\u00e2ce \u00e0 des donations, du d\u00e9membrement, ou de l\'assurance-vie.';
        html += '</div>';

        html += '</div>';

        // INSERER EN PREMIER dans le Step 5 (avant le warning succession legale)
        var step5 = document.getElementById('step-5');
        if (!step5) return;
        var firstCard = step5.querySelector('.step-helper');
        if (firstCard) {
            firstCard.insertAdjacentHTML('afterend', html);
        } else {
            step5.insertAdjacentHTML('afterbegin', html);
        }
    }

    // ============================================================
    // CALCUL TRANCHES DETAILLE
    // ============================================================
    function calcTranches(base, bareme) {
        if (base <= 0) return { total: 0, detail: [] };
        var detail = [];
        var prev = 0;
        var total = 0;

        bareme.forEach(function(tr) {
            var taxable = Math.min(base, tr.max) - prev;
            if (taxable <= 0) return;
            var droits = Math.round(taxable * tr.taux);
            total += droits;
            var label = fmt(prev) + ' \u2192 ' + (tr.max === Infinity ? 'au-del\u00e0' : fmt(tr.max));
            detail.push({ label: label, taux: tr.taux, tauxPct: Math.round(tr.taux * 100), montant: taxable, droits: droits });
            prev = tr.max;
        });

        return { total: Math.round(total), detail: detail };
    }

    // ============================================================
    // TROUVER LES ENFANTS BIOLOGIQUES
    // ============================================================
    function findBiologicalChildren(donor, persons, FG) {
        var enfants = [];

        // Method 1: getChildren
        if (FG && FG.getChildren) {
            var childIds = FG.getChildren(donor.id);
            if (childIds && childIds.length > 0) {
                enfants = persons.filter(function(p) { return childIds.indexOf(p.id) >= 0; });
            }
        }

        // Method 2: parentIds
        if (enfants.length === 0) {
            enfants = persons.filter(function(p) {
                return p.parentIds && p.parentIds.indexOf(donor.id) >= 0;
            });
        }

        // Method 3: computeFiscalLien
        if (enfants.length === 0 && FG && FG.computeFiscalLien) {
            persons.forEach(function(p) {
                if (p.id === donor.id) return;
                if (p.isBeneficiary) return; // les PE sont beneficiaires, pas enfants
                var lien = FG.computeFiscalLien(donor.id, p.id);
                if (lien === 'enfant') {
                    // Verifier que ce n'est pas le conjoint d'un enfant
                    var isSpouseOfAnother = enfants.some(function(e) { return e.spouseId === p.id; });
                    if (!isSpouseOfAnother) enfants.push(p);
                }
            });
        }

        // Filter: remove spouses of children (belles-filles/beaux-fils)
        if (enfants.length > 1) {
            var enfantIds = enfants.map(function(e) { return e.id; });
            enfants = enfants.filter(function(enf) {
                if (enf.spouseId && enfantIds.indexOf(enf.spouseId) >= 0) {
                    // Both this person and spouse in list — keep only bio child
                    if (FG && FG.computeFiscalLien) {
                        var lien = FG.computeFiscalLien(donor.id, enf.id);
                        return lien === 'enfant';
                    }
                }
                return true;
            });
        }

        return enfants;
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function fmt(n) { return SD._fiscal.fmt(n); }
    function esc(s) { return SD._fiscal.esc ? SD._fiscal.esc(s) : String(s).replace(/</g,'&lt;'); }
    function formatLien(lien) {
        var m = { 'enfant':'Enfant', 'petit_enfant':'Petit-enfant', 'conjoint_pacs':'Conjoint',
                  'frere_soeur':'Fr\u00e8re/S\u0153ur', 'neveu_niece':'Neveu/Ni\u00e8ce', 'tiers':'Tiers',
                  'arriere_petit_enfant':'Arr. petit-enfant' };
        return m[lien] || lien;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1400); });
    } else {
        setTimeout(init, 1400);
    }
})();
