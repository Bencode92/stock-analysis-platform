/**
 * actualites.js - Gestion des actualités et événements financiers
 * Ce script gère l'affichage, le filtrage et le tri des actualités financières.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialisation des données d'actualités
    initializeNewsData();
    
    // Configuration des filtres et tris
    setupFilters();
    
    // Configuration des boutons d'événements
    setupEventButtons();
    
    // Configuration du bouton "Voir plus"
    setupLoadMoreButton();
});

/**
 * Initialise les données d'actualités depuis l'API FMP ou l'intégration Perplexity
 */
async function initializeNewsData() {
    try {
        // Essayer d'abord de charger les données depuis news.json généré par l'action GitHub
        const response = await fetch('data/news.json');
        
        if (response.ok) {
            const data = await response.json();
            processAndDisplayNews(data);
            return;
        }
        
        // Si les données API ne sont pas disponibles, essayer l'intégration Perplexity
        if (window.perplexityIntegration) {
            console.log('Module d\'actualités initialisé avec l\'intégration Perplexity');
            return;
        }
        
        // Si ni l'API ni Perplexity ne sont disponibles, afficher des données de secours
        throw new Error('Aucune source de données disponible');
    } catch (error) {
        console.warn('Erreur lors du chargement des actualités:', error);
        // Générer et afficher des données de secours
        displayFallbackData();
    }
}

/**
 * Traite et affiche les actualités à partir des données JSON
 * @param {Object} data - Données d'actualités
 */
function processAndDisplayNews(data) {
    if (!data || !data.news || !Array.isArray(data.news) || data.news.length === 0) {
        displayFallbackData();
        return;
    }
    
    // Traiter les actualités
    const newsItems = data.news.map(item => {
        // Déterminer la catégorie d'actif si le module est disponible
        let category = item.category || 'general';
        if (window.AssetCategories) {
            category = window.AssetCategories.categorizeNews(item);
        }
        
        return {
            ...item,
            category,
            impact: item.impact || determineImpact(item),
            country: item.country || extractCountry(item)
        };
    });
    
    // Séparer les actualités en "à la une" et "récentes"
    const featuredNews = newsItems.slice(0, 4);
    const recentNews = newsItems.slice(4);
    
    // Afficher les actualités
    displayFeaturedNews(featuredNews);
    displayRecentNews(recentNews);
}

/**
 * Détermine l'impact d'une actualité à partir de son contenu
 * @param {Object} item - Élément d'actualité
 * @returns {string} - Impact estimé (positive, negative, neutral)
 */
