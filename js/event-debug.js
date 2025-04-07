/**
 * event-debug.js
 * Outils de débogage pour les événements et les filtres
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
                        classes: Array.from(card.classList).join(', ')
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
                categoryFilter: window.EventFilters.state.categoryFilter
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
    
    // Test de filtrage en direct
    testFilters: function() {
        console.group('🧪 TEST DES FILTRES');
        
        // Vérifier si EventFilters est initialisé
        if (!window.EventFilters) {
            console.error('❌ EventFilters n\'est pas initialisé');
            console.groupEnd();
            return;
        }
        
        const eventCards = document.querySelectorAll('.event-card');
        if (eventCards.length === 0) {
            console.warn('⚠️ Aucune carte d\'événement trouvée');
            console.groupEnd();
            return;
        }
        
        // Sauvegarder l'état actuel
        const originalState = {
            dateFilter: window.EventFilters.state.dateFilter,
            categoryFilter: window.EventFilters.state.categoryFilter
        };
        
        // Tester les différentes combinaisons de filtres
        const categories = ['all', 'economic', 'ipo', 'm&a'];
        const results = {};
        
        categories.forEach(category => {
            // Appliquer la catégorie
            window.EventFilters.setCategoryFilter(category);
            
            // Vérifier les résultats
            const visible = Array.from(eventCards).filter(card => 
                window.getComputedStyle(card).display !== 'none'
            ).length;
            
            results[category] = visible;
        });
        
        console.log('Résultats du test de filtrage par catégorie:', results);
        
        // Restaurer l'état d'origine
        window.EventFilters.setCategoryFilter(originalState.categoryFilter);
        
        console.groupEnd();
        
        return results;
    },
    
    // Corriger les attributs data-type manquants
    fixDataTypes: function() {
        console.group('🔧 CORRECTION DES ATTRIBUTS DATA-TYPE');
        
        const eventCards = document.querySelectorAll('.event-card');
        let fixed = 0;
        
        eventCards.forEach((card, index) => {
            if (!card.hasAttribute('data-type')) {
                // Essayer de détecter le type
                let detectedType = 'economic'; // Type par défaut
                
                // Vérifier le titre pour détecter le type
                const title = card.querySelector('h3')?.textContent || '';
                if (title.startsWith('IPO:')) {
                    detectedType = 'ipo';
                } else if (title.startsWith('M&A:')) {
                    detectedType = 'm&a';
                }
                
                // Vérifier d'autres éléments
                if (title.includes('Fed') || title.includes('Inflation') || 
                    title.includes('GDP') || title.includes('Economic')) {
                    detectedType = 'economic';
                }
                
                // Appliquer le type détecté
                card.setAttribute('data-type', detectedType);
                console.log(`✅ Carte #${index+1} corrigée avec type '${detectedType}'`);
                fixed++;
            }
        });
        
        console.log(`Correction terminée: ${fixed} cartes corrigées`);
        console.groupEnd();
        
        // Rafraîchir les filtres si EventFilters est disponible
        if (window.EventFilters) {
            window.EventFilters.applyFilters();
        }
        
        return fixed;
    }
};

// Ajouter un message dans la console
console.log('🛠️ Outils de débogage des événements chargés! Utilisez window.debug.events(), window.debug.testFilters() ou window.debug.fixDataTypes() pour diagnostiquer et corriger les problèmes de filtrage.');

// Exporter vers window
window.debugEvents = window.debug.events;
window.testFilters = window.debug.testFilters;
window.fixEventTypes = window.debug.fixDataTypes;