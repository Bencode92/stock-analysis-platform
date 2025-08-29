/**
 * Patch pour gérer les filtres : simples pour Top 10, avancés pour A→Z
 */

// États pour A→Z avec filtres avancés
window.azScope = 'GLOBAL';
window.azSelectedRegions = new Set(['GLOBAL']);
window.azFilters = {
    countries: new Set(),
    sectors: new Set()
};

// Données de référence pour A→Z
const COUNTRIES_DATA = {
    'US': ['Etats-Unis'],
    'EUROPE': ['Allemagne', 'France', 'Pays-Bas', 'Suisse', 'Royaume-Uni', 'Espagne', 'Italie', 'Belgique'],
    'ASIA': ['Chine', 'Corée', 'Taïwan', 'Inde', 'Japon', 'Singapour']
};

const SECTORS_DATA = [
    'Technologie de l\'information',
    'Biens de consommation cycliques', 
    'Biens de consommation de base',
    'Energie',
    'Finance',
    'Santé',
    'Industrie',
    'Matériaux',
    'La communication',
    'Services publics',
    'Immobilier'
];

// Initialiser les toolbars
function initToolbars() {
    cleanTopToolbar();
    initAZToolbar();
}

// Nettoyer le Top 10 des filtres pays/secteurs
function cleanTopToolbar() {
    const topToolbar = document.getElementById('top-toolbar');
    if (topToolbar) {
        // Retirer uniquement les selects pays et secteurs
        const selects = topToolbar.querySelectorAll('select.pill');
        selects.forEach(select => {
            const label = select.previousElementSibling;
            if (label && (label.textContent.includes('Pays') || label.textContent.includes('Secteurs'))) {
                label.remove();
                select.remove();
            }
        });
    }
}

// Initialiser toolbar A→Z avec filtres avancés
function initAZToolbar() {
    const azBar = document.getElementById('az-toolbar');
    if (!azBar) return;

    setupAdvancedFilters(azBar);
    setupRegionButtons(azBar);
}

function setupAdvancedFilters(container) {
    let filterContainer = container.querySelector('.filter-controls');
    if (!filterContainer) {
        filterContainer = document.createElement('div');
        filterContainer.className = 'filter-controls';
        container.appendChild(filterContainer);
    }

    filterContainer.innerHTML = `
        <div class="filter-row">
            <div class="filter-group">
                <label class="filter-label">Pays:</label>
                <div class="multi-select-wrapper">
                    <button class="multi-select-trigger" data-filter="countries">
                        <span class="selected-text">Tous pays</span>
                        <span class="selected-count"></span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="multi-select-dropdown" data-for="countries">
                        <div class="dropdown-header">
                            <button class="select-all">Tout sélectionner</button>
                            <button class="clear-all">Effacer</button>
                        </div>
                        <div class="dropdown-options"></div>
                    </div>
                </div>
            </div>
            
            <div class="filter-group">
                <label class="filter-label">Secteurs:</label>
                <div class="multi-select-wrapper">
                    <button class="multi-select-trigger" data-filter="sectors">
                        <span class="selected-text">Tous secteurs</span>
                        <span class="selected-count"></span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="multi-select-dropdown" data-for="sectors">
                        <div class="dropdown-header">
                            <button class="select-all">Tout sélectionner</button>
                            <button class="clear-all">Effacer</button>
                        </div>
                        <div class="dropdown-options"></div>
                    </div>
                </div>
            </div>
            
            <button class="action-button reset-filters">
                <i class="fas fa-times"></i> Effacer filtres
            </button>
        </div>
    `;

    // Peupler les options pays
    const countriesDropdown = filterContainer.querySelector('.multi-select-dropdown[data-for="countries"] .dropdown-options');
    const allCountries = [...new Set(Object.values(COUNTRIES_DATA).flat())].sort();
    
    allCountries.forEach(country => {
        const option = document.createElement('label');
        option.className = 'checkbox-option';
        option.innerHTML = `
            <input type="checkbox" value="${country}" data-filter="countries">
            <span>${country}</span>
        `;
        countriesDropdown.appendChild(option);
    });

    // Peupler les options secteurs
    const sectorsDropdown = filterContainer.querySelector('.multi-select-dropdown[data-for="sectors"] .dropdown-options');
    
    SECTORS_DATA.forEach(sector => {
        const option = document.createElement('label');
        option.className = 'checkbox-option';
        option.innerHTML = `
            <input type="checkbox" value="${sector}" data-filter="sectors">
            <span>${sector}</span>
        `;
        sectorsDropdown.appendChild(option);
    });

    setupDropdownEvents(filterContainer);
}

