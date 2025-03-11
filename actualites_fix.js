/**
 * actualites_fix.js - Implémentation des filtres pour la page actualités
 * Ce script rend opérationnels tous les filtres présents sur la page des actualités.
 */

document.addEventListener('DOMContentLoaded', function() {
    // ===== Sélection des éléments DOM =====
    // Filtres de catégorie
    const categoryFilters = document.querySelectorAll('#category-filters button');
    
    // Filtres de sélection
    const sortSelect = document.getElementById('sort-select');
    const impactSelect = document.getElementById('impact-select');
    const countrySelect = document.getElementById('country-select');
    
    // Filtres d'événements
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    
    // Conteneurs d'articles et d'événements
    const newsItems = document.querySelectorAll('.news-item');
    const eventItems = document.querySelectorAll('.event-item');
    
    // État des filtres actifs
    const activeFilters = {
        category: 'all',
        impact: 'all',
        country: 'all',
        sort: 'recent',
        eventDate: 'today'
    };

    // ===== Fonctions de filtrage =====
    
    /**
     * Applique tous les filtres actifs aux éléments d'actualités
     */
    function applyFilters() {
        // Compteurs pour gérer les messages "aucun élément"
        let visibleNewsCount = 0;
        let visibleEventsCount = 0;
        
        // Filtrer les actualités
        newsItems.forEach(item => {
            const category = item.dataset.category;
            const impact = item.dataset.impact;
            const country = item.dataset.country;
            const date = item.dataset.date;
            
            // Vérifier si l'élément passe tous les filtres actifs
            const matchesCategory = activeFilters.category === 'all' || category === activeFilters.category;
            const matchesImpact = activeFilters.impact === 'all' || impact === activeFilters.impact;
            const matchesCountry = activeFilters.country === 'all' || country === activeFilters.country;
            
            // Si l'élément correspond à tous les critères, l'afficher
            if (matchesCategory && matchesImpact && matchesCountry) {
                item.classList.remove('hidden-item');
                visibleNewsCount++;
                
                // Ajouter une animation de fondu
                item.classList.add('fade-in');
                // Supprimer la classe d'animation après l'animation
                setTimeout(() => {
                    item.classList.remove('fade-in');
                }, 500);
            } else {
                item.classList.add('hidden-item');
            }
        });
        
        // Filtrer les événements
        eventItems.forEach(item => {
            const eventDate = item.dataset.date;
            
            if (eventDate === activeFilters.eventDate) {
                item.classList.remove('hidden-item');
                visibleEventsCount++;
                
                // Ajouter une animation de fondu
                item.classList.add('fade-in');
                // Supprimer la classe d'animation après l'animation
                setTimeout(() => {
                    item.classList.remove('fade-in');
                }, 500);
            } else {
                item.classList.add('hidden-item');
            }
        });
        
        // Afficher les messages "aucun élément" si nécessaire
        handleEmptyState(visibleNewsCount, visibleEventsCount);
        
        // Appliquer le tri
        sortItems();
    }
    
    /**
     * Trie les articles visibles selon le critère sélectionné
     */
    function sortItems() {
        const container = document.getElementById('recent-news');
        if (!container) return;
        
        const featuredContainer = document.getElementById('featured-news');
        
        // Récupérer tous les éléments visibles
        const visibleItems = Array.from(newsItems).filter(item => !item.classList.contains('hidden-item'));
        
        // Déterminer la fonction de comparaison en fonction du tri choisi
        let compareFunction;
        
        switch (activeFilters.sort) {
            case 'recent':
                compareFunction = (a, b) => {
                    const dateA = new Date(a.dataset.date);
                    const dateB = new Date(b.dataset.date);
                    return dateB - dateA;
                };
                break;
            case 'older':
                compareFunction = (a, b) => {
                    const dateA = new Date(a.dataset.date);
                    const dateB = new Date(b.dataset.date);
                    return dateA - dateB;
                };
                break;
            case 'impact-high':
                compareFunction = (a, b) => {
                    const impactOrder = { positive: 3, neutral: 2, negative: 1 };
                    return impactOrder[b.dataset.impact] - impactOrder[a.dataset.impact];
                };
                break;
            case 'impact-low':
                compareFunction = (a, b) => {
                    const impactOrder = { positive: 3, neutral: 2, negative: 1 };
                    return impactOrder[a.dataset.impact] - impactOrder[b.dataset.impact];
                };
                break;
            default:
                compareFunction = (a, b) => {
                    const dateA = new Date(a.dataset.date);
                    const dateB = new Date(b.dataset.date);
                    return dateB - dateA;
                };
        }
        
        // Trier les éléments visibles
        const sortedItems = visibleItems.sort(compareFunction);
        
        // Réorganiser les éléments dans le DOM pour les actualités récentes
        const recentNewsItems = sortedItems.filter(item => !item.closest('#featured-news'));
        
        if (recentNewsItems.length > 0 && container) {
            // Détacher les éléments et les réattacher dans l'ordre trié
            recentNewsItems.forEach(item => {
                item.remove();
                container.appendChild(item);
            });
        }
        
        // Réorganiser les éléments dans le DOM pour les actualités à la une
        const featuredNewsItems = sortedItems.filter(item => item.closest('#featured-news'));
        
        if (featuredNewsItems.length > 0 && featuredContainer) {
            // Détacher les éléments et les réattacher dans l'ordre trié
            featuredNewsItems.forEach(item => {
                item.remove();
                featuredContainer.appendChild(item);
            });
        }
    }
    
    /**
     * Gère l'affichage des messages "aucun élément"
     */
    function handleEmptyState(visibleNewsCount, visibleEventsCount) {
        // Conteneurs de messages
        let noNewsMessage = document.getElementById('no-news-message');
        let noEventsMessage = document.getElementById('no-events-message');
        
        // Créer les messages s'ils n'existent pas
        if (!noNewsMessage) {
            noNewsMessage = document.createElement('div');
            noNewsMessage.id = 'no-news-message';
            noNewsMessage.className = 'w-full p-6 text-center rounded-lg my-8 animate-pulse';
            noNewsMessage.innerHTML = `
                <i class="fas fa-search-minus text-4xl mb-4 opacity-50"></i>
                <p class="text-gray-400">Aucune actualité correspondant à vos critères de filtrage.</p>
                <button id="reset-news-filters" class="mt-4 px-4 py-2 text-xs border border-green-400 text-green-400 rounded-full hover:bg-green-400 hover:bg-opacity-10 transition-all duration-300">
                    Réinitialiser les filtres
                </button>
            `;
            
            // Insérer après la section d'actualités récentes
            const recentNewsSection = document.querySelector('#recent-news');
            if (recentNewsSection) {
                recentNewsSection.parentNode.appendChild(noNewsMessage);
            }
            
            // Ajouter l'événement pour réinitialiser les filtres
            document.getElementById('reset-news-filters').addEventListener('click', resetNewsFilters);
        }
        
        if (!noEventsMessage) {
            noEventsMessage = document.createElement('div');
            noEventsMessage.id = 'no-events-message';
            noEventsMessage.className = 'w-full p-6 text-center rounded-lg my-4 animate-pulse';
            noEventsMessage.innerHTML = `
                <i class="fas fa-calendar-times text-4xl mb-4 opacity-50"></i>
                <p class="text-gray-400">Aucun événement prévu pour cette période.</p>
            `;
            
            // Insérer après la grille d'événements
            const eventsGrid = document.querySelector('#events-section .grid');
            if (eventsGrid) {
                eventsGrid.parentNode.appendChild(noEventsMessage);
            }
        }
        
        // Afficher ou masquer les messages
        if (visibleNewsCount === 0) {
            // Masquer les conteneurs d'actualités
            document.getElementById('featured-news')?.classList.add('hidden-item');
            document.getElementById('recent-news')?.classList.add('hidden-item');
            
            // Afficher le message
            noNewsMessage.classList.remove('hidden-item');
        } else {
            // Afficher les conteneurs d'actualités
            document.getElementById('featured-news')?.classList.remove('hidden-item');
            document.getElementById('recent-news')?.classList.remove('hidden-item');
            
            // Masquer le message
            noNewsMessage.classList.add('hidden-item');
        }
        
        if (visibleEventsCount === 0) {
            // Masquer la grille d'événements
            const eventsGrid = document.querySelector('#events-section .grid');
            if (eventsGrid) {
                eventsGrid.classList.add('hidden-item');
            }
            
            // Afficher le message
            noEventsMessage.classList.remove('hidden-item');
        } else {
            // Afficher la grille d'événements
            const eventsGrid = document.querySelector('#events-section .grid');
            if (eventsGrid) {
                eventsGrid.classList.remove('hidden-item');
            }
            
            // Masquer le message
            noEventsMessage.classList.add('hidden-item');
        }
    }
    
    /**
     * Réinitialise tous les filtres d'actualités
     */
    function resetNewsFilters() {
        // Réinitialiser l'état des filtres
        activeFilters.category = 'all';
        activeFilters.impact = 'all';
        activeFilters.country = 'all';
        activeFilters.sort = 'recent';
        
        // Réinitialiser l'interface
        categoryFilters.forEach(btn => {
            if (btn.dataset.category === 'all') {
                btn.classList.add('filter-active');
                btn.classList.add('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                btn.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
            } else {
                btn.classList.remove('filter-active');
                btn.classList.remove('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
            }
        });
        
        // Réinitialiser les sélecteurs
        sortSelect.value = 'recent';
        impactSelect.value = 'all';
        countrySelect.value = 'all';
        
        // Appliquer les filtres réinitialisés
        applyFilters();
    }
    
    // ===== Gestionnaires d'événements =====
    
    // Filtres de catégorie
    categoryFilters.forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            
            // Mettre à jour l'état actif
            activeFilters.category = category;
            
            // Mettre à jour l'affichage des boutons
            categoryFilters.forEach(btn => {
                if (btn.dataset.category === category) {
                    btn.classList.add('filter-active');
                    btn.classList.add('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                    btn.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
                } else {
                    btn.classList.remove('filter-active');
                    btn.classList.remove('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                    btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
                }
            });
            
            // Appliquer les filtres
            applyFilters();
        });
    });
    
    // Sélecteur de tri
    sortSelect.addEventListener('change', function() {
        activeFilters.sort = this.value;
        applyFilters();
    });
    
    // Sélecteur d'impact
    impactSelect.addEventListener('change', function() {
        activeFilters.impact = this.value;
        applyFilters();
    });
    
    // Sélecteur de pays
    countrySelect.addEventListener('change', function() {
        activeFilters.country = this.value;
        applyFilters();
    });
    
    // Filtres d'événements (aujourd'hui/cette semaine)
    if (todayBtn) {
        todayBtn.addEventListener('click', function() {
            activeFilters.eventDate = 'today';
            
            // Mettre à jour l'affichage des boutons
            todayBtn.classList.add('filter-active');
            todayBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            weekBtn.classList.remove('filter-active');
            weekBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Appliquer les filtres
            applyFilters();
        });
    }
    
    if (weekBtn) {
        weekBtn.addEventListener('click', function() {
            activeFilters.eventDate = 'week';
            
            // Mettre à jour l'affichage des boutons
            weekBtn.classList.add('filter-active');
            weekBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            todayBtn.classList.remove('filter-active');
            todayBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Appliquer les filtres
            applyFilters();
        });
    }
    
    // Appliquer les filtres par défaut au chargement de la page
    applyFilters();
    
    // Ajouter des messages de débogage
    console.log('✅ Filtres initialisés avec succès');
    console.log('📋 État initial des filtres:', activeFilters);
    
    // Surveiller les ajouts dynamiques d'articles (comme le bouton "Voir plus")
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            // Attendre que les nouveaux éléments soient ajoutés au DOM (après le délai simulé de 1s)
            setTimeout(() => {
                // Réappliquer les sélecteurs aux nouveaux éléments
                const newNewsItems = document.querySelectorAll('.news-item:not(.filtered-initialized)');
                
                // Marquer les nouveaux éléments comme initialisés
                newNewsItems.forEach(item => {
                    item.classList.add('filtered-initialized');
                });
                
                // Mettre à jour la liste des éléments filtrables
                applyFilters();
                
                console.log('✅ Nouveaux éléments ajoutés aux filtres');
            }, 1100);
        });
    }
});