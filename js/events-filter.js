/**
 * events-filter.js
 * Gestion des filtres pour les événements économiques
 */

document.addEventListener('DOMContentLoaded', function() {
    // Récupérer les boutons de filtre
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const essentialBtn = document.getElementById('essential-btn');
    const allEventsBtn = document.getElementById('all-events-btn');
    
    // Vérifier si les boutons existent
    if (todayBtn && weekBtn && essentialBtn) {
        // Filtres par période
        todayBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByPeriod('today');
        });
        
        weekBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByPeriod('week');
        });
        
        essentialBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImportance('high');
        });
        
        if (allEventsBtn) {
            allEventsBtn.addEventListener('click', function() {
                toggleActiveFilter(this);
                showAllEvents();
            });
        }
    }
    
    // Fonction pour filtrer les événements par période
    function filterEventsByPeriod(period) {
        const eventElements = document.querySelectorAll('#events-container .event-card');
        const today = new Date();
        const todayStr = formatDate(today);
        
        eventElements.forEach(element => {
            const eventDate = element.dataset.date;
            
            if (period === 'today') {
                // Afficher uniquement les événements d'aujourd'hui
                element.style.display = (eventDate === todayStr) ? 'flex' : 'none';
            } else if (period === 'week') {
                // Afficher les événements de la semaine (7 prochains jours)
                const eventDateObj = parseDate(eventDate);
                const weekLater = new Date(today);
                weekLater.setDate(today.getDate() + 7);
                
                element.style.display = (eventDateObj >= today && eventDateObj <= weekLater) ? 'flex' : 'none';
            }
        });
        
        // Afficher un message si aucun événement n'est visible
        checkNoVisibleEvents();
    }
    
    // Fonction pour filtrer les événements par importance
    function filterEventsByImportance(importance) {
        const eventElements = document.querySelectorAll('#events-container .event-card');
        
        eventElements.forEach(element => {
            const eventImportance = element.dataset.importance || '';
            element.style.display = (eventImportance === importance) ? 'flex' : 'none';
        });
        
        // Afficher un message si aucun événement n'est visible
        checkNoVisibleEvents();
    }
    
    // Afficher tous les événements
    function showAllEvents() {
        const eventElements = document.querySelectorAll('#events-container .event-card');
        
        eventElements.forEach(element => {
            element.style.display = 'flex';
        });
        
        // Vérifier s'il y a des événements
        checkNoVisibleEvents();
    }
    
    // Vérifier s'il n'y a pas d'événements visibles et afficher un message
    function checkNoVisibleEvents() {
        const eventsContainer = document.getElementById('events-container');
        const visibleEvents = document.querySelectorAll('#events-container .event-card[style="display: flex;"]');
        
        // Supprimer l'ancien message s'il existe
        const oldMessage = document.getElementById('no-events-message');
        if (oldMessage) {
            oldMessage.remove();
        }
        
        // Ajouter un message si aucun événement n'est visible
        if (visibleEvents.length === 0) {
            const noEventsMessage = document.createElement('div');
            noEventsMessage.id = 'no-events-message';
            noEventsMessage.className = 'col-span-3 text-center p-8';
            noEventsMessage.innerHTML = `
                <div class="flex flex-col items-center">
                    <i class="fas fa-calendar-times text-4xl mb-4 text-gray-500"></i>
                    <p class="text-gray-400">Aucun événement économique prévu pour cette période</p>
                </div>
            `;
            eventsContainer.appendChild(noEventsMessage);
        }
    }
    
    // Fonction pour basculer la classe active entre les filtres
    function toggleActiveFilter(button) {
        // Retirer la classe active de tous les boutons
        document.querySelectorAll('.filter-active').forEach(el => {
            el.classList.remove('filter-active');
        });
        // Ajouter la classe active au bouton cliqué
        button.classList.add('filter-active');
    }
    
    // Fonction pour formater une date au format DD/MM/YYYY
    function formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    // Fonction pour parser une date au format DD/MM/YYYY
    function parseDate(dateStr) {
        const parts = dateStr.split('/');
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    
    // Initialisation : filtrer les événements d'aujourd'hui par défaut
    const defaultFilter = document.querySelector('.filter-active');
    if (defaultFilter) {
        if (defaultFilter.id === 'today-btn') {
            filterEventsByPeriod('today');
        } else if (defaultFilter.id === 'week-btn') {
            filterEventsByPeriod('week');
        } else if (defaultFilter.id === 'essential-btn') {
            filterEventsByImportance('high');
        } else {
            showAllEvents();
        }
    }
});