/**
 * Script amélioré pour les sélecteurs pays/secteurs
 * Inclut la logique de filtrage et de mise à jour
 */

// Données disponibles pour les filtres
const AVAILABLE_COUNTRIES = [
    { value: 'US', label: '🇺🇸 États-Unis' },
    { value: 'FR', label: '🇫🇷 France' },
    { value: 'DE', label: '🇩🇪 Allemagne' },
    { value: 'UK', label: '🇬🇧 Royaume-Uni' },
    { value: 'JP', label: '🇯🇵 Japon' },
    { value: 'CN', label: '🇨🇳 Chine' },
    { value: 'IN', label: '🇮🇳 Inde' },
    { value: 'CH', label: '🇨🇭 Suisse' },
    { value: 'NL', label: '🇳🇱 Pays-Bas' },
    { value: 'KR', label: '🇰🇷 Corée du Sud' },
    { value: 'TW', label: '🇹🇼 Taiwan' },
    { value: 'SG', label: '🇸🇬 Singapour' },
    { value: 'HK', label: '🇭🇰 Hong Kong' },
    { value: 'SE', label: '🇸🇪 Suède' },
    { value: 'NO', label: '🇳🇴 Norvège' },
    { value: 'DK', label: '🇩🇰 Danemark' },
    { value: 'ES', label: '🇪🇸 Espagne' },
    { value: 'IT', label: '🇮🇹 Italie' },
    { value: 'BE', label: '🇧🇪 Belgique' },
    { value: 'AU', label: '🇦🇺 Australie' },
    { value: 'CA', label: '🇨🇦 Canada' },
    { value: 'BR', label: '🇧🇷 Brésil' },
    { value: 'MX', label: '🇲🇽 Mexique' },
    { value: 'RU', label: '🇷🇺 Russie' },
    { value: 'SA', label: '🇸🇦 Arabie Saoudite' },
    { value: 'AE', label: '🇦🇪 Émirats' },
    { value: 'ZA', label: '🇿🇦 Afrique du Sud' }
];

const AVAILABLE_SECTORS = [
    { value: 'TECH', label: '💻 Technologie' },
    { value: 'FINANCE', label: '🏦 Finance' },
    { value: 'HEALTH', label: '🏥 Santé' },
    { value: 'ENERGY', label: '⚡ Énergie' },
    { value: 'CONSUMER', label: '🛒 Consommation' },
    { value: 'INDUSTRIAL', label: '🏭 Industrie' },
    { value: 'MATERIALS', label: '🏗️ Matériaux' },
    { value: 'REALESTATE', label: '🏢 Immobilier' },
    { value: 'UTILITIES', label: '💡 Services publics' },
    { value: 'TELECOM', label: '📱 Télécoms' },
    { value: 'MEDIA', label: '📺 Médias' },
    { value: 'TRANSPORT', label: '✈️ Transport' },
    { value: 'FOOD', label: '🍕 Alimentation' },
    { value: 'RETAIL', label: '🛍️ Distribution' },
    { value: 'AUTO', label: '🚗 Automobile' },
    { value: 'PHARMA', label: '💊 Pharmacie' },
    { value: 'BIOTECH', label: '🧬 Biotechnologie' },
    { value: 'AEROSPACE', label: '🚀 Aérospatiale' },
    { value: 'DEFENSE', label: '🛡️ Défense' },
    { value: 'LUXURY', label: '💎 Luxe' },
    { value: 'GAMING', label: '🎮 Jeux vidéo' },
    { value: 'CRYPTO', label: '₿ Crypto' },
    { value: 'INSURANCE', label: '🛡️ Assurance' },
    { value: 'EDUCATION', label: '🎓 Éducation' },
    { value: 'HOSPITALITY', label: '🏨 Hôtellerie' }
];

// État des filtres
let activeFilters = {
    top: {
        countries: [],
        sectors: []
    },
    az: {
        countries: [],
        sectors: []
    }
};

// Fonction pour peupler les sélecteurs
function populateSelectors() {
    // Top 10 - Pays
    const topCountrySelect = document.getElementById('top-country-filter');
    if (topCountrySelect) {
        topCountrySelect.innerHTML = '<option disabled>— Pays (multi) —</option>';
        AVAILABLE_COUNTRIES.forEach(country => {
            const option = document.createElement('option');
            option.value = country.value;
            option.textContent = country.label;
            topCountrySelect.appendChild(option);
        });
    }

    // Top 10 - Secteurs
    const topSectorSelect = document.getElementById('top-sector-filter');
    if (topSectorSelect) {
        topSectorSelect.innerHTML = '<option disabled>— Secteur (multi) —</option>';
        AVAILABLE_SECTORS.forEach(sector => {
            const option = document.createElement('option');
            option.value = sector.value;
            option.textContent = sector.label;
            topSectorSelect.appendChild(option);
        });
    }

    // A→Z - Pays
    const azCountrySelect = document.getElementById('az-country-filter');
    if (azCountrySelect) {
        azCountrySelect.innerHTML = '<option disabled>— Pays (multi) —</option>';
        AVAILABLE_COUNTRIES.forEach(country => {
            const option = document.createElement('option');
            option.value = country.value;
            option.textContent = country.label;
            azCountrySelect.appendChild(option);
        });
    }

    // A→Z - Secteurs
    const azSectorSelect = document.getElementById('az-sector-filter');
    if (azSectorSelect) {
        azSectorSelect.innerHTML = '<option disabled>— Secteur (multi) —</option>';
        AVAILABLE_SECTORS.forEach(sector => {
            const option = document.createElement('option');
            option.value = sector.value;
            option.textContent = sector.label;
            azSectorSelect.appendChild(option);
        });
    }
}

