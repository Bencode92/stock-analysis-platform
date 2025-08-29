/**
 * Sélecteurs pays/secteurs INTELLIGENTS - Approche dynamique
 * Extraction automatique depuis les données, filtrage contextuel
 */

// État global des filtres et données
const FilterState = {
    // Filtres actifs
    top: {
        regions: new Set(['GLOBAL']),
        countries: new Set(),
        sectors: new Set()
    },
    az: {
        regions: new Set(['GLOBAL']),
        countries: new Set(),
        sectors: new Set()
    },
    
    // Données extraites dynamiquement
    data: {
        regions: new Map(), // région -> Set de pays
        countries: new Map(), // pays -> Set de secteurs
        sectors: new Set(),
        allStocks: []
    },
    
    // État de chargement
    loading: false,
    initialized: false
};

/**
 * Extraction intelligente des données géographiques depuis les stocks
 */
async function extractGeoData() {
    if (FilterState.loading || FilterState.initialized) return;
    FilterState.loading = true;
    
    try {
        // Charger toutes les sources de données
        const sources = [
            { file: 'data/stocks_us.json', region: 'US' },
            { file: 'data/stocks_europe.json', region: 'EUROPE' },
            { file: 'data/stocks_asia.json', region: 'ASIA' }
        ];
        
        const allStocks = [];
        const regionMap = new Map();
        const countryMap = new Map();
        const sectorsSet = new Set();
        
        for (const source of sources) {
            try {
                const response = await fetch(source.file);
                if (!response.ok) continue;
                
                const data = await response.json();
                if (!data?.stocks) continue;
                
                const regionCountries = new Set();
                
                data.stocks.forEach(stock => {
                    // Enrichir avec région
                    stock.region = source.region;
                    
                    // Extraction intelligente du pays
                    let country = stock.country;
                    if (!country) {
                        // Déduction depuis exchange ou autres indices
                        const exchange = stock.exchange?.toLowerCase() || '';
                        const name = stock.name?.toLowerCase() || '';
                        
                        if (source.region === 'US') {
                            country = '🇺🇸 États-Unis';
                        } else if (source.region === 'EUROPE') {
                            if (exchange.includes('london') || exchange.includes('lse')) country = '🇬🇧 UK';
                            else if (exchange.includes('paris') || exchange.includes('euronext')) country = '🇫🇷 France';
                            else if (exchange.includes('frankfurt') || exchange.includes('xetra')) country = '🇩🇪 Allemagne';
                            else if (exchange.includes('milan')) country = '🇮🇹 Italie';
                            else if (exchange.includes('madrid')) country = '🇪🇸 Espagne';
                            else if (exchange.includes('amsterdam')) country = '🇳🇱 Pays-Bas';
                            else if (exchange.includes('swiss') || exchange.includes('six')) country = '🇨🇭 Suisse';
                            else if (exchange.includes('stockholm')) country = '🇸🇪 Suède';
                            else if (exchange.includes('copenhagen')) country = '🇩🇰 Danemark';
                            else if (exchange.includes('oslo')) country = '🇳🇴 Norvège';
                            else country = '🇪🇺 Europe';
                        } else if (source.region === 'ASIA') {
                            if (exchange.includes('tokyo') || exchange.includes('japan')) country = '🇯🇵 Japon';
                            else if (exchange.includes('shanghai') || exchange.includes('shenzhen') || exchange.includes('china')) country = '🇨🇳 Chine';
                            else if (exchange.includes('hong') || exchange.includes('hkex')) country = '🇭🇰 Hong Kong';
                            else if (exchange.includes('korea') || exchange.includes('kospi')) country = '🇰🇷 Corée';
                            else if (exchange.includes('taiwan')) country = '🇹🇼 Taiwan';
                            else if (exchange.includes('singapore') || exchange.includes('sgx')) country = '🇸🇬 Singapour';
                            else if (exchange.includes('india') || exchange.includes('nse') || exchange.includes('bse')) country = '🇮🇳 Inde';
                            else if (exchange.includes('australia') || exchange.includes('asx')) country = '🇦🇺 Australie';
                            else country = '🌏 Asie';
                        }
                    }
                    stock.country = country;
                    
                    // Extraction intelligente du secteur
                    let sector = stock.sector;
                    if (!sector) {
                        const name = stock.name?.toLowerCase() || '';
                        const ticker = stock.ticker?.toLowerCase() || '';
                        
                        // Détection par mots-clés
                        if (name.includes('bank') || name.includes('financial') || name.includes('capital')) {
                            sector = '🏦 Finance';
                        } else if (name.includes('tech') || name.includes('software') || name.includes('semi') || name.includes('microsoft') || name.includes('apple')) {
                            sector = '💻 Technologie';
                        } else if (name.includes('pharma') || name.includes('health') || name.includes('medical') || name.includes('bio')) {
                            sector = '🏥 Santé';
                        } else if (name.includes('energy') || name.includes('oil') || name.includes('gas') || name.includes('petroleum')) {
                            sector = '⚡ Énergie';
                        } else if (name.includes('retail') || name.includes('consumer') || name.includes('amazon') || name.includes('walmart')) {
                            sector = '🛒 Consommation';
                        } else if (name.includes('industrial') || name.includes('manufacturing') || name.includes('machinery')) {
                            sector = '🏭 Industrie';
                        } else if (name.includes('real estate') || name.includes('reit') || name.includes('property')) {
                            sector = '🏢 Immobilier';
                        } else if (name.includes('telecom') || name.includes('communication')) {
                            sector = '📱 Télécoms';
                        } else if (name.includes('auto') || name.includes('motor') || name.includes('tesla') || name.includes('volkswagen')) {
                            sector = '🚗 Automobile';
                        } else if (name.includes('aerospace') || name.includes('defense') || name.includes('boeing') || name.includes('airbus')) {
                            sector = '✈️ Aérospatiale';
                        } else if (name.includes('material') || name.includes('chemical') || name.includes('mining')) {
                            sector = '⚒️ Matériaux';
                        } else if (name.includes('utility') || name.includes('electric') || name.includes('water')) {
                            sector = '💡 Services publics';
                        } else {
                            sector = '📊 Autres';
                        }
                    }
                    stock.sector = sector;
                    
                    // Ajouter aux collections
                    regionCountries.add(country);
                    sectorsSet.add(sector);
                    
                    // Ajouter au mapping pays -> secteurs
                    if (!countryMap.has(country)) {
                        countryMap.set(country, new Set());
                    }
                    countryMap.get(country).add(sector);
                    
                    allStocks.push(stock);
                });
                
                regionMap.set(source.region, regionCountries);
                
            } catch (err) {
                console.warn(`Erreur chargement ${source.file}:`, err);
            }
        }
        
        // Ajouter une option GLOBAL qui contient tous les pays
        const allCountries = new Set();
        regionMap.forEach(countries => {
            countries.forEach(c => allCountries.add(c));
        });
        regionMap.set('GLOBAL', allCountries);
        
        // Stocker les données extraites
        FilterState.data = {
            regions: regionMap,
            countries: countryMap,
            sectors: sectorsSet,
            allStocks: allStocks
        };
        
        FilterState.initialized = true;
        console.log('✅ Données géographiques extraites:', {
            régions: regionMap.size,
            pays: countryMap.size,
            secteurs: sectorsSet.size,
            stocks: allStocks.length
        });
        
    } catch (err) {
        console.error('❌ Erreur extraction données:', err);
    } finally {
        FilterState.loading = false;
    }
}

