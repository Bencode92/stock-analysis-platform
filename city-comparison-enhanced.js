/**
 * city-comparison-enhanced.js - Comparateur multi-villes avec intégration fiscale
 * Affiche le cash-flow après impôts selon le régime fiscal sélectionné
 * 
 * v3.0 - Intégration complète avec les régimes fiscaux
 */

class CityComparatorEnhanced {
    constructor(simulateur) {
        this.simulateur = simulateur || window.simulateur || new window.SimulateurImmo();
        this.selectedCities = new Map();
        this.maxCities = 10;
        this.villesData = null;
        this.currentRegimeFiscal = null;
        
        this.init();
    }
    
    async init() {
        console.log('🏙️ Initialisation du comparateur multi-villes amélioré...');
        
        // Charger les données des villes
        await this.loadVillesData();
        
        // Écouter les changements de régime fiscal
        window.addEventListener('regimeFiscalChange', (event) => {
            this.currentRegimeFiscal = event.detail.regime;
            console.log('📊 Régime fiscal mis à jour dans le comparateur:', this.currentRegimeFiscal?.nom);
            
            // Si des résultats sont affichés, les recalculer
            if (document.getElementById('comparison-results-container')?.innerHTML) {
                this.runComparison();
            }
        });
        
        // Initialiser les événements (comme avant)
        const btnCompare = document.getElementById('btn-compare-cities');
        btnCompare?.addEventListener('click', () => this.togglePanel());
        
        const searchInput = document.getElementById('multi-city-search');
        searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        searchInput?.addEventListener('focus', () => this.showSuggestions());
        
        document.getElementById('btn-launch-comparison')?.addEventListener('click', () => this.runComparison());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#multi-city-search') && !e.target.closest('#multi-city-suggestions')) {
                this.hideSuggestions();
            }
        });
    }
    
    // ... (autres méthodes identiques jusqu'à simulateForCity) ...
    
    async simulateForCity(ville, type) {
        const pieceData = ville.pieces[type];
        if (!pieceData) return null;
        
        // 1. Synchroniser TOUS les paramètres actuels du formulaire
        const freshParams = this.collectParamsFromDOM();
        this.simulateur.chargerParametres(freshParams);
        
        // 2. Sauvegarder l'état complet du simulateur
        const originalParams = JSON.parse(JSON.stringify(this.simulateur.params));
        
        // 3. Appliquer SEULEMENT les données spécifiques à la ville
        this.simulateur.params.communs.prixM2 = pieceData.prix_m2;
        this.simulateur.params.communs.loyerM2 = pieceData.loyer_m2;
        
        try {
            // Simuler pour les deux modes
            const classique = this.simulateur.chercheSurfaceDesc('classique');
            const encheres = this.simulateur.chercheSurfaceDesc('encheres');
            
            let best = null;
            let mode = '';
            
            if (!classique && !encheres) {
                console.warn(`⚠️ Aucune solution viable pour ${ville.nom} ${type}`);
                return null;
            }
            
            // Sélection selon le loyer net
            if (!classique) {
                best = encheres;
                mode = 'encheres';
            } else if (!encheres) {
                best = classique;
                mode = 'classique';
            } else {
                if (encheres.loyerNet > classique.loyerNet) {
                    best = encheres;
                    mode = 'encheres';
                } else {
                    best = classique;
                    mode = 'classique';
                }
            }
            
            if (!best) return null;
            
            // NOUVEAU : Calculer l'impact fiscal
            let cashFlowApresImpots = best.cashFlow;
            let impactFiscalAnnuel = 0;
            
            if (this.currentRegimeFiscal) {
                // Récupérer l'impact fiscal depuis les résultats complets
                impactFiscalAnnuel = best.impactFiscal || 0;
                
                // Le cash-flow après impôts = cash-flow brut + impact fiscal (qui peut être positif ou négatif)
                cashFlowApresImpots = best.cashFlow + (impactFiscalAnnuel / 12);
                
                console.log(`💰 ${ville.nom} - Impact fiscal: ${impactFiscalAnnuel.toFixed(0)}€/an, Cash-flow après impôts: ${cashFlowApresImpots.toFixed(0)}€/mois`);
            }
            
            return {
                mode: mode,
                surface: best.surface,
                prixAchat: best.prixAchat,
                loyerNetMensuel: best.loyerNet,
                loyerNetAnnuel: best.loyerNet * 12,
                cashFlow: best.cashFlow,
                cashFlowAnnuel: best.cashFlow * 12,
                // NOUVEAU : Données fiscales
                cashFlowApresImpots: cashFlowApresImpots,
                cashFlowApresImpotsAnnuel: cashFlowApresImpots * 12,
                impactFiscal: impactFiscalAnnuel,
                regimeFiscal: this.currentRegimeFiscal?.nom || 'Non défini',
                // Données existantes
                rendement: best.rendementNet,
                prixM2: pieceData.prix_m2,
                loyerM2: pieceData.loyer_m2,
                mensualite: best.mensualite,
                coutTotal: best.coutTotal
            };
            
        } finally {
            // 4. Restaurer l'état original complet
            this.simulateur.params = JSON.parse(JSON.stringify(originalParams));
        }
    }
    
    displayResults(results) {
        const container = document.getElementById('comparison-results-container') || this.createResultsContainer();
        
        if (!results || results.length === 0) {
            container.innerHTML = `
                <div class="comparison-results">
                    <button class="close-panel" onclick="document.getElementById('comparison-results-container').innerHTML = ''; document.getElementById('comparison-results-container').style.display = 'none';" style="position: absolute; top: 1rem; right: 1rem;">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="info-message">
                        <div class="text-lg text-yellow-400 mr-3">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Aucun résultat trouvé</h4>
                            <p class="text-sm opacity-90">Vérifiez vos paramètres ou essayez d'autres villes.</p>
                        </div>
                    </div>
                </div>
            `;
            container.style.display = 'block';
            return;
        }
        
        // MODIFICATION : Trier par cash-flow après impôts
        results.sort((a, b) => b.cashFlowApresImpots - a.cashFlowApresImpots);
        
        const top3 = results.slice(0, 3);
        
        container.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all" style="position: relative;">
                <button class="close-panel" onclick="document.getElementById('comparison-results-container').innerHTML = ''; document.getElementById('comparison-results-container').style.display = 'none';">
                    <i class="fas fa-times"></i>
                </button>
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <h2 class="card-title">Résultats de la comparaison</h2>
                    ${this.currentRegimeFiscal ? `
                        <span class="badge badge-primary" style="margin-left: 1rem;">
                            <i class="fas fa-landmark"></i> ${this.currentRegimeFiscal.nom}
                        </span>
                    ` : ''}
                </div>
                
                <div class="comparison-results">
                    <h3 style="text-align: center; margin-bottom: 1rem;">
                        🏆 Top 3 des meilleures opportunités
                    </h3>
                    <p style="text-align: center; margin-bottom: 2rem; color: var(--text-muted);">
                        <i class="fas fa-info-circle mr-1"></i>
                        Classement par cash-flow après impôts le plus élevé
                    </p>
                    
                    <div class="city-results-grid">
                        ${top3.map((r, i) => `
                            <div class="result-card ${i === 0 ? 'winner' : ''} fade-in-up" style="animation-delay: ${i * 0.1}s;">
                                <h4>
                                    <i class="fas fa-map-marker-alt"></i>
                                    ${r.ville} - ${r.type}
                                </h4>
                                <p class="text-sm" style="color: var(--text-muted); margin-bottom: 1rem;">
                                    Département ${r.departement}
                                </p>
                                
                                <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}">
                                    ${r.mode === 'encheres' ? '⚖️ Enchères' : '🏠 Classique'}
                                </span>
                                
                                <div class="stats-grid">
                                    <div class="stat-item highlight">
                                        <p class="stat-value">${Math.round(r.loyerNetMensuel)}€</p>
                                        <p class="stat-label">Loyer net/mois</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value ${r.cashFlow >= 0 ? 'positive' : 'negative'}">
                                            ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                        </p>
                                        <p class="stat-label">Cash-flow brut</p>
                                    </div>
                                    <div class="stat-item highlight ${r.cashFlowApresImpots >= 0 ? 'positive' : 'negative'}">
                                        <p class="stat-value">
                                            ${r.cashFlowApresImpots >= 0 ? '+' : ''}${Math.round(r.cashFlowApresImpots)}€
                                        </p>
                                        <p class="stat-label">CF après impôts</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">${r.rendement.toFixed(2)}%</p>
                                        <p class="stat-label">Rendement</p>
                                    </div>
                                </div>
                                
                                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                    <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted);">
                                        <span>Prix: ${(r.prixAchat/1000).toFixed(0)}k€</span>
                                        <span>${r.surface.toFixed(0)}m² • ${r.prixM2}€/m²</span>
                                    </div>
                                    ${r.impactFiscal !== 0 ? `
                                        <div style="margin-top: 0.5rem; font-size: 0.75rem; color: ${r.impactFiscal > 0 ? '#10b981' : '#ef4444'};">
                                            <i class="fas fa-calculator"></i>
                                            Impact fiscal: ${r.impactFiscal > 0 ? '+' : ''}${Math.round(r.impactFiscal)}€/an
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${results.length > 3 ? `
                        <div class="comparison-summary-table" style="margin-top: 2rem;">
                            <details>
                                <summary style="cursor: pointer; color: var(--primary-color); margin-bottom: 1rem;">
                                    <i class="fas fa-chevron-down mr-2"></i>
                                    Voir tous les résultats (${results.length} simulations)
                                </summary>
                                <table class="comparison-table">
                                    <thead>
                                        <tr>
                                            <th>Ville</th>
                                            <th>Type</th>
                                            <th>Mode</th>
                                            <th>Loyer net</th>
                                            <th>Cash-flow brut</th>
                                            <th class="highlight">CF après impôts</th>
                                            <th>Impact fiscal</th>
                                            <th>Rendement</th>
                                            <th>Prix</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${results.slice(3).map((r, idx) => `
                                            <tr>
                                                <td class="city-name-cell">${r.ville}</td>
                                                <td>${r.type}</td>
                                                <td>
                                                    <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}" style="font-size: 0.75rem;">
                                                        ${r.mode === 'encheres' ? 'Enchères' : 'Classique'}
                                                    </span>
                                                </td>
                                                <td style="text-align: right;">${Math.round(r.loyerNetMensuel)}€</td>
                                                <td style="text-align: right;" class="${r.cashFlow >= 0 ? 'positive' : 'negative'}">
                                                    ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                                </td>
                                                <td style="text-align: right; font-weight: 600;" class="highlight ${r.cashFlowApresImpots >= 0 ? 'positive' : 'negative'}">
                                                    ${r.cashFlowApresImpots >= 0 ? '+' : ''}${Math.round(r.cashFlowApresImpots)}€
                                                </td>
                                                <td style="text-align: right;" class="${r.impactFiscal > 0 ? 'positive' : 'negative'}">
                                                    ${r.impactFiscal > 0 ? '+' : ''}${Math.round(r.impactFiscal/12)}€/mois
                                                </td>
                                                <td style="text-align: right;">${r.rendement.toFixed(2)}%</td>
                                                <td style="text-align: right;">${(r.prixAchat/1000).toFixed(0)}k€</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </details>
                        </div>
                    ` : ''}
                    
                    <div class="info-message" style="margin-top: 2rem;">
                        <div class="text-lg text-blue-400 mr-3">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Paramètres utilisés</h4>
                            <p class="text-sm opacity-90">
                                Apport: ${this.formatMontant(this.simulateur.params.base.apport)} • 
                                Taux: ${this.simulateur.params.base.taux}% • 
                                Durée: ${this.simulateur.params.base.duree} ans • 
                                Mode: ${this.simulateur.params.base.calculationMode === 'cashflow-positif' ? 'Cash-flow positif' : 'Loyer ≥ Mensualité'}
                                ${this.currentRegimeFiscal ? ` • Régime fiscal: ${this.currentRegimeFiscal.nom}` : ''}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter un peu de CSS pour le highlight
        const style = document.createElement('style');
        style.textContent = `
            .stat-item.highlight {
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 8px;
            }
            th.highlight, td.highlight {
                background: rgba(59, 130, 246, 0.1) !important;
            }
            .stat-item.positive .stat-value {
                color: #10b981;
            }
            .stat-item.negative .stat-value {
                color: #ef4444;
            }
        `;
        if (!document.head.querySelector('#comparison-highlight-style')) {
            style.id = 'comparison-highlight-style';
            document.head.appendChild(style);
        }
        
        container.style.display = 'block';
        
        // Scroll vers les résultats
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }, 100);
    }
    
    // ... (toutes les autres méthodes restent identiques) ...
}

// Remplacer l'instance existante
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que le simulateur soit chargé
    const initComparator = () => {
        if (window.SimulateurImmo) {
            // Créer une instance du simulateur si elle n'existe pas
            if (!window.simulateur) {
                window.simulateur = new window.SimulateurImmo();
                console.log('✅ Instance SimulateurImmo créée');
            }
            
            // Remplacer l'ancienne instance par la version améliorée
            window.cityComparator = new CityComparatorEnhanced(window.simulateur);
            console.log('✅ Comparateur multi-villes amélioré initialisé');
        } else {
            // Réessayer après un court délai
            setTimeout(initComparator, 500);
        }
    };
    
    initComparator();
});
