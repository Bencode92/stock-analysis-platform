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
    
    // Détection spéciale des IPO (cette fonction est cruciale pour détecter les badges IPO)
    detectSpecificBadges();
    
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
            // Vérifier d'abord si la carte a un attribut data-category
            let cardCategory = card.getAttribute('data-category');
            
            // Si pas d'attribut, déterminer la catégorie en temps réel (pour chaque filtre)
            if (!cardCategory) {
                cardCategory = determineCardCategory(card, category);
                // Stocker la catégorie pour les prochaines fois
                card.setAttribute('data-category', cardCategory);
            }
            
            // Vérifier aussi les badges directement dans la carte (pour les IPO notamment)
            if (cardCategory !== category) {
                // Seconde chance pour les IPO, vérifier les badges directement
                if (category === 'ipo' && hasIPOBadge(card)) {
                    card.setAttribute('data-category', 'ipo');
                    cardCategory = 'ipo';
                }
                // Seconde chance pour US
                else if (category === 'US' && hasUSBadge(card)) {
                    card.setAttribute('data-category', 'US');
                    cardCategory = 'US';
                }
                // Et ainsi de suite pour les autres catégories
            }
            
            // Afficher ou masquer selon la catégorie
            card.style.display = (cardCategory === category) ? '' : 'none';
        });
    }
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
}

/**
 * Vérifie si une carte contient un badge IPO
 * @param {HTMLElement} card - La carte d'événement
 * @returns {boolean} Vrai si un badge IPO est trouvé
 */
function hasIPOBadge(card) {
    // 1. Chercher directement des éléments avec le texte "ipo"
    const elements = Array.from(card.querySelectorAll('*'));
    for (const el of elements) {
        if (el.textContent.trim().toLowerCase() === 'ipo') {
            return true;
        }
    }
    
    // 2. Vérifier si le titre commence par "IPO:"
    const title = card.querySelector('h3');
    if (title && title.textContent.trim().startsWith('IPO:')) {
        return true;
    }
    
    return false;
}

/**
 * Vérifie si une carte contient un badge US
 * @param {HTMLElement} card - La carte d'événement
 * @returns {boolean} Vrai si un badge US est trouvé
 */
function hasUSBadge(card) {
    const elements = Array.from(card.querySelectorAll('*'));
    for (const el of elements) {
        if (el.textContent.trim().toLowerCase() === 'us') {
            return true;
        }
    }
    return false;
}

/**
 * Détermine de manière ciblée si une carte correspond à la catégorie recherchée
 * @param {HTMLElement} card - La carte d'événement
 * @param {string} targetCategory - La catégorie à vérifier
 * @returns {string} La catégorie déterminée
 */
