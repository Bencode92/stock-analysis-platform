/**
 * Gestionnaire unifié des filtres d'événements
 * Gère la filtration des événements par date et catégorie
 */
const UnifiedEventFilters = {
    // Configuration
    config: {
        dateFilters: {
            selector: '.filter-button',
            activeClass: 'active',
            todaySelector: '#today-filter',
            weekSelector: '#week-filter'
        },
        categoryFilters: {
            selector: '#event-category-filters button',
            activeClass: 'filter-active',
            allSelector: '[data-category="all"]'
        },
        eventContainers: {
            main: '#events-container',
            itemClass: '.event-card'
        }
    },
    
    // État actuel des filtres
    state: {
        dateFilter: 'today', // 'today' ou 'week'
        categoryFilter: 'all' // 'all', 'US', 'economic', 'ipo', 'm&a', etc.
    },
    
    // Initialisation
    init: function() {
        this.setupEventListeners();
        // Appliquer les filtres initiaux
        this.applyFilters();
    },
    
    // Configuration des écouteurs d'événements
    setupEventListeners: function() {
        // Écouteurs pour les filtres de date
        const dateFilters = document.querySelectorAll(this.config.dateFilters.selector);
        dateFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                // Déterminer quel filtre a été cliqué
                if (e.currentTarget.id === 'today-filter') {
                    this.setDateFilter('today');
                } else if (e.currentTarget.id === 'week-filter') {
                    this.setDateFilter('week');
                }
            });
        });
        
        // Écouteurs pour les filtres de catégorie
        const categoryFilters = document.querySelectorAll(this.config.categoryFilters.selector);
        categoryFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.setCategoryFilter(category);
            });
        });
    },
    
    // Définir le filtre de date
    setDateFilter: function(filterType) {
        if (filterType !== this.state.dateFilter) {
            this.state.dateFilter = filterType;
            
            // Mettre à jour l'UI
            this.updateDateFilterUI();
            
            // Appliquer les filtres
            this.applyFilters();
        }
    },
    
    // Définir le filtre de catégorie
    setCategoryFilter: function(category) {
        if (category !== this.state.categoryFilter) {
            this.state.categoryFilter = category;
            
            // Mettre à jour l'UI
            this.updateCategoryFilterUI();
            
            // Appliquer les filtres
            this.applyFilters();
        }
    },
    
    // Mettre à jour l'interface utilisateur pour les filtres de date
    updateDateFilterUI: function() {
        const todayFilter = document.querySelector(this.config.dateFilters.todaySelector);
        const weekFilter = document.querySelector(this.config.dateFilters.weekSelector);
        
        if (todayFilter && weekFilter) {
            // Réinitialiser les classes
            todayFilter.classList.remove(this.config.dateFilters.activeClass);
            weekFilter.classList.remove(this.config.dateFilters.activeClass);
            
            // Ajouter la classe active au filtre sélectionné
            if (this.state.dateFilter === 'today') {
                todayFilter.classList.add(this.config.dateFilters.activeClass);
                todayFilter.classList.remove('text-gray-400');
                todayFilter.classList.add('text-green-400');
                weekFilter.classList.remove('text-green-400');
                weekFilter.classList.add('text-gray-400');
            } else {
                weekFilter.classList.add(this.config.dateFilters.activeClass);
                weekFilter.classList.remove('text-gray-400');
                weekFilter.classList.add('text-green-400');
                todayFilter.classList.remove('text-green-400');
                todayFilter.classList.add('text-gray-400');
            }
        }
    },
    
    // Mettre à jour l'interface utilisateur pour les filtres de catégorie
    updateCategoryFilterUI: function() {
        const categoryFilters = document.querySelectorAll(this.config.categoryFilters.selector);
        
        categoryFilters.forEach(filter => {
            // Réinitialiser les classes
            filter.classList.remove(this.config.categoryFilters.activeClass);
            filter.classList.remove('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            filter.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
            
            // Ajouter la classe active au filtre sélectionné
            if (filter.dataset.category === this.state.categoryFilter) {
                filter.classList.add(this.config.categoryFilters.activeClass);
                filter.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
                filter.classList.add('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            }
        });
    },
    
    // Appliquer les filtres aux événements
    applyFilters: function() {
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) return;
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        
        events.forEach(event => {
            const matchesDate = this.matchesDateFilter(event);
            const matchesCategory = this.matchesCategoryFilter(event);
            
            // Afficher uniquement si les deux filtres correspondent
            if (matchesDate && matchesCategory) {
                event.style.display = '';
                event.classList.add('animate-fadeIn');
            } else {
                event.style.display = 'none';
                event.classList.remove('animate-fadeIn');
            }
        });
        
        // Vérifier s'il y a des événements visibles
        this.checkForEmptyResults(eventsContainer);
    },
    
    // Vérifier si un événement correspond au filtre de date
    matchesDateFilter: function(eventElement) {
        if (this.state.dateFilter === 'today') {
            // Vérifier si l'événement est pour aujourd'hui
            return eventElement.classList.contains('event-today');
        } else if (this.state.dateFilter === 'week') {
            // Pour la semaine, tous les événements sont inclus
            return true;
        }
        return true; // Par défaut, accepter tous les événements
    },
    
    // Vérifier si un événement correspond au filtre de catégorie
    matchesCategoryFilter: function(eventElement) {
        if (this.state.categoryFilter === 'all') {
            return true; // Accepter toutes les catégories
        }
        
        // Vérifier si l'événement a la catégorie recherchée
        return eventElement.dataset.category === this.state.categoryFilter;
    },
    
    // Vérifier s'il n'y a pas de résultats et afficher un message
    checkForEmptyResults: function(container) {
        let visibleEvents = 0;
        const events = container.querySelectorAll(this.config.eventContainers.itemClass);
        
        events.forEach(event => {
            if (event.style.display !== 'none') {
                visibleEvents++;
            }
        });
        
        // S'il n'y a pas d'événements visibles, afficher un message
        let emptyMessage = container.querySelector('.no-events-message');
        
        if (visibleEvents === 0) {
            if (!emptyMessage) {
                emptyMessage = document.createElement('div');
                emptyMessage.className = 'no-events-message col-span-3 text-center py-6';
                emptyMessage.innerHTML = `
                    <i class="fas fa-calendar-times text-gray-400 text-4xl mb-2"></i>
                    <p class="text-gray-400">Aucun événement ne correspond aux filtres sélectionnés</p>
                `;
                container.appendChild(emptyMessage);
            }
        } else {
            // Supprimer le message s'il existe
            if (emptyMessage) {
                emptyMessage.remove();
            }
        }
    }
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    UnifiedEventFilters.init();
});