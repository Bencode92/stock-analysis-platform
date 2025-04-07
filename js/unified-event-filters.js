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
        initialized: false, // Tracker si déjà initialisé
        lastFilterTime: null, // Horodatage du dernier filtrage
        filterCount: 0, // Nombre de filtrages effectués
        eventCount: 0, // Nombre total d'événements
        visibleCount: 0 // Nombre d'événements visibles
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
        
        // CORRECTION: Assurer la cohérence des attributs data-type
        this.ensureDataTypeAttributes();
        
        // Écouter l'événement custom pour savoir quand les événements sont prêts
        document.addEventListener('events-ready', (e) => {
            console.log(`🎯 Événement 'events-ready' reçu avec ${e.detail.count} événements`);
            // CORRECTION: Utiliser setTimeout pour être sûr que les attributs sont présents
            setTimeout(() => {
                this.ensureDataTypeAttributes(); // S'assurer que tous les événements ont des attributs corrects
                this.applyFilters();
            }, 100);
        });
        
        // Attendre que tout soit chargé, puis appliquer les filtres
        setTimeout(() => {
            this.checkDateFormat();
            // CORRECTION: Assurer la cohérence des attributs avant le filtrage
            this.ensureDataTypeAttributes();
            this.applyFilters();
            console.log('✅ Filtres initiaux appliqués');
            
            // Exposer l'instance globalement pour le débogage
            window.EventFilters = this;
            
            // AJOUT: Afficher un résumé des métriques après initialisation
            this.logFilteringMetrics();
        }, 1000);
    },
    
    // AJOUT: Fonction pour afficher les métriques de filtrage
    logFilteringMetrics: function() {
        console.log(`📊 Métriques de filtrage: ${this.state.filterCount} filtrages effectués, ${this.state.visibleCount}/${this.state.eventCount} événements visibles`);
        
        // Mise à jour de l'indicateur d'événements (s'il existe)
        const eventsInfoEl = document.getElementById('events-info');
        if (eventsInfoEl) {
            eventsInfoEl.textContent = `${this.state.visibleCount} événements affichés`;
            eventsInfoEl.title = `Filtre: ${this.state.categoryFilter === 'all' ? 'Tous' : this.state.categoryFilter} / ${this.state.dateFilter === 'today' ? 'Aujourd\'hui' : 'Cette semaine'}`;
        } else {
            // Créer l'élément s'il n'existe pas
            this.createEventsInfoIndicator();
        }
    },
    
    // AJOUT: Création d'un indicateur pour afficher le nombre d'événements
    createEventsInfoIndicator: function() {
        const eventsSection = document.getElementById('events-section');
        if (!eventsSection) return;
        
        // Vérifier si l'élément existe déjà
        if (document.getElementById('events-info')) return;
        
        // Créer l'élément d'info
        const infoEl = document.createElement('div');
        infoEl.id = 'events-info';
        infoEl.className = 'text-xs text-gray-400 mt-2 text-right';
        infoEl.textContent = `${this.state.visibleCount} événements affichés`;
        infoEl.title = `Filtre: ${this.state.categoryFilter === 'all' ? 'Tous' : this.state.categoryFilter} / ${this.state.dateFilter === 'today' ? 'Aujourd\'hui' : 'Cette semaine'}`;
        
        // Ajouter après le conteneur d'événements
        const eventsContainer = document.getElementById('events-container');
        if (eventsContainer) {
            eventsContainer.after(infoEl);
        } else {
            eventsSection.appendChild(infoEl);
        }
    },
    
    // NOUVELLE FONCTION: S'assurer que tous les événements ont des attributs data-type
    ensureDataTypeAttributes: function() {
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) return;
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        console.log(`🔄 Vérification des attributs data-type pour ${events.length} événements...`);
        
        let addedCount = 0;
        let correctedTypes = 0;
        let addedDates = 0;
        
        events.forEach((event, index) => {
            // 1. Vérifier/ajouter l'attribut data-type
            let type = event.getAttribute('data-type');
            
            if (!type) {
                // Si pas de type, essayer de déduire du contenu ou des classes
                const classList = Array.from(event.classList);
                const typeClass = classList.find(cls => cls.startsWith('event-type-'));
                
                if (typeClass) {
                    type = typeClass.replace('event-type-', '');
                } else {
                    // Valeur par défaut si aucun type n'est détectable
                    type = 'economic';
                }
                
                event.setAttribute('data-type', type);
                addedCount++;
                console.log(`✅ Ajout data-type="${type}" à l'événement #${index+1}`);
            } 
            // 2. CORRECTION: Normaliser les types merger -> m&a
            else if (type === 'merger') {
                event.setAttribute('data-type', 'm&a');
                correctedTypes++;
                console.log(`🔄 Correction du type "merger" en "m&a" pour l'événement #${index+1}`);
            }
            
            // AJOUT: Toujours s'assurer que le type est en minuscules
            const currentType = event.getAttribute('data-type');
            if (currentType && currentType !== currentType.toLowerCase()) {
                event.setAttribute('data-type', currentType.toLowerCase());
                correctedTypes++;
                console.log(`🔄 Conversion de "${currentType}" en minuscules pour l'événement #${index+1}`);
            }
            
            // 3. Vérifier la présence de l'élément date nécessaire pour le filtrage
            if (!event.querySelector('.event-date')) {
                // Si pas d'élément date, créer un avec la date du jour
                const today = new Date();
                const dateStr = [
                    String(today.getDate()).padStart(2, '0'),
                    String(today.getMonth() + 1).padStart(2, '0'),
                    today.getFullYear()
                ].join('/');
                
                const dateEl = document.createElement('span');
                dateEl.className = 'event-date';
                dateEl.style.display = 'none'; // Invisible mais utilisé pour le filtrage
                dateEl.textContent = dateStr;
                event.appendChild(dateEl);
                addedDates++;
                
                console.log(`✅ Ajout élément date (${dateStr}) à l'événement #${index+1}`);
            }
            
            // 4. AJOUT: Ajouter un attribut de debug pour les événements qui posent problème
            if (index < 3) {
                event.setAttribute('data-debug', 'true');
            }
        });
        
        console.log(`✅ Attributs vérifiés: ${addedCount} data-type ajoutés, ${correctedTypes} types corrigés, ${addedDates} dates ajoutées`);
        
        // Mettre à jour le compteur d'événements
        this.state.eventCount = events.length;
        
        return { addedCount, correctedTypes, addedDates };
    },
    
    // Débogage - Examiner l'état des cartes d'événements
    debug: function() {
        console.group('🔍 Débogage des filtres d\'événements');
        console.log('État des filtres:', {
            dateFilter: this.state.dateFilter,
            categoryFilter: this.state.categoryFilter,
            initialized: this.state.initialized,
            filterCount: this.state.filterCount,
            lastFilterTime: this.state.lastFilterTime
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
                    shouldBeVisible: this.shouldBeVisible(event),
                    date: event.querySelector('.event-date')?.textContent || 'Pas de date'
                });
            }
        });
        
        console.log('Types d\'événements:', typeCounts);
        console.log('Affichage:', displayCounts);
        console.log('Événements problématiques:', problematicEvents.length > 0 ? problematicEvents : 'Aucun');
        console.groupEnd();
        
        // Mettre à jour le compteur
        this.state.visibleCount = displayCounts.visible;
        
        return {
            typeCounts,
            displayCounts,
            problematicEvents
        };
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
        const todayFilter = document.querySelector(this.config.dateFilters.todaySelector);
        const weekFilter = document.querySelector(this.config.dateFilters.weekSelector);
        
        if (todayFilter) {
            todayFilter.addEventListener('click', () => {
                console.log('📅 Clic sur filtre aujourd\'hui');
                this.setDateFilter('today');
            });
        }
        
        if (weekFilter) {
            weekFilter.addEventListener('click', () => {
                console.log('📅 Clic sur filtre semaine');
                this.setDateFilter('week');
            });
        }
        
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
        console.time('applyFilters');
        console.log(`🔍 Application des filtres: dateFilter=${this.state.dateFilter}, categoryFilter=${this.state.categoryFilter}`);
        
        // Mettre à jour les métriques
        this.state.filterCount++;
        this.state.lastFilterTime = new Date().toISOString();
        
        const eventsContainer = document.querySelector(this.config.eventContainers.main);
        if (!eventsContainer) {
            console.error('❌ Conteneur d\'événements non trouvé pour l\'application des filtres');
            console.timeEnd('applyFilters');
            return;
        }
        
        const events = eventsContainer.querySelectorAll(this.config.eventContainers.itemClass);
        console.log(`📊 Filtrage de ${events.length} événements`);
        
        // CORRECTION: S'assurer que tous les événements ont leurs attributs avant de filtrer
        this.ensureDataTypeAttributes();
        
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
                    visible: shouldBeVisible,
                    date: event.querySelector('.event-date')?.textContent || 'Pas de date'
                });
            }
        });
        
        console.log(`✓ Filtrage terminé: ${visibleCount} événements visibles, ${hiddenCount} masqués`);
        
        if (detailEvents.length > 0) {
            console.log('Détails des premiers événements:', detailEvents);
        }
        
        // Vérifier s'il y a des événements visibles
        this.checkForEmptyResults(eventsContainer);
        
        // Mettre à jour le compteur
        this.state.visibleCount = visibleCount;
        
        // Mettre à jour l'indicateur d'événements
        this.logFilteringMetrics();
        
        console.timeEnd('applyFilters');
        return visibleCount; // Retourne le nombre d'événements visibles pour des tests
    },
    
    // Vérifier si un événement correspond au filtre de date
    matchesDateFilter: function(eventElement) {
        // Si aucun filtre n'est actif, tout montrer
        if (!this.state.dateFilter || this.state.dateFilter === 'week') {
            return true;
        }
        
        // Pour le filtre 'today', vérifier la date de l'événement
        if (this.state.dateFilter === 'today') {
            try {
                // UTILISATION DU NOUVEAU SYSTÈME DE NORMALISATION
                if (window.DateNormalizer) {
                    // Trouver l'élément date dans l'événement
                    const dateElement = eventElement.querySelector('.event-date');
                    
                    if (!dateElement) {
                        console.warn('⚠️ Élément de date non trouvé pour un événement');
                        return true; // Si pas de date, on le montre par défaut
                    }
                    
                    const eventDate = dateElement.textContent.trim();
                    const todayStr = window.DateNormalizer.getTodayFormatted();
                    
                    // Utiliser le comparateur normalisé
                    return window.DateNormalizer.areEqual(eventDate, todayStr);
                } 
                // Fallback à l'ancienne méthode si DateNormalizer n'est pas disponible
                else {
                    // Formatage de la date actuelle au format français (JJ/MM/AAAA)
                    const today = new Date();
                    const todayStr = [
                        String(today.getDate()).padStart(2, '0'),
                        String(today.getMonth() + 1).padStart(2, '0'),
                        today.getFullYear()
                    ].join('/');
                    
                    // Trouver l'élément date dans l'événement
                    const dateElement = eventElement.querySelector('.event-date');
                    
                    if (!dateElement) {
                        console.warn('⚠️ Élément de date non trouvé pour un événement');
                        return true; // Si pas de date, on le montre par défaut
                    }
                    
                    const eventDate = dateElement.textContent.trim();
                    
                    // CORRECTION: Normaliser manuellement la date pour la comparaison
                    const normalizedEventDate = eventDate.replace(/\s/g, '');
                    
                    // Vérifier si la date de l'événement correspond à aujourd'hui
                    const matches = normalizedEventDate === todayStr;
                    
                    // Pour le débogage
                    if (eventElement.getAttribute('data-debug') === 'true') {
                        console.log(`📅 Comparaison date: "${normalizedEventDate}" == "${todayStr}" => ${matches ? 'Oui' : 'Non'}`);
                    }
                    
                    return matches;
                }
            } catch (e) {
                console.error('❌ Erreur lors du filtrage par date:', e);
                return true; // En cas d'erreur, on montre par défaut
            }
        }
        
        return true; // Par défaut, accepter tous les événements
    },
    
    // Vérifier si un événement correspond au filtre de catégorie
    matchesCategoryFilter: function(eventElement) {
        if (this.state.categoryFilter === 'all') {
            return true; // Accepter toutes les catégories
        }
        
        // CORRECTION: Obtenir le type de l'événement avec un fallback plus robuste
        let eventType = eventElement.getAttribute('data-type');
        
        // Si l'événement n'a pas d'attribut data-type, essayer d'autres méthodes
        if (!eventType) {
            console.warn(`⚠️ Événement sans attribut data-type: ${eventElement.textContent.substring(0, 30)}...`);
            
            // Essayer de trouver une classe event-type-*
            const classList = Array.from(eventElement.classList);
            const typeClass = classList.find(cls => cls.startsWith('event-type-'));
            
            if (typeClass) {
                eventType = typeClass.replace('event-type-', '');
                console.log(`ℹ️ Type obtenu à partir de la classe: ${eventType}`);
                
                // CORRECTION: Ajouter l'attribut data-type manquant pour le futur
                eventElement.setAttribute('data-type', eventType);
            } else {
                // Valeur par défaut si rien n'est trouvé
                eventType = 'economic';
                eventElement.setAttribute('data-type', eventType);
                console.log(`ℹ️ Type par défaut attribué: ${eventType}`);
            }
        }
        
        // CORRECTION: Normaliser le type merger -> m&a pour cohérence
        if (eventType === 'merger') {
            eventType = 'm&a';
            eventElement.setAttribute('data-type', 'm&a');
        }
        
        // AJOUT: Toujours s'assurer que le type est en minuscules
        eventType = eventType.toLowerCase();
        
        // Vérifier si l'événement a la catégorie recherchée
        return eventType === this.state.categoryFilter.toLowerCase();
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
        let allDates = [];
        
        events.forEach((event, index) => {
            const dateElement = event.querySelector('.event-date');
            if (dateElement) {
                const dateText = dateElement.textContent.trim();
                allDates.push(dateText);
                
                if (!firstDate) firstDate = dateText;
                
                if (!dateFormat.test(dateText)) {
                    console.warn(`⚠️ Format de date incorrect: "${dateText}" pour événement #${index+1}`);
                    formatCorrect = false;
                }
            }
        });
        
        if (!formatCorrect) {
            console.warn(`⚠️ Certaines dates ne sont pas au format jj/mm/aaaa. Exemple: "${firstDate}"`);
            // AJOUT: Afficher toutes les dates uniques trouvées
            const uniqueDates = [...new Set(allDates)];
            console.log('Dates trouvées:', uniqueDates);
        } else {
            console.log('✅ Format de date vérifié: toutes les dates sont au format jj/mm/aaaa');
        }
    }
};

