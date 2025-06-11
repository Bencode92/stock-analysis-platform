/**
 * market-fiscal-analysis.js
 * Module d'intégration pour l'analyse de marché et la comparaison fiscale
 * Complète la page comparaison-fiscale.html
 */

class MarketFiscalAnalyzer {
    constructor() {
        this.simulateur = new SimulateurImmo();
        this.comparateur = new FiscalComparator(this.simulateur);
        this.propertyData = null;
        this.marketAnalysis = null;
    }

    /**
     * Effectue l'analyse complète (marché + fiscal)
     */
    async performCompleteAnalysis(data) {
        // 1. Analyse de marché
        this.marketAnalysis = this.analyzeMarketPosition(data);
        
        // 2. Préparation des données pour la comparaison fiscale
        const fiscalData = this.prepareFiscalData(data);
        
        // 3. Comparaison des régimes fiscaux
        const fiscalResults = await this.comparateur.compareAllRegimes(fiscalData);
        
        return {
            market: this.marketAnalysis,
            fiscal: fiscalResults,
            recommendations: this.generateGlobalRecommendations(this.marketAnalysis, fiscalResults)
        };
    }

    /**
     * Analyse la position sur le marché
     */
    analyzeMarketPosition(data) {
        const result = {
            hasMarketData: !!data.ville,
            priceAnalysis: {},
            rentAnalysis: {},
            globalScore: 0
        };

        if (data.ville) {
            const marketPriceM2 = data.ville.prix_m2;
            const marketRentM2 = data.ville.loyer_m2;
            
            // Analyse du prix
            const priceDiff = ((data.prixM2Paye - marketPriceM2) / marketPriceM2) * 100;
            result.priceAnalysis = {
                userPrice: data.prixM2Paye,
                marketPrice: marketPriceM2,
                difference: priceDiff,
                position: this.getPricePosition(priceDiff),
                savings: (marketPriceM2 - data.prixM2Paye) * data.surface
            };
            
            // Analyse du loyer
            const rentDiff = ((data.loyerM2Actuel - marketRentM2) / marketRentM2) * 100;
            result.rentAnalysis = {
                userRent: data.loyerM2Actuel,
                marketRent: marketRentM2,
                difference: rentDiff,
                position: this.getRentPosition(rentDiff),
                potential: (marketRentM2 - data.loyerM2Actuel) * data.surface
            };
            
            // Score global (0-100)
            const priceScore = Math.max(0, 50 - Math.abs(priceDiff));
            const rentScore = Math.max(0, 50 + (rentDiff / 2));
            result.globalScore = (priceScore + rentScore) / 2;
        }
        
        return result;
    }

    /**
     * Détermine la position du prix
     */
    getPricePosition(diff) {
        if (diff < -15) return 'excellent';
        if (diff < -5) return 'good';
        if (diff < 5) return 'average';
        if (diff < 15) return 'high';
        return 'overpriced';
    }

    /**
     * Détermine la position du loyer
     */
    getRentPosition(diff) {
        if (diff > 15) return 'excellent';
        if (diff > 5) return 'good';
        if (diff > -5) return 'average';
        if (diff > -15) return 'low';
        return 'underpriced';
    }

    /**
     * Prépare les données pour la comparaison fiscale
     */
    prepareFiscalData(data) {
        return {
            typeAchat: 'classique',
            prixBien: data.prixPaye,
            surface: data.surface,
            apport: data.apport,
            duree: data.duree,
            taux: data.taux,
            loyerMensuel: data.loyerActuel - data.charges,
            tmi: data.tmi,
            chargesCopro: data.charges
        };
    }

