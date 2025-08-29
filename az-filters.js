/**
 * az-filters.js - Système de filtres pour la section Actions par lettre
 * Indépendant des filtres Top 10
 */

(function() {
    // État des filtres A→Z
    let azSelectedRegions = new Set(['GLOBAL']);
    const REGION_ORDER = ['US','EUROPE','ASIA'];
    const COMBO_MAP = {
        'US,EUROPE': 'US_EUROPE',
        'EUROPE,US': 'US_EUROPE',
        'US,ASIA': 'US_ASIA',
        'ASIA,US': 'US_ASIA',
        'EUROPE,ASIA': 'EUROPE_ASIA',
        'ASIA,EUROPE': 'EUROPE_ASIA'
    };
    
    // Mapping pays par région
    const COUNTRY_BY_REGION = {
        US: ['États-Unis', 'Canada'],
        EUROPE: ['Allemagne', 'France', 'Pays-Bas', 'Suisse', 'Royaume-Uni', 'Italie', 'Espagne', 'Belgique', 'Autriche', 'Suède', 'Norvège', 'Danemark', 'Finlande', 'Irlande', 'Portugal'],
        ASIA: ['Chine', 'Japon', 'Corée du Sud', 'Taïwan', 'Inde', 'Singapour', 'Hong Kong', 'Malaisie', 'Thaïlande', 'Indonésie', 'Philippines', 'Vietnam']
    };
    
    // Liste des secteurs
    const SECTORS = [
        'Technologie',
        'Services financiers',
        'Santé',
        'Industrie',
        'Biens de consommation',
        'Services de consommation',
        'Énergie',
        'Matériaux',
        'Immobilier',
        'Services de communication',
        'Services publics'
    ];
    
    // Initialisation au chargement
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            injectAZFilters();
            setupAZFilterListeners();
            updateCountryDropdown();
            populateSectorDropdown();
        }, 500); // Attendre que la page soit chargée
    });
    
    // Injection du HTML des filtres
    function injectAZFilters() {
        // MODIFIÉ: Chercher le premier glassmorphism card-header dans la section Actions par lettre
        const targetContainer = document.querySelector('.section-title:nth-of-type(2)')?.parentElement?.querySelector('.glassmorphism .card-header');
        
        if (!targetContainer) {
            console.warn('Container pour les filtres A→Z non trouvé, recherche alternative...');
            // Alternative: injecter après le card-header qui contient "Actions globales"
            const cards = document.querySelectorAll('.glassmorphism');
            for (let card of cards) {
                const header = card.querySelector('.card-header h3');
                if (header && header.textContent.includes('Actions globales')) {
                    targetContainer = card.querySelector('.card-header');
                    break;
                }
            }
        }
        
        if (!targetContainer) {
            console.error('Impossible de trouver le conteneur pour les filtres A→Z');
            return;
        }
        
        const filtersHTML = `
            <div class="az-filters-wrapper mt-4 p-4 border border-white/10 rounded-lg">
                <div class="mb-3">
                    <h4 class="text-sm font-semibold text-green-400 mb-2">Filtres géographiques</h4>
                </div>
                
                <!-- Boutons région -->
                <div class="az-region-buttons flex flex-wrap gap-2 mb-4">
                    <button class="az-region-btn active" data-region="GLOBAL">
                        <i class="fas fa-globe mr-1"></i> Global
                    </button>
                    <button class="az-region-btn" data-region="US">
                        <i class="fas fa-flag-usa mr-1"></i> US
                    </button>
                    <button class="az-region-btn" data-region="EUROPE">
                        <i class="fas fa-globe-europe mr-1"></i> Europe
                    </button>
                    <button class="az-region-btn" data-region="ASIA">
                        <i class="fas fa-globe-asia mr-1"></i> Asie
                    </button>
                </div>
                
                <!-- Dropdowns -->
                <div class="grid md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-gray-400 mb-1">Pays:</label>
                        <select id="az-country-filter" class="w-full bg-transparent border border-white/20 rounded px-3 py-2 text-white">
                            <option value="">Tous pays</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-xs text-gray-400 mb-1">Secteur:</label>
                        <select id="az-sector-filter" class="w-full bg-transparent border border-white/20 rounded px-3 py-2 text-white">
                            <option value="">Tous secteurs</option>
                        </select>
                    </div>
                </div>
                
                <!-- Compteur de résultats -->
                <div class="mt-3 text-sm text-gray-400">
                    <span id="az-filter-count">0</span> actions trouvées
                </div>
            </div>
        `;
        
        targetContainer.insertAdjacentHTML('afterend', filtersHTML);
        console.log('✅ Filtres A→Z injectés avec succès');
        
        // Initialiser le compteur après injection
        updateFilterCount();
    }
    
    // Configuration des listeners
    function setupAZFilterListeners() {
        // Boutons région
        const regionButtons = document.querySelectorAll('.az-region-btn');
        regionButtons.forEach(btn => {
            btn.addEventListener('click', handleRegionClick);
        });
        
        // Dropdowns
        const countryFilter = document.getElementById('az-country-filter');
        const sectorFilter = document.getElementById('az-sector-filter');
        
        if (countryFilter) {
            countryFilter.addEventListener('change', filterAZStocks);
        }
        
        if (sectorFilter) {
            sectorFilter.addEventListener('change', filterAZStocks);
        }
    }
    
    // Gestion du clic sur les boutons région
    function handleRegionClick(event) {
        const btn = event.currentTarget;
        const region = btn.dataset.region;
        
        if (region === 'GLOBAL') {
            // GLOBAL est exclusif
            azSelectedRegions.clear();
            azSelectedRegions.add('GLOBAL');
        } else {
            // Retirer GLOBAL si présent
            if (azSelectedRegions.has('GLOBAL')) {
                azSelectedRegions.delete('GLOBAL');
            }
            
            // Toggle la région
            if (azSelectedRegions.has(region)) {
                azSelectedRegions.delete(region);
            } else {
                // Maximum 2 régions
                if (azSelectedRegions.size >= 2) {
                    showToast('Maximum 2 régions simultanément');
                    return;
                }
                azSelectedRegions.add(region);
            }
            
            // Si aucune région sélectionnée, repasser en GLOBAL
            if (azSelectedRegions.size === 0) {
                azSelectedRegions.add('GLOBAL');
            }
        }
        
        updateRegionButtons();
        updateCountryDropdown();
        filterAZStocks();
    }
    
    // Mise à jour visuelle des boutons
    function updateRegionButtons() {
        const buttons = document.querySelectorAll('.az-region-btn');
        buttons.forEach(btn => {
            const region = btn.dataset.region;
            btn.classList.toggle('active', azSelectedRegions.has(region));
        });
    }
    
    // Mise à jour du dropdown pays
    function updateCountryDropdown() {
        const select = document.getElementById('az-country-filter');
        if (!select) return;
        
        const selectedCountries = new Set();
        
        // Collecter les pays selon les régions sélectionnées
        if (azSelectedRegions.has('GLOBAL')) {
            Object.values(COUNTRY_BY_REGION).flat().forEach(c => selectedCountries.add(c));
        } else {
            azSelectedRegions.forEach(region => {
                (COUNTRY_BY_REGION[region] || []).forEach(c => selectedCountries.add(c));
            });
        }
        
        // Sauvegarder la valeur actuelle
        const currentValue = select.value;
        
        // Reconstruire les options
        select.innerHTML = '<option value="">Tous pays</option>';
        [...selectedCountries].sort().forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            select.appendChild(option);
        });
        
        // Restaurer la valeur si elle existe encore
        if ([...selectedCountries].includes(currentValue)) {
            select.value = currentValue;
        }
    }
    
    // Remplir le dropdown secteurs
    function populateSectorDropdown() {
        const select = document.getElementById('az-sector-filter');
        if (!select) return;
        
        select.innerHTML = '<option value="">Tous secteurs</option>';
        SECTORS.forEach(sector => {
            const option = document.createElement('option');
            option.value = sector;
            option.textContent = sector;
            select.appendChild(option);
        });
    }
    
    // Mise à jour du compteur
    function updateFilterCount() {
        let count = 0;
        const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
        
        alphabet.forEach(letter => {
            const tbody = document.getElementById(`${letter}-indices-body`);
            if (tbody) {
                const visibleRows = tbody.querySelectorAll('tr:not(.details-row):not([style*="display: none"])');
                count += visibleRows.length;
            }
        });
        
        const counter = document.getElementById('az-filter-count');
        if (counter) {
            counter.textContent = count;
        }
    }
    
    // Filtrage des actions
    function filterAZStocks() {
        const countryFilter = document.getElementById('az-country-filter')?.value || '';
        const sectorFilter = document.getElementById('az-sector-filter')?.value || '';
        
        let visibleCount = 0;
        
        // Parcourir toutes les lignes de toutes les lettres
        const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
        
        alphabet.forEach(letter => {
            const tbody = document.getElementById(`${letter}-indices-body`);
            if (!tbody) return;
            
            const rows = tbody.querySelectorAll('tr:not(.details-row)');
            let letterHasVisibleRows = false;
            
            rows.forEach(row => {
                // Ignorer les lignes de message (pas de données, etc.)
                if (row.cells.length <= 1) return;
                
                let show = true;
                
                // 1. Filtre région
                const stockRegion = row.dataset.region || extractRegionFromRow(row);
                if (!azSelectedRegions.has('GLOBAL')) {
                    show = azSelectedRegions.has(stockRegion);
                }
                
                // 2. Filtre pays
                if (show && countryFilter) {
                    const stockCountry = row.dataset.country || extractCountryFromRow(row);
                    show = stockCountry === countryFilter;
                }
                
                // 3. Filtre secteur
                if (show && sectorFilter) {
                    const stockSector = row.dataset.sector || extractSectorFromRow(row);
                    show = stockSector === sectorFilter;
                }
                
                row.style.display = show ? '' : 'none';
                
                if (show) {
                    visibleCount++;
                    letterHasVisibleRows = true;
                }
            });
            
            // Masquer/afficher l'onglet de la lettre selon les résultats
            const letterTab = document.querySelector(`.region-tab[data-region="${letter}"]`);
            if (letterTab) {
                letterTab.style.opacity = letterHasVisibleRows ? '1' : '0.3';
            }
        });
        
        // Mettre à jour le compteur
        const counter = document.getElementById('az-filter-count');
        if (counter) {
            counter.textContent = visibleCount;
        }
    }
    
    // Fonctions d'extraction des données depuis les lignes
    function extractRegionFromRow(row) {
        const regionBadge = row.querySelector('[class*="region-"]');
        if (regionBadge) {
            const text = regionBadge.textContent.trim();
            if (text === 'US' || text === 'ÉTATS-UNIS') return 'US';
            if (text === 'EUROPE') return 'EUROPE';
            if (text === 'ASIA' || text === 'ASIE') return 'ASIA';
        }
        return 'GLOBAL';
    }
    
    function extractCountryFromRow(row) {
        const cell = row.cells[0];
        if (!cell) return '';
        
        const textContent = cell.textContent;
        // Extraire le pays depuis le texte de la cellule
        const countryMatch = textContent.match(/(?:US|EUROPE|ASIA)\s+([^[]+)/);
        return countryMatch ? countryMatch[1].trim() : '';
    }
    
    function extractSectorFromRow(row) {
        // Le secteur est dans les détails, mais on peut l'ajouter comme data-attribute
        return '';
    }
    
    // Toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
    
    // Export pour utilisation externe si nécessaire
    window.azFilters = {
        getSelectedRegions: () => azSelectedRegions,
        filterStocks: filterAZStocks
    };
})();
