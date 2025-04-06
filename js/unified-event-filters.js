/**
 * Gestionnaire unifié des filtres d'événements
 * Gère la filtration des événements par date et catégorie
 * Version améliorée avec persistance des préférences et vérification du format de date
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
        },
        storage: {
            dateFilterKey: 'eventDateFilter',
            categoryFilterKey: 'eventCategoryFilter'
        }
    },
    
    // État actuel des filtres
    state: {
        dateFilter: 'today', // 'today' ou 'week'
        categoryFilter: 'all' // 'all', 'economic', 'ipo', 'm&a', etc.
    },
    
    // Initialisation
    init: function() {
        // Charger les préférences sauvegardées
        this.loadSavedPreferences();
        
        // Configurer les écouteurs d'événements
        this.setupEventListeners();
        
        // Vérifier le format de date au démarrage
        setTimeout(() => {
            this.checkDateFormat();
            
            // Mettre à jour l'UI des filtres
            this.updateDateFilterUI();
            this.updateCategoryFilterUI();
            
            // Appliquer les filtres initiaux
            this.applyFilters();
        }, 500); // Délai pour permettre le chargement des événements
    },
    
    // Chargement des préférences
    loadSavedPreferences: function() {
        // Charger le filtre de date
        const savedDateFilter = localStorage.getItem(this.config.storage.dateFilterKey);
        if (savedDateFilter && (savedDateFilter === 'today' || savedDateFilter === 'week')) {
            this.state.dateFilter = savedDateFilter;
        }
        
        // Charger le filtre de catégorie
        const savedCategoryFilter = localStorage.getItem(this.config.storage.categoryFilterKey);
        if (savedCategoryFilter) {
            this.state.categoryFilter = savedCategoryFilter;
        }
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
            
            // Sauvegarder la préférence
            localStorage.setItem(this.config.storage.dateFilterKey, filterType);
            
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
            
            // Sauvegarder la préférence
            localStorage.setItem(this.config.storage.categoryFilterKey, category);
            
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
            todayFilter.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            weekFilter.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            todayFilter.classList.add('text-gray-400', 'border-gray-700');
            weekFilter.classList.add('text-gray-400', 'border-gray-700');
            
            // Ajouter la classe active au filtre sélectionné
            if (this.state.dateFilter === 'today') {
                todayFilter.classList.add(this.config.dateFilters.activeClass);
                todayFilter.classList.remove('text-gray-400', 'border-gray-700');
                todayFilter.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            } else {
                weekFilter.classList.add(this.config.dateFilters.activeClass);
                weekFilter.classList.remove('text-gray-400', 'border-gray-700');
                weekFilter.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
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
            // Obtenir la date actuelle au format jj/mm/aaaa
            const today = new Date().toLocaleDateString('fr-FR');
            
            // Trouver le conteneur de date dans l'événement
            const dateElement = eventElement.querySelector('.event-date');
            if (dateElement) {
                const eventDate = dateElement.textContent.trim();
                return eventDate === today;
            }
            
            // Fallback à l'ancienne méthode si .event-date n'existe pas
            return eventElement.classList.contains('event-today');
        } else if (this.state.dateFilter === 'week') {
            // Obtenir les 7 prochains jours
            const weekDates = this.getWeekDates();
            
            // Trouver le conteneur de date dans l'événement
            const dateElement = eventElement.querySelector('.event-date');
            if (dateElement) {
                const eventDate = dateElement.textContent.trim();
                return weekDates.includes(eventDate);
            }
            
            // Pour la semaine, tous les événements sont inclus par défaut
            return true;
        }
        
        return true; // Par défaut, accepter tous les événements
    },
    
    // Obtenir les dates des 7 prochains jours
    getWeekDates: function() {
        const today = new Date();
        const dates = [];
        
        // Ajouter les 7 prochains jours
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(today.getDate() + i);
            dates.push(date.toLocaleDateString('fr-FR'));
        }
        
        return dates;
    },
    
    // Vérifier si un événement correspond au filtre de catégorie
    matchesCategoryFilter: function(eventElement) {
        if (this.state.categoryFilter === 'all') {
            return true; // Accepter toutes les catégories
        }
        
        // Vérifier si l'événement a la catégorie recherchée
        return eventElement.getAttribute('data-type') === this.state.categoryFilter;
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
    },
    
    // Vérification du format de date
    checkDateFormat: function() {
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) return;
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        const dateFormat = /^\d{2}\/\d{2}\/\d{4}$/; // Format fr-FR: jj/mm/aaaa
        
        let formatCorrect = true;
        let firstDate = '';
        
        events.forEach(event => {
            const dateElement = event.querySelector('.event-date');
            if (dateElement) {
                const dateText = dateElement.textContent.trim();
                if (!firstDate) firstDate = dateText;
                
                if (!dateFormat.test(dateText)) {
                    console.warn('Format de date incorrect détecté:', dateText);
                    formatCorrect = false;
                }
            }
        });
        
        if (!formatCorrect) {
            console.warn(`⚠️ Attention: certaines dates ne sont pas au format jj/mm/aaaa. Premier exemple trouvé: ${firstDate}`);
        }
    }
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    // Attendre un peu pour s'assurer que tous les éléments sont chargés
    setTimeout(() => {
        UnifiedEventFilters.init();
    }, 300);
});