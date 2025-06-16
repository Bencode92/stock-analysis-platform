/**
 * Configuration et interface du tableau comparatif immobilier
 * Version intégrée avec configuration + UI sans export
 */

// ============================================
// TYPES ET INTERFACES (JSDoc pour typage)
// ============================================

/**
 * @typedef {Object} RowConfig
 * @property {string} key - Clé unique de la ligne
 * @property {string} label - Libellé affiché
 * @property {boolean} [isCost=false] - Si c'est un coût (affichage négatif)
 * @property {string} [unit='€'] - Unité d'affichage
 * @property {Function} [calculate] - Fonction de calcul: (data) => number
 * @property {Function} [transform] - Transformation post-calcul: (value) => number
 * @property {boolean} [duplicate=false] - Si la valeur est identique entre modes
 * @property {Object.<string, string>} [altKey] - Clés alternatives par mode
 * @property {boolean} [noCompare=false] - Désactive la comparaison
 * @property {boolean} [isPercentage=false] - Affichage en pourcentage
 * @property {number} [precision=0] - Nombre de décimales
 * @property {string} [helpText] - Texte d'aide au survol
 * @property {boolean} [highlight=false] - Mise en évidence
 */

/**
 * @typedef {Object} SectionConfig
 * @property {string} section - Nom de la section
 * @property {string} icon - Icône FontAwesome
 * @property {RowConfig[]} rows - Lignes de la section
 * @property {RowConfig} [totalRow] - Ligne de total optionnelle
 * @property {boolean} [collapsible=true] - Section repliable
 */

// ============================================
// HELPERS ET UTILITAIRES
// ============================================

const ComparisonHelpers = {
    /**
     * Formatte un nombre avec unité
     */
    formatValue(value, unit = '€', precision = 0) {
        if (value == null || isNaN(value)) return '-';
        
        const formatted = new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision
        }).format(value);
        
        switch (unit) {
            case '€':
                return `${formatted} €`;
            case '€/mois':
                return `${formatted} €/mois`;
            case '€/an':
                return `${formatted} €/an`;
            case '%':
                return `${formatted}%`;
            case 'm²':
                return `${formatted} m²`;
            default:
                return formatted;
        }
    },

    /**
     * Calcule une valeur avec gestion des erreurs
     */
    safeCalculate(fn, data, defaultValue = 0) {
        try {
            const result = fn(data);
            return isNaN(result) || result == null ? defaultValue : result;
        } catch (error) {
            console.warn('Erreur de calcul:', error);
            return defaultValue;
        }
    },

    /**
     * Obtient une valeur avec fallback
     */
    getValue(data, key, altKey = null) {
        if (data[key] != null) return data[key];
        if (altKey && data.mode && altKey[data.mode]) {
            return data[altKey[data.mode]] || 0;
        }
        return 0;
    }
};

// ============================================
// FONCTIONS DE CALCUL RÉUTILISABLES
// ============================================

const Calculations = {
    // Revenus
    loyerNet: (data) => {
        const loyerBrut = data.loyerBrut || 0;
        const vacance = data.vacanceLocative || 0;
        return loyerBrut * (1 - vacance / 100);
    },

    loyerAnnuelBrut: (data) => (data.loyerBrut || 0) * 12,
    
    loyerAnnuelNet: (data) => Calculations.loyerNet(data) * 12,

    // Charges
    totalChargesMensuelles: (data) => {
        const mensualite = data.mensualite || 0;
        const taxeFonciere = (data.taxeFonciere || 0) / 12;
        const charges = data.chargesCopro || 0;
        const entretien = (data.entretien || 0) / 12;
        const assurance = data.assurancePNO || 0;
        
        return mensualite + taxeFonciere + charges + entretien + assurance;
    },

    // Cash-flow
    cashflowMensuel: (data) => {
        const loyerNet = Calculations.loyerNet(data);
        const charges = Calculations.totalChargesMensuelles(data);
        return loyerNet - charges;
    },

    cashflowAnnuel: (data) => Calculations.cashflowMensuel(data) * 12,

    // Rentabilité
    rendementBrut: (data) => {
        const loyerAnnuel = Calculations.loyerAnnuelBrut(data);
        const coutTotal = data.coutTotal || 1;
        return (loyerAnnuel / coutTotal) * 100;
    },

    rendementNet: (data) => {
        const cashflow = Calculations.cashflowAnnuel(data);
        const apport = data.apport || 1;
        return (cashflow / apport) * 100;
    }
};

// ============================================
// CONFIGURATION DU TABLEAU
// ============================================