function determineCardCategory(card, targetCategory) {
    // Pour les cartes IPO, vérifier les badges ipo et le titre
    if (targetCategory === 'ipo') {
        // 1. Vérifier si un badge ou bouton ipo est présent
        const ipoBadge = card.querySelector('.ipo, [class*="ipo"]');
        if (ipoBadge) return 'ipo';
        
        // 2. Vérifier le contenu pour "IPO:"
        const cardTitle = card.querySelector('h3')?.textContent || '';
        if (cardTitle.includes('IPO:')) return 'ipo';
        
        // 3. Chercher dans tout le texte
        if (card.textContent.toLowerCase().includes('ipo')) return 'ipo';
    }
    
    // Pour US, merger, etc. faire des vérifications similaires
    if (targetCategory === 'US') {
        const usBadge = card.querySelector('.us, [class*="us"]');
        if (usBadge) return 'US';
        
        if (card.textContent.toLowerCase().includes('états-unis') || 
            card.textContent.toLowerCase().includes('fed') ||
            card.textContent.toLowerCase().includes('us treasury')) {
            return 'US';
        }
    }
    
    if (targetCategory === 'CN') {
        const cnBadge = card.querySelector('.cn, [class*="cn"]');
        if (cnBadge) return 'CN';
        
        if (card.textContent.toLowerCase().includes('chine') || 
            card.textContent.toLowerCase().includes('beijing') ||
            card.textContent.toLowerCase().includes('shanghai')) {
            return 'CN';
        }
    }
    
    if (targetCategory === 'merger') {
        const mergerBadge = card.querySelector('.merger, [class*="merger"]');
        if (mergerBadge) return 'merger';
        
        const cardTitle = card.querySelector('h3')?.textContent || '';
        if (cardTitle.includes('M&A:')) return 'merger';
        
        if (card.textContent.toLowerCase().includes('merger') || 
            card.textContent.toLowerCase().includes('acquisition') ||
            card.textContent.toLowerCase().includes('fusion')) {
            return 'merger';
        }
    }
    
    if (targetCategory === 'economic') {
        const economicBadge = card.querySelector('.economic, [class*="economic"]');
        if (economicBadge) return 'economic';
        
        if (card.textContent.toLowerCase().includes('economic') || 
            card.textContent.toLowerCase().includes('taux') ||
            card.textContent.toLowerCase().includes('inflation') ||
            card.textContent.toLowerCase().includes('gdp') ||
            card.textContent.toLowerCase().includes('pib')) {
            return 'economic';
        }
    }
    
    // Si aucune correspondance n'est trouvée, retourner une catégorie différente
    return 'other';
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
        
        // MÉTHODE DIRECTE: Vérifier le contenu des boutons et badges
        // Cette méthode est plus fiable pour détecter le type d'événement
        
        // 1. Vérifier si des badges ipo sont présents dans la carte
        const ipoBadges = card.querySelectorAll('button, span, .badge, [class*="ipo"]');
        for (const badge of ipoBadges) {
            if (badge.textContent.trim().toLowerCase() === 'ipo') {
                card.setAttribute('data-category', 'ipo');
                return;
            }
        }
        
        // 2. Vérifier le titre pour "IPO:" (méthode très fiable)
        const cardTitle = card.querySelector('h3')?.textContent || '';
        if (cardTitle.startsWith('IPO:')) {
            card.setAttribute('data-category', 'ipo');
            return;
        }
        
        // 3. Vérifier pour d'autres types d'événements
        if (cardTitle.startsWith('M&A:')) {
            card.setAttribute('data-category', 'merger');
            return;
        }
        
        // 4. Vérifier les badges US
        const usBadges = card.querySelectorAll('button, span, .badge, .us, [class*="us"]');
        for (const badge of usBadges) {
            if (badge.textContent.trim().toLowerCase() === 'us') {
                card.setAttribute('data-category', 'US');
                return;
            }
        }
        
        // 5. Vérifier les badges CN
        const cnBadges = card.querySelectorAll('button, span, .badge, .cn, [class*="cn"]');
        for (const badge of cnBadges) {
            if (badge.textContent.trim().toLowerCase() === 'cn') {
                card.setAttribute('data-category', 'CN');
                return;
            }
        }
        
        // 6. Vérifier les badges economic
        const economicBadges = card.querySelectorAll('button, span, .badge, .economic, [class*="economic"]');
        for (const badge of economicBadges) {
            if (badge.textContent.trim().toLowerCase() === 'economic') {
                card.setAttribute('data-category', 'economic');
                return;
            }
        }
        
        // 7. Vérifier les badges merger
        const mergerBadges = card.querySelectorAll('button, span, .badge, .merger, [class*="merger"]');
        for (const badge of mergerBadges) {
            if (badge.textContent.trim().toLowerCase() === 'merger') {
                card.setAttribute('data-category', 'merger');
                return;
            }
        }
        
        // MÉTHODE DE SECOURS: Analyse du contenu textuel
        const category = determineCategoryFromContent(card);
        card.setAttribute('data-category', category);
    });
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
    
    if (cardTitle.startsWith('m&a:') || 
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

/**
 * DÉTECTION SPÉCIALE DES BADGES
 * Cette fonction utilise une approche spécifique pour détecter les petits badges dans les cards
 */
function detectSpecificBadges() {
    console.log("Détection des badges spécifiques...");
    
    // Sélectionner toutes les cartes d'événements
    const eventCards = document.querySelectorAll('.event-card');
    
    eventCards.forEach(card => {
        // Rechercher tous les éléments avec des classes/styles qui pourraient indiquer un badge
        const possibleBadges = card.querySelectorAll('span, button, div, a');
        
        possibleBadges.forEach(badge => {
            const badgeText = badge.textContent.trim().toLowerCase();
            
            // Détection des badges IPO (prioritaire)
            if (badgeText === 'ipo') {
                console.log("Badge IPO trouvé!");
                card.setAttribute('data-category', 'ipo');
            }
            // Badges US
            else if (badgeText === 'us') {
                console.log("Badge US trouvé!");
                card.setAttribute('data-category', 'US');
            }
            // Badges CN
            else if (badgeText === 'cn') {
                console.log("Badge CN trouvé!");
                card.setAttribute('data-category', 'CN');
            }
            // Badges merger
            else if (badgeText === 'merger') {
                console.log("Badge merger trouvé!");
                card.setAttribute('data-category', 'merger');
            }
            // Badges economic
            else if (badgeText === 'economic') {
                console.log("Badge economic trouvé!");
                card.setAttribute('data-category', 'economic');
            }
        });
        
        // Si aucun badge n'a été trouvé, essayer avec le titre
        if (!card.hasAttribute('data-category')) {
            const title = card.querySelector('h3')?.textContent || '';
            if (title.startsWith('IPO:')) {
                console.log("IPO trouvé par titre:", title);
                card.setAttribute('data-category', 'ipo');
            }
        }
    });
    
    // Ajout d'un système de fallback pour les petits badges ipo spécifiques à votre design
    try {
        // Rechercher tous les petits spans qui pourraient être des badges ipo
        document.querySelectorAll('.event-card').forEach(card => {
            if (!card.hasAttribute('data-category')) {
                // Approche 1: Chercher des éléments qui SONT des badges
                const smallBadges = card.querySelectorAll('span[class*="badge"], .badge, [class*="tag"], .tag');
                
                smallBadges.forEach(badge => {
                    const badgeText = badge.textContent.trim().toLowerCase();
                    if (badgeText === 'ipo') {
                        card.setAttribute('data-category', 'ipo');
                        console.log("IPO trouvé via petit badge:", badgeText);
                    }
                });
                
                // Approche 2: Recherche directe des textes 'ipo' courts et isolés
                const allElements = card.querySelectorAll('*');
                allElements.forEach(el => {
                    // Si c'est un élément avec uniquement le texte 'ipo' et rien d'autre
                    if (el.childNodes.length === 1 && 
                        el.childNodes[0].nodeType === Node.TEXT_NODE && 
                        el.textContent.trim().toLowerCase() === 'ipo') {
                        card.setAttribute('data-category', 'ipo');
                        console.log("IPO trouvé via texte isolé");
                    }
                });
            }
        });
    } catch (e) {
        console.error("Erreur lors de la détection de badges spécifiques:", e);
    }
}

// Exécuter l'initialisation au chargement de la page
if (document.readyState === 'complete') {
    initCategoryFilters();
    // Détection spéciale des IPO
    setTimeout(detectSpecificBadges, 1500);
} else {
    window.addEventListener('load', function() {
        // Exécuter après le chargement complet
        setTimeout(function() {
            initCategoryFilters();
            detectSpecificBadges();
        }, 1000);
    });
}