    /**
     * Génère des recommandations globales
     */
    generateGlobalRecommendations(marketAnalysis, fiscalResults) {
        const recommendations = [];
        
        // Recommandations basées sur l'analyse de marché
        if (marketAnalysis.hasMarketData) {
            if (marketAnalysis.priceAnalysis.position === 'excellent') {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-trophy',
                    title: 'Excellent prix d\'achat',
                    description: `Vous avez acheté ${Math.abs(marketAnalysis.priceAnalysis.difference).toFixed(0)}% en dessous du marché, soit une économie de ${this.formatNumber(Math.abs(marketAnalysis.priceAnalysis.savings))}€.`
                });
            } else if (marketAnalysis.priceAnalysis.position === 'overpriced') {
                recommendations.push({
                    type: 'warning',
                    icon: 'fa-exclamation-triangle',
                    title: 'Prix d\'achat élevé',
                    description: `Vous avez payé ${marketAnalysis.priceAnalysis.difference.toFixed(0)}% au-dessus du marché. L'optimisation fiscale est cruciale pour compenser.`
                });
            }
            
            if (marketAnalysis.rentAnalysis.position === 'low' || marketAnalysis.rentAnalysis.position === 'underpriced') {
                recommendations.push({
                    type: 'info',
                    icon: 'fa-chart-line',
                    title: 'Potentiel d\'augmentation du loyer',
                    description: `Votre loyer pourrait être augmenté de ${this.formatNumber(Math.abs(marketAnalysis.rentAnalysis.potential))}€/mois pour atteindre le prix du marché.`
                });
            }
        }
        
        // Recommandations fiscales
        if (fiscalResults && fiscalResults.length > 0) {
            const bestRegime = fiscalResults[0];
            const worstRegime = fiscalResults[fiscalResults.length - 1];
            const savings = bestRegime.cashflowNetAnnuel - worstRegime.cashflowNetAnnuel;
            
            recommendations.push({
                type: 'primary',
                icon: 'fa-balance-scale',
                title: `Régime optimal : ${bestRegime.nom}`,
                description: `Ce régime vous permet d'économiser ${this.formatNumber(savings)}€/an par rapport au régime le moins avantageux.`
            });
            
            if (bestRegime.cashflowNetAnnuel > 0) {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-coins',
                    title: 'Investissement rentable',
                    description: `Avec le régime ${bestRegime.nom}, vous générez ${this.formatNumber(bestRegime.cashflowNetAnnuel)}€/an de cash-flow net après impôts.`
                });
            }
        }
        
        // Score global et recommandation finale
        if (marketAnalysis.globalScore > 75) {
            recommendations.push({
                type: 'success',
                icon: 'fa-star',
                title: 'Excellent investissement global',
                description: 'Votre investissement est bien positionné sur le marché. L\'optimisation fiscale le rendra encore plus rentable.'
            });
        } else if (marketAnalysis.globalScore < 40) {
            recommendations.push({
                type: 'warning',
                icon: 'fa-info-circle',
                title: 'Optimisation nécessaire',
                description: 'Votre investissement nécessite une attention particulière. Le choix du bon régime fiscal est crucial pour sa rentabilité.'
            });
        }
        
        return recommendations;
    }

    /**
     * Formate un nombre
     */
    formatNumber(num) {
        return new Intl.NumberFormat('fr-FR', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(Math.round(num));
    }

    /**
     * Génère le HTML pour afficher les résultats fiscaux
     */
    generateFiscalResultsHTML(fiscalResults, propertyData) {
        const bestRegime = fiscalResults[0];
        
        let html = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-balance-scale"></i>
                    </div>
                    <h2 class="card-title">Optimisation fiscale de votre investissement</h2>
                </div>
                
                <!-- Résumé du meilleur régime -->
                <div class="best-regime-summary">
                    <div class="summary-title">
                        <i class="fas fa-trophy"></i>
                        Régime fiscal optimal
                    </div>
                    <div class="summary-content">
                        <p>Le régime <strong>${bestRegime.nom}</strong> est le plus avantageux pour votre situation.</p>
                        <p>Cash-flow net après impôt : <span class="summary-highlight">${this.formatNumber(bestRegime.cashflowNetAnnuel)} €/an</span></p>
                        <p>Soit <span class="summary-highlight">${this.formatNumber(bestRegime.cashflowNetAnnuel / 12)} €/mois</span> dans votre poche</p>
                    </div>
                </div>
                
                <!-- Comparaison des régimes -->
                <h3 style="margin: 30px 0 20px; color: #00bfff;">
                    <i class="fas fa-chart-bar"></i> Comparaison de tous les régimes
                </h3>
                
                <div class="regime-comparison-grid">
                    ${fiscalResults.map((regime, index) => this.generateRegimeCard(regime, index === 0)).join('')}
                </div>
                
                <!-- Graphiques -->
                <div class="grid grid-2 mt-4">
                    <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                        <div class="card-header">
                            <div class="card-icon">
                                <i class="fas fa-chart-bar"></i>
                            </div>
                            <h2 class="card-title">Cash-flow par régime</h2>
                        </div>
                        <canvas id="fiscal-cashflow-chart" width="400" height="300"></canvas>
                    </div>
                    
                    <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                        <div class="card-header">
                            <div class="card-icon">
                                <i class="fas fa-percentage"></i>
                            </div>
                            <h2 class="card-title">Rendement net</h2>
                        </div>
                        <canvas id="fiscal-rendement-chart" width="400" height="300"></canvas>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="continue-section">
                    <button class="btn btn-outline" onclick="goToStep(2)">
                        <i class="fas fa-arrow-left"></i> Retour à l'analyse
                    </button>
                    <button class="btn btn-primary" onclick="window.print()">
                        <i class="fas fa-print"></i> Imprimer le rapport
                    </button>
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Génère une carte de régime fiscal
     */
    generateRegimeCard(regime, isBest) {
        return `
            <div class="regime-result ${isBest ? 'best' : ''}">
                <div class="regime-header">
                    <div class="regime-name">
                        <i class="fas ${regime.icone || 'fa-home'}"></i>
                        ${regime.nom}
                    </div>
                    ${isBest ? '<div class="regime-badge">Meilleur choix</div>' : ''}
                </div>
                
                <div class="regime-metrics">
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow mensuel</div>
                        <div class="metric-value ${regime.cashflowMensuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowMensuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Impôt annuel</div>
                        <div class="metric-value negative">
                            ${this.formatNumber(Math.abs(regime.impotAnnuel))} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow net annuel</div>
                        <div class="metric-value ${regime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowNetAnnuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Rendement net</div>
                        <div class="metric-value neutral">
                            ${regime.rendementNet.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                ${regime.avantages && regime.avantages.length > 0 ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <strong style="color: #94a3b8; font-size: 0.9em;">Avantages :</strong>
                        <ul style="margin-top: 10px; list-style: none; padding: 0;">
                            ${regime.avantages.map(a => `<li style="color: #e2e8f0; font-size: 0.9em; margin-top: 5px;">✓ ${a}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Crée les graphiques de comparaison fiscale
     */
    createFiscalCharts(fiscalResults) {
        // Graphique des cash-flows
        const ctxCashflow = document.getElementById('fiscal-cashflow-chart').getContext('2d');
        new Chart(ctxCashflow, {
            type: 'bar',
            data: {
                labels: fiscalResults.map(r => r.nom),
                datasets: [{
                    label: 'Cash-flow net annuel',
                    data: fiscalResults.map(r => r.cashflowNetAnnuel),
                    backgroundColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(0, 191, 255, 0.7)'),
                    borderColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(0, 191, 255, 1)'),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#94a3b8',
                            callback: (value) => this.formatNumber(value) + ' €'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        // Graphique des rendements
        const ctxRendement = document.getElementById('fiscal-rendement-chart').getContext('2d');
        new Chart(ctxRendement, {
            type: 'line',
            data: {
                labels: fiscalResults.map(r => r.nom),
                datasets: [{
                    label: 'Rendement net',
                    data: fiscalResults.map(r => r.rendementNet),
                    borderColor: 'rgba(0, 191, 255, 1)',
                    backgroundColor: 'rgba(0, 191, 255, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: fiscalResults.map((r, i) => i === 0 ? '#22c55e' : '#00bfff'),
                    pointBorderColor: '#0a0f1e',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#94a3b8',
                            callback: (value) => value.toFixed(1) + '%'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = MarketFiscalAnalyzer;
} else {
    window.MarketFiscalAnalyzer = MarketFiscalAnalyzer;
}