// Fonction pour gérer les changements de sélection
function handleSelectionChange(selectId, filterType, section) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const selectedOptions = Array.from(select.selectedOptions)
        .filter(opt => !opt.disabled)
        .map(opt => opt.value);

    activeFilters[section][filterType] = selectedOptions;

    // Mettre à jour le badge de compteur
    updateSelectBadge(selectId, selectedOptions.length);

    // Déclencher l'événement de mise à jour
    if (section === 'top') {
        window.dispatchEvent(new CustomEvent('topFiltersChanged', {
            detail: {
                ...activeFilters.top,
                source: 'facets'
            }
        }));
    } else {
        window.dispatchEvent(new CustomEvent('azFiltersChanged', {
            detail: {
                ...activeFilters.az,
                source: 'facets'
            }
        }));
    }

    // Animation de mise à jour
    select.classList.add('updating');
    setTimeout(() => select.classList.remove('updating'), 500);
}

// Fonction pour mettre à jour le badge de compteur
function updateSelectBadge(selectId, count) {
    const select = document.getElementById(selectId);
    if (!select) return;

    let wrapper = select.parentElement;
    if (!wrapper.classList.contains('select-wrapper')) {
        // Créer le wrapper s'il n'existe pas
        wrapper = document.createElement('div');
        wrapper.className = 'select-wrapper';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
    }

    // Gérer le badge
    let badge = wrapper.querySelector('.select-count');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'select-count';
            wrapper.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

// Fonction pour réinitialiser les filtres
function clearFilters(section) {
    if (section === 'top') {
        const topCountry = document.getElementById('top-country-filter');
        const topSector = document.getElementById('top-sector-filter');
        if (topCountry) topCountry.selectedIndex = -1;
        if (topSector) topSector.selectedIndex = -1;
        activeFilters.top = { countries: [], sectors: [] };
        updateSelectBadge('top-country-filter', 0);
        updateSelectBadge('top-sector-filter', 0);
    } else {
        const azCountry = document.getElementById('az-country-filter');
        const azSector = document.getElementById('az-sector-filter');
        if (azCountry) azCountry.selectedIndex = -1;
        if (azSector) azSector.selectedIndex = -1;
        activeFilters.az = { countries: [], sectors: [] };
        updateSelectBadge('az-country-filter', 0);
        updateSelectBadge('az-sector-filter', 0);
    }

    // Déclencher l'événement de mise à jour
    const eventName = section === 'top' ? 'topFiltersChanged' : 'azFiltersChanged';
    window.dispatchEvent(new CustomEvent(eventName, {
        detail: section === 'top' ? activeFilters.top : activeFilters.az
    }));
}

// Initialisation au chargement
function initEnhancedFilters() {
    // Peupler les sélecteurs
    populateSelectors();

    // Ajouter les gestionnaires d'événements pour Top 10
    const topCountrySelect = document.getElementById('top-country-filter');
    const topSectorSelect = document.getElementById('top-sector-filter');
    const topClearBtn = document.getElementById('top-clear-facets');

    if (topCountrySelect) {
        topCountrySelect.addEventListener('change', () => 
            handleSelectionChange('top-country-filter', 'countries', 'top')
        );
    }

    if (topSectorSelect) {
        topSectorSelect.addEventListener('change', () => 
            handleSelectionChange('top-sector-filter', 'sectors', 'top')
        );
    }

    if (topClearBtn) {
        topClearBtn.addEventListener('click', () => clearFilters('top'));
    }

    // Ajouter les gestionnaires d'événements pour A→Z
    const azCountrySelect = document.getElementById('az-country-filter');
    const azSectorSelect = document.getElementById('az-sector-filter');
    const azClearBtn = document.getElementById('az-clear-facets');

    if (azCountrySelect) {
        azCountrySelect.addEventListener('change', () => 
            handleSelectionChange('az-country-filter', 'countries', 'az')
        );
    }

    if (azSectorSelect) {
        azSectorSelect.addEventListener('change', () => 
            handleSelectionChange('az-sector-filter', 'sectors', 'az')
        );
    }

    if (azClearBtn) {
        azClearBtn.addEventListener('click', () => clearFilters('az'));
    }

    // Support du ctrl+click pour sélection multiple
    [topCountrySelect, topSectorSelect, azCountrySelect, azSectorSelect].forEach(select => {
        if (select) {
            select.addEventListener('mousedown', (e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    e.preventDefault();
                    const option = e.target;
                    if (option.tagName === 'OPTION' && !option.disabled) {
                        option.selected = !option.selected;
                        const event = new Event('change', { bubbles: true });
                        select.dispatchEvent(event);
                    }
                }
            });
        }
    });
}

// Exposer les fonctions globalement
window.activeFilters = activeFilters;
window.clearFilters = clearFilters;

// Initialisation différée pour s'assurer que le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initEnhancedFilters, 200);
    });
} else {
    setTimeout(initEnhancedFilters, 200);
}