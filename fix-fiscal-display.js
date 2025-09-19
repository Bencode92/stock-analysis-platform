/**
 * fix-fiscal-display.js
 * Restaure l'affichage détaillé du régime fiscal choisi
 * Corrige le problème de la vue synthétique qui remplace le détail
 */

(function() {
    'use strict';
    
    // Attendre que tout soit chargé
    window.addEventListener('load', function() {
        
        // Override la fonction pour afficher le détail du régime actuel
        if (window.MarketFiscalAnalyzer && MarketFiscalAnalyzer.prototype) {
            
            // Sauvegarder l'ancienne fonction
            const originalGenerateHTML = MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML;
            
            // Nouvelle fonction qui affiche le détail du régime choisi
            MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML = function(fiscalResults, inputData) {
                
                // Récupérer le régime actuel sélectionné
                const regimeActuel = document.querySelector('input[name="regime-actuel"]:checked')?.value || 
                                    window.propertyData?.regimeActuel || 
                                    'nu_micro';
                
                // Si on veut forcer l'affichage du régime actuel
                const forceRegime = document.getElementById('force-regime')?.checked;
                
                // Trouver le régime à afficher
                let regimeToShow;
                
                if (forceRegime) {
                    // Afficher le régime choisi par l'utilisateur
                    regimeToShow = fiscalResults.find(r => {
                        const key = r.key || (window.REGIME_KEY_FROM_ID?.[r.id] || r.id);
                        return key === regimeActuel;
                    });
                } else {
                    // Afficher le meilleur régime
                    regimeToShow = fiscalResults.reduce((a, b) => 
                        a.cashflowNetAnnuel > b.cashflowNetAnnuel ? a : b
                    );
                }
                
                // Si pas trouvé, prendre le meilleur
                if (!regimeToShow) {
                    regimeToShow = fiscalResults[0];
                }
                
                // Générer le HTML détaillé comme avant
                return this.generateDetailedRegimeHTML(regimeToShow, fiscalResults, inputData);
            };
            
            // Fonction pour générer le HTML détaillé d'un régime (comme les anciennes versions)
            MarketFiscalAnalyzer.prototype.generateDetailedRegimeHTML = function(regime, allRegimes, inputData) {
                
                // Calculer les valeurs
                const cashflowMensuel = regime.cashflowMensuel || (regime.cashflowNetAnnuel / 12);
                const rendementBrut = ((inputData.loyerHC * 12) / inputData.price) * 100;
                const rendementNet = regime.rendementNet || (regime.cashflowNetAnnuel / inputData.price) * 100;
                
                // Helper pour formater les montants
                const formatAmount = (value) => {
                    const num = Math.abs(value);
                    return new Intl.NumberFormat('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(num);
                };
                
                return `
                    <!-- Titre principal avec badge "Meilleur" -->
                    <div class="best-regime-summary">
                        <div class="summary-title">
                            <i class="fas fa-trophy"></i> 
                            Meilleur régime fiscal : ${regime.nom}
                        </div>
                    </div>
                    
                    <!-- Carte principale du régime avec les métriques clés -->
                    <div class="best-regime-card" style="background: rgba(0, 191, 255, 0.05); border: 2px solid rgba(0, 191, 255, 0.3); border-radius: 20px; padding: 30px; margin: 30px 0;">
                        
                        <!-- Cash-flow mensuel en gros -->
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h3 style="color: #00bfff; font-size: 1.2em; margin-bottom: 10px;">💸 Cash-flow mensuel</h3>
                            <div class="${cashflowMensuel >= 0 ? 'positive' : 'negative'}" style="font-size: 3em; font-weight: 700;">
                                ${cashflowMensuel >= 0 ? '' : '−'}${formatAmount(cashflowMensuel)}
                            </div>
                        </div>
                        
                        <!-- Rendement brut -->
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h4 style="color: #94a3b8; font-size: 1.1em; margin-bottom: 10px;">📊 Rendement brut / coût total</h4>
                            <div style="font-size: 2em; font-weight: 600; color: ${rendementBrut > 4 ? '#22c55e' : rendementBrut < 2 ? '#ef4444' : '#e2e8f0'};">
                                ${rendementBrut.toFixed(2)} %
                            </div>
                        </div>
                        
                        <!-- Détail du calcul avec vos données -->
                        <div class="fiscal-calculation-details" style="background: rgba(255, 255, 255, 0.03); border-radius: 15px; padding: 25px; margin-top: 30px;">
                            <h4 style="color: #00bfff; margin-bottom: 20px;">📋 Détail du calcul avec vos données</h4>
                            
                            <table class="calculation-table" style="width: 100%; color: #e2e8f0;">
                                <tbody>
                                    <tr>
                                        <td style="padding: 10px;">Revenus locatifs annuels (HC):</td>
                                        <td class="positive" style="text-align: right; padding: 10px; color: #22c55e;">
                                            +${formatAmount(inputData.loyerHC * 12)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px;">Charges déductibles:</td>
                                        <td class="negative" style="text-align: right; padding: 10px; color: #ef4444;">
                                            −${formatAmount(Math.abs(regime.totalCharges || regime.chargesDeductibles || 8000))}
                                        </td>
                                    </tr>
                                    ${regime.amortissements ? `
                                    <tr>
                                        <td style="padding: 10px;">Amortissements:</td>
                                        <td style="text-align: right; padding: 10px; color: #94a3b8;">
                                            −${formatAmount(regime.amortissements)}
                                        </td>
                                    </tr>
                                    ` : ''}
                                    <tr>
                                        <td style="padding: 10px;">Base imposable:</td>
                                        <td style="text-align: right; padding: 10px;">
                                            ${formatAmount(regime.baseImposable || 0)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px;">Impôt (TMI ${inputData.tmi}%):</td>
                                        <td class="negative" style="text-align: right; padding: 10px; color: #ef4444;">
                                            −${formatAmount(Math.abs(regime.impotAnnuel || 0))}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px;">Mensualité crédit:</td>
                                        <td class="negative" style="text-align: right; padding: 10px; color: #ef4444;">
                                            −${formatAmount(inputData.monthlyPayment * 12)}
                                        </td>
                                    </tr>
                                    <tr class="total-row" style="border-top: 2px solid rgba(0, 191, 255, 0.3); font-weight: 700;">
                                        <td style="padding: 15px;"><strong>Résultat net annuel:</strong></td>
                                        <td class="${regime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}" style="text-align: right; padding: 15px; font-size: 1.3em;">
                                            <strong>${regime.cashflowNetAnnuel >= 0 ? '+' : '−'}${formatAmount(regime.cashflowNetAnnuel)}</strong>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <!-- Bouton pour voir le détail complet -->
                            <button class="btn-expand-table" 
                                    id="btn-fiscal-detail"
                                    onclick="window.toggleDetailedTable()"
                                    style="margin: 20px auto; background: rgba(0, 191, 255, 0.1); 
                                           border: 1px solid rgba(0, 191, 255, 0.3); 
                                           color: #00bfff; padding: 10px 20px; 
                                           border-radius: 8px; cursor: pointer; 
                                           display: flex; align-items: center; gap: 8px;
                                           transition: all 0.3s ease;">
                                <i class="fas fa-chevron-down"></i> 
                                <span>Voir le détail complet</span>
                            </button>
                        </div>
                        
                        <!-- Avantages du régime -->
                        ${regime.avantages && regime.avantages.length > 0 ? `
                        <div style="margin-top: 30px; padding: 20px; background: rgba(34, 197, 94, 0.1); border-radius: 15px;">
                            <h4 style="color: #22c55e; margin-bottom: 15px;">✅ Avantages de ce régime</h4>
                            <ul style="list-style: none; padding: 0;">
                                ${regime.avantages.map(a => `
                                    <li style="color: #e2e8f0; margin: 10px 0;">
                                        <i class="fas fa-check-circle" style="color: #22c55e; margin-right: 10px;"></i>
                                        ${a}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- Tableau détaillé caché -->
                    <div id="detailed-fiscal-table" style="display: none; animation: slideDown 0.3s ease;">
                        ${this.buildDetailedTable ? this.buildDetailedTable(regime, inputData) : ''}
                    </div>
                    
                    <!-- Vue synthétique de comparaison -->
                    <div style="background: rgba(255, 255, 255, 0.02); border-radius: 20px; padding: 30px; margin: 30px 0;">
                        <h3 style="color: #00bfff; margin-bottom: 20px;">📊 Synthèse comparative des régimes</h3>
                        
                        <div class="regime-comparison-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                            ${allRegimes.slice(0, 6).map(r => {
                                const isCurrentRegime = r.id === regime.id;
                                const isBest = isCurrentRegime;
                                return `
                                    <div class="regime-result ${isBest ? 'best' : ''}" 
                                         style="background: ${isBest ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; 
                                                border: 2px solid ${isBest ? '#22c55e' : 'rgba(0, 191, 255, 0.2)'}; 
                                                border-radius: 15px; padding: 20px; transition: all 0.3s ease;">
                                        <div class="regime-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                            <div class="regime-name" style="font-weight: 600; color: ${isBest ? '#22c55e' : '#00bfff'};">
                                                <i class="fas ${r.icone || 'fa-home'}"></i>
                                                ${r.nom}
                                            </div>
                                            ${isBest ? '<span class="regime-badge" style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em;">Meilleur</span>' : ''}
                                        </div>
                                        
                                        <div class="regime-metrics" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                            <div class="metric-box" style="text-align: center;">
                                                <div style="color: #94a3b8; font-size: 0.8em; margin-bottom: 5px;">Cash-flow mensuel</div>
                                                <div style="font-weight: 600; color: ${(r.cashflowMensuel || r.cashflowNetAnnuel/12) >= 0 ? '#22c55e' : '#ef4444'};">
                                                    ${formatAmount(r.cashflowMensuel || r.cashflowNetAnnuel/12)}
                                                </div>
                                            </div>
                                            <div class="metric-box" style="text-align: center;">
                                                <div style="color: #94a3b8; font-size: 0.8em; margin-bottom: 5px;">Rendement net</div>
                                                <div style="font-weight: 600; color: #e2e8f0;">
                                                    ${(r.rendementNet || 0).toFixed(2)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <!-- Graphiques de comparaison -->
                    <div class="charts-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 30px 0;">
                        <div class="chart-wrapper">
                            <h4 style="text-align: center; color: #e2e8f0;">Cash-flow net annuel par régime</h4>
                            <canvas id="fiscal-cashflow-chart" style="height: 300px;"></canvas>
                        </div>
                        <div class="chart-wrapper">
                            <h4 style="text-align: center; color: #e2e8f0;">Rendement net par régime</h4>
                            <canvas id="fiscal-rendement-chart" style="height: 300px;"></canvas>
                        </div>
                    </div>
                `;
            };
            
            console.log('✅ Fix appliqué : Affichage détaillé du régime restauré');
        }
    });
    
    // Fonction globale pour toggle le tableau détaillé
    window.toggleDetailedTable = function() {
        const table = document.getElementById('detailed-fiscal-table');
        const btn = document.querySelector('.btn-expand-table');
        
        if (table && btn) {
            if (table.style.display === 'none') {
                table.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-chevron-up"></i> <span>Masquer le détail</span>';
            } else {
                table.style.display = 'none';
                btn.innerHTML = '<i class="fas fa-chevron-down"></i> <span>Voir le détail complet</span>';
            }
        }
    };
    
})();
