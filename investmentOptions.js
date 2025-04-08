/**
 * Module de gestion des options d'investissement
 * Fournit les données et fonctions pour le simulateur d'investissement
 */

const investmentOptions = {
    // Données des véhicules d'investissement
    vehicles: {
        "pea": {
            name: "PEA",
            icon: "fas fa-chart-pie",
            description: "Plan d'Épargne en Actions permettant d'investir dans des actions européennes avec une fiscalité avantageuse après 5 ans.",
            ceiling: 150000,
            minDuration: 5,
            recommendedDuration: 8,
            liquidityRating: 3, // 1-5
            riskRating: 3, // 1-5
            taxExemptionDuration: 5,
            taxRates: {
                default: 0.30, // PFU
                afterExemption: 0.172 // Prélèvements sociaux uniquement
            },
            taxDetails: "Le Plan d'Épargne en Actions (PEA) offre une exonération d'impôt sur les plus-values après 5 ans de détention (hors prélèvements sociaux de 17,2%).",
            ceilingDescription: "Plafond: 150 000€ par personne",
            eligibleAssets: ["Actions européennes", "OPCVM éligibles", "ETF"],
            advantages: [
                "Fiscalité avantageuse après 5 ans",
                "Diversification des investissements",
                "Possibilité de retrait partiel après 5 ans sans clôture"
            ],
            disadvantages: [
                "Limité aux actions européennes",
                "Plafond de versement",
                "Restrictions de retrait pendant 5 ans"
            ],
            averageYield: {
                min: 5,
                max: 8,
                average: 7
            }
        },
        "cto": {
            name: "Compte-Titres",
            icon: "fas fa-balance-scale",
            description: "Compte d'investissement standard offrant plus de flexibilité sur les titres disponibles, mais avec une fiscalité moins avantageuse.",
            ceiling: null, // Pas de plafond
            minDuration: 0,
            recommendedDuration: 5,
            liquidityRating: 4,
            riskRating: 3,
            taxExemptionDuration: null, // Pas d'exonération
            taxRates: {
                default: 0.30 // PFU
            },
            taxDetails: "Les plus-values sont soumises au Prélèvement Forfaitaire Unique (PFU) de 30% (12,8% d'impôt + 17,2% de prélèvements sociaux) ou au barème progressif de l'impôt sur le revenu.",
            ceilingDescription: "Plafond: Aucun",
            eligibleAssets: ["Actions", "Obligations", "OPCVM", "ETF", "Produits dérivés"],
            advantages: [
                "Aucun plafond",
                "Grande flexibilité d'investissement",
                "Liquidité totale"
            ],
            disadvantages: [
                "Fiscalité moins avantageuse",
                "Pas de cadre fiscal privilégié"
            ],
            averageYield: {
                min: 5,
                max: 8,
                average: 6
            }
        },
        "assurance-vie": {
            name: "Assurance-Vie",
            icon: "fas fa-shield-alt",
            description: "Contrat d'épargne polyvalent offrant des avantages fiscaux qui s'améliorent avec la durée de détention et des options de transmission avantageuses.",
            ceiling: null,
            minDuration: 0,
            recommendedDuration: 8,
            liquidityRating: 3,
            riskRating: 2,
            taxExemptionDuration: 8,
            taxRates: {
                default: 0.30, // Moins de 4 ans
                intermediate: 0.275, // Entre 4 et 8 ans
                afterExemption: 0.247 // Plus de 8 ans
            },
            taxDetails: "Taxation avantageuse après 8 ans de détention: seulement 24,7% (7,5% + 17,2% de prélèvements sociaux) sur les gains, avec un abattement annuel de 4 600€ (célibataire) ou 9 200€ (couple).",
            ceilingDescription: "Plafond: Aucun",
            eligibleAssets: ["Fonds euros", "OPCVM", "ETF", "SCPI", "Actions"],
            advantages: [
                "Fiscalité avantageuse après 8 ans",
                "Pas de plafond de versement",
                "Transmission facilitée en cas de décès",
                "Diversification possible (fonds euros, UC, etc.)"
            ],
            disadvantages: [
                "Frais généralement plus élevés",
                "Performance limitée pour les fonds euros",
                "Fiscalité moins avantageuse avant 8 ans"
            ],
            averageYield: {
                min: 1.5,
                max: 6,
                average: 3
            }
        },
        "per": {
            name: "PER",
            icon: "fas fa-chart-line",
            description: "Plan d'Épargne Retraite permettant de se constituer une épargne pour la retraite avec des avantages fiscaux à l'entrée.",
            ceiling: "10% des revenus nets",
            minDuration: "Jusqu'à la retraite",
            recommendedDuration: 15,
            liquidityRating: 1,
            riskRating: 2,
            taxExemptionDuration: null,
            taxRates: {
                default: 0.30 // Sortie en capital
            },
            taxDetails: "Déduction fiscale jusqu'à 10 % des revenus nets imposables. Sortie possible à la retraite ou pour achat résidence principale.",
            ceilingDescription: "Sortie : Imposée selon barème ou PFU (30 %), selon les options et types de versements.",
            eligibleAssets: ["Fonds euros", "OPCVM", "ETF", "SCPI"],
            advantages: [
                "Déduction des versements du revenu imposable",
                "Gestion pilotée par horizon",
                "Déblocages anticipés possibles dans certains cas"
            ],
            disadvantages: [
                "Faible liquidité avant la retraite",
                "Fiscalité à la sortie",
                "Frais parfois élevés"
            ],
            averageYield: {
                min: 2,
                max: 7,
                average: 4
            }
        },
        "scpi": {
            name: "SCPI",
            icon: "fas fa-building",
            description: "Société Civile de Placement Immobilier permettant d'investir indirectement dans l'immobilier locatif avec un ticket d'entrée réduit.",
            ceiling: null,
            minDuration: 8,
            recommendedDuration: 10,
            liquidityRating: 2,
            riskRating: 2,
            taxExemptionDuration: null,
            taxRates: {
                default: 0.30 // IR + PS
            },
            taxDetails: "Revenus soumis à l'IR + prélèvements sociaux (17,2%). Possibilité d'intégrer dans une Assurance-vie pour bénéficier du taux réduit de 7,5% après 8 ans.",
            ceilingDescription: "Rendement : Entre 4 % et 6 % brut en moyenne.",
            eligibleAssets: ["Immobilier locatif"],
            advantages: [
                "Mutualisation du risque immobilier",
                "Gestion déléguée",
                "Rendement régulier"
            ],
            disadvantages: [
                "Frais d'acquisition élevés",
                "Liquidité limitée",
                "Fiscalité des revenus fonciers"
            ],
            averageYield: {
                min: 4,
                max: 6,
                average: 5
            }
        },
        "fcpi": {
            name: "FCPI / FIP",
            icon: "fas fa-rocket",
            description: "Fonds d'investissement dans des entreprises innovantes (FCPI) ou régionales (FIP) avec avantage fiscal à l'entrée.",
            ceiling: 12000,
            minDuration: 5,
            recommendedDuration: 8,
            liquidityRating: 1,
            riskRating: 5,
            taxExemptionDuration: 5,
            taxRates: {
                default: 0.30,
                afterExemption: 0.172
            },
            taxDetails: "Réduction d'impôt de 18 % du montant investi (jusqu'à 2 160 € / an pour un célibataire). Blocage de 5 à 10 ans.",
            ceilingDescription: "Plus-values : Exonérées d'IR après 5 ans (soumis aux PS).",
            eligibleAssets: ["Actions de PME innovantes ou régionales"],
            advantages: [
                "Réduction d'impôt sur le revenu",
                "Soutien à l'économie réelle",
                "Diversification patrimoniale"
            ],
            disadvantages: [
                "Risque élevé",
                "Blocage des fonds pendant 5 à 10 ans",
                "Performance historique souvent décevante"
            ],
            averageYield: {
                min: -2,
                max: 10,
                average: 3
            }
        },
        "livret-jeune": {
            name: "Livret Jeune",
            icon: "fas fa-piggy-bank",
            description: "Livret d'épargne réglementé réservé aux jeunes de 12 à 25 ans, exonéré d'impôts et de prélèvements sociaux.",
            ceiling: 1600,
            minDuration: 0,
            recommendedDuration: "Jusqu'à 25 ans",
            liquidityRating: 5,
            riskRating: 1,
            taxExemptionDuration: 0,
            taxRates: {
                default: 0.0
            },
            taxDetails: "Exonération totale d'impôt et de prélèvements sociaux. Taux ≥ Livret A.",
            ceilingDescription: "Plafond : 1 600 €.",
            eligibleAssets: ["Épargne liquide"],
            advantages: [
                "Sécurité totale",
                "Exonération fiscale complète",
                "Disponibilité immédiate"
            ],
            disadvantages: [
                "Plafond très bas",
                "Réservé aux 12-25 ans",
                "Rendement limité"
            ],
            averageYield: {
                min: 2,
                max: 3,
                average: 2.5
            }
        },
        "ldds": {
            name: "LDDS",
            icon: "fas fa-leaf",
            description: "Livret de Développement Durable et Solidaire, épargne réglementée finançant l'économie durable et solidaire.",
            ceiling: 12000,
            minDuration: 0,
            recommendedDuration: 1,
            liquidityRating: 5,
            riskRating: 1,
            taxExemptionDuration: 0,
            taxRates: {
                default: 0.0
            },
            taxDetails: "Épargne réglementée exonérée d'impôt et de PS. Taux net garanti par l'État.",
            ceilingDescription: "Plafond : 12 000 €.",
            eligibleAssets: ["Épargne liquide"],
            advantages: [
                "Sécurité totale",
                "Exonération fiscale complète",
                "Disponibilité immédiate"
            ],
            disadvantages: [
                "Plafond limité",
                "Rendement faible"
            ],
            averageYield: {
                min: 2,
                max: 3,
                average: 2.5
            }
        },
        "lep": {
            name: "LEP",
            icon: "fas fa-hand-holding-usd",
            description: "Livret d'Épargne Populaire, réservé aux revenus modestes avec un taux d'intérêt plus élevé que le Livret A.",
            ceiling: 10000,
            minDuration: 0,
            recommendedDuration: 1,
            liquidityRating: 5,
            riskRating: 1,
            taxExemptionDuration: 0,
            taxRates: {
                default: 0.0
            },
            taxDetails: "Exonération totale. Taux élevé (~5 %). Réservé aux revenus modestes.",
            ceilingDescription: "Plafond : 10 000 €.",
            eligibleAssets: ["Épargne liquide"],
            advantages: [
                "Sécurité totale",
                "Exonération fiscale complète",
                "Meilleur taux des livrets réglementés"
            ],
            disadvantages: [
                "Plafond limité",
                "Conditions de ressources",
                "Vérification annuelle de l'éligibilité"
            ],
            averageYield: {
                min: 4,
                max: 6,
                average: 5
            }
        },
        "crypto": {
            name: "Crypto-monnaies",
            icon: "fab fa-bitcoin",
            description: "Classe d'actifs numériques à forte volatilité offrant un potentiel de rendement élevé mais également des risques importants.",
            ceiling: null,
            minDuration: 1,
            recommendedDuration: 5,
            liquidityRating: 4,
            riskRating: 5,
            taxExemptionDuration: null,
            taxRates: {
                default: 0.30
            },
            taxDetails: "Les plus-values sur crypto-actifs sont soumises au Prélèvement Forfaitaire Unique (PFU) de 30% (12,8% d'impôt + 17,2% de prélèvements sociaux).",
            ceilingDescription: "Plafond: Aucun",
            eligibleAssets: ["Bitcoin", "Ethereum", "Autres crypto-actifs"],
            advantages: [
                "Potentiel de rendement très élevé",
                "Diversification hors système financier traditionnel",
                "Liquidité internationale"
            ],
            disadvantages: [
                "Volatilité extrême",
                "Risque de perte totale",
                "Réglementation évolutive"
            ],
            averageYield: {
                min: -30,
                max: 100,
                average: 20
            }
        }
    },

    /**
     * Récupère les informations sur un véhicule d'investissement
     * @param {string} vehicleType - Le type de véhicule d'investissement
     * @return {Object} Les informations sur le véhicule
     */
    getVehicleInfo: function(vehicleType) {
        return this.vehicles[vehicleType] || null;
    },

    /**
     * Calcule le taux d'imposition en fonction du véhicule et de la durée
     * @param {string} vehicle - Le type de véhicule d'investissement
     * @param {number} years - La durée en années
     * @return {number} Le taux d'imposition applicable
     */
    calculateTaxRate: function(vehicle, years) {
        const vehicleInfo = this.getVehicleInfo(vehicle);
        if (!vehicleInfo) return 0.30; // Taux par défaut

        if (vehicleInfo.taxRates.afterExemption && years >= vehicleInfo.taxExemptionDuration) {
            return vehicleInfo.taxRates.afterExemption;
        } else if (vehicleInfo.taxRates.intermediate && vehicleInfo.name === "Assurance-Vie" && years >= 4) {
            return vehicleInfo.taxRates.intermediate;
        } else {
            return vehicleInfo.taxRates.default;
        }
    },

    /**
     * Génère un texte d'information fiscale pour un véhicule
     * @param {string} vehicle - Le type de véhicule d'investissement
     * @return {string} HTML avec les informations fiscales
     */
    getTaxInfo: function(vehicle) {
        const vehicleInfo = this.getVehicleInfo(vehicle);
        if (!vehicleInfo) return '';

        return `
            <h4><i class="${vehicleInfo.icon}"></i> Fiscalité du ${vehicleInfo.name}</h4>
            <p>${vehicleInfo.taxDetails}</p>
            <p><strong>${vehicleInfo.ceilingDescription.split(':')[0]}:</strong> ${vehicleInfo.ceilingDescription.split(':')[1]}</p>
        `;
    },

    /**
     * Évalue l'adéquation d'un véhicule avec les paramètres utilisateur
     * @param {string} vehicle - Le type de véhicule
     * @param {number} amount - Le montant à investir
     * @param {number} years - La durée d'investissement
     * @param {string} investmentType - Le type d'investissement (one-time/monthly)
     * @return {Object} Score et commentaires d'adéquation
     */
    evaluateSuitability: function(vehicle, amount, years, investmentType) {
        const vehicleInfo = this.getVehicleInfo(vehicle);
        if (!vehicleInfo) return { score: 0, comments: [] };
        
        let score = 5; // Score sur 5
        let comments = [];
        
        // Vérification du plafond
        if (vehicleInfo.ceiling !== null) {
            if (investmentType === 'one-time' && amount > vehicleInfo.ceiling) {
                score -= 2;
                comments.push(`Le montant dépasse le plafond de ${vehicleInfo.ceiling}€.`);
            } else if (investmentType === 'monthly') {
                // Calculer le montant total sur la période
                const totalAmount = amount * 12 * years;
                if (totalAmount > vehicleInfo.ceiling) {
                    score -= 1;
                    comments.push(`Le montant cumulé dépassera le plafond après quelques années.`);
                }
            }
        }
        
        // Vérification de la durée minimale
        if (typeof vehicleInfo.minDuration === 'number' && years < vehicleInfo.minDuration) {
            score -= 2;
            comments.push(`La durée est inférieure à la durée minimale recommandée de ${vehicleInfo.minDuration} ans.`);
        }
        
        // Vérification de la liquidité
        if (investmentType === 'monthly' && vehicleInfo.liquidityRating < 3) {
            score -= 1;
            comments.push(`Ce véhicule a une liquidité limitée pour des versements réguliers.`);
        }
        
        // Suggestions d'optimisation
        if (vehicle === 'pea' && years < 5) {
            comments.push(`Attendez au moins 5 ans pour bénéficier des avantages fiscaux du PEA.`);
        } else if (vehicle === 'assurance-vie' && years < 8) {
            comments.push(`Attendez au moins 8 ans pour bénéficier pleinement des avantages fiscaux de l'assurance-vie.`);
        } else if (vehicle === 'per' && years < 10) {
            comments.push(`Le PER est plutôt conçu pour une épargne de long terme jusqu'à la retraite.`);
        } else if (vehicle === 'crypto' && amount > 5000 && investmentType === 'one-time') {
            comments.push(`Prudence : les cryptomonnaies sont très volatiles, envisagez de diversifier.`);
        }
        
        // Ajuster le score final
        score = Math.max(1, Math.min(5, score));
        
        return {
            score,
            comments
        };
    },

    /**
     * Génère des cartes visuelles pour les types d'investissement
     * @return {string} HTML contenant les cartes des types d'investissement
     */
    generateInvestmentTypeCards: function() {
        let html = '';
        
        // Sélectionner quelques véhicules clés à afficher
        const keysToShow = ['pea', 'cto', 'assurance-vie', 'per', 'scpi', 'crypto'];
        
        for (const key of keysToShow) {
            const vehicle = this.vehicles[key];
            if (!vehicle) continue;
            
            // Déterminer la classe de risque
            let riskClass = 'medium';
            if (vehicle.riskRating <= 2) {
                riskClass = 'low';
            } else if (vehicle.riskRating >= 4) {
                riskClass = 'high';
            }
            
            // Générer les points de risque
            let riskDotsHtml = '';
            for (let i = 1; i <= 5; i++) {
                const riskDotClass = i <= vehicle.riskRating 
                    ? `active ${i > 3 ? 'high' : (i > 1 ? 'medium' : 'low')}` 
                    : '';
                riskDotsHtml += `<div class="risk-dot ${riskDotClass}"></div>`;
            }
            
            // Déterminer le rendement avec visuel
            const rendementClass = vehicle.averageYield.average > 8 ? 'high' : 
                (vehicle.averageYield.average > 4 ? 'medium' : 'low');
            
            html += `
            <div class="investment-type-card">
                <span class="risk-badge ${riskClass}">Risque: ${vehicle.riskRating}/5</span>
                <div class="investment-type-header">
                    <i class="${vehicle.icon}"></i>
                    <h4 class="investment-type-title">${vehicle.name}</h4>
                </div>
                <p>${vehicle.description}</p>
                
                <div class="vehicle-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Liquidité:</span>
                        <div class="metric-value">
                            <div class="risk-dots">
                                ${Array(5).fill().map((_, i) => 
                                    `<div class="risk-dot ${i < vehicle.liquidityRating ? 'active low' : ''}"></div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="metric-item">
                        <span class="metric-label">Rendement moyen:</span>
                        <div class="metric-value">
                            <span class="rendement-value ${rendementClass}">${vehicle.averageYield.average}%</span>
                            <span class="rendement-range">(${vehicle.averageYield.min}%-${vehicle.averageYield.max}%)</span>
                        </div>
                    </div>
                    
                    <div class="metric-item">
                        <span class="metric-label">Durée recommandée:</span>
                        <div class="metric-value">
                            <span class="duration-badge">${typeof vehicle.recommendedDuration === 'number' ? 
                                vehicle.recommendedDuration + ' ans' : vehicle.recommendedDuration}</span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }
        
        return html;
    },

    /**
     * Génère un tableau comparatif des véhicules d'investissement
     * @return {string} HTML du tableau comparatif
     */
    generateComparisonTable: function() {
        let html = `
        <div class="comparison-filters">
            <button class="filter-button active" data-filter="all">Tous</button>
            <button class="filter-button" data-filter="safe">Sécurisés</button>
            <button class="filter-button" data-filter="growth">Croissance</button>
            <button class="filter-button" data-filter="tax">Optimisation fiscale</button>
        </div>
        
        <div class="comparison-help">
            <h4><i class="fas fa-lightbulb"></i> Comment utiliser ce tableau</h4>
            <p>Ce tableau vous permet de comparer facilement les caractéristiques des différents véhicules d'investissement. Utilisez les filtres ci-dessus pour affiner votre sélection selon vos besoins.</p>
            <ul>
                <li>Le <strong>risque</strong> indique la volatilité potentielle de l'investissement.</li>
                <li>La <strong>liquidité</strong> représente la facilité à récupérer son capital sans pénalité.</li>
                <li>Le <strong>rendement moyen</strong> est une estimation basée sur les performances historiques.</li>
            </ul>
        </div>
        
        <div class="comparison-table-container">
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Véhicule</th>
                        <th>Plafond</th>
                        <th>Durée recommandée</th>
                        <th>Risque</th>
                        <th>Liquidité</th>
                        <th>Fiscalité</th>
                        <th>Rendement moyen</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        for (const [key, vehicle] of Object.entries(this.vehicles)) {
            // Représentation visuelle du risque
            let riskHtml = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= vehicle.riskRating) {
                    riskHtml += `<span class="risk-dot active ${i > 3 ? 'high' : (i > 1 ? 'medium' : 'low')}"></span>`;
                } else {
                    riskHtml += `<span class="risk-dot"></span>`;
                }
            }
            
            // Représentation visuelle de la liquidité
            let liquidityHtml = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= vehicle.liquidityRating) {
                    liquidityHtml += `<span class="risk-dot active low"></span>`;
                } else {
                    liquidityHtml += `<span class="risk-dot"></span>`;
                }
            }

            // Ajout de badges visuels pour la fiscalité
            let taxHtml = '';
            if (vehicle.taxRates.default === 0) {
                taxHtml = `<span class="zero-tax-badge">Exonérée</span>`;
            } else if (vehicle.taxExemptionDuration) {
                taxHtml = `<span class="duration-badge">Avantageuse après ${vehicle.taxExemptionDuration} ans</span>`;
            } else {
                taxHtml = `<span class="ceiling-badge">Standard (${vehicle.taxRates.default * 100}%)</span>`;
            }
            
            html += `
                <tr data-vehicle="${key}">
                    <td>
                        <div class="vehicle-name">
                            <i class="${vehicle.icon}"></i>
                            ${vehicle.name}
                        </div>
                    </td>
                    <td>${vehicle.ceiling ? vehicle.ceiling + (typeof vehicle.ceiling === 'number' ? '€' : '') : 'Aucun'}</td>
                    <td>${typeof vehicle.recommendedDuration === 'number' ? vehicle.recommendedDuration + ' ans' : vehicle.recommendedDuration}</td>
                    <td>
                        <div class="risk-dots">
                            ${riskHtml}
                        </div>
                    </td>
                    <td>
                        <div class="risk-dots">
                            ${liquidityHtml}
                        </div>
                    </td>
                    <td>${taxHtml}</td>
                    <td>
                        <span class="rendement-value ${vehicle.averageYield.average > 8 ? 'high' : (vehicle.averageYield.average > 4 ? 'medium' : 'low')}">
                            ${vehicle.averageYield.average}%
                        </span>
                        <span class="rendement-range">(${vehicle.averageYield.min}%-${vehicle.averageYield.max}%)</span>
                    </td>
                </tr>
            `;
        }
        
        html += `
                </tbody>
            </table>
        </div>
        
        <script>
            // Script pour filtrer le tableau
            document.querySelectorAll('.filter-button').forEach(button => {
                button.addEventListener('click', function() {
                    // Retirer la classe active de tous les boutons
                    document.querySelectorAll('.filter-button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    
                    // Ajouter la classe active au bouton cliqué
                    this.classList.add('active');
                    
                    // Filtrer le tableau
                    const filter = this.getAttribute('data-filter');
                    filterComparisonTable(filter);
                });
            });
            
            function filterComparisonTable(filter) {
                const rows = document.querySelectorAll('.comparison-table tbody tr');
                
                rows.forEach(row => {
                    const vehicle = row.getAttribute('data-vehicle');
                    const risk = row.querySelectorAll('.risk-dot.active').length;
                    
                    switch(filter) {
                        case 'safe':
                            row.style.display = risk <= 2 ? '' : 'none';
                            break;
                        case 'growth':
                            row.style.display = risk >= 3 ? '' : 'none';
                            break;
                        case 'tax':
                            const taxCell = row.querySelectorAll('td')[5].textContent;
                            row.style.display = taxCell.includes('Avantageuse') || taxCell.includes('Exonérée') ? '' : 'none';
                            break;
                        default:
                            row.style.display = '';
                            break;
                    }
                });
            }
        </script>
        `;
        
        return html;
    },

    /**
     * Génère des conseils personnalisés en fonction du profil
     * @param {Object} userProfile - Profil utilisateur
     * @return {Array} Liste de conseils personnalisés
     */
    getPersonalizedAdvice: function(userProfile) {
        // userProfile = { amount, duration, monthlySavings, riskTolerance, age, investmentGoals }
        const advice = [];
        
        // Logique de conseil basée sur l'âge
        if (userProfile.age < 30) {
            advice.push("À votre âge, vous pouvez privilégier les actifs plus risqués comme les actions via un PEA ou un CTO.");
            if (userProfile.monthlySavings > 0) {
                advice.push("Commencez à constituer une épargne retraite avec un PER pour profiter au maximum de la fiscalité avantageuse.");
            }
        } else if (userProfile.age < 50) {
            advice.push("Équilibrez votre portefeuille entre actifs dynamiques (actions) et plus sécurisés (fonds euros d'assurance-vie).");
            if (userProfile.investmentGoals.includes('retraite')) {
                advice.push("Intensifiez vos versements sur le PER pour préparer votre retraite avec un avantage fiscal immédiat.");
            }
        } else {
            advice.push("Sécurisez progressivement votre capital en augmentant la part des actifs moins risqués.");
            if (userProfile.investmentGoals.includes('transmission')) {
                advice.push("L'assurance-vie est particulièrement adaptée pour la transmission de patrimoine avec des avantages successoraux.");
            }
        }
        
        // Conseils en fonction du montant
        if (userProfile.amount < 10000) {
            advice.push("Avec ce montant, assurez-vous d'abord d'avoir une épargne de précaution sur des livrets réglementés avant d'investir à risque.");
        } else if (userProfile.amount > 50000) {
            advice.push("Avec ce capital, envisagez une diversification incluant des SCPI pour l'immobilier et potentiellement des produits structurés.");
        }
        
        // Conseils en fonction de la durée
        if (userProfile.duration < 3) {
            advice.push("Sur une période si courte, privilégiez la sécurité et la liquidité (livrets, fonds euros).");
        } else if (userProfile.duration > 10) {
            advice.push("Sur le long terme, les frais cumulés ont un impact majeur. Privilégiez les supports à frais réduits comme les ETF.");
        }
        
        return advice;
    },

    /**
     * Génère du contenu éducatif sur l'investissement
     * @return {string} HTML contenant le contenu éducatif
     */
    generateEducationalContent: function() {
        return `
        <div class="education-content theme-card">
            <div class="section-badge">
                <i class="fas fa-book"></i>
                <span>Guide d'investissement</span>
            </div>
            <h3>Principes fondamentaux d'investissement</h3>
            
            <div class="education-grid">
                <div class="education-card">
                    <div class="education-card-header">
                        <i class="fas fa-chart-line"></i>
                        <h4>Intérêts composés</h4>
                    </div>
                    <p>Les intérêts composés sont souvent appelés la "8ème merveille du monde". Il s'agit des intérêts générés non seulement sur votre capital initial, mais aussi sur les intérêts déjà accumulés.</p>
                    <div class="card-footer">
                        <span class="tip-tag">Conseil clé</span>
                        <p>Plus vous commencez tôt, plus l'effet des intérêts composés sera puissant sur le long terme.</p>
                    </div>
                </div>
                
                <div class="education-card">
                    <div class="education-card-header">
                        <i class="fas fa-balance-scale"></i>
                        <h4>Diversification</h4>
                    </div>
                    <p>La diversification consiste à répartir votre investissement entre différentes classes d'actifs pour réduire le risque global du portefeuille.</p>
                    <div class="card-footer">
                        <span class="tip-tag">Conseil clé</span>
                        <p>Ne mettez pas tous vos œufs dans le même panier. Diversifiez entre actions, obligations, immobilier et liquidités.</p>
                    </div>
                </div>
                
                <div class="education-card">
                    <div class="education-card-header">
                        <i class="fas fa-clock"></i>
                        <h4>Horizon d'investissement</h4>
                    </div>
                    <p>Votre horizon temporel détermine le niveau de risque que vous pouvez prendre. Plus votre horizon est long, plus vous pouvez vous permettre de prendre des risques.</p>
                    <div class="card-footer">
                        <span class="tip-tag">Conseil clé</span>
                        <p>Pour des objectifs à court terme (moins de 5 ans), privilégiez les placements sécurisés. Pour le long terme, les actions offrent généralement un meilleur rendement.</p>
                    </div>
                </div>
                
                <div class="education-card">
                    <div class="education-card-header">
                        <i class="fas fa-euro-sign"></i>
                        <h4>Investissement régulier</h4>
                    </div>
                    <p>L'investissement régulier ou "dollar cost averaging" consiste à investir un montant fixe à intervalles réguliers, indépendamment des fluctuations du marché.</p>
                    <div class="card-footer">
                        <span class="tip-tag">Conseil clé</span>
                        <p>Cette approche réduit l'impact de la volatilité et élimine le stress lié au "timing" du marché.</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
};

// Export du module pour utilisation dans d'autres fichiers
export default investmentOptions;