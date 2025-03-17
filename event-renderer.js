/**
 * event-renderer.js
 * Script direct pour forcer l'affichage des événements avec les nouveaux styles
 */

document.addEventListener('DOMContentLoaded', function() {
  // Force l'application des styles aux événements avec un léger délai
  setTimeout(() => {
    console.log('Initialisation du rendu des événements amélioré...');
    
    // Cache toutes les cartes d'événements existantes
    const existingEvents = document.querySelectorAll('.event-card');
    if (existingEvents.length > 0) {
      existingEvents.forEach(card => {
        card.style.display = 'none';
      });
    }
    
    // Force l'application des styles avec une hauteur fixe et meilleure visibilité
    const styleAdjustments = `
      /* Style prioritaire pour les cartes d'événements */
      .event-card {
        position: relative !important;
        height: 180px !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 1rem !important;
        margin-bottom: 0.75rem !important;
        background-color: rgba(1, 22, 39, 0.8) !important;
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
      
      /* Animations pour les filtres actifs */
      #today-btn.filter-active, 
      #week-btn.filter-active, 
      #essential-btn.filter-active {
        background-color: rgba(0, 255, 135, 0.2) !important;
        color: #00ff87 !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 0 8px rgba(0, 255, 135, 0.3) !important;
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
        font-weight: 600 !important;
        animation: pulse 2s infinite !important;
      }
      
      /* Espacement entre colonnes */
      .grid.grid-cols-1.md\\:grid-cols-3.gap-4 {
        gap: 1.5rem !important;
      }
    `;
    
    // Ajouter les styles directement dans le document
    const styleElement = document.createElement('style');
    styleElement.textContent = styleAdjustments;
    document.head.appendChild(styleElement);
    
    // Recharger les événements
    if (window.eventsManager) {
      window.eventsManager.renderEvents();
    } else {
      // Essayer de trouver le gestionnaire d'événements
      console.log('Tentative de rechargement des événements...');
      // Réinitialisation du conteneur d'événements
      const eventsContainer = document.getElementById('events-container');
      if (eventsContainer) {
        const loadingHTML = `
          <div class="col-span-3 flex items-center justify-center p-6">
            <div class="loading-spinner mr-3"></div>
            <p class="text-gray-400">Rechargement des événements économiques...</p>
          </div>
        `;
        eventsContainer.innerHTML = loadingHTML;
        
        // Forcer le chargement après un bref délai
        setTimeout(() => {
          const eventsManager = new EventsManager();
          window.eventsManager = eventsManager;
          eventsManager.init();
        }, 500);
      }
    }
    
    // Amélioration des filtres d'événements
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const essentialBtn = document.getElementById('essential-btn');
    
    if (todayBtn && weekBtn && essentialBtn) {
      console.log('Amélioration des filtres d\'événements...');
      
      // Ajout d'effets de survol
      [todayBtn, weekBtn, essentialBtn].forEach(btn => {
        btn.addEventListener('mouseenter', function() {
          if (!this.classList.contains('filter-active')) {
            this.style.transform = 'translateY(-1px)';
            this.style.boxShadow = '0 2px 8px rgba(0, 255, 135, 0.2)';
          }
        });
        
        btn.addEventListener('mouseleave', function() {
          if (!this.classList.contains('filter-active')) {
            this.style.transform = 'none';
            this.style.boxShadow = 'none';
          }
        });
      });
    }
  }, 1000); // Délai pour s'assurer que tous les composants sont chargés
});

// Force le rechargement si on navigue entre les pages
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('Page restaurée depuis le cache, rechargement des événements...');
    setTimeout(() => {
      const eventsContainer = document.getElementById('events-container');
      if (eventsContainer) {
        const eventsManager = new EventsManager();
        window.eventsManager = eventsManager;
        eventsManager.init();
      }
    }, 500);
  }
});
