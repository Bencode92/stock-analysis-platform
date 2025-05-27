/**
 * city-radar.js - Module de comparaison intelligente des villes
 * Version 2.0 - Interface améliorée avec sélection par villes
 */

class CityRadar {
    constructor() {
        this.villesData = null;
        this.selectedDepartments = new Set();
        this.selectedCities = new Map(); // Pour la sélection individuelle
        this.selectedTypes = new Set(['T2', 'T3']);
        this.topCount = 10;
        this.filterMode = 'all'; // all, departments, cities
        
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
        console.log('🎯 Initialisation du Radar des villes v2.0...');
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
                <div class="card-header" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%);">
                    <div class="card-icon" style="background: linear-gradient(135deg, #6366f1 0%, #ec4899 100%);">
                        <i class="fas fa-chart-radar"></i>
                    </div>
                    <h2 class="card-title">🎯 Radar des villes - Analyse nationale</h2>
                    <button id="btn-back-to-simulator" class="close-panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="radar-content">
                    <!-- Zone géographique avec 3 options -->
                    <div class="filter-section animated-gradient-border">
                        <h3><i class="fas fa-map-marked-alt"></i> Zone de recherche</h3>
                        <div class="geo-tabs">
                            <label class="geo-tab active">
                                <input type="radio" name="geo-filter" value="all" checked>
                                <div class="tab-content">
                                    <i class="fas fa-globe-europe"></i>
                                    <span>Toute la France</span>
                                </div>
                            </label>
                            <label class="geo-tab">
                                <input type="radio" name="geo-filter" value="departments">
                                <div class="tab-content">
                                    <i class="fas fa-map"></i>
                                    <span>Par départements</span>
                                </div>
                            </label>
                            <label class="geo-tab">
                                <input type="radio" name="geo-filter" value="cities">
                                <div class="tab-content">
                                    <i class="fas fa-city"></i>
                                    <span>Par villes</span>
                                </div>
                            </label>
                        </div>
                        
                        <!-- Sélecteur de départements -->
                        <div id="dept-selector" class="mt-3 hidden fade-in">
                            <input type="text" id="dept-search" class="form-input enhanced-input" 
                                   placeholder="Ex: 69, 75, 13 (séparés par virgules)">
                            <div id="selected-depts" class="selected-chips mt-2"></div>
                        </div>
                        
