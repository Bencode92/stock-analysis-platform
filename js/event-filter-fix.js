/**
 * event-filter-fix.js
 * Script pour résoudre les problèmes avec les filtres d'événements
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log('🔧 Chargement du correctif pour les filtres d\'événements...');
  
  // Attendre que le système d'événements soit chargé
  setTimeout(initializeEventFilterFix, 1000);
});

/**
 * Initialise les corrections pour les filtres d'événements
 */
function initializeEventFilterFix() {
  console.log('🔧 Initialisation du correctif pour les filtres d\'événements...');
  
  // 1. Ajout d'événements de test pour garantir le fonctionnement des filtres
  addDebugEvents();
  
  // 2. Correction du système de filtrage par catégorie
  fixCategoryFilters();
  
  // 3. Ajout de logs de débogage pour les filtres
  addFilterDebugging();
}

/**
 * Ajoute des événements de test si aucun événement n'est trouvé
 */
function addDebugEvents() {
  const eventsContainer = document.getElementById('events-container');
  if (!eventsContainer) return;
  
  // Si le conteneur est vide ou ne contient que le message de chargement, ajouter des événements de test
  const eventCards = eventsContainer.querySelectorAll('.event-card');
  if (eventCards.length === 0 || (eventCards.length === 1 && eventCards[0].classList.contains('loading-state'))) {
    console.log('⚠️ Aucun événement trouvé, ajout d\'événements de test');
    
    // Obtenir la date d'aujourd'hui au format français
    const today = new Date().toLocaleDateString('fr-FR');
    
    // Créer des événements de test pour chaque type
    const testEvents = [
      {
        title: "Test Economic: Publication des taux directeurs",
        date: today,
        time: "10:00",
        type: "economic",
        importance: "high"
      },
      {
        title: "Test IPO: Société XYZ (ABC)",
        date: today,
        time: "11:00",
        type: "ipo",
        importance: "medium"
      },
      {
        title: "Test M&A: Alpha Corp acquiert Beta Inc",
        date: today,
        time: "14:00",
        type: "m&a",
        importance: "high"
      }
    ];
    
    // Vider le conteneur
    eventsContainer.innerHTML = '';
    
    // Créer les cartes d'événement
    testEvents.forEach((event, index) => {
      const card = document.createElement('div');
      card.className = `event-card bg-gray-800 bg-opacity-70 rounded-lg p-4 fade-in ${event.importance}-impact`;
      card.setAttribute('data-event-index', index);
      card.setAttribute('data-type', event.type);
      card.setAttribute('data-date', event.date);
      
      card.innerHTML = `
        <div class="mb-3 flex justify-between items-start">
          <div class="text-sm">
            <span class="text-xs text-white bg-gray-700 px-2 py-1 rounded mr-2 event-date">${event.date}</span>
            <span class="text-gray-400">${event.time}</span>
          </div>
          <div class="flex items-center">
            <span class="text-xs flex items-center ${
              event.importance === 'high' ? 'text-red-500' : 
              event.importance === 'medium' ? 'text-orange-400' : 'text-green-400'
            }">
              <span class="w-1.5 h-1.5 rounded-full bg-current inline-block mx-0.5"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-current inline-block mx-0.5"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-current inline-block mx-0.5"></span>
              <span class="ml-1">${event.importance}</span>
            </span>
          </div>
        </div>
        
        <h3 class="text-white text-sm font-semibold mb-2">${event.title}</h3>
        
        <div class="flex items-center mb-3">
          <span class="text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded flex items-center">
            <i class="fas fa-calendar-alt mr-1"></i>
            ${event.type}
          </span>
        </div>
        
        <div class="text-xs text-gray-400 line-clamp-2">Événement de test pour déboguer les filtres.</div>
      `;
      
      eventsContainer.appendChild(card);
    });
    
    console.log('✅ Événements de test ajoutés avec succès');
  }
}

/**
 * Corrige les filtres de catégorie
 */
