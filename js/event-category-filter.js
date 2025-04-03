/**
 * event-category-filter.js
 * Gère les filtres de catégorie pour les événements (TOUS, US, economic, ipo, merger, CN)
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initialisation des filtres de catégorie d\'événements (version corrigée)');
    initCategoryFilters();
});

/**
 * Initialise les filtres de catégorie
 */
function initCategoryFilters() {
    // Sélectionner tous les boutons de filtre de catégorie
    const filterButtons = document.querySelectorAll('#event-category-filters button');
    
    // Vérifier si les boutons existent avant de continuer
    if (!filterButtons.length) {
        console.warn('Boutons de filtre de catégorie non trouvés. Les filtres ne seront pas initialisés.');
        return;
    }
    
    console.log(`${filterButtons.length} boutons de filtre trouvés, application des écouteurs d'événements...`);
    
    // Supprimer d'abord tout écouteur d'événement existant
    filterButtons.forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
    });
    
    // Récupérer à nouveau les boutons après le clonage
    const refreshedButtons = document.querySelectorAll('#event-category-filters button');
    
    // Ajouter les écouteurs d'événements
    refreshedButtons.forEach(button => {
        button.addEventListener('click', function(event) {
            console.log(`Bouton cliqué: ${this.dataset.category}`);
            
            // Empêcher le comportement par défaut et la propagation
            event.preventDefault();
            event.stopPropagation();
            
            // Mettre à jour l'apparence des boutons
            refreshedButtons.forEach(btn => {
                btn.classList.remove('filter-active');
                btn.classList.remove('bg-green-400');
                btn.classList.remove('bg-opacity-10');
                btn.classList.remove('text-green-400');
                btn.classList.remove('border-green-400');
                btn.classList.remove('border-opacity-30');
                btn.classList.add('text-gray-400');
                btn.classList.add('border-gray-700');
            });
            
            // Ajouter les classes pour le bouton actif
            this.classList.add('filter-active');
            this.classList.add('bg-green-400');
            this.classList.add('bg-opacity-10');
            this.classList.add('text-green-400');
            this.classList.add('border-green-400');
            this.classList.add('border-opacity-30');
            this.classList.remove('text-gray-400');
            this.classList.remove('border-gray-700');
            
            // Appliquer le filtre
            applyEventFilter(this.dataset.category);
        });
    });
    
    // S'assurer que le bouton "TOUS" est actif par défaut
    const allButton = document.querySelector('#event-category-filters button[data-category="all"]');
    if (allButton) {
        allButton.classList.add('filter-active');
    }
    
    // Observer le chargement des événements
    observeEventsLoading();
}

/**
 * Observe le chargement des événements et applique les filtres une fois chargés
 */
function observeEventsLoading() {
    // Créer un observateur pour détecter quand les événements sont chargés
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Vérifier si des cartes d'événement ont été ajoutées
                const hasEventCards = Array.from(mutation.addedNodes).some(node => 
                    node.nodeType === 1 && node.classList && node.classList.contains('event-card')
                );
                
                if (hasEventCards) {
                    console.log('Événements chargés, préparation des filtres...');
                    prepareEventCards();
                    
                    // Appliquer le filtre actif
                    const activeFilter = document.querySelector('#event-category-filters button.filter-active');
                    if (activeFilter) {
                        applyEventFilter(activeFilter.dataset.category);
                    }
                }
            }
        });
    });
    
    // Commencer à observer le conteneur d'événements
    const eventsContainer = document.getElementById('events-container');
    if (eventsContainer) {
        observer.observe(eventsContainer, { childList: true, subtree: true });
        console.log('Observateur de chargement des événements démarré');
    }
}

/**
 * Prépare les cartes d'événements pour le filtrage
 */
function prepareEventCards() {
    const eventCards = document.querySelectorAll('.event-card');
    console.log(`Préparation de ${eventCards.length} cartes d'événements`);
    
    eventCards.forEach(card => {
        // Analyser chaque carte pour déterminer sa catégorie
        determineAndMarkCategory(card);
    });
}

/**
 * Détermine et marque la catégorie d'une carte d'événement
 */
function determineAndMarkCategory(card) {
    // Regarder d'abord s'il y a des badges explicites
    const badges = Array.from(card.querySelectorAll('span, button, div'));
    let category = null;
    
    // Rechercher les badges par texte
    for (const badge of badges) {
        const text = badge.textContent.trim().toLowerCase();
        if (text === 'us') {
            category = 'US';
            break;
        } else if (text === 'economic') {
            category = 'economic';
            break;
        } else if (text === 'ipo') {
            category = 'ipo';
            break;
        } else if (text === 'merger') {
            category = 'merger';
            break;
        } else if (text === 'cn') {
            category = 'CN';
            break;
        }
    }
    
    // Si aucun badge n'a été trouvé, chercher dans le texte complet
    if (!category) {
        const fullText = card.textContent.toLowerCase();
        const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
        
        if (title.startsWith('ipo:')) {
            category = 'ipo';
        } else if (title.startsWith('m&a:')) {
            category = 'merger';
        } else if (fullText.includes('fed') || fullText.includes('états-unis') || fullText.includes('us treasury')) {
            category = 'US';
        } else if (fullText.includes('chine') || fullText.includes('beijing') || fullText.includes('shanghai')) {
            category = 'CN';
        } else if (fullText.includes('inflation') || fullText.includes('taux') || fullText.includes('pib') || fullText.includes('gdp')) {
            category = 'economic';
        }
    }
    
    // Stocker la catégorie dans un attribut data
    if (category) {
        card.setAttribute('data-category', category);
        
        // Ajouter aussi une classe pour faciliter le ciblage CSS
        card.classList.add(`category-${category.toLowerCase()}`);
    }
}

/**
 * Applique le filtre sélectionné aux événements
 */
function applyEventFilter(category) {
    console.log(`Application du filtre: ${category}`);
    
    const eventCards = document.querySelectorAll('.event-card');
    if (!eventCards.length) {
        console.warn('Aucune carte d\'événement trouvée pour le filtrage');
        return;
    }
    
    if (category === 'all') {
        // Afficher tous les événements
        eventCards.forEach(card => {
            card.style.display = '';
        });
    } else {
        eventCards.forEach(card => {
            // Vérifier si la carte a la catégorie demandée
            const cardCategory = card.getAttribute('data-category');
            const matches = cardCategory === category;
            
            // Afficher ou masquer en conséquence
            card.style.display = matches ? '' : 'none';
        });
    }
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
}

/**
 * Vérifie s'il y a des événements visibles et affiche un message si nécessaire
 */
function checkVisibleEvents() {
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
