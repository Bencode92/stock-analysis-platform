/**
 * events-date-filter.js
 * Ajoute un filtre temporel pour les événements (aujourd'hui/cette semaine)
 * et supprime les badges "ESSENTIEL"
 */

document.addEventListener('DOMContentLoaded', function() {
  // Attendre que la page soit chargée
  setTimeout(() => {
    // 1. Ajouter les nouveaux boutons de filtre temporel
    addDateFilterButtons();
    
    // 2. Supprimer les badges "ESSENTIEL" des événements
    removeEssentialBadges();
    
    // 3. Surcharger la méthode de rendu des événements pour appliquer les modifications
    overrideEventRendering();
  }, 1000);
});

/**
 * Ajoute les boutons de filtre pour aujourd'hui/cette semaine
 */
function addDateFilterButtons() {
  // Trouver le conteneur des filtres existants
  const filterContainer = document.querySelector('#events-section .flex.gap-2');
  
  if (!filterContainer) {
    console.error("Conteneur de filtres non trouvé");
    return;
  }
  
  // Créer les nouveaux boutons avant les boutons existants
  const dateFiltersHTML = `
    <div class="flex gap-2 mr-3">
      <button id="today-filter" class="text-xs text-green-400 px-2 py-1 border border-green-400 border-opacity-30 rounded filter-button active">
        Aujourd'hui
      </button>
      <button id="week-filter" class="text-xs text-gray-400 px-2 py-1 border border-gray-700 rounded filter-button">
        Cette semaine
      </button>
    </div>
  `;
  
  // Insérer les boutons au début du conteneur
  filterContainer.insertAdjacentHTML('afterbegin', dateFiltersHTML);
  
  // Ajouter les écouteurs d'événements
  const todayBtn = document.getElementById('today-filter');
  const weekBtn = document.getElementById('week-filter');
  
  if (todayBtn && weekBtn) {
    todayBtn.addEventListener('click', () => {
      setActiveFilter(todayBtn);
      filterEventsByDate('today');
    });
    
    weekBtn.addEventListener('click', () => {
      setActiveFilter(weekBtn);
      filterEventsByDate('week');
    });
  }
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
    } else {
      btn.classList.remove('active');
      btn.classList.remove('text-green-400');
      btn.classList.add('text-gray-400');
      btn.classList.remove('border-green-400');
      btn.classList.add('border-gray-700');
    }
  });
}

/**
 * Filtre les événements par date (aujourd'hui ou cette semaine)
 */
function filterEventsByDate(period) {
  const eventCards = document.querySelectorAll('.event-card');
  
  if (!eventCards.length) {
    console.error("Aucune carte d'événement trouvée");
    return;
  }
  
  // Date d'aujourd'hui en format JJ/MM/YYYY
  const today = new Date();
  const todayFormatted = formatDate(today);
  
  // Calculer les limites de la semaine
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);
  
  eventCards.forEach(card => {
    const dateText = card.querySelector('.text-xs.text-white').textContent.trim();
    
    if (period === 'today') {
      // Afficher uniquement les événements d'aujourd'hui
      if (dateText === todayFormatted) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    } else if (period === 'week') {
      // Convertir la date de l'événement en objet Date
      const eventDate = parseDate(dateText);
      
      // Vérifier si la date est dans la semaine à venir
      if (eventDate >= today && eventDate <= endOfWeek) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    }
  });
  
  // Afficher un message si aucun événement n'est visible
  checkVisibleEvents();
}

/**
 * Vérifie s'il y a des événements visibles et affiche un message si nécessaire
 */
function checkVisibleEvents() {
  const eventsContainer = document.getElementById('events-container');
  const visibleEvents = Array.from(document.querySelectorAll('.event-card')).filter(card => 
    card.style.display !== 'none'
  );
  
  if (visibleEvents.length === 0 && eventsContainer) {
    // Vérifier s'il existe déjà un message
    if (!document.querySelector('.no-events-message')) {
      eventsContainer.insertAdjacentHTML('beforeend', `
        <div class="col-span-3 flex flex-col items-center justify-center p-6 text-center no-events-message">
          <i class="fas fa-calendar-times text-gray-600 text-3xl mb-3"></i>
          <p class="text-gray-400">Aucun événement ne correspond à votre sélection</p>
        </div>
      `);
    }
  } else {
    // Supprimer le message s'il existe
    const noEventsMessage = document.querySelector('.no-events-message');
    if (noEventsMessage) {
      noEventsMessage.remove();
    }
  }
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
        
        // Appliquer le filtre actif
        const activeFilter = document.querySelector('.filter-button.active');
        if (activeFilter) {
          if (activeFilter.id === 'today-filter') {
            filterEventsByDate('today');
          } else if (activeFilter.id === 'week-filter') {
            filterEventsByDate('week');
          }
        }
      }, 100);
    };
  }
}

/**
 * Formate une date en JJ/MM/YYYY
 */
function formatDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Parse une date du format JJ/MM/YYYY en objet Date
 */
function parseDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    // Les mois en JavaScript vont de 0 à 11, donc on soustrait 1
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(); // Retourner la date actuelle en cas d'erreur
}