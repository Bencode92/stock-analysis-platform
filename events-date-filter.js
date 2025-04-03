/**
 * events-date-filter.js
 * Ajoute un filtre temporel pour les événements basé sur la date de connexion
 * Version simplifiée pour éviter les conflits
 */

document.addEventListener('DOMContentLoaded', function() {
  // Attendre que le DOM et tous les autres scripts soient chargés
  setTimeout(() => {
    // Ajouter les filtres
    addEventFilters();
    
    // Supprimer les badges \"ESSENTIEL\"
    removeEssentialBadges();
    
    // NOUVELLE FONCTION: Activer les filtres de catégories
    enableCategoryFilters();
  }, 1000); // Attendre 1 seconde pour être sûr que tout est chargé
});

/**
 * Active les filtres de catégorie qui étaient précédemment désactivés
 */
function enableCategoryFilters() {
  const categoryButtons = document.querySelectorAll('#event-category-filters button');
  categoryButtons.forEach(button => {
    // Supprimer les attributs qui désactivent les boutons
    button.style.pointerEvents = '';
    button.removeAttribute('title');
    
    // Ajouter un effet de survol
    button.addEventListener('mouseenter', function() {
      if (!this.classList.contains('filter-active')) {
        this.style.transform = 'translateY(-1px)';
        this.style.boxShadow = '0 2px 8px rgba(0, 255, 135, 0.2)';
      }
    });
    
    button.addEventListener('mouseleave', function() {
      if (!this.classList.contains('filter-active')) {
        this.style.transform = '';
        this.style.boxShadow = '';
      }
    });
    
    // Ajouter la fonctionnalité de filtrage
    button.addEventListener('click', function() {
      const category = this.getAttribute('data-category');
      
      // Activer ce bouton, désactiver les autres
      categoryButtons.forEach(btn => {
        btn.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
        btn.classList.add('text-gray-400', 'border-gray-700');
      });
      
      this.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
      this.classList.remove('text-gray-400', 'border-gray-700');
      
      // Filtrer les événements par catégorie
      filterEventsByCategory(category);
    });
  });
}

/**
 * Filtre les événements par catégorie
 */
function filterEventsByCategory(category) {
  const eventCards = document.querySelectorAll('.event-card');
  
  if (category === 'all') {
    // Réafficher tous les événements, sauf ceux filtrés par date
    eventCards.forEach(card => {
      if (card.style.display === 'none' && card.getAttribute('data-hidden-by-date') !== 'true') {
        card.style.display = '';
      }
    });
    return;
  }
  
  eventCards.forEach(card => {
    // Si déjà masqué par le filtre de date, garder masqué
    if (card.getAttribute('data-hidden-by-date') === 'true') {
      card.style.display = 'none';
      return;
    }
    
    // Utiliser les classes ou attributs de l'événement pour déterminer sa catégorie
    const cardContent = card.textContent.toLowerCase();
    const hasCategory = (cardContent.includes(category.toLowerCase()));
    
    if (hasCategory) {
      card.style.display = ''; // Afficher
    } else {
      card.style.display = 'none'; // Masquer
    }
  });
  
  // Vérifier si aucun événement n'est visible après filtrage
  const anyVisible = Array.from(eventCards).some(card => card.style.display !== 'none');
  const noEventsMsg = document.getElementById('no-events-message');
  if (noEventsMsg) {
    noEventsMsg.style.display = anyVisible ? 'none' : 'block';
  }
}

/**
 * Ajoute les filtres de date et de type aux événements
 */