function determineImpact(item) {
    const content = `${item.title} ${item.summary || ''}`.toLowerCase();
    
    // Mots clés positifs
    const positiveKeywords = [
        'rise', 'gain', 'surge', 'jump', 'positive', 'boost', 'increase', 'growth', 'profit',
        'hausse', 'augmentation', 'croissance', 'bénéfice', 'succès', 'record', 'outperform'
    ];
    
    // Mots clés négatifs
    const negativeKeywords = [
        'fall', 'drop', 'decline', 'plunge', 'negative', 'loss', 'crash', 'decrease', 'deficit',
        'baisse', 'diminution', 'perte', 'échec', 'recession', 'downgrade', 'underperform'
    ];
    
    // Compter les occurrences de mots clés
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveKeywords.forEach(keyword => {
        if (content.includes(keyword)) positiveCount++;
    });
    
    negativeKeywords.forEach(keyword => {
        if (content.includes(keyword)) negativeCount++;
    });
    
    // Déterminer l'impact en fonction des occurrences
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

/**
 * Extrait le pays mentionné dans une actualité
 * @param {Object} item - Élément d'actualité
 * @returns {string} - Code du pays (us, eu, fr, other)
 */
function extractCountry(item) {
    const content = `${item.title} ${item.summary || ''}`.toLowerCase();
    
    // Pays et régions
    const countries = {
        'us': ['united states', 'usa', 'america', 'u.s.', 'u.s.a', 'fed', 'federal reserve'],
        'eu': ['europe', 'european', 'euro', 'eurozone', 'ecb', 'european central bank'],
        'fr': ['france', 'french', 'paris', 'bnf', 'banque de france'],
        'uk': ['united kingdom', 'uk', 'britain', 'british', 'england', 'london'],
        'cn': ['china', 'chinese', 'beijing', 'shanghai'],
        'jp': ['japan', 'japanese', 'tokyo']
    };
    
    // Rechercher les occurrences de pays
    for (const [code, keywords] of Object.entries(countries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return code;
        }
    }
    
    return 'other';
}

/**
 * Affiche les actualités à la une
 * @param {Array} featuredNews - Actualités à la une
 */
function displayFeaturedNews(featuredNews) {
    const container = document.getElementById('featured-news');
    if (!container) return;
    
    // Vider le conteneur
    container.innerHTML = '';
    
    if (featuredNews.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 flex flex-col items-center justify-center py-10">
                <i class="fas fa-newspaper text-gray-700 text-4xl mb-4"></i>
                <p class="text-gray-500">Aucune actualité à la une disponible</p>
            </div>
        `;
        return;
    }
    
    // Afficher les actualités à la une
    featuredNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-gray-800 bg-opacity-70 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition duration-300';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        
        // Déterminer la couleur en fonction de l'impact
        const impactColor = item.impact === 'positive' ? '#4CAF50' : 
                           item.impact === 'negative' ? '#F44336' : '#607D8B';
        
        card.innerHTML = `
            <div class="p-1 text-xs font-medium flex justify-between items-center" style="background-color: ${categoryInfo.color || '#607D8B'};">
                <span class="text-white"><i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name || 'Général'}</span>
                <span class="text-white">${formatDate(item.date)}</span>
            </div>
            <div class="p-4">
                <h3 class="text-white text-lg font-semibold mb-2">${item.title}</h3>
                <p class="text-gray-300 text-sm mb-3 line-clamp-3">${item.summary || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-1 font-medium" style="background-color: ${impactColor}; color: white;">
                        ${item.impact === 'positive' ? 'Positif' : 
                          item.impact === 'negative' ? 'Négatif' : 'Neutre'}
                    </span>
                    <span class="text-xs text-gray-400">Source: ${item.source || 'Financial Data'}</span>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

/**
 * Affiche les actualités récentes
 * @param {Array} recentNews - Actualités récentes
 */
function displayRecentNews(recentNews) {
    const container = document.getElementById('recent-news');
    if (!container) return;
    
    // Vider le conteneur
    container.innerHTML = '';
    
    if (recentNews.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <i class="fas fa-newspaper text-gray-700 text-4xl mb-4"></i>
                <p class="text-gray-500">Aucune actualité récente disponible</p>
            </div>
        `;
        return;
    }
    
    // Créer la grille d'actualités
    const newsGrid = document.createElement('div');
    newsGrid.className = 'grid grid-cols-1 md:grid-cols-3 gap-4';
    
    // Afficher les actualités récentes
    recentNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-gray-800 bg-opacity-70 rounded-lg overflow-hidden shadow hover:shadow-lg transition duration-300';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        
        card.innerHTML = `
            <div class="flex items-center justify-between p-2 bg-opacity-90" style="background-color: ${categoryInfo.color}20;">
                <span class="text-xs font-medium" style="color: ${categoryInfo.color}">
                    <i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name}
                </span>
                <span class="text-xs text-gray-400">${formatDate(item.date)}</span>
            </div>
            <div class="p-3">
                <h3 class="text-white text-base font-medium mb-2 line-clamp-2">${item.title}</h3>
                <p class="text-gray-400 text-xs mb-2 line-clamp-3">${item.summary || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-0.5 ${
                        item.impact === 'positive' ? 'bg-green-400 bg-opacity-20 text-green-400' : 
                        item.impact === 'negative' ? 'bg-red-400 bg-opacity-20 text-red-400' : 
                        'bg-gray-400 bg-opacity-20 text-gray-400'
                    }">
                        ${item.impact === 'positive' ? 'Positif' : 
                          item.impact === 'negative' ? 'Négatif' : 'Neutre'}
                    </span>
                    <span class="text-xs text-gray-500">${(item.source || '').slice(0, 15)}</span>
                </div>
            </div>
        `;
        
        newsGrid.appendChild(card);
    });
    
    container.appendChild(newsGrid);
}

/**
 * Affiche des données de secours quand aucune source n'est disponible
 */
function displayFallbackData() {
    // Message d'avertissement
    console.warn('Utilisation des données de secours pour les actualités');
    
    // Afficher des messages d'erreur ou de secours dans les conteneurs d'actualités
    const containers = ['featured-news', 'recent-news'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-message bg-gray-800 bg-opacity-70 rounded-lg p-4 text-center">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-2xl mb-2"></i>
                <h3 class="text-white font-medium mb-2">Impossible de charger les actualités</h3>
                <p class="text-gray-400 mb-3">Nous rencontrons un problème de connexion avec notre service de données.</p>
                <button class="retry-button bg-green-400 bg-opacity-20 text-green-400 border border-green-400 border-opacity-30 rounded px-3 py-1 text-sm" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt mr-1"></i> Réessayer
                </button>
            </div>
        `;
    });
}

/**
 * Configure les filtres de catégorie, tri et impact
 */
function setupFilters() {
    // Si le gestionnaire de catégories est disponible, l'utiliser
    if (window.AssetCategories) {
        // La configuration des filtres de catégorie est gérée par AssetCategories
        console.log('Filtres de catégorie gérés par AssetCategories');
    } else {
        // Configuration standard des filtres de catégorie
        const categoryFilters = document.querySelectorAll('#category-filters button');
        categoryFilters.forEach(filter => {
            filter.addEventListener('click', function() {
                // Retirer la classe active de tous les filtres
                categoryFilters.forEach(f => f.classList.remove('filter-active'));
                
                // Ajouter la classe active au filtre cliqué
                this.classList.add('filter-active');
                
                // Appliquer le filtre
                const category = this.getAttribute('data-category');
                filterNews('category', category);
            });
        });
    }
    
    // Filtre de tri
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            sortNews(this.value);
        });
    }
    
    // Filtre d'impact
    const impactSelect = document.getElementById('impact-select');
    if (impactSelect) {
        impactSelect.addEventListener('change', function() {
            filterNews('impact', this.value);
        });
    }
    
    // Filtre de pays
    const countrySelect = document.getElementById('country-select');
    if (countrySelect) {
        countrySelect.addEventListener('change', function() {
            filterNews('country', this.value);
        });
    }
    
    // Exposer la fonction filterNews pour permettre l'accès depuis AssetCategories
    window.filterNews = filterNews;
}

