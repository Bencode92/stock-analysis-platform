/**
 * city-radar.js - Module de comparaison intelligente des villes
 * Analyse et compare les opportunités d'investissement locatif
 * Version intégrée dans immoSim.html
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
        
        // Pas d'init automatique, attendre l'appel explicite
    }
    
    async init() {
        console.log('🎯 Initialisation du Radar des villes...');
        
        // Charger les données
        await this.loadData();
        
        // Créer l'interface
        this.createInterface();
        
        // Initialiser les événements
        this.initEvents();
        
        console.log('✅ Radar des villes prêt');
    }
    
    async loadData() {
        try {
            // Utiliser les données existantes si disponibles
            if (window.villeSearchManager?.villesData) {
                this.villesData = window.villeSearchManager.villesData;
                console.log('✅ Données récupérées depuis villeSearchManager');
            } else {
                const response = await fetch('./data/villes-data.json');
                this.villesData = await response.json();
                console.log('✅ Données chargées depuis le fichier');
            }
            console.log('📊 Total:', this.villesData.villes.length, 'villes disponibles');
        } catch (error) {
            console.error('❌ Erreur chargement données:', error);
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
                    }
                ]
            };
        }
    }
    
    createInterface() {
        // Vérifier si le conteneur existe déjà
        if (document.getElementById('city-radar-container')) {
            console.log('⚠️ Interface radar déjà créée');
            return;
        }
        
        // Créer le conteneur principal
        const container = document.createElement('div');
        container.id = 'city-radar-container';
        container.className = 'hidden fade-in mt-4';
        container.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-chart-radar"></i>
                    </div>
                    <h2 class="card-title">Radar des villes - Analyse comparative</h2>
                    <button class="close-panel" id="close-radar-panel">
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
                        </div>
                        
                        <!-- Sélecteur départements (caché par défaut) -->
                        <div id="dept-selector" class="mt-3 hidden">
                            <input type="text" id="dept-search" class="form-input" placeholder="Ex: 69, 75, 13...">
                            <div id="selected-depts" class="selected-chips mt-2"></div>
                            <div class="text-sm text-blue-300 mt-2">
                                <i class="fas fa-info-circle mr-1"></i>
                                Séparez par des virgules pour plusieurs départements
                            </div>
                        </div>
                    </div>
                    
                    <!-- Types de biens -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-home"></i> Types de biens à analyser</h3>
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
                    
                    <!-- Nombre de résultats -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-list-ol"></i> Nombre de résultats</h3>
                        <div class="form-group">
                            <select id="top-count" class="form-input" style="width: auto;">
                                <option value="10" selected>Top 10</option>
                                <option value="20">Top 20</option>
                                <option value="50">Top 50</option>
                                <option value="100">Top 100</option>
                            </select>
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
        
        // Trouver où insérer le conteneur
        const insertPoint = document.getElementById('city-comparison-panel') || 
                          document.getElementById('advanced-params') ||
                          document.querySelector('.card');
        
        if (insertPoint && insertPoint.parentNode) {
            insertPoint.parentNode.insertBefore(container, insertPoint.nextSibling);
        } else {
            document.querySelector('.container').appendChild(container);
        }
    }
    
    initEvents() {
        // Bouton de fermeture
        document.getElementById('close-radar-panel')?.addEventListener('click', () => {
            document.getElementById('city-radar-container').classList.add('hidden');
        });
        
        // Filtres géographiques
        document.querySelectorAll('input[name="geo-filter"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleGeoFilterChange(e.target.value));
        });
        
        // Gestion des départements
        document.getElementById('dept-search')?.addEventListener('input', (e) => {
            this.handleDepartmentInput(e.target.value);
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
        
        // Nombre de résultats
        document.getElementById('top-count')?.addEventListener('change', (e) => {
            this.topCount = parseInt(e.target.value);
        });
        
        // Bouton d'analyse
        document.getElementById('btn-launch-radar')?.addEventListener('click', () => this.runAnalysis());
    }
    
    togglePanel() {
        const container = document.getElementById('city-radar-container');
        if (container) {
            container.classList.toggle('hidden');
            if (!container.classList.contains('hidden')) {
                // Scroll vers le radar
                setTimeout(() => {
                    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }
    
    handleGeoFilterChange(value) {
        const deptSelector = document.getElementById('dept-selector');
        
        if (value === 'departments') {
            deptSelector.classList.remove('hidden');
        } else {
            deptSelector.classList.add('hidden');
            this.selectedDepartments.clear();
            this.updateDepartmentDisplay();
        }
    }
    
    handleDepartmentInput(value) {
        // Parse les départements (séparés par virgules)
        const depts = value.split(',').map(d => d.trim()).filter(d => d.length > 0);
        
        this.selectedDepartments.clear();
        depts.forEach(dept => {
            if (/^\d{1,3}$/.test(dept)) {
                this.selectedDepartments.add(dept.padStart(2, '0'));
            }
        });
        
        this.updateDepartmentDisplay();
    }
    
    updateDepartmentDisplay() {
        const container = document.getElementById('selected-depts');
        if (!container) return;
        
        if (this.selectedDepartments.size === 0) {
            container.innerHTML = '<span class="text-sm opacity-50">Aucun département sélectionné</span>';
        } else {
            container.innerHTML = Array.from(this.selectedDepartments).map(dept => `
                <span class="chip">${dept}</span>
            `).join('');
        }
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
            
            console.log(`🔍 Analyse de ${filteredCities.length} villes...`);
            
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
            
            console.log(`✅ ${results.length} résultats trouvés`);
            
            // Afficher les résultats
            this.displayResults(results.slice(0, this.topCount));
            
        } catch (error) {
            console.error('❌ Erreur analyse:', error);
            this.showError('Une erreur est survenue pendant l\'analyse');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Lancer l\'analyse';
        }
    }
    
    filterCities() {
        const geoFilter = document.querySelector('input[name="geo-filter"]:checked')?.value || 'all';
        
        if (geoFilter === 'all') {
            return this.villesData.villes;
        } else if (geoFilter === 'departments' && this.selectedDepartments.size > 0) {
            return this.villesData.villes.filter(v => 
                this.selectedDepartments.has(v.departement) || 
                this.selectedDepartments.has(v.departement.padStart(2, '0'))
            );
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
                    <div class="text-lg text-yellow-400 mr-3">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <div>
                        <h4 class="font-medium mb-1">Aucun résultat trouvé</h4>
                        <p class="text-sm opacity-90">Essayez de modifier vos critères de recherche.</p>
                    </div>
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
                            <th style="width: 60px;">Rang</th>
                            <th>Ville</th>
                            <th style="width: 60px;">Type</th>
                            <th style="width: 80px;">Surface</th>
                            <th style="width: 120px;">Loyer/mois</th>
                            <th style="width: 140px;">Prix total</th>
                            <th style="width: 100px;">Rentabilité</th>
                            <th style="width: 100px;">Prix/m²</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map((r, i) => `
                            <tr class="${i === 0 ? 'winner-row' : ''} ${i < 3 ? 'top-row' : ''}">
                                <td class="rank-cell text-center">
                                    ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                </td>
                                <td>
                                    <strong>${r.ville}</strong>
                                    <span class="dept-badge">${r.departement}</span>
                                </td>
                                <td class="text-center">${r.type}</td>
                                <td class="text-center">${r.surface} m²</td>
                                <td class="text-right ${this.sortCriteria === 'loyer' ? 'highlight' : ''}">
                                    <strong>${Math.round(r.loyerMensuel).toLocaleString()} €</strong>
                                </td>
                                <td class="text-right ${this.sortCriteria === 'prix' ? 'highlight' : ''}">
                                    ${Math.round(r.prixTotal).toLocaleString()} €
                                </td>
                                <td class="text-right ${this.sortCriteria === 'rentabilite' ? 'highlight' : ''}">
                                    <strong>${r.rentabilite.toFixed(2)}%</strong>
                                </td>
                                <td class="text-right text-sm opacity-75">
                                    ${r.prixM2.toLocaleString()} €/m²
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="info-message mt-4">
                <div class="text-lg text-blue-400 mr-3">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div>
                    <p class="text-sm opacity-90">
                        Rentabilité brute calculée sur la base des loyers et prix moyens au m². 
                        Pour une analyse complète avec cash-flow, utilisez le simulateur principal.
                    </p>
                </div>
            </div>
        `;
        
        // Scroll vers les résultats
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
    
    showError(message) {
        const container = document.getElementById('radar-results');
        if (container) {
            container.classList.remove('hidden');
            container.innerHTML = `
                <div class="info-message" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
                    <div class="text-lg text-red-400 mr-3">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div>
                        <h4 class="font-medium mb-1">Erreur</h4>
                        <p class="text-sm opacity-90">${message}</p>
                    </div>
                </div>
            `;
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Chargement du module Radar...');
    
    // Attendre un peu pour que les autres modules soient chargés
    setTimeout(() => {
        // Vérifier si le bouton existe déjà dans immoSim.html
        let btnRadar = document.getElementById('btn-radar-cities');
        
        if (!btnRadar) {
            console.log('⚠️ Bouton radar non trouvé, création automatique...');
            
            // Trouver le bouton de comparaison pour ajouter le radar après
            const btnCompare = document.getElementById('btn-compare-cities');
            if (btnCompare && btnCompare.parentNode) {
                btnRadar = document.createElement('button');
                btnRadar.id = 'btn-radar-cities';
                btnRadar.className = 'btn btn-warning ml-3';
                btnRadar.innerHTML = '<i class="fas fa-chart-radar"></i> Radar des villes';
                btnCompare.parentNode.insertBefore(btnRadar, btnCompare.nextSibling);
            }
        }
        
        if (btnRadar) {
            // Créer l'instance du radar
            window.cityRadar = new CityRadar();
            
            // Initialiser au clic sur le bouton
            btnRadar.addEventListener('click', async () => {
                if (!window.cityRadar.villesData) {
                    await window.cityRadar.init();
                }
                window.cityRadar.togglePanel();
            });
            
            console.log('✅ Module Radar prêt');
        } else {
            console.error('❌ Impossible de créer le bouton Radar');
        }
    }, 1000);
});
