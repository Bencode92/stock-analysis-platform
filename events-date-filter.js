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

    // Ajouter un indicateur de débogage
    console.log("Initialisation des filtres de date d'événements terminée");
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
      <button id="reset-date" class="text-xs text-gray-400 px-2 py-1 border border-gray-700 rounded filter-button">
        Réinitialiser date
      </button>
    </div>
  `;
  
  // Ajouter les écouteurs d'événements
  const todayBtn = document.getElementById('today-filter');
  const weekBtn = document.getElementById('week-filter');
  const resetBtn = document.getElementById('reset-date');
  
  if (todayBtn && weekBtn) {
    todayBtn.addEventListener('click', () => {
      setActiveFilter(todayBtn);
      forceHideAllEvents();
    });
    
    weekBtn.addEventListener('click', () => {
      setActiveFilter(weekBtn);
      forceShowAllEvents();
      console.log("Filtre 'Cette semaine' appliqué");
    });
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        // Réinitialise la date aux événements actuels
        location.reload();
      });
    }
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
    // Par défaut, on réinitialise l'affichage en fonction du filtre de date actif
    if (document.body.classList.contains('today-filter-active')) {
      // En mode "Aujourd'hui", respecter les attributs data-hidden
      if (card.getAttribute('data-hidden') === "true") {
        card.style.display = 'none';
      } else {
        card.style.display = '';
      }
    } else {
      // En mode "Cette semaine", tout afficher d'abord
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

  console.log(`Filtre par type appliqué: ${type}`);
}

/**
 * Force la disparition de tous les événements (pour le filtre Aujourd'hui)
 * Approche directe et robuste
 */
function forceHideAllEvents() {
  // Obtenir la date d'aujourd'hui au format DD/MM/YYYY
  const today = new Date();
  const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  
  console.log("Date du jour:", formattedToday);
  
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  let eventFound = false;
  
  // Masquer les événements qui ne sont pas d'aujourd'hui
  eventCards.forEach(card => {
    // Extraire la date de l'événement depuis le contenu de la carte
    const dateText = card.textContent.match(/\d{2}\/\d{2}\/\d{4}/);
    const eventDate = dateText ? dateText[0] : null;
    
    console.log("Date de l'événement:", eventDate);
    
    // Marquer la carte pour faciliter le débogage
    card.setAttribute('data-date', eventDate || 'no-date');
    
    if (eventDate === formattedToday) {
      card.style.display = ''; // Afficher l'événement
      card.setAttribute('data-hidden', "false");
      eventFound = true;
    } else {
      card.style.display = 'none'; // Masquer l'événement
      card.setAttribute('data-hidden', "true");
    }
  });
  
  // Si aucun événement trouvé pour aujourd'hui, afficher un message
  const eventsContainer = document.getElementById('events-container');
  if (!eventFound && eventsContainer) {
    if (!document.querySelector('.no-events-message')) {
      const noEventsMessage = document.createElement('div');
      noEventsMessage.className = 'no-events-message col-span-3 flex flex-col items-center justify-center p-6 text-center';
      noEventsMessage.innerHTML = `
        <i class="fas fa-calendar-times text-gray-600 text-3xl mb-3"></i>
        <p class="text-gray-400">
          Aucun événement prévu pour aujourd'hui
        </p>
      `;
      eventsContainer.appendChild(noEventsMessage);
    }
  } else {
    // S'il y a des événements, supprimer le message "Aucun événement"
    const noEventsMessage = document.querySelector('.no-events-message');
    if (noEventsMessage) {
      noEventsMessage.remove();
    }
  }
  
  // Classe pour indiquer le mode filtrage actif
  document.body.classList.add('today-filter-active');
  document.body.classList.remove('week-filter-active');
}

/**
 * Force l'affichage des événements à venir dans la semaine (sans aujourd'hui ni le passé)
 */
function forceShowAllEvents() {
  // Obtenir la date d'aujourd'hui
  const today = new Date();
  const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  
  // Calcul du début et de la fin de la semaine
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 6); // 6 jours après aujourd'hui = fin de la semaine

  console.log("Filtre semaine - Aujourd'hui:", formattedToday);
  console.log("Filtre semaine - Fin de semaine:", `${String(endOfWeek.getDate()).padStart(2, '0')}/${String(endOfWeek.getMonth() + 1).padStart(2, '0')}/${endOfWeek.getFullYear()}`);
  
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  let eventFound = false;
  
  // Afficher uniquement les événements entre demain et fin de semaine
  eventCards.forEach(card => {
    // Extraire la date de l'événement
    const dateText = card.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    
    if (!dateText) {
      card.style.display = 'none';
      card.setAttribute('data-hidden', "true");
      return;
    }
    
    // Convertir en objet Date
    const eventDate = new Date(`${dateText[3]}-${dateText[2]}-${dateText[1]}`);
    const formattedEventDate = dateText[0];
    
    // Marquer la carte pour faciliter le débogage
    card.setAttribute('data-date', formattedEventDate);
    
    // Différence en jours
    const diffTime = eventDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Afficher uniquement les événements de demain jusqu'à la fin de la semaine
    if (diffDays > 0 && diffDays <= 6) {
      card.style.display = '';
      card.setAttribute('data-hidden', "false");
      eventFound = true;
      console.log(`Événement affiché: ${formattedEventDate} (dans ${diffDays} jours)`);
    } else {
      card.style.display = 'none';
      card.setAttribute('data-hidden', "true");
      console.log(`Événement masqué: ${formattedEventDate} (aujourd'hui ou passé)`);
    }
  });
  
  // Afficher un message si aucun événement trouvé
  const eventsContainer = document.getElementById('events-container');
  if (!eventFound && eventsContainer) {
    if (!document.querySelector('.no-events-message')) {
      const noEventsMessage = document.createElement('div');
      noEventsMessage.className = 'no-events-message col-span-3 flex flex-col items-center justify-center p-6 text-center';
      noEventsMessage.innerHTML = `
        <i class="fas fa-calendar-times text-gray-600 text-3xl mb-3"></i>
        <p class="text-gray-400">
          Aucun événement prévu pour le reste de la semaine
        </p>
      `;
      eventsContainer.appendChild(noEventsMessage);
    }
  } else {
    // S'il y a des événements, supprimer le message "Aucun événement"
    const noEventsMessage = document.querySelector('.no-events-message');
    if (noEventsMessage) {
      noEventsMessage.remove();
    }
  }
  
  // Classe pour indiquer le mode filtrage actif
  document.body.classList.remove('today-filter-active');
  document.body.classList.add('week-filter-active');
  
  // Réappliquer le filtre par type
  const activeTypeFilter = document.querySelector('.event-type-button.active');
  if (activeTypeFilter) {
    filterEventsByType(activeTypeFilter.dataset.type);
  }
  
  console.log("Événements à venir dans la semaine affichés (sans aujourd'hui)");
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
    
    /* Style modifié pour ne masquer que les événements marqués comme data-hidden="true" */
    body.today-filter-active .event-card[data-hidden="true"] {
      display: none !important;
    }

    /* S'assurer que les événements avec data-hidden="false" sont visibles en mode "Aujourd'hui" */
    body.today-filter-active .event-card[data-hidden="false"] {
      display: flex !important;
    }

    /* S'assurer que TOUS les événements sont visibles en mode "Cette semaine" */
    body.week-filter-active .event-card {
      display: flex !important;
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
  // Attendre un instant puis vérifier quel filtre est actif
  setTimeout(() => {
    if (document.body.classList.contains('today-filter-active')) {
      forceHideAllEvents();
    } else if (document.body.classList.contains('week-filter-active')) {
      forceShowAllEvents();
    }
  }, 100);
}, true);

// Observer les changements dans le DOM pour appliquer le filtre en continu
if (window.MutationObserver) {
  const observer = new MutationObserver(function(mutations) {
    // Vérifier si des cartes d'événements ont été ajoutées
    let hasNewEvents = false;
    
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Vérifier si des événements ont été ajoutés
        mutation.addedNodes.forEach(node => {
          if (node.classList && node.classList.contains('event-card')) {
            hasNewEvents = true;
          }
        });
      }
    });
    
    if (hasNewEvents) {
      console.log("Nouveaux événements détectés - réapplication des filtres");
      // Réappliquer le filtre actif
      if (document.body.classList.contains('today-filter-active')) {
        setTimeout(() => forceHideAllEvents(), 50);
      } else if (document.body.classList.contains('week-filter-active')) {
        setTimeout(() => forceShowAllEvents(), 50);
      }
    }
  });
  
  // Observer les changements dans le conteneur des événements
  const eventsContainer = document.getElementById('events-container');
  if (eventsContainer) {
    observer.observe(eventsContainer, { childList: true, subtree: true });
  }
}