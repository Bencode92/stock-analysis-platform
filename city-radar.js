/**
 * city-radar.js - Module de comparaison intelligente des villes
 * Version panneau intégré pour immoSim.html
 */

class CityRadar {
    constructor() {
        this.villesData = null;
        this.selectedDepartments = new Set();
        this.selectedTypes = new Set(['T2', 'T3']);
        this.topCount = 10;
        
        this.defaultSurfaces = {
            T1: 30,
            T2: 45,
            T3: 65,
            T4: 85,
            T5: 105
        };
        
        this.customSurfaces = { ...this.defaultSurfaces };
        this.sortCriteria = 'rentabilite';
    }
    
    async init() {
        console.log('🎯 Initialisation du Radar des villes...');
        await this.loadData();
        this.createInterface();
        this.initEvents();
    }
    
    async loadData() {
        try {
            if (window.villeSearchManager?.villesData) {
                this.villesData = window.villeSearchManager.villesData;
            } else {
                const response = await fetch('./data/villes-data.json');
                this.villesData = await response.json();
            }
            console.log('✅ Données chargées:', this.villesData.villes.length, 'villes');
        } catch (error) {
            console.error('❌ Erreur:', error);
        }
    }
    
    createInterface() {
        // Masquer toutes les sections sauf le radar
        this.hideAllSections();
        
        // Afficher la section radar
        let radarSection = document.getElementById('radar-section');
        if (!radarSection) {
            radarSection = document.createElement('div');
            radarSection.id = 'radar-section';
            radarSection.className = 'simulation-section';
            
            const container = document.querySelector('.container');
            const titleElement = document.querySelector('.page-title');
            if (titleElement && titleElement.nextSibling) {
                container.insertBefore(radarSection, titleElement.nextSibling);
            } else {
                container.appendChild(radarSection);
            }
        }
        
        radarSection.style.display = 'block';
        radarSection.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-chart-radar"></i>
                    </div>
                    <h2 class="card-title">Radar des villes - Analyse comparative</h2>
                </div>
                
                <div class="radar-content">
                    <!-- Bouton retour -->
                    <div class="mb-4">
                        <button id="btn-back-to-simulator" class="btn btn-outline">
                            <i class="fas fa-arrow-left"></i> Retour au simulateur
                        </button>
                    </div>
                    
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
                        
                        <div id="dept-selector" class="mt-3 hidden">
                            <input type="text" id="dept-search" class="form-input" 
                                   placeholder="Ex: 69, 75, 13 (séparés par virgules)">
                            <div id="selected-depts" class="selected-chips mt-2"></div>
                        </div>
                    </div>
                    
                    <!-- Types de biens -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-home"></i> Types de biens à analyser</h3>
                        <div class="type-selector">
                            ${['T1', 'T2', 'T3', 'T4', 'T5'].map(type => `
                                <label class="type-option">
                                    <input type="checkbox" value="${type}" 
                                           ${['T2', 'T3'].includes(type) ? 'checked' : ''}>
                                    <div class="type-card">
                                        <span class="type-name">${type}</span>
                                        <div class="surface-control">
                                            <input type="number" class="surface-input" 
                                                   id="surface-${type}" 
                                                   value="${this.defaultSurfaces[type]}" 
                                                   min="10" max="200">
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
                        <select id="top-count" class="form-input" style="width: auto;">
                            <option value="10" selected>Top 10</option>
                            <option value="20">Top 20</option>
                            <option value="50">Top 50</option>
                            <option value="100">Top 100</option>
                        </select>
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
    }
    
    hideAllSections() {
        // Masquer toutes les cartes et sections
        document.querySelectorAll('.card').forEach(card => {
            if (!card.closest('#radar-section')) {
                card.style.display = 'none';
            }
        });
        
        // Masquer les autres panneaux spécifiques
        ['advanced-params', 'city-comparison-panel', 'results', 'comparison-results-container', 
         'scenarios-card', 'cash-flow-explanation'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Masquer les bannières
        document.querySelectorAll('.info-message, .mode-info-banner').forEach(el => {
            el.style.display = 'none';
        });
    }
    
    showSimulatorSections() {
        // Réafficher les sections principales du simulateur
        document.querySelectorAll('.card').forEach(card => {
            if (!card.closest('#radar-section') && 
                !card.closest('#advanced-params') && 
                !card.closest('#city-comparison-panel') &&
                !card.closest('#results')) {
                card.style.display = 'block';
            }
        });
        
        // Réafficher les bannières
        document.querySelectorAll('.info-message, .mode-info-banner').forEach(el => {
            if (!el.closest('#radar-section')) {
                el.style.display = '';
            }
        });
        
        // Masquer la section radar
        const radarSection = document.getElementById('radar-section');
        if (radarSection) radarSection.style.display = 'none';
    }
    
    initEvents() {
        // Bouton retour
        document.getElementById('btn-back-to-simulator')?.addEventListener('click', () => {
            this.showSimulatorSections();
        });
        
        // Géo-filtres
        document.querySelectorAll('input[name="geo-filter"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleGeoFilterChange(e.target.value));
        });
        
        // Départements
        document.getElementById('dept-search')?.addEventListener('input', (e) => {
            this.handleDepartmentInput(e.target.value);
        });
        
        // Types
        document.querySelectorAll('.type-option input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedTypes());
        });
        
        // Surfaces
        document.querySelectorAll('.surface-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.id.replace('surface-', '');
                this.customSurfaces[type] = parseInt(e.target.value) || this.defaultSurfaces[type];
            });
        });
        
        // Tri
        document.querySelectorAll('input[name="sort-criteria"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sortCriteria = e.target.value;
            });
        });
        
        // Top count
        document.getElementById('top-count')?.addEventListener('change', (e) => {
            this.topCount = parseInt(e.target.value);
        });
        
        // Lancer analyse
        document.getElementById('btn-launch-radar')?.addEventListener('click', () => this.runAnalysis());
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
            container.innerHTML = Array.from(this.selectedDepartments).map(dept => 
                `<span class="chip">${dept}</span>`
            ).join('');
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
            const filteredCities = this.filterCities();
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
                            type,
                            surface,
                            loyerMensuel,
                            prixTotal,
                            rentabilite,
                            prixM2: ville.pieces[type].prix_m2,
                            loyerM2: ville.pieces[type].loyer_m2
                        });
                    }
                }
            }
            
            this.sortResults(results);
            this.displayResults(results.slice(0, this.topCount));
            
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
                        <p class="text-sm opacity-90">Essayez de modifier vos critères.</p>
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
        `;
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.cityRadar = new CityRadar();
    
    // Attacher l'événement au bouton Radar des villes
    const btnRadar = document.getElementById('btn-radar-cities');
    if (btnRadar) {
        btnRadar.addEventListener('click', async () => {
            if (!window.cityRadar.villesData) {
                await window.cityRadar.init();
            } else {
                window.cityRadar.createInterface();
                window.cityRadar.initEvents();
            }
        });
    }
});
