/**
 * event-category-filter.js
 * Gère les filtres de catégorie pour les événements (TOUS, US, economic, ipo, merger, CN)
 */

document.addEventListener('DOMContentLoaded', function() {
    // Exécuter immédiatement pour un effet visuel rapide
    initCategoryFilters();
    
    // Puis réexécuter après un délai pour s'assurer que tous les événements sont chargés
    setTimeout(initCategoryFilters, 1000);
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
        // Supprimer les écouteurs précédents pour éviter les doublons
        button.removeEventListener('click', handleFilterClick);
        // Ajouter le nouvel écouteur
        button.addEventListener('click', handleFilterClick);
    });
    
    // Activer le filtre "TOUS" par défaut
    const allFilterButton = document.querySelector('#event-category-filters button[data-category="all"]');
    if (allFilterButton) {
        // Définir comme actif sans déclencher le filtrage (qui sera fait ensuite)
        setActiveFilter(allFilterButton);
    }
    
    // Ajouter des attributs data-category à tous les événements
    addCategoryAttributes();
    
    // Appliquer le filtre actif (s'il y en a un)
    const activeFilter = document.querySelector('#event-category-filters button.filter-active');
    if (activeFilter) {
        const category = activeFilter.getAttribute('data-category');
        filterEventsByCategory(category);
    } else if (allFilterButton) {
        // Sinon utiliser le filtre "Tous"
        filterEventsByCategory('all');
    }
}

/**
 * Gestionnaire d'événement pour les clics sur les boutons de filtre
 */
function handleFilterClick() {
    // Définir ce bouton comme actif
    setActiveFilter(this);
    
    // Filtrer les événements selon la catégorie sélectionnée
    const category = this.getAttribute('data-category');
    filterEventsByCategory(category);
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
    const eventCards = document.querySelectorAll('.event-card');
    
    // Si aucun événement n'est trouvé, arrêter ici
    if (!eventCards.length) {
        console.warn('Aucune carte d\'événement trouvée');
        return;
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
 */
function addCategoryAttributes() {
    console.log('Ajout des attributs de catégorie aux cartes d\'événements');
    
    // Sélectionner toutes les cartes d'événements
    const eventCards = document.querySelectorAll('.event-card');
    
    eventCards.forEach(card => {
        // Si la carte a déjà un attribut data-category, on le garde
        if (card.hasAttribute('data-category')) {
            return;
        }
        
        // D'abord, chercher des badges ou boutons explicites dans la carte
        let category = findCategoryFromBadges(card);
        
        // Si aucun badge n'est trouvé, déterminer en fonction du titre et du contenu
        if (!category) {
            category = determineCategoryFromContent(card);
        }
        
        // Ajouter l'attribut à la carte
        card.setAttribute('data-category', category);
        
        // Ajouter une classe pour le style (optionnel)
        card.classList.add(`category-${category}`);
    });
}

/**
 * Trouve la catégorie en fonction des badges ou boutons dans la carte
 * @param {HTMLElement} card - La carte d'événement
 * @returns {string} La catégorie trouvée ou null
 */
function findCategoryFromBadges(card) {
    // Chercher les badges ou boutons visibles dans la carte
    const badgeElements = card.querySelectorAll('span, button, a, div');
    
    for (const badge of badgeElements) {
        const badgeText = badge.textContent.trim().toLowerCase();
        const badgeClasses = badge.className.toLowerCase();
        
        // Vérifier si c'est un badge ou bouton visible contenant les catégories
        if (badgeText === 'ipo' || badgeClasses.includes('ipo')) {
            return 'ipo';
        }
        if (badgeText === 'us' || badgeClasses.includes('us')) {
            return 'US';
        }
        if (badgeText === 'economic' || badgeClasses.includes('economic')) {
            return 'economic';
        }
        if (badgeText === 'merger' || badgeClasses.includes('merger')) {
            return 'merger';
        }
        if (badgeText === 'cn' || badgeClasses.includes('cn')) {
            return 'CN';
        }
    }
    
    return null;
}

/**
 * Détermine la catégorie en fonction du contenu de la carte
 * @param {HTMLElement} card - La carte d'événement
 * @returns {string} La catégorie déterminée
 */
function determineCategoryFromContent(card) {
    const cardText = card.textContent.toLowerCase();
    const cardTitle = card.querySelector('h3')?.textContent.toLowerCase() || '';
    
    // Vérifier le titre en priorité - souvent plus précis
    if (cardTitle.startsWith('ipo:')) {
        return 'ipo';
    }
    
    // Chercher des indicateurs clairs dans le titre et le contenu
    if (cardText.includes('ipo:') || cardText.includes('introduction en bourse')) {
        return 'ipo';
    }
    
    if (cardText.includes('m&a:') || 
        cardText.includes('merger') || 
        cardText.includes('acquisition') || 
        cardText.includes('fusion')) {
        return 'merger';
    }
    
    // Catégories géographiques
    if (cardText.includes('fed') || 
        cardText.includes('états-unis') || 
        cardText.includes('us treasury') || 
        cardText.includes('dollar') ||
        cardText.includes('nasdaq') ||
        cardText.includes('dow jones') ||
        cardText.includes('s&p 500')) {
        return 'US';
    }
    
    if (cardText.includes('chine') || 
        cardText.includes('beijing') || 
        cardText.includes('pboc') || 
        cardText.includes('shanghai')) {
        return 'CN';
    }
    
    // Catégorie économique
    if (cardText.includes('taux') || 
        cardText.includes('inflation') || 
        cardText.includes('gdp') || 
        cardText.includes('pib') || 
        cardText.includes('banque centrale') ||
        cardText.includes('monetary') ||
        cardText.includes('economic') ||
        cardText.includes('économique')) {
        return 'economic';
    }
    
    // Par défaut, on considère que c'est économique
    return 'economic';
}

/**
 * Vérifie s'il y a des événements visibles et affiche un message si nécessaire
 */
function checkVisibleEvents() {
    // Sélectionner le conteneur d'événements
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) return;
    
    // Compter les événements visibles
    const visibleEvents = Array.from(document.querySelectorAll('.event-card')).filter(
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

// MÉTHODE DE DÉTECTION ALTERNATIVE
// Cette fonction cherche spécifiquement les badges IPO visibles dans les cartes
function detectVisibleBadges() {
    // Trouver tous les badges visibles
    const ipoBadges = document.querySelectorAll('.event-card .ipo, .event-card span:contains("ipo")');
    const mergerBadges = document.querySelectorAll('.event-card .merger, .event-card span:contains("merger")');
    const usBadges = document.querySelectorAll('.event-card .us, .event-card span:contains("us")');
    const cnBadges = document.querySelectorAll('.event-card .cn, .event-card span:contains("cn")');
    
    console.log(`Badges trouvés: ${ipoBadges.length} IPO, ${mergerBadges.length} Merger, ${usBadges.length} US, ${cnBadges.length} CN`);
}

// Exécuter l'initialisation au chargement de la page
if (document.readyState === 'complete') {
    initCategoryFilters();
} else {
    window.addEventListener('load', function() {
        // Exécuter après le chargement complet
        setTimeout(initCategoryFilters, 500);
    });
}
