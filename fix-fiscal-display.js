// fix-fiscal-display.js
// Restaure l'affichage détaillé du régime fiscal choisi à l'étape 1
// Version qui affiche le détail complet comme avant (images 2 et 3)

(function() {
    'use strict';
    
    // Attendre que tout soit chargé
    window.addEventListener('load', function() {
        
        // Override la fonction pour afficher le détail du régime actuel
        if (window.MarketFiscalAnalyzer && MarketFiscalAnalyzer.prototype) {
            
            // Sauvegarder l'ancienne fonction synthétique
            const originalSyntheticHTML = MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML;
            
            // Nouvelle fonction qui affiche le détail du régime choisi
            MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML = function(fiscalResults, inputData) {
                
                // Récupérer le régime actuel sélectionné à l'étape 1
                const regimeActuel = document.querySelector('input[name="regime-actuel"]:checked')?.value || 
                                    window.propertyData?.regimeActuel || 
                                    'nu_micro';
                
                // Si on veut forcer l'affichage du régime actuel
                const forceRegime = document.getElementById('force-regime')?.checked;
                
                // Trouver le régime à afficher
                let regimeToShow;
                let isCurrentRegime = false;
                
                if (forceRegime) {
                    // Afficher le régime choisi par l'utilisateur
                    regimeToShow = fiscalResults.find(r => {
                        const key = r.key || (window.REGIME_KEY_FROM_ID?.[r.id] || r.id);
                        return key === regimeActuel;
                    });
                    isCurrentRegime = true;
                }
                
                // Si pas trouvé ou pas forcé, prendre le meilleur
                if (!regimeToShow) {
                    regimeToShow = fiscalResults.reduce((a, b) => 
                        a.cashflowNetAnnuel > b.cashflowNetAnnuel ? a : b
                    );
                    // Vérifier si le meilleur est aussi le régime actuel
                    const bestKey = regimeToShow.key || (window.REGIME_KEY_FROM_ID?.[regimeToShow.id] || regimeToShow.id);
                    isCurrentRegime = (bestKey === regimeActuel);
                }
                
                // Générer le HTML détaillé comme dans les images 2 et 3
                return this.generateDetailedRegimeHTML(regimeToShow, fiscalResults, inputData, isCurrentRegime);
            };
            
            // Fonction pour générer le HTML détaillé d'un régime (style images 2 et 3)
            MarketFiscalAnalyzer.prototype.generateDetailedRegimeHTML = function(regime, allRegimes, inputData, isCurrentRegime) {
                
                // Calculs des valeurs principales
                const cashflowMensuel = regime.cashflowMensuel || (regime.cashflowNetAnnuel / 12);
                const loyerAnnuel = (inputData.loyerHC || inputData.monthlyRent) * 12;
                const coutTotal = inputData.coutTotalAcquisition || inputData.price;
                const rendementBrut = (loyerAnnuel / coutTotal) * 100;
                
                // Charges déductibles approximatives
                const chargesDeductibles = inputData.yearlyCharges + inputData.taxeFonciere + 
                    (inputData.loanAmount * inputData.loanRate / 100) + (inputData.gestionFees || 0) + 
                    inputData.entretienAnnuel + ((inputData.chargesCoproNonRecup || 50) * 12);
                
                const baseImposable = Math.max(0, loyerAnnuel - chargesDeductibles);
                
                // Badge pour le régime
                let badgeHTML = '';
                if (isCurrentRegime && !document.getElementById('force-regime')?.checked) {
                    badgeHTML = '<span class="regime-badge current" style="margin-left: 10px;">Régime actuel</span>';
                }
                
                return `
                    <!-- Carte principale style image 2 -->
                    <div class="best-regime-card" style="background: linear-gradient(135deg, rgba(0, 191, 255, 0.1), rgba(0, 191, 255, 0.05)); 
                                                          border: 2px solid rgba(0, 191, 255, 0.3); 
                                                          border-radius: 20px; 
                                                          padding: 30px; 
                                                          margin: 30px 0;">
                        
                        <!-- Titre avec trophée -->
                        <h2 style="color: #00bfff; font-size: 1.8em; margin-bottom: 30px; text-align: center;">
                            <i class="fas fa-trophy" style="color: #ffd700; margin-right: 10px;"></i>
                            Meilleur régime fiscal : ${regime.nom}
                            ${badgeHTML}
                        </h2>
                        
                        <!-- Cartes métriques principales -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
                            
                            <!-- Cash-flow mensuel -->
                            <div style="background: rgba(255, 255, 255, 0.05); 
                                        border: 1px solid rgba(0, 191, 255, 0.2); 
                                        border-radius: 15px; 
                                        padding: 25px; 
                                        text-align: center;">
                                <h3 style="color: #94a3b8; font-size: 1em; margin-bottom: 10px;">
                                    💸 Cash-flow mensuel
                                </h3>
                                <div class="${cashflowMensuel >= 0 ? 'positive' : 'negative'}" 
                                     style="font-size: 2.5em; font-weight: 700; color: ${cashflowMensuel >= 0 ? '#22c55e' : '#ef4444'};">
                                    ${cashflowMensuel >= 0 ? '+' : '-'}${this.formatCurrency(Math.abs(cashflowMensuel))}
                                </div>
                            </div>
                            
                            <!-- Rendement brut -->
                            <div style="background: rgba(255, 255, 255, 0.05); 
                                        border: 1px solid rgba(0, 191, 255, 0.2); 
                                        border-radius: 15px; 
                                        padding: 25px; 
                                        text-align: center;">
                                <h3 style="color: #94a3b8; font-size: 1em; margin-bottom: 10px;">
                                    📊 Rendement brut / coût total
                                </h3>
                                <div class="${rendementBrut > 4.5 ? 'positive' : rendementBrut < 2.5 ? 'negative' : 'neutral'}"
                                     style="font-size: 2.5em; font-weight: 700; color: ${rendementBrut > 4.5 ? '#22c55e' : rendementBrut < 2.5 ? '#ef4444' : '#00bfff'};">
                                    ${rendementBrut.toFixed(2)} %
                                </div>
                            </div>
                        </div>
                        
                        <!-- Tableau de calcul détaillé style image 2 -->
                        <div style="background: rgba(255, 255, 255, 0.03); 
                                    border: 1px solid rgba(0, 191, 255, 0.15); 
                                    border-radius: 12px; 
                                    padding: 25px; 
                                    margin-top: 30px;">
                            <h3 style="color: #e2e8f0; font-size: 1.2em; margin-bottom: 20px;">
                                <i class="fas fa-clipboard-list"></i> Détail du calcul avec vos données
                            </h3>
                            
                            <table style="width: 100%; border-collapse: collapse;">
                                <tbody>
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 12px 0; color: #94a3b8;">Revenus locatifs annuels (HC):</td>
                                        <td style="padding: 12px 0; text-align: right; color: #22c55e; font-weight: 600;">
                                            +${this.formatCurrency(loyerAnnuel)}
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 12px 0; color: #94a3b8;">Charges déductibles:</td>
                                        <td style="padding: 12px 0; text-align: right; color: #ef4444; font-weight: 600;">
                                            -${this.formatCurrency(chargesDeductibles)}
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 12px 0; color: #94a3b8;">Base imposable:</td>
                                        <td style="padding: 12px 0; text-align: right; color: #e2e8f0; font-weight: 600;">
                                            ${this.formatCurrency(regime.baseImposable || baseImposable)}
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 12px 0; color: #94a3b8;">Impôt (TMI ${inputData.tmi}%):</td>
                                        <td style="padding: 12px 0; text-align: right; color: #ef4444; font-weight: 600;">
                                            -${this.formatCurrency(Math.abs(regime.impotAnnuel || 0))}
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 12px 0; color: #94a3b8;">Mensualité crédit:</td>
                                        <td style="padding: 12px 0; text-align: right; color: #ef4444; font-weight: 600;">
                                            -${this.formatCurrency((inputData.monthlyPayment || 0) * 12)}
                                        </td>
                                    </tr>
                                    <tr style="border-top: 2px solid rgba(0, 191, 255, 0.3); margin-top: 10px;">
                                        <td style="padding: 15px 0; font-weight: 700; color: #e2e8f0; font-size: 1.1em;">
                                            Résultat net annuel:
                                        </td>
                                        <td style="padding: 15px 0; text-align: right; font-weight: 700; font-size: 1.2em; 
                                                   color: ${regime.cashflowNetAnnuel >= 0 ? '#22c55e' : '#ef4444'};">
                                            ${regime.cashflowNetAnnuel >= 0 ? '+' : '-'}${this.formatCurrency(Math.abs(regime.cashflowNetAnnuel))}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <!-- Bouton pour voir encore plus de détails -->
                            <button onclick="toggleFullDetails()" 
                                    style="margin: 20px auto 0; 
                                           display: block; 
                                           background: rgba(0, 191, 255, 0.1); 
                                           border: 1px solid rgba(0, 191, 255, 0.3); 
                                           color: #00bfff; 
                                           padding: 12px 24px; 
                                           border-radius: 8px; 
                                           cursor: pointer; 
                                           font-weight: 500; 
                                           transition: all 0.3s ease;">
                                <i class="fas fa-chevron-down"></i> Voir le détail complet
                            </button>
                        </div>
                        
                        <!-- Avantages du régime -->
                        ${regime.avantages && regime.avantages.length > 0 ? `
                            <div style="margin-top: 30px; padding: 20px; background: rgba(34, 197, 94, 0.05); 
                                        border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 12px;">
                                <h4 style="color: #22c55e; margin-bottom: 15px;">
                                    <i class="fas fa-check-circle"></i> Avantages de ce régime
                                </h4>
                                <ul style="list-style: none; padding: 0; margin: 0;">
                                    ${regime.avantages.map(a => `
                                        <li style="color: #e2e8f0; padding: 5px 0; padding-left: 25px; position: relative;">
                                            <span style="position: absolute; left: 0; color: #22c55e;">✓</span> ${a}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Tableau complet caché (comme dans buildDetailedTable) -->
                    <div id="fullDetailsTable" style="display: none; margin-top: 20px;">
                        ${this.buildDetailedTable ? this.buildDetailedTable(regime, inputData) : ''}
                    </div>
                    
                    <!-- Synthèse comparative avec tous les régimes -->
                    <div class="regime-comparison-grid" style="margin-top: 40px;">
                        <h3 style="color: #e2e8f0; font-size: 1.5em; margin-bottom: 25px; text-align: center;">
                            <i class="fas fa-balance-scale"></i> Synthèse des régimes
                        </h3>
                        
                        <!-- Sélecteur pour changer de régime à visualiser -->
                        <div style="text-align: center; margin-bottom: 20px;">
                            <label style="color: #94a3b8; margin-right: 10px;">Régime actuel :</label>
                            <select id="regime-viewer" onchange="changeRegimeView(this.value)" 
                                    style="background: #0e1b2d; 
                                           border: 1px solid rgba(0, 191, 255, 0.3); 
                                           color: #e2e8f0; 
                                           padding: 8px 15px; 
                                           border-radius: 8px;">
                                ${fiscalResults.map(r => {
                                    const key = r.key || (window.REGIME_KEY_FROM_ID?.[r.id] || r.id);
                                    return `<option value="${key}" ${r.id === regime.id ? 'selected' : ''}>${r.nom}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                            ${allRegimes.slice(0, 3).map((r, index) => {
                                const isBest = index === 0;
                                const isCurrent = r.id === regime.id;
                                const cashflow = r.cashflowMensuel || (r.cashflowNetAnnuel / 12);
                                
                                return `
                                    <div class="regime-result ${isBest ? 'best' : ''}" 
                                         style="background: rgba(255, 255, 255, 0.05); 
                                                border: 2px solid ${isCurrent ? '#00bfff' : 'rgba(0, 191, 255, 0.2)'}; 
                                                border-radius: 15px; 
                                                padding: 20px; 
                                                position: relative;
                                                ${isCurrent ? 'box-shadow: 0 0 20px rgba(0, 191, 255, 0.3);' : ''}">
                                        
                                        ${isBest && !isCurrent ? '<div class="regime-badge" style="position: absolute; top: 10px; right: 10px;">Meilleur</div>' : ''}
                                        ${isCurrent ? '<div class="regime-badge current" style="position: absolute; top: 10px; right: 10px;">Actuel</div>' : ''}
                                        
                                        <div class="regime-name" style="font-size: 1.1em; font-weight: 600; color: #00bfff; margin-bottom: 15px;">
                                            <i class="fas ${r.icone || 'fa-home'}"></i> ${r.nom}
                                        </div>
                                        
                                        <div class="regime-metrics">
                                            <div style="margin: 10px 0;">
                                                <span style="color: #94a3b8; font-size: 0.9em;">Cash-flow net annuel</span>
                                                <div style="font-size: 1.5em; font-weight: 700; 
                                                            color: ${r.cashflowNetAnnuel >= 0 ? '#22c55e' : '#ef4444'};">
                                                    ${r.cashflowNetAnnuel >= 0 ? '+' : '-'}${this.formatCurrency(Math.abs(r.cashflowNetAnnuel))}
                                                </div>
                                            </div>
                                            
                                            <div style="margin: 10px 0;">
                                                <span style="color: #94a3b8; font-size: 0.9em;">Impôts & prélèvements</span>
                                                <div style="font-size: 1.2em; font-weight: 600; color: #e2e8f0;">
                                                    ${this.formatCurrency(Math.abs(r.impotAnnuel || 0))}
                                                </div>
                                            </div>
                                            
                                            <div style="margin: 10px 0;">
                                                <span style="color: #94a3b8; font-size: 0.9em;">Rendement net</span>
                                                <div style="font-size: 1.2em; font-weight: 600; color: #00bfff;">
                                                    ${(r.rendementNet || 0).toFixed(2)}%
                                                </div>
                                            </div>
                                            
                                            <div style="margin: 10px 0;">
                                                <span style="color: #94a3b8; font-size: 0.9em;">Base imposable</span>
                                                <div style="font-size: 1.2em; font-weight: 600; color: #e2e8f0;">
                                                    ${this.formatCurrency(r.baseImposable || 0)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <script>
                        // Fonction pour afficher/masquer les détails complets
                        window.toggleFullDetails = function() {
                            const details = document.getElementById('fullDetailsTable');
                            const btn = event.target;
                            if (details.style.display === 'none') {
                                details.style.display = 'block';
                                btn.innerHTML = '<i class="fas fa-chevron-up"></i> Masquer le détail complet';
                            } else {
                                details.style.display = 'none';
                                btn.innerHTML = '<i class="fas fa-chevron-down"></i> Voir le détail complet';
                            }
                        };
                        
                        // Fonction pour changer de régime visualisé
                        window.changeRegimeView = function(regimeKey) {
                            // Recharger l'analyse avec le nouveau régime forcé
                            if (window.propertyData) {
                                window.propertyData.regimeActuel = regimeKey;
                                document.getElementById('force-regime').checked = true;
                                // Relancer l'analyse
                                if (typeof proceedToFiscalAnalysis === 'function') {
                                    proceedToFiscalAnalysis();
                                }
                            }
                        };
                    </script>
                `;
            };
            
            console.log('✅ Fix appliqué : Affichage détaillé du régime fiscal restauré');
        }
    });
    
})();