// Fonction pour ajouter des attributs data-type manquants
function fixMissingDataTypes() {
    // Obtenir tous les événements
    const events = document.querySelectorAll('.event-card');
    console.log(`🔧 Vérification de ${events.length} événements pour les attributs data-type manquants...`);
    
    let fixed = 0;
    
    events.forEach((event, index) => {
        // Vérifier si l'attribut data-type est présent
        if (!event.hasAttribute('data-type')) {
            // Essayer d'extraire le type à partir des classes
            const classList = Array.from(event.classList);
            const typeClass = classList.find(cls => cls.startsWith('event-type-'));
            
            if (typeClass) {
                const extractedType = typeClass.replace('event-type-', '');
                event.setAttribute('data-type', extractedType);
                console.log(`✅ Attribut data-type ajouté: ${extractedType} pour événement #${index+1}`);
                fixed++;
            } else {
                // Vérifier s'il y a des indices dans le contenu
                const title = event.querySelector('h3')?.textContent || '';
                
                // CORRECTION: Choisir un type basé sur le titre si possible
                let defaultType = 'economic'; // Valeur par défaut
                
                if (title.toLowerCase().includes('ipo')) {
                    defaultType = 'ipo';
                } else if (title.toLowerCase().includes('m&a') || 
                           title.toLowerCase().includes('merger') || 
                           title.toLowerCase().includes('acquisition')) {
                    defaultType = 'm&a';
                }
                
                event.setAttribute('data-type', defaultType);
                console.log(`⚠️ Attribut data-type défaut (${defaultType}) pour événement #${index+1}: ${title.substring(0, 30)}`);
                fixed++;
            }
        }
        
        // CORRECTION: Vérifier et convertir 'merger' en 'm&a'
        if (event.getAttribute('data-type') === 'merger') {
            event.setAttribute('data-type', 'm&a');
            console.log(`🔄 Type 'merger' converti en 'm&a' pour événement #${index+1}`);
            fixed++;
        }
        
        // AJOUT: Toujours s'assurer que le type est en minuscules
        const currentType = event.getAttribute('data-type');
        if (currentType && currentType !== currentType.toLowerCase()) {
            event.setAttribute('data-type', currentType.toLowerCase());
            fixed++;
            console.log(`🔄 Conversion de "${currentType}" en minuscules pour événement #${index+1}`);
        }
        
        // Vérifier si l'élément .event-date est présent
        if (!event.querySelector('.event-date')) {
            // Créer un élément date si manquant
            const today = new Date();
            const dateStr = [
                String(today.getDate()).padStart(2, '0'),
                String(today.getMonth() + 1).padStart(2, '0'), 
                today.getFullYear()
            ].join('/');
            
            const dateEl = document.createElement('span');
            dateEl.className = 'event-date';
            dateEl.style.display = 'none';
            dateEl.textContent = dateStr;
            event.appendChild(dateEl);
            console.log(`⚠️ Élément .event-date ajouté avec date par défaut (${dateStr}) pour événement #${index+1}`);
        }
    });
    
    return fixed;
}

