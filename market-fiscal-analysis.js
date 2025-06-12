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
            typeAchat: data.typeAchat || 'classique',
            prixBien: data.prixPaye,
            surface: data.surface,
            apport: data.apport,
            duree: data.duree,
            taux: data.taux,
            loyerMensuel: data.loyerActuel,
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
                    title: 'Excellent prix d\\'achat',
                    description: `Vous avez acheté ${Math.abs(marketAnalysis.priceAnalysis.difference).toFixed(0)}% en dessous du marché, soit une économie de ${this.formatNumber(Math.abs(marketAnalysis.priceAnalysis.savings))}€.`
                });
            } else if (marketAnalysis.priceAnalysis.position === 'overpriced') {
                recommendations.push({
                    type: 'warning',
                    icon: 'fa-exclamation-triangle',
                    title: 'Prix d\\'achat élevé',
                    description: `Vous avez payé ${marketAnalysis.priceAnalysis.difference.toFixed(0)}% au-dessus du marché. L'optimisation fiscale est cruciale pour compenser.`
                });
            }
            
            if (marketAnalysis.rentAnalysis.position === 'low' || marketAnalysis.rentAnalysis.position === 'underpriced') {
                recommendations.push({
                    type: 'info',
                    icon: 'fa-chart-line',
                    title: 'Potentiel d\\'augmentation du loyer',
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
                description: 'Votre investissement est bien positionné sur le marché. L\\'optimisation fiscale le rendra encore plus rentable.'
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
     * Génère le HTML pour afficher les résultats fiscaux améliorés
     */
    generateFiscalResultsHTML(fiscalResults, propertyData) {
        const bestRegime = fiscalResults[0];
        const mode = propertyData.typeAchat || 'classique';
        
        // Récupérer les données détaillées de simulation
        const detailsClassique = this.simulateur.calculeTout(propertyData.surface, 'classique');
        const detailsEncheres = this.simulateur.calculeTout(propertyData.surface, 'encheres');
        const details = mode === 'classique' ? detailsClassique : detailsEncheres;
        
        let html = `
            <div class=\"card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg\">
                <div class=\"card-header\">
                    <div class=\"card-icon\">
                        <i class=\"fas fa-balance-scale\"></i>
                    </div>
                    <h2 class=\"card-title\">Optimisation fiscale de votre investissement</h2>
                </div>
                
                <!-- Meilleur régime mis en avant -->
                <div class=\"best-regime-highlight\">
                    <div class=\"regime-winner-card\">
                        <div class=\"winner-badge\">
                            <i class=\"fas fa-trophy\"></i>
                            MEILLEUR CASH-FLOW
                        </div>
                        <h2 class=\"regime-winner-name\">${bestRegime.nom}</h2>
                        <div class=\"regime-winner-metrics\">
                            <div class=\"winner-metric\">
                                <div class=\"metric-icon\"><i class=\"fas fa-coins\"></i></div>
                                <div class=\"metric-content\">
                                    <div class=\"metric-label\">Cash-flow mensuel</div>
                                    <div class=\"metric-value positive\">${this.formatNumber(bestRegime.cashflowMensuel)} €</div>
                                </div>
                            </div>
                            <div class=\"winner-metric\">
                                <div class=\"metric-icon\"><i class=\"fas fa-calendar\"></i></div>
                                <div class=\"metric-content\">
                                    <div class=\"metric-label\">Gain annuel après impôts</div>
                                    <div class=\"metric-value positive\">${this.formatNumber(bestRegime.cashflowNetAnnuel)} €</div>
                                </div>
                            </div>
                            <div class=\"winner-metric\">
                                <div class=\"metric-icon\"><i class=\"fas fa-percentage\"></i></div>
                                <div class=\"metric-content\">
                                    <div class=\"metric-label\">Rendement net</div>
                                    <div class=\"metric-value\">${bestRegime.rendementNet.toFixed(2)}%</div>
                                </div>
                            </div>
                        </div>
                        <div class=\"regime-advantages\">
                            ${bestRegime.avantages && bestRegime.avantages.length > 0 ? `
                                <h4><i class=\"fas fa-check-circle\"></i> Avantages clés :</h4>
                                <ul>
                                    ${bestRegime.avantages.map(a => `<li>${a}</li>`).join('')}
                                </ul>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Comparaison des autres régimes -->
                <h3 style=\"margin: 40px 0 20px; color: #00bfff;\">
                    <i class=\"fas fa-chart-bar\"></i> Comparaison de tous les régimes fiscaux
                </h3>
                
                <div class=\"regime-comparison-grid\">
                    ${fiscalResults.map((regime, index) => this.generateRegimeCard(regime, index === 0)).join('')}
                </div>
                
                <!-- Tableau détaillé du mode sélectionné -->
                <div class=\"detailed-analysis-section\">
                    <h3 style=\"margin: 40px 0 20px; color: #00bfff;\">
                        <i class=\"fas fa-table\"></i> Analyse détaillée - ${mode === 'classique' ? 'Achat Classique' : 'Vente aux Enchères'}
                    </h3>
                    
                    <div class=\"expandable-table-container\">
                        <button class=\"btn-expand-table\" onclick=\"toggleDetailedTable()\">
                            <i class=\"fas fa-chevron-down\"></i> Voir le détail complet
                        </button>
                        
                        <div id=\"detailed-table\" class=\"detailed-table-wrapper\" style=\"display: none;\">
                            ${this.generateDetailedComparisonTable(detailsClassique, detailsEncheres, mode)}
                        </div>
                    </div>
                </div>
                
                <!-- Graphiques -->
                <div class=\"grid grid-2 mt-4\">
                    <div class=\"card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg\">
                        <div class=\"card-header\">
                            <div class=\"card-icon\">
                                <i class=\"fas fa-chart-bar\"></i>
                            </div>
                            <h2 class=\"card-title\">Cash-flow par régime</h2>
                        </div>
                        <canvas id=\"fiscal-cashflow-chart\" width=\"400\" height=\"300\"></canvas>
                    </div>
                    
                    <div class=\"card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg\">
                        <div class=\"card-header\">
                            <div class=\"card-icon\">
                                <i class=\"fas fa-percentage\"></i>
                            </div>
                            <h2 class=\"card-title\">Rendement net</h2>
                        </div>
                        <canvas id=\"fiscal-rendement-chart\" width=\"400\" height=\"300\"></canvas>
                    </div>
                </div>
                
                <!-- Cartes de définitions -->
                <div class=\"definitions-section\">
                    <h3 style=\"margin: 40px 0 20px; color: #00bfff;\">
                        <i class=\"fas fa-book\"></i> Comprendre les régimes fiscaux
                    </h3>
                    
                    <div class=\"definitions-grid\">
                        ${this.generateDefinitionCards()}
                    </div>
                </div>
                
                <!-- Actions -->
                <div class=\"continue-section\">
                    <button class=\"btn btn-outline\" onclick=\"goToStep(2)\">
                        <i class=\"fas fa-arrow-left\"></i> Retour à l'analyse
                    </button>
                    <button class=\"btn btn-primary\" onclick=\"window.print()\">
                        <i class=\"fas fa-print\"></i> Imprimer le rapport
                    </button>
                    <button class=\"btn btn-success\" onclick=\"downloadReport()\">
                        <i class=\"fas fa-download\"></i> Télécharger PDF
                    </button>
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Génère le tableau de comparaison détaillé
     */
    generateDetailedComparisonTable(classique, encheres, modeActuel) {
        const data = modeActuel === 'classique' ? classique : encheres;
        const compareData = modeActuel === 'classique' ? encheres : classique;
        
        return `
            <table class=\"detailed-comparison-table\">
                <thead>
                    <tr>
                        <th>Critère</th>
                        <th>${modeActuel === 'classique' ? 'Achat Classique' : 'Vente aux Enchères'}</th>
                        <th>${modeActuel === 'classique' ? 'Vente aux Enchères' : 'Achat Classique'}</th>
                        <th>Différence</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- COÛTS D'ACQUISITION -->
                    <tr class=\"section-header\">
                        <td colspan=\"4\"><strong>COÛTS D'ACQUISITION</strong></td>
                    </tr>
                    <tr>
                        <td>Prix d'achat</td>
                        <td>${this.formatNumber(data.prixAchat)} €</td>
                        <td>${this.formatNumber(compareData.prixAchat)} €</td>
                        <td class=\"${data.prixAchat < compareData.prixAchat ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.prixAchat - compareData.prixAchat)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Frais de notaire / Droits</td>
                        <td>${this.formatNumber(data.fraisNotaire || data.droitsEnregistrement)} €</td>
                        <td>${this.formatNumber(compareData.fraisNotaire || compareData.droitsEnregistrement)} €</td>
                        <td class=\"${(data.fraisNotaire || data.droitsEnregistrement) < (compareData.fraisNotaire || compareData.droitsEnregistrement) ? 'positive' : 'negative'}\">
                            ${this.formatNumber((data.fraisNotaire || data.droitsEnregistrement) - (compareData.fraisNotaire || compareData.droitsEnregistrement))} €
                        </td>
                    </tr>
                    <tr>
                        <td>Commission / Honoraires avocat</td>
                        <td>${this.formatNumber(data.commission || data.honorairesAvocat)} €</td>
                        <td>${this.formatNumber(compareData.commission || compareData.honorairesAvocat)} €</td>
                        <td class=\"${(data.commission || data.honorairesAvocat) < (compareData.commission || compareData.honorairesAvocat) ? 'positive' : 'negative'}\">
                            ${this.formatNumber((data.commission || data.honorairesAvocat) - (compareData.commission || compareData.honorairesAvocat))} €
                        </td>
                    </tr>
                    <tr>
                        <td>Travaux de rénovation</td>
                        <td>${this.formatNumber(data.travaux)} €</td>
                        <td>${this.formatNumber(compareData.travaux)} €</td>
                        <td class=\"${data.travaux < compareData.travaux ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.travaux - compareData.travaux)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Frais bancaires</td>
                        <td>${this.formatNumber(data.fraisBancaires)} €</td>
                        <td>${this.formatNumber(compareData.fraisBancaires)} €</td>
                        <td class=\"${data.fraisBancaires < compareData.fraisBancaires ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.fraisBancaires - compareData.fraisBancaires)} €
                        </td>
                    </tr>
                    <tr class=\"total-row\">
                        <td><strong>Budget total nécessaire</strong></td>
                        <td><strong>${this.formatNumber(data.coutTotal)} €</strong></td>
                        <td><strong>${this.formatNumber(compareData.coutTotal)} €</strong></td>
                        <td class=\"${data.coutTotal < compareData.coutTotal ? 'positive' : 'negative'}\">
                            <strong>${this.formatNumber(data.coutTotal - compareData.coutTotal)} €</strong>
                        </td>
                    </tr>
                    
                    <!-- FINANCEMENT -->
                    <tr class=\"section-header\">
                        <td colspan=\"4\"><strong>FINANCEMENT</strong></td>
                    </tr>
                    <tr>
                        <td>Votre apport personnel</td>
                        <td>${this.formatNumber(data.coutTotal - data.emprunt)} €</td>
                        <td>${this.formatNumber(compareData.coutTotal - compareData.emprunt)} €</td>
                        <td>0 €</td>
                    </tr>
                    <tr>
                        <td>Montant emprunté</td>
                        <td>${this.formatNumber(data.emprunt)} €</td>
                        <td>${this.formatNumber(compareData.emprunt)} €</td>
                        <td class=\"${data.emprunt < compareData.emprunt ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.emprunt - compareData.emprunt)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Remboursement mensuel</td>
                        <td>${this.formatNumber(data.mensualite)} €/mois</td>
                        <td>${this.formatNumber(compareData.mensualite)} €/mois</td>
                        <td class=\"${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.mensualite - compareData.mensualite)} €
                        </td>
                    </tr>
                    
                    <!-- REVENUS LOCATIFS -->
                    <tr class=\"section-header\">
                        <td colspan=\"4\"><strong>REVENUS LOCATIFS</strong></td>
                    </tr>
                    <tr>
                        <td>Surface que vous pouvez acheter</td>
                        <td>${data.surface.toFixed(1)} m²</td>
                        <td>${compareData.surface.toFixed(1)} m²</td>
                        <td class=\"${data.surface > compareData.surface ? 'positive' : 'negative'}\">
                            ${(data.surface - compareData.surface).toFixed(1)} m²
                        </td>
                    </tr>
                    <tr>
                        <td>Loyer mensuel (avant charges)</td>
                        <td>${this.formatNumber(data.loyerBrut)} €</td>
                        <td>${this.formatNumber(compareData.loyerBrut)} €</td>
                        <td class=\"${data.loyerBrut > compareData.loyerBrut ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.loyerBrut - compareData.loyerBrut)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Provision logement vide</td>
                        <td>-${this.formatNumber(data.loyerBrut - data.loyerNet)} €</td>
                        <td>-${this.formatNumber(compareData.loyerBrut - compareData.loyerNet)} €</td>
                        <td>${this.formatNumber((data.loyerBrut - data.loyerNet) - (compareData.loyerBrut - compareData.loyerNet))} €</td>
                    </tr>
                    <tr>
                        <td>Loyer net mensuel</td>
                        <td>${this.formatNumber(data.loyerNet)} €</td>
                        <td>${this.formatNumber(compareData.loyerNet)} €</td>
                        <td class=\"${data.loyerNet > compareData.loyerNet ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.loyerNet - compareData.loyerNet)} €
                        </td>
                    </tr>
                    
                    <!-- VOS DÉPENSES MENSUELLES -->
                    <tr class=\"section-header\">
                        <td colspan=\"4\"><strong>VOS DÉPENSES MENSUELLES</strong></td>
                    </tr>
                    <tr>
                        <td>Remboursement du prêt</td>
                        <td>-${this.formatNumber(data.mensualite)} €</td>
                        <td>-${this.formatNumber(compareData.mensualite)} €</td>
                        <td class=\"${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}\">
                            ${this.formatNumber(compareData.mensualite - data.mensualite)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Taxe foncière (par mois)</td>
                        <td>-${this.formatNumber(data.taxeFonciere / 12)} €</td>
                        <td>-${this.formatNumber(compareData.taxeFonciere / 12)} €</td>
                        <td class=\"${data.taxeFonciere < compareData.taxeFonciere ? 'positive' : 'negative'}\">
                            ${this.formatNumber((compareData.taxeFonciere - data.taxeFonciere) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Charges de copropriété</td>
                        <td>-${this.formatNumber(data.chargesNonRecuperables / 12)} €</td>
                        <td>-${this.formatNumber(compareData.chargesNonRecuperables / 12)} €</td>
                        <td class=\"${data.chargesNonRecuperables < compareData.chargesNonRecuperables ? 'positive' : 'negative'}\">
                            ${this.formatNumber((compareData.chargesNonRecuperables - data.chargesNonRecuperables) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Budget entretien</td>
                        <td>-${this.formatNumber(data.entretienAnnuel / 12)} €</td>
                        <td>-${this.formatNumber(compareData.entretienAnnuel / 12)} €</td>
                        <td class=\"${data.entretienAnnuel < compareData.entretienAnnuel ? 'positive' : 'negative'}\">
                            ${this.formatNumber((compareData.entretienAnnuel - data.entretienAnnuel) / 12)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Assurance propriétaire</td>
                        <td>-${this.formatNumber(data.assurancePNO / 12)} €</td>
                        <td>-${this.formatNumber(compareData.assurancePNO / 12)} €</td>
                        <td>${this.formatNumber((compareData.assurancePNO - data.assurancePNO) / 12)} €</td>
                    </tr>
                    <tr class=\"total-row\">
                        <td><strong>Total de vos dépenses</strong></td>
                        <td><strong>-${this.formatNumber(data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12)} €</strong></td>
                        <td><strong>-${this.formatNumber(compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12)} €</strong></td>
                        <td><strong>${this.formatNumber((compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12) - (data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12))} €</strong></td>
                    </tr>
                    
                    <!-- RÉSULTAT -->
                    <tr class=\"section-header\">
                        <td colspan=\"4\"><strong>RÉSULTAT</strong></td>
                    </tr>
                    <tr>
                        <td>Cash-flow avant impôts</td>
                        <td class=\"${data.cashFlow >= 0 ? 'positive' : 'negative'}\">${this.formatNumber(data.cashFlow)} €</td>
                        <td class=\"${compareData.cashFlow >= 0 ? 'positive' : 'negative'}\">${this.formatNumber(compareData.cashFlow)} €</td>
                        <td class=\"${data.cashFlow > compareData.cashFlow ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.cashFlow - compareData.cashFlow)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Gain annuel après impôts théorique</td>
                        <td class=\"${data.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}\">${this.formatNumber(data.cashFlowAnnuel)} €</td>
                        <td class=\"${compareData.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}\">${this.formatNumber(compareData.cashFlowAnnuel)} €</td>
                        <td class=\"${data.cashFlowAnnuel > compareData.cashFlowAnnuel ? 'positive' : 'negative'}\">
                            ${this.formatNumber(data.cashFlowAnnuel - compareData.cashFlowAnnuel)} €
                        </td>
                    </tr>
                    <tr>
                        <td>Rendement de votre investissement</td>
                        <td class=\"${data.rendementNet >= 0 ? 'positive' : 'negative'}\">${data.rendementNet.toFixed(2)} %</td>
                        <td class=\"${compareData.rendementNet >= 0 ? 'positive' : 'negative'}\">${compareData.rendementNet.toFixed(2)} %</td>
                        <td class=\"${data.rendementNet > compareData.rendementNet ? 'positive' : 'negative'}\">
                            ${(data.rendementNet - compareData.rendementNet).toFixed(2)} %
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    /**
     * Génère les cartes de définition
     */
    generateDefinitionCards() {
        const definitions = [
            {
                title: \"Cash-flow\",
                icon: \"fa-coins\",
                description: \"Le cash-flow représente l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges (crédit, taxes, entretien, etc.). Un cash-flow positif signifie que l'investissement s'autofinance.\"
            },
            {
                title: \"TMI (Taux Marginal d'Imposition)\",
                icon: \"fa-percentage\",
                description: \"C'est le taux d'imposition qui s'applique à la tranche la plus élevée de vos revenus. Plus votre TMI est élevé, plus les régimes avec déductions fiscales deviennent intéressants.\"
            },
            {
                title: \"LMNP (Loueur Meublé Non Professionnel)\",
                icon: \"fa-bed\",
                description: \"Régime fiscal pour la location meublée permettant d'amortir le bien et le mobilier. Très avantageux car les amortissements réduisent voire annulent l'impôt sur les loyers.\"
            },
            {
                title: \"Déficit foncier\",
                icon: \"fa-chart-line\",
                description: \"Lorsque vos charges dépassent vos revenus locatifs, vous créez un déficit déductible de vos autres revenus (jusqu'à 10 700€/an), ce qui réduit votre impôt global.\"
            },
            {
                title: \"Amortissement\",
                icon: \"fa-clock\",
                description: \"Déduction comptable représentant la perte de valeur du bien dans le temps. En LMNP, vous pouvez amortir 2-3% du bien par an, réduisant ainsi votre base imposable.\"
            },
            {
                title: \"Rendement net\",
                icon: \"fa-chart-pie\",
                description: \"Rentabilité réelle de votre investissement après déduction de toutes les charges et impôts. Se calcule en divisant le cash-flow annuel net par votre apport initial.\"
            }
        ];
        
        return definitions.map(def => `
            <div class=\"definition-card\">
                <div class=\"definition-icon\">
                    <i class=\"fas ${def.icon}\"></i>
                </div>
                <h4 class=\"definition-title\">${def.title}</h4>
                <p class=\"definition-text\">${def.description}</p>
            </div>
        `).join('');
    }

    /**
     * Génère une carte de régime fiscal
     */
    generateRegimeCard(regime, isBest) {
        return `
            <div class=\"regime-result ${isBest ? 'best' : ''}\">
                <div class=\"regime-header\">
                    <div class=\"regime-name\">
                        <i class=\"fas ${regime.icone || 'fa-home'}\"></i>
                        ${regime.nom}
                    </div>
                    ${isBest ? '<div class=\"regime-badge\">Meilleur choix</div>' : ''}
                </div>
                
                <div class=\"regime-metrics\">
                    <div class=\"metric-box\">
                        <div class=\"metric-label\">Cash-flow mensuel</div>
                        <div class=\"metric-value ${regime.cashflowMensuel >= 0 ? 'positive' : 'negative'}\">
                            ${this.formatNumber(regime.cashflowMensuel)} €
                        </div>
                    </div>
                    
                    <div class=\"metric-box\">
                        <div class=\"metric-label\">Impôt annuel</div>
                        <div class=\"metric-value negative\">
                            ${this.formatNumber(Math.abs(regime.impotAnnuel))} €
                        </div>
                    </div>
                    
                    <div class=\"metric-box\">
                        <div class=\"metric-label\">Cash-flow net annuel</div>
                        <div class=\"metric-value ${regime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}\">
                            ${this.formatNumber(regime.cashflowNetAnnuel)} €
                        </div>
                    </div>
                    
                    <div class=\"metric-box\">
                        <div class=\"metric-label\">Rendement net</div>
                        <div class=\"metric-value neutral\">
                            ${regime.rendementNet.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                ${regime.avantages && regime.avantages.length > 0 ? `
                    <div style=\"margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);\">
                        <strong style=\"color: #94a3b8; font-size: 0.9em;\">Avantages :</strong>
                        <ul style=\"margin-top: 10px; list-style: none; padding: 0;\">
                            ${regime.avantages.map(a => `<li style=\"color: #e2e8f0; font-size: 0.9em; margin-top: 5px;\">✓ ${a}</li>`).join('')}
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
