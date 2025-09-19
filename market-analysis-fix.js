// market-analysis-fix.js - Patch pour corriger l'affichage de la section 2
(function() {
    'use strict';
    
    // S'assurer que MarketFiscalAnalyzer existe dans window.analyzer
    document.addEventListener('DOMContentLoaded', function() {
        // Créer l'analyzer si pas déjà fait
        if (!window.analyzer && window.MarketFiscalAnalyzer) {
            window.analyzer = new window.MarketFiscalAnalyzer();
            console.log('✅ MarketFiscalAnalyzer initialisé');
        }
        
        // S'assurer que renderMarketAnalysis est disponible globalement
        if (!window.renderMarketAnalysis && typeof renderMarketAnalysis === 'function') {
            window.renderMarketAnalysis = renderMarketAnalysis;
            console.log('✅ renderMarketAnalysis exporté');
        }
        
        // Vérifier que la fonction analyzeMarket existe aussi comme fallback
        if (!window.analyzeMarket) {
            window.analyzeMarket = function(data) {
                console.log('📊 Analyse de marché (fallback):', data);
                
                const resultsDiv = document.querySelector('#section-2 #market-analysis-results');
                if (!resultsDiv) {
                    console.error('❌ Conteneur de résultats introuvable');
                    return;
                }
                
                // Affichage de secours minimal
                const ville = data.ville || {};
                const prixM2 = data.prixM2Paye || (data.prixPaye / data.surface) || 0;
                const loyerM2 = data.loyerM2Actuel || (data.loyerActuel / data.surface) || 0;
                
                resultsDiv.innerHTML = `
                    <div class="market-comparison-card average">
                        <h3 style="color:#e2e8f0;font-size:1.5em;margin-bottom:20px;">
                            <i class="fas fa-chart-line"></i> Analyse de marché
                        </h3>
                        
                        <div class="market-details">
                            <div class="market-metric">
                                <div class="market-metric-label">Prix au m²</div>
                                <div class="market-metric-value">${Math.round(prixM2)} €/m²</div>
                            </div>
                            <div class="market-metric">
                                <div class="market-metric-label">Loyer au m²</div>
                                <div class="market-metric-value">${loyerM2.toFixed(2)} €/m²</div>
                            </div>
                            <div class="market-metric">
                                <div class="market-metric-label">Rendement brut</div>
                                <div class="market-metric-value">
                                    ${data.prixPaye && data.loyerActuel ? 
                                      ((data.loyerActuel * 12 / data.prixPaye) * 100).toFixed(2) + '%' : 
                                      '—'}
                                </div>
                            </div>
                        </div>
                        
                        <div class="recommendations-box" style="margin-top:30px;">
                            <div class="recommendations-title">
                                <i class="fas fa-lightbulb"></i> Recommandations
                            </div>
                            <div class="recommendation-item">
                                <div class="recommendation-icon">
                                    <i class="fas fa-balance-scale"></i>
                                </div>
                                <div class="recommendation-content">
                                    <h4>Optimisation fiscale recommandée</h4>
                                    <p>Passez à l'étape suivante pour découvrir le meilleur régime fiscal.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                console.log('✅ Résultats affichés (mode fallback)');
            };
        }
    });
    
    // Patch pour corriger les caractères Unicode dans br
    window.addEventListener('load', function() {
        // Si br existe avec des propriétés Unicode, les renommer
        if (window.br) {
            if ('loyerMarché' in window.br) {
                window.br.loyerMarche = window.br.loyerMarché;
                delete window.br.loyerMarché;
            }
            if ('mensualité' in window.br) {
                window.br.mensualite = window.br.mensualité;
                delete window.br.mensualité;
            }
            console.log('✅ Propriétés Unicode corrigées dans br');
        }
    });
    
    // Helper pour débugger
    window.debugSection2 = function() {
        console.group('🔍 Debug Section 2');
        
        const s2 = document.getElementById('section-2');
        console.log('1. Section 2 existe:', !!s2);
        if (s2) {
            console.log('   Classes:', s2.className);
            console.log('   Display:', getComputedStyle(s2).display);
            console.log('   Visibility:', getComputedStyle(s2).visibility);
        }
        
        const container = document.querySelector('#section-2 #market-analysis-results');
        console.log('2. Conteneur résultats existe:', !!container);
        if (container) {
            console.log('   HTML actuel:', container.innerHTML.substring(0, 100) + '...');
        }
        
        console.log('3. Fonctions disponibles:');
        console.log('   window.renderMarketAnalysis:', typeof window.renderMarketAnalysis);
        console.log('   window.analyzeMarket:', typeof window.analyzeMarket);
        console.log('   window.analyzer:', !!window.analyzer);
        
        console.log('4. Données propertyData:', window.propertyData);
        
        console.groupEnd();
    };
    
    // Fonction pour forcer l'affichage
    window.forceShowSection2 = function() {
        const s2 = document.getElementById('section-2');
        if (s2) {
            s2.classList.add('active');
            s2.style.display = 'block';
            s2.style.visibility = 'visible';
            s2.style.opacity = '1';
            console.log('✅ Section 2 forcée visible');
        }
        
        const container = document.querySelector('#section-2 #market-analysis-results');
        if (container && !container.innerHTML.trim()) {
            container.innerHTML = `
                <div style="padding:24px;border:2px solid #00bfff;border-radius:10px;background:rgba(0,191,255,0.1)">
                    <h3 style="color:#00bfff;margin-bottom:15px;">
                        <i class="fas fa-info-circle"></i> Analyse en attente
                    </h3>
                    <p style="color:#94a3b8">
                        Remplissez le formulaire et cliquez sur "Analyser mon investissement" pour voir les résultats.
                    </p>
                    <button onclick="debugSection2()" class="btn btn-outline" style="margin-top:15px;">
                        <i class="fas fa-bug"></i> Debug Info
                    </button>
                </div>
            `;
        }
    };
    
    console.log('🔧 market-analysis-fix.js chargé - Tapez debugSection2() ou forceShowSection2() pour diagnostiquer');
    
})();
