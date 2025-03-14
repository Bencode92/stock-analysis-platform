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
 * Initialise les données d'actualités depuis l'intégration Perplexity
 */
function initializeNewsData() {
    if (window.perplexityIntegration) {
        // Les actualités sont automatiquement chargées via l'initialisation de perplexityIntegration
        console.log('Module d\'actualités initialisé avec l\'intégration Perplexity');
    } else {
        console.warn('L\'intégration Perplexity n\'est pas disponible, on affiche des messages d\'erreur');
        
        // Afficher des messages d'erreur dans les conteneurs d'actualités
        document.getElementById('featured-news').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Impossible de charger les actualités</h3>
                <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                <button class="retry-button" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
        
        document.getElementById('recent-news').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Impossible de charger les actualités</h3>
                <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                <button class="retry-button" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
        
        document.getElementById('events-container').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Impossible de charger les événements</h3>
                <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                <button class="retry-button" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
    }
}

/**
 * Configure les filtres de catégorie, tri et impact
 */
function setupFilters() {
    // Filtres de catégorie
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
}

/**
 * Configure les boutons de filtre des événements
 */
function setupEventButtons() {
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    
    if (todayBtn && weekBtn) {
        todayBtn.addEventListener('click', function() {
            todayBtn.classList.add('filter-active');
            weekBtn.classList.remove('filter-active');
            filterEvents('today');
        });
        
        weekBtn.addEventListener('click', function() {
            weekBtn.classList.add('filter-active');
            todayBtn.classList.remove('filter-active');
            filterEvents('week');
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
    const activeCategory = document.querySelector('#category-filters .filter-active').getAttribute('data-category');
    const activeImpact = document.getElementById('impact-select').value;
    const activeCountry = document.getElementById('country-select').value;
    
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
    const recentNewsContainer = document.getElementById('recent-news');
    const newsItems = Array.from(recentNewsContainer.querySelectorAll('.news-item'));
    
    // Trier les éléments en fonction du critère
    newsItems.sort((a, b) => {
        if (sortCriteria === 'recent' || sortCriteria === 'older') {
            const dateA = new Date(a.getAttribute('data-date'));
            const dateB = new Date(b.getAttribute('data-date'));
            
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
    const recentNewsContainer = document.getElementById('recent-news');
    const visibleItems = recentNewsContainer.querySelectorAll('.news-item:not(.hidden-item)');
    
    // Si aucun élément n'est visible, afficher un message
    if (visibleItems.length === 0) {
        if (!document.getElementById('no-news-message')) {
            const noItemsMessage = document.createElement('div');
            noItemsMessage.id = 'no-news-message';
            noItemsMessage.className = 'no-data-message';
            noItemsMessage.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <h3>Aucune actualité ne correspond à vos critères</h3>
                <p>Veuillez modifier vos filtres pour voir plus d'actualités.</p>
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
    const visibleEvents = eventsContainer.querySelectorAll('.event-item:not(.hidden-item)');
    
    // Si aucun événement n'est visible, afficher un message
    if (visibleEvents.length === 0) {
        if (!document.getElementById('no-events-message')) {
            const noEventsMessage = document.createElement('div');
            noEventsMessage.id = 'no-events-message';
            noEventsMessage.className = 'no-data-message';
            noEventsMessage.innerHTML = `
                <i class="fas fa-calendar-times"></i>
                <h3>Aucun événement disponible pour cette période</h3>
                <p>Aucun événement ne correspond à la période sélectionnée.</p>
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
    
    // Afficher l'animation de chargement
    loadMoreBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Chargement...';
    
    // Simuler un chargement (sera remplacé par un vrai appel API)
    setTimeout(() => {
        // Restaurer le bouton
        loadMoreBtn.innerHTML = 'Voir plus d\'actualités';
        
        // Afficher un message si aucune nouvelle actualité n'est disponible
        const recentNewsContainer = document.getElementById('recent-news');
        
        const noMoreMessage = document.createElement('div');
        noMoreMessage.className = 'no-data-message';
        noMoreMessage.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <h3>Toutes les actualités sont affichées</h3>
            <p>Vous êtes à jour ! Revenez plus tard pour voir de nouvelles actualités.</p>
        `;
        
        recentNewsContainer.appendChild(noMoreMessage);
        
        // Désactiver le bouton
        loadMoreBtn.disabled = true;
        loadMoreBtn.style.opacity = '0.5';
        loadMoreBtn.style.cursor = 'not-allowed';
    }, 1000);
}