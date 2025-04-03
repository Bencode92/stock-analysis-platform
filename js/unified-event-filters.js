/**
 * Gestionnaire de filtres d'événements unifié
 * Combine les fonctionnalités de events-date-filter.js et events-filter.js
 * avec la logique améliorée pour afficher le reste de la semaine
 */

document.addEventListener('DOMContentLoaded', function() {
    // Référence aux conteneurs et boutons (support multiples IDs pour compatibilité)
    const eventsContainer = document.getElementById('events-container');
    const todayBtn = document.getElementById('today-filter') || document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-filter') || document.getElementById('week-btn');
    
    // Initialiser l'état des boutons si présents
    if (todayBtn && weekBtn) {
        todayBtn.classList.add('filter-active', 'active');
        todayBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
        todayBtn.classList.remove('text-gray-400', 'border-gray-700');
        
        weekBtn.classList.remove('filter-active', 'active');
        weekBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
        weekBtn.classList.add('text-gray-400', 'border-gray-700');
    }
    
    /**
     * Fonction utilitaire pour analyser les dates au format DD/MM/YYYY
     */
    function parseDate(dateStr) {
        if (!dateStr) return null;
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        
        // Format: DD/MM/YYYY
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    
    /**
     * Fonction de filtrage principale
     * @param {string} period - 'today' ou 'week'
     */
    function filterEventsByPeriod(period) {
        // Date d'aujourd'hui à minuit pour comparaison précise
        const today = new Date();
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        // Compteur pour savoir si des événements sont visibles
        let visibleCount = 0;
        
        // Récupérer tous les événements
        const eventElements = document.querySelectorAll('.event-card');
        
        // Traiter chaque événement
        eventElements.forEach(element => {
            // Récupérer la date de l'événement (attribut data-date)
            const eventDate = element.getAttribute('data-date') || element.dataset.date;
            const eventDateObj = parseDate(eventDate);
            
            // Ignorer les événements sans date valide
            if (!eventDateObj) {
                element.style.display = 'none';
                return;
            }
            
            if (period === 'today') {
                // Filtre "Aujourd'hui": afficher uniquement les événements d'aujourd'hui
                element.style.display = (eventDateObj.toDateString() === todayMidnight.toDateString()) ? 'flex' : 'none';
            } else if (period === 'week') {
                // Filtre "Cette semaine": afficher les événements entre demain et dimanche
                
                // Calculer la date de demain à minuit
                const tomorrowMidnight = new Date(todayMidnight);
                tomorrowMidnight.setDate(todayMidnight.getDate() + 1);
                
                // Trouver le prochain dimanche (fin de la semaine)
                const dayOfWeek = today.getDay(); // 0 (dimanche) à 6 (samedi)
                const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek; // Si on est dimanche, aller au prochain dimanche
                const endOfWeek = new Date(todayMidnight);
                endOfWeek.setDate(todayMidnight.getDate() + daysUntilSunday);
                
                // Afficher uniquement les événements entre demain et dimanche (inclus)
                element.style.display = (eventDateObj >= tomorrowMidnight && eventDateObj < endOfWeek) ? 'flex' : 'none';
            }
            
            // Incrémenter le compteur si l'événement est visible
            if (element.style.display !== 'none') {
                visibleCount++;
            }
        });
        
        // Gérer l'affichage du message "Aucun événement..."
        handleNoEventsMessage(visibleCount, period);
    }
    
    /**
     * Gère l'affichage du message quand aucun événement n'est présent
     */
    function handleNoEventsMessage(visibleCount, period) {
        // Chercher un message existant
        let noEventsMessage = document.querySelector('.no-events-message') || 
                             document.getElementById('no-events-message');
        
        if (visibleCount === 0) {
            // Aucun événement visible - afficher un message
            const messageText = period === 'today' 
                ? "Aucun événement prévu aujourd'hui" 
                : "Aucun événement prévu pour le reste de la semaine";
            
            if (noEventsMessage) {
                // Mettre à jour un message existant
                noEventsMessage.textContent = messageText;
                noEventsMessage.style.display = 'block';
            } else {
                // Créer un nouveau message
                noEventsMessage = document.createElement('p');
                noEventsMessage.id = 'no-events-message';
                noEventsMessage.className = 'no-events-message text-center text-gray-400 py-6 col-span-3';
                noEventsMessage.textContent = messageText;
                
                // Ajouter au conteneur d'événements
                if (eventsContainer) {
                    eventsContainer.appendChild(noEventsMessage);
                }
            }
        } else if (noEventsMessage) {
            // Des événements sont visibles - cacher le message
            noEventsMessage.style.display = 'none';
        }
    }
    
    // Configuration des gestionnaires d'événements pour les boutons
    if (todayBtn) {
        todayBtn.addEventListener('click', function() {
            // Mise à jour visuelle
            todayBtn.classList.add('filter-active', 'active');
            todayBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            if (weekBtn) {
                weekBtn.classList.remove('filter-active', 'active');
                weekBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
                weekBtn.classList.add('text-gray-400', 'border-gray-700');
            }
            
            // Appliquer le filtre
            filterEventsByPeriod('today');
        });
    }
    
    if (weekBtn) {
        weekBtn.addEventListener('click', function() {
            // Mise à jour visuelle
            weekBtn.classList.add('filter-active', 'active');
            weekBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            if (todayBtn) {
                todayBtn.classList.remove('filter-active', 'active');
                todayBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
                todayBtn.classList.add('text-gray-400', 'border-gray-700');
            }
            
            // Appliquer le filtre
            filterEventsByPeriod('week');
        });
    }
    
    // Appliquer le filtre par défaut au chargement de la page
    filterEventsByPeriod('today');
    
    // Pour debug et tests
    console.log('✅ Gestionnaire de filtres d\'événements unifié chargé');
});
