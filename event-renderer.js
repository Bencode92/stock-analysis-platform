/**
 * event-renderer.js
 * Script pour le rendu des événements - Version optimisée pour résoudre les problèmes de filtrage
 * Version 2.1 - Avril 2025
 */

// Variable globale pour suivre si l'initialisation a déjà eu lieu
window.eventInitialized = false;

// Attendre que le DOM soit chargé avant d'initialiser
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔄 Chargement du event-renderer.js - Version optimisée 2.1');
  
  // Éviter l'initialisation multiple
  if (window.eventInitialized) {
    console.log('⚠️ Événements déjà initialisés - Initialisation ignorée');
    return;
  }
  
  // Marquer comme initialisé
  window.eventInitialized = true;
  
  console.log('🚀 Initialisation du gestionnaire d\'événements...');
  
  // 1. D'abord, injecter des styles prioritaires pour garantir l'apparence des événements
  injectPriorityStyles();
  
  // 2. Attendre un court instant pour s'assurer que tous les scripts sont chargés
  setTimeout(async () => {
    // Initialiser le gestionnaire d'événements de manière asynchrone
    await initializeEventsManager();
    
    // 3. Une fois l'initialisation terminée, déclencher 'events-ready'
    console.log('✅ Événements prêts - Déclenchement de l\'événement events-ready');
    const eventCards = document.querySelectorAll('.event-card');
    document.dispatchEvent(new CustomEvent('events-ready', { 
      detail: { 
        count: eventCards.length
      } 
    }));
  }, 300);
});

/**
 * Initialise ou réinitialise le gestionnaire d'événements de manière asynchrone
 * @returns {Promise} Promesse résolue une fois les événements chargés et rendus
 */
async function initializeEventsManager() {
  return new Promise(async (resolve) => {
    console.log('🔄 Initialisation du gestionnaire d\'événements...');
    
    // Supprimer toute instance existante de EventsManager
    if (window.eventsManager) {
      console.log('⚠️ Instance précédente d\'EventsManager détectée - Réinitialisation...');
      delete window.eventsManager;
    }
    
    // Vérifier que la classe EventsManager est disponible
    if (!window.EventsManager) {
      console.error('❌ La classe EventsManager n\'est pas disponible! Vérifiez que events-loader.js est bien chargé.');
      resolve(false);
      return;
    }
    
    try {
      // Initialiser un nouveau gestionnaire d'événements
      const manager = new window.EventsManager();
      window.eventsManager = manager;
      
      // IMPORTANT: Modifier la méthode renderEvents pour ajouter data-type et data-date
      extendRenderEventsMethod(manager);
      
      // Initialiser et attendre le chargement des événements
      console.log('⏳ Chargement des données d\'événements...');
      await manager.init();
      
      // Vérifier si les événements ont été chargés correctement
      if (!manager.events || !Array.isArray(manager.events) || manager.events.length === 0) {
        console.warn('⚠️ Aucun événement chargé ou format incorrect');
      } else {
        console.log(`✅ ${manager.events.length} événements chargés avec succès`);
      }
      
      // Ajouter des fonctions de diagnostic
      addDiagnosticFunctions();
      
      resolve(true);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du gestionnaire d\'événements:', error);
      resolve(false);
    }
  });
}

/**
 * Étend la méthode renderEvents pour ajouter les attributs nécessaires au filtrage
 * @param {Object} manager - Instance de EventsManager
 */