const COMPARISON_TABLE_CONFIG = [
    {
        section: "COÛTS D'ACQUISITION",
        icon: "fas fa-chart-bar",
        rows: [
            {
                key: 'prixAchat',
                label: "Prix d'achat",
                unit: '€',
                duplicate: false,
                highlight: true
            },
            {
                key: 'fraisNotaire',
                label: 'Frais de notaire / Droits',
                unit: '€',
                isCost: true,
                altKey: {
                    classique: 'fraisNotaire',
                    encheres: 'droitsEnregistrement'
                },
                helpText: 'Frais légaux obligatoires'
            },
            {
                key: 'commission',
                label: 'Commission / Honoraires',
                unit: '€',
                isCost: true,
                altKey: {
                    classique: 'commission',
                    encheres: 'honorairesTotal'
                }
            },
            {
                key: 'travaux',
                label: 'Travaux de rénovation',
                unit: '€',
                isCost: true,
                duplicate: true
            },
            {
                key: 'fraisBancaires',
                label: 'Frais bancaires',
                unit: '€',
                isCost: true,
                duplicate: true
            }
        ],
        totalRow: {
            key: 'coutTotal',
            label: 'Budget total nécessaire',
            unit: '€',
            highlight: true
        }
    },
    
    {
        section: "FINANCEMENT",
        icon: "fas fa-university",
        rows: [
            {
                key: 'apport',
                label: 'Votre apport personnel',
                unit: '€',
                duplicate: true
            },
            {
                key: 'emprunt',
                label: 'Montant emprunté',
                unit: '€',
                duplicate: true
            },
            {
                key: 'mensualite',
                label: 'Remboursement mensuel',
                unit: '€/mois',
                duplicate: true,
                highlight: true
            }
        ]
    },
    
    {
        section: "REVENUS LOCATIFS",
        icon: "fas fa-coins",
        rows: [
            {
                key: 'surface',
                label: 'Surface du bien',
                unit: 'm²',
                noCompare: false
            },
            {
                key: 'loyerBrut',
                label: 'Loyer mensuel (CC)',
                unit: '€/mois',
                duplicate: true
            },
            {
                key: 'vacanceLocative',
                label: 'Provision vacance',
                unit: '€/mois',
                isCost: true,
                duplicate: true,
                calculate: (data) => (data.loyerBrut || 0) * (data.vacanceLocative || 0) / 100,
                precision: 0
            },
            {
                key: 'loyerNet',
                label: 'Loyer net mensuel',
                unit: '€/mois',
                duplicate: true,
                highlight: true,
                calculate: Calculations.loyerNet
            }
        ]
    },
    
    {
        section: "CHARGES MENSUELLES",
        icon: "fas fa-chart-line",
        collapsible: true,
        rows: [
            {
                key: 'mensualite2',
                label: 'Remboursement du prêt',
                unit: '€/mois',
                isCost: true,
                duplicate: true,
                calculate: (data) => data.mensualite
            },
            {
                key: 'taxeFonciereMensuelle',
                label: 'Taxe foncière (par mois)',
                unit: '€/mois',
                isCost: true,
                duplicate: true,
                calculate: (data) => (data.taxeFonciere || 0) / 12,
                precision: 0
            },
            {
                key: 'chargesCopro',
                label: 'Charges de copropriété',
                unit: '€/mois',
                isCost: true,
                duplicate: true
            },
            {
                key: 'entretienMensuel',
                label: 'Budget entretien',
                unit: '€/mois',
                isCost: true,
                duplicate: true,
                calculate: (data) => (data.entretien || 0) / 12
            },
            {
                key: 'assurancePNO',
                label: 'Assurance propriétaire',
                unit: '€/mois',
                isCost: true,
                duplicate: true
            }
        ],
        totalRow: {
            key: 'totalCharges',
            label: 'Total de vos charges',
            unit: '€/mois',
            isCost: true,
            calculate: Calculations.totalChargesMensuelles
        }
    },
    
    {
        section: "RÉSULTATS",
        icon: "fas fa-money-bill-wave",
        rows: [
            {
                key: 'cashflowMensuel',
                label: 'Cash-flow mensuel avant impôts',
                unit: '€/mois',
                highlight: true,
                calculate: Calculations.cashflowMensuel
            },
            {
                key: 'cashflowAnnuel',
                label: 'Cash-flow annuel avant impôts',
                unit: '€/an',
                calculate: Calculations.cashflowAnnuel
            },
            {
                key: 'cashflowNetAnnuel',
                label: 'Cash-flow net après impôts (estimé)',
                unit: '€/an',
                highlight: true,
                calculate: (data) => {
                    // Estimation simplifiée avec TMI
                    const cashflowBrut = Calculations.cashflowAnnuel(data);
                    const impot = cashflowBrut > 0 ? cashflowBrut * (data.tmi || 30) / 100 : 0;
                    return cashflowBrut - impot;
                }
            },
            {
                key: 'rendementBrut',
                label: 'Rendement brut',
                unit: '%',
                isPercentage: true,
                precision: 2,
                calculate: Calculations.rendementBrut
            },
            {
                key: 'rendementNet',
                label: 'Rendement net sur fonds propres',
                unit: '%',
                isPercentage: true,
                precision: 2,
                highlight: true,
                calculate: Calculations.rendementNet
            }
        ]
    }
];