/**
 * Configure les boutons de filtre des événements
 */
function setupEventButtons() {
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const essentialBtn = document.getElementById('essential-btn');
    
    if (todayBtn && weekBtn) {
        todayBtn.addEventListener('click', function() {
            todayBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            weekBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.filterMode = 'today';
                window.eventsManager.renderEvents();
            } else {
                filterEvents('today');
            }
        });
        
        weekBtn.addEventListener('click', function() {
            weekBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            todayBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.filterMode = 'week';
                window.eventsManager.renderEvents();
            } else {
                filterEvents('week');
            }
        });
    }
    
    // Bouton pour filtrer les événements essentiels
    if (essentialBtn) {
        essentialBtn.addEventListener('click', function() {
            const isActive = this.classList.contains('filter-active');
            
            if (isActive) {
                // Désactiver le filtre
                essentialBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
                essentialBtn.classList.add('text-gray-400', 'border-gray-700');
            } else {
                // Activer le filtre
                essentialBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
                essentialBtn.classList.remove('text-gray-400', 'border-gray-700');
            }
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.essentialOnly = !isActive;
                window.eventsManager.renderEvents();
            }
        });
    }
}

/**
 * Configure le bouton "Voir plus"
 */
function setupLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            loadMoreNews();
        });
    }
}