function addEventFilters() {
  // Trouver le conteneur du header de la section événements
  const eventsSection = document.getElementById('events-section');
  if (!eventsSection) return;
  
  // Trouver le header existant
  const headerSection = eventsSection.querySelector('.flex.justify-between.items-center');
  if (!headerSection) {
    console.error("Header des événements non trouvé");
    return;
  }
  
  // Remplacer le contenu du header
  headerSection.innerHTML = `
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
  setupFilterListeners();
  
  // Ajouter une zone pour le message "aucun événement"
  const noEventsMsg = document.createElement('div');
  noEventsMsg.id = 'no-events-message';
  noEventsMsg.className = 'empty-state-message';
  noEventsMsg.innerHTML = '<i class="fas fa-calendar-xmark mr-2"></i><span>Aucun événement à afficher.</span>';
  noEventsMsg.style.display = 'none';
  eventsSection.appendChild(noEventsMsg);
  
  // Ajouter du CSS pour le message vide
  const style = document.createElement('style');
  style.textContent = `
    .empty-state-message {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      margin: 2rem 0;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 0.5rem;
      color: #999;
      font-style: italic;
    }

    .empty-state-message i {
      margin-right: 0.5rem;
      color: var(--accent-color);
      opacity: 0.4;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Configure les écouteurs d'événements pour les filtres
 */
function setupFilterListeners() {
  // Écouteurs pour les filtres de date
  const todayBtn = document.getElementById('today-filter');
  const weekBtn = document.getElementById('week-filter');
  
  if (todayBtn && weekBtn) {
    todayBtn.addEventListener('click', function() {
      setActiveDateFilter(this);
      filterEventsByDate('today');
    });
    
    weekBtn.addEventListener('click', function() {
      setActiveDateFilter(this);
      filterEventsByDate('week');
    });
  }
  
  // Déclencher le filtre \"Aujourd'hui\" par défaut
  if (todayBtn) {
    todayBtn.click();
  }
}

/**
 * Active le bouton de filtre de date sélectionné
 */
function setActiveDateFilter(activeButton) {
  const filterButtons = document.querySelectorAll('.filter-button');
  filterButtons.forEach(btn => {
    if (btn === activeButton) {
      btn.classList.add('active');
      btn.classList.add('text-green-400');
      btn.classList.add('border-green-400');
      btn.classList.add('border-opacity-30');
      btn.classList.remove('text-gray-400');
      btn.classList.remove('border-gray-700');
    } else {
      btn.classList.remove('active');
      btn.classList.remove('text-green-400');
      btn.classList.remove('border-green-400');
      btn.classList.remove('border-opacity-30');
      btn.classList.add('text-gray-400');
      btn.classList.add('border-gray-700');
    }
  });
}

/**
 * Active le bouton de filtre de type sélectionné
 * Fonction conservée pour compatibilité mais ne sera plus utilisée
 */
function setActiveTypeFilter(activeButton) {
  const typeButtons = document.querySelectorAll('.event-type-button');
  typeButtons.forEach(btn => {
    if (btn === activeButton) {
      btn.classList.add('active');
      btn.classList.add('bg-green-400');
      btn.classList.add('bg-opacity-10');
      btn.classList.add('text-green-400');
      btn.classList.add('border-green-400');
      btn.classList.add('border-opacity-30');
      btn.classList.remove('text-gray-400');
      btn.classList.remove('border-gray-700');
    } else {
      btn.classList.remove('active');
      btn.classList.remove('bg-green-400');
      btn.classList.remove('bg-opacity-10');
      btn.classList.remove('text-green-400');
      btn.classList.remove('border-green-400');
      btn.classList.remove('border-opacity-30');
      btn.classList.add('text-gray-400');
      btn.classList.add('border-gray-700');
    }
  });
}

/**
 * Fonction utilitaire pour récupérer le message approprié selon le type de filtre
 */
function getNoEventsMessage(filterType) {
  switch(filterType) {
    case 'today':
      return 'Aucun événement prévu aujourd\'hui.';
    case 'week':
      return 'Aucun événement à venir cette semaine.';
    default:
      return 'Aucun événement à afficher.';
  }
}

/**
 * Filtre les événements par date - AMÉLIORÉ
 */
function filterEventsByDate(dateFilter) {
  // Obtenir la date d'aujourd'hui au format DD/MM/YYYY
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Réinitialiser l'heure à minuit
  
  const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  console.log(`Filtrage des événements par date: ${dateFilter}`);
  console.log(`Date d'aujourd'hui: ${formattedToday}`);
  
  if (dateFilter === 'today') {
    // Masquer les événements qui ne sont pas d'aujourd'hui
    eventCards.forEach(card => {
      const dateText = card.textContent.match(/\\d{2}\\/\\d{2}\\/\\d{4}/);
      const eventDate = dateText ? dateText[0] : null;
      
      console.log(`Événement avec date: ${eventDate}, comparé à aujourd'hui: ${formattedToday}`);
      
      if (eventDate === formattedToday) {
        card.style.display = ''; // Afficher l'événement
        card.setAttribute('data-hidden-by-date', "false");
      } else {
        card.style.display = 'none'; // Masquer l'événement
        card.setAttribute('data-hidden-by-date', "true");
      }
    });
    
    // Vérifier s'il y a au moins un événement affiché
    const anyVisible = Array.from(eventCards).some(card => card.style.display !== 'none');
    const noEventsMsg = document.getElementById('no-events-message');
    if (noEventsMsg) {
      noEventsMsg.style.display = anyVisible ? 'none' : 'block';
      noEventsMsg.querySelector('span').textContent = getNoEventsMessage('today');
    }
    
    // Classe pour indiquer le mode filtrage actif
    document.body.classList.add('today-filter-active');
    document.body.classList.remove('week-filter-active');
  } else if (dateFilter === 'week') {
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // aujourd'hui 00:00
    const dayOfWeek = today.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
    const daysUntilSunday = 7 - dayOfWeek; // combien de jours jusqu'à dimanche

    // Si on est dimanche, il reste 0 jour → donc rien à afficher
    if (daysUntilSunday === 0) {
      eventCards.forEach(card => {
        card.style.display = 'none';
        card.setAttribute('data-hidden-by-date', "true");
      });

      const noEventsMsg = document.getElementById('no-events-message');
      if (noEventsMsg) {
        noEventsMsg.style.display = 'block';
        noEventsMsg.querySelector('span').textContent = getNoEventsMessage('week');
      }

      // Classe pour indiquer le mode filtrage actif
      document.body.classList.remove('today-filter-active');
      document.body.classList.add('week-filter-active');
      
      return;
    }

    const tomorrowMidnight = new Date(todayMidnight);
    tomorrowMidnight.setDate(todayMidnight.getDate() + 1);

    const endOfWeek = new Date(todayMidnight);
    endOfWeek.setDate(todayMidnight.getDate() + daysUntilSunday);
    
    console.log(`Filtrage semaine: de demain ${tomorrowMidnight.toLocaleDateString('fr-FR')} à ${endOfWeek.toLocaleDateString('fr-FR')}`);

    eventCards.forEach(card => {
      const dateText = card.textContent.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);

      if (!dateText) {
        card.style.display = 'none';
        card.setAttribute('data-hidden-by-date', "true");
        return;
      }

      try {
        const eventDate = new Date(`${dateText[3]}-${dateText[2]}-${dateText[1]}`);
        const eventDateMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

        if (eventDateMidnight >= tomorrowMidnight && eventDateMidnight < endOfWeek) {
          card.style.display = '';
          card.setAttribute('data-hidden-by-date', "false");
        } else {
          card.style.display = 'none';
          card.setAttribute('data-hidden-by-date', "true");
        }
      } catch (error) {
        console.error("Erreur lors de l'analyse de la date:", error);
        card.style.display = '';
        card.setAttribute('data-hidden-by-date', "false");
      }
    });
    
    // Vérifier s'il y a au moins un événement affiché
    const anyVisible = Array.from(eventCards).some(card => card.style.display !== 'none');
    const noEventsMsg = document.getElementById('no-events-message');
    if (noEventsMsg) {
      noEventsMsg.style.display = anyVisible ? 'none' : 'block';
      noEventsMsg.querySelector('span').textContent = getNoEventsMessage('week');
    }
    
    // Classe pour indiquer le mode filtrage actif
    document.body.classList.remove('today-filter-active');
    document.body.classList.add('week-filter-active');
  }
  
  // Réappliquer le filtre par type actif
  const activeTypeFilter = document.querySelector('#event-category-filters button.filter-active');
  if (activeTypeFilter) {
    const category = activeTypeFilter.getAttribute('data-category');
    if (category && category !== 'all' && typeof filterEventsByCategory === 'function') {
      filterEventsByCategory(category);
    }
  }
}

/**
 * Filtre les événements par type
 * Fonction conservée pour compatibilité mais ne sera plus utilisée directement
 */
function filterEventsByType(type) {
  // Ajouter des marqueurs de type aux cartes qui n'en ont pas
  addTypeMarkersToCards();
  
  if (type === 'all') {
    // Afficher tous les événements qui sont déjà filtrés par date
    document.querySelectorAll('.event-card').forEach(card => {
      if (card.getAttribute('data-hidden-by-date') === "true") {
        card.style.display = 'none';
      } else {
        card.style.display = '';
      }
    });
    return;
  }
  
  // Sélectionner toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  // Filtrer les événements par type
  eventCards.forEach(card => {
    // Si déjà masqué par le filtre de date, continuer à le masquer
    if (card.getAttribute('data-hidden-by-date') === "true") {
      card.style.display = 'none';
      return;
    }
    
    // Vérifier le type de l'événement
    const cardType = card.getAttribute('data-event-type') || '';
    
    if (cardType === type) {
      card.style.display = ''; // Afficher l'événement
    } else {
      card.style.display = 'none'; // Masquer l'événement
    }
  });
}

/**
 * Ajoute des marqueurs de type aux cartes d'événements
 */
function addTypeMarkersToCards() {
  const eventCards = document.querySelectorAll('.event-card');
  
  eventCards.forEach(card => {
    // Si la carte a déjà un type, ne rien faire
    if (card.hasAttribute('data-event-type')) {
      return;
    }
    
    // Déterminer le type d'événement à partir du contenu
    const content = card.textContent.toLowerCase();
    let eventType = 'economic'; // Type par défaut
    
    if (content.includes('résultats') || content.includes('earnings')) {
      eventType = 'earnings';
    } else if (content.includes('ipo') || content.includes('introduction en bourse')) {
      eventType = 'ipo';
    } else if (content.includes('m&a') || content.includes('fusion') || content.includes('acquisition')) {
      eventType = 'merger';
    }
    
    // Ajouter l'attribut de type
    card.setAttribute('data-event-type', eventType);
    
    // Ajouter un indicateur visuel
    const indicator = document.createElement('div');
    indicator.className = 'event-indicator ' + eventType;
    card.appendChild(indicator);
  });
  
  // Styles pour les indicateurs
  if (!document.getElementById('event-indicator-styles')) {
    const style = document.createElement('style');
    style.id = 'event-indicator-styles';
    style.textContent = `
      .event-indicator {
        width: 3px;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;
        border-radius: 3px 0 0 3px;
        z-index: 5;
      }
      
      .event-indicator.economic {
        background: linear-gradient(to bottom, #00c6ff, #0072ff);
      }
      
      .event-indicator.earnings {
        background: linear-gradient(to bottom, #ff9966, #ff5e62);
      }
      
      .event-indicator.ipo {
        background: linear-gradient(to bottom, #a770ef, #cf8bf3);
      }
      
      .event-indicator.merger {
        background: linear-gradient(to bottom, #56ab2f, #a8e063);
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Supprime les badges \"ESSENTIEL\" des événements
 */
function removeEssentialBadges() {
  // Supprimer les badges existants
  const essentialBadges = document.querySelectorAll('.essential-badge');
  essentialBadges.forEach(badge => badge.remove());
  
  // Style pour masquer les badges
  const style = document.createElement('style');
  style.innerHTML = `
    .essential-badge {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}