// ============================================
// INTERFACE UTILISATEUR INTÉGRÉE
// ============================================

class ComparisonTableRenderer {
    constructor(config = COMPARISON_TABLE_CONFIG) {
        this.config = config;
        this.collapsedSections = new Set();
    }

    /**
     * Construit une ligne avec ses valeurs calculées
     */
    buildRow(rowConfig, data) {
        let value = null;
        
        if (rowConfig.calculate) {
            value = ComparisonHelpers.safeCalculate(rowConfig.calculate, data);
        } else {
            value = ComparisonHelpers.getValue(data, rowConfig.key, rowConfig.altKey);
        }
        
        if (rowConfig.transform && value != null) {
            value = rowConfig.transform(value);
        }
        
        const formatted = ComparisonHelpers.formatValue(
            value, 
            rowConfig.unit || '€',
            rowConfig.precision || 0
        );
        
        return {
            ...rowConfig,
            rawValue: value,
            formattedValue: formatted,
            cssClass: this.getCssClass(rowConfig, value)
        };
    }

    /**
     * Détermine la classe CSS selon le type et la valeur
     */
    getCssClass(rowConfig, value) {
        const classes = [];
        
        if (rowConfig.highlight) classes.push('highlight');
        if (rowConfig.isCost && value > 0) classes.push('negative');
        if (!rowConfig.isCost && value > 0) classes.push('positive');
        if (value === 0) classes.push('neutral');
        
        return classes.join(' ');
    }

