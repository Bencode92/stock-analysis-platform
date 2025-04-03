/**
 * events-filter.js
 * Gestion des filtres pour les événements économiques
 * Version améliorée avec filtre par catégorie
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialisation: ajouter des écouteurs d'événements aux boutons de filtre par catégorie
    initializeCategoryFilters();
    
    // Initialiser les filtres par date
    initializeDateFilters();
});

/**
 * Initialise les filtres par catégorie
 */
function initializeCategoryFilters() {
    // Sélectionner tous les boutons de filtre par catégorie
    const categoryButtons = document.querySelectorAll('#event-category-filters button');
    
    // Ajouter des écouteurs d'événements à chaque bouton
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Récupérer la catégorie du bouton
            const category = this.getAttribute('data-category');
            
            // Mettre à jour l'apparence des boutons
            updateCategoryButtonStyles(this);
            
            // Filtrer les événements par catégorie
            filterEventsByCategory(category);
        });
    });
}

/**
 * Met à jour les styles des boutons de catégorie
 */
function updateCategoryButtonStyles(activeButton) {
    // Sélectionner tous les boutons de catégorie
    const categoryButtons = document.querySelectorAll('#event-category-filters button');
    
    // Mettre à jour les styles de tous les boutons
    categoryButtons.forEach(button => {
        if (button === activeButton) {
            // Style du bouton actif
            button.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            button.classList.remove('text-gray-400', 'border-gray-700', 'bg-transparent');
        } else {
            // Style des boutons inactifs
            button.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            button.classList.add('text-gray-400', 'border-gray-700', 'bg-transparent');
        }
    });
}

/**
 * Filtre les événements par catégorie
 */
function filterEventsByCategory(category) {
    console.log(`Filtrage des événements par catégorie: ${category}`);
    
    // Sélectionner toutes les cartes d'événements
    const eventCards = document.querySelectorAll('#events-container .event-card');
    
    if (category === 'all') {
        // Afficher tous les événements visibles par filtrage de date
        eventCards.forEach(card => {
            if (card.getAttribute('data-hidden-by-date') !== 'true') {
                card.style.display = '';
            }
        });
        return;
    }
    
    // Filtrer les événements par catégorie
    eventCards.forEach(card => {
        // Si l'événement est déjà caché par le filtre de date, le maintenir caché
        if (card.getAttribute('data-hidden-by-date') === 'true') {
            card.style.display = 'none';
            return;
        }
        
        // Récupérer le contenu de la carte pour rechercher la catégorie
        const cardContent = card.textContent.toLowerCase();
        let cardCategory = '';
        
        // Logique de détermination de catégorie basée sur le contenu
        if (category === 'US' && (cardContent.includes('us') || cardContent.includes('états-unis') || cardContent.includes('fed'))) {
            cardCategory = 'US';
        } else if (category === 'economic' && (cardContent.includes('inflation') || cardContent.includes('pib') || cardContent.includes('gdp') || cardContent.includes('économique'))) {
            cardCategory = 'economic';
        } else if (category === 'ipo' && cardContent.includes('ipo')) {
            cardCategory = 'ipo';
        } else if (category === 'm&a' && (cardContent.includes('fusion') || cardContent.includes('acquisition') || cardContent.includes('m&a'))) {
            cardCategory = 'm&a';
        } else if (category === 'CN' && (cardContent.includes('chine') || cardContent.includes('cn') || cardContent.includes('beijing'))) {
            cardCategory = 'CN';
        }
        
        // Afficher ou masquer la carte en fonction de la catégorie
        if (cardCategory === category || category === 'all') {
            card.style.display = ''; // Afficher
            console.log(`Événement affiché: ${card.querySelector('h3')?.textContent}`);
        } else {
            card.style.display = 'none'; // Masquer
            console.log(`Événement masqué: ${card.querySelector('h3')?.textContent}`);
        }
    });
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
}

/**
 * Initialise les filtres par date
 */
function initializeDateFilters() {
    // Récupérer les boutons de filtre par date
    const todayButton = document.getElementById('today-filter');
    const weekButton = document.getElementById('week-filter');
    
    // Vérifier si les boutons existent
    if (todayButton && weekButton) {
        // Ajouter des écouteurs d'événements
        todayButton.addEventListener('click', function() {
            updateDateButtonStyles(this);
            filterEventsByDate('today');
        });
        
        weekButton.addEventListener('click', function() {
            updateDateButtonStyles(this);
            filterEventsByDate('week');
        });
        
        // Déclencher le filtre par défaut (aujourd'hui)
        todayButton.click();
    }
}

/**
 * Met à jour les styles des boutons de date
 */
