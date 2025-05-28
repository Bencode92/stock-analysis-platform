/**
 * immo-fixes-fiscalite.js - Correction du bug d'affichage du cash-flow après impôt
 * 
 * Ce script corrige le problème où le cash-flow après impôt reste figé à -199€
 * pour tous les régimes fiscaux.
 */

(function() {
    // Attendre que le DOM et les modules soient chargés
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🔧 Application du fix pour l\'affichage du cash-flow après impôt...');
        
        // Surcharger la fonction mettreAJourElementsFiscauxParMode
        const checkInterval = setInterval(function() {
            if (window.ImmoExtensions && window.simulateur) {
                clearInterval(checkInterval);
                
                // Sauvegarder la fonction originale
                const originalMettreAJourElementsFiscauxParMode = window.mettreAJourElementsFiscauxParMode;
                
                // Nouvelle fonction qui met aussi à jour le footer
                window.mettreAJourElementsFiscauxParMode = function(mode, resultats, regimeLabel) {
                    // Appeler la fonction originale si elle existe
                    if (typeof originalMettreAJourElementsFiscauxParMode === 'function') {
                        originalMettreAJourElementsFiscauxParMode.call(this, mode, resultats, regimeLabel);
                    }
                    
                    // Mettre à jour AUSSI les valeurs dans le footer de la carte
                    if (resultats && resultats.fiscalDetail) {
                        const impactFiscal = Number(resultats.impactFiscal) || 0;
                        const cashFlow = Number(resultats.cashFlow) || 0;
                        const cashFlowApresImpot = cashFlow + (impactFiscal / 12);
                        
                        // Mettre à jour le cash-flow dans le footer
                        const cashflowFooter = document.getElementById(`${mode}-cashflow`);
                        if (cashflowFooter && cashflowFooter.parentNode) {
                            const parent = cashflowFooter.parentNode;
                            const label = parent.querySelector('.results-label');
                            
                            // Si c'est déjà le cash-flow après impôt, mettre à jour directement
                            if (label && label.textContent.includes('après impôt')) {
                                cashflowFooter.textContent = formaterMontantMensuel(cashFlowApresImpot);
                                cashflowFooter.className = cashFlowApresImpot >= 0 ? 'positive' : 'negative';
                            } else if (label) {
                                // Sinon, changer le label et la valeur
                                label.textContent = 'Cash-flow après impôt';
                                cashflowFooter.textContent = formaterMontantMensuel(cashFlowApresImpot);
                                cashflowFooter.className = cashFlowApresImpot >= 0 ? 'positive' : 'negative';
                            }
                        }
                        
                        // Mettre aussi à jour la marge si elle existe
                        const margeElement = document.getElementById(`${mode}-marge`);
                        if (margeElement && margeElement.parentNode) {
                            const parent = margeElement.parentNode;
                            const label = parent.querySelector('.results-label');
                            if (label) {
                                // Calculer la marge après impôt
                                const loyerNet = Number(resultats.loyerNet) || 0;
                                const mensualite = Number(resultats.mensualite) || 0;
                                const margeApresImpot = loyerNet - mensualite + (impactFiscal / 12);
                                
                                label.textContent = 'Marge après impôt';
                                margeElement.textContent = formaterMontantMensuel(margeApresImpot);
                                margeElement.className = margeApresImpot >= 0 ? 'positive' : 'negative';
                            }
                        }
                        
                        // Mettre à jour le cash-flow annuel aussi
                        const cashflowAnnuelEl = document.querySelector(`#${mode}-cashflow-annuel`);
                        if (cashflowAnnuelEl) {
                            cashflowAnnuelEl.textContent = formaterMontant(cashFlowApresImpot * 12) + '/an';
                            cashflowAnnuelEl.className = cashFlowApresImpot >= 0 ? 'positive' : 'negative';
                        }
                    }
                };
                
                console.log('✅ Fix appliqué avec succès');
                
                // Si des résultats existent déjà, les mettre à jour
                if (window.simulateur && window.simulateur.params.resultats.classique) {
                    window.mettreAJourAffichageFiscal && window.mettreAJourAffichageFiscal();
                }
            }
        }, 100);
        
        // Timeout de sécurité
        setTimeout(() => clearInterval(checkInterval), 10000);
    });
    
    // Fonction utilitaire pour formater les montants
    function formaterMontantMensuel(montant) {
        if (window.formaterMontantMensuel) {
            return window.formaterMontantMensuel(montant);
        }
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant) + '/mois';
    }
    
    function formaterMontant(montant) {
        if (window.formaterMontant) {
            return window.formaterMontant(montant);
        }
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant);
    }
})();
