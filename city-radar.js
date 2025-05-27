/**
 * city-radar.js - Module de comparaison intelligente des villes
 * Analyse et compare les opportunités d'investissement locatif
 */

class CityRadar {
    constructor() {
        this.villesData = null;
        this.selectedDepartments = new Set();
        this.selectedTypes = new Set(['T2', 'T3']); // Par défaut
        this.topCount = 10;
        
        // Surfaces moyennes par défaut
        this.defaultSurfaces = {
            T1: 30,
            T2: 45,
            T3: 65,
            T4: 85,
            T5: 105
        };
        
        // Surfaces personnalisées par l'utilisateur
        this.customSurfaces = { ...this.defaultSurfaces };
        
        // Critère de tri actuel
        this.sortCriteria = 'rentabilite'; // 'loyer', 'prix', 'rentabilite'
        
        this.init();
    }
    
    async init() {
        console.log('🎯 Initialisation du Radar des villes...');
        
        // Charger les données
        await this.loadData();
        
        // Créer l'interface si elle n'existe pas
        if (!document.getElementById('city-radar-container')) {
            this.createInterface();
        }
        
        // Initialiser les événements
        this.initEvents();
    }
    
    async loadData() {
        try {
            // Utiliser les données existantes si disponibles
            if (window.villeSearchManager?.villesData) {
                this.villesData = window.villeSearchManager.villesData;
            } else {
                const response = await fetch('./data/villes-data.json');
                this.villesData = await response.json();
            }
            console.log('✅ Données chargées:', this.villesData.villes.length, 'villes');
        } catch (error) {
            console.error('❌ Erreur chargement données:', error);
        }
    }
    
