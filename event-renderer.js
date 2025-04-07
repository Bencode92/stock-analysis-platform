/**
 * event-renderer.js
 * Script pour le rendu des événements - Version corrigée pour résoudre les problèmes de filtrage
 */

// Variable globale pour suivre si l'initialisation a déjà eu lieu
window.eventInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
  console.log('🔄 Chargement du event-renderer.js - Version améliorée');
  
  // Éviter l'initialisation multiple
  if (window.eventInitialized) return;
  window.eventInitialized = true;

  console.log('🚀 Initialisation du gestionnaire d\'événements...');
  
  // 1. D'abord, injecter des styles prioritaires pour garantir l'apparence des événements
  injectPriorityStyles();
  
  // 2. Attendre que tout soit chargé, puis prendre le contrôle
  setTimeout(() => {
    initializeEventsManager();
  }, 500);
});

/**
 * Initialise ou réinitialise le gestionnaire d'événements
 */
function initializeEventsManager() {
  // Supprimer toute instance existante de EventsManager
  if (window.eventsManager) {
    delete window.eventsManager;
  }
  
  // Initialiser un nouveau gestionnaire d'événements unifié
  window.eventsManager = new EventsManager();
  
  // IMPORTANT: Modifier la méthode renderEvents pour ajouter data-type
  const originalRenderEvents = window.eventsManager.renderEvents;
  window.eventsManager.renderEvents = function() {
    console.log('📊 Rendu des événements...');
    
    // Avant le rendu, supprimer les doublons basés sur le titre
    if (this.events && Array.isArray(this.events) && this.events.length > 0) {
      const uniqueEvents = [];
      const seenTitles = new Set();
      
      this.events.forEach(event => {
        if (event.title && !seenTitles.has(event.title)) {
          seenTitles.add(event.title);
          uniqueEvents.push(event);
        }
      });
      
      console.log(`🔍 Suppression des doublons: ${this.events.length} → ${uniqueEvents.length} événements uniques`);
      this.events = uniqueEvents;
    }
    
    // Appeler la méthode originale
    originalRenderEvents.call(this);
    
    // IMPORTANT: Ajouter data-type à chaque événement APRÈS le rendu
    console.log('🏷️ Application des attributs data-type aux événements...');
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
          
          // Normaliser le type d'événement
          let eventType = (event.type || 'economic').toLowerCase();
          
          // Convertir 'merger' en 'm&a' pour correspondre aux filtres
          if (eventType === 'merger' || eventType === 'acquisition') {
            eventType = 'm&a';
          }
          
          // Appliquer data-type de manière visible et traçable
          console.log(`🔖 Événement #${index+1}: Type=${eventType}, Titre=${event.title?.substring(0, 30) || 'Sans titre'}`);
          
          // TOUJOURS remplacer l'attribut existant pour s'assurer qu'il est à jour
          card.setAttribute('data-type', eventType);
          
          // Ajouter également une classe pour un débogage visuel
          card.classList.add(`event-type-${eventType}`);
          
          // Garantir que la date est disponible pour les filtres de date
          if (!card.querySelector('.event-date') && event.date) {
            const dateEl = document.createElement('span');
            dateEl.className = 'event-date';
            dateEl.style.display = 'none'; // Invisible mais utilisé pour le filtrage
            dateEl.textContent = event.date;
            card.appendChild(dateEl);
          }
          
          // Ajouter un attribut data-title pour faciliter le débogage
          if (event.title) {
            card.setAttribute('data-title', event.title);
          }
        } else {
          console.warn(`⚠️ Pas de données pour la carte d'événement #${index+1}`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'application data-type à la carte #${index+1}:`, error);
      }
    });
    
    // Informer que les événements sont prêts pour le filtrage
    console.log('✅ Attributs data-type appliqués, événements prêts pour le filtrage');
    
    // Déclencher un événement personnalisé pour informer que les événements sont prêts
    document.dispatchEvent(new CustomEvent('events-ready', { 
      detail: { 
        count: eventCards.length
      } 
    }));
  };
  
  // Initialiser le gestionnaire
  window.eventsManager.init();
  console.log('✅ Gestionnaire d\'événements initialisé avec succès');
  
  // Créer une fonction de diagnostic global
  window.diagEvents = function() {
    const eventCards = document.querySelectorAll('.event-card');
    
    console.group('📊 Diagnostic des événements');
    console.log(`Nombre total d'événements: ${eventCards.length}`);
    
    const countByType = {};
    const hiddenEvents = [];
    const eventsWithoutType = [];
    
    eventCards.forEach((card, index) => {
      const type = card.getAttribute('data-type');
      const title = card.getAttribute('data-title') || card.querySelector('h3')?.textContent || `Événement #${index+1}`;
      const isHidden = window.getComputedStyle(card).display === 'none';
      
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
    });
    
    console.log('Types d\'événements:', countByType);
    console.log('Événements cachés:', hiddenEvents.length > 0 ? hiddenEvents : 'Aucun');
    console.log('Événements sans type:', eventsWithoutType.length > 0 ? eventsWithoutType : 'Aucun');
    
    console.log('Filtres actifs:');
    if (window.EventFilters) {
      console.log('- Catégorie:', window.EventFilters.state.categoryFilter);
      console.log('- Date:', window.EventFilters.state.dateFilter);
    } else {
      console.log('❌ EventFilters non initialisé');
    }
    
    console.groupEnd();
    
    return {
      total: eventCards.length,
      byType: countByType,
      hidden: hiddenEvents,
      withoutType: eventsWithoutType
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
    setTimeout(() => {
      if (!window.eventInitialized) {
        window.eventInitialized = true;
        
        // Réinitialiser les composants
        initializeEventsManager();
      }
    }, 500);
  }
});

