/**
 * budget-pdf.js - Module d'export PDF pour l'analyse de budget (VERSION MISE À JOUR)
 * TradePulse Finance Intelligence Platform
 * 
 * Ce module gère l'export PDF des analyses de budget avec :
 * - Génération de templates HTML
 * - Capture des graphiques
 * - Formatage professionnel
 * - Conseils personnalisés
 * 
 * 🆕 MISE À JOUR : Utilise les nouveaux sélecteurs de budget-epargne.js
 * 🐛 FIX : Correction de la portée de exportBtn dans le catch
 */

// ===== CONFIGURATION PDF =====
const PDF_CONFIG = {
    margin: [10, 10, 10, 10],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
    },
    jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait'
    },
    pagebreak: { 
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.page-break-before',
        after: '.page-break-after'
    }
};

// ===== FONCTION PRINCIPALE D'EXPORT =====

/**
 * Exporte l'analyse de budget en PDF
 * @param {Object} budgetData - Données du budget (optionnel, extrait du DOM si non fourni)
 * @param {Object} options - Options d'export (optionnel)
 * @returns {Promise<void>}
 */
export async function exportBudgetToPDF(budgetData = null, options = {}) {
    console.log('🚀 Début export PDF budget (version mise à jour)');
    
    // 🐛 FIX : Déclarer exportBtn avant le try pour éviter ReferenceError dans catch
    let exportBtn;
    let uiState;
    
    try {
        // Chargement de html2pdf si nécessaire
        await loadHtml2PdfLib();
        
        // Récupération du bouton d'export
        exportBtn = document.getElementById('export-budget-pdf');
        
        // Extraction des données du budget avec NOUVEAUX SÉLECTEURS
        const data = budgetData || extractBudgetDataFromDOM();
        
        // Validation des données
        if (!validateBudgetData(data)) {
            throw new Error('Données de budget insuffisantes pour générer le PDF');
        }
        
        // Affichage du loader
        uiState = showLoadingState(exportBtn);
        
        // Génération du template PDF
        const template = await buildCompletePDFTemplate(data);
        
        // Configuration finale
        const finalOptions = {
            ...PDF_CONFIG,
            filename: generatePDFFilename(data.generatedAt),
            ...options
        };
        
        // Génération et téléchargement du PDF
        await html2pdf()
            .set(finalOptions)
            .from(template)
            .save();
        
        console.log('✅ PDF généré avec succès (nouveaux sélecteurs)');
        showSuccessState(exportBtn, uiState);
        
    } catch (error) {
        console.error('❌ Erreur export PDF:', error);
        // 🐛 FIX : exportBtn est maintenant accessible dans le catch
        showErrorState(exportBtn, error.message);
        throw error;
    }
}

// ===== EXTRACTION DES DONNÉES (🆕 MISE À JOUR) =====

/**
 * Extrait les données de budget depuis le DOM avec les NOUVEAUX SÉLECTEURS
 * @returns {Object} Données structurées du budget
 */
function extractBudgetDataFromDOM() {
    console.log('📊 Extraction données budget (nouveaux sélecteurs)');
    
    const data = {
        // Métadonnées
        generatedAt: new Date(),
        
        // 🆕 NOUVEAU : Revenu mensuel avec nouveau sélecteur
        revenu: getInputValue('revenu-mensuel-input'),
        
        // Score et description
        score: getElementText('budget-score', '--'),
        scoreDescription: getElementText('budget-score-description', 'Analyse effectuée'),
        
        // 🆕 NOUVEAU : Dépenses avec nouveaux sélecteurs
        depenses: {
            loyer: getInputValue('simulation-budget-loyer'), // Inchangé
            
            // 🆕 NOUVEAU : Utilise les totaux calculés au lieu des sous-catégories
            vieCourante: getTotalVieCourante(),
            loisirs: getTotalLoisirs(),
            variables: getTotalVariables(),
            
            // Épargne automatique (inchangé)
            epargne: getInputValue('simulation-budget-invest')
        },
        
        // 🆕 NOUVEAU : Totaux calculés avec les nouveaux IDs
        totalDepenses: getCalculatedValue('simulation-depenses-totales'),
        epargneDisponible: getCalculatedValue('simulation-epargne-possible'),
        tauxEpargne: getCalculatedValue('simulation-taux-epargne', '%'),
        
        // Graphiques (si disponibles)
        charts: captureCharts(),
        
        // Objectif utilisateur
        objectif: extractObjectifData()
    };
    
    // Calculs dérivés
    data.ratios = calculateExpenseRatios(data);
    data.evaluations = generateEvaluations(data);
    data.recommendations = generateRecommendations(data);
    
    console.log('✅ Données extraites:', data);
    return data;
}

