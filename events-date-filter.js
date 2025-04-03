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
    
    // Supprimer les badges "ESSENTIEL"
    removeEssentialBadges();
  }, 1000); // Attendre 1 seconde pour être sûr que tout est chargé
});

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
  
  // Suppression de la création des filtres par type (première ligne de filtres)
  // La section ci-dessous a été supprimée pour ne conserver que la seconde ligne dans le HTML
  /*
  // Créer la section de filtres par type
  const typeFiltersContainer = document.createElement('div');
  typeFiltersContainer.className = 'mt-3 mb-4';
  typeFiltersContainer.innerHTML = `
    <div class="flex flex-wrap gap-2">
      <button class="text-xs px-3 py-1.5 bg-green-400 bg-opacity-10 text-green-400 border border-green-400 border-opacity-30 rounded-full font-medium event-type-button active" data-type="all">
        <i class="fas fa-filter mr-1"></i> Tous
      </button>
      <button class="text-xs px-3 py-1.5 bg-transparent text-gray-400 border border-gray-700 rounded-full font-medium event-type-button" data-type="economic">
        <i class="fas fa-chart-line mr-1"></i> Économie
      </button>
      <button class="text-xs px-3 py-1.5 bg-transparent text-gray-400 border border-gray-700 rounded-full font-medium event-type-button" data-type="earnings">
        <i class="fas fa-chart-pie mr-1"></i> Résultats
      </button>
      <button class="text-xs px-3 py-1.5 bg-transparent text-gray-400 border border-gray-700 rounded-full font-medium event-type-button" data-type="ipo">
        <i class="fas fa-rocket mr-1"></i> IPO
      </button>
      <button class="text-xs px-3 py-1.5 bg-transparent text-gray-400 border border-gray-700 rounded-full font-medium event-type-button" data-type="merger">
        <i class="fas fa-handshake mr-1"></i> M&A
      </button>
    </div>
  `;
  
  // Insérer les filtres par type après le header
  headerSection.parentNode.insertBefore(typeFiltersContainer, headerSection.nextSibling);
  */
  
  // Ajouter les écouteurs d'événements
  setupFilterListeners();
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
  
  // Les écouteurs pour les filtres de type ne sont plus nécessaires
  // puisque nous avons supprimé ces filtres
  /*
  // Écouteurs pour les filtres de type
  const typeButtons = document.querySelectorAll('.event-type-button');
  typeButtons.forEach(button => {
    button.addEventListener('click', function() {
      setActiveTypeFilter(this);
      filterEventsByType(this.getAttribute('data-type'));
    });
  });
  */
  
  // Déclencher le filtre "Aujourd'hui" par défaut
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
 * Filtre les événements par date
 */
function filterEventsByDate(dateFilter) {
  // Obtenir la date d'aujourd'hui au format DD/MM/YYYY
  const today = new Date();
  const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  
  // Sélection de toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  
  if (dateFilter === 'today') {
    // Masquer les événements qui ne sont pas d'aujourd'hui
    eventCards.forEach(card => {
      const dateText = card.textContent.match(/\d{2}\/\d{2}\/\d{4}/);
      const eventDate = dateText ? dateText[0] : null;
      
      if (eventDate === formattedToday) {
        card.style.display = ''; // Afficher l'événement
        card.setAttribute('data-hidden', "false");
      } else {
        card.style.display = 'none'; // Masquer l'événement
        card.setAttribute('data-hidden', "true");
      }
    });
    
    // Classe pour indiquer le mode filtrage actif
    document.body.classList.add('today-filter-active');
    document.body.classList.remove('week-filter-active');
  } else if (dateFilter === 'week') {
    // Calcul de la fin de la semaine
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 6);
    
    // Afficher tous les événements de la semaine
    eventCards.forEach(card => {
      const dateText = card.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      
      if (!dateText) {
        card.style.display = 'none';
        card.setAttribute('data-hidden', "true");
        return;
      }
      
      try {
        // Convertir en objet Date
        const eventDate = new Date(`${dateText[3]}-${dateText[2]}-${dateText[1]}`);
        
        // Afficher uniquement les événements entre aujourd'hui et fin de semaine
        if (eventDate >= today && eventDate <= endOfWeek) {
          card.style.display = ''; // Afficher l'événement
          card.setAttribute('data-hidden', "false");
        } else {
          card.style.display = 'none'; // Masquer l'événement
          card.setAttribute('data-hidden', "true");
        }
      } catch (error) {
        console.error("Erreur lors de l'analyse de la date:", error);
        card.style.display = ''; // En cas d'erreur, afficher l'événement
        card.setAttribute('data-hidden', "false");
      }
    });
    
    // Classe pour indiquer le mode filtrage actif
    document.body.classList.remove('today-filter-active');
    document.body.classList.add('week-filter-active');
  }
  
  // Nous n'avons plus besoin de réappliquer le filtre par type
  // puisque nous avons supprimé ces filtres
  /*
  // Réappliquer le filtre par type actif
  const activeTypeFilter = document.querySelector('.event-type-button.active');
  if (activeTypeFilter) {
    filterEventsByType(activeTypeFilter.getAttribute('data-type'));
  }
  */
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
      if (card.getAttribute('data-hidden') === "true") {
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
    if (card.getAttribute('data-hidden') === "true") {
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
 * Supprime les badges "ESSENTIEL" des événements
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