// Ajouter une fonction de débogage avancée
window.debugEventFilters = function() {
  console.group('🔍 Diagnostic complet du système de filtrage');
  
  // 1. État du DOM
  const eventCards = document.querySelectorAll('.event-card');
  console.log(`1. Nombre d'événements dans le DOM: ${eventCards.length}`);
  
  if (eventCards.length === 0) {
    console.warn('❌ Aucun événement trouvé dans le DOM!');
    console.groupEnd();
    return { error: 'No events found' };
  }
  
  // 2. Vérifier les attributs data-type
  const typeStats = { withType: 0, withoutType: 0, typeCounts: {} };
  
  eventCards.forEach(card => {
    const type = card.getAttribute('data-type');
    if (type) {
      typeStats.withType++;
      typeStats.typeCounts[type] = (typeStats.typeCounts[type] || 0) + 1;
    } else {
      typeStats.withoutType++;
    }
  });
  
  console.log(`2. Attributs data-type: ${typeStats.withType} présents, ${typeStats.withoutType} manquants`);
  console.log('   Types détectés:', typeStats.typeCounts);
  
  // 3. Vérifier les éléments .event-date
  const dateStats = { withDate: 0, withoutDate: 0, formatOK: 0, formatError: 0 };
  const dateFormat = /^\d{2}\/\d{2}\/\d{4}$/;
  
  eventCards.forEach(card => {
    const dateEl = card.querySelector('.event-date');
    if (dateEl) {
      dateStats.withDate++;
      const dateText = dateEl.textContent.trim();
      if (dateFormat.test(dateText)) {
        dateStats.formatOK++;
      } else {
        dateStats.formatError++;
      }
    } else {
      dateStats.withoutDate++;
    }
  });
  
  console.log(`3. Éléments .event-date: ${dateStats.withDate} présents, ${dateStats.withoutDate} manquants`);
  console.log(`   Format de date: ${dateStats.formatOK} correct, ${dateStats.formatError} incorrect`);
  
  // 4. État des filtres
  console.log('4. État du système de filtrage:');
  if (window.EventFilters) {
    console.log(`   - Filtres initialisés: ${window.EventFilters.state.initialized}`);
    console.log(`   - Filtre de date: ${window.EventFilters.state.dateFilter}`);
    console.log(`   - Filtre de catégorie: ${window.EventFilters.state.categoryFilter}`);
  } else {
    console.error('   ❌ Système de filtrage non initialisé!');
  }
  
  // 5. Boutons de filtre
  const todayFilter = document.querySelector('#today-filter');
  const weekFilter = document.querySelector('#week-filter');
  const categoryFilters = document.querySelectorAll('#event-category-filters button');
  
  console.log('5. Boutons de filtre:');
  console.log(`   - Filtre "Aujourd'hui": ${todayFilter ? 'Présent' : 'Manquant'}`);
  console.log(`   - Filtre "Cette semaine": ${weekFilter ? 'Présent' : 'Manquant'}`);
  console.log(`   - Filtres de catégorie: ${categoryFilters.length} boutons trouvés`);
  
  // 6. Affichage des événements
  const visibleEvents = [...eventCards].filter(e => window.getComputedStyle(e).display !== 'none');
  
  console.log(`6. Affichage: ${visibleEvents.length} visibles, ${eventCards.length - visibleEvents.length} cachés`);
  
  // 7. Recommandations
  console.log('7. Recommandations:');
  
  if (typeStats.withoutType > 0) {
    console.warn('   ⚠️ Certains événements n\'ont pas d\'attribut data-type. Exécuter window.forceFilter() pour les corriger.');
  }
  
  if (dateStats.withoutDate > 0) {
    console.warn('   ⚠️ Certains événements n\'ont pas d\'élément .event-date. Exécuter window.forceFilter() pour les corriger.');
  }
  
  if (!window.EventFilters || !window.EventFilters.state.initialized) {
    console.error('   ❌ Le système de filtrage n\'est pas initialisé. Recharger la page ou exécuter initializeFilters().');
  }
  
  console.groupEnd();
  
  return {
    events: eventCards.length,
    types: typeStats,
    dates: dateStats,
    visible: visibleEvents.length,
    filters: window.EventFilters ? window.EventFilters.state : null
  };
};