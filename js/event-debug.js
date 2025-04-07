/**
 * event-debug.js
 * Outils de débogage améliorés pour les événements et les filtres
 * Version 2.0 - Avril 2025
 */

// Fonction de débogage unifiée
window.debug = {
    // Examiner les événements
    events: function() {
        console.group('🔍 DÉBOGAGE DES ÉVÉNEMENTS');
        
        // Vérifier si les composants sont disponibles
        console.log('Composants disponibles:', {
            eventsManager: !!window.eventsManager,
            EventFilters: !!window.EventFilters
        });
        
        // Trouver les cartes d'événements
        const eventCards = document.querySelectorAll('.event-card');
        console.log(`📊 ${eventCards.length} cartes d'événements trouvées`);
        
        if (eventCards.length > 0) {
            // Analyser les types d'événements
            const types = {};
            const visibleCount = {visible: 0, hidden: 0};
            const problemCards = [];
            
            eventCards.forEach((card, index) => {
                const type = card.getAttribute('data-type');
                const visible = window.getComputedStyle(card).display !== 'none';
                
                // Compter par type
                types[type] = (types[type] || 0) + 1;
                
                // Compter visibles/cachés
                if (visible) visibleCount.visible++; else visibleCount.hidden++;
                
                // Identifier les cartes problématiques
                if (!type) {
                    problemCards.push({
                        index,
                        text: card.textContent.trim().substring(0, 30) + '...'
                    });
                }
                
                // Afficher les 3 premières cartes en détail
                if (index < 3) {
                    console.log(`Carte #${index+1}:`, {
                        type,
                        visible,
                        title: (card.querySelector('h3')?.textContent || '').substring(0, 30) + '...',
                        classes: Array.from(card.classList).join(', '),
                        date: card.querySelector('.event-date')?.textContent || 'Pas de date'
                    });
                }
            });
            
            console.log('Types d\'événements:', types);
            console.log('Cartes visibles/cachées:', visibleCount);
            
            if (problemCards.length > 0) {
                console.warn('⚠️ Cartes sans attribut data-type:', problemCards);
            }
        }
        
        // Vérifier les filtres actifs
        if (window.EventFilters) {
            console.log('État des filtres:', {
                dateFilter: window.EventFilters.state.dateFilter,
                categoryFilter: window.EventFilters.state.categoryFilter,
                initialized: window.EventFilters.state.initialized
            });
            
            // Vérifier les boutons de filtre
            const dateFilters = document.querySelectorAll('.filter-button');
            const categoryFilters = document.querySelectorAll('#event-category-filters button');
            
            console.log('Boutons de filtre de date:', Array.from(dateFilters).map(btn => ({
                id: btn.id,
                active: btn.classList.contains('active'),
                text: btn.textContent.trim()
            })));
            
            console.log('Boutons de filtre de catégorie:', Array.from(categoryFilters).map(btn => ({
                category: btn.getAttribute('data-category'),
                active: btn.classList.contains('filter-active'),
                text: btn.textContent.trim()
            })));
        }
        
        console.groupEnd();
    },
    
    // Vérification complète du système de filtrage
    checkFilterSystem: function() {
        console.group('🧪 VÉRIFICATION COMPLÈTE DU SYSTÈME DE FILTRAGE');
        
        // 1. Vérifier la structure HTML
        const eventsSection = document.getElementById('events-section');
        const eventsContainer = document.getElementById('events-container');
        const todayFilter = document.getElementById('today-filter');
        const weekFilter = document.getElementById('week-filter');
        const categoryFilters = document.querySelectorAll('#event-category-filters button');
        
        console.log('Structure HTML:', {
            eventsSection: !!eventsSection,
            eventsContainer: !!eventsContainer,
            todayFilter: !!todayFilter,
            weekFilter: !!weekFilter,
            categoryFilters: categoryFilters.length
        });
        
        // 2. Vérifier les filtres actifs visuellement
        if (todayFilter && weekFilter) {
            console.log('État visuel des filtres de date:', {
                today: {
                    active: todayFilter.classList.contains('active'),
                    hasGreenText: todayFilter.classList.contains('text-green-400')
                },
                week: {
                    active: weekFilter.classList.contains('active'),
                    hasGreenText: weekFilter.classList.contains('text-green-400')
                }
            });
        }
        
        // 3. Vérifier l'état des filtres dans le système
        if (window.EventFilters) {
            console.log('État interne des filtres:', window.EventFilters.state);
        } else {
            console.error('⚠️ Système de filtrage (EventFilters) non initialisé!');
        }
        
        // 4. Vérifier les cartes d'événements
        const eventCards = document.querySelectorAll('.event-card');
        
        if (eventCards.length > 0) {
            console.log(`${eventCards.length} cartes d'événements trouvées`);
            
            // Analyser les attributs data-type
            const dataTypeAnalysis = {
                withDataType: 0,
                withoutDataType: 0,
                types: {}
            };
            
            // Analyser les éléments de date
            const dateElementAnalysis = {
                withDateElement: 0,
                withoutDateElement: 0,
                dates: {}
            };
            
            eventCards.forEach(card => {
                // Vérifier data-type
                const dataType = card.getAttribute('data-type');
                if (dataType) {
                    dataTypeAnalysis.withDataType++;
                    dataTypeAnalysis.types[dataType] = (dataTypeAnalysis.types[dataType] || 0) + 1;
                } else {
                    dataTypeAnalysis.withoutDataType++;
                }
                
                // Vérifier élément de date
                const dateElement = card.querySelector('.event-date');
                if (dateElement) {
                    dateElementAnalysis.withDateElement++;
                    const dateText = dateElement.textContent.trim();
                    dateElementAnalysis.dates[dateText] = (dateElementAnalysis.dates[dateText] || 0) + 1;
                } else {
                    dateElementAnalysis.withoutDateElement++;
                }
            });
            
            console.log('Analyse des attributs data-type:', dataTypeAnalysis);
            console.log('Analyse des éléments de date:', dateElementAnalysis);
        }
        
        // 5. Test de fonction de filtre
        if (window.EventFilters) {
            // Test des filtres de catégorie
            const availableCategories = Array.from(categoryFilters).map(btn => 
                btn.getAttribute('data-category')
            );
            
            console.log('Test de filtrage par catégorie:');
            availableCategories.forEach(category => {
                // Calculer combien d'événements correspondent à cette catégorie
                const matchingEvents = Array.from(eventCards).filter(card => {
                    if (category === 'all') return true;
                    return card.getAttribute('data-type') === category;
                }).length;
                
                console.log(`- ${category}: ${matchingEvents} événements correspondent`);
            });
        }
        
        console.groupEnd();
        
        return {
            html: {
                eventsSection: !!eventsSection,
                eventsContainer: !!eventsContainer,
                todayFilter: !!todayFilter,
                weekFilter: !!weekFilter,
                categoryFilters: categoryFilters.length
            },
            eventCards: eventCards.length
        };
    },
    
    // Solution rapide pour les problèmes de filtrage
    fixFilters: function() {
        console.group('🔧 RÉPARATION RAPIDE DES FILTRES');
        
        // 1. Vérifier et réparer les attributs data-type manquants
        const eventCards = document.querySelectorAll('.event-card');
        let fixedDataType = 0;
        let fixedDateElement = 0;
        
        eventCards.forEach((card, index) => {
            // Réparer data-type si manquant
            if (!card.hasAttribute('data-type')) {
                // Essayer de trouver une classe de type
                const typeClass = Array.from(card.classList).find(cls => cls.startsWith('event-type-'));
                
                // Assigner un type d'après la classe ou le titre
                if (typeClass) {
                    const type = typeClass.replace('event-type-', '');
                    card.setAttribute('data-type', type);
                } else {
                    // Chercher des indices dans le titre
                    const title = card.querySelector('h3')?.textContent || '';
                    let detectedType = 'economic'; // Valeur par défaut
                    
                    if (title.toLowerCase().includes('ipo')) {
                        detectedType = 'ipo';
                    } else if (title.toLowerCase().includes('m&a') || 
                               title.toLowerCase().includes('fusion') || 
                               title.toLowerCase().includes('acquisition')) {
                        detectedType = 'm&a';
                    }
                    
                    card.setAttribute('data-type', detectedType);
                }
                
                fixedDataType++;
            }
            
            // Réparer l'élément de date si manquant
            if (!card.querySelector('.event-date')) {
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
                card.appendChild(dateEl);
                
                fixedDateElement++;
            }
        });
        
        console.log(`${fixedDataType} attributs data-type réparés`);
        console.log(`${fixedDateElement} éléments de date réparés`);
        
        // 2. Réinitialiser et réappliquer les filtres
        if (window.EventFilters) {
            // Sauvegarder l'état actuel
            const currentState = {
                date: window.EventFilters.state.dateFilter,
                category: window.EventFilters.state.categoryFilter
            };
            
            // Appliquer les filtres
            window.EventFilters.applyFilters();
            
            console.log('✅ Filtres réappliqués avec succès');
        } else {
            console.warn('⚠️ EventFilters non disponible, initialisation...');
            // Si EventFilters n'est pas disponible, essayer de l'initialiser
            if (typeof UnifiedEventFilters !== 'undefined') {
                UnifiedEventFilters.init();
                console.log('✅ Système de filtrage initialisé manuellement');
            } else {
                console.error('❌ Impossible d\'initialiser le système de filtrage');
            }
        }
        
        console.groupEnd();
        
        return {
            fixedDataType,
            fixedDateElement
        };
    },
    
    // Test intégral des filtres avec vérification visuelle
    testFiltersVisual: function() {
        console.group('🧪 TEST VISUEL DES FILTRES');
        
        // Uniquement si EventFilters est disponible
        if (!window.EventFilters) {
            console.error('❌ EventFilters non disponible!');
            console.groupEnd();
            return;
        }
        
        // Sauvegarder l'état actuel
        const originalState = {
            dateFilter: window.EventFilters.state.dateFilter,
            categoryFilter: window.EventFilters.state.categoryFilter
        };
        
        console.log('État original:', originalState);
        
        const results = {
            date: {},
            category: {},
            combined: {}
        };
        
        // 1. Tester les filtres de date
        ['today', 'week'].forEach(dateFilter => {
            window.EventFilters.setDateFilter(dateFilter);
            
            // Vérifier UI
            const todayActive = document.getElementById('today-filter').classList.contains('active');
            const weekActive = document.getElementById('week-filter').classList.contains('active');
            
            // Compter événements visibles
            const visibleCount = [...document.querySelectorAll('.event-card')].filter(
                card => window.getComputedStyle(card).display !== 'none'
            ).length;
            
            results.date[dateFilter] = {
                visibleEvents: visibleCount,
                ui: {
                    todayActive,
                    weekActive
                }
            };
        });
        
        // 2. Tester les filtres de catégorie
        const categoryFilters = Array.from(
            document.querySelectorAll('#event-category-filters button')
        ).map(btn => btn.getAttribute('data-category'));
        
        categoryFilters.forEach(category => {
            window.EventFilters.setCategoryFilter(category);
            
            // Vérifier UI
            const activeButton = document.querySelector(`#event-category-filters button[data-category="${category}"]`);
            const isActive = activeButton ? activeButton.classList.contains('filter-active') : false;
            
            // Compter événements visibles
            const visibleCount = [...document.querySelectorAll('.event-card')].filter(
                card => window.getComputedStyle(card).display !== 'none'
            ).length;
            
            results.category[category] = {
                visibleEvents: visibleCount,
                ui: { buttonActive: isActive }
            };
        });
        
        // 3. Tester quelques combinaisons
        const combinations = [
            { date: 'today', category: 'all' },
            { date: 'today', category: 'economic' },
            { date: 'week', category: 'all' }
        ];
        
        combinations.forEach(combo => {
            window.EventFilters.setDateFilter(combo.date);
            window.EventFilters.setCategoryFilter(combo.category);
            
            // Compter événements visibles
            const visibleCount = [...document.querySelectorAll('.event-card')].filter(
                card => window.getComputedStyle(card).display !== 'none'
            ).length;
            
            results.combined[`${combo.date}+${combo.category}`] = visibleCount;
        });
        
        // Restaurer l'état original
        window.EventFilters.setDateFilter(originalState.dateFilter);
        window.EventFilters.setCategoryFilter(originalState.categoryFilter);
        
        console.log('Résultats des tests:', results);
        console.groupEnd();
        
        return results;
    }
};

// Ajouter des raccourcis pour les fonctions de débogage les plus utiles
window.fixEvents = window.debug.fixFilters;
window.checkEvents = window.debug.checkFilterSystem;
window.testEventFilters = window.debug.testFiltersVisual;

// Ajouter un message dans la console
console.log('🛠️ Outils de débogage des événements améliorés! Utilisez:');
console.log('- window.debug.events() - Diagnostic de base');
console.log('- window.checkEvents() - Vérification complète du système');
console.log('- window.fixEvents() - Réparation rapide des problèmes');
console.log('- window.testEventFilters() - Test complet des filtres');

// Exporter vers window pour compatibilité
window.debugEvents = window.debug.events;