    createInterface() {
        // Créer le conteneur principal après le bouton
        const btnRadar = document.getElementById('btn-city-radar');
        if (!btnRadar) return;
        
        const container = document.createElement('div');
        container.id = 'city-radar-container';
        container.className = 'hidden fade-in';
        container.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-radar"></i>
                    </div>
                    <h2 class="card-title">Radar des villes - Comparateur intelligent</h2>
                    <button class="close-panel" onclick="document.getElementById('city-radar-container').classList.add('hidden')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="radar-content">
                    <!-- Filtres géographiques -->
                    <div class="filter-section">
                        <h3><i class="fas fa-map-marked-alt"></i> Zone géographique</h3>
                        <div class="filter-options">
                            <label class="radio-option">
                                <input type="radio" name="geo-filter" value="all" checked>
                                <span>Toute la France</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="geo-filter" value="departments">
                                <span>Par départements</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="geo-filter" value="cities">
                                <span>Villes spécifiques</span>
                            </label>
                        </div>
                        
                        <!-- Sélecteur départements (caché par défaut) -->
                        <div id="dept-selector" class="mt-3 hidden">
                            <input type="text" id="dept-search" class="form-input" placeholder="Tapez un numéro de département...">
                            <div id="selected-depts" class="selected-chips mt-2"></div>
                        </div>
                        
                        <!-- Sélecteur villes (caché par défaut) -->
                        <div id="city-selector" class="mt-3 hidden">
                            <input type="text" id="city-search" class="form-input" placeholder="Rechercher une ville...">
                            <div id="city-suggestions" class="ville-suggestions"></div>
                            <div id="selected-cities" class="selected-chips mt-2"></div>
                        </div>
                    </div>
                    
                    <!-- Types de biens -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-home"></i> Types de biens</h3>
                        <div class="type-selector">
                            ${['T1', 'T2', 'T3', 'T4', 'T5'].map(type => `
                                <label class="type-option">
                                    <input type="checkbox" value="${type}" ${['T2', 'T3'].includes(type) ? 'checked' : ''}>
                                    <div class="type-card">
                                        <span class="type-name">${type}</span>
                                        <div class="surface-control">
                                            <input type="number" class="surface-input" id="surface-${type}" 
                                                   value="${this.defaultSurfaces[type]}" min="10" max="200">
                                            <span>m²</span>
                                        </div>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Critères de tri -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-sort-amount-down"></i> Classer par</h3>
                        <div class="sort-options">
                            <label class="radio-option">
                                <input type="radio" name="sort-criteria" value="rentabilite" checked>
                                <span><i class="fas fa-percentage"></i> Meilleure rentabilité</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="sort-criteria" value="loyer">
                                <span><i class="fas fa-euro-sign"></i> Loyer le plus élevé</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="sort-criteria" value="prix">
                                <span><i class="fas fa-tag"></i> Prix le plus bas</span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Bouton de lancement -->
                    <div class="text-center mt-4">
                        <button id="btn-launch-radar" class="btn btn-primary">
                            <i class="fas fa-satellite-dish"></i> Lancer l'analyse
                        </button>
                    </div>
                    
                    <!-- Résultats -->
                    <div id="radar-results" class="mt-6 hidden"></div>
                </div>
            </div>
        `;
        
        // Insérer après le panel de comparaison existant
        const comparisonPanel = document.getElementById('city-comparison-panel');
        if (comparisonPanel && comparisonPanel.parentNode) {
            comparisonPanel.parentNode.insertBefore(container, comparisonPanel.nextSibling);
        } else {
            document.querySelector('.container').appendChild(container);
        }
    }
    
    initEvents() {
        // Bouton d'ouverture
        const btnRadar = document.getElementById('btn-city-radar');
        if (btnRadar) {
            btnRadar.addEventListener('click', () => this.togglePanel());
        }
        
        // Filtres géographiques
        document.querySelectorAll('input[name="geo-filter"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleGeoFilterChange(e.target.value));
        });
        
        // Types de biens
        document.querySelectorAll('.type-option input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedTypes());
        });
        
        // Surfaces personnalisées
        document.querySelectorAll('.surface-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.id.replace('surface-', '');
                this.customSurfaces[type] = parseInt(e.target.value) || this.defaultSurfaces[type];
            });
        });
        
        // Critères de tri
        document.querySelectorAll('input[name="sort-criteria"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sortCriteria = e.target.value;
            });
        });
        
        // Bouton d'analyse
        document.getElementById('btn-launch-radar')?.addEventListener('click', () => this.runAnalysis());
    }
    
    togglePanel() {
        const container = document.getElementById('city-radar-container');
        if (container) {
            container.classList.toggle('hidden');
        }
    }
    
    handleGeoFilterChange(value) {
        // Masquer tous les sélecteurs
        document.getElementById('dept-selector').classList.add('hidden');
        document.getElementById('city-selector').classList.add('hidden');
        
        // Afficher le sélecteur approprié
        if (value === 'departments') {
            document.getElementById('dept-selector').classList.remove('hidden');
        } else if (value === 'cities') {
            document.getElementById('city-selector').classList.remove('hidden');
        }
        
        // Réinitialiser les sélections
        this.selectedDepartments.clear();
        document.getElementById('selected-depts').innerHTML = '';
        document.getElementById('selected-cities').innerHTML = '';
    }
    
    updateSelectedTypes() {
        this.selectedTypes.clear();
        document.querySelectorAll('.type-option input[type="checkbox"]:checked').forEach(cb => {
            this.selectedTypes.add(cb.value);
        });
    }
    
    async runAnalysis() {
        const btn = document.getElementById('btn-launch-radar');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyse en cours...';
        
        try {
            // Filtrer les villes selon les critères
            const filteredCities = this.filterCities();
            
            // Calculer les métriques pour chaque combinaison ville/type
            const results = [];
            
            for (const ville of filteredCities) {
                for (const type of this.selectedTypes) {
                    if (ville.pieces[type]) {
                        const surface = this.customSurfaces[type];
                        const loyerMensuel = ville.pieces[type].loyer_m2 * surface;
                        const prixTotal = ville.pieces[type].prix_m2 * surface;
                        const rentabilite = (loyerMensuel * 12 / prixTotal) * 100;
                        
                        results.push({
                            ville: ville.nom,
                            departement: ville.departement,
                            type: type,
                            surface: surface,
                            loyerMensuel: loyerMensuel,
                            prixTotal: prixTotal,
                            rentabilite: rentabilite,
                            prixM2: ville.pieces[type].prix_m2,
                            loyerM2: ville.pieces[type].loyer_m2
                        });
                    }
                }
            }
            
            // Trier selon le critère sélectionné
            this.sortResults(results);
            
            // Afficher les résultats (top 10)
            this.displayResults(results.slice(0, this.topCount));
            
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Lancer l\'analyse';
        }
    }
    
    filterCities() {
        const geoFilter = document.querySelector('input[name="geo-filter"]:checked').value;
        
        if (geoFilter === 'all') {
            return this.villesData.villes;
        } else if (geoFilter === 'departments' && this.selectedDepartments.size > 0) {
            return this.villesData.villes.filter(v => this.selectedDepartments.has(v.departement));
        } else if (geoFilter === 'cities') {
            // À implémenter avec la liste des villes sélectionnées
            return this.villesData.villes;
        }
        
        return this.villesData.villes;
    }
    
    sortResults(results) {
        switch (this.sortCriteria) {
            case 'rentabilite':
                results.sort((a, b) => b.rentabilite - a.rentabilite);
                break;
            case 'loyer':
                results.sort((a, b) => b.loyerMensuel - a.loyerMensuel);
                break;
            case 'prix':
                results.sort((a, b) => a.prixTotal - b.prixTotal);
                break;
        }
    }
    
    displayResults(results) {
        const container = document.getElementById('radar-results');
        if (!container) return;
        
        container.classList.remove('hidden');
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="info-message">
                    <i class="fas fa-info-circle"></i>
                    <span>Aucun résultat trouvé avec ces critères.</span>
                </div>
            `;
            return;
        }
        
        const critereLabel = {
            'rentabilite': 'Rentabilité',
            'loyer': 'Loyer mensuel',
            'prix': 'Prix total'
        }[this.sortCriteria];
        
        container.innerHTML = `
            <h3 class="text-center mb-4">
                <i class="fas fa-trophy"></i> Top ${results.length} - Classement par ${critereLabel}
            </h3>
            
            <div class="radar-results-table">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th>Rang</th>
                            <th>Ville</th>
                            <th>Type</th>
                            <th>Surface</th>
                            <th>Loyer estimé</th>
                            <th>Prix estimé</th>
                            <th>Rentabilité</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map((r, i) => `
                            <tr class="${i === 0 ? 'winner-row' : ''}">
                                <td class="rank-cell">
                                    ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                </td>
                                <td>
                                    <strong>${r.ville}</strong>
                                    <span class="dept-badge">${r.departement}</span>
                                </td>
                                <td>${r.type}</td>
                                <td>${r.surface} m²</td>
                                <td class="highlight-${this.sortCriteria === 'loyer' ? 'primary' : 'secondary'}">
                                    ${Math.round(r.loyerMensuel)} €/mois
                                </td>
                                <td class="highlight-${this.sortCriteria === 'prix' ? 'primary' : 'secondary'}">
                                    ${Math.round(r.prixTotal).toLocaleString()} €
                                </td>
                                <td class="highlight-${this.sortCriteria === 'rentabilite' ? 'primary' : 'secondary'}">
                                    <strong>${r.rentabilite.toFixed(2)}%</strong>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4 text-center">
                <button class="btn btn-outline" onclick="window.cityRadar.exportResults()">
                    <i class="fas fa-download"></i> Exporter les résultats
                </button>
            </div>
        `;
    }
    
    exportResults() {
        // À implémenter : export CSV/Excel
        console.log('Export des résultats...');
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Ajouter le bouton Radar dans l'interface existante
    const btnCompare = document.getElementById('btn-compare-cities');
    if (btnCompare) {
        const btnRadar = document.createElement('button');
        btnRadar.id = 'btn-city-radar';
        btnRadar.className = 'btn btn-accent ml-3';
        btnRadar.innerHTML = '<i class="fas fa-radar"></i> Radar des villes';
        btnCompare.parentNode.insertBefore(btnRadar, btnCompare.nextSibling);
    }
    
    // Initialiser le module
    window.cityRadar = new CityRadar();
});