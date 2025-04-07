/**
 * event-filters-simple.js
 * Version simplifiée du système de filtrage des événements
 * Solution autonome qui ne dépend pas d'autres modules
 */

// Exécuter immédiatement au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initialisation du système de filtrage simplifié des événements...');
  
  // S'assurer que le système n'est initialisé qu'une seule fois
  if (window.eventFiltersInitialized) return;
  window.eventFiltersInitialized = true;
  
  // État global des filtres
  window.eventFilters = {
    dateFilter: localStorage.getItem('eventDateFilter') || 'today',
    categoryFilter: localStorage.getItem('eventCategoryFilter') || 'all'
  };
  
  // Attendre un peu que les événements soient chargés dans le DOM
  setTimeout(initializeFilters, 1000);
  
  // Fonction principale d'initialisation
  function initializeFilters() {
    console.log('🔄 Initialisation des filtres...');
    
    // 1. Réparer les attributs data-type manquants
    fixMissingAttributes();
    
    // 2. Configurer les écouteurs d'événements
    setupEventListeners();
    
    // 3. Appliquer les filtres initiaux
    updateFilterUI();
    applyFilters();
    
    console.log('✅ Système de filtrage initialisé!');
    
    // 4. Exposer l'API publique
    window.EventFilterSystem = {
      setDateFilter: setDateFilter,
      setCategoryFilter: setCategoryFilter,
      applyFilters: applyFilters,
      debug: debugFilters,
      fixAttributes: fixMissingAttributes
    };
  }
  
  // S'assurer que tous les événements ont les attributs nécessaires
  function fixMissingAttributes() {
    const events = document.querySelectorAll('.event-card');
    console.log(`🔍 Vérification des attributs pour ${events.length} événements...`);
    
    let fixedTypes = 0;
    let fixedDates = 0;
    
    events.forEach((card, index) => {
      // 1. Corriger les attributs data-type manquants
      if (!card.hasAttribute('data-type')) {
        // Essayer de détecter le type à partir du texte
        const text = card.textContent.toLowerCase();
        let type = 'economic'; // Type par défaut
        
        if (text.includes('ipo') || text.includes('introduction')) {
          type = 'ipo';
        } else if (text.includes('m&a') || text.includes('fusion') || 
                  text.includes('acquisition') || text.includes('merger')) {
          type = 'm&a';
        }
        
        card.setAttribute('data-type', type);
        fixedTypes++;
      }
      
      // 2. Vérifier la classe correspondant au type
      const dataType = card.getAttribute('data-type');
      if (dataType && !card.classList.contains(`event-type-${dataType}`)) {
        card.classList.add(`event-type-${dataType}`);
      }
      
      // 3. Ajouter l'élément .event-date si manquant
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
        fixedDates++;
      }
    });
    
    if (fixedTypes > 0 || fixedDates > 0) {
      console.log(`🔧 Réparations effectuées: ${fixedTypes} attributs data-type, ${fixedDates} éléments de date`);
    } else {
      console.log('✓ Tous les événements ont les attributs requis');
    }
    
    return { fixedTypes, fixedDates };
  }
  
  // Configurer les écouteurs d'événements pour les filtres
  function setupEventListeners() {
    // 1. Filtres de date (aujourd'hui/cette semaine)
    const todayFilter = document.getElementById('today-filter');
    const weekFilter = document.getElementById('week-filter');
    
    if (todayFilter) {
      todayFilter.addEventListener('click', function() {
        setDateFilter('today');
      });
    }
    
    if (weekFilter) {
      weekFilter.addEventListener('click', function() {
        setDateFilter('week');
      });
    }
    
    // 2. Filtres de catégorie
    const categoryButtons = document.querySelectorAll('#event-category-filters button');
    
    categoryButtons.forEach(button => {
      button.addEventListener('click', function() {
        const category = this.getAttribute('data-category');
        setCategoryFilter(category);
      });
    });
    
    console.log(`🔊 Écouteurs configurés: ${categoryButtons.length} filtres de catégorie`);
  }
  
  // Définir le filtre de date et mettre à jour l'UI
  function setDateFilter(filter) {
    if (filter !== 'today' && filter !== 'week') {
      console.warn(`⚠️ Filtre de date invalide: ${filter}`);
      return;
    }
    
    console.log(`📅 Changement de filtre date: ${window.eventFilters.dateFilter} -> ${filter}`);
    window.eventFilters.dateFilter = filter;
    
    // Sauvegarder la préférence
    localStorage.setItem('eventDateFilter', filter);
    
    // Mettre à jour l'UI et appliquer les filtres
    updateFilterUI();
    applyFilters();
  }
  
  // Définir le filtre de catégorie et mettre à jour l'UI
  function setCategoryFilter(category) {
    console.log(`🔖 Changement de filtre catégorie: ${window.eventFilters.categoryFilter} -> ${category}`);
    window.eventFilters.categoryFilter = category;
    
    // Sauvegarder la préférence
    localStorage.setItem('eventCategoryFilter', category);
    
    // Mettre à jour l'UI et appliquer les filtres
    updateFilterUI();
    applyFilters();
  }
  
  // Mettre à jour l'interface utilisateur selon les filtres actuels
  function updateFilterUI() {
    // 1. Mettre à jour l'UI des filtres de date
    const todayFilter = document.getElementById('today-filter');
    const weekFilter = document.getElementById('week-filter');
    
    if (todayFilter && weekFilter) {
      // Réinitialiser les classes
      todayFilter.classList.remove('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
      weekFilter.classList.remove('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
      
      todayFilter.classList.add('text-gray-400', 'border-gray-700');
      weekFilter.classList.add('text-gray-400', 'border-gray-700');
      
      // Mettre à jour selon le filtre actif
      if (window.eventFilters.dateFilter === 'today') {
        todayFilter.classList.add('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        todayFilter.classList.remove('text-gray-400', 'border-gray-700');
      } else {
        weekFilter.classList.add('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        weekFilter.classList.remove('text-gray-400', 'border-gray-700');
      }
    }
    
    // 2. Mettre à jour l'UI des filtres de catégorie
    const categoryButtons = document.querySelectorAll('#event-category-filters button');
    
    categoryButtons.forEach(button => {
      const category = button.getAttribute('data-category');
      
      // Réinitialiser les classes
      button.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 
                            'text-green-400', 'border-green-400', 'border-opacity-30');
      button.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
      
      // Mettre à jour selon le filtre actif
      if (category === window.eventFilters.categoryFilter) {
        button.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 
                           'text-green-400', 'border-green-400', 'border-opacity-30');
        button.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
      }
    });
  }
  
  // Appliquer les filtres aux événements
  function applyFilters() {
    console.log(`🔍 Application des filtres: dateFilter=${window.eventFilters.dateFilter}, categoryFilter=${window.eventFilters.categoryFilter}`);
    
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) {
      console.error('❌ Conteneur d\'événements non trouvé!');
      return;
    }
    
    const events = eventsContainer.querySelectorAll('.event-card');
    let visibleCount = 0;
    let hiddenCount = 0;
    
    // Si c'est aujourd'hui, préparer la date pour comparer
    let todayStr = '';
    if (window.eventFilters.dateFilter === 'today') {
      const today = new Date();
      todayStr = [
        String(today.getDate()).padStart(2, '0'),
        String(today.getMonth() + 1).padStart(2, '0'),
        today.getFullYear()
      ].join('/');
    }
    
    events.forEach(event => {
      // Vérifier si l'événement correspond au filtre de catégorie
      const matchesCategory = (window.eventFilters.categoryFilter === 'all') || 
                             (event.getAttribute('data-type') === window.eventFilters.categoryFilter);
      
      // Vérifier si l'événement correspond au filtre de date
      let matchesDate = true;
      if (window.eventFilters.dateFilter === 'today') {
        const dateElement = event.querySelector('.event-date');
        if (dateElement) {
          const eventDate = dateElement.textContent.trim();
          matchesDate = (eventDate === todayStr);
        }
      }
      
      // Afficher ou masquer l'événement
      if (matchesCategory && matchesDate) {
        event.style.display = '';
        event.classList.add('animate-fadeIn');
        visibleCount++;
      } else {
        event.style.display = 'none';
        event.classList.remove('animate-fadeIn');
        hiddenCount++;
      }
    });
    
    console.log(`✓ Filtrage terminé: ${visibleCount} événements visibles, ${hiddenCount} masqués`);
    
    // Message si aucun événement ne correspond
    handleEmptyResults(eventsContainer, visibleCount);
    
    return visibleCount;
  }
  
  // Afficher un message si aucun événement ne correspond aux filtres
  function handleEmptyResults(container, visibleCount) {
    // Chercher le message existant
    let emptyMessage = container.querySelector('.no-events-message');
    
    if (visibleCount === 0) {
      // Créer le message s'il n'existe pas
      if (!emptyMessage) {
        emptyMessage = document.createElement('div');
        emptyMessage.className = 'no-events-message col-span-3 text-center py-6';
        emptyMessage.innerHTML = `
          <i class="fas fa-calendar-times text-gray-400 text-4xl mb-2"></i>
          <p class="text-gray-400">Aucun événement ne correspond aux filtres sélectionnés</p>
          <p class="text-xs text-gray-500 mt-2">Catégorie: ${window.eventFilters.categoryFilter}, Période: ${window.eventFilters.dateFilter}</p>
          <button id="reset-filters-btn" class="mt-4 px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
            <i class="fas fa-sync-alt mr-1"></i> Réinitialiser les filtres
          </button>
        `;
        container.appendChild(emptyMessage);
        
        // Ajouter un écouteur pour le bouton de réinitialisation
        const resetButton = emptyMessage.querySelector('#reset-filters-btn');
        if (resetButton) {
          resetButton.addEventListener('click', function() {
            setCategoryFilter('all');
            setDateFilter('week');
          });
        }
      } else {
        // Mettre à jour le message existant
        emptyMessage.style.display = 'block';
        const categoryText = emptyMessage.querySelector('p:nth-child(3)');
        if (categoryText) {
          categoryText.textContent = `Catégorie: ${window.eventFilters.categoryFilter}, Période: ${window.eventFilters.dateFilter}`;
        }
      }
    } else if (emptyMessage) {
      // Cacher le message s'il existe
      emptyMessage.style.display = 'none';
    }
  }
  
  // Fonction de débogage pour diagnostiquer les problèmes
  function debugFilters() {
    console.group('🔍 Débogage du système de filtrage simplifié');
    
    console.log('État actuel:', {
      dateFilter: window.eventFilters.dateFilter,
      categoryFilter: window.eventFilters.categoryFilter
    });
    
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) {
      console.error('❌ Conteneur d\'événements non trouvé!');
      console.groupEnd();
      return;
    }
    
    const events = eventsContainer.querySelectorAll('.event-card');
    console.log(`🔢 ${events.length} événements trouvés`);
    
    // Analyser les types d'événements
    const types = {};
    events.forEach(event => {
      const type = event.getAttribute('data-type');
      types[type] = (types[type] || 0) + 1;
    });
    console.log('Types d\'événements:', types);
    
    // Analyser les éléments de date
    const dateElements = eventsContainer.querySelectorAll('.event-date');
    console.log(`📅 ${dateElements.length} éléments de date trouvés`);
    
    // Vérifier les filtres UI
    const todayFilter = document.getElementById('today-filter');
    const weekFilter = document.getElementById('week-filter');
    console.log('UI filtres de date:', {
      today: todayFilter ? {
        exists: true,
        active: todayFilter.classList.contains('active'),
        green: todayFilter.classList.contains('text-green-400')
      } : 'non trouvé',
      week: weekFilter ? {
        exists: true,
        active: weekFilter.classList.contains('active'),
        green: weekFilter.classList.contains('text-green-400')
      } : 'non trouvé'
    });
    
    const categoryFilters = document.querySelectorAll('#event-category-filters button');
    console.log(`🔖 ${categoryFilters.length} filtres de catégorie trouvés`);
    
    console.groupEnd();
    
    // Lancer une réparation
    fixMissingAttributes();
    
    return {
      eventsCount: events.length,
      dateElementsCount: dateElements.length,
      types: types,
      dateFilterUI: {
        todayActive: todayFilter?.classList.contains('active'),
        weekActive: weekFilter?.classList.contains('active')
      },
      categoryFiltersCount: categoryFilters.length
    };
  }
});

