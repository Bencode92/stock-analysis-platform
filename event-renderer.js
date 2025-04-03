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
  `;
  
  document.head.appendChild(styleEl);
  console.log('Styles prioritaires injectés avec succès');
}

/**
 * Initialise les filtres de catégorie pour les événements
 */
function initializeCategoryFilters() {
  console.log('Initialisation des filtres de catégorie...');
  
  // Attendre un peu pour que les événements soient chargés
  setTimeout(() => {
    // Analyser toutes les cartes d'événements et ajouter les marqueurs de type
    preAnalyzeEventCards();
    
    // Ajouter les écouteurs d'événements aux boutons de filtre
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
  }, 1500); // Attendre 1.5 secondes pour s'assurer que tous les événements sont chargés
}

/**
 * Pré-analyse toutes les cartes d'événements et ajoute des attributs data-categories
 */
function preAnalyzeEventCards() {
  console.log('Pré-analyse des cartes d\'événements...');
  
  const eventCards = document.querySelectorAll('.event-card');
  
  eventCards.forEach(card => {
    // Créer un ensemble pour stocker toutes les catégories détectées
    const categories = new Set();
    
    // Vérifier par titre pour IPO
    if (card.querySelector('h3')?.textContent.includes('IPO:')) {
      categories.add('ipo');
    }
    
    // Vérifier les badges ipo
    if (card.querySelector('.text-xs span i.fa-rocket')) {
      categories.add('ipo');
    }
    
    // Vérifier les badges US
    if (card.querySelector('.text-xs span i.fa-flag-usa') || 
        card.textContent.toLowerCase().includes('us treasury') ||
        card.textContent.toLowerCase().includes('fed ') || 
        card.textContent.toLowerCase().includes('états-unis')) {
      categories.add('US');
    }
    
    // Vérifier les badges economic
    if (card.querySelector('.text-xs span i.fa-chart-line') || 
        card.textContent.toLowerCase().includes('taux') ||
        card.textContent.toLowerCase().includes('inflation') ||
        card.textContent.toLowerCase().includes('pib')) {
      categories.add('economic');
    }
    
    // Vérifier les badges merger
    if (card.querySelector('.text-xs span i.fa-handshake') || 
        card.textContent.toLowerCase().includes('m&a:')) {
      categories.add('merger');
    }
    
    // Vérifier les badges CN
    if (card.textContent.toLowerCase().includes('china') || 
        card.textContent.toLowerCase().includes('chinese') || 
        card.textContent.toLowerCase().includes('beijing')) {
      categories.add('CN');
    }
    
    // Stocker toutes les catégories détectées comme un attribut data-categories
    card.setAttribute('data-categories', Array.from(categories).join(' '));
    
    // Stocker également la catégorie principale comme data-primary-category pour des recherches plus rapides
    if (categories.has('US')) {
      card.setAttribute('data-primary-category', 'US');
    } else if (categories.has('economic')) {
      card.setAttribute('data-primary-category', 'economic');
    } else if (categories.has('ipo')) {
      card.setAttribute('data-primary-category', 'ipo');
    } else if (categories.has('merger')) {
      card.setAttribute('data-primary-category', 'merger');
    } else if (categories.has('CN')) {
      card.setAttribute('data-primary-category', 'CN');
    } else {
      // Par défaut, considérer comme ipo si le titre commence par IPO:
      if (card.querySelector('h3')?.textContent.startsWith('IPO:')) {
        card.setAttribute('data-primary-category', 'ipo');
      } else {
        card.setAttribute('data-primary-category', 'other');
      }
    }
    
    console.log(`Carte analysée: ${card.querySelector('h3')?.textContent} - Catégories: ${Array.from(categories).join(', ')}`);
  });
}

/**
 * Filtre les événements par catégorie
 * @param {string} category Catégorie d'événement ('all', 'ipo', 'economic', etc.)
 */
function filterEventsByCategory(category) {
  console.log(`Filtrage par catégorie: ${category}`);
  
  const eventCards = document.querySelectorAll('.event-card');
  if (!eventCards.length) {
    console.warn('Aucune carte d\'événement trouvée');
    return;
  }
  
  // Pour chaque carte d'événement
  eventCards.forEach(card => {
    if (category === 'all') {
      // Afficher tous les événements
      card.style.display = '';
    } else {
      // Vérifier si cette carte correspond à la catégorie demandée
      const primaryCategory = card.getAttribute('data-primary-category');
      const allCategories = card.getAttribute('data-categories')?.split(' ') || [];
      
      // Une carte correspond si sa catégorie principale correspond OU si elle a cette catégorie dans sa liste de catégories
      const matchesCategory = (primaryCategory === category) || allCategories.includes(category);
      
      // Afficher ou masquer selon le résultat
      card.style.display = matchesCategory ? '' : 'none';
    }
  });
  
  // Vérifier s'il y a des événements visibles
  const visibleEvents = Array.from(eventCards).filter(card => card.style.display !== 'none');
  if (visibleEvents.length === 0) {
    // Afficher un message si aucun événement n'est visible
    const eventsContainer = document.getElementById('events-container');
    
    // Supprimer les anciens messages
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
  } else {
    // Supprimer le message "aucun événement" si nécessaire
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
  
  // Surcharger la méthode renderEvents pour ajouter des attributs de type d'événement
  const originalRenderEvents = window.eventsManager.renderEvents;
  window.eventsManager.renderEvents = function() {
    // Appeler la méthode originale
    originalRenderEvents.call(this);
    
    // Ajouter des attributs data-event-type à chaque carte
    setTimeout(() => {
      // Relancer l'analyse des cartes d'événements après le rendu
      preAnalyzeEventCards();
    
      // Appliquer le filtre actif si nécessaire
      const activeFilter = document.querySelector('#event-category-filters button.filter-active');
      if (activeFilter) {
        const category = activeFilter.getAttribute('data-category');
        filterEventsByCategory(category);
      }
    }, 200);
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

// Ajouter une analyse à toutes les 3 secondes pendant le chargement initial
// pour s'assurer que les filtres fonctionnent même si le chargement est lent
let analysisCount = 0;
const analysisInterval = setInterval(() => {
  analysisCount++;
  if (analysisCount > 5) {
    clearInterval(analysisInterval);
    return;
  }
  
  const eventCards = document.querySelectorAll('.event-card');
  if (eventCards.length > 0) {
    console.log(`Analyse périodique des événements (${analysisCount}/5) - ${eventCards.length} cartes trouvées`);
    preAnalyzeEventCards();
    
    // Appliquer le filtre actif
    const activeFilter = document.querySelector('#event-category-filters button.filter-active');
    if (activeFilter) {
      const category = activeFilter.getAttribute('data-category');
      filterEventsByCategory(category);
    }
  }
}, 3000);