function updateDateButtonStyles(activeButton) {
    // Sélectionner tous les boutons de date
    const dateButtons = document.querySelectorAll('.filter-button');
    
    // Mettre à jour les styles de tous les boutons
    dateButtons.forEach(button => {
        if (button === activeButton) {
            // Style du bouton actif
            button.classList.add('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            button.classList.remove('text-gray-400', 'border-gray-700');
        } else {
            // Style des boutons inactifs
            button.classList.remove('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            button.classList.add('text-gray-400', 'border-gray-700');
        }
    });
}

/**
 * Filtre les événements par date
 */
function filterEventsByDate(dateFilter) {
    console.log(`Filtrage des événements par date: ${dateFilter}`);
    
    // Obtenir la date d'aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Réinitialiser l'heure à minuit
    
    // Calculer la date de fin de la semaine
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 6);
    
    // Formater la date d'aujourd'hui au format DD/MM/YYYY
    const formattedToday = formatDate(today);
    
    console.log(`Date d'aujourd'hui: ${formattedToday}`);
    console.log(`Fin de semaine: ${formatDate(endOfWeek)}`);
    
    // Sélectionner toutes les cartes d'événements
    const eventCards = document.querySelectorAll('#events-container .event-card');
    
    // Filtrer les événements par date
    eventCards.forEach(card => {
        // Extraire la date de l'événement du texte
        const dateMatch = card.textContent.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
        
        if (!dateMatch) {
            // Si la date n'est pas trouvée, masquer l'événement
            card.style.display = 'none';
            card.setAttribute('data-hidden-by-date', 'true');
            return;
        }
        
        // Extraire le jour, le mois et l'année
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1; // JavaScript commence les mois à 0
        const year = parseInt(dateMatch[3]);
        
        // Créer un objet Date
        const eventDate = new Date(year, month, day);
        eventDate.setHours(0, 0, 0, 0); // Réinitialiser l'heure à minuit
        
        // Formater la date de l'événement
        const formattedEventDate = formatDate(eventDate);
        
        console.log(`Événement: ${card.querySelector('h3')?.textContent}, Date: ${formattedEventDate}`);
        
        // Filtrer selon le mode sélectionné
        if (dateFilter === 'today') {
            // Afficher uniquement les événements d'aujourd'hui
            if (formattedEventDate === formattedToday) {
                card.style.display = ''; // Afficher
                card.setAttribute('data-hidden-by-date', 'false');
                console.log(`Événement d'aujourd'hui affiché: ${card.querySelector('h3')?.textContent}`);
            } else {
                card.style.display = 'none'; // Masquer
                card.setAttribute('data-hidden-by-date', 'true');
                console.log(`Événement masqué (pas aujourd'hui): ${card.querySelector('h3')?.textContent}`);
            }
        } else if (dateFilter === 'week') {
            // Afficher les événements de la semaine à venir
            if (eventDate >= today && eventDate <= endOfWeek) {
                card.style.display = ''; // Afficher
                card.setAttribute('data-hidden-by-date', 'false');
                console.log(`Événement de la semaine affiché: ${card.querySelector('h3')?.textContent}`);
            } else {
                card.style.display = 'none'; // Masquer
                card.setAttribute('data-hidden-by-date', 'true');
                console.log(`Événement masqué (pas cette semaine): ${card.querySelector('h3')?.textContent}`);
            }
        }
    });
    
    // Réappliquer le filtre par catégorie actif
    const activeCategoryButton = document.querySelector('#event-category-filters button.filter-active');
    if (activeCategoryButton && activeCategoryButton.getAttribute('data-category') !== 'all') {
        const category = activeCategoryButton.getAttribute('data-category');
        filterEventsByCategory(category);
    }
    
    // Vérifier s'il y a des événements visibles
    checkVisibleEvents();
}

/**
 * Vérifie s'il y a des événements visibles et affiche un message si nécessaire
 */
function checkVisibleEvents() {
    // Sélectionner le conteneur d'événements
    const eventsContainer = document.getElementById('events-container');
    
    // Compter les événements visibles
    const visibleEvents = document.querySelectorAll('#events-container .event-card[style=\"display: \"]');
    const visibleCount = visibleEvents.length;
    
    console.log(`Nombre d'événements visibles: ${visibleCount}`);
    
    // Supprimer l'ancien message s'il existe
    const oldMessage = document.getElementById('no-events-message');
    if (oldMessage) {
        oldMessage.remove();
    }
    
    // Si aucun événement n'est visible, afficher un message
    if (visibleCount === 0) {
        // Créer un message
        const noEventsMessage = document.createElement('div');
        noEventsMessage.id = 'no-events-message';
        noEventsMessage.className = 'col-span-3 text-center p-8';
        noEventsMessage.innerHTML = `
            <div class=\"flex flex-col items-center\">
                <i class=\"fas fa-calendar-times text-4xl mb-4 text-gray-500\"></i>
                <p class=\"text-gray-400\">Aucun événement ne correspond aux critères sélectionnés</p>
            </div>
        `;
        
        // Ajouter le message au conteneur
        eventsContainer.appendChild(noEventsMessage);
    }
}

/**
 * Formate une date au format DD/MM/YYYY
 */
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}`,
  `message`: `Fix: Amélioration du filtrage par catégorie d'événements`
}