// Exposer une fonction de répparation d'urgence
window.fixEvents = function() {
  console.log('🛠️ Réparation d\'urgence des filtres d\'événements...');
  
  if (window.EventFilterSystem) {
    window.EventFilterSystem.fixAttributes();
    window.EventFilterSystem.applyFilters();
    return '✅ Filtres réparés avec succès';
  } else {
    // Si le système n'est pas encore initialisé, réparer manuellement
    const events = document.querySelectorAll('.event-card');
    console.log(`${events.length} événements trouvés`);
    
    events.forEach((card, index) => {
      // Ajouter data-type si manquant
      if (!card.hasAttribute('data-type')) {
        const text = card.textContent.toLowerCase();
        let type = 'economic'; // Type par défaut
        
        if (text.includes('ipo')) {
          type = 'ipo';
        } else if (text.includes('m&a') || text.includes('merger')) {
          type = 'm&a';
        }
        
        card.setAttribute('data-type', type);
      }
      
      // Ajouter un élément date invisible si manquant
      if (!card.querySelector('.event-date')) {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
        
        const dateEl = document.createElement('span');
        dateEl.className = 'event-date';
        dateEl.style.display = 'none';
        dateEl.textContent = dateStr;
        card.appendChild(dateEl);
      }
    });
    
    return '✅ Réparation d\'urgence effectuée, rechargez la page pour activer les filtres';
  }
};