/**
 * Créer les sélecteurs de façon dynamique
 */
function createDynamicSelectors(section) {
    const container = document.getElementById(`${section}-facets-container`);
    if (!container) {
        console.warn(`Container ${section}-facets-container non trouvé`);
        return;
    }
    
    container.innerHTML = `
        <div class="pills facets-pills" role="group" aria-label="Filtres ${section === 'top' ? 'Top 10' : 'A→Z'}">
            <div class="select-wrapper">
                <select id="${section}-country-filter" class="pill mini-select" multiple aria-label="Pays">
                    <option disabled>— Chargement pays... —</option>
                </select>
            </div>
            <div class="select-wrapper">
                <select id="${section}-sector-filter" class="pill mini-select" multiple aria-label="Secteur">
                    <option disabled>— Chargement secteurs... —</option>
                </select>
            </div>
            <button id="${section}-clear-facets" class="action-button" aria-label="Réinitialiser">
                <i class="fas fa-times"></i> Effacer
            </button>
        </div>
    `;
}

/**
 * Mettre à jour les options selon la région active
 */
function updateSelectorsForRegion(section) {
    const activeRegions = FilterState[section].regions;
    const countrySelect = document.getElementById(`${section}-country-filter`);
    const sectorSelect = document.getElementById(`${section}-sector-filter`);
    
    if (!countrySelect || !sectorSelect) return;
    
    // Déterminer les pays disponibles selon les régions actives
    const availableCountries = new Set();
    activeRegions.forEach(region => {
        const countries = FilterState.data.regions.get(region);
        if (countries) {
            countries.forEach(c => availableCountries.add(c));
        }
    });
    
    // Trier les pays
    const sortedCountries = Array.from(availableCountries).sort((a, b) => {
        // Retirer les emojis pour le tri
        const cleanA = a.replace(/[^\w\s]/gi, '').trim();
        const cleanB = b.replace(/[^\w\s]/gi, '').trim();
        return cleanA.localeCompare(cleanB);
    });
    
    // Mettre à jour le sélecteur pays
    countrySelect.innerHTML = `
        <option disabled>— Pays (${sortedCountries.length}) —</option>
        ${sortedCountries.map(country => 
            `<option value="${country}">${country}</option>`
        ).join('')}
    `;
    
    // Mettre à jour le sélecteur secteurs
    const sortedSectors = Array.from(FilterState.data.sectors).sort();
    sectorSelect.innerHTML = `
        <option disabled>— Secteurs (${sortedSectors.length}) —</option>
        ${sortedSectors.map(sector => 
            `<option value="${sector}">${sector}</option>`
        ).join('')}
    `;
    
    // Restaurer les sélections précédentes si elles existent encore
    Array.from(FilterState[section].countries).forEach(country => {
        const option = countrySelect.querySelector(`option[value="${country}"]`);
        if (option) option.selected = true;
    });
    
    Array.from(FilterState[section].sectors).forEach(sector => {
        const option = sectorSelect.querySelector(`option[value="${sector}"]`);
        if (option) option.selected = true;
    });
    
    // Mettre à jour les badges
    updateSelectBadge(`${section}-country-filter`, FilterState[section].countries.size);
    updateSelectBadge(`${section}-sector-filter`, FilterState[section].sectors.size);
}

