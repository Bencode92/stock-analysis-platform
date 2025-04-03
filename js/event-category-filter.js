/**
 * event-category-filter.js
 * Gère les filtres de catégorie pour les événements (TOUS, US, economic, ipo, merger, CN)
 */

document.addEventListener('DOMContentLoaded', function() {
    // Attendre que la page soit complètement chargée pour éviter les conflits avec d'autres scripts
    setTimeout(initCategoryFilters, 1500);
});

/**
 * Initialise les filtres de catégorie
 */
function initCategoryFilters() {
    console.log('Initialisation des filtres de catégorie d\'événements...');
    
    // Sélectionner tous les boutons de filtre
    const filterButtons = document.querySelectorAll('#event-category-filters button');
    
    // Ajouter l'écouteur d'événement à chaque bouton
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Définir ce bouton comme actif et désactiver les autres
            setActiveFilter(this);
            
            // Filtrer les événements selon la catégorie sélectionnée
            const category = this.getAttribute('data-category');
            filterEventsByCategory(category);
        });
    });
    
    // Activer le filtre "TOUS" par défaut
    const allFilterButton = document.querySelector('#event-category-filters button[data-category="all"]');
    if (allFilterButton) {
        allFilterButton.click();
    }
}

/**
 * Définit le bouton de filtre actif
 * @param {HTMLElement} activeButton - Le bouton à activer
 */
function setActiveFilter(activeButton) {
    // Sélectionner tous les boutons de filtre
    const filterButtons = document.querySelectorAll('#event-category-filters button');
    
    // Mettre à jour les classes CSS pour chaque bouton
    filterButtons.forEach(button => {
        if (button === activeButton) {
            // Activer ce bouton
            button.classList.add('filter-active');
            button.classList.add('bg-green-400');
            button.classList.add('bg-opacity-10');
            button.classList.add('text-green-400');
            button.classList.add('border-green-400');
            button.classList.add('border-opacity-30');
            button.classList.remove('text-gray-400');
            button.classList.remove('border-gray-700');
        } else {
            // Désactiver les autres boutons
            button.classList.remove('filter-active');
            button.classList.remove('bg-green-400');
            button.classList.remove('bg-opacity-10');
            button.classList.remove('text-green-400');
            button.classList.remove('border-green-400');
            button.classList.remove('border-opacity-30');
            button.classList.add('text-gray-400');
            button.classList.add('border-gray-700');
        }
    });
}

/**
 * Filtre les événements par catégorie
 * @param {string} category - La catégorie à filtrer ('all', 'US', 'economic', 'ipo', 'merger', 'CN')
 */
function filterEventsByCategory(category) {
    console.log(`Filtrage des événements par catégorie: ${category}`);
    
    // Sélectionner toutes les cartes d'événements
    const eventCards = document.querySelectorAll('#events-container .event-card');
    
    // Si aucun événement n'est trouvé, arrêter ici
    if (!eventCards.length) {
        console.warn('Aucune carte d\'événement trouvée');
        return;
    }
    
    // Si c'est le premier filtrage, ajouter des attributs data-category aux cartes
    if (!eventCards[0].hasAttribute('data-category')) {
        addCategoryAttributes(eventCards);
    }
    
    // Filtrer les événements
    if (category === 'all') {
        // Afficher tous les événements
        eventCards.forEach(card => {
            card.style.display = '';
        });
    } else {
        // Afficher uniquement les événements de la catégorie sélectionnée
        eventCards.forEach(card => {
            const cardCategory = card.getAttribute('data-category') || '';
            card.style.display = (cardCategory === category) ? '' : 'none';
        });
    }
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
}

/**
 * Ajoute des attributs data-category aux cartes d'événements
 * @param {NodeList} eventCards - Liste des cartes d'événements
 */