function setupDropdownEvents(container) {
    // Toggle dropdowns
    container.querySelectorAll('.multi-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const filterType = trigger.dataset.filter;
            const dropdown = container.querySelector(`.multi-select-dropdown[data-for="${filterType}"]`);
            
            container.querySelectorAll('.multi-select-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            
            dropdown.classList.toggle('active');
        });
    });

    // Checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const filterType = checkbox.dataset.filter;
            const value = checkbox.value;
            
            if (checkbox.checked) {
                window.azFilters[filterType].add(value);
            } else {
                window.azFilters[filterType].delete(value);
            }
            
            updateFilterDisplay(filterType);
            applyAZFilters();
        });
    });

    // Select all
    container.querySelectorAll('.select-all').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btn.closest('.multi-select-dropdown');
            const filterType = dropdown.dataset.for;
            
            dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
                window.azFilters[filterType].add(cb.value);
            });
            
            updateFilterDisplay(filterType);
            applyAZFilters();
        });
    });

    // Clear all
    container.querySelectorAll('.clear-all').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btn.closest('.multi-select-dropdown');
            const filterType = dropdown.dataset.for;
            
            dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            
            window.azFilters[filterType].clear();
            updateFilterDisplay(filterType);
            applyAZFilters();
        });
    });

    // Reset
    const resetBtn = container.querySelector('.reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            window.azFilters.countries.clear();
            window.azFilters.sectors.clear();
            
            container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            
            updateFilterDisplay('countries');
            updateFilterDisplay('sectors');
            applyAZFilters();
        });
    }

    // Close on outside click
    document.addEventListener('click', () => {
        container.querySelectorAll('.multi-select-dropdown').forEach(d => {
            d.classList.remove('active');
        });
    });
}

function updateFilterDisplay(filterType) {
    const trigger = document.querySelector(`.multi-select-trigger[data-filter="${filterType}"]`);
    if (!trigger) return;
    
    const selectedText = trigger.querySelector('.selected-text');
    const selectedCount = trigger.querySelector('.selected-count');
    const count = window.azFilters[filterType].size;
    
    if (count === 0) {
        selectedText.textContent = filterType === 'countries' ? 'Tous pays' : 'Tous secteurs';
        selectedCount.style.display = 'none';
    } else if (count === 1) {
        selectedText.textContent = [...window.azFilters[filterType]][0];
        selectedCount.style.display = 'none';
    } else {
        selectedText.textContent = `${count} sélectionnés`;
        selectedCount.textContent = count;
        selectedCount.style.display = 'inline-block';
    }
}

function setupRegionButtons(container) {
    const regionBtns = [...container.querySelectorAll('.az-regions .seg-btn')];
    const REGION_ORDER = ['US','EUROPE','ASIA'];
    const COMBO_MAP = {
        'US,EUROPE':'US_EUROPE',
        'US,ASIA':'US_ASIA',
        'EUROPE,ASIA':'EUROPE_ASIA'
    };

    function computeAzScope() {
        if (window.azSelectedRegions.has('GLOBAL') || window.azSelectedRegions.size === 0) return 'GLOBAL';
        if (window.azSelectedRegions.size === 1) return [...window.azSelectedRegions][0];
        const arr = [...window.azSelectedRegions].sort((a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
        return COMBO_MAP[`${arr[0]},${arr[1]}`] || 'GLOBAL';
    }

    regionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const region = btn.dataset.region;

            if (region === 'GLOBAL') {
                window.azSelectedRegions = new Set(['GLOBAL']);
                regionBtns.forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
            } else {
                if (window.azSelectedRegions.has('GLOBAL')) {
                    window.azSelectedRegions.delete('GLOBAL');
                    container.querySelector('.seg-btn[data-region="GLOBAL"]').setAttribute('aria-selected','false');
                }
                
                if (window.azSelectedRegions.has(region)) {
                    window.azSelectedRegions.delete(region);
                    btn.setAttribute('aria-selected','false');
                } else {
                    if (window.azSelectedRegions.size >= 2) {
                        btn.style.animation = 'pulse .3s';
                        setTimeout(() => btn.style.animation = '', 300);
                        return;
                    }
                    window.azSelectedRegions.add(region);
                    btn.setAttribute('aria-selected','true');
                }
                
                if (window.azSelectedRegions.size === 0) {
                    window.azSelectedRegions.add('GLOBAL');
                    container.querySelector('.seg-btn[data-region="GLOBAL"]').setAttribute('aria-selected','true');
                }
            }
            
            window.azScope = computeAzScope();
            applyAZFilters();
        });
    });
}

function applyAZFilters() {
    window.dispatchEvent(new CustomEvent('azFiltersChanged', {
        detail: { 
            scope: window.azScope, 
            regions: [...window.azSelectedRegions],
            countries: [...window.azFilters.countries],
            sectors: [...window.azFilters.sectors]
        }
    }));
}

// Event listener
window.addEventListener('azFiltersChanged', function(e) {
    if (typeof window.loadAZDataWithFilters === 'function') {
        window.loadAZDataWithFilters(e.detail);
    } else if (typeof window.loadAZDataForCurrentSelection === 'function') {
        window.loadAZDataForCurrentSelection(true);
    }
});

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initToolbars, 100);
    });
} else {
    setTimeout(initToolbars, 100);
}