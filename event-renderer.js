/**
 * event-renderer.js
 * Script unique pour coordonner l'affichage des événements
 */

// Variable globale pour suivre si l'initialisation a déjà eu lieu
window.eventInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
  // Éviter l'initialisation multiple
  if (window.eventInitialized) return;
  window.eventInitialized = true;

  console.log('Initialisation du gestionnaire d\'événements unifié...');
  
  // 1. D'abord, injecter des styles prioritaires pour garantir l'apparence des événements
  injectPriorityStyles();
  
  // 2. Attendre que tout soit chargé, puis prendre le contrôle
  setTimeout(() => {
    // Supprimer toute instance existante de EventsManager
    if (window.eventsManager) {
      delete window.eventsManager;
    }
    
    // Initialiser un nouveau gestionnaire d'événements unifié
    initializeEventsManager();
  }, 800);
});

/**
 * Injecte des styles CSS prioritaires qui surchargeront tout autre style
 */
function injectPriorityStyles() {
  // Vérifier si les styles sont déjà injectés
  if (document.getElementById('events-priority-styles')) return;
  
  const styleEl = document.createElement('style');
  styleEl.id = 'events-priority-styles';
  
  styleEl.textContent = `
    /* Styles prioritaires pour les cartes d'événements */
    .event-card {
      position: relative !important;
      height: 180px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      margin-bottom: 0.75rem !important;
      background-color: rgba(1, 22, 39, 0.8) !important;
      transition: all 0.3s ease !important;
      border-radius: 0.5rem !important;
    }
    
    .event-card:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2) !important;
      border-color: rgba(0, 255, 135, 0.3) !important;
    }
    
    /* Indicateur d'impact plus visible */
    .event-card::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 5px !important;
      height: 100% !important;
    }
    
    .event-card.high-impact::before {
      background: linear-gradient(to bottom, #ff3d00, #ff7043) !important;
      box-shadow: 0 0 10px rgba(255, 61, 0, 0.7) !important;
    }
    
    .event-card.medium-impact::before {
      background: linear-gradient(to bottom, #ff9100, #ffb74d) !important;
      box-shadow: 0 0 10px rgba(255, 145, 0, 0.6) !important;
    }
    
    .event-card.low-impact::before {
      background: linear-gradient(to bottom, #00e676, #69f0ae) !important;
      box-shadow: 0 0 10px rgba(0, 230, 118, 0.6) !important;
    }
    
    /* Badge essentiel amélioré */
    .essential-badge {
      position: absolute !important;
      top: 10px !important;
      right: 10px !important;
      background: rgba(0, 255, 135, 0.3) !important;
      color: #00ff87 !important;
      padding: 4px 8px !important;
      font-size: 0.7rem !important;
      border-radius: 4px !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      box-shadow: 0 0 12px rgba(0, 255, 135, 0.4) !important;
      animation: pulse 2s infinite !important;
    }
    
    /* Espacement entre colonnes */
    .grid.grid-cols-1.md\\:grid-cols-3.gap-4 {
      gap: 1.5rem !important;
    }
    
    /* Boutons de filtre améliorés */
    #today-btn.filter-active, 
    #week-btn.filter-active, 
    #essential-btn.filter-active {
      background-color: rgba(0, 255, 135, 0.2) !important;
      color: #00ff87 !important;
      border-color: #00ff87 !important;
      transform: translateY(-1px) !important;
      font-weight: 600 !important;
      box-shadow: 0 0 8px rgba(0, 255, 135, 0.3) !important;
    }
    
    #today-btn:hover, 
    #week-btn:hover, 
    #essential-btn:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 2px 8px rgba(0, 255, 135, 0.2) !important;
    }
  `;
  
  document.head.appendChild(styleEl);
  console.log('Styles prioritaires injectés avec succès');
}

/**
 * Initialise un nouveau gestionnaire d'événements unifié
 */