    /**
     * Génère le HTML complet du tableau
     */
    generateHTML(dataClassique, dataEncheres) {
        // Enrichir les données avec le mode
        dataClassique.mode = 'classique';
        dataEncheres.mode = 'encheres';
        
        let html = `
            <div class="comparison-table-wrapper">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th style="width: 40%">Critère</th>
                            <th style="width: 20%" class="text-center">Achat Classique</th>
                            <th style="width: 20%" class="text-center">Vente aux Enchères</th>
                            <th style="width: 20%" class="text-center">Différence</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        this.config.forEach(section => {
            const sectionId = section.section.toLowerCase().replace(/[^a-z0-9]/g, '-');
            
            // En-tête de section
            html += `
                <tr class="category-row section-header" onclick="window.toggleTableSection('${sectionId}')">
                    <td colspan="4">
                        <i class="${section.icon || 'fas fa-folder'}"></i> ${section.section}
                    </td>
                </tr>
            `;
            
            // Lignes de la section
            section.rows.forEach(rowConfig => {
                const rowClassique = this.buildRow(rowConfig, dataClassique);
                const rowEncheres = this.buildRow(rowConfig, dataEncheres);
                const diff = this.calculateDifference(rowConfig, rowClassique, rowEncheres);
                
                html += this.generateRowHTML(rowConfig, rowClassique, rowEncheres, diff, sectionId);
            });
            
            // Ligne de total si présente
            if (section.totalRow) {
                const totalClassique = this.buildRow(section.totalRow, dataClassique);
                const totalEncheres = this.buildRow(section.totalRow, dataEncheres);
                const totalDiff = this.calculateDifference(section.totalRow, totalClassique, totalEncheres);
                
                html += this.generateTotalRowHTML(section.totalRow, totalClassique, totalEncheres, totalDiff, sectionId);
            }
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        // Ajouter les informations complémentaires
        html += this.generateSummaryHTML(dataClassique, dataEncheres);
        
        return html;
    }

    /**
     * Génère le HTML d'une ligne normale
     */
    generateRowHTML(config, classique, encheres, diff, sectionId) {
        return `
            <tr class="section-${sectionId}">
                <td>
                    <span>${config.label}</span>
                    ${config.helpText ? `
                        <span class="tooltip">
                            <i class="fas fa-question-circle help-icon"></i>
                            <span class="tooltiptext">${config.helpText}</span>
                        </span>
                    ` : ''}
                </td>
                <td class="text-right ${classique.cssClass}" id="comp-classique-${config.key}">
                    ${classique.formattedValue}
                </td>
                <td class="text-right ${encheres.cssClass}" id="comp-encheres-${config.key}">
                    ${encheres.formattedValue}
                </td>
                <td class="text-right ${diff.cssClass}" id="comp-${config.key}-diff">
                    ${diff.formatted}
                </td>
            </tr>
        `;
    }

    /**
     * Génère le HTML d'une ligne de total
     */
    generateTotalRowHTML(config, classique, encheres, diff, sectionId) {
        return `
            <tr class="subtotal-row section-${sectionId}">
                <td><strong>${config.label}</strong></td>
                <td class="text-right" id="comp-classique-${config.key}">
                    <strong class="${classique.cssClass}">${classique.formattedValue}</strong>
                </td>
                <td class="text-right" id="comp-encheres-${config.key}">
                    <strong class="${encheres.cssClass}">${encheres.formattedValue}</strong>
                </td>
                <td class="text-right" id="comp-${config.key}-diff">
                    <strong class="${diff.cssClass}">${diff.formatted}</strong>
                </td>
            </tr>
        `;
    }

    /**
     * Calcule la différence entre classique et enchères
     */
    calculateDifference(config, rowClassique, rowEncheres) {
        if (config.noCompare || config.duplicate) {
            return { value: null, formatted: '-', cssClass: 'neutral' };
        }
        
        const valClassique = rowClassique.rawValue || 0;
        const valEncheres = rowEncheres.rawValue || 0;
        const diff = valEncheres - valClassique;
        
        let formatted;
        if (config.isPercentage) {
            formatted = diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
        } else {
            formatted = ComparisonHelpers.formatValue(diff, config.unit || '€', config.precision || 0);
            if (diff > 0 && !config.isCost) formatted = '+' + formatted;
        }
        
        // Inverser la logique pour les coûts
        let cssClass;
        if (config.isCost) {
            cssClass = diff < 0 ? 'positive' : diff > 0 ? 'negative' : 'neutral';
        } else {
            cssClass = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
        }
        
        return { value: diff, formatted, cssClass };
    }

    /**
     * Génère le résumé en bas du tableau
     */
    generateSummaryHTML(dataClassique, dataEncheres) {
        const cashflowClassique = Calculations.cashflowMensuel(dataClassique);
        const cashflowEncheres = Calculations.cashflowMensuel(dataEncheres);
        const meilleur = cashflowEncheres > cashflowClassique ? 'encheres' : 'classique';
        
        return `
            <div class="mt-4">
                <div class="badge badge-primary mr-2">
                    <i class="fas fa-home mr-1"></i> Achat Classique
                </div>
                <span>
                    Points forts: Processus d'achat plus simple, délais plus courts, moins de risques juridiques
                </span>
            </div>
            
            <div class="mt-4">
                <div class="badge badge-accent mr-2">
                    <i class="fas fa-gavel mr-1"></i> Vente aux Enchères
                </div>
                <span>
                    Points forts: Prix d'achat potentiellement plus bas, absence de négociation, potentiel de valorisation supérieur
                </span>
            </div>
            
            ${meilleur === 'encheres' ? `
                <div class="info-message mt-4">
                    <i class="fas fa-trophy text-yellow-400"></i>
                    <span>Les enchères offrent un meilleur cash-flow mensuel de <strong>${ComparisonHelpers.formatValue(Math.abs(cashflowEncheres - cashflowClassique), '€')}</strong></span>
                </div>
            ` : ''}
        `;
    }
}

// ============================================
// FONCTIONS GLOBALES
// ============================================

// Instance globale du renderer
window.comparisonTableRenderer = new ComparisonTableRenderer();

// Fonction pour toggle les sections
window.toggleTableSection = function(sectionId) {
    const rows = document.querySelectorAll(`.section-${sectionId}`);
    rows.forEach(row => {
        row.style.display = row.style.display === 'none' ? '' : 'none';
    });
};

// Fonction principale pour générer le tableau
window.generateComparisonTableHTML = function(results) {
    if (!results || !results.classique || !results.encheres) {
        console.error('Résultats manquants pour générer le tableau');
        return '';
    }
    
    return window.comparisonTableRenderer.generateHTML(
        results.classique,
        results.encheres
    );
};

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        COMPARISON_TABLE_CONFIG,
        ComparisonTableRenderer,
        ComparisonHelpers,
        Calculations
    };
}