/**
 * Filtre les actualités en fonction du type et de la valeur du filtre
 * @param {string} filterType - Type de filtre (category, impact, country)
 * @param {string} filterValue - Valeur du filtre
 */
function filterNews(filterType, filterValue) {
    const newsItems = document.querySelectorAll('.news-item');
    
    // Obtenir les autres filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    
    // Mettre à jour les filtres actifs en fonction du type actuel
    let currentCategory = activeCategory;
    let currentImpact = activeImpact;
    let currentCountry = activeCountry;
    
    if (filterType === 'category') currentCategory = filterValue;
    if (filterType === 'impact') currentImpact = filterValue;
    if (filterType === 'country') currentCountry = filterValue;
    
    // Appliquer les filtres à chaque élément d'actualité
    newsItems.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const itemImpact = item.getAttribute('data-impact');
        const itemCountry = item.getAttribute('data-country');
        
        // Vérifier si l'élément correspond à tous les filtres actifs
        const matchesCategory = currentCategory === 'all' || itemCategory === currentCategory;
        const matchesImpact = currentImpact === 'all' || itemImpact === currentImpact;
        const matchesCountry = currentCountry === 'all' || itemCountry === currentCountry;
        
        // Afficher ou masquer l'élément en fonction des filtres
        if (matchesCategory && matchesImpact && matchesCountry) {
            item.classList.remove('hidden-item');
            item.classList.add('fade-in');
        } else {
            item.classList.add('hidden-item');
            item.classList.remove('fade-in');
        }
    });
    
    // Vérifier s'il y a des éléments visibles après le filtrage
    checkVisibleItems();
}

/**
 * Trie les actualités en fonction du critère spécifié
 * @param {string} sortCriteria - Critère de tri (recent, older, impact-high, impact-low)
 */
function sortNews(sortCriteria) {
    const recentNewsContainer = document.getElementById('recent-news')?.querySelector('.grid');
    if (!recentNewsContainer) return;
    
    const newsItems = Array.from(recentNewsContainer.querySelectorAll('.news-item'));
    
    // Trier les éléments en fonction du critère
    newsItems.sort((a, b) => {
        if (sortCriteria === 'recent' || sortCriteria === 'older') {
            const dateA = new Date(a.getAttribute('data-date') || 0);
            const dateB = new Date(b.getAttribute('data-date') || 0);
            
            return sortCriteria === 'recent' ? dateB - dateA : dateA - dateB;
        } else if (sortCriteria === 'impact-high' || sortCriteria === 'impact-low') {
            const impactMap = { 'positive': 3, 'neutral': 2, 'negative': 1 };
            
            const impactA = impactMap[a.getAttribute('data-impact')] || 0;
            const impactB = impactMap[b.getAttribute('data-impact')] || 0;
            
            return sortCriteria === 'impact-high' ? impactB - impactA : impactA - impactB;
        }
        
        return 0;
    });
    
    // Réorganiser les éléments dans le DOM
    newsItems.forEach(item => {
        recentNewsContainer.appendChild(item);
    });
}

/**
 * Filtre les événements en fonction de la période
 * @param {string} period - Période (today, week)
 */
function filterEvents(period) {
    const eventItems = document.querySelectorAll('.event-item');
    
    eventItems.forEach(item => {
        const itemDate = item.getAttribute('data-date');
        
        if (period === 'all' || itemDate === period) {
            item.classList.remove('hidden-item');
            item.classList.add('fade-in');
        } else {
            item.classList.add('hidden-item');
            item.classList.remove('fade-in');
        }
    });
    
    // Vérifier s'il y a des événements visibles après le filtrage
    checkVisibleEvents();
}

/**
 * Vérifie s'il y a des éléments d'actualité visibles après le filtrage
 */
