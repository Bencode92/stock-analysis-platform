/**
 * Gestionnaire unifié des filtres d'événements
 * Version corrigée pour résoudre les problèmes de filtrage
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
        categoryFilter: 'all', // 'all', 'economic', 'ipo', 'm&a', etc.
        initialized: false // Tracker si déjà initialisé
    },
    
    // Initialisation
    init: function() {
        console.log('🔄 Initialisation de UnifiedEventFilters...');
        
        // Éviter l'initialisation multiple
        if (this.state.initialized) {
            console.log('⚠️ UnifiedEventFilters déjà initialisé, ignoré');
            return;
        }
        this.state.initialized = true;
        
        // Charger les préférences sauvegardées
        this.loadSavedPreferences();
        console.log(`📋 Préférences chargées: dateFilter=${this.state.dateFilter}, categoryFilter=${this.state.categoryFilter}`);
        
        // Configurer les écouteurs d'événements
        this.setupEventListeners();
        console.log('🔊 Écouteurs d'événements configurés');
        
        // Mise à jour de l'UI pour refléter l'état actuel
        this.updateDateFilterUI();
        this.updateCategoryFilterUI();
        console.log('🔄 Interface utilisateur mise à jour');
        
        // Écouter l'événement custom pour savoir quand les événements sont prêts
        document.addEventListener('events-ready', (e) => {
            console.log(`🎯 Événement 'events-ready' reçu avec ${e.detail.count} événements`);
            setTimeout(() => {
                this.applyFilters();
            }, 100);
        });
        
        // Attendre que tout soit chargé, puis appliquer les filtres
        setTimeout(() => {
            this.checkDateFormat();
            this.applyFilters();
            console.log('✅ Filtres initiaux appliqués');
            
            // Exposer l'instance globalement pour le débogage
            window.EventFilters = this;
        }, 1000);
    },
    
    // Débogage - Examiner l'état des cartes d'événements
    debug: function() {
        console.group('🔍 Débogage des filtres d\'événements');
        console.log('État des filtres:', {
            dateFilter: this.state.dateFilter,
            categoryFilter: this.state.categoryFilter,
            initialized: this.state.initialized
        });
        
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) {
            console.error('❌ Conteneur d\'événements non trouvé (#events-container)');
            console.groupEnd();
            return;
        }
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        console.log(`📊 ${events.length} événements trouvés dans le DOM`);
        
        // Analyser tous les événements
        const typeCounts = {};
        const displayCounts = { visible: 0, hidden: 0 };
        const problematicEvents = [];
        
        events.forEach((event, index) => {
            const eventType = event.getAttribute('data-type');
            const isVisible = event.style.display !== 'none';
            const title = event.getAttribute('data-title') || 
                          event.querySelector('h3')?.textContent || 
                          `Événement #${index+1}`;
            
            // Compter par type
            typeCounts[eventType] = (typeCounts[eventType] || 0) + 1;
            
            // Compter visibles/cachés
            if (isVisible) displayCounts.visible++; else displayCounts.hidden++;
            
            // Identifier les événements problématiques
            if (!eventType) {
                problematicEvents.push({
                    index,
                    title: title.substring(0, 30) + (title.length > 30 ? '...' : ''),
                    problem: 'Pas d\'attribut data-type'
                });
            }
            
            // Pour les 5 premiers événements, afficher des détails complets
            if (index < 5) {
                console.log(`Événement #${index+1}:`, {
                    title: title.substring(0, 30) + (title.length > 30 ? '...' : ''),
                    type: eventType,
                    visible: isVisible,
                    shouldBeVisible: this.shouldBeVisible(event)
                });
            }
        });
        
        console.log('Types d\'événements:', typeCounts);
        console.log('Affichage:', displayCounts);
        console.log('Événements problématiques:', problematicEvents.length > 0 ? problematicEvents : 'Aucun');
        console.groupEnd();
    },
    
    // Vérifier si un événement devrait être visible selon les filtres actuels
    shouldBeVisible: function(event) {
        return this.matchesDateFilter(event) && this.matchesCategoryFilter(event);
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
                const category = e.currentTarget.getAttribute('data-category');
                console.log(`🖱️ Clic sur filtre catégorie: ${category}`);
                this.setCategoryFilter(category);
            });
        });
    },
    
    // Définir le filtre de date
    setDateFilter: function(filterType) {
        if (filterType !== this.state.dateFilter) {
            console.log(`📅 Changement de filtre date: ${this.state.dateFilter} -> ${filterType}`);
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
            console.log(`🔖 Changement de filtre catégorie: ${this.state.categoryFilter} -> ${category}`);
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
        } else {
            console.warn('⚠️ Boutons de filtre de date non trouvés dans le DOM');
        }
    },
    
    // Mettre à jour l'interface utilisateur pour les filtres de catégorie
    updateCategoryFilterUI: function() {
        const categoryFilters = document.querySelectorAll(this.config.categoryFilters.selector);
        
        if (categoryFilters.length === 0) {
            console.warn('⚠️ Aucun bouton de filtre de catégorie trouvé dans le DOM');
            return;
        }
        
        categoryFilters.forEach(filter => {
            // Réinitialiser les classes
            filter.classList.remove(this.config.categoryFilters.activeClass);
            filter.classList.remove('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            filter.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
            
            // Ajouter la classe active au filtre sélectionné
            const filterCategory = filter.getAttribute('data-category');
            if (filterCategory === this.state.categoryFilter) {
                filter.classList.add(this.config.categoryFilters.activeClass);
                filter.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
                filter.classList.add('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            }
        });
    },
    
    // Appliquer les filtres aux événements
    applyFilters: function() {
        console.log(`🔍 Application des filtres: dateFilter=${this.state.dateFilter}, categoryFilter=${this.state.categoryFilter}`);
        
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) {
            console.error('❌ Conteneur d\'événements non trouvé pour l\'application des filtres');
            return;
        }
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        console.log(`📊 Filtrage de ${events.length} événements`);
        
        let visibleCount = 0;
        let hiddenCount = 0;
        
        // Regarder les 3 premiers événements en détail
        const detailEvents = [];
        
        events.forEach((event, index) => {
            const matchesDate = this.matchesDateFilter(event);
            const matchesCategory = this.matchesCategoryFilter(event);
            const shouldBeVisible = matchesDate && matchesCategory;
            
            // Si l'événement devrait être visible selon les deux filtres
            if (shouldBeVisible) {
                event.style.display = '';
                event.classList.add('animate-fadeIn');
                visibleCount++;
            } else {
                event.style.display = 'none';
                event.classList.remove('animate-fadeIn');
                hiddenCount++;
            }
            
            // Collecter des détails pour les premiers événements
            if (index < 3) {
                detailEvents.push({
                    index,
                    type: event.getAttribute('data-type'),
                    title: event.getAttribute('data-title') || event.querySelector('h3')?.textContent || `Événement #${index+1}`,
                    matchesDate,
                    matchesCategory,
                    visible: shouldBeVisible
                });
            }
        });
        
        console.log(`✓ Filtrage terminé: ${visibleCount} événements visibles, ${hiddenCount} masqués`);
        console.log('Détails des premiers événements:', detailEvents);
        
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
            // Pour le filtre semaine, accepter tous les événements
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
        
        // Obtenir le type de l'événement
        const eventType = eventElement.getAttribute('data-type');
        
        // Si l'événement n'a pas d'attribut data-type, vérifier la classe pour le débogage
        if (!eventType) {
            console.warn(`⚠️ Événement sans attribut data-type: ${eventElement.textContent.substring(0, 30)}...`);
            // Essayer de trouver une classe event-type-*
            const classList = Array.from(eventElement.classList);
            const typeClass = classList.find(cls => cls.startsWith('event-type-'));
            if (typeClass) {
                const typeFromClass = typeClass.replace('event-type-', '');
                return typeFromClass === this.state.categoryFilter;
            }
            return false;
        }
        
        // Log détaillé pour débogage
        if (eventType !== this.state.categoryFilter) {
            console.log(`Type d'événement "${eventType}" ne correspond pas au filtre "${this.state.categoryFilter}"`);
        }
        
        // Vérifier si l'événement a la catégorie recherchée
        return eventType === this.state.categoryFilter;
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
                    <p class="text-xs text-gray-500 mt-2">Catégorie: ${this.state.categoryFilter}, Période: ${this.state.dateFilter}</p>
                `;
                container.appendChild(emptyMessage);
            } else {
                emptyMessage.style.display = 'block';
            }
        } else {
            // Supprimer le message s'il existe
            if (emptyMessage) {
                emptyMessage.style.display = 'none';
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
                    console.warn(`⚠️ Format de date incorrect: "${dateText}"`);
                    formatCorrect = false;
                }
            }
        });
        
        if (!formatCorrect) {
            console.warn(`⚠️ Certaines dates ne sont pas au format jj/mm/aaaa. Exemple: "${firstDate}"`);
        }
    }
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Chargement du unified-event-filters.js');
    
    // Attendre que tout soit chargé, puis initialiser
    setTimeout(() => {
        UnifiedEventFilters.init();
        
        // Exposer une fonction de débogage globale
        window.debugFilters = function() {
            if (window.EventFilters) {
                window.EventFilters.debug();
            } else {
                console.error('❌ EventFilters n\'est pas initialisé');
            }
        };
    }, 1000);
});
