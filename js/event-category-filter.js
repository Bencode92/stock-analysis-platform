/**
 * event-category-filter.js
 * Script pour améliorer le filtrage des événements par catégorie
 */

document.addEventListener('DOMContentLoaded', function() {
  // Attendre que tous les éléments soient chargés
  setTimeout(() => {
    console.log("Initialisation du filtrage d'événements par catégorie...");
    
    // Améliorer les fonctions de filtrage
    enhanceEventFiltering();
    
    // Appliquer le filtre "TOUS" par défaut
    const allButton = document.querySelector('#event-category-filters button[data-category="all"]');
    if (allButton) {
      allButton.click();
    }
  }, 2000);
});

/**
 * Améliore le filtrage des événements
 */
function enhanceEventFiltering() {
  // Remplacer ou ajouter une fonction globale pour le filtrage
  window.filterEvents = function(category) {
    console.log(`Filtrage par catégorie: ${category}`);
    
    // Récupérer toutes les cartes d'événements
    const eventCards = document.querySelectorAll('#events-container .event-card');
    console.log(`Cartes trouvées: ${eventCards.length}`);
    
    // Si aucune carte trouvée, attendre et réessayer
    if (!eventCards.length) {
      console.log('Aucune carte trouvée, nouvel essai dans 1s...');
      setTimeout(() => filterEvents(category), 1000);
      return;
    }
    
    // Mettre à jour l'apparence des boutons de filtre
    updateFilterButtonsAppearance(category);
    
    // Filtrer les événements
    if (category === 'all') {
      // Afficher tous les événements
      eventCards.forEach(card => {
        card.style.display = '';
      });
    } else {
      eventCards.forEach(card => {
        // Ajouter un attribut data-category s'il n'existe pas
        if (!card.hasAttribute('data-category')) {
          const category = determineCardCategory(card);
          card.setAttribute('data-category', category);
        }
        
        // Vérifier texte du contenu pour déterminer si l'événement correspond à la catégorie
        const cardText = card.textContent.toLowerCase();
        const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
        const dataCategory = card.getAttribute('data-category')?.toLowerCase() || '';
        
        let matches = false;
        
        // Vérifier d'abord si la catégorie correspond directement
        if (dataCategory === category.toLowerCase()) {
          matches = true;
        }
        
        // Rechercher spécifiquement des badges correspondant à la catégorie
        if (!matches) {
          const badges = Array.from(card.querySelectorAll('span, button, div.text-xs'));
          for (const badge of badges) {
            if (badge.textContent.trim().toLowerCase() === category.toLowerCase()) {
              matches = true;
              break;
            }
          }
        }
        
        // Si aucun badge ne correspond, rechercher dans le contenu du texte
        if (!matches) {
          switch(category.toLowerCase()) {
            case 'us':
              matches = cardText.includes('fed') || cardText.includes('états-unis') || 
                       cardText.includes('us treasury') || title.includes('fed');
              break;
            case 'economic':
              matches = cardText.includes('inflation') || cardText.includes('taux') || 
                       cardText.includes('pib') || cardText.includes('gdp');
              break;
            case 'ipo':
              matches = title.startsWith('ipo:') || 
                       cardText.includes('introduction en bourse');
              break;
            case 'm&a':
              matches = title.startsWith('m&a:') || cardText.includes('merger') || 
                       cardText.includes('acquisition') || cardText.includes('fusion');
              break;
            case 'cn':
              matches = cardText.includes('chine') || cardText.includes('beijing') || 
                       cardText.includes('shanghai');
              break;
          }
        }
        
        // Afficher ou masquer la carte
        card.style.display = matches ? '' : 'none';
      });
    }
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
  };
}

/**
 * Détermine la catégorie d'une carte d'événement
 */
function determineCardCategory(card) {
  const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
  const content = card.textContent.toLowerCase();
  
  // Déterminer la catégorie en fonction du contenu
  if (title.startsWith('ipo:')) return 'ipo';
  if (title.startsWith('m&a:')) return 'm&a';
  
  if (content.includes('fed ') || content.includes('états-unis') || 
      content.includes('fed)') || content.includes('us treasury')) {
    return 'US';
  }
  
  if (content.includes('taux') || content.includes('inflation') || 
      content.includes('pib') || content.includes('gdp')) {
    return 'economic';
  }
  
  if (content.includes('chine') || content.includes('beijing') || 
      content.includes('shanghai')) {
    return 'CN';
  }
  
  // Par défaut, catégorie economic
  return 'economic';
}

/**
 * Met à jour l'apparence des boutons de filtre
 */
function updateFilterButtonsAppearance(activeCategory) {
  const buttons = document.querySelectorAll('#event-category-filters button');
  
  buttons.forEach(btn => {
    const btnCategory = btn.getAttribute('data-category');
    
    if (btnCategory === activeCategory) {
      btn.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 
                        'border-green-400', 'border-opacity-30');
      btn.classList.remove('text-gray-400', 'border-gray-700');
    } else {
      btn.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 
                           'border-green-400', 'border-opacity-30');
      btn.classList.add('text-gray-400', 'border-gray-700');
    }
  });
}

/**
 * Vérifie s'il y a des événements visibles
 */
function checkVisibleEvents() {
  const eventsContainer = document.getElementById('events-container');
  const visibleEvents = Array.from(document.querySelectorAll('#events-container .event-card'))
                         .filter(card => card.style.display !== 'none');
  
  // Supprimer l'ancien message s'il existe
  const oldMessage = document.getElementById('no-events-message');
  if (oldMessage) {
    oldMessage.remove();
  }
  
  // Afficher un message si aucun événement n'est visible
  if (visibleEvents.length === 0) {
    const messageEl = document.createElement('div');
    messageEl.id = 'no-events-message';
    messageEl.className = 'col-span-3 flex flex-col items-center justify-center p-6 text-center';
    messageEl.innerHTML = `
      <i class="fas fa-filter text-gray-600 text-3xl mb-3"></i>
      <p class="text-gray-400">Aucun événement dans cette catégorie</p>
    `;
    
    eventsContainer.appendChild(messageEl);
  }
  
  console.log(`Événements visibles: ${visibleEvents.length}`);
}