function initializeEventsManager() {
  // Réinitialiser le conteneur d'événements
  const eventsContainer = document.getElementById('events-container');
  if (!eventsContainer) {
    console.error('Conteneur d\'événements non trouvé!');
    return;
  }
  
  // Afficher l'état de chargement
  eventsContainer.innerHTML = `
    <div class="col-span-3 flex items-center justify-center p-6">
      <div class="loading-spinner mr-3"></div>
      <p class="text-gray-400">Chargement des événements économiques...</p>
    </div>
  `;
  
  // Attendons pour s'assurer que la classe EventsManager est disponible
  if (typeof EventsManager === 'undefined') {
    console.error('EventsManager n\'est pas défini! Vérifiez que events-loader.js est correctement chargé.');
    return;
  }
  
  // Créer une nouvelle instance unique du gestionnaire d'événements
  window.eventsManager = new EventsManager();
  
  // Surcharger la méthode filterEvents pour trier les événements essentiels en premier
  const originalFilterEvents = window.eventsManager.filterEvents;
  window.eventsManager.filterEvents = function() {
    const filteredEvents = originalFilterEvents.call(this);
    
    // Trier pour mettre les événements essentiels en premier, puis par importance
    return filteredEvents.sort((a, b) => {
      // Événements essentiels en premier
      if (a.isEssential && !b.isEssential) return -1;
      if (!a.isEssential && b.isEssential) return 1;
      
      // Ensuite par importance
      const importanceOrder = { high: 1, medium: 2, low: 3 };
      const importanceA = importanceOrder[a.importance] || 4;
      const importanceB = importanceOrder[b.importance] || 4;
      if (importanceA !== importanceB) return importanceA - importanceB;
      
      // Puis par heure
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      return timeA.localeCompare(timeB);
    });
  };
  
  // Améliorer la méthode renderEvents pour appliquer des classes supplémentaires
  const originalRenderEvents = window.eventsManager.renderEvents;
  window.eventsManager.renderEvents = function() {
    // Appeler la méthode originale
    originalRenderEvents.call(this);
    
    // Ajouter des améliorations après le rendu
    setTimeout(() => {
      const eventCards = document.querySelectorAll('.event-card');
      eventCards.forEach(card => {
        // Appliquer une hauteur fixe pour uniformité
        card.style.height = '180px';
        // Ajouter un effet de survol spécial pour les événements essentiels
        if (card.innerHTML.includes('essential-badge')) {
          card.classList.add('essential-event');
        }
      });
    }, 200);
  };
  
  // Améliorer les boutons de filtre
  setupEnhancedFilters();
  
  // Initialiser le gestionnaire
  window.eventsManager.init();
  console.log('Gestionnaire d\'événements unifié initialisé avec succès');
}

/**
 * Configure des effets améliorés pour les boutons de filtre
 */
function setupEnhancedFilters() {
  const todayBtn = document.getElementById('today-btn');
  const weekBtn = document.getElementById('week-btn');
  const essentialBtn = document.getElementById('essential-btn');
  
  if (todayBtn && weekBtn && essentialBtn) {
    console.log('Configuration des filtres améliorés...');
    
    // Ajouter des effets visuels au survol
    [todayBtn, weekBtn, essentialBtn].forEach(btn => {
      // Ajouter un effet de survol uniquement si le bouton n'est pas actif
      btn.addEventListener('mouseenter', function() {
        if (!this.classList.contains('filter-active')) {
          this.style.transform = 'translateY(-1px)';
          this.style.boxShadow = '0 2px 8px rgba(0, 255, 135, 0.2)';
          this.style.borderColor = 'rgba(0, 255, 135, 0.3)';
        }
      });
      
      btn.addEventListener('mouseleave', function() {
        if (!this.classList.contains('filter-active')) {
          this.style.transform = '';
          this.style.boxShadow = '';
          this.style.borderColor = '';
        }
      });
    });
  }
}

// Gérer les retours à la page via le cache
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('Page restaurée depuis le cache, réinitialisation des événements...');
    window.eventInitialized = false;
    // Relancer l'initialisation
    setTimeout(() => {
      // Eviter l'initialisation multiple
      if (!window.eventInitialized) {
        window.eventInitialized = true;
        initializeEventsManager();
      }
    }, 500);
  }
});