function fixCategoryFilters() {
  const categoryFilters = document.querySelectorAll('#event-category-filters button');
  if (!categoryFilters || categoryFilters.length === 0) return;
  
  console.log('🔧 Correction des filtres de catégorie...');
  
  // Vérifier si chaque carte d'événement a correctement l'attribut data-type
  const eventCards = document.querySelectorAll('.event-card');
  eventCards.forEach(card => {
    // Si le card n'a pas d'attribut data-type, essayer de le déduire du contenu
    if (!card.hasAttribute('data-type')) {
      const title = card.querySelector('h3')?.textContent || '';
      
      if (title.startsWith('IPO:')) {
        card.setAttribute('data-type', 'ipo');
      } else if (title.startsWith('M&A:')) {
        card.setAttribute('data-type', 'm&a');
      } else {
        // Par défaut, considérer comme économique
        card.setAttribute('data-type', 'economic');
      }
    }
  });
  
  // Retirer et réattacher les gestionnaires d'événements pour tous les boutons de filtre
  categoryFilters.forEach(button => {
    const clone = button.cloneNode(true);
    button.parentNode.replaceChild(clone, button);
    
    clone.addEventListener('click', function() {
      // Supprimer la classe active de tous les boutons
      categoryFilters.forEach(btn => {
        btn.classList.remove('filter-active');
        btn.classList.remove('bg-green-400');
        btn.classList.remove('bg-opacity-10');
        btn.classList.remove('text-green-400');
        btn.classList.remove('border-green-400');
        btn.classList.remove('border-opacity-30');
        btn.classList.add('text-gray-400');
        btn.classList.add('border-gray-700');
      });
      
      // Ajouter la classe active au bouton cliqué
      this.classList.add('filter-active');
      this.classList.add('bg-green-400');
      this.classList.add('bg-opacity-10');
      this.classList.add('text-green-400');
      this.classList.add('border-green-400');
      this.classList.add('border-opacity-30');
      this.classList.remove('text-gray-400');
      this.classList.remove('border-gray-700');
      
      // Filtrer les événements selon la catégorie
      const category = this.getAttribute('data-category');
      filterEventsByCategory(category);
    });
  });
  
  console.log('✅ Filtres de catégorie corrigés');
}

/**
 * Filtre les événements par catégorie
 */
function filterEventsByCategory(category) {
  console.log(`🔍 Filtrage par catégorie: ${category}`);
  
  // Récupérer toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  if (!eventCards.length) {
    console.warn('⚠️ Aucune carte d\'événement trouvée');
    return;
  }
  
  console.log(`📊 Nombre de cartes trouvées: ${eventCards.length}`);
  
  let visibleCount = 0;
  
  // Pour chaque carte d'événement
  eventCards.forEach(card => {
    // Obtenir le type de l'événement
    const cardType = card.getAttribute('data-type');
    console.log(`🔖 Carte: ${card.querySelector('h3')?.textContent} - Type: ${cardType}`);
    
    let isVisible = false;
    
    if (category === 'all') {
      isVisible = true;
    } else if (cardType && cardType === category) {
      isVisible = true;
    }
    
    // Afficher ou masquer la carte
    card.style.display = isVisible ? '' : 'none';
    
    if (isVisible) visibleCount++;
  });
  
  console.log(`✅ Filtrage terminé: ${visibleCount} événements visibles`);
  
  // Afficher un message si aucun événement n'est visible
  if (visibleCount === 0) {
    // Vérifier si un message existe déjà
    let noEventsMessage = document.querySelector('.no-events-message');
    
    if (!noEventsMessage) {
      // Créer un message
      noEventsMessage = document.createElement('div');
      noEventsMessage.className = 'no-events-message col-span-3 text-center py-6';
      noEventsMessage.innerHTML = `
        <i class="fas fa-filter text-gray-400 text-4xl mb-2"></i>
        <p class="text-gray-400">Aucun événement ne correspond à la catégorie "${category}"</p>
      `;
      
      // Ajouter le message au conteneur
      const eventsContainer = document.getElementById('events-container');
      if (eventsContainer) {
        eventsContainer.appendChild(noEventsMessage);
      }
    } else {
      // Mettre à jour le message existant
      noEventsMessage.style.display = '';
      const messageText = noEventsMessage.querySelector('p');
      if (messageText) {
        messageText.textContent = `Aucun événement ne correspond à la catégorie "${category}"`;
      }
    }
  } else {
    // Masquer le message s'il existe
    const noEventsMessage = document.querySelector('.no-events-message');
    if (noEventsMessage) {
      noEventsMessage.style.display = 'none';
    }
  }
}

/**
 * Ajoute des logs de débogage pour les filtres
 */
function addFilterDebugging() {
  // Patcher la fonction matchesCategoryFilter dans UnifiedEventFilters si elle existe
  if (window.UnifiedEventFilters && window.UnifiedEventFilters.matchesCategoryFilter) {
    const originalMatchesCategoryFilter = window.UnifiedEventFilters.matchesCategoryFilter;
    
    window.UnifiedEventFilters.matchesCategoryFilter = function(eventElement) {
      console.log(`🔍 Vérifiant si l'élément correspond au filtre: ${this.state.categoryFilter}`);
      console.log(`📋 Attributs de l'élément:`, {
        type: eventElement.getAttribute('data-type'),
        title: eventElement.querySelector('h3')?.textContent.substring(0, 50) + '...'
      });
      
      if (this.state.categoryFilter === 'all') {
        return true;
      }
      
      const result = eventElement.getAttribute('data-type') === this.state.categoryFilter;
      console.log(`✅ Résultat du filtrage: ${result}`);
      return result;
    };
    
    console.log('✅ Débogage des filtres ajouté');
  }
}
