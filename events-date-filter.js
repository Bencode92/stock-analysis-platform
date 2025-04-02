/**
 * events-date-filter.js
 * Ajoute un filtre temporel pour les événements basé sur la date de connexion
 * Version optimisée - suppression du bouton "Réinitialiser date"
 * Ajout de la prise en charge des IPO et M&A
 */

document.addEventListener('DOMContentLoaded', function() {
  // Stocker la date de connexion dans le localStorage
  if (!localStorage.getItem('userConnectionDate')) {
    localStorage.setItem('userConnectionDate', new Date().toISOString());
  }
  
  // Attendre que la page soit chargée
  setTimeout(() => {
    // 1. Remplacer les filtres existants par date uniquement (Aujourd'hui/Cette semaine)
    replaceFiltersWithDateOnly();
    
    // 2. Ajouter les filtres par type d'événement (Tous, Économie, Résultats, IPO, M&A)
    addEventTypeFilters();
    
    // 3. Supprimer les badges "ESSENTIEL" des événements
    removeEssentialBadges();
    
    // 4. Surcharger la méthode de rendu des événements pour appliquer les modifications
    overrideEventRendering();
    
    // 5. Appliquer le filtre par défaut (aujourd'hui)
    const todayButton = document.getElementById('today-filter');
    if (todayButton) {
      // Simuler un clic sur "Aujourd'hui"
      todayButton.click();
    } else {
      // Appliquer directement le filtre si le bouton n'existe pas encore
      forceHideAllEvents();
    }
  }, 1000);
});

/**
 * Remplace les filtres existants par seulement Aujourd'hui/Cette semaine
 */
function replaceFiltersWithDateOnly() {
  // Trouver le conteneur des filtres existants
  const filterContainer = document.querySelector('#events-section .flex.justify-between.items-center');
  
  if (!filterContainer) {
    console.error("Conteneur de filtres non trouvé");
    return;
  }
  
  // Reconstruire la barre de filtres uniquement avec Aujourd'hui et Cette semaine
  filterContainer.innerHTML = `
    <h2 class="text-lg font-semibold text-green-400">
      <i class="fas fa-calendar-alt mr-2"></i>ÉVÉNEMENTS À VENIR
    </h2>
    <div class="flex gap-2">
      <button id="today-filter" class="text-xs text-green-400 px-2 py-1 border border-green-400 border-opacity-30 rounded filter-button active">
        Aujourd'hui
      </button>
      <button id="week-filter" class="text-xs text-gray-400 px-2 py-1 border border-gray-700 rounded filter-button">
        Cette semaine
      </button>
    </div>
  `;
  
  // Ajouter les écouteurs d'événements
  const todayBtn = document.getElementById('today-filter');
  const weekBtn = document.getElementById('week-filter');
  
  if (todayBtn && weekBtn) {
    todayBtn.addEventListener('click', () => {
      setActiveFilter(todayBtn);
      forceHideAllEvents();
    });
    
    weekBtn.addEventListener('click', () => {
      setActiveFilter(weekBtn);
      forceShowAllEvents();
    });
  }
}

/**
 * Ajoute des filtres par type d'événement
 */
function addEventTypeFilters() {
  // Trouver le conteneur des événements
  const eventsSection = document.getElementById('events-section');
  if (!eventsSection) return;
  
  // Créer un conteneur pour les filtres par type
  const typeFiltersContainer = document.createElement('div');
  typeFiltersContainer.className = 'events-type-filter';
  typeFiltersContainer.innerHTML = `
    <button class="event-type-button active" data-type="all">
      <i class="fas fa-filter"></i> Tous
    </button>
    <button class="event-type-button" data-type="economic">
      <i class="fas fa-chart-line"></i> Économie
    </button>
    <button class="event-type-button" data-type="earnings">
      <i class="fas fa-chart-pie"></i> Résultats
    </button>
    <button class="event-type-button" data-type="ipo">
      <i class="fas fa-rocket"></i> IPO
    </button>
    <button class="event-type-button" data-type="merger">
      <i class="fas fa-handshake"></i> M&A
    </button>
  `;
  
  // Insérer après le titre
  const titleContainer = eventsSection.querySelector('.flex.justify-between.items-center');
  if (titleContainer) {
    titleContainer.insertAdjacentElement('afterend', typeFiltersContainer);
  } else {
    eventsSection.prepend(typeFiltersContainer);
  }
  
  // Ajouter les écouteurs d'événements
  const typeButtons = typeFiltersContainer.querySelectorAll('.event-type-button');
  typeButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Activer le bouton cliqué et désactiver les autres
      typeButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Filtrer les événements par type
      filterEventsByType(button.dataset.type);
    });
  });
}