                        <!-- Sélecteur de villes -->
                        <div id="city-selector" class="mt-3 hidden fade-in">
                            <div class="search-container">
                                <input type="text" id="city-search" class="form-input enhanced-input" 
                                       placeholder="Rechercher une ville..." autocomplete="off">
                                <div id="city-suggestions" class="ville-suggestions" style="display: none;"></div>
                            </div>
                            <div id="selected-cities" class="selected-chips mt-2">
                                <span class="text-sm opacity-50">Aucune ville sélectionnée</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Types de biens avec design amélioré -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-home"></i> Types de biens à analyser</h3>
                        <div class="type-selector-grid">
                            ${['T1', 'T2', 'T3', 'T4', 'T5'].map(type => `
                                <label class="type-option-card">
                                    <input type="checkbox" value="${type}" 
                                           ${['T2', 'T3'].includes(type) ? 'checked' : ''}>
                                    <div class="type-card-content">
                                        <div class="type-header">
                                            <span class="type-name">${type}</span>
                                            <div class="type-icon">${this.getTypeIcon(type)}</div>
                                        </div>
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
                    
                    <!-- Critères de tri avec icônes améliorées -->
                    <div class="filter-section mt-4">
                        <h3><i class="fas fa-sort-amount-down"></i> Critère de classement</h3>
                        <div class="sort-options-grid">
                            <label class="sort-option-card active">
                                <input type="radio" name="sort-criteria" value="rentabilite" checked>
                                <div class="sort-card-content">
                                    <i class="fas fa-percentage fa-2x"></i>
                                    <span>Rentabilité</span>
                                </div>
                            </label>
                            <label class="sort-option-card">
                                <input type="radio" name="sort-criteria" value="loyer">
                                <div class="sort-card-content">
                                    <i class="fas fa-coins fa-2x"></i>
                                    <span>Loyer mensuel</span>
                                </div>
                            </label>
                            <label class="sort-option-card">
                                <input type="radio" name="sort-criteria" value="prix">
                                <div class="sort-card-content">
                                    <i class="fas fa-tag fa-2x"></i>
                                    <span>Prix total</span>
                                </div>
                            </label>
                            <label class="sort-option-card">
                                <input type="radio" name="sort-criteria" value="rapport">
                                <div class="sort-card-content">
                                    <i class="fas fa-balance-scale fa-2x"></i>
                                    <span>Loyer/Prix</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Contrôles avec style amélioré -->
                    <div class="control-section mt-4">
                        <div class="control-row">
                            <div class="control-item">
                                <label><i class="fas fa-list-ol"></i> Nombre de résultats</label>
                                <select id="top-count" class="form-input enhanced-select">
                                    <option value="10" selected>Top 10</option>
                                    <option value="20">Top 20</option>
                                    <option value="50">Top 50</option>
                                    <option value="100">Top 100</option>
                                    <option value="all">Tous</option>
                                </select>
                            </div>
                            <div class="control-item">
                                <button id="btn-launch-radar" class="btn btn-primary btn-glow">
                                    <i class="fas fa-satellite-dish"></i>
                                    <span>Lancer l'analyse</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Zone de résultats -->
                    <div id="radar-results" class="mt-6 hidden"></div>
                </div>
            </div>
            
            <style>
                .animated-gradient-border {
                    position: relative;
                    background: linear-gradient(45deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #667eea 100%);
                    background-size: 200% 200%;
                    animation: gradient-animation 5s ease infinite;
                    padding: 2px;
                    border-radius: 12px;
                }
                
                .animated-gradient-border > * {
                    background: var(--card-bg);
                    border-radius: 10px;
                    padding: 1.5rem;
                }
                
                @keyframes gradient-animation {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                
                .geo-tabs {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1rem;
                    margin-top: 1rem;
                }
                
                .geo-tab {
                    position: relative;
                    cursor: pointer;
                }
                
                .geo-tab input {
                    position: absolute;
                    opacity: 0;
                }
                
                .geo-tab .tab-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 1.5rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    transition: all 0.3s ease;
                }
                
                .geo-tab input:checked + .tab-content,
                .geo-tab.active .tab-content {
                    background: var(--primary-gradient);
                    border-color: var(--primary-color);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
                }
                
                .geo-tab .tab-content i {
                    font-size: 2rem;
                    opacity: 0.8;
                }
                
                .enhanced-input {
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    padding: 0.75rem 1rem;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }
                
                .enhanced-input:focus {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }
                
                .type-selector-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }
                
                .type-option-card {
                    position: relative;
                    cursor: pointer;
                }
                
                .type-option-card input {
                    position: absolute;
                    opacity: 0;
                }
                
                .type-card-content {
                    padding: 1rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    transition: all 0.3s ease;
                }
                
                .type-option-card input:checked + .type-card-content {
                    background: rgba(99, 102, 241, 0.1);
                    border-color: var(--primary-color);
                    transform: translateY(-2px);
                }
                
                .type-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                
                .type-name {
                    font-size: 1.25rem;
                    font-weight: 600;
                }
                
                .type-icon {
                    font-size: 1.5rem;
                    opacity: 0.5;
                }
                
                .surface-control {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                .surface-input {
                    width: 60px;
                    padding: 0.25rem 0.5rem;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    text-align: center;
                }
                
                .sort-options-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }
                
                .sort-option-card {
                    position: relative;
                    cursor: pointer;
                }
                
                .sort-option-card input {
                    position: absolute;
                    opacity: 0;
                }
                
                .sort-card-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 1.5rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    transition: all 0.3s ease;
                }
                
                .sort-option-card input:checked + .sort-card-content {
                    background: var(--accent-gradient);
                    border-color: var(--accent-color);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
                }
                
                .control-section {
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin-top: 2rem;
                }
                
                .control-row {
                    display: flex;
                    align-items: flex-end;
                    gap: 2rem;
                    justify-content: space-between;
                }
                
                .control-item {
                    flex: 1;
                }
                
                .control-item label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                }
                
                .enhanced-select {
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    padding: 0.75rem 1rem;
                    border-radius: 8px;
                    width: 100%;
                }
                
                .btn-glow {
                    position: relative;
                    overflow: hidden;
                    padding: 1rem 2rem;
                    font-size: 1.125rem;
                    font-weight: 600;
                    background: var(--primary-gradient);
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
                    transition: all 0.3s ease;
                }
                
                .btn-glow:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 30px rgba(99, 102, 241, 0.6);
                }
                
                .btn-glow::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
                    transition: left 0.5s;
                }
                
                .btn-glow:hover::before {
                    left: 100%;
                }
                
                .selected-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                
                .city-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    background: rgba(99, 102, 241, 0.2);
                    border: 1px solid rgba(99, 102, 241, 0.4);
                    border-radius: 20px;
                    font-size: 0.875rem;
                    animation: chip-in 0.3s ease;
                }
                
                @keyframes chip-in {
                    from {
                        transform: scale(0.8);
                        opacity: 0;
                    }
                    to {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
                
                .city-chip .remove-chip {
                    cursor: pointer;
                    color: rgba(255, 255, 255, 0.6);
                    transition: color 0.2s;
                }
                
                .city-chip .remove-chip:hover {
                    color: #ef4444;
                }
                
                .results-grid {
                    display: grid;
                    gap: 1.5rem;
                    margin-top: 2rem;
                }
                
                .result-card-enhanced {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 1.5rem;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                
                .result-card-enhanced:hover {
                    background: rgba(255, 255, 255, 0.08);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
                }
                
                .rank-badge {
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    width: 60px;
                    height: 60px;
                    background: var(--primary-gradient);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    font-weight: bold;
                    border-radius: 50%;
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.5);
                }
                
                .result-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1rem;
                }
                
                .result-metrics {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }
                
                .metric-item {
                    text-align: center;
                    padding: 0.75rem;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }
                
                .metric-value {
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: var(--primary-color);
                }
                
                .metric-label {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    margin-top: 0.25rem;
                }
                
                .highlight-metric {
                    background: var(--primary-gradient);
                    transform: scale(1.05);
                }
            </style>
        `;
    }
    
    getTypeIcon(type) {
        const icons = {
            T1: '🏠',
            T2: '🏘️',
            T3: '🏡',
            T4: '🏚️',
            T5: '🏛️'
        };
        return icons[type] || '🏠';
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
        
        // Recherche de villes
        const citySearch = document.getElementById('city-search');
        if (citySearch) {
            citySearch.addEventListener('input', (e) => this.handleCitySearch(e.target.value));
            citySearch.addEventListener('focus', () => this.showCitySuggestions());
        }
        
        // Masquer suggestions au clic ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#city-search') && !e.target.closest('#city-suggestions')) {
                this.hideCitySuggestions();
            }
        });
        
        // Types
        document.querySelectorAll('.type-option-card input[type="checkbox"]').forEach(cb => {
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
                // Mettre à jour les styles
                document.querySelectorAll('.sort-option-card').forEach(card => {
                    card.classList.remove('active');
                });
                e.target.closest('.sort-option-card').classList.add('active');
            });
        });
        
        // Top count
        document.getElementById('top-count')?.addEventListener('change', (e) => {
            this.topCount = e.target.value === 'all' ? Infinity : parseInt(e.target.value);
        });
        
        // Lancer analyse
        document.getElementById('btn-launch-radar')?.addEventListener('click', () => this.runAnalysis());
    }
    
    handleGeoFilterChange(value) {
        const deptSelector = document.getElementById('dept-selector');
        const citySelector = document.getElementById('city-selector');
        
        // Masquer tous les sélecteurs
        deptSelector.classList.add('hidden');
        citySelector.classList.add('hidden');
        
        // Réinitialiser les sélections
        this.selectedDepartments.clear();
        this.selectedCities.clear();
        
        // Afficher le bon sélecteur
        if (value === 'departments') {
            deptSelector.classList.remove('hidden');
            this.updateDepartmentDisplay();
        } else if (value === 'cities') {
            citySelector.classList.remove('hidden');
            this.updateCityDisplay();
        }
        
        this.filterMode = value;
        
        // Mettre à jour les styles des tabs
        document.querySelectorAll('.geo-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.querySelector(`input[value="${value}"]`)) {
                tab.classList.add('active');
            }
        });
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
    
    handleCitySearch(searchTerm) {
        if (!this.villesData || !searchTerm || searchTerm.length < 2) {
            this.hideCitySuggestions();
            return;
        }
        
        const matches = this.villesData.villes.filter(ville =>
            ville.nom.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !this.selectedCities.has(ville.nom)
        ).slice(0, 8);
        
        this.displayCitySuggestions(matches);
    }
    
    displayCitySuggestions(villes) {
        const container = document.getElementById('city-suggestions');
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
    
    showCitySuggestions() {
        const searchInput = document.getElementById('city-search');
        if (searchInput && searchInput.value.length >= 2) {
            this.handleCitySearch(searchInput.value);
        }
    }
    
    hideCitySuggestions() {
        const container = document.getElementById('city-suggestions');
        if (container) container.style.display = 'none';
    }
    
    addCity(ville) {
        if (this.selectedCities.size >= 20) {
            alert('Maximum 20 villes peuvent être sélectionnées');
            return;
        }
        
        this.selectedCities.set(ville.nom, ville);
        this.updateCityDisplay();
        
        // Réinitialiser la recherche
        document.getElementById('city-search').value = '';
        this.hideCitySuggestions();
    }
    
    removeCity(cityName) {
        this.selectedCities.delete(cityName);
        this.updateCityDisplay();
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
    
    updateCityDisplay() {
        const container = document.getElementById('selected-cities');
        if (!container) return;
        
        if (this.selectedCities.size === 0) {
            container.innerHTML = '<span class="text-sm opacity-50">Aucune ville sélectionnée</span>';
        } else {
            container.innerHTML = Array.from(this.selectedCities.entries()).map(([nom, ville]) => `
                <div class="city-chip">
                    <span>${nom}</span>
                    <span class="dept-badge" style="font-size: 0.75rem; opacity: 0.7;">${ville.departement}</span>
                    <span class="remove-chip" data-city="${nom}">
                        <i class="fas fa-times"></i>
                    </span>
                </div>
            `).join('');
            
            // Attacher les événements
            container.querySelectorAll('.remove-chip').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeCity(el.dataset.city);
                });
            });
        }
    }
    
    updateSelectedTypes() {
        this.selectedTypes.clear();
        document.querySelectorAll('.type-option-card input[type="checkbox"]:checked').forEach(cb => {
            this.selectedTypes.add(cb.value);
        });
    }
    
    async runAnalysis() {
        const btn = document.getElementById('btn-launch-radar');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Analyse en cours...</span>';
        
        try {
            const filteredCities = this.filterCities();
            
            if (filteredCities.length === 0) {
                this.displayNoResults('Aucune ville ne correspond à vos critères de sélection.');
                return;
            }
            
            const results = [];
            
            for (const ville of filteredCities) {
                for (const type of this.selectedTypes) {
                    if (ville.pieces[type]) {
                        const surface = this.customSurfaces[type];
                        const loyerMensuel = ville.pieces[type].loyer_m2 * surface;
                        const prixTotal = ville.pieces[type].prix_m2 * surface;
                        const rentabilite = (loyerMensuel * 12 / prixTotal) * 100;
                        const rapport = loyerMensuel / (prixTotal / 1000); // Loyer par millier d'euros investi
                        
                        results.push({
                            ville: ville.nom,
                            departement: ville.departement,
                            type,
                            surface,
                            loyerMensuel,
                            prixTotal,
                            rentabilite,
                            rapport,
                            prixM2: ville.pieces[type].prix_m2,
                            loyerM2: ville.pieces[type].loyer_m2
                        });
                    }
                }
            }
            
            this.sortResults(results);
            const topResults = this.topCount === Infinity ? results : results.slice(0, this.topCount);
            this.displayResults(topResults);
            
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> <span>Lancer l\'analyse</span>';
        }
    }
    
    filterCities() {
        if (this.filterMode === 'all') {
            return this.villesData.villes;
        } else if (this.filterMode === 'departments' && this.selectedDepartments.size > 0) {
            return this.villesData.villes.filter(v => 
                this.selectedDepartments.has(v.departement) || 
                this.selectedDepartments.has(v.departement.padStart(2, '0'))
            );
        } else if (this.filterMode === 'cities' && this.selectedCities.size > 0) {
            return Array.from(this.selectedCities.values());
        }
        
        return [];
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
            case 'rapport':
                results.sort((a, b) => b.rapport - a.rapport);
                break;
        }
    }
    
    displayNoResults(message) {
        const container = document.getElementById('radar-results');
        if (!container) return;
        
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="info-message" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
                <div class="text-lg text-red-400 mr-3">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div>
                    <h4 class="font-medium mb-1">Aucun résultat</h4>
                    <p class="text-sm opacity-90">${message}</p>
                </div>
            </div>
        `;
    }
    
    displayResults(results) {
        const container = document.getElementById('radar-results');
        if (!container) return;
        
        container.classList.remove('hidden');
        
        if (results.length === 0) {
            this.displayNoResults('Aucun résultat trouvé. Essayez de modifier vos critères.');
            return;
        }
        
        const critereLabel = {
            'rentabilite': 'Rentabilité',
            'loyer': 'Loyer mensuel',
            'prix': 'Prix total',
            'rapport': 'Loyer/Prix'
        }[this.sortCriteria];
        
        // Affichage en cartes pour le top 5
        const top5 = results.slice(0, 5);
        const remaining = results.slice(5);
        
        container.innerHTML = `
            <div class="results-header" style="text-align: center; margin-bottom: 2rem;">
                <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">
                    <i class="fas fa-trophy"></i> Top ${results.length} - Classement par ${critereLabel}
                </h3>
                <p style="color: var(--text-muted);">
                    Analyse de ${this.filterMode === 'all' ? 'toute la France' : 
                             this.filterMode === 'departments' ? `${this.selectedDepartments.size} département(s)` : 
                             `${this.selectedCities.size} ville(s)`} • 
                    Types: ${Array.from(this.selectedTypes).join(', ')}
                </p>
            </div>
            
            <!-- Top 5 en cartes -->
            <div class="results-grid">
                ${top5.map((r, i) => this.createResultCard(r, i)).join('')}
            </div>
            
            ${remaining.length > 0 ? `
                <!-- Reste en tableau -->
                <details style="margin-top: 2rem;">
                    <summary style="cursor: pointer; color: var(--primary-color); margin-bottom: 1rem;">
                        <i class="fas fa-chevron-down mr-2"></i>
                        Voir les ${remaining.length} autres résultats
                    </summary>
                    <div class="radar-results-table">
                        <table class="comparison-table">
                            <thead>
                                <tr>
                                    <th style="width: 60px;">Rang</th>
                                    <th>Ville</th>
                                    <th style="width: 60px;">Type</th>
                                    <th style="width: 120px;">Loyer/mois</th>
                                    <th style="width: 140px;">Prix total</th>
                                    <th style="width: 100px;">Rentabilité</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${remaining.map((r, i) => `
                                    <tr>
                                        <td class="text-center">${i + 6}</td>
                                        <td>
                                            <strong>${r.ville}</strong>
                                            <span class="dept-badge">${r.departement}</span>
                                        </td>
                                        <td class="text-center">${r.type}</td>
                                        <td class="text-right">
                                            ${Math.round(r.loyerMensuel).toLocaleString()} €
                                        </td>
                                        <td class="text-right">
                                            ${Math.round(r.prixTotal).toLocaleString()} €
                                        </td>
                                        <td class="text-right">
                                            <strong>${r.rentabilite.toFixed(2)}%</strong>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>
            ` : ''}
        `;
    }
    
    createResultCard(result, index) {
        const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
        ];
        
        return `
            <div class="result-card-enhanced fade-in-up" style="animation-delay: ${index * 0.1}s;">
                <div class="rank-badge" style="background: ${gradients[index]};">
                    ${rankEmojis[index]}
                </div>
                
                <div class="result-header">
                    <div>
                        <h4 style="font-size: 1.25rem; margin: 0;">
                            ${result.ville}
                        </h4>
                        <div style="margin-top: 0.5rem;">
                            <span class="badge badge-primary">${result.type}</span>
                            <span class="dept-badge">Dép. ${result.departement}</span>
                        </div>
                    </div>
                </div>
                
                <div class="result-metrics">
                    <div class="metric-item ${this.sortCriteria === 'loyer' ? 'highlight-metric' : ''}">
                        <div class="metric-value">${Math.round(result.loyerMensuel).toLocaleString()}€</div>
                        <div class="metric-label">Loyer/mois</div>
                    </div>
                    <div class="metric-item ${this.sortCriteria === 'prix' ? 'highlight-metric' : ''}">
                        <div class="metric-value">${(result.prixTotal/1000).toFixed(0)}k€</div>
                        <div class="metric-label">Prix total</div>
                    </div>
                    <div class="metric-item ${this.sortCriteria === 'rentabilite' ? 'highlight-metric' : ''}">
                        <div class="metric-value">${result.rentabilite.toFixed(2)}%</div>
                        <div class="metric-label">Rentabilité</div>
                    </div>
                    <div class="metric-item ${this.sortCriteria === 'rapport' ? 'highlight-metric' : ''}">
                        <div class="metric-value">${result.rapport.toFixed(1)}€</div>
                        <div class="metric-label">€/k€ investi</div>
                    </div>
                </div>
                
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted);">
                        <span>${result.surface} m²</span>
                        <span>${result.prixM2}€/m² • ${result.loyerM2}€/m²/mois</span>
                    </div>
                </div>
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
