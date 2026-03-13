/**
 * comparison-table-unions.js — Tableau comparatif Mariage / PACS / Concubinage
 *
 * Affiche un tableau UX dans step 5 (résultats) quand un conjoint/partenaire
 * est détecté dans l'arbre familial.
 *
 * Charge APRÈS civil-rights.js
 * @version 1.0.0 — 2026-03-13
 */
const ComparisonTableUnions = (function() {
    'use strict';

    // ============================================================
    // 1. DONNÉES DU TABLEAU (statiques, issues du JSON)
    // ============================================================
    var TABLE_DATA = [
        {
            critere: 'H\u00e9ritage automatique (sans testament)',
            mariage: '\u2705 Oui \u2014 25% PP ou 100% usufruit (art. 757 CC)',
            pacs: '\u274c NON \u2014 rien sans testament (art. 515-6 CC)',
            concubinage: '\u274c NON \u2014 aucun droit successoral'
        },
        {
            critere: 'Droits de succession',
            mariage: '\u2705 Exon\u00e9r\u00e9 (art. 796-0 bis CGI)',
            pacs: '\u2705 Exon\u00e9r\u00e9 (art. 796-0 bis CGI)',
            concubinage: '\u274c 60% (tiers fiscal, abat. 1 594\u20ac)'
        },
        {
            critere: 'DDV (donation au dernier vivant)',
            mariage: '\u2705 Oui \u2014 augmente les droits du conjoint (~150\u20ac notaire)',
            pacs: '\u274c Non applicable',
            concubinage: '\u274c Non applicable'
        },
        {
            critere: 'Abattement en donation',
            mariage: '80 724\u20ac (art. 790 E CGI)',
            pacs: '80 724\u20ac (art. 790 F CGI)',
            concubinage: '0\u20ac \u2014 tax\u00e9 \u00e0 60% d\u00e8s le 1er euro'
        },
        {
            critere: 'Droit au logement',
            mariage: '\u2705 1 an gratuit + droit viager (art. 763-764 CC)',
            pacs: '\u26a0\ufe0f 1 an gratuit seulement (art. 515-6 al. 3)',
            concubinage: '\u274c Aucun droit'
        },
        {
            critere: 'Pension de r\u00e9version',
            mariage: '\u2705 Oui (54% r\u00e9gime g\u00e9n\u00e9ral + compl\u00e9mentaires)',
            pacs: '\u274c Non (sauf rares exceptions)',
            concubinage: '\u274c Non'
        },
        {
            critere: 'Assurance-vie (art. 990 I)',
            mariage: '\u2705 Exon\u00e9r\u00e9 totalement',
            pacs: '\u2705 Exon\u00e9r\u00e9 totalement',
            concubinage: '\u26a0\ufe0f Abat. 152 500\u20ac puis 20%/31,25% \u2014 SEUL outil efficace'
        },
        {
            critere: '\ud83d\udca1 Protection recommand\u00e9e',
            mariage: 'DDV (~150\u20ac) + clause AV d\u00e9membr\u00e9e',
            pacs: '\ud83d\udea8 Testament OBLIGATOIRE + AV',
            concubinage: '\ud83d\udea8 AV (seul outil < 60%) + testament (QD tax\u00e9e 60%)'
        }
    ];

    // ============================================================
    // 2. RENDER — Injection dans step 5
    // ============================================================

    function render() {
        // Vérifier qu'il y a un conjoint/partenaire dans l'arbre
        if (typeof FamilyGraph === 'undefined') return;
        var donors = FamilyGraph.getDonors();
        if (donors.length === 0) return;
        var spouse = FamilyGraph.spouse(donors[0].id);
        if (!spouse) return;

        var unionType = (typeof CivilRights !== 'undefined' && CivilRights.getUnionType)
            ? CivilRights.getUnionType(donors[0].id, spouse.id)
            : 'mariage';

        // Supprimer l'ancien tableau s'il existe
        var existing = document.getElementById('union-comparison-table');
        if (existing) existing.remove();

        // Colonne à highlighter
        var highlightCol = unionType === 'pacs' ? 2 : unionType === 'concubinage' ? 3 : 1;

        var html = '<div class="section-card" id="union-comparison-table" style="margin-top:16px;border-color:rgba(167,139,250,.2);">';
        html += '<div class="section-title"><i class="fas fa-ring" style="background:linear-gradient(135deg,rgba(167,139,250,.2),rgba(167,139,250,.1));color:var(--accent-purple);"></i> Comparatif Mariage / PACS / Concubinage</div>';
        html += '<div class="section-subtitle">Droits du conjoint/partenaire survivant selon le type d\u2019union \u2014 votre situation : <strong style="color:var(--accent-purple);">' + unionType.toUpperCase() + '</strong></div>';

        html += '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(198,134,66,.1);">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:.78rem;min-width:700px;">';

        // Header
        html += '<thead><tr style="background:rgba(198,134,66,.06);">';
        html += '<th style="padding:12px 14px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:2px solid rgba(198,134,66,.1);width:20%;">Crit\u00e8re</th>';
        var cols = ['Mariage', 'PACS', 'Concubinage'];
        cols.forEach(function(col, idx) {
            var isHL = (idx + 1) === highlightCol;
            var bg = isHL ? 'rgba(167,139,250,.08)' : '';
            var border = isHL ? '2px solid rgba(167,139,250,.25)' : '1px solid rgba(198,134,66,.1)';
            var color = isHL ? 'var(--accent-purple)' : 'var(--text-muted)';
            html += '<th style="padding:12px 14px;text-align:left;font-weight:700;color:' + color + ';border-bottom:' + border + ';background:' + bg + ';">';
            html += (isHL ? '\u25b6 ' : '') + col;
            html += '</th>';
        });
        html += '</tr></thead>';

        // Body
        html += '<tbody>';
        TABLE_DATA.forEach(function(row, ri) {
            var isLast = ri === TABLE_DATA.length - 1;
            var rowBg = isLast ? 'rgba(198,134,66,.04)' : (ri % 2 === 0 ? '' : 'rgba(198,134,66,.015)');
            html += '<tr style="background:' + rowBg + ';">';
            html += '<td style="padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid rgba(198,134,66,.05);">' + row.critere + '</td>';

            var vals = [row.mariage, row.pacs, row.concubinage];
            vals.forEach(function(val, ci) {
                var isHL = (ci + 1) === highlightCol;
                var bg = isHL ? 'rgba(167,139,250,.04)' : '';
                var fontW = isHL ? '600' : '400';
                // Color code: ✅ = green, ❌ = red, ⚠️ = amber
                var cellColor = 'var(--text-secondary)';
                if (val.indexOf('\u2705') >= 0) cellColor = 'var(--accent-green)';
                else if (val.indexOf('\u274c') >= 0) cellColor = 'var(--accent-coral)';
                else if (val.indexOf('\u26a0') >= 0) cellColor = 'var(--accent-amber)';
                else if (val.indexOf('\ud83d\udea8') >= 0) cellColor = 'var(--accent-coral)';

                html += '<td style="padding:10px 14px;color:' + cellColor + ';font-weight:' + fontW + ';background:' + bg + ';border-bottom:1px solid rgba(198,134,66,.05);line-height:1.5;">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        // Recommandation contextuelle
        if (unionType === 'pacs') {
            html += '<div class="warning-box error" style="margin-top:12px;"><i class="fas fa-exclamation-circle"></i>';
            html += '<span><strong>Actions urgentes pour le pacs\u00e9 :</strong><br>';
            html += '1. <strong>R\u00e9diger un testament</strong> (legs de la quotit\u00e9 disponible, exon\u00e9r\u00e9 de droits)<br>';
            html += '2. <strong>Souscrire une AV</strong> avec clause b\u00e9n\u00e9ficiaire au partenaire (hors succession)<br>';
            html += '3. Envisager le <strong>mariage</strong> pour b\u00e9n\u00e9ficier de la DDV, du droit viager et de la r\u00e9version</span></div>';
        } else if (unionType === 'concubinage') {
            html += '<div class="warning-box error" style="margin-top:12px;"><i class="fas fa-heart-broken"></i>';
            html += '<span><strong>Situation critique \u2014 concubinage :</strong><br>';
            html += '1. <strong>Assurance-vie</strong> = seul outil avec fiscalit\u00e9 r\u00e9duite (abat. 152 500\u20ac, puis 20%/31,25% vs 60%)<br>';
            html += '2. <strong>Testament</strong> possible mais la part l\u00e9gu\u00e9e sera tax\u00e9e \u00e0 60%<br>';
            html += '3. <strong>Tontine immobili\u00e8re</strong> pour le logement (droits de mutation \u00e0 titre on\u00e9reux au lieu de 60%)<br>';
            html += '4. <strong>Mariage ou PACS</strong> = la solution la plus efficace fiscalement</span></div>';
        } else {
            html += '<div class="warning-box success" style="margin-top:12px;"><i class="fas fa-shield-alt"></i>';
            html += '<span><strong>Mariage \u2014 protection maximale :</strong> ';      
            html += 'Le conjoint est d\u00e9j\u00e0 bien prot\u00e9g\u00e9 par la loi. Pour optimiser : ';
            html += '<strong>DDV</strong> (~150\u20ac, notaire) pour augmenter ses options + ';
            html += '<strong>clause AV d\u00e9membr\u00e9e</strong> (quasi-usufruit au conjoint, NP aux enfants).</span></div>';
        }

        html += '</div>';

        // Injecter après le panneau civil-rights-corrected ou après results-warnings
        var anchor = document.getElementById('civil-rights-corrected') || document.getElementById('results-warnings');
        if (anchor) {
            anchor.insertAdjacentHTML('afterend', html);
        }
    }

    // ============================================================
    // 3. PATCH — S'accrocher à calculateResults
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;

        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(render, 250);
        };

        console.log('[ComparisonTableUnions] Patched SD.calculateResults');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        render: render
    };
})();
