// === FONCTION D'AMÉLIORATION POUR analyzeMarket() ===
// Patch pour améliorer l'affichage du pourcentage sur la barre de position

// Fonction améliorée pour analyser le marché
function analyzeMarketEnhanced(data) {
    const resultsDiv = document.getElementById('market-analysis-results');
    
    if (data.ville) {
        // Analyse avec données de marché
        const marketPriceM2 = data.ville.prix_m2;
        const marketRentM2 = data.ville.loyer_m2;
        
        const priceDiff = ((data.prixM2Paye - marketPriceM2) / marketPriceM2) * 100;
        const rentDiff = ((data.loyerM2Actuel - marketRentM2) / marketRentM2) * 100;
        
        // Déterminer la position sur le marché
        let pricePosition = 'average';
        let rentPosition = 'average';
        
        if (priceDiff < -10) pricePosition = 'low';
        else if (priceDiff > 10) pricePosition = 'high';
        
        if (rentDiff < -10) rentPosition = 'low';
        else if (rentDiff > 10) rentPosition = 'high';
        
        // Déterminer les classes CSS pour le marqueur
        const priceMarkerClass = priceDiff < -15 ? 'good-deal' : priceDiff > 15 ? 'high-price' : '';
        const rentMarkerClass = rentDiff > 15 ? 'good-deal' : rentDiff < -15 ? 'high-price' : '';
        
        resultsDiv.innerHTML = `
            <!-- Analyse du prix d'achat -->
            <div class="market-comparison-card ${pricePosition}">
                <div class="market-badge ${pricePosition}">
                    ${pricePosition === 'low' ? 'Bonne affaire' : pricePosition === 'high' ? 'Prix élevé' : 'Prix du marché'}
                </div>
                
                <h3 style="color: #e2e8f0; font-size: 1.5em; margin-bottom: 20px;">
                    <i class="fas fa-tag"></i> Analyse du prix d'achat
                </h3>
                
                <div class="comparison-input-group">
                    <div class="input-with-label">
                        <label>Votre prix au m²</label>
                        <div style="font-size: 2em; font-weight: 700; color: #e2e8f0;">
                            ${Math.round(data.prixM2Paye)} €/m²
                        </div>
                    </div>
                    <div class="vs-separator">VS</div>
                    <div class="input-with-label">
                        <label>Prix du marché</label>
                        <div style="font-size: 2em; font-weight: 700; color: #00bfff;">
                            ${Math.round(marketPriceM2)} €/m²
                        </div>
                    </div>
                </div>
                
                <div class="position-indicator">
                    <div class="position-marker ${priceMarkerClass}" style="left: ${Math.min(Math.max((priceDiff + 50) * 2, 0), 100)}%;">
                        <div class="position-badge">
                            ${priceDiff > 0 ? '+' : ''}${Math.round(priceDiff)}%
                        </div>
                        <div class="position-tooltip">
                            ${priceDiff > 0 ? 'Au-dessus' : 'En dessous'} du marché de ${Math.abs(Math.round(priceDiff))}%
                        </div>
                    </div>
                </div>
                <div class="position-labels">
                    <span>-50% (Excellente affaire)</span>
                    <span>0% (Prix du marché)</span>
                    <span>+50% (Trop cher)</span>
                </div>
                
                <div class="market-details">
                    <div class="market-metric">
                        <div class="market-metric-label">Prix total payé</div>
                        <div class="market-metric-value">${formatNumber(data.prixPaye)} €</div>
                        <div class="market-metric-comparison">
                            Pour ${data.surface} m² à ${data.ville.ville}
                        </div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Économie/Surcoût</div>
                        <div class="market-metric-value" style="color: ${priceDiff < 0 ? '#22c55e' : '#ef4444'};">
                            ${priceDiff < 0 ? '-' : '+'}${formatNumber(Math.abs(data.prixPaye - (marketPriceM2 * data.surface)))} €
                        </div>
                        <div class="market-metric-comparison">
                            Par rapport au marché
                        </div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Type de bien</div>
                        <div class="market-metric-value">${data.ville.piece}</div>
                        <div class="market-metric-comparison">
                            ${data.ville.departement} - ${data.ville.ville}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Analyse du loyer -->
            <div class="market-comparison-card ${rentPosition}">
                <div class="market-badge ${rentPosition}">
                    ${rentPosition === 'high' ? 'Bon rendement' : rentPosition === 'low' ? 'Loyer faible' : 'Loyer du marché'}
                </div>
                
                <h3 style="color: #e2e8f0; font-size: 1.5em; margin-bottom: 20px;">
                    <i class="fas fa-coins"></i> Analyse du loyer
                </h3>
                
                <div class="comparison-input-group">
                    <div class="input-with-label">
                        <label>Votre loyer au m²</label>
                        <div style="font-size: 2em; font-weight: 700; color: #e2e8f0;">
                            ${data.loyerM2Actuel.toFixed(2)} €/m²
                        </div>
                    </div>
                    <div class="vs-separator">VS</div>
                    <div class="input-with-label">
                        <label>Loyer du marché</label>
                        <div style="font-size: 2em; font-weight: 700; color: #00bfff;">
                            ${marketRentM2.toFixed(2)} €/m²
                        </div>
                    </div>
                </div>
                
                <div class="position-indicator">
                    <div class="position-marker ${rentMarkerClass}" style="left: ${Math.min(Math.max((rentDiff + 50) * 2, 0), 100)}%;">
                        <div class="position-badge">
                            ${rentDiff > 0 ? '+' : ''}${Math.round(rentDiff)}%
                        </div>
                        <div class="position-tooltip">
                            ${rentDiff > 0 ? 'Au-dessus' : 'En dessous'} du marché de ${Math.abs(Math.round(rentDiff))}%
                        </div>
                    </div>
                </div>
                <div class="position-labels">
                    <span>-50% (Trop bas)</span>
                    <span>0% (Loyer du marché)</span>
                    <span>+50% (Excellent)</span>
                </div>
                
                <div class="market-details">
                    <div class="market-metric">
                        <div class="market-metric-label">Loyer mensuel HC</div>
                        <div class="market-metric-value">${formatNumber(data.loyerActuel)} €</div>
                        <div class="market-metric-comparison">
                            Hors charges
                        </div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Potentiel de loyer</div>
                        <div class="market-metric-value">${formatNumber(marketRentM2 * data.surface)} €</div>
                        <div class="market-metric-comparison">
                            Au prix du marché
                        </div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Rendement brut</div>
                        <div class="market-metric-value">${((data.loyerActuel * 12) / data.prixPaye * 100).toFixed(2)}%</div>
                        <div class="market-metric-comparison">
                            Sur votre investissement
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Recommandations -->
            <div class="recommendations-box">
                <div class="recommendations-title">
                    <i class="fas fa-lightbulb"></i>
                    Nos recommandations
                </div>
                
                ${generateRecommendations(pricePosition, rentPosition, data)}
            </div>
        `;
    } else {
        // Analyse sans données de marché (inchangée)
        resultsDiv.innerHTML = `
            <div class="market-comparison-card average">
                <h3 style="color: #e2e8f0; font-size: 1.5em; margin-bottom: 20px;">
                    <i class="fas fa-info-circle"></i> Analyse sans données de marché
                </h3>
                <p style="color: #94a3b8; line-height: 1.6;">
                    Nous n'avons pas de données de marché pour votre ville. 
                    L'analyse se basera uniquement sur les ratios financiers standards.
                </p>
                
                <div class="market-details" style="margin-top: 30px;">
                    <div class="market-metric">
                        <div class="market-metric-label">Prix au m²</div>
                        <div class="market-metric-value">${Math.round(data.prixM2Paye)} €/m²</div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Loyer au m²</div>
                        <div class="market-metric-value">${data.loyerM2Actuel.toFixed(2)} €/m²</div>
                    </div>
                    <div class="market-metric">
                        <div class="market-metric-label">Rendement brut</div>
                        <div class="market-metric-value">${((data.loyerActuel * 12) / data.prixPaye * 100).toFixed(2)}%</div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Remplacer la fonction analyzeMarket par la version améliorée au chargement
if (typeof window !== 'undefined') {
    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Remplacer la fonction existante
            window.analyzeMarket = analyzeMarketEnhanced;
            console.log('✨ Fonction analyzeMarket améliorée avec badge de pourcentage');
        });
    } else {
        // DOM déjà chargé
        window.analyzeMarket = analyzeMarketEnhanced;
        console.log('✨ Fonction analyzeMarket améliorée avec badge de pourcentage');
    }
}

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { analyzeMarketEnhanced };
}