/**
 * Gérer les changements de sélection
 */
function handleFacetChange(selectId, section, filterType) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const selectedOptions = Array.from(select.selectedOptions)
        .filter(opt => !opt.disabled)
        .map(opt => opt.value);
    
    FilterState[section][filterType] = new Set(selectedOptions);
    
    updateSelectBadge(selectId, selectedOptions.length);
    
    // Émettre l'événement de mise à jour
    window.dispatchEvent(new CustomEvent(`${section}FiltersChanged`, {
        detail: {
            regions: Array.from(FilterState[section].regions),
            countries: Array.from(FilterState[section].countries),
            sectors: Array.from(FilterState[section].sectors),
            source: 'dynamic-facets'
        }
    }));
}

/**
 * Badge de compteur sur les sélecteurs
 */
function updateSelectBadge(selectId, count) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    let wrapper = select.parentElement;
    if (!wrapper.classList.contains('select-wrapper')) return;
    
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

/**
 * Réinitialiser les filtres
 */
function clearFacets(section) {
    FilterState[section].countries.clear();
    FilterState[section].sectors.clear();
    
    const countrySelect = document.getElementById(`${section}-country-filter`);
    const sectorSelect = document.getElementById(`${section}-sector-filter`);
    
    if (countrySelect) countrySelect.selectedIndex = -1;
    if (sectorSelect) sectorSelect.selectedIndex = -1;
    
    updateSelectBadge(`${section}-country-filter`, 0);
    updateSelectBadge(`${section}-sector-filter`, 0);
    
    window.dispatchEvent(new CustomEvent(`${section}FiltersChanged`, {
        detail: {
            regions: Array.from(FilterState[section].regions),
            countries: [],
            sectors: [],
            source: 'dynamic-facets'
        }
    }));
}

/**
 * Initialisation principale
 */