// ===== FONCTIONS D'EXTRACTION MISES À JOUR =====

/**
 * 🆕 NOUVEAU : Récupère le total "Vie courante" calculé
 * Utilise la fonction globale ou parse le span #total-vie-courante
 */
function getTotalVieCourante() {
    // Méthode 1 : Utiliser la fonction globale si disponible
    if (typeof window.updateTotalVieCourante === 'function') {
        try {
            const total = window.updateTotalVieCourante();
            console.log('📊 Total vie courante (fonction globale):', total);
            return total || 0;
        } catch (e) {
            console.warn('⚠️ Erreur fonction updateTotalVieCourante:', e);
        }
    }
    
    // Méthode 2 : Parser le span #total-vie-courante
    const totalElement = document.getElementById('total-vie-courante');
    if (totalElement) {
        const total = parseFloat(totalElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
        console.log('📊 Total vie courante (span):', total);
        return total;
    }
    
    // Méthode 3 : Fallback - calculer manuellement si les anciens inputs existent encore
    const fallback = getInputValue('simulation-budget-alimentation') + 
                    getInputValue('simulation-budget-transport') + 
                    getInputValue('simulation-budget-factures');
    
    console.log('📊 Total vie courante (fallback):', fallback);
    return fallback;
}

/**
 * 🆕 NOUVEAU : Récupère le total "Loisirs & plaisirs" calculé
 */
function getTotalLoisirs() {
    // Méthode 1 : Utiliser la fonction globale si disponible
    if (typeof window.updateTotalLoisirs === 'function') {
        try {
            const total = window.updateTotalLoisirs();
            console.log('📊 Total loisirs (fonction globale):', total);
            return total || 0;
        } catch (e) {
            console.warn('⚠️ Erreur fonction updateTotalLoisirs:', e);
        }
    }
    
    // Méthode 2 : Parser le span #total-loisirs
    const totalElement = document.getElementById('total-loisirs');
    if (totalElement) {
        const total = parseFloat(totalElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
        console.log('📊 Total loisirs (span):', total);
        return total;
    }
    
    // Méthode 3 : Fallback - calculer avec anciens inputs
    const fallback = getInputValue('simulation-budget-loisirs-sorties') + 
                    getInputValue('simulation-budget-loisirs-sport') + 
                    getInputValue('simulation-budget-loisirs-autres');
    
    console.log('📊 Total loisirs (fallback):', fallback);
    return fallback;
}

/**
 * 🆕 NOUVEAU : Récupère le total des dépenses variables
 */
function getTotalVariables() {
    // Méthode 1 : Utiliser la fonction globale si disponible
    if (typeof window.updateDetailedExpensesTotal === 'function') {
        try {
            const total = window.updateDetailedExpensesTotal();
            console.log('📊 Total variables (fonction globale):', total);
            return total || 0;
        } catch (e) {
            console.warn('⚠️ Erreur fonction updateDetailedExpensesTotal:', e);
        }
    }
    
    // Méthode 2 : Parser les éléments .depense-total
    const totalElements = document.querySelectorAll('.depense-total');
    let total = 0;
    totalElements.forEach(element => {
        const value = parseFloat(element.textContent.replace(/[^0-9.-]/g, '')) || 0;
        total += value;
    });
    
    if (total > 0) {
        console.log('📊 Total variables (parse .depense-total):', total);
        return total;
    }
    
    // Méthode 3 : Fallback - calculer avec anciens inputs
    const fallback = getInputValue('simulation-budget-sante') + 
                    getInputValue('simulation-budget-vetements') + 
                    getInputValue('simulation-budget-autres');
    
    console.log('📊 Total variables (fallback):', fallback);
    return fallback;
}

/**
 * 🆕 NOUVEAU : Récupère une valeur calculée et affichée (avec nettoyage)
 */
function getCalculatedValue(id, suffix = '') {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`⚠️ Élément ${id} non trouvé`);
        return 0;
    }
    
    let text = element.textContent.trim();
    
    // Nettoyage selon le type
    if (suffix === '%') {
        text = text.replace('%', '');
    }
    
    // Suppression de tous les caractères non numériques sauf . et -
    const value = parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
    console.log(`📊 ${id}: ${value}${suffix}`);
    return value;
}

