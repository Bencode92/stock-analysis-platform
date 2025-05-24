/**
 * city-comparison.js - Comparateur multi-villes pour l'investissement immobilier
 * Permet de comparer jusqu'à 10 villes simultanément
 * Utilise les données de villes-data.json
 */

class CityComparator {
    constructor(simulateur) {
        this.simulateur = simulateur;
        this.selectedCities = new Map();
        this.maxCities = 10;
        this.villesData = null;
        this.init();
    }
    
    async init() {
        console.log('🏙️ Initialisation du comparateur multi-villes...');
        
        // Charger les données des villes
        await this.loadVillesData();
        
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
    
    async loadVillesData() {
        try {
            console.log('📊 Chargement des données des villes pour le comparateur...');
            
            // Essayer d'utiliser les données du villeSearchManager si disponibles
            if (window.villeSearchManager && window.villeSearchManager.villesData) {
                this.villesData = window.villeSearchManager.villesData;
                console.log('✅ Données récupérées depuis villeSearchManager');
            } else {
                // Sinon charger directement
                const response = await fetch('./data/villes-data.json');
                if (!response.ok) {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
                this.villesData = await response.json();
                console.log('✅ Données chargées depuis le fichier');
            }
            
            console.log(`🏠 ${this.villesData.villes.length} villes disponibles pour la comparaison`);
            
        } catch (error) {
            console.warn('⚠️ Erreur lors du chargement des données:', error);
            // Données de test minimales
            this.villesData = {
                villes: [
                    {
                        nom: "Lyon",
                        departement: "69",
                        pieces: {
                            "T1": {prix_m2: 6912, loyer_m2: 19.18},
                            "T2": {prix_m2: 4567, loyer_m2: 17.92},
                            "T3": {prix_m2: 3970, loyer_m2: 14.50}
                        }
                    },
                    {
                        nom: "Paris 10e Arrondissement",
                        departement: "75",
                        pieces: {
                            "T1": {prix_m2: 11945, loyer_m2: 32.08},
                            "T2": {prix_m2: 9315, loyer_m2: 32.08}
                        }
                    }
                ]
            };
        }
    }
    
    togglePanel() {
        const panel = document.getElementById('city-comparison-panel');
        if (panel) {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                panel.classList.add('fade-in');
                // Réinitialiser la recherche
                document.getElementById('multi-city-search').value = '';
                this.hideSuggestions();
            }
        }
    }
    
    handleSearch(searchTerm) {
        if (!this.villesData || !searchTerm || searchTerm.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        const matches = this.villesData.villes.filter(ville =>
            ville.nom.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !this.selectedCities.has(ville.nom) // Ne pas afficher les villes déjà sélectionnées
        ).slice(0, 8);
        
        this.displaySuggestions(matches);
    }
    
    displaySuggestions(villes) {
        const container = document.getElementById('multi-city-suggestions');
        if (!container) return;
        
        if (villes.length === 0) {
            container.innerHTML = `
                <div class="ville-suggestion" style="opacity: 0.6; cursor: default;">
                    <div class="ville-info">
                        <div class="ville-nom">Aucun résultat trouvé</div>
                    </div>
                </div>
            `;
            container.style.display = 'block';
            return;
        }
        
        container.innerHTML = villes.map(ville => {
            const types = Object.keys(ville.pieces);
            const prices = Object.values(ville.pieces).map(p => p.prix_m2);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            
            return `
                <div class="ville-suggestion" data-ville='${JSON.stringify(ville).replace(/'/g, '&apos;')}'>
                    <div class="ville-info">
                        <div class="ville-nom">${ville.nom}</div>
                        <div class="ville-dept">Département ${ville.departement}</div>
                    </div>
                    <div class="ville-types-info">
                        <div class="ville-types-count">${types.length} types</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">
                            ${minPrice.toLocaleString()}€ - ${maxPrice.toLocaleString()}€/m²
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.style.display = 'block';
        
        // Attacher les événements
        container.querySelectorAll('.ville-suggestion').forEach(el => {
            if (!el.textContent.includes('Aucun résultat')) {
                el.addEventListener('click', () => {
                    const ville = JSON.parse(el.dataset.ville.replace(/&apos;/g, "'"));
                    this.addCity(ville);
                });
            }
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
            // Afficher un message plus élégant
            const toast = document.createElement('div');
            toast.className = 'toast toast-warning';
            toast.innerHTML = `
                <div class="toast-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="toast-content">Maximum ${this.maxCities} villes peuvent être comparées</div>
            `;
            document.getElementById('toast-container')?.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
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
            if (this.selectedCities.size === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="width: 100%; text-align: center; padding: 2rem; opacity: 0.5;">
                        <i class="fas fa-city" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                        <p style="margin: 0;">Aucune ville sélectionnée</p>
                    </div>
                `;
            } else {
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
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeCity(el.dataset.city);
                    });
                });
            }
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
                <div class="comparison-results">
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
            return;
        }
        
        const top3 = results.slice(0, 3);
        
        container.innerHTML = `
            <div class="comparison-results">
                <h3>🏆 Top 3 des meilleures opportunités</h3>
                
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
                                <div class="stat-item">
                                    <p class="stat-value">${Math.round(r.loyerNetMensuel)}€</p>
                                    <p class="stat-label">Loyer net/mois</p>
                                </div>
                                <div class="stat-item">
                                    <p class="stat-value ${r.cashFlow >= 0 ? 'positive' : 'negative'}">
                                        ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                    </p>
                                    <p class="stat-label">Cash-flow</p>
                                </div>
                                <div class="stat-item">
                                    <p class="stat-value">${r.surface.toFixed(0)}m²</p>
                                    <p class="stat-label">Surface</p>
                                </div>
                                <div class="stat-item">
                                    <p class="stat-value">${r.rendement.toFixed(2)}%</p>
                                    <p class="stat-label">Rendement</p>
                                </div>
                            </div>
                            
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted);">
                                    <span>Prix: ${(r.prixAchat/1000).toFixed(0)}k€</span>
                                    <span>${r.prixM2}€/m²</span>
                                </div>
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
                                        <th>Loyer net/mois</th>
                                        <th>Cash-flow</th>
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
                                            <td style="text-align: right; font-weight: 600;">${Math.round(r.loyerNetMensuel)}€</td>
                                            <td style="text-align: right; font-weight: 600;" class="${r.cashFlow >= 0 ? 'positive' : 'negative'}">
                                                ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
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
                
                <div class="comparison-results info-message" style="margin-top: 2rem;">
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
                        </p>
                    </div>
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
    const initComparator = () => {
        if (window.simulateur) {
            window.cityComparator = new CityComparator(window.simulateur);
            console.log('✅ Comparateur multi-villes initialisé');
        } else {
            // Réessayer après un court délai
            setTimeout(initComparator, 500);
        }
    };
    
    initComparator();
});
