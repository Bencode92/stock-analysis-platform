/**
 * city-comparison.js - Comparateur multi-villes pour l'investissement immobilier
 * Permet de comparer jusqu'à 10 villes simultanément
 */

class CityComparator {
    constructor(simulateur) {
        this.simulateur = simulateur;
        this.selectedCities = new Map();
        this.maxCities = 10;
        this.villesData = window.villeSearchManager?.villesData || null;
        this.init();
    }
    
    init() {
        console.log('🏙️ Initialisation du comparateur multi-villes...');
        
        // Bouton d'activation
        const btnCompare = document.getElementById('btn-compare-cities');
        btnCompare?.addEventListener('click', () => this.togglePanel());
        
        // Recherche multi-villes
        const searchInput = document.getElementById('multi-city-search');
        searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        searchInput?.addEventListener('focus', () => this.showSuggestions());
        
        // Bouton de comparaison
        document.getElementById('btn-launch-comparison')?.addEventListener('click', () => this.runComparison());
        
        // Fermer suggestions au clic ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#multi-city-search') && !e.target.closest('#multi-city-suggestions')) {
                this.hideSuggestions();
            }
        });
    }
    
    togglePanel() {
        const panel = document.getElementById('city-comparison-panel');
        if (panel) {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                panel.classList.add('fade-in');
            }
        }
    }
    
    handleSearch(searchTerm) {
        if (!this.villesData || !searchTerm || searchTerm.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        const matches = this.villesData.villes.filter(ville =>
            ville.nom.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 8);
        
        this.displaySuggestions(matches);
    }
    
    displaySuggestions(villes) {
        const container = document.getElementById('multi-city-suggestions');
        if (!container) return;
        
        container.innerHTML = villes.map(ville => {
            const types = Object.keys(ville.pieces);
            const prices = Object.values(ville.pieces).map(p => p.prix_m2);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            
            return `
                <div class="ville-suggestion" data-ville='${JSON.stringify(ville)}'>
                    <div class="ville-info">
                        <div class="ville-nom">${ville.nom}</div>
                        <div class="ville-dept">Département ${ville.departement}</div>
                    </div>
                    <div class="ville-types-info">
                        <div class="ville-types-count">${types.length} types</div>
                        <div style="color: rgba(255,255,255,0.7);">${minPrice}€ - ${maxPrice}€/m²</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.style.display = 'block';
        
        // Attacher les événements
        container.querySelectorAll('.ville-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                const ville = JSON.parse(el.dataset.ville);
                this.addCity(ville);
            });
        });
    }
    
    showSuggestions() {
        const container = document.getElementById('multi-city-suggestions');
        const searchInput = document.getElementById('multi-city-search');
        if (container && searchInput.value.length >= 2) {
            this.handleSearch(searchInput.value);
        }
    }
    
    hideSuggestions() {
        const container = document.getElementById('multi-city-suggestions');
        if (container) container.style.display = 'none';
    }
    
    addCity(ville) {
        if (this.selectedCities.size >= this.maxCities) {
            alert(`Maximum ${this.maxCities} villes peuvent être comparées`);
            return;
        }
        
        if (this.selectedCities.has(ville.nom)) {
            return;
        }
        
        this.selectedCities.set(ville.nom, ville);
        this.updateCityDisplay();
        
        // Réinitialiser la recherche
        document.getElementById('multi-city-search').value = '';
        this.hideSuggestions();
    }
    
    removeCity(cityName) {
        this.selectedCities.delete(cityName);
        this.updateCityDisplay();
    }
    
    updateCityDisplay() {
        const container = document.getElementById('city-chips');
        const countEl = document.getElementById('city-count');
        const btnLaunch = document.getElementById('btn-launch-comparison');
        
        if (countEl) countEl.textContent = this.selectedCities.size;
        if (btnLaunch) btnLaunch.disabled = this.selectedCities.size === 0;
        
        if (container) {
            container.innerHTML = Array.from(this.selectedCities.entries()).map(([nom, ville]) => `
                <div class="city-chip">
                    ${nom}
                    <span class="remove-chip" data-city="${nom}">
                        <i class="fas fa-times"></i>
                    </span>
                </div>
            `).join('');
            
            // Attacher les événements de suppression
            container.querySelectorAll('.remove-chip').forEach(el => {
                el.addEventListener('click', () => this.removeCity(el.dataset.city));
            });
        }
    }
    
    collectCurrentParams() {
        const formData = {
            apport: parseFloat(document.getElementById('apport')?.value) || 20000,
            taux: parseFloat(document.getElementById('taux')?.value) || 3.5,
            duree: parseFloat(document.getElementById('duree')?.value) || 20,
            calculationMode: document.querySelector('input[name="calculation-mode"]:checked')?.value || 'loyer-mensualite'
        };
        
        // Charger tous les paramètres avancés si disponibles
        const advancedParams = {
            fraisBancairesDossier: parseFloat(document.getElementById('frais-bancaires-dossier')?.value) || 900,
            fraisBancairesCompte: parseFloat(document.getElementById('frais-bancaires-compte')?.value) || 150,
            fraisGarantie: parseFloat(document.getElementById('frais-garantie')?.value) || 1.3709,
            taxeFonciere: parseFloat(document.getElementById('taxe-fonciere')?.value) || 0,
            vacanceLocative: parseFloat(document.getElementById('vacance-locative')?.value) || 0,
            travauxM2: parseFloat(document.getElementById('travaux-m2')?.value) || 400,
            useFixedTravauxPercentage: document.getElementById('travaux-mode-percentage')?.checked ?? true
        };
        
        return { ...formData, ...advancedParams };
    }
    
    async runComparison() {
        console.log('🚀 Lancement de la comparaison multi-villes...');
        
        const btnLaunch = document.getElementById('btn-launch-comparison');
        if (btnLaunch) {
            btnLaunch.disabled = true;
            btnLaunch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcul en cours...';
        }
        
        const results = [];
        const pieceType = document.getElementById('comparison-piece-type')?.value || 'T3';
        const params = this.collectCurrentParams();
        
        // Charger les paramètres dans le simulateur
        this.simulateur.chargerParametres(params);
        
        for (const [nom, ville] of this.selectedCities) {
            const types = pieceType === 'all' ? Object.keys(ville.pieces) : [pieceType];
            
            for (const type of types) {
                if (!ville.pieces[type]) continue;
                
                const result = await this.simulateForCity(ville, type);
                if (result) {
                    results.push({
                        ville: nom,
                        type: type,
                        departement: ville.departement,
                        ...result
                    });
                }
            }
        }
        
        // Trier par loyer net annuel décroissant
        results.sort((a, b) => b.loyerNetAnnuel - a.loyerNetAnnuel);
        
        // Afficher les résultats
        this.displayResults(results);
        
        if (btnLaunch) {
            btnLaunch.disabled = false;
            btnLaunch.innerHTML = '<i class="fas fa-rocket"></i> Lancer la comparaison';
        }
    }
    
    async simulateForCity(ville, type) {
        const pieceData = ville.pieces[type];
        if (!pieceData) return null;
        
        // Sauvegarder les paramètres actuels
        const originalPrixM2 = this.simulateur.params.communs.prixM2;
        const originalLoyerM2 = this.simulateur.params.communs.loyerM2;
        
        // Mettre à jour avec les données de la ville
        this.simulateur.params.communs.prixM2 = pieceData.prix_m2;
        this.simulateur.params.communs.loyerM2 = pieceData.loyer_m2;
        
        try {
            // Simuler pour les deux modes
            const classique = this.simulateur.chercheSurfaceDesc('classique');
            const encheres = this.simulateur.chercheSurfaceDesc('encheres');
            
            // Choisir le meilleur selon le cash-flow
            let best = null;
            let mode = '';
            
            if (!classique && !encheres) return null;
            
            if (!classique) {
                best = encheres;
                mode = 'encheres';
            } else if (!encheres) {
                best = classique;
                mode = 'classique';
            } else {
                // Comparer les cash-flows
                if (encheres.cashFlow > classique.cashFlow) {
                    best = encheres;
                    mode = 'encheres';
                } else {
                    best = classique;
                    mode = 'classique';
                }
            }
            
            if (!best) return null;
            
            return {
                mode: mode,
                surface: best.surface,
                prixAchat: best.prixAchat,
                loyerNetMensuel: best.loyerNet,
                loyerNetAnnuel: best.loyerNet * 12,
                cashFlow: best.cashFlow,
                cashFlowAnnuel: best.cashFlow * 12,
                rendement: best.rendementNet,
                prixM2: pieceData.prix_m2,
                loyerM2: pieceData.loyer_m2,
                mensualite: best.mensualite,
                coutTotal: best.coutTotal
            };
            
        } finally {
            // Restaurer les paramètres originaux
            this.simulateur.params.communs.prixM2 = originalPrixM2;
            this.simulateur.params.communs.loyerM2 = originalLoyerM2;
        }
    }
    
    displayResults(results) {
        const resultsContainer = document.getElementById('comparison-results-container');
        if (!resultsContainer) {
            // Créer le conteneur s'il n'existe pas
            const container = document.createElement('div');
            container.id = 'comparison-results-container';
            container.className = 'mt-6';
            document.getElementById('results')?.appendChild(container) || 
            document.querySelector('.container')?.appendChild(container);
        }
        
        const container = document.getElementById('comparison-results-container');
        
        if (!results || results.length === 0) {
            container.innerHTML = `
                <div class="info-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Aucun résultat trouvé. Vérifiez vos paramètres ou essayez d'autres villes.</p>
                </div>
            `;
            return;
        }
        
        const top3 = results.slice(0, 3);
        
        container.innerHTML = `
            <div class="comparison-results">
                <h3 class="text-2xl font-bold mb-4 text-green-400">
                    <i class="fas fa-trophy"></i> Top 3 des meilleures opportunités
                </h3>
                
                ${top3.map((r, i) => `
                    <div class="result-card ${i === 0 ? 'winner' : ''} mb-4 fade-in-up" style="animation-delay: ${i * 0.1}s;">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h4 class="text-xl font-bold">
                                    ${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} 
                                    ${r.ville} - ${r.type}
                                </h4>
                                <p class="text-sm text-gray-400">Département ${r.departement}</p>
                            </div>
                            <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}">
                                ${r.mode === 'encheres' ? '⚖️ Enchères' : '🏠 Classique'}
                            </span>
                        </div>
                        
                        <div class="grid grid-4 gap-4">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-green-400">${Math.round(r.loyerNetMensuel)}€</p>
                                <p class="text-sm text-gray-400">Loyer net/mois</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xl font-bold">${(r.loyerNetAnnuel/1000).toFixed(1)}k€</p>
                                <p class="text-sm text-gray-400">Loyer net/an</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xl font-bold ${r.cashFlow >= 0 ? 'text-green-400' : 'text-red-400'}">
                                    ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                </p>
                                <p class="text-sm text-gray-400">Cash-flow/mois</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xl font-bold">${r.rendement.toFixed(2)}%</p>
                                <p class="text-sm text-gray-400">Rendement net</p>
                            </div>
                        </div>
                        
                        <div class="mt-4 text-sm text-gray-400 flex justify-between">
                            <span>Surface: ${r.surface.toFixed(1)}m²</span>
                            <span>Prix: ${(r.prixAchat/1000).toFixed(0)}k€</span>
                            <span>Prix/m²: ${r.prixM2}€</span>
                            <span>Mensualité: ${Math.round(r.mensualite)}€</span>
                        </div>
                    </div>
                `).join('')}
                
                ${results.length > 3 ? `
                    <details class="mt-4">
                        <summary class="cursor-pointer text-blue-400 hover:text-blue-300 transition-colors">
                            <i class="fas fa-chevron-down mr-2"></i>
                            Voir tous les résultats (${results.length} simulations)
                        </summary>
                        <div class="mt-4">
                            <table class="comparison-table w-full">
                                <thead>
                                    <tr>
                                        <th>Ville</th>
                                        <th>Type</th>
                                        <th>Mode</th>
                                        <th>Loyer net/mois</th>
                                        <th>Cash-flow</th>
                                        <th>Rendement</th>
                                        <th>Prix</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.slice(3).map(r => `
                                        <tr>
                                            <td>${r.ville}</td>
                                            <td>${r.type}</td>
                                            <td><span class="badge badge-sm ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}">${r.mode}</span></td>
                                            <td class="text-right">${Math.round(r.loyerNetMensuel)}€</td>
                                            <td class="text-right ${r.cashFlow >= 0 ? 'text-green-400' : 'text-red-400'}">${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€</td>
                                            <td class="text-right">${r.rendement.toFixed(2)}%</td>
                                            <td class="text-right">${(r.prixAchat/1000).toFixed(0)}k€</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </details>
                ` : ''}
                
                <div class="mt-6 p-4 bg-blue-900/20 border border-blue-400/20 rounded-lg">
                    <p class="text-sm">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>Note:</strong> Ces résultats sont basés sur vos paramètres actuels 
                        (apport: ${this.formatMontant(this.simulateur.params.base.apport)}, 
                        taux: ${this.simulateur.params.base.taux}%, 
                        durée: ${this.simulateur.params.base.duree} ans).
                        Les calculs prennent en compte tous les frais et charges.
                    </p>
                </div>
            </div>
        `;
        
        // Scroll vers les résultats
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant);
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que le simulateur soit chargé
    if (window.simulateur) {
        window.cityComparator = new CityComparator(window.simulateur);
        console.log('✅ Comparateur multi-villes initialisé');
    } else {
        // Réessayer après un court délai
        setTimeout(() => {
            if (window.simulateur) {
                window.cityComparator = new CityComparator(window.simulateur);
                console.log('✅ Comparateur multi-villes initialisé (retry)');
            } else {
                console.error('❌ Simulateur non trouvé, comparateur non initialisé');
            }
        }, 1000);
    }
});