// Ajouter une fonction globale pour fixer les problèmes et forcer le filtrage
window.forceFilter = function(category = null, dateFilter = null) {
    console.log('🛠️ Forçage du filtrage avec réparation des attributs manquants...');
    
    // Fixer les attributs manquants
    const fixed = fixMissingDataTypes();
    console.log(`🔧 ${fixed} événements réparés`);
    
    // Appliquer les filtres spécifiés
    if (window.EventFilters) {
        if (category) {
            window.EventFilters.setCategoryFilter(category);
        }
        
        if (dateFilter) {
            window.EventFilters.setDateFilter(dateFilter);
        }
        
        // Appliquer les filtres
        const visible = window.EventFilters.applyFilters();
        console.log(`✅ Filtrage forcé terminé: ${visible} événements visibles`);
    } else {
        console.error('❌ EventFilters non initialisé. Veuillez recharger la page.');
    }
};

// Fonction de test automatique pour les filtres
window.runEventTests = function() {
    console.group('🧪 TESTS AUTOMATIQUES DES FILTRES D\'ÉVÉNEMENTS');
    
    if (!window.EventFilters) {
        console.error('❌ EventFilters non initialisé!');
        console.groupEnd();
        return { error: 'EventFilters non initialisé' };
    }
    
    // Sauvegarder l'état actuel
    const originalState = {
        dateFilter: window.EventFilters.state.dateFilter,
        categoryFilter: window.EventFilters.state.categoryFilter
    };
    
    console.log('État d\'origine:', originalState);
    
    // Résultats des tests
    const results = {
        filters: {},
        combinations: {},
        dataTypes: {},
        dateFormats: {},
        summary: {}
    };
    
    // 1. Test des filtres de catégorie
    console.log('1️⃣ Test des filtres par catégorie:');
    
    // Obtenir tous les boutons de catégorie
    const categoryButtons = document.querySelectorAll('#event-category-filters button');
    const categories = Array.from(categoryButtons).map(btn => btn.getAttribute('data-category'));
    
    // Tester chaque catégorie
    categories.forEach(category => {
        window.EventFilters.setCategoryFilter(category);
        
        // Compter les événements visibles
        const visibleCount = [...document.querySelectorAll('.event-card')].filter(
            card => window.getComputedStyle(card).display !== 'none'
        ).length;
        
        results.filters[category] = visibleCount;
        console.log(`  - ${category}: ${visibleCount} événements visibles`);
    });
    
    // 2. Test des filtres de date
    console.log('2️⃣ Test des filtres par date:');
    
    ['today', 'week'].forEach(dateFilter => {
        window.EventFilters.setDateFilter(dateFilter);
        
        // Compter les événements visibles
        const visibleCount = [...document.querySelectorAll('.event-card')].filter(
            card => window.getComputedStyle(card).display !== 'none'
        ).length;
        
        results.filters[dateFilter] = visibleCount;
        console.log(`  - ${dateFilter}: ${visibleCount} événements visibles`);
    });
    
    // 3. Test des combinaisons importantes
    console.log('3️⃣ Test des combinaisons importantes:');
    
    const combinations = [
        { date: 'today', category: 'all' },
        { date: 'today', category: 'economic' },
        { date: 'today', category: 'ipo' },
        { date: 'today', category: 'm&a' },
        { date: 'week', category: 'all' }
    ];
    
    combinations.forEach(combo => {
        window.EventFilters.setDateFilter(combo.date);
        window.EventFilters.setCategoryFilter(combo.category);
        
        // Compter les événements visibles
        const visibleCount = [...document.querySelectorAll('.event-card')].filter(
            card => window.getComputedStyle(card).display !== 'none'
        ).length;
        
        const comboKey = `${combo.date}+${combo.category}`;
        results.combinations[comboKey] = visibleCount;
        console.log(`  - ${comboKey}: ${visibleCount} événements visibles`);
    });
    
    // 4. Vérification des attributs data-type
    console.log('4️⃣ Vérification des attributs data-type:');
    
    const events = document.querySelectorAll('.event-card');
    const typeCounts = {};
    let missingTypes = 0;
    
    events.forEach(event => {
        const type = event.getAttribute('data-type');
        if (type) {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        } else {
            missingTypes++;
        }
    });
    
    results.dataTypes = {
        counts: typeCounts,
        missing: missingTypes
    };
    
    console.log(`  - Types trouvés: ${Object.keys(typeCounts).join(', ')}`);
    console.log(`  - Répartition: `, typeCounts);
    console.log(`  - Types manquants: ${missingTypes}`);
    
    // 5. Vérification des formats de date
    console.log('5️⃣ Vérification des formats de date:');
    
    const dateFormat = /^\d{2}\/\d{2}\/\d{4}$/;
    let validDates = 0;
    let invalidDates = 0;
    const uniqueDates = new Set();
    
    events.forEach(event => {
        const dateEl = event.querySelector('.event-date');
        if (dateEl) {
            const dateText = dateEl.textContent.trim();
            uniqueDates.add(dateText);
            
            if (dateFormat.test(dateText)) {
                validDates++;
            } else {
                invalidDates++;
            }
        }
    });
    
    results.dateFormats = {
        valid: validDates,
        invalid: invalidDates,
        unique: Array.from(uniqueDates)
    };
    
    console.log(`  - Dates valides: ${validDates}`);
    console.log(`  - Dates invalides: ${invalidDates}`);
    console.log(`  - Dates uniques: ${Array.from(uniqueDates).join(', ')}`);
    
    // 6. Résumé et recommandations
    const hasDataTypeIssues = missingTypes > 0;
    const hasDateFormatIssues = invalidDates > 0;
    const filteringWorking = results.combinations['week+all'] >= results.combinations['today+all'];
    
    results.summary = {
        totalEvents: events.length,
        dataTypeIssues: hasDataTypeIssues,
        dateFormatIssues: hasDateFormatIssues,
        filteringWorking: filteringWorking
    };
    
    console.log('6️⃣ Résumé des tests:');
    console.log(`  - Nombre total d'événements: ${events.length}`);
    console.log(`  - Problèmes de type de données: ${hasDataTypeIssues ? '❌ Oui' : '✅ Non'}`);
    console.log(`  - Problèmes de format de date: ${hasDateFormatIssues ? '❌ Oui' : '✅ Non'}`);
    console.log(`  - Filtrage fonctionne correctement: ${filteringWorking ? '✅ Oui' : '❌ Non'}`);
    
    // Recommandations
    console.log('7️⃣ Recommandations:');
    
    if (hasDataTypeIssues) {
        console.log('  - ❗ Exécutez window.fixEvents() pour réparer les attributs data-type manquants');
    }
    
    if (hasDateFormatIssues) {
        console.log('  - ❗ Vérifiez le format des dates dans news.json');
    }
    
    if (!filteringWorking) {
        console.log('  - ❗ Le filtre semaine devrait montrer plus d\'événements que le filtre jour');
    }
    
    // Restaurer l'état original
    window.EventFilters.setDateFilter(originalState.dateFilter);
    window.EventFilters.setCategoryFilter(originalState.categoryFilter);
    
    console.log('Tests terminés, état d\'origine restauré');
    console.groupEnd();
    
    return results;
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Chargement du unified-event-filters.js');
    
    // Attendre que le module DateNormalizer soit chargé
    const checkDateNormalizer = () => {
        if (window.DateNormalizer) {
            console.log('✅ DateNormalizer détecté, initialisation des filtres');
            initializeFilters();
        } else {
            console.log('⏳ Attente du chargement de DateNormalizer...');
            setTimeout(checkDateNormalizer, 100);
        }
    };
    
    // CORRECTION: Vérifier la présence du module DateNormalizer
    setTimeout(checkDateNormalizer, 300);
    
    // Fonction d'initialisation
    function initializeFilters() {
        // Réinitialiser l'état si nécessaire
        if (UnifiedEventFilters.state.initialized) {
            UnifiedEventFilters.state.initialized = false;
        }
        
        // Initialiser
        UnifiedEventFilters.init();
        
        // Exposer des fonctions de débogage globales
        window.debugFilters = function() {
            if (window.EventFilters) {
                return window.EventFilters.debug();
            } else {
                console.error('❌ EventFilters n\'est pas initialisé');
                return null;
            }
        };
        
        // Fonction pour obtenir les événements visibles
        window.getVisibleEvents = function() {
            return [...document.querySelectorAll('.event-card')]
                .filter(e => e.style.display !== 'none')
                .map(e => ({
                    title: e.getAttribute('data-title') || e.querySelector('h3')?.textContent || 'Sans titre',
                    type: e.getAttribute('data-type') || 'unknown',
                    date: e.querySelector('.event-date')?.textContent || 'Pas de date'
                }));
        };
        
        // NOUVELLE FONCTION: Corriger explicitement les problèmes de filtrage
        window.fixEventFilters = function() {
            console.log('🔧 Correction manuelle des filtres d\'événements...');
            
            // 1. Corriger tous les attributs manquants
            fixMissingDataTypes();
            
            // 2. Réinitialiser l'état des filtres
            if (window.EventFilters) {
                // Forcer un rafraîchissement des filtres
                window.EventFilters.setDateFilter('week');
                setTimeout(() => {
                    window.EventFilters.setDateFilter('today');
                }, 100);
                
                // Forcer le filtre "Tous"
                setTimeout(() => {
                    window.EventFilters.setCategoryFilter('all');
                }, 200);
                
                console.log('✅ Filtres réinitialisés avec succès');
            } else {
                console.error('❌ EventFilters non disponible');
            }
            
            return 'Correction des filtres terminée';
        };
    }
});
