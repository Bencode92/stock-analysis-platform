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
    
    // Initialiser les filtres de catégorie
    initializeCategoryFilters();
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
    
    /* Styles pour les filtres de catégorie */
    #event-category-filters button.filter-active {
      background-color: rgba(0, 255, 135, 0.2) !important;
      color: #00ff87 !important;
      border-color: #00ff87 !important;
      font-weight: 600 !important;
    }
    
    /* Styles pour le message d'événements vides */
    #no-events-message {
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
  `;
  
  document.head.appendChild(styleEl);
  console.log('Styles prioritaires injectés avec succès');
}

/**
 * Initialise les filtres de catégorie pour les événements
 */
function initializeCategoryFilters() {
  console.log('Initialisation des filtres de catégorie...');
  
  // CORRECTION ICI: Suppression de la ligne qui désactive les boutons de filtres
  // -------------------------------------------------------------
  // SUPPRIMER: document.querySelectorAll('#event-category-filters button').forEach(btn => {
  // SUPPRIMER:   btn.style.pointerEvents = 'none'; // Désactiver les clics
  // SUPPRIMER:   btn.title = "Filtrage temporairement désactivé";
  // SUPPRIMER: });
  // -------------------------------------------------------------
  
  const filterButtons = document.querySelectorAll('#event-category-filters button');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Supprimer la classe active de tous les boutons
      filterButtons.forEach(btn => {
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
}

/**
 * Filtre les événements par catégorie en fonction du bouton de filtre cliqué
 * @param {string} category Catégorie à filtrer ('all', 'ipo', 'US', etc.)
 */
function filterEventsByCategory(category) {
  console.log(`Filtrage par catégorie: ${category}`);
  
  // Récupérer toutes les cartes d'événements
  const eventCards = document.querySelectorAll('.event-card');
  if (!eventCards.length) {
    console.warn('Aucune carte d\'événement trouvée');
    return;
  }
  
  console.log('Cartes trouvées:', eventCards.length);
  
  // Pour chaque carte d'événement
  eventCards.forEach(card => {
    if (category === 'all') {
      // Afficher tous les événements
      card.style.display = '';
    } else {
      // CORRECTION ICI: Utiliser d'abord l'attribut data-type s'il existe
      // -------------------------------------------------------------
      const cardType = card.getAttribute('data-type');
      let showCard = false;
      
      // Si l'attribut data-type existe et correspond à la catégorie, montrer la carte
      if (cardType && (cardType === category)) {
        showCard = true;
      } 
      // Sinon, utiliser la détection plus complexe par contenu
      else {
        // 1. FILTRE IPO: Recherche directe des badges "ipo" ou du texte "IPO:" dans le titre
        if (category === 'ipo') {
          // Vérifie le titre pour "IPO:"
          const title = card.querySelector('h3')?.textContent || '';
          if (title.startsWith('IPO:')) {
            showCard = true;
          }
          
          // Vérifie les badges "ipo"
          if (!showCard) {
            const ipoBadge = card.querySelector('.ipo, span:contains("ipo")');
            if (ipoBadge || card.querySelector('[class*="ipo"]')) {
              showCard = true;
            }
          }
          
          // Recherche spécifique d'un badge ipo dans les éléments de la carte
          if (!showCard) {
            const badges = card.querySelectorAll('span, button, div.text-xs');
            for (const badge of badges) {
              if (badge.textContent.trim().toLowerCase() === 'ipo') {
                showCard = true;
                break;
              }
            }
          }
        }
        
        // 2. FILTRE US: Recherche des badges "US" ou du contenu lié aux États-Unis
        else if (category === 'US') {
          // Vérifie les badges "US"
          const usBadge = card.querySelector('.us, [class*="us"]');
          if (usBadge) {
            showCard = true;
          }
          
          // Recherche spécifique de "US" dans les badges
          if (!showCard) {
            const badges = card.querySelectorAll('span');
            for (const badge of badges) {
              if (badge.textContent.trim().toLowerCase() === 'us') {
                showCard = true;
                break;
              }
            }
          }
          
          // Recherche dans le contenu pour des mentions des États-Unis
          if (!showCard) {
            const content = card.textContent.toLowerCase();
            if (content.includes('fed ') || 
                content.includes('états-unis') || 
                content.includes('fed)') ||
                content.includes('us treasury')) {
              showCard = true;
            }
          }
        }
        
        // 3. FILTRE ECONOMIC: Recherche des indicateurs économiques
        else if (category === 'economic') {
          // Vérifie les badges "economic"
          const econBadge = card.querySelector('.economic, [class*="economic"]');
          if (econBadge) {
            showCard = true;
          }
          
          // Recherche spécifique de "economic" dans les badges
          if (!showCard) {
            const badges = card.querySelectorAll('span');
            for (const badge of badges) {
              if (badge.textContent.trim().toLowerCase() === 'economic') {
                showCard = true;
                break;
              }
            }
          }
          
          // Recherche dans le contenu pour des mentions économiques
          if (!showCard) {
            const content = card.textContent.toLowerCase();
            if (content.includes('taux') || 
                content.includes('inflation') || 
                content.includes('pib') ||
                content.includes('gdp') ||
                content.includes('banque centrale')) {
              showCard = true;
            }
          }
        }
        
        // 4. FILTRE M&A: Recherche des fusions et acquisitions
        else if (category === 'm&a') {
          // Vérifie le titre pour "M&A:"
          const title = card.querySelector('h3')?.textContent || '';
          if (title.startsWith('M&A:')) {
            showCard = true;
          }
          
          // Vérifie les badges "merger" ou "m&a"
          if (!showCard) {
            const mergerBadge = card.querySelector('.merger, .m\\&a, [class*="merger"], [class*="m&a"]');
            if (mergerBadge) {
              showCard = true;
            }
          }
          
          // Recherche spécifique de "merger" ou "m&a" dans les badges
          if (!showCard) {
            const badges = card.querySelectorAll('span');
            for (const badge of badges) {
              const badgeText = badge.textContent.trim().toLowerCase();
              if (badgeText === 'merger' || badgeText === 'm&a') {
                showCard = true;
                break;
              }
            }
          }
          
          // Recherche dans le contenu pour des mentions de fusion/acquisition
          if (!showCard) {
            const content = card.textContent.toLowerCase();
            if (content.includes('merger') || 
                content.includes('acquisition') || 
                content.includes('fusion') ||
                content.includes('m&a')) {
              showCard = true;
            }
          }
        }
        
        // 5. FILTRE CN: Recherche de contenu lié à la Chine
        else if (category === 'CN') {
          // Vérifie les badges "CN"
          const cnBadge = card.querySelector('.cn, [class*="cn"]');
          if (cnBadge) {
            showCard = true;
          }
          
          // Recherche spécifique de "CN" dans les badges
          if (!showCard) {
            const badges = card.querySelectorAll('span');
            for (const badge of badges) {
              if (badge.textContent.trim().toLowerCase() === 'cn') {
                showCard = true;
                break;
              }
            }
          }
          
          // Recherche dans le contenu pour des mentions de la Chine
          if (!showCard) {
            const content = card.textContent.toLowerCase();
            if (content.includes('china') || 
                content.includes('chinese') || 
                content.includes('beijing') ||
                content.includes('pboc')) {
              showCard = true;
            }
          }
        }
      }
      
      // Afficher ou masquer la carte en fonction du résultat
      card.style.display = showCard ? '' : 'none';
    }
  });
  
  // Vérifier s'il y a des événements visibles
  const visibleEvents = Array.from(eventCards).filter(card => card.style.display !== 'none');
  if (visibleEvents.length === 0) {
    // Utiliser le message d'événement vide existant s'il existe
    const existingMessage = document.getElementById('no-events-message');
    if (existingMessage) {
      existingMessage.style.display = 'flex';
      if (existingMessage.querySelector('span')) {
        existingMessage.querySelector('span').textContent = `Aucun événement dans cette catégorie`;
      }
    } else {
      // Afficher un message si aucun événement n'est visible
      const eventsContainer = document.getElementById('events-container');
      
      // Supprimer l'ancien message s'il existe
      const oldMessage = document.getElementById('no-category-events');
      if (oldMessage) {
        oldMessage.remove();
      }
      
      const messageEl = document.createElement('div');
      messageEl.id = 'no-category-events';
      messageEl.className = 'col-span-3 flex flex-col items-center justify-center p-6 text-center';
      messageEl.innerHTML = `
        <i class="fas fa-filter text-gray-600 text-3xl mb-3"></i>
        <p class="text-gray-400">Aucun événement dans cette catégorie</p>
      `;
      
      eventsContainer.appendChild(messageEl);
    }
  } else {
    // Masquer les messages "aucun événement"
    const noEventsMessage = document.getElementById('no-events-message');
    if (noEventsMessage) {
      noEventsMessage.style.display = 'none';
    }
    
    const oldMessage = document.getElementById('no-category-events');
    if (oldMessage) {
      oldMessage.remove();
    }
  }
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
  
  // Surcharger la méthode renderEvents pour ajouter le filtrage après le rendu
  const originalRenderEvents = window.eventsManager.renderEvents;
  window.eventsManager.renderEvents = function() {
    // Appeler la méthode originale
    originalRenderEvents.call(this);
    
    // CORRECTION: Ajouter l'attribut data-type à chaque carte d'événement
    // -------------------------------------------------------------
    const eventCards = document.querySelectorAll('.event-card');
    eventCards.forEach((card, index) => {
      if (!card.hasAttribute('data-type') && this.events && this.events[index]) {
        // Obtenir le type d'événement à partir des données
        const eventType = this.events[index].type || 'economic';
        
        // Harmoniser les types pour les filtres
        let normalizedType = eventType.toLowerCase();
        if (normalizedType === 'merger') normalizedType = 'm&a';
        if (normalizedType === 'economic' && this.events[index].country === 'US') {
          card.setAttribute('data-country', 'US');
        }
        
        // Appliquer l'attribut data-type
        card.setAttribute('data-type', normalizedType);
      }
    });
    // -------------------------------------------------------------
    
    // Après le rendu, appliquer le filtre actif
    setTimeout(() => {
      // Appliquer le filtre actif s'il y en a un
      const activeFilter = document.querySelector('#event-category-filters button.filter-active');
      if (activeFilter) {
        const category = activeFilter.getAttribute('data-category');
        filterEventsByCategory(category);
      }
    }, 300);
  };
  
  // Améliorer la méthode filterEvents pour trier les événements essentiels en premier
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
        initializeCategoryFilters();
      }
    }, 500);
  }
});

// Fonction jQuery-like pour simplifier la sélection des éléments par contenu
document.addEventListener('DOMContentLoaded', function() {
  // Surcharge du querySelector pour permettre des sélections par contenu
  const originalQuerySelector = Element.prototype.querySelector;
  Element.prototype.querySelector = function(selector) {
    // Si le sélecteur contient :contains(), utiliser notre logique personnalisée
    if (selector.includes(':contains(')) {
      const match = selector.match(/:contains\(\"?([^\"]*)\\"?\)/);
      if (match) {
        const content = match[1].toLowerCase();
        const baseSelector = selector.replace(/:contains\(\"?[^\"]*\\"?\)/, '');
        
        // Sélectionner tous les éléments correspondant au sélecteur de base
        const elements = this.querySelectorAll(baseSelector || '*');
        
        // Retourner le premier élément dont le texte contient le contenu recherché
        for (const el of elements) {
          if (el.textContent.toLowerCase().includes(content)) {
            return el;
          }
        }
        
        return null;
      }
    }
    
    // Sinon, utiliser le querySelector standard
    return originalQuerySelector.call(this, selector);
  };
});