// ===== CONSTRUCTION DU TEMPLATE PDF =====

/**
 * Construit le template PDF complet
 * @param {Object} data - Données du budget
 * @returns {HTMLElement} Template prêt pour html2pdf
 */
async function buildCompletePDFTemplate(data) {
    const template = document.createElement('div');
    template.className = 'pdf-container';
    
    // Ajout des styles CSS pour PDF
    template.appendChild(createPDFStyles());
    
    // Construction des sections
    template.appendChild(buildPdfHeader(data));
    template.appendChild(buildPdfHero(data));
    template.appendChild(buildPdfCharts(data));
    template.appendChild(buildPdfDetailsTable(data));
    
    if (data.objectif && data.objectif.visible) {
        template.appendChild(buildPdfObjective(data));
    }
    
    template.appendChild(buildPdfRecommendations(data));
    
    // Page 2
    const page2 = document.createElement('div');
    page2.className = 'page-break-before';
    page2.appendChild(buildPdfFormulas(data));
    page2.appendChild(buildPdfFooter(data));
    template.appendChild(page2);
    
    return template;
}

/**
 * Crée les styles CSS pour le PDF
 * @returns {HTMLElement} Élément style
 */
function createPDFStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .pdf-container {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #374151;
            background: #ffffff;
            padding: 0;
            margin: 0;
        }
        .pdf-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        .pdf-table th,
        .pdf-table td {
            border: 1px solid #e5e7eb;
            padding: 8px;
            text-align: left;
        }
        .pdf-table th {
            background-color: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        .avoid-break {
            page-break-inside: avoid;
        }
        .page-break-before {
            page-break-before: always;
        }
        .chart-container-pdf {
            text-align: center;
            margin: 0 10px;
            flex: 1;
            max-width: 45%;
        }
        .chart-container-pdf img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .eval-excellent { color: #059669; font-weight: 600; }
        .eval-bon { color: #d97706; font-weight: 600; }
        .eval-attention { color: #dc2626; font-weight: 600; }
        .eval-alerte { color: #dc2626; font-weight: 600; }
    `;
    return style;
}

/**
 * Construit l'en-tête du PDF
 */
function buildPdfHeader(data) {
    const div = document.createElement('div');
    div.className = 'pdf-header avoid-break';
    div.style.cssText = 'margin-bottom: 20px; border-bottom: 2px solid #059669; padding-bottom: 15px;';
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 24px; font-weight: 900; color: #059669;">
                TRADEPULSE
            </div>
            <div style="text-align: center;">
                <h1 style="margin: 0; color: #1f2937; font-size: 20px;">Analyse de mon budget</h1>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                    Généré le ${data.generatedAt.toLocaleDateString('fr-FR')} à ${data.generatedAt.toLocaleTimeString('fr-FR')}
                </div>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                TradePulse v4.8
            </div>
        </div>
    `;
    
    return div;
}

/**
 * Construit la section hero avec résumé principal
 */
function buildPdfHero(data) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-hero avoid-break';
    wrap.style.marginBottom = '25px';
    
    const tauxEpargne = data.tauxEpargne.toFixed(1);
    
    wrap.innerHTML = `
        <h2 style="color: #059669; margin-bottom: 15px; text-align: center; font-size: 18px;">
            📊 Résumé de votre situation financière
        </h2>
        
        <table class="pdf-table">
            <thead>
                <tr>
                    <th>Revenu mensuel net</th>
                    <th>Dépenses totales</th>
                    <th>Épargne disponible</th>
                    <th>Taux d'épargne</th>
                    <th>Score budget</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="text-align: center; font-weight: 600;">
                        ${formatCurrency(data.revenu)}
                    </td>
                    <td style="text-align: center; font-weight: 600;">
                        ${formatCurrency(data.totalDepenses)}
                    </td>
                    <td style="text-align: center; font-weight: 600; color: #059669;">
                        ${formatCurrency(data.epargneDisponible)}
                    </td>
                    <td style="text-align: center; font-weight: 600; color: #059669;">
                        ${tauxEpargne}%
                    </td>
                    <td style="text-align: center; font-size: 18px; font-weight: bold; color: #059669;">
                        ${data.score}/5
                    </td>
                </tr>
            </tbody>
        </table>
        
        <p style="text-align: center; font-style: italic; margin-top: 12px; color: #374151; font-size: 14px;">
            <strong>${data.scoreDescription}</strong>
        </p>
        
        <div style="text-align: center; margin-top: 15px; padding: 10px; background: rgba(5, 150, 105, 0.1); border-radius: 8px;">
            <p style="margin: 0; color: #059669; font-weight: 600;">
                ${generateSummaryText(data)}
            </p>
        </div>
    `;
    
    return wrap;
}

/**
 * Construit la section graphiques
 */
function buildPdfCharts(data) {
    const box = document.createElement('div');
    box.className = 'avoid-break';
    box.style.marginTop = '25px';
    
    const title = document.createElement('h3');
    title.textContent = '📈 Visualisation du budget';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    box.appendChild(title);
    
    const chartsContainer = document.createElement('div');
    chartsContainer.style.cssText = 'display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap;';
    
    let chartAdded = false;
    
    // Ajouter les graphiques capturés
    if (data.charts && data.charts.length > 0) {
        data.charts.forEach(chart => {
            const container = document.createElement('div');
            container.className = 'chart-container-pdf';
            
            const img = document.createElement('img');
            img.src = chart.dataUrl;
            img.alt = chart.label;
            
            const label = document.createElement('p');
            label.textContent = chart.label;
            label.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 8px; font-weight: 500;';
            
            container.appendChild(img);
            container.appendChild(label);
            chartsContainer.appendChild(container);
            chartAdded = true;
        });
    }
    
    if (!chartAdded) {
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'width: 100%; text-align: center; padding: 40px; color: #6b7280; border: 2px dashed #e5e7eb; border-radius: 8px;';
        placeholder.innerHTML = '<p>📊 Graphiques non disponibles pour cette session</p>';
        chartsContainer.appendChild(placeholder);
    }
    
    box.appendChild(chartsContainer);
    return box;
}

/**
 * Construit le tableau détaillé des dépenses (🆕 MISE À JOUR)
 */
function buildPdfDetailsTable(data) {
    const container = document.createElement('div');
    container.className = 'avoid-break';
    container.style.marginTop = '25px';
    
    const title = document.createElement('h3');
    title.textContent = '📋 Analyse détaillée par poste';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    const table = document.createElement('table');
    table.className = 'pdf-table';
    
    table.innerHTML = `
        <thead>
            <tr>
                <th>Poste de dépense</th>
                <th style="text-align: right;">Montant</th>
                <th style="text-align: right;">% du revenu</th>
                <th style="text-align: center;">Évaluation</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    
    // 🆕 NOUVEAUX POSTES avec structure mise à jour
    const postes = [
        { label: 'Loyer / Crédit immobilier', value: data.depenses.loyer, type: 'loyer' },
        { label: 'Vie courante (alimentation, transport, factures)', value: data.depenses.vieCourante, type: 'vieCourante' },
        { label: 'Loisirs & plaisirs', value: data.depenses.loisirs, type: 'loisirs' },
        { label: 'Dépenses variables (santé, vêtements, autres)', value: data.depenses.variables, type: 'variables' },
        { label: 'Épargne automatique', value: data.depenses.epargne, type: 'epargne' }
    ];
    
    let totalDepenses = 0;
    
    postes.forEach(poste => {
        const ratio = data.ratios[poste.type] || 0;
        const evaluation = data.evaluations[poste.type] || '➖';
        
        if (poste.type !== 'epargne') {
            totalDepenses += poste.value;
        }
        
        const row = document.createElement('tr');
        const bgColor = poste.type === 'epargne' ? 'background-color: #f0fdf4;' : '';
        
        row.innerHTML = `
            <td style="${bgColor}">${poste.label}</td>
            <td style="text-align: right; font-weight: 600; ${bgColor}">${formatCurrency(poste.value)}</td>
            <td style="text-align: right; ${bgColor}">${ratio.toFixed(1)}%</td>
            <td style="text-align: center; ${bgColor}">${evaluation}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Ligne de total
    const totalRow = document.createElement('tr');
    totalRow.style.cssText = 'background-color: #f9fafb; font-weight: bold; border-top: 2px solid #059669;';
    const totalPct = data.revenu > 0 ? ((totalDepenses / data.revenu) * 100).toFixed(1) : '0';
    
    totalRow.innerHTML = `
        <td><strong>TOTAL DÉPENSES</strong></td>
        <td style="text-align: right;"><strong>${formatCurrency(totalDepenses)}</strong></td>
        <td style="text-align: right;"><strong>${totalPct}%</strong></td>
        <td style="text-align: center;"><strong>${totalPct > 90 ? '🚨' : totalPct > 80 ? '⚠️' : '✅'}</strong></td>
    `;
    tbody.appendChild(totalRow);
    
    container.appendChild(table);
    return container;
}

/**
 * Construit la section objectif
 */
function buildPdfObjective(data) {
    if (!data.objectif || !data.objectif.visible) {
        return document.createElement('div');
    }
    
    const container = document.createElement('div');
    container.className = 'objective-pdf avoid-break';
    container.style.marginTop = '20px';
    
    const title = document.createElement('h4');
    title.textContent = '🎯 Votre objectif d\'épargne';
    title.style.cssText = 'color: #1e40af; margin-bottom: 10px; font-size: 14px;';
    container.appendChild(title);
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = data.objectif.content || 'Objectif d\'épargne défini';
    container.appendChild(contentDiv);
    
    return container;
}

/**
 * Construit la section recommandations (🆕 MISE À JOUR)
 */
function buildPdfRecommendations(data) {
    const container = document.createElement('div');
    container.className = 'recommendation-pdf avoid-break';
    container.style.marginTop = '25px';
    
    const title = document.createElement('h3');
    title.textContent = '💡 Conseils personnalisés';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style-type: disc; margin-left: 20px; line-height: 1.6;';
    
    data.recommendations.forEach(conseil => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${conseil.icon}</strong> ${conseil.text}`;
        li.style.marginBottom = '8px';
        ul.appendChild(li);
    });
    
    container.appendChild(ul);
    
    // Lien vers les simulateurs
    const linkSection = document.createElement('div');
    linkSection.style.cssText = 'margin-top: 15px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;';
    linkSection.innerHTML = `
        <p style="margin: 0; font-size: 12px; color: #1e40af;">
            <strong>💡 Pour aller plus loin :</strong> Utilisez nos simulateurs d'investissement (PEA, Assurance-vie, PER) 
            et notre calculateur de prêt immobilier sur TradePulse.
        </p>
    `;
    container.appendChild(linkSection);
    
    return container;
}

/**
 * Construit la section formules (Page 2)
 */
function buildPdfFormulas(data) {
    const container = document.createElement('div');
    container.className = 'formulas-pdf avoid-break';
    
    const title = document.createElement('h3');
    title.textContent = '📐 Méthodes de calcul et références';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    container.innerHTML += `
        <div style="margin-bottom: 20px;">
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Formules utilisées</h4>
            <ul style="list-style-type: disc; margin-left: 20px; line-height: 1.5;">
                <li><strong>Taux d'épargne :</strong> (Revenus - Dépenses totales) ÷ Revenus × 100</li>
                <li><strong>Score budget :</strong> Algorithme TradePulse basé sur les ratios recommandés</li>
                <li><strong>Projection 12 mois :</strong> Épargne mensuelle × 12 (sans intérêts composés)</li>
                <li><strong>Capacité d'investissement :</strong> Épargne - Fonds d'urgence (3-6 mois de charges)</li>
            </ul>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Seuils d'évaluation (normes françaises)</h4>
            <ul style="list-style-type: disc; margin-left: 20px; line-height: 1.5;">
                <li><strong>Loyer/Crédit :</strong> ≤ 25% (optimal), ≤ 33% (recommandé), > 33% (risqué)</li>
                <li><strong>Vie courante :</strong> ≤ 30% (maîtrisé), ≤ 40% (standard), > 40% (élevé)</li>
                <li><strong>Loisirs :</strong> ≤ 10% (équilibré), ≤ 15% (modéré), > 15% (excessif)</li>
                <li><strong>Variables :</strong> ≤ 10% (contrôlé), ≤ 15% (raisonnable), > 15% (à surveiller)</li>
                <li><strong>Épargne :</strong> ≥ 20% (excellent), ≥ 10% (bon), < 10% (à améliorer)</li>
            </ul>
        </div>
        
        <div>
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Paramètres saisis</h4>
            <p style="font-size: 11px; color: #6b7280;">
                Revenu mensuel : ${formatCurrency(data.revenu)}<br>
                Total dépenses : ${formatCurrency(data.totalDepenses)}<br>
                Analyse effectuée le ${data.generatedAt.toLocaleDateString('fr-FR')} à ${data.generatedAt.toLocaleTimeString('fr-FR')}
            </p>
        </div>
    `;
    
    return container;
}

/**
 * Construit le footer du PDF
 */
function buildPdfFooter(data) {
    const footer = document.createElement('div');
    footer.className = 'footer-pdf';
    
    footer.innerHTML = `
        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 20px;">
            <p style="margin-bottom: 8px; font-weight: 600;">
                ⚠️ Avertissement important
            </p>
            <p style="margin-bottom: 12px;">
                Cette analyse est fournie à titre informatif uniquement et ne constitue pas un conseil financier personnalisé.
                Les calculs sont basés sur les données que vous avez saisies et sur des moyennes statistiques.
            </p>
            <p style="margin-bottom: 12px;">
                Pour des décisions financières importantes, consultez un conseiller financier professionnel.
            </p>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px;">
                <p style="margin: 0; font-weight: 600;">
                    © TradePulse ${data.generatedAt.getFullYear()} - Plateforme d'analyse financière
                </p>
                <p style="margin: 5px 0 0 0;">
                    🌐 Retour vers la plateforme : <strong>${window.location.origin}/simulation.html</strong>
                </p>
            </div>
        </div>
    `;
    
    return footer;
}

// ===== FONCTIONS UTILITAIRES =====

/**
 * Charge la bibliothèque html2pdf si nécessaire
 */
async function loadHtml2PdfLib() {
    if (typeof html2pdf === 'undefined') {
        console.log('📦 Chargement de html2pdf...');
        await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        
        // Attendre que la variable globale soit disponible
        let attempts = 0;
        while (typeof html2pdf === 'undefined' && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (typeof html2pdf === 'undefined') {
            throw new Error('Impossible de charger html2pdf');
        }
        console.log('✅ html2pdf chargé');
    }
}

/**
 * Formate un montant en devise
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

/**
 * Récupère la valeur d'un input
 */
function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? parseFloat(element.value) || 0 : 0;
}

/**
 * Récupère le texte d'un élément
 */
function getElementText(id, defaultValue = '') {
    const element = document.getElementById(id);
    return element ? element.textContent.trim() : defaultValue;
}

/**
 * Capture les graphiques disponibles
 */
function captureCharts() {
    const charts = [];
    
    // Graphique budget (doughnut)
    const budgetChart = document.getElementById('budget-chart');
    if (budgetChart) {
        try {
            const dataUrl = budgetChart.toDataURL('image/png', 1.0);
            if (dataUrl && dataUrl !== 'data:,') {
                charts.push({
                    dataUrl,
                    label: 'Répartition des dépenses'
                });
            }
        } catch (e) {
            console.warn('Impossible de capturer le graphique budget:', e);
        }
    }
    
    // Graphique évolution
    const evolutionChart = document.getElementById('evolution-chart');
    if (evolutionChart) {
        try {
            const dataUrl = evolutionChart.toDataURL('image/png', 1.0);
            if (dataUrl && dataUrl !== 'data:,') {
                charts.push({
                    dataUrl,
                    label: 'Projection épargne 12 mois'
                });
            }
        } catch (e) {
            console.warn('Impossible de capturer le graphique évolution:', e);
        }
    }
    
    return charts;
}

/**
 * Extrait les données d'objectif
 */
function extractObjectifData() {
    const objectifElement = document.getElementById('temps-objectif');
    
    if (!objectifElement || objectifElement.classList.contains('hidden')) {
        return { visible: false };
    }
    
    return {
        visible: true,
        content: objectifElement.innerHTML
    };
}

/**
 * Calcule les ratios de dépenses
 */
function calculateExpenseRatios(data) {
    const ratios = {};
    
    if (data.revenu > 0) {
        Object.keys(data.depenses).forEach(key => {
            ratios[key] = (data.depenses[key] / data.revenu) * 100;
        });
    }
    
    return ratios;
}

/**
 * 🆕 MISE À JOUR : Génère les évaluations pour les nouveaux types de postes
 */
function generateEvaluations(data) {
    const evaluations = {};
    
    Object.keys(data.ratios).forEach(type => {
        evaluations[type] = evaluateExpenseUpdated(type, data.ratios[type]);
    });
    
    return evaluations;
}

/**
 * 🆕 NOUVEAU : Évalue une dépense selon son type et ratio (mise à jour)
 */
function evaluateExpenseUpdated(type, ratio) {
    switch(type) {
        case 'loyer':
            if (ratio <= 25) return '<span class="eval-excellent">✅ Optimal</span>';
            if (ratio <= 33) return '<span class="eval-bon">⚠️ Correct</span>';
            return '<span class="eval-alerte">🚨 Trop élevé</span>';
            
        case 'vieCourante':
            // Vie courante = alimentation + transport + factures (env. 25-35% recommandé)
            if (ratio <= 30) return '<span class="eval-excellent">✅ Maîtrisé</span>';
            if (ratio <= 40) return '<span class="eval-bon">⚠️ Standard</span>';
            return '<span class="eval-attention">🚨 Élevé</span>';
            
        case 'loisirs':
            if (ratio <= 10) return '<span class="eval-excellent">✅ Équilibré</span>';
            if (ratio <= 15) return '<span class="eval-bon">⚠️ Modéré</span>';
            return '<span class="eval-alerte">🚨 Excessif</span>';
            
        case 'variables':
            // Dépenses variables (santé, vêtements, autres)
            if (ratio <= 10) return '<span class="eval-excellent">✅ Contrôlé</span>';
            if (ratio <= 15) return '<span class="eval-bon">⚠️ Raisonnable</span>';
            return '<span class="eval-attention">🚨 À surveiller</span>';
            
        case 'epargne':
            if (ratio >= 20) return '<span class="eval-excellent">🏆 Excellent</span>';
            if (ratio >= 10) return '<span class="eval-bon">✅ Bon</span>';
            return '<span class="eval-attention">⚠️ À améliorer</span>';
            
        // Fallback pour anciens types
        case 'alimentation':
            if (ratio <= 12) return '<span class="eval-excellent">✅ Économe</span>';
            if (ratio <= 18) return '<span class="eval-bon">⚠️ Standard</span>';
            return '<span class="eval-attention">🚨 Élevé</span>';
            
        case 'transport':
            if (ratio <= 15) return '<span class="eval-excellent">✅ Raisonnable</span>';
            if (ratio <= 20) return '<span class="eval-attention">⚠️ Modéré</span>';
            return '<span class="eval-alerte">🚨 À revoir</span>';
            
        default:
            return '<span class="eval-bon">📊 Variable</span>';
    }
}

/**
 * Génère le texte de résumé
 */
function generateSummaryText(data) {
    if (data.tauxEpargne >= 20) {
        return "Excellente gestion financière ! Votre capacité d'épargne vous ouvre de nombreuses opportunités d'investissement.";
    } else if (data.tauxEpargne >= 10) {
        return "Situation financière saine. Quelques optimisations pourraient augmenter votre capacité d'épargne.";
    } else if (data.tauxEpargne >= 5) {
        return "Marge de manœuvre limitée. Analysez vos postes de dépenses pour dégager plus d'épargne.";
    } else {
        return "Situation tendue. Il est urgent de revoir votre budget pour éviter les difficultés financières.";
    }
}

/**
 * 🆕 MISE À JOUR : Génère des recommandations pour la nouvelle structure
 */
function generateRecommendations(data) {
    const conseils = [];
    
    // Conseil sur le loyer
    if (data.ratios.loyer > 33) {
        conseils.push({
            icon: '🏠',
            text: 'Votre loyer est trop élevé (>33%). Envisagez un déménagement ou une colocation pour réduire ce poste.'
        });
    }
    
    // Conseil sur la vie courante
    if (data.ratios.vieCourante > 40) {
        conseils.push({
            icon: '🛒',
            text: 'Vos dépenses de vie courante sont élevées. Optimisez vos courses alimentaires et vos déplacements.'
        });
    }
    
    // Conseil sur l'épargne
    if (data.tauxEpargne < 10) {
        conseils.push({
            icon: '💰',
            text: 'Augmentez votre épargne en appliquant la règle 50/30/20 (50% besoins, 30% envies, 20% épargne).'
        });
    } else if (data.tauxEpargne >= 20) {
        conseils.push({
            icon: '📈',
            text: 'Excellent taux d\'épargne ! Pensez à diversifier avec un PEA ou une assurance-vie.'
        });
    }
    
    // Conseils généraux
    conseils.push({
        icon: '📊',
        text: 'Tenez un budget mensuel et suivez vos dépenses pour identifier les postes d\'optimisation.'
    });
    
    if (data.epargneDisponible > 1000) {
        conseils.push({
            icon: '🎯',
            text: 'Constituez d\'abord un fonds d\'urgence (3-6 mois de charges) avant d\'investir.'
        });
    }
    
    // Conseil sur les loisirs
    if (data.ratios.loisirs > 15) {
        conseils.push({
            icon: '🎭',
            text: 'Vos dépenses de loisirs sont élevées. Cherchez des activités moins coûteuses mais tout aussi gratifiantes.'
        });
    }
    
    return conseils;
}

/**
 * Valide les données de budget
 */
function validateBudgetData(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }
    
    // Vérifications minimales
    if (typeof data.revenu !== 'number' || data.revenu < 0) {
        return false;
    }
    
    if (!data.depenses || typeof data.depenses !== 'object') {
        return false;
    }
    
    return true;
}

/**
 * Génère le nom de fichier PDF
 */
function generatePDFFilename(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    return `TradePulse-Budget-${dateStr}-${timeStr}.pdf`;
}

/**
 * 🐛 FIX : Affiche l'état de chargement (exportBtn géré en dehors maintenant)
 */
function showLoadingState(exportBtn) {
    if (!exportBtn) return null;
    
    const originalState = {
        innerHTML: exportBtn.innerHTML,
        disabled: exportBtn.disabled
    };
    
    exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Génération PDF...';
    exportBtn.disabled = true;
    
    return originalState;
}

/**
 * 🐛 FIX : Affiche l'état de succès (exportBtn géré en dehors maintenant)
 */
function showSuccessState(exportBtn, originalState) {
    if (!exportBtn) return;
    
    exportBtn.innerHTML = '<i class="fas fa-check mr-2"></i>PDF téléchargé !';
    
    setTimeout(() => {
        if (originalState) {
            exportBtn.innerHTML = originalState.innerHTML;
            exportBtn.disabled = originalState.disabled;
        }
    }, 2000);
}

/**
 * 🐛 FIX : Affiche l'état d'erreur (exportBtn maintenant accessible)
 */
function showErrorState(exportBtn, errorMessage) {
    if (!exportBtn) {
        console.error('❌ Erreur export PDF (pas de bouton):', errorMessage);
        alert(`Erreur lors de la génération du PDF: ${errorMessage}`);
        return;
    }
    
    console.error('❌ Erreur export PDF:', errorMessage);
    alert(`Erreur lors de la génération du PDF: ${errorMessage}`);
    
    // Restaurer l'état original
    exportBtn.innerHTML = '<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
    exportBtn.disabled = false;
}

// ===== FONCTIONS D'INTÉGRATION =====

/**
 * Active le bouton d'export après analyse
 * À appeler depuis le module principal
 */
export function activateExportButton() {
    const exportBtn = document.getElementById('export-budget-pdf');
    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        exportBtn.classList.add('hover:bg-green-400');
        exportBtn.title = 'Télécharger l\'analyse en PDF';
        console.log('✅ Bouton export PDF activé');
    }
}

/**
 * Crée le bouton d'export s'il n'existe pas
 * À appeler depuis le module principal
 */
export function createExportButton() {
    let exportBtn = document.getElementById('export-budget-pdf');
    
    if (!exportBtn) {
        console.log('📝 Création du bouton export PDF');
        
        // Trouver où insérer le bouton
        const budgetAdvice = document.getElementById('budget-advice');
        const budgetResults = document.querySelector('#budget-planner .mt-8');
        const targetContainer = budgetAdvice || budgetResults;
        
        if (targetContainer) {
            exportBtn = document.createElement('button');
            exportBtn.id = 'export-budget-pdf';
            exportBtn.className = 'w-full mt-4 py-3 px-4 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center opacity-50 cursor-not-allowed';
            exportBtn.innerHTML = '<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
            exportBtn.disabled = true;
            exportBtn.title = 'Analysez d\'abord votre budget';
            
            // Attacher l'événement
            exportBtn.addEventListener('click', () => exportBudgetToPDF());
            
            targetContainer.appendChild(exportBtn);
            console.log('✅ Bouton export créé et attaché');
        } else {
            console.warn('⚠️ Container pour le bouton non trouvé');
        }
    }
    
    return exportBtn;
}