/**
 * Filtre les événements par type
 * @param {string} type - Type d'événement à afficher ('all', 'economic', 'earnings', 'ipo', 'merger')
 */
function filterEventsByType(type) {
  const eventCards = document.querySelectorAll('.event-card');
  
  eventCards.forEach(card => {
    // Restaurer d'abord l'affichage selon le filtre de date actif
    if (document.body.classList.contains('today-filter-active')) {
      card.style.display = 'none';
    } else {
      card.style.display = '';
    }
    
    // Puis filtrer par type si nécessaire
    if (type !== 'all') {
      const cardType = card.dataset.eventType || card.getAttribute('type') || 'economic';
      if (cardType !== type) {
        card.style.display = 'none';
      }
    }
  });
}

/**
 * Force la disparition de tous les événements (pour le filtre Aujourd'hui)
 * Approche directe et robuste
 */
function forceHideAllEvents() {
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  // Masquer tous les événements sans exception
  eventCards.forEach(card => {
    card.style.display = 'none';
  });
  
  // Masquer également le message "Aucun événement ne correspond à votre sélection"
  const noEventsMessage = document.querySelector('.no-events-message');
  if (noEventsMessage) {
    noEventsMessage.remove();
  }
  
  // Ajouter une classe spécifique au corps pour identifier le mode "Aujourd'hui"
  document.body.classList.add('today-filter-active');
  document.body.classList.remove('week-filter-active');
  
  // Réappliquer le filtre par type
  const activeTypeFilter = document.querySelector('.event-type-button.active');
  if (activeTypeFilter) {
    filterEventsByType(activeTypeFilter.dataset.type);
  }
  
  console.log("Tous les événements ont été masqués (filtre Aujourd'hui)");
}

/**
 * Force l'affichage de tous les événements (pour le filtre Cette semaine)
 */
function forceShowAllEvents() {
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  // Afficher tous les événements sans exception
  eventCards.forEach(card => {
    card.style.display = '';
  });
  
  // Masquer le message "Aucun événement" s'il existe
  const noEventsMessage = document.querySelector('.no-events-message');
  if (noEventsMessage) {
    noEventsMessage.remove();
  }
  
  // Ajouter une classe spécifique au corps pour identifier le mode "Cette semaine"
  document.body.classList.remove('today-filter-active');
  document.body.classList.add('week-filter-active');
  
  // Réappliquer le filtre par type
  const activeTypeFilter = document.querySelector('.event-type-button.active');
  if (activeTypeFilter) {
    filterEventsByType(activeTypeFilter.dataset.type);
  }
  
  console.log("Tous les événements ont été affichés (filtre Cette semaine)");
}

/**
 * Active le bouton de filtre sélectionné
 */
function setActiveFilter(activeButton) {
  const filterButtons = document.querySelectorAll('.filter-button');
  filterButtons.forEach(btn => {
    if (btn === activeButton) {
      btn.classList.add('active');
      btn.classList.remove('text-gray-400');
      btn.classList.add('text-green-400');
      btn.classList.remove('border-gray-700');
      btn.classList.add('border-green-400');
      btn.classList.add('border-opacity-30');
      btn.classList.add('bg-green-400');
      btn.classList.add('bg-opacity-10');
    } else {
      btn.classList.remove('active');
      btn.classList.remove('text-green-400');
      btn.classList.add('text-gray-400');
      btn.classList.remove('border-green-400');
      btn.classList.add('border-gray-700');
      btn.classList.remove('border-opacity-30');
      btn.classList.remove('bg-green-400');
      btn.classList.remove('bg-opacity-10');
    }
  });
}