function addCategoryAttributes(eventCards) {
    console.log('Ajout des attributs de catégorie aux cartes d\'événements');
    
    eventCards.forEach(card => {
        // Déterminer la catégorie en fonction du contenu
        const cardText = card.textContent.toLowerCase();
        let category = 'economic'; // Catégorie par défaut
        
        // Vérifier si la carte contient des indicateurs de pays ou de type
        if (cardText.includes('us') || cardText.includes('états-unis') || cardText.includes('fed') || 
            cardText.includes('dollar') || cardText.includes('nasdaq') || cardText.includes('dow jones')) {
            category = 'US';
        } else if (cardText.includes('cn') || cardText.includes('chine') || cardText.includes('chinois') || 
                 cardText.includes('shanghai') || cardText.includes('pboc')) {
            category = 'CN';
        } else if (cardText.includes('ipo') || cardText.includes('introduction en bourse')) {
            category = 'ipo';
        } else if (cardText.includes('merger') || cardText.includes('m&a') || 
                 cardText.includes('fusion') || cardText.includes('acquisition')) {
            category = 'merger';
        } else if (cardText.includes('pib') || cardText.includes('gdp') || 
                 cardText.includes('inflation') || cardText.includes('chômage') || 
                 cardText.includes('taux') || cardText.includes('économique')) {
            category = 'economic';
        }
        
        // Ajouter l'attribut à la carte
        card.setAttribute('data-category', category);
        
        // Ajouter un indicateur visuel si nécessaire
        if (!card.querySelector('.category-indicator')) {
            const indicator = document.createElement('span');
            indicator.classList.add('category-indicator', category.toLowerCase());
            
            // Style CSS pour l'indicateur selon la catégorie
            let indicatorColor;
            switch (category) {
                case 'US':
                    indicatorColor = '#3b82f6'; // Bleu
                    break;
                case 'CN':
                    indicatorColor = '#ef4444'; // Rouge
                    break;
                case 'ipo':
                    indicatorColor = '#8b5cf6'; // Violet
                    break;
                case 'merger':
                    indicatorColor = '#10b981'; // Vert
                    break;
                case 'economic':
                    indicatorColor = '#f59e0b'; // Orange
                    break;
                default:
                    indicatorColor = '#6b7280'; // Gris
            }
            
            indicator.style.backgroundColor = indicatorColor;
            card.appendChild(indicator);
        }
    });
    
    // Ajouter du CSS pour les indicateurs si nécessaire
    addIndicatorStyles();
}

/**
 * Ajoute des styles CSS pour les indicateurs de catégorie
 */
function addIndicatorStyles() {
    // Vérifier si les styles sont déjà ajoutés
    if (document.getElementById('category-indicator-styles')) {
        return;
    }
    
    // Créer l'élément style
    const style = document.createElement('style');
    style.id = 'category-indicator-styles';
    style.textContent = `
        .category-indicator {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            opacity: 0.7;
        }
    `;
    
    // Ajouter le style à la page
    document.head.appendChild(style);
}

/**
 * Vérifie s'il y a des événements visibles et affiche un message si nécessaire
 */
function checkVisibleEvents() {
    // Sélectionner le conteneur d'événements
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) return;
    
    // Compter les événements visibles
    const visibleEvents = Array.from(document.querySelectorAll('#events-container .event-card')).filter(
        card => card.style.display !== 'none'
    );
    
    // Supprimer l'ancien message s'il existe
    const oldMessage = document.getElementById('no-category-events');
    if (oldMessage) {
        oldMessage.remove();
    }
    
    // Afficher un message si aucun événement n'est visible
    if (visibleEvents.length === 0) {
        const messageEl = document.createElement('div');
        messageEl.id = 'no-category-events';
        messageEl.className = 'col-span-3 flex flex-col items-center justify-center p-6 text-center';
        messageEl.innerHTML = `
            <i class="fas fa-filter text-gray-600 text-3xl mb-3"></i>
            <p class="text-gray-400">Aucun événement dans cette catégorie</p>
        `;
        
        eventsContainer.appendChild(messageEl);
    }
}