async function initDynamicFilters() {
    console.log('🔄 Initialisation des filtres dynamiques...');
    
    // D'abord extraire les données
    await extractGeoData();
    
    // Créer les sélecteurs pour Top 10
    const topToolbar = document.querySelector('.tp-toolbar');
    if (topToolbar) {
        console.log('📍 Toolbar Top 10 trouvée');
        
        // Vérifier si le conteneur existe déjà
        let topContainer = document.getElementById('top-facets-container');
        if (!topContainer) {
            topContainer = document.createElement('div');
            topContainer.id = 'top-facets-container';
            topContainer.className = 'facets-container';
            
            // Insérer après les boutons de région
            const topRegions = topToolbar.querySelector('.tp-regions');
            if (topRegions && topRegions.nextSibling) {
                topToolbar.insertBefore(topContainer, topRegions.nextSibling);
            } else {
                topToolbar.appendChild(topContainer);
            }
        }
        
        // Créer les sélecteurs
        createDynamicSelectors('top');
        updateSelectorsForRegion('top');
        
        // Event listeners pour Top 10
        const topCountrySelect = document.getElementById('top-country-filter');
        const topSectorSelect = document.getElementById('top-sector-filter');
        const topClearBtn = document.getElementById('top-clear-facets');
        
        if (topCountrySelect) {
            topCountrySelect.addEventListener('change', () => 
                handleFacetChange('top-country-filter', 'top', 'countries')
            );
        }
        
        if (topSectorSelect) {
            topSectorSelect.addEventListener('change', () => 
                handleFacetChange('top-sector-filter', 'top', 'sectors')
            );
        }
        
        if (topClearBtn) {
            topClearBtn.addEventListener('click', () => clearFacets('top'));
        }
    }
    
    // Créer les sélecteurs pour A→Z - avec plusieurs tentatives
    let azToolbar = document.getElementById('az-toolbar');
    if (!azToolbar) {
        // Si az-toolbar n'existe pas encore, attendre un peu
        console.log('⏳ Attente de az-toolbar...');
        await new Promise(resolve => setTimeout(resolve, 500));
        azToolbar = document.getElementById('az-toolbar');
    }
    
    if (azToolbar) {
        console.log('📍 Toolbar A→Z trouvée');
        
        // Vérifier si le conteneur existe déjà
        let azContainer = document.getElementById('az-facets-container');
        if (!azContainer) {
            azContainer = document.createElement('div');
            azContainer.id = 'az-facets-container';
            azContainer.className = 'facets-container';
            
            // Insérer après les boutons de région
            const azRegions = azToolbar.querySelector('.az-regions');
            if (azRegions && azRegions.nextSibling) {
                azToolbar.insertBefore(azContainer, azRegions.nextSibling);
            } else {
                // Si pas de nextSibling, insérer avant le hint
                const azHint = azToolbar.querySelector('.toolbar-hint');
                if (azHint) {
                    azToolbar.insertBefore(azContainer, azHint);
                } else {
                    azToolbar.appendChild(azContainer);
                }
            }
        }
        
        // Créer les sélecteurs
        createDynamicSelectors('az');
        updateSelectorsForRegion('az');
        
        // Event listeners pour A→Z
        const azCountrySelect = document.getElementById('az-country-filter');
        const azSectorSelect = document.getElementById('az-sector-filter');
        const azClearBtn = document.getElementById('az-clear-facets');
        
        if (azCountrySelect) {
            azCountrySelect.addEventListener('change', () => 
                handleFacetChange('az-country-filter', 'az', 'countries')
            );
        }
        
        if (azSectorSelect) {
            azSectorSelect.addEventListener('change', () => 
                handleFacetChange('az-sector-filter', 'az', 'sectors')
            );
        }
        
        if (azClearBtn) {
            azClearBtn.addEventListener('click', () => clearFacets('az'));
        }
    } else {
        console.log('⚠️ Toolbar A→Z non trouvée');
    }
    
    // Écouter les changements de région pour mettre à jour les sélecteurs
    window.addEventListener('topFiltersChanged', (e) => {
        if (e.detail.source !== 'dynamic-facets' && e.detail.regions) {
            FilterState.top.regions = new Set(e.detail.regions);
            updateSelectorsForRegion('top');
        }
    });
    
    window.addEventListener('azFiltersChanged', (e) => {
        if (e.detail.source !== 'dynamic-facets' && e.detail.regions) {
            FilterState.az.regions = new Set(e.detail.regions);
            updateSelectorsForRegion('az');
        }
    });
    
    console.log('✅ Filtres dynamiques initialisés');
}

// Exposer l'API globale
window.DynamicFilters = {
    init: initDynamicFilters,
    state: FilterState,
    updateRegion: updateSelectorsForRegion,
    clear: clearFacets
};

// Auto-initialisation avec délai plus long pour être sûr que az-toolbar existe
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initDynamicFilters, 500); // Plus de délai
    });
} else {
    setTimeout(initDynamicFilters, 500); // Plus de délai
}