function checkVisibleItems() {
    const recentNewsContainer = document.getElementById('recent-news')?.querySelector('.grid');
    if (!recentNewsContainer) return;
    
    const visibleItems = recentNewsContainer.querySelectorAll('.news-item:not(.hidden-item)');
    
    // Si aucun élément n'est visible, afficher un message
    if (visibleItems.length === 0) {
        if (!document.getElementById('no-news-message')) {
            const noItemsMessage = document.createElement('div');
            noItemsMessage.id = 'no-news-message';
            noItemsMessage.className = 'no-data-message flex flex-col items-center justify-center py-10 col-span-3';
            noItemsMessage.innerHTML = `
                <i class="fas fa-filter text-gray-700 text-4xl mb-4"></i>
                <h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3>
                <p class="text-gray-400">Veuillez modifier vos filtres pour voir plus d'actualités.</p>
            `;
            
            recentNewsContainer.appendChild(noItemsMessage);
        }
    } else {
        // Supprimer le message s'il existe
        const noItemsMessage = document.getElementById('no-news-message');
        if (noItemsMessage) {
            noItemsMessage.remove();
        }
    }
}

/**
 * Vérifie s'il y a des événements visibles après le filtrage
 */
function checkVisibleEvents() {
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) return;
    
    const visibleEvents = eventsContainer.querySelectorAll('.event-item:not(.hidden-item)');
    
    // Si aucun événement n'est visible, afficher un message
    if (visibleEvents.length === 0) {
        if (!document.getElementById('no-events-message')) {
            const noEventsMessage = document.createElement('div');
            noEventsMessage.id = 'no-events-message';
            noEventsMessage.className = 'no-data-message flex flex-col items-center justify-center p-6 text-center col-span-3';
            noEventsMessage.innerHTML = `
                <i class="fas fa-calendar-times text-gray-700 text-4xl mb-4"></i>
                <h3 class="text-white font-medium mb-2">Aucun événement disponible</h3>
                <p class="text-gray-400">Aucun événement ne correspond à la période sélectionnée.</p>
            `;
            
            eventsContainer.appendChild(noEventsMessage);
        }
    } else {
        // Supprimer le message s'il existe
        const noEventsMessage = document.getElementById('no-events-message');
        if (noEventsMessage) {
            noEventsMessage.remove();
        }
    }
}

/**
 * Charge plus d'actualités
 */
function loadMoreNews() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (!loadMoreBtn) return;
    
    // Afficher l'animation de chargement
    loadMoreBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Chargement...';
    loadMoreBtn.disabled = true;
    
    // Simuler un chargement (sera remplacé par un vrai appel API)
    setTimeout(() => {
        // Restaurer le bouton
        loadMoreBtn.innerHTML = 'Voir plus d\'actualités';
        loadMoreBtn.disabled = false;
        
        // Afficher un message si aucune nouvelle actualité n'est disponible
        const recentNewsContainer = document.getElementById('recent-news');
        if (!recentNewsContainer) return;
        
        const noMoreMessage = document.createElement('div');
        noMoreMessage.className = 'no-data-message flex flex-col items-center justify-center py-8 my-4';
        noMoreMessage.innerHTML = `
            <i class="fas fa-check-circle text-green-400 text-3xl mb-3"></i>
            <h3 class="text-white font-medium mb-2">Toutes les actualités sont affichées</h3>
            <p class="text-gray-400">Vous êtes à jour ! Revenez plus tard pour voir de nouvelles actualités.</p>
        `;
        
        recentNewsContainer.appendChild(noMoreMessage);
        
        // Désactiver le bouton
        loadMoreBtn.disabled = true;
        loadMoreBtn.style.opacity = '0.5';
        loadMoreBtn.style.cursor = 'not-allowed';
    }, 1000);
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date au format ISO ou autre
 * @returns {string} - Date formatée
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Date inconnue';
    
    try {
        const date = new Date(dateStr);
        
        // Si la date est invalide, retourner la chaîne originale
        if (isNaN(date.getTime())) return dateStr;
        
        // Formater la date: aujourd'hui, hier ou date complète
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        // Même jour
        if (date.toDateString() === today.toDateString()) {
            return `Aujourd'hui ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Hier
        if (date.toDateString() === yesterday.toDateString()) {
            return `Hier ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Date complète
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (error) {
        return dateStr;
    }
}
