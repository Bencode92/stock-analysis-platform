// market-fiscal-analysis.js - Analyse de marché et fiscale
(function() {
    'use strict';

    class MarketFiscalAnalyzer {
        constructor() {
            this.marketData = null;
            this.fiscalData = null;
        }

        // Format number avec séparateurs de milliers
        formatNumber(num) {
            if (!num && num !== 0) return '0';
            return new Intl.NumberFormat('fr-FR', { 
                minimumFractionDigits: 0,
                maximumFractionDigits: 0 
            }).format(Math.round(num));
        }

        // Préparation des données fiscales
        prepareFiscalData() {
            const form = document.getElementById('property-form');
            if (!form) return null;

            const getData = (id) => {
                const el = document.getElementById(id);
                return el ? parseFloat(el.value) || 0 : 0;
            };

            const getChecked = (id) => {
                const el = document.getElementById(id);
                return el ? el.checked : false;
            };

            const getRadioValue = (name) => {
                const checked = document.querySelector(`input[name="${name}"]:checked`);
                return checked ? checked.value : '';
            };

            return {
                // Prix et financement
                prixAchat: getData('propertyPrice'),
                surface: getData('propertySurface'),
                apport: getData('apport'),
                duree: getData('loanDuration'),
                taux: getData('loanRate'),
                
                // Loyers et charges
                loyerHC: getData('monthlyRent'),
                chargesRecup: getData('monthlyCharges'),
                
                // Fiscalité
                tmi: getData('tmi'),
                regimeActuel: getRadioValue('regime-actuel') || 'nu_micro',
                forceRegime: getChecked('force-regime'),
                
                // Charges et frais
                taxeFonciere: getData('taxeFonciere'),
                chargesCopro: getData('charges-copro-non-recup'),
                vacanceLocative: getData('vacanceLocative'),
                gestionLocative: getData('gestionLocative'),
                entretien: getData('entretien-annuel'),
                assurancePNO: getData('assurance-pno'),
                
                // Mode d'occupation
                occupationMode: document.getElementById('occupationMode')?.value || 'location',
                partnerContribution: getData('partnerContribution'),
                
                // Type d'achat
                typeAchat: getRadioValue('type-achat') || 'classique',
                
                // Frais selon le type
                fraisNotaire: getData('frais-notaire-taux'),
                honorairesAvocat: getData('honoraires-avocat'),
                
                // Travaux
                travaux: getData('travaux-renovation')
            };
        }

        // Analyse complète
        async performCompleteAnalysis(propertyData) {
            const fiscalData = this.prepareFiscalData();
            
            // Calculs de base
            const prixTotal = fiscalData.prixAchat;
            const montantEmprunte = prixTotal - fiscalData.apport;
            const tauxMensuel = (fiscalData.taux / 100) / 12;
            const nbMois = fiscalData.duree * 12;
            
            // Mensualité
            let mensualite = 0;
            if (tauxMensuel > 0) {
                mensualite = montantEmprunte * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -nbMois));
            } else {
                mensualite = montantEmprunte / nbMois;
            }

            // Revenus locatifs annuels
            const loyerAnnuel = fiscalData.loyerHC * 12 * (1 - fiscalData.vacanceLocative / 100);
            const chargesAnnuelles = fiscalData.chargesRecup * 12;

            // Analyse fiscale par régime
            const regimes = this.analyzeRegimes(fiscalData, loyerAnnuel, chargesAnnuelles);

            return {
                market: {
                    prixTotal,
                    montantEmprunte,
                    mensualite,
                    tauxEndettement: (mensualite / (loyerAnnuel / 12)) * 100
                },
                fiscal: regimes
            };
        }

        // Analyse des régimes fiscaux
        analyzeRegimes(data, loyerAnnuel, chargesAnnuelles) {
            const regimes = [];

            // Location nue - Micro-foncier
            if (loyerAnnuel <= 15000) {
                const revenuImposable = loyerAnnuel * 0.7; // Abattement 30%
                const impot = revenuImposable * (data.tmi / 100);
                const cashflowNet = loyerAnnuel - impot - data.taxeFonciere - data.entretien;
                
                regimes.push({
                    nom: 'Micro-foncier',
                    type: 'nu_micro',
                    revenuImposable,
                    impot,
                    cashflowNetAnnuel: cashflowNet,
                    tauxImposition: (impot / loyerAnnuel) * 100
                });
            }

            // Location nue - Réel
            const chargesDeductibles = data.taxeFonciere + data.entretien + (data.chargesCopro * 12) + 
                                      (data.assurancePNO * 12) + (data.gestionLocative * loyerAnnuel / 100);
            const revenuImposableReel = Math.max(0, loyerAnnuel - chargesDeductibles);
            const impotReel = revenuImposableReel * (data.tmi / 100);
            
            regimes.push({
                nom: 'Réel foncier',
                type: 'nu_reel',
                revenuImposable: revenuImposableReel,
                impot: impotReel,
                cashflowNetAnnuel: loyerAnnuel - impotReel - chargesDeductibles,
                tauxImposition: (impotReel / loyerAnnuel) * 100
            });

            // LMNP Micro-BIC
            if (loyerAnnuel <= 77700) {
                const revenuImposableLMNP = loyerAnnuel * 0.5; // Abattement 50%
                const impotLMNP = revenuImposableLMNP * (data.tmi / 100);
                
                regimes.push({
                    nom: 'LMNP Micro-BIC',
                    type: 'lmnp_micro',
                    revenuImposable: revenuImposableLMNP,
                    impot: impotLMNP,
                    cashflowNetAnnuel: loyerAnnuel - impotLMNP - data.taxeFonciere - data.entretien,
                    tauxImposition: (impotLMNP / loyerAnnuel) * 100
                });
            }

            // LMNP Réel (avec amortissements)
            const amortissementBien = data.prixAchat * 0.85 / 30; // 85% du bien sur 30 ans
            const amortissementMobilier = data.prixAchat * 0.15 / 7; // 15% mobilier sur 7 ans
            const amortissementTotal = amortissementBien + amortissementMobilier;
            
            const resultatLMNPReel = loyerAnnuel - chargesDeductibles - amortissementTotal;
            const impotLMNPReel = Math.max(0, resultatLMNPReel) * (data.tmi / 100);
            
            regimes.push({
                nom: 'LMNP Réel',
                type: 'lmnp_reel',
                revenuImposable: Math.max(0, resultatLMNPReel),
                impot: impotLMNPReel,
                cashflowNetAnnuel: loyerAnnuel - impotLMNPReel - chargesDeductibles,
                tauxImposition: (impotLMNPReel / loyerAnnuel) * 100,
                amortissements: amortissementTotal
            });

            // Trier par cashflow net décroissant
            regimes.sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);

            return regimes;
        }

        // Génération du HTML des résultats fiscaux
        generateFiscalResultsHTML(regimes, data) {
            if (!regimes || regimes.length === 0) {
                return '<div class="market-comparison-card"><p>Aucune analyse fiscale disponible</p></div>';
            }

            const bestRegime = regimes[0];
            const currentRegime = regimes.find(r => r.type === data.regimeActuel) || regimes[0];
            const gain = bestRegime.cashflowNetAnnuel - currentRegime.cashflowNetAnnuel;

            let html = `
                <div class="best-regime-summary">
                    <div class="summary-title">
                        <i class="fas fa-trophy"></i> Meilleur régime fiscal
                    </div>
                    <div class="summary-content">
                        <p>Le régime <span class="summary-highlight">${bestRegime.nom}</span> 
                        est le plus avantageux avec un cash-flow net de 
                        <span class="summary-highlight">${this.formatNumber(bestRegime.cashflowNetAnnuel)} €/an</span></p>
                        ${gain > 0 ? `<p>Gain potentiel: <span class="summary-highlight">+${this.formatNumber(gain)} €/an</span> 
                        par rapport à votre régime actuel</p>` : ''}
                    </div>
                </div>

                <div class="regime-comparison-grid">
            `;

            regimes.forEach((regime, index) => {
                const isBest = index === 0;
                const isCurrent = regime.type === data.regimeActuel;
                
                html += `
                    <div class="regime-result ${isBest ? 'best' : ''}">
                        <div class="regime-header">
                            <div class="regime-name">
                                ${isBest ? '<i class="fas fa-star"></i>' : ''}
                                ${regime.nom}
                            </div>
                            ${isBest ? '<span class="regime-badge">Meilleur choix</span>' : ''}
                            ${isCurrent ? '<span class="regime-badge current">Régime actuel</span>' : ''}
                        </div>
                        
                        <div class="regime-metrics">
                            <div class="metric-box">
                                <div class="metric-label">Revenu imposable</div>
                                <div class="metric-value">${this.formatNumber(regime.revenuImposable)} €</div>
                            </div>
                            <div class="metric-box">
                                <div class="metric-label">Impôt annuel</div>
                                <div class="metric-value negative">${this.formatNumber(regime.impot)} €</div>
                            </div>
                            <div class="metric-box">
                                <div class="metric-label">Cash-flow net</div>
                                <div class="metric-value positive">${this.formatNumber(regime.cashflowNetAnnuel)} €</div>
                            </div>
                            <div class="metric-box">
                                <div class="metric-label">Taux d'imposition</div>
                                <div class="metric-value">${regime.tauxImposition.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                </div>
                
                <div style="text-align: center; margin-top: 40px;">
                    <button class="btn-expand-table btn btn-outline">
                        <i class="fas fa-chevron-down"></i> Voir le détail complet
                    </button>
                </div>
                
                <table id="detailed-fiscal-table" class="fiscal-details-table" style="display: none;">
                    <thead>
                        <tr>
                            <th>Régime</th>
                            <th>Revenu brut</th>
                            <th>Abattement/Charges</th>
                            <th>Revenu imposable</th>
                            <th>Impôt (TMI ${data.tmi}%)</th>
                            <th>Cash-flow net</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            regimes.forEach(regime => {
                html += `
                    <tr>
                        <td><strong>${regime.nom}</strong></td>
                        <td>${this.formatNumber(data.loyerHC * 12)} €</td>
                        <td>${regime.type.includes('micro') ? 
                            (regime.type === 'lmnp_micro' ? '50%' : '30%') : 
                            this.formatNumber(regime.amortissements || 0) + ' €'}</td>
                        <td>${this.formatNumber(regime.revenuImposable)} €</td>
                        <td class="negative">-${this.formatNumber(regime.impot)} €</td>
                        <td class="positive"><strong>${this.formatNumber(regime.cashflowNetAnnuel)} €</strong></td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            return html;
        }

        // Création des graphiques
        createFiscalCharts(regimes) {
            // Implémentation des graphiques si nécessaire
            console.log('Graphiques fiscaux:', regimes);
        }
    }

    // Export global
    window.MarketFiscalAnalyzer = MarketFiscalAnalyzer;

})();