function extendRenderEventsMethod(manager) {
  // Sauvegarder la méthode originale
  const originalRenderEvents = manager.renderEvents;
  
  // Remplacer par notre version améliorée
  manager.renderEvents = function() {
    console.log('📊 Rendu des événements...');
    
    // Avant le rendu, supprimer les doublons basés sur le titre
    if (this.events && Array.isArray(this.events) && this.events.length > 0) {
      const uniqueEvents = [];
      const seenTitles = new Set();
      
      this.events.forEach(event => {
        if (event.title && !seenTitles.has(event.title)) {
          // IMPORTANT: Normalisation du type et de la date avant le rendu
          if (event.type === 'merger') event.type = 'm&a';
          event.type = (event.type || 'economic').toLowerCase();
          
          seenTitles.add(event.title);
          uniqueEvents.push(event);
        }
      });
      
      console.log(`🔍 Suppression des doublons: ${this.events.length} → ${uniqueEvents.length} événements uniques`);
      this.events = uniqueEvents;
    }
    
    // Appeler la méthode originale
    originalRenderEvents.call(this);
    
    // IMPORTANT: Ajouter data-type et data-date à chaque événement APRÈS le rendu
    console.log('🏷️ Application des attributs data-type et data-date aux événements...');
    const eventCards = document.querySelectorAll('.event-card');
    console.log(`🔍 ${eventCards.length} cartes d'événements trouvées pour l'assignation des attributs`);
    
    if (eventCards.length === 0) {
      console.warn('⚠️ Aucune carte d\'événement trouvée, vérifier le rendu initial');
      return;
    }
    
    eventCards.forEach((card, index) => {
      try {
        // S'assurer que nous avons des données d'événement
        if (this.events && index < this.events.length) {
          const event = this.events[index];
          
          // 1. Normaliser le type d'événement
          let eventType = (event.type || 'economic').toLowerCase();
          
          // Convertir 'merger' en 'm&a' pour correspondre aux filtres
          if (eventType === 'merger' || eventType === 'acquisition') {
            eventType = 'm&a';
          }
          
          // 2. Appliquer data-type 
          card.setAttribute('data-type', eventType);
          
          // 3. Ajouter une classe pour un débogage visuel
          card.classList.add(`event-type-${eventType}`);
          
          // 4. S'assurer que la date est disponible pour les filtres
          const dateEl = card.querySelector('.event-date');
          if (!dateEl && event.date) {
            // Si pas d'élément date, en créer un
            const newDateEl = document.createElement('span');
            newDateEl.className = 'event-date';
            newDateEl.style.display = 'none'; // Invisible mais utilisé pour le filtrage
            newDateEl.textContent = event.date;
            card.appendChild(newDateEl);
          } else if (dateEl && event.date) {
            // Si l'élément existe déjà, s'assurer que la date est correcte
            dateEl.textContent = event.date;
          }
          
          // 5. Ajouter un attribut data-date explicite
          if (event.date) {
            card.setAttribute('data-date', event.date);
          }
          
          // 6. Ajouter un attribut data-title pour faciliter le débogage
          if (event.title) {
            card.setAttribute('data-title', event.title);
          }
          
          // 7. Ajouter un attribut data-debug aux 3 premiers événements
          if (index < 3) {
            card.setAttribute('data-debug', 'true');
          }
          
          // Log pour les premiers événements (débogage)
          if (index < 3) {
            console.log(`🔖 Événement #${index+1}: Type=${eventType}, Date=${event.date}, Titre=${event.title?.substring(0, 30) || 'Sans titre'}`);
          }
        } else {
          console.warn(`⚠️ Pas de données pour la carte d'événement #${index+1}`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'application des attributs à la carte #${index+1}:`, error);
      }
    });
    
    console.log('✅ Attributs appliqués, événements prêts pour le filtrage');
  };
}

/**
 * Ajoute des fonctions de diagnostic globales pour les événements
 */
function addDiagnosticFunctions() {
  // Fonction pour vérifier l'état des événements
  window.diagEvents = function() {
    const eventCards = document.querySelectorAll('.event-card');
    
    console.group('📊 Diagnostic des événements');
    console.log(`Nombre total d'événements: ${eventCards.length}`);
    
    const countByType = {};
    const hiddenEvents = [];
    const eventsWithoutType = [];
    const dateFormats = [];
    
    eventCards.forEach((card, index) => {
      const type = card.getAttribute('data-type');
      const title = card.getAttribute('data-title') || card.querySelector('h3')?.textContent || `Événement #${index+1}`;
      const isHidden = window.getComputedStyle(card).display === 'none';
      const dateEl = card.querySelector('.event-date');
      
      // Compter par type
      countByType[type] = (countByType[type] || 0) + 1;
      
      // Événements cachés
      if (isHidden) {
        hiddenEvents.push({index, title, type});
      }
      
      // Événements sans type
      if (!type) {
        eventsWithoutType.push({index, title});
      }
      
      // Collecter formats de date
      if (dateEl) {
        dateFormats.push(dateEl.textContent);
      }
      
      // Afficher les 3 premiers événements en détail
      if (index < 3) {
        console.log(`Carte #${index+1}:`, {
          type,
          visible: !isHidden,
          title: title.substring(0, 30) + '...',
          date: dateEl?.textContent || 'Pas de date',
          classes: Array.from(card.classList).join(', ')
        });
      }
    });
    
    console.log('Types d\'événements:', countByType);
    console.log('Événements cachés:', hiddenEvents.length > 0 ? hiddenEvents : 'Aucun');
    console.log('Événements sans type:', eventsWithoutType.length > 0 ? eventsWithoutType : 'Aucun');
    console.log('Formats de date (échantillon):', dateFormats.slice(0, 5));
    
    // Vérifier les filtres actifs
    if (window.EventFilters) {
      console.log('État des filtres:', {
        dateFilter: window.EventFilters.state.dateFilter,
        categoryFilter: window.EventFilters.state.categoryFilter,
        initialized: window.EventFilters.state.initialized
      });
    } else {
      console.log('❌ EventFilters non initialisé');
    }
    
    console.groupEnd();
    
    return {
      total: eventCards.length,
      byType: countByType,
      hidden: hiddenEvents,
      withoutType: eventsWithoutType,
      dateFormats: dateFormats.slice(0, 5)
    };
  };
}

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
    
    /* Indicateurs visuels par type pour le débogage */
    .event-type-economic::after {
      content: "economic";
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(0, 100, 255, 0.3);
      color: white;
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
    }
    
    .event-type-ipo::after {
      content: "ipo";
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(255, 100, 0, 0.3);
      color: white;
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
    }
    
    .event-type-m\\&a::after {
      content: "m&a";
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(100, 200, 0, 0.3);
      color: white;
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
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
    #today-filter.active, 
    #week-filter.active {
      background-color: rgba(0, 255, 135, 0.2) !important;
      color: #00ff87 !important;
      border-color: #00ff87 !important;
      transform: translateY(-1px) !important;
      font-weight: 600 !important;
      box-shadow: 0 0 8px rgba(0, 255, 135, 0.3) !important;
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
    
    /* Compteur d'événements */
    #events-info {
      text-align: right;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #777;
      padding-right: 0.5rem;
    }
    
    /* Animation pour fade-in */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out forwards;
    }
  `;
  
  document.head.appendChild(styleEl);
  console.log('✅ Styles prioritaires injectés');
}

// Gérer les retours à la page via le cache
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('♻️ Page restaurée depuis le cache, réinitialisation des événements...');
    window.eventInitialized = false;
    
    // Relancer l'initialisation
    setTimeout(async () => {
      if (!window.eventInitialized) {
        window.eventInitialized = true;
        await initializeEventsManager();
        
        // Envoyer l'événement events-ready
        const eventCards = document.querySelectorAll('.event-card');
        document.dispatchEvent(new CustomEvent('events-ready', { 
          detail: { count: eventCards.length }
        }));
      }
    }, 500);
  }
});

// Fonction pour forcer une réinitialisation complète
window.reinitializeEvents = async function() {
  console.log('🔄 Réinitialisation forcée des événements...');
  window.eventInitialized = false;
  
  // Vider le conteneur d'événements
  const container = document.getElementById('events-container');
  if (container) {
    container.innerHTML = `
      <div class="col-span-3 flex items-center justify-center p-6">
        <div class="loading-spinner mr-3"></div>
        <p class="text-gray-400">Réinitialisation des événements...</p>
      </div>
    `;
  }
  
  // Réinitialiser et recharger
  window.eventInitialized = true;
  await initializeEventsManager();
  
  // Envoyer l'événement events-ready
  const eventCards = document.querySelectorAll('.event-card');
  document.dispatchEvent(new CustomEvent('events-ready', { 
    detail: { count: eventCards.length }
  }));
  
  console.log('✅ Réinitialisation des événements terminée');
  
  // Si EventFilters existe, forcer le filtrage
  if (window.EventFilters) {
    window.EventFilters.applyFilters();
  }
  
  return 'Événements réinitialisés avec succès';
};
