/**
 * comparison-table-unions.js — Tableau comparatif Mariage / PACS / Concubinage
 * Affiche dans step 5 quand un conjoint/partenaire est détecté.
 * @version 1.0.0 — 2026-03-13
 */
const ComparisonTableUnions = (function() {
    'use strict';

    var TABLE_DATA = [
        { critere: 'H\u00e9ritage automatique', mariage: '\u2705 Oui \u2014 25% PP ou 100% US (art. 757 CC)', pacs: '\u274c NON sans testament (art. 515-6 CC)', concubinage: '\u274c NON' },
        { critere: 'Droits de succession', mariage: '\u2705 Exon\u00e9r\u00e9 (796-0 bis CGI)', pacs: '\u2705 Exon\u00e9r\u00e9 (796-0 bis CGI)', concubinage: '\u274c 60% (tiers, abat. 1 594\u20ac)' },
        { critere: 'DDV', mariage: '\u2705 Oui (~150\u20ac notaire)', pacs: '\u274c Non applicable', concubinage: '\u274c Non applicable' },
        { critere: 'Abattement donation', mariage: '80 724\u20ac (790 E CGI)', pacs: '80 724\u20ac (790 F CGI)', concubinage: '0\u20ac \u2014 60% d\u00e8s le 1er euro' },
        { critere: 'Droit au logement', mariage: '\u2705 1 an + viager (art. 763-764 CC)', pacs: '\u26a0\ufe0f 1 an seulement (515-6 al.3)', concubinage: '\u274c Aucun' },
        { critere: 'R\u00e9version', mariage: '\u2705 54% r\u00e9gime g\u00e9n\u00e9ral', pacs: '\u274c Non', concubinage: '\u274c Non' },
        { critere: 'Assurance-vie (990 I)', mariage: '\u2705 Exon\u00e9r\u00e9 totalement', pacs: '\u2705 Exon\u00e9r\u00e9 totalement', concubinage: '\u26a0\ufe0f Abat. 152 500\u20ac puis 20%/31,25% \u2014 SEUL outil' },
        { critere: '\ud83d\udca1 Recommandation', mariage: 'DDV + clause AV d\u00e9membr\u00e9e', pacs: '\ud83d\udea8 Testament OBLIGATOIRE + AV', concubinage: '\ud83d\udea8 AV seul outil < 60%' }
    ];

    function render() {
        if (typeof FamilyGraph === 'undefined') return;
        var donors = FamilyGraph.getDonors();
        if (donors.length === 0) return;
        var spouse = FamilyGraph.spouse(donors[0].id);
        if (!spouse) return;
        var unionType = (typeof CivilRights !== 'undefined' && CivilRights.getUnionType) ? CivilRights.getUnionType(donors[0].id, spouse.id) : 'mariage';
        var existing = document.getElementById('union-comparison-table');
        if (existing) existing.remove();
        var highlightCol = unionType === 'pacs' ? 2 : unionType === 'concubinage' ? 3 : 1;

        var html = '<div class="section-card" id="union-comparison-table" style="margin-top:16px;border-color:rgba(167,139,250,.2);">';
        html += '<div class="section-title"><i class="fas fa-ring" style="background:linear-gradient(135deg,rgba(167,139,250,.2),rgba(167,139,250,.1));color:var(--accent-purple);"></i> Comparatif Mariage / PACS / Concubinage</div>';
        html += '<div class="section-subtitle">Votre situation : <strong style="color:var(--accent-purple);">' + unionType.toUpperCase() + '</strong></div>';
        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);"><table style="width:100%;border-collapse:collapse;font-size:.78rem;min-width:700px;">';
        html += '<thead><tr style="background:rgba(198,134,66,.06);"><th style="padding:12px 14px;text-align:left;width:20%;">Crit\u00e8re</th>';
        ['Mariage','PACS','Concubinage'].forEach(function(col, idx) {
            var isHL = (idx+1) === highlightCol;
            html += '<th style="padding:12px 14px;text-align:left;' + (isHL ? 'color:var(--accent-purple);background:rgba(167,139,250,.08);' : 'color:var(--text-muted);') + '">' + (isHL ? '\u25b6 ' : '') + col + '</th>';
        });
        html += '</tr></thead><tbody>';
        TABLE_DATA.forEach(function(row, ri) {
            html += '<tr style="background:' + (ri % 2 ? 'rgba(198,134,66,.015)' : '') + ';">';
            html += '<td style="padding:10px 14px;font-weight:600;border-bottom:1px solid rgba(198,134,66,.05);">' + row.critere + '</td>';
            [row.mariage, row.pacs, row.concubinage].forEach(function(val, ci) {
                var isHL = (ci+1) === highlightCol;
                var color = val.indexOf('\u2705') >= 0 ? 'var(--accent-green)' : val.indexOf('\u274c') >= 0 ? 'var(--accent-coral)' : val.indexOf('\u26a0') >= 0 ? 'var(--accent-amber)' : 'var(--text-secondary)';
                html += '<td style="padding:10px 14px;color:' + color + ';' + (isHL ? 'font-weight:600;background:rgba(167,139,250,.04);' : '') + 'border-bottom:1px solid rgba(198,134,66,.05);line-height:1.5;">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        if (unionType === 'pacs') html += '<div class="warning-box error" style="margin-top:12px;"><i class="fas fa-exclamation-circle"></i><span><strong>PACS :</strong> testament OBLIGATOIRE + AV. Envisagez le mariage pour DDV + r\u00e9version.</span></div>';
        else if (unionType === 'concubinage') html += '<div class="warning-box error" style="margin-top:12px;"><i class="fas fa-heart-broken"></i><span><strong>Concubinage :</strong> AV = seul outil < 60%. Testament possible mais QD tax\u00e9e 60%.</span></div>';
        else html += '<div class="warning-box success" style="margin-top:12px;"><i class="fas fa-shield-alt"></i><span><strong>Mariage :</strong> bien prot\u00e9g\u00e9. Optimisez avec DDV (~150\u20ac) + clause AV d\u00e9membr\u00e9e.</span></div>';
        html += '</div>';

        var anchor = document.getElementById('civil-rights-corrected') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    function init() {
        if (typeof SD === 'undefined') return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() { _origCalc.call(SD); setTimeout(render, 250); };
        console.log('[ComparisonTableUnions] Patched');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
    else setTimeout(init, 300);

    return { render: render };
})();