/**
 * Supprime les badges "ESSENTIEL" des événements
 */
function removeEssentialBadges() {
  // Supprimer les badges existants
  const essentialBadges = document.querySelectorAll('.essential-badge');
  essentialBadges.forEach(badge => badge.remove());
  
  // Supprimer aussi les badges dans les éléments qui n'ont pas encore été rendus
  const style = document.createElement('style');
  style.textContent = `
    .essential-badge {
      display: none !important;
    }
    
    .event-card::after {
      content: '';
      background: none !important;
    }
    
    /* Masquer automatiquement tous les événements quand le filtre "Aujourd'hui" est actif */
    body.today-filter-active .event-card {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Surcharge la méthode de rendu des événements pour appliquer les modifications
 */
function overrideEventRendering() {
  // S'assurer que eventsManager est disponible
  if (window.eventsManager && typeof window.eventsManager.renderEvents === 'function') {
    const originalRenderEvents = window.eventsManager.renderEvents;
    
    window.eventsManager.renderEvents = function() {
      // Appeler la méthode originale
      originalRenderEvents.call(this);
      
      // Appliquer nos modifications
      setTimeout(() => {
        removeEssentialBadges();
        
        // Marquer chaque carte avec son type d'événement
        const eventCards = document.querySelectorAll('.event-card');
        eventCards.forEach(card => {
          // Déterminer le type d'événement en analysant le contenu
          let eventType = 'economic';
          const cardContent = card.textContent.toLowerCase();
          const cardTitle = card.querySelector('h3')?.textContent.toLowerCase() || '';
          
          if (cardTitle.includes('ipo:')) {
            eventType = 'ipo';
          } else if (cardTitle.includes('m&a:')) {
            eventType = 'merger';
          } else if (cardTitle.includes('résultats')) {
            eventType = 'earnings';
          }
          
          // Ajouter l'attribut data-event-type pour les filtres
          card.setAttribute('data-event-type', eventType);
          
          // Ajouter un indicateur "Nouveau" pour les événements IPO et M&A
          if ((eventType === 'ipo' || eventType === 'merger') && !card.querySelector('.new-event-badge')) {
            const badge = document.createElement('div');
            badge.className = 'new-event-badge';
            badge.textContent = 'Nouveau';
            card.appendChild(badge);
          }
        });
        
        // Appliquer le filtre actif
        const activeFilter = document.querySelector('.filter-button.active');
        if (activeFilter) {
          if (activeFilter.id === 'today-filter') {
            forceHideAllEvents();
          } else if (activeFilter.id === 'week-filter') {
            forceShowAllEvents();
          }
        } else {
          // Par défaut, masquer tous les événements
          forceHideAllEvents();
        }
        
        // Appliquer le filtre par type actif
        const activeTypeFilter = document.querySelector('.event-type-button.active');
        if (activeTypeFilter) {
          filterEventsByType(activeTypeFilter.dataset.type);
        }
      }, 100);
    };
  }
}

// Ajouter un écouteur global pour intercepter tout clic sur le document
document.addEventListener('click', function(event) {
  // Si le filtre "Aujourd'hui" est actif, masquer tous les événements qui pourraient être ajoutés dynamiquement
  if (document.body.classList.contains('today-filter-active')) {
    setTimeout(() => {
      forceHideAllEvents();
    }, 100);
  }
}, true);

// Observer les changements dans le DOM pour appliquer le filtre en continu
if (window.MutationObserver) {
  const observer = new MutationObserver(function() {
    if (document.body.classList.contains('today-filter-active')) {
      setTimeout(() => {
        forceHideAllEvents();
      }, 50);
    }
  });
  
  // Observer les changements dans le conteneur des événements
  const eventsContainer = document.getElementById('events-container');
  if (eventsContainer) {
    observer.observe(eventsContainer, { childList: true, subtree: true });
  }
}
