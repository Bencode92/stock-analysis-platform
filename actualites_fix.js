// Script de correction pour actualites.html
document.addEventListener('DOMContentLoaded', function() {
    console.log("Script de correction chargé !");
    
    // 1. CORRECTION DES ÉVÉNEMENTS À VENIR
    
    // Fonction pour déterminer si une date est aujourd'hui
    function isToday(dateString) {
        const today = new Date();
        const eventDate = new Date(dateString);
        return (
            today.getDate() === eventDate.getDate() &&
            today.getMonth() === eventDate.getMonth() &&
            today.getFullYear() === eventDate.getFullYear()
        );
    }

    // Fonction pour déterminer si une date est dans la semaine courante
    function isThisWeek(dateString) {
        const today = new Date();
        const eventDate = new Date(dateString);
        
        // Définir le début et la fin de la semaine courante
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Dimanche
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Samedi
        
        return eventDate >= startOfWeek && eventDate <= endOfWeek;
    }

    // Mettre à jour les attributs data-date pour les événements automatiquement
    const eventItems = document.querySelectorAll('.event-item');
    console.log("Nombre d'événements trouvés:", eventItems.length);
    
    eventItems.forEach(item => {
        // Extraire la date de l'élément (à partir du span de date dans le div)
        const dateSpan = item.querySelector('.flex-shrink-0 .text-sm.font-bold');
        const monthSpan = item.querySelector('.flex-shrink-0 .text-xs.text-gray-400');
        
        if (dateSpan && monthSpan) {
            const day = dateSpan.textContent.trim();
            const month = monthSpan.textContent.trim();
            console.log(`Date trouvée: ${day} ${month}`);
            
            // Convertir le mois en numéro (MAR -> 2)
            const monthMap = {
                'JAN': 0, 'FEV': 1, 'MAR': 2, 'AVR': 3, 'MAI': 4, 'JUN': 5,
                'JUL': 6, 'AOU': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
            };
            
            const monthNum = monthMap[month] || new Date().getMonth();
            const year = new Date().getFullYear();
            
            const eventDate = new Date(year, monthNum, parseInt(day));
            console.log(`Date convertie: ${eventDate}`);
            
            // Définir l'attribut data-date en fonction de la date
            const today = new Date();
            if (eventDate.getDate() === today.getDate() && 
                eventDate.getMonth() === today.getMonth() && 
                eventDate.getFullYear() === today.getFullYear()) {
                item.setAttribute('data-date', 'today');
                console.log("Événement pour aujourd'hui");
            } else if (isThisWeek(eventDate)) {
                item.setAttribute('data-date', 'week');
                console.log("Événement pour cette semaine");
            } else {
                item.setAttribute('data-date', 'future');
                console.log("Événement pour le futur");
            }
        }
    });

    // Amélioration des boutons de filtre pour aujourd'hui/cette semaine
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    
    if (todayBtn && weekBtn) {
        console.log("Boutons trouvés");
        
        // Supprimer les écouteurs d'événements existants (si possible)
        const newTodayBtn = todayBtn.cloneNode(true);
        const newWeekBtn = weekBtn.cloneNode(true);
        
        todayBtn.parentNode.replaceChild(newTodayBtn, todayBtn);
        weekBtn.parentNode.replaceChild(newWeekBtn, weekBtn);
        
        // Vérifier s'il y a des événements pour aujourd'hui
        const hasTodayEvents = document.querySelectorAll('.event-item[data-date="today"]').length > 0;
        console.log("Événements aujourd'hui:", hasTodayEvents);
        
        newTodayBtn.addEventListener('click', function() {
            console.log("Clic sur le bouton Aujourd'hui");
            // Activer ce bouton et désactiver l'autre
            newTodayBtn.classList.add('filter-active');
            newTodayBtn.classList.remove('text-gray-400', 'border-gray-700');
            newTodayBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            
            newWeekBtn.classList.remove('filter-active');
            newWeekBtn.classList.add('text-gray-400', 'border-gray-700');
            newWeekBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            
            // Filtrer les événements pour aujourd'hui
            eventItems.forEach(item => {
                if (item.dataset.date === 'today') {
                    item.classList.remove('hidden-item');
                    item.classList.add('fade-in');
                    console.log("Affichage de l'événement:", item);
                } else {
                    item.classList.add('hidden-item');
                    item.classList.remove('fade-in');
                    console.log("Masquage de l'événement:", item);
                }
            });
            
            // Vérifier si aucun événement n'est affiché
            displayNoEventsMessage('today');
        });
        
        newWeekBtn.addEventListener('click', function() {
            console.log("Clic sur le bouton Cette semaine");
            // Activer ce bouton et désactiver l'autre
            newWeekBtn.classList.add('filter-active');
            newWeekBtn.classList.remove('text-gray-400', 'border-gray-700');
            newWeekBtn.classList.add('text-green-400', 'border-green-400', 'border-opacity-30');
            
            newTodayBtn.classList.remove('filter-active');
            newTodayBtn.classList.add('text-gray-400', 'border-gray-700');
            newTodayBtn.classList.remove('text-green-400', 'border-green-400', 'border-opacity-30');
            
            // Afficher tous les événements de la semaine (today + week)
            eventItems.forEach(item => {
                if (item.dataset.date === 'today' || item.dataset.date === 'week') {
                    item.classList.remove('hidden-item');
                    item.classList.add('fade-in');
                    console.log("Affichage de l'événement:", item);
                } else {
                    item.classList.add('hidden-item');
                    item.classList.remove('fade-in');
                    console.log("Masquage de l'événement:", item);
                }
            });
            
            // Vérifier si aucun événement n'est affiché
            displayNoEventsMessage('week');
        });
        
        // Appliquer le filtre par défaut
        if (hasTodayEvents) {
            console.log("Simulation clic sur Aujourd'hui");
            newTodayBtn.click();
        } else {
            console.log("Simulation clic sur Cette semaine");
            newWeekBtn.click();
        }
    }
    
    // 2. CORRECTION DES FILTRES POUR LES ACTUALITÉS
    
    // Recréer les écouteurs d'événements pour les filtres de catégorie
    const categoryButtons = document.querySelectorAll('#category-filters button');
    console.log("Boutons de catégorie trouvés:", categoryButtons.length);
    
    // Cloner et remplacer tous les boutons pour supprimer les écouteurs précédents
    categoryButtons.forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', function(event) {
            console.log("Clic sur le bouton de catégorie:", this.dataset.category);
            
            // Empêcher le comportement par défaut
            event.preventDefault();
            event.stopPropagation();
            
            // Mettre à jour les styles des boutons
            document.querySelectorAll('#category-filters button').forEach(btn => {
                btn.classList.remove('filter-active');
                btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
                btn.classList.remove('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            });
            
            this.classList.add('filter-active');
            this.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
            this.classList.add('bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
            
            // Filtrer les actualités
            filterNewsItems();
            
            return false;
        });
    });

    // Remplacer les écouteurs d'événements pour les sélecteurs de filtres
    const sortSelect = document.getElementById('sort-select');
    const impactSelect = document.getElementById('impact-select');
    const countrySelect = document.getElementById('country-select');
    
    if (sortSelect) {
        const newSortSelect = sortSelect.cloneNode(true);
        sortSelect.parentNode.replaceChild(newSortSelect, sortSelect);
        newSortSelect.addEventListener('change', function(event) {
            console.log("Changement de tri:", this.value);
            filterNewsItems();
        });
    }
    
    if (impactSelect) {
        const newImpactSelect = impactSelect.cloneNode(true);
        impactSelect.parentNode.replaceChild(newImpactSelect, impactSelect);
        newImpactSelect.addEventListener('change', function(event) {
            console.log("Changement d'impact:", this.value);
            filterNewsItems();
        });
    }
    
    if (countrySelect) {
        const newCountrySelect = countrySelect.cloneNode(true);
        countrySelect.parentNode.replaceChild(newCountrySelect, countrySelect);
        newCountrySelect.addEventListener('change', function(event) {
            console.log("Changement de pays:", this.value);
            filterNewsItems();
        });
    }

    // Fonction pour filtrer les actualités
    function filterNewsItems() {
        // Récupérer les filtres sélectionnés
        const categoryBtn = document.querySelector('#category-filters button.filter-active');
        const category = categoryBtn ? categoryBtn.dataset.category : 'all';
        const impact = document.getElementById('impact-select').value;
        const country = document.getElementById('country-select').value;
        const sort = document.getElementById('sort-select').value;
        
        console.log("Filtres actifs:", { category, impact, country, sort });

        // Compteur pour les actualités visibles
        let visibleCount = 0;

        // Appliquer les filtres à tous les items d'actualité
        const newsItems = document.querySelectorAll('.news-item');
        console.log("Nombre d'actualités trouvées:", newsItems.length);
        
        newsItems.forEach(item => {
            const itemCategory = item.dataset.category;
            const itemImpact = item.dataset.impact;
            const itemCountry = item.dataset.country;
            
            // Vérifier si l'item correspond aux filtres
            const matchesCategory = category === 'all' || itemCategory === category;
            
            let matchesImpact = true;
            if (impact === 'positive') matchesImpact = itemImpact === 'positive';
            else if (impact === 'negative') matchesImpact = itemImpact === 'negative';
            else if (impact === 'neutral') matchesImpact = itemImpact === 'neutral';
            
            const matchesCountry = country === 'all' || itemCountry === country;
            
            // Log pour débogage
            console.log(`Actualité: ${item.querySelector('h3')?.textContent}`, 
                      { itemCategory, itemImpact, itemCountry, 
                        matchesCategory, matchesImpact, matchesCountry });
            
            // Afficher ou masquer l'item en fonction des filtres
            if (matchesCategory && matchesImpact && matchesCountry) {
                item.classList.remove('hidden-item');
                visibleCount++;
                console.log("Actualité affichée");
            } else {
                item.classList.add('hidden-item');
                console.log("Actualité masquée");
            }
        });

        // Vérifier s'il n'y a aucune actualité correspondant aux filtres
        console.log("Nombre d'actualités visibles:", visibleCount);
        if (visibleCount === 0) {
            displayNoNewsMessage(category, impact, country);
        } else {
            removeNoNewsMessage();
        }

        // Appliquer le tri
        if (sort === 'recent' || sort === 'older' || sort === 'impact-high' || sort === 'impact-low') {
            sortNewsItems(sort);
        }

        // Ajouter une animation aux éléments affichés
        setTimeout(() => {
            document.querySelectorAll('.news-item:not(.hidden-item)').forEach(item => {
                item.classList.add('fade-in');
            });
        }, 50);
    }

    // 3. FONCTIONS POUR LES MESSAGES "PAS DE CONTENU"

    // Fonction pour afficher un message quand aucun événement n'est disponible
    function displayNoEventsMessage(period) {
        const eventsSection = document.getElementById('events-section');
        const eventsGrid = eventsSection.querySelector('.grid');
        
        // Vérifier s'il y a des événements visibles
        const visibleEvents = eventsSection.querySelectorAll('.event-item:not(.hidden-item)').length;
        console.log("Événements visibles:", visibleEvents);
        
        // S'il n'y a pas d'événements visibles et qu'un message n'existe pas déjà
        if (visibleEvents === 0 && !document.getElementById('no-events-message')) {
            console.log("Affichage du message 'pas d'événements'");
            
            // Créer un message
            const messageElement = document.createElement('div');
            messageElement.id = 'no-events-message';
            messageElement.className = 'col-span-1 md:col-span-3 p-8 text-center bg-gray-800 bg-opacity-30 rounded-lg fade-in';
            
            // Animation légère pour montrer qu'il n'y a pas d'événements
            messageElement.innerHTML = `
                <div class="flex flex-col items-center justify-center">
                    <div class="w-16 h-16 mb-4 rounded-full bg-gray-700 bg-opacity-50 flex items-center justify-center animate-pulse">
                        <i class="fas fa-calendar-day text-2xl text-gray-400"></i>
                    </div>
                    <h3 class="text-base font-medium text-gray-300 mb-2">Aucun événement ${period === 'today' ? 'aujourd\'hui' : 'cette semaine'}</h3>
                    <p class="text-sm text-gray-400">Les prochains événements importants seront affichés ici</p>
                </div>
            `;
            
            // Ajouter le message à la grille d'événements
            eventsGrid.innerHTML = '';
            eventsGrid.appendChild(messageElement);
        }
    }

    // Fonction pour afficher un message quand aucune actualité n'est disponible
    function displayNoNewsMessage(category, impact, country) {
        // Sélectionner les conteneurs d'actualités
        const featuredNewsContainer = document.getElementById('featured-news');
        const recentNewsContainer = document.getElementById('recent-news');
        
        // Ne rien faire si le message existe déjà
        if (document.getElementById('no-news-message')) {
            console.log("Message 'pas d'actualités' déjà affiché");
            return;
        }
        
        console.log("Affichage du message 'pas d'actualités'");
        
        // Créer un message
        const messageElement = document.createElement('div');
        messageElement.id = 'no-news-message';
        messageElement.className = 'col-span-1 md:col-span-3 p-8 text-center bg-gray-800 bg-opacity-30 rounded-lg fade-in';
        
        // Déterminer le texte du message en fonction des filtres
        let filterText = '';
        if (category !== 'all') {
            filterText += `dans la catégorie "${category}" `;
        }
        if (impact !== 'all') {
            filterText += `avec un impact ${impact === 'positive' ? 'positif' : (impact === 'negative' ? 'négatif' : 'neutre')} `;
        }
        if (country !== 'all') {
            const countryNames = {
                'us': 'États-Unis',
                'eu': 'Europe',
                'fr': 'France',
                'other': 'Autres pays'
            };
            filterText += `pour ${countryNames[country] || country}`;
        }
        
        // Animation pour montrer qu'il n'y a pas d'actualités
        messageElement.innerHTML = `
            <div class="flex flex-col items-center justify-center">
                <div class="w-16 h-16 mb-4 rounded-full bg-gray-700 bg-opacity-50 flex items-center justify-center animate-pulse">
                    <i class="fas fa-newspaper text-2xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-medium text-gray-300 mb-2">Aucune actualité disponible ${filterText}</h3>
                <p class="text-sm text-gray-400">Essayez d'autres filtres ou revenez plus tard</p>
            </div>
        `;
        
        // Vider les conteneurs d'actualités et ajouter le message
        if (featuredNewsContainer) featuredNewsContainer.innerHTML = '';
        if (recentNewsContainer) {
            recentNewsContainer.innerHTML = '';
            recentNewsContainer.appendChild(messageElement);
        }
        
        // Masquer le bouton "Voir plus"
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = 'none';
        }
    }

    // Fonction pour supprimer le message de "pas d'actualités"
    function removeNoNewsMessage() {
        const noNewsMessage = document.getElementById('no-news-message');
        if (noNewsMessage) {
            console.log("Suppression du message 'pas d'actualités'");
            noNewsMessage.remove();
        }
        
        // Réafficher le bouton "Voir plus"
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = 'inline-block';
        }
    }

    // Fonction pour trier les actualités
    function sortNewsItems(sortType) {
        const featuredNews = document.getElementById('featured-news');
        const recentNews = document.getElementById('recent-news');
        
        // Trier les éléments dans chaque conteneur
        if (featuredNews) sortContainer(featuredNews, sortType);
        if (recentNews) sortContainer(recentNews, sortType);
    }

    function sortContainer(container, sortType) {
        if (!container) return;
        
        const items = Array.from(container.children);
        console.log(`Tri des actualités dans ${container.id}, type: ${sortType}`);
        
        items.sort((a, b) => {
            if (sortType === 'recent') {
                // Trier par date (plus récent en premier)
                return new Date(b.dataset.date) - new Date(a.dataset.date);
            } else if (sortType === 'older') {
                // Trier par date (plus ancien en premier)
                return new Date(a.dataset.date) - new Date(b.dataset.date);
            } else if (sortType === 'impact-high') {
                // Trier par impact (élevé à faible)
                const impactOrder = { 'negative': 3, 'neutral': 2, 'positive': 1 };
                return impactOrder[b.dataset.impact] - impactOrder[a.dataset.impact];
            } else if (sortType === 'impact-low') {
                // Trier par impact (faible à élevé)
                const impactOrder = { 'negative': 3, 'neutral': 2, 'positive': 1 };
                return impactOrder[a.dataset.impact] - impactOrder[b.dataset.impact];
            }
            return 0;
        });
        
        // Réinsérer les éléments triés
        items.forEach(item => {
            container.appendChild(item);
        });
    }

    // Initialiser les filtres
    console.log("Initialisation des filtres...");
    filterNewsItems();
    
    // Ajouter des styles pour les animations
    addStyles();
    
    function addStyles() {
        // Créer un élément de style
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* Animations pour les messages "pas de contenu" */
            @keyframes pulse {
                0% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 0.6; transform: scale(1); }
            }

            .animate-pulse {
                animation: pulse 2s infinite ease-in-out;
            }

            /* Animation d'apparition pour les messages */
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            #no-events-message, #no-news-message {
                animation: fadeInUp 0.5s ease-out forwards;
            }

            /* Style pour les messages vides */
            #no-events-message, #no-news-message {
                background: rgba(30, 41, 59, 0.3);
                border: 1px solid rgba(0, 255, 135, 0.1);
                backdrop-filter: blur(5px);
            }

            /* Amélioration de la visibilité des boutons de filtre actifs */
            .filter-active {
                position: relative;
                overflow: hidden;
            }

            .filter-active::after {
                content: '';
                position: absolute;
                top: -10px;
                left: -10px;
                right: -10px;
                bottom: -10px;
                background: radial-gradient(circle at center, rgba(0, 255, 135, 0.2) 0%, transparent 70%);
                z-index: -1;
                opacity: 0.7;
                animation: pulse 2s infinite;
            }
        `;
        
        // Ajouter au head du document
        document.head.appendChild(styleElement);
        console.log("Styles ajoutés au document");
    }
});
