/**
 * actualites.js - Gestion des actualités et événements financiers
 * Ce script gère l'affichage, le filtrage et le tri des actualités financières.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialisation des données d'actualités
    initializeNewsData();
    
    // Configuration des filtres et tris
    setupFilters();
    
    // Configuration des boutons d'événements
    setupEventButtons();
    
    // Configuration du bouton "Voir plus"
    setupLoadMoreButton();
});

/**
 * Initialise les données d'actualités depuis l'API FMP ou l'intégration Perplexity
 */
async function initializeNewsData() {
    try {
        // Essayer d'abord de charger les données locales pour un accès hors connexion
        const cachedNews = localStorage.getItem('newsData');
        
        if (cachedNews) {
            const cachedData = JSON.parse(cachedNews);
            const cacheTime = localStorage.getItem('newsDataTimestamp');
            
            // Calculer l'âge du cache (en heures)
            const now = Date.now();
            const cacheAge = (now - parseInt(cacheTime)) / (1000 * 60 * 60);
            
            // Si le cache est récent (moins de 2 heures), l'utiliser
            if (cacheAge < 2) {
                console.log(`Utilisation des données en cache (${cacheAge.toFixed(1)} heures)`);
                processAndDisplayNews(cachedData);
            }
        }
        
        // De toute façon, essayer de charger les données fraîches
        console.log('Chargement des données fraîches...');
        const response = await fetch('data/news.json');
        
        if (response.ok) {
            const data = await response.json();
            
            // Stocker les données dans le localStorage pour un accès ultérieur
            localStorage.setItem('newsData', JSON.stringify(data));
            localStorage.setItem('newsDataTimestamp', Date.now().toString());
            
            processAndDisplayNews(data);
            return;
        }
        
        // Si les données API ne sont pas disponibles, essayer l'intégration Perplexity
        if (window.perplexityIntegration) {
            console.log('Module d\'actualités initialisé avec l\'intégration Perplexity');
            return;
        }
        
        // Si ni l'API ni Perplexity ne sont disponibles, et pas de cache, afficher des données de secours
        if (!cachedNews) {
            throw new Error('Aucune source de données disponible');
        }
    } catch (error) {
        console.warn('Erreur lors du chargement des actualités:', error);
        
        // Essayer d'utiliser le cache même s'il est ancien
        const cachedNews = localStorage.getItem('newsData');
        if (cachedNews) {
            console.log('Utilisation du cache de secours');
            processAndDisplayNews(JSON.parse(cachedNews));
            return;
        }
        
        // Générer et afficher des données de secours
        displayFallbackData();
    }
}

/**
 * Traite et affiche les actualités à partir des données JSON
 * @param {Object} data - Données d'actualités
 */
function processAndDisplayNews(data) {
    // Vérifier si nous avons bien des données d'actualités
    if (!data || (!data.us && !data.france) || (data.us?.length === 0 && data.france?.length === 0)) {
        displayFallbackData();
        return;
    }
    
    // Combiner les actualités US et France
    let allNews = [...(data.us || []), ...(data.france || [])];
    
    // Traiter les actualités
    const newsItems = allNews.map(item => {
        // Déterminer la catégorie d'actif si le module est disponible
        let category = item.category || 'general';
        if (window.AssetCategories) {
            category = window.AssetCategories.categorizeNews(item);
        }
        
        return {
            ...item,
            category,
            impact: item.impact || determineImpact(item),
            country: item.country || extractCountry(item),
            score: item.score || 0,
            importance_level: item.importance_level || 'normal'
        };
    });
    
    // Afficher les événements financiers
    if (data.events && data.events.length > 0) {
        displayEvents(data.events);
    }
    
    // ---- AMÉLIORATION: Séparer les actualités en trois catégories d'importance ----
    
    // 1. Breaking news - Actualités critiques et très importantes
    const breakingNews = newsItems.filter(item => 
        item.importance_level === 'breaking' || item.score >= 30
    );
    
    // 2. Actualités importantes - Actualités intéressantes sans être critiques
    const importantNews = newsItems.filter(item => 
        item.importance_level === 'important' || 
        (item.score >= 15 && item.score < 30)
    );
    
    // 3. Actualités standards - Le reste des actualités
    const standardNews = newsItems.filter(item => 
        item.importance_level === 'normal' && 
        (item.score < 15 || item.score === undefined)
    );
    
    // Afficher chaque catégorie d'actualités dans sa section respective
    displayBreakingNews(breakingNews);
    displayImportantNews(importantNews);
    displayRecentNews(standardNews);
}

/**
 * Détermine l'impact d'une actualité à partir de son contenu
 * @param {Object} item - Élément d'actualité
 * @returns {string} - Impact estimé (positive, negative, neutral)
 */
function determineImpact(item) {
    const content = `${item.title} ${item.content || ''}`.toLowerCase();
    
    // Mots clés positifs
    const positiveKeywords = [
        'rise', 'gain', 'surge', 'jump', 'positive', 'boost', 'increase', 'growth', 'profit',
        'hausse', 'augmentation', 'croissance', 'bénéfice', 'succès', 'record', 'outperform'
    ];
    
    // Mots clés négatifs
    const negativeKeywords = [
        'fall', 'drop', 'decline', 'plunge', 'negative', 'loss', 'crash', 'decrease', 'deficit',
        'baisse', 'diminution', 'perte', 'échec', 'recession', 'downgrade', 'underperform'
    ];
    
    // Compter les occurrences de mots clés
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveKeywords.forEach(keyword => {
        if (content.includes(keyword)) positiveCount++;
    });
    
    negativeKeywords.forEach(keyword => {
        if (content.includes(keyword)) negativeCount++;
    });
    
    // Déterminer l'impact en fonction des occurrences
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

/**
 * Extrait le pays mentionné dans une actualité
 * @param {Object} item - Élément d'actualité
 * @returns {string} - Code du pays (us, eu, fr, other)
 */
function extractCountry(item) {
    const content = `${item.title} ${item.content || ''}`.toLowerCase();
    
    // Pays et régions
    const countries = {
        'us': ['united states', 'usa', 'america', 'u.s.', 'u.s.a', 'fed', 'federal reserve'],
        'eu': ['europe', 'european', 'euro', 'eurozone', 'ecb', 'european central bank'],
        'fr': ['france', 'french', 'paris', 'bnf', 'banque de france'],
        'uk': ['united kingdom', 'uk', 'britain', 'british', 'england', 'london'],
        'cn': ['china', 'chinese', 'beijing', 'shanghai'],
        'jp': ['japan', 'japanese', 'tokyo']
    };
    
    // Rechercher les occurrences de pays
    for (const [code, keywords] of Object.entries(countries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return code;
        }
    }
    
    return 'other';
}

/**
 * ---- NOUVELLE FONCTION ----
 * Affiche les breaking news (actualités critiques)
 * @param {Array} breakingNews - Actualités critiques
 */
function displayBreakingNews(breakingNews) {
    const container = document.getElementById('breaking-news');
    if (!container) {
        // Si la section n'existe pas, la créer avant le featured-news
        const featuredSection = document.getElementById('featured-news');
        if (featuredSection && featuredSection.parentNode) {
            const breakingSection = document.createElement('div');
            breakingSection.id = 'breaking-news';
            breakingSection.className = 'mb-8';
            
            const breakingHeader = document.createElement('h2');
            breakingHeader.className = 'text-red-500 font-bold text-xl mb-4 flex items-center';
            breakingHeader.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> BREAKING NEWS';
            
            breakingSection.appendChild(breakingHeader);
            featuredSection.parentNode.insertBefore(breakingSection, featuredSection);
            
            // Mettre à jour la référence du conteneur
            container = breakingSection;
        } else {
            return; // Si on ne trouve pas où insérer la section
        }
    } else {
        // Vider le conteneur existant
        container.innerHTML = '';
        
        // Recréer le header
        const breakingHeader = document.createElement('h2');
        breakingHeader.className = 'text-red-500 font-bold text-xl mb-4 flex items-center';
        breakingHeader.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> BREAKING NEWS';
        container.appendChild(breakingHeader);
    }
    
    if (breakingNews.length === 0) {
        // S'il n'y a pas d'actualités critiques, cacher la section
        container.style.display = 'none';
        return;
    }
    
    // Afficher la section
    container.style.display = 'block';
    
    // Créer le conteneur pour les actualités
    const breakingGrid = document.createElement('div');
    breakingGrid.className = 'grid grid-cols-1 gap-4';
    
    // Afficher les actualités critiques avec un style spécial
    breakingNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-red-800 bg-opacity-60 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition duration-300 border-l-4 border-red-500';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        card.setAttribute('data-importance', 'breaking');
        
        card.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded">BREAKING</span>
                    <span class="text-xs text-gray-300">${formatDate(item.date)}</span>
                </div>
                <h3 class="text-white text-lg font-bold mb-2">${item.title}</h3>
                <p class="text-gray-300 text-sm mb-3 line-clamp-3">${item.content || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-1 font-medium bg-white bg-opacity-20">
                        <i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name}
                    </span>
                    <span class="text-xs text-gray-300">Source: ${item.source || 'Financial Data'}</span>
                </div>
            </div>
        `;
        
        breakingGrid.appendChild(card);
    });
    
    container.appendChild(breakingGrid);
}

/**
 * ---- NOUVELLE FONCTION ----
 * Affiche les actualités importantes
 * @param {Array} importantNews - Actualités importantes
 */
function displayImportantNews(importantNews) {
    const container = document.getElementById('important-news');
    if (!container) {
        // Si la section n'existe pas, la créer avant le recent-news
        const recentSection = document.getElementById('recent-news');
        if (recentSection && recentSection.parentNode) {
            const importantSection = document.createElement('div');
            importantSection.id = 'important-news';
            importantSection.className = 'mb-8';
            
            const importantHeader = document.createElement('h2');
            importantHeader.className = 'text-yellow-500 font-bold text-xl mb-4 flex items-center';
            importantHeader.innerHTML = '<i class="fas fa-fire mr-2"></i> ACTUALITÉS IMPORTANTES';
            
            importantSection.appendChild(importantHeader);
            recentSection.parentNode.insertBefore(importantSection, recentSection);
            
            // Mettre à jour la référence du conteneur
            container = importantSection;
        } else {
            return; // Si on ne trouve pas où insérer la section
        }
    } else {
        // Vider le conteneur existant
        container.innerHTML = '';
        
        // Recréer le header
        const importantHeader = document.createElement('h2');
        importantHeader.className = 'text-yellow-500 font-bold text-xl mb-4 flex items-center';
        importantHeader.innerHTML = '<i class="fas fa-fire mr-2"></i> ACTUALITÉS IMPORTANTES';
        container.appendChild(importantHeader);
    }
    
    if (importantNews.length === 0) {
        // S'il n'y a pas d'actualités importantes, cacher la section
        container.style.display = 'none';
        return;
    }
    
    // Afficher la section
    container.style.display = 'block';
    
    // Créer le conteneur pour les actualités
    const importantGrid = document.createElement('div');
    importantGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    
    // Afficher les actualités importantes avec un style distinctif
    importantNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-yellow-800 bg-opacity-30 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition duration-300 border-l-4 border-yellow-500';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        card.setAttribute('data-importance', 'important');
        
        card.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-medium bg-yellow-500 bg-opacity-80 text-gray-900 px-2 py-1 rounded">IMPORTANT</span>
                    <span class="text-xs text-gray-400">${formatDate(item.date)}</span>
                </div>
                <h3 class="text-white text-base font-semibold mb-2">${item.title}</h3>
                <p class="text-gray-300 text-sm mb-3 line-clamp-2">${item.content || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-1 font-medium bg-white bg-opacity-10">
                        <i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name}
                    </span>
                    <span class="text-xs text-gray-400">Source: ${item.source || 'Financial Data'}</span>
                </div>
            </div>
        `;
        
        importantGrid.appendChild(card);
    });
    
    container.appendChild(importantGrid);
}

/**
 * Affiche les actualités à la une
 * @param {Array} featuredNews - Actualités à la une
 */
function displayFeaturedNews(featuredNews) {
    const container = document.getElementById('featured-news');
    if (!container) return;
    
    // Vider le conteneur
    container.innerHTML = '';
    
    // Réinitialiser le header
    const featuredHeader = document.createElement('h2');
    featuredHeader.className = 'text-lg font-semibold mb-4';
    featuredHeader.textContent = 'À LA UNE';
    container.appendChild(featuredHeader);
    
    if (featuredNews.length === 0) {
        container.innerHTML += `
            <div class="col-span-2 flex flex-col items-center justify-center py-10">
                <i class="fas fa-newspaper text-gray-700 text-4xl mb-4"></i>
                <p class="text-gray-500">Aucune actualité à la une disponible</p>
            </div>
        `;
        return;
    }
    
    // Créer la grille pour les actualités
    const featuredGrid = document.createElement('div');
    featuredGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6';
    container.appendChild(featuredGrid);
    
    // Afficher les actualités à la une
    featuredNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-gray-800 bg-opacity-70 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition duration-300';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        
        // Déterminer la couleur en fonction de l'impact
        const impactColor = item.impact === 'positive' ? '#4CAF50' : 
                           item.impact === 'negative' ? '#F44336' : '#607D8B';
        
        card.innerHTML = `
            <div class="p-1 text-xs font-medium flex justify-between items-center" style="background-color: ${categoryInfo.color || '#607D8B'};">
                <span class="text-white"><i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name || 'Général'}</span>
                <span class="text-white">${formatDate(item.date)}</span>
            </div>
            <div class="p-4">
                <h3 class="text-white text-lg font-semibold mb-2">${item.title}</h3>
                <p class="text-gray-300 text-sm mb-3 line-clamp-3">${item.content || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-1 font-medium" style="background-color: ${impactColor}; color: white;">
                        ${item.impact === 'positive' ? 'Positif' : 
                          item.impact === 'negative' ? 'Négatif' : 'Neutre'}
                    </span>
                    <span class="text-xs text-gray-400">Source: ${item.source || 'Financial Data'}</span>
                </div>
            </div>
        `;
        
        featuredGrid.appendChild(card);
    });
}

/**
 * Affiche les actualités récentes
 * @param {Array} recentNews - Actualités récentes
 */
function displayRecentNews(recentNews) {
    const container = document.getElementById('recent-news');
    if (!container) return;
    
    // Vider le conteneur
    container.innerHTML = '';
    
    // Réinitialiser le header
    const recentHeader = document.createElement('h2');
    recentHeader.className = 'text-lg font-semibold mb-4';
    recentHeader.textContent = 'ACTUALITÉS RÉCENTES';
    container.appendChild(recentHeader);
    
    if (recentNews.length === 0) {
        container.innerHTML += `
            <div class="flex flex-col items-center justify-center py-10">
                <i class="fas fa-newspaper text-gray-700 text-4xl mb-4"></i>
                <p class="text-gray-500">Aucune actualité récente disponible</p>
            </div>
        `;
        return;
    }
    
    // Créer la grille d'actualités
    const newsGrid = document.createElement('div');
    newsGrid.className = 'grid grid-cols-1 md:grid-cols-3 gap-4';
    
    // Utilisation de documentFragment pour améliorer les performances
    const fragment = document.createDocumentFragment();
    
    // Afficher les actualités récentes
    recentNews.forEach(item => {
        const categoryInfo = window.AssetCategories ? 
            window.AssetCategories.getCategoryInfo(item.category) : 
            { name: 'Général', icon: 'fa-newspaper', color: '#607D8B' };
        
        const card = document.createElement('div');
        card.className = 'news-item bg-gray-800 bg-opacity-70 rounded-lg overflow-hidden shadow hover:shadow-lg transition duration-300';
        card.setAttribute('data-category', item.category);
        card.setAttribute('data-impact', item.impact);
        card.setAttribute('data-country', item.country);
        card.setAttribute('data-date', item.date || new Date().toISOString());
        
        card.innerHTML = `
            <div class="flex items-center justify-between p-2 bg-opacity-90" style="background-color: ${categoryInfo.color}20;">
                <span class="text-xs font-medium" style="color: ${categoryInfo.color}">
                    <i class="fas ${categoryInfo.icon || 'fa-newspaper'} mr-1"></i> ${categoryInfo.name}
                </span>
                <span class="text-xs text-gray-400">${formatDate(item.date)}</span>
            </div>
            <div class="p-3">
                <h3 class="text-white text-base font-medium mb-2 line-clamp-2">${item.title}</h3>
                <p class="text-gray-400 text-xs mb-2 line-clamp-3">${item.content || ''}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs rounded px-2 py-0.5 ${
                        item.impact === 'positive' ? 'bg-green-400 bg-opacity-20 text-green-400' : 
                        item.impact === 'negative' ? 'bg-red-400 bg-opacity-20 text-red-400' : 
                        'bg-gray-400 bg-opacity-20 text-gray-400'
                    }">
                        ${item.impact === 'positive' ? 'Positif' : 
                          item.impact === 'negative' ? 'Négatif' : 'Neutre'}
                    </span>
                    <span class="text-xs text-gray-500">${(item.source || '').slice(0, 15)}</span>
                </div>
            </div>
        `;
        
        fragment.appendChild(card);
    });
    
    // Ajouter tous les éléments au DOM en une seule fois
    newsGrid.appendChild(fragment);
    container.appendChild(newsGrid);
}

/**
 * ---- NOUVELLE FONCTION ----
 * Affiche les événements financiers avec un meilleur formatage
 * @param {Array} events - Liste des événements économiques et financiers
 */
function displayEvents(events) {
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) return;
    
    // Vider le conteneur
    eventsContainer.innerHTML = '';
    
    if (events.length === 0) {
        eventsContainer.innerHTML = `
            <div class="col-span-3 flex flex-col items-center justify-center py-10">
                <i class="fas fa-calendar-times text-gray-700 text-4xl mb-4"></i>
                <p class="text-gray-500">Aucun événement disponible</p>
            </div>
        `;
        return;
    }
    
    // Récupérer la date d'aujourd'hui pour le filtrage des événements
    const today = new Date();
    const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    
    // Séparer les événements par importance
    const criticalEvents = events.filter(e => e.importance_level === 'critical' || e.importance === 'high');
    const standardEvents = events.filter(e => e.importance_level !== 'critical' && e.importance !== 'high');
    
    // Créer un documentFragment pour optimiser les performances
    const fragment = document.createDocumentFragment();
    
    // Événements critiques en premier
    criticalEvents.forEach(event => {
        // Vérifier si c'est aujourd'hui
        const isToday = event.date === todayStr;
        
        const eventCard = document.createElement('div');
        eventCard.className = `event-card high-importance ${isToday ? 'today' : ''} relative`;
        eventCard.setAttribute('data-date', event.date);
        eventCard.setAttribute('data-importance', event.importance);
        
        // Badge pour les événements critiques
        const criticalBadge = document.createElement('div');
        criticalBadge.className = 'absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl m-1';
        criticalBadge.textContent = 'CRITIQUE';
        
        const eventDate = document.createElement('div');
        eventDate.className = 'event-date';
        eventDate.innerHTML = `
            <div class="event-day">${event.date.split('/')[0]}</div>
            <div class="event-month">${event.date.split('/')[1]}</div>
        `;
        
        const eventContent = document.createElement('div');
        eventContent.className = 'event-content';
        eventContent.innerHTML = `
            <div class="event-title">${event.title}</div>
            <div class="event-details">
                <span class="event-time"><i class="fas fa-clock"></i> ${event.time}</span>
                <span class="event-type ${event.type}">${event.type}</span>
                <span class="event-importance ${event.importance}"><i class="fas fa-signal"></i> ${event.importance}</span>
            </div>
        `;
        
        eventCard.appendChild(criticalBadge);
        eventCard.appendChild(eventDate);
        eventCard.appendChild(eventContent);
        fragment.appendChild(eventCard);
    });
    
    // Événements standards ensuite
    standardEvents.forEach(event => {
        // Vérifier si c'est aujourd'hui
        const isToday = event.date === todayStr;
        
        const eventCard = document.createElement('div');
        eventCard.className = `event-card ${event.importance}-importance ${isToday ? 'today' : ''}`;
        eventCard.setAttribute('data-date', event.date);
        eventCard.setAttribute('data-importance', event.importance);
        
        eventCard.innerHTML = `
            <div class="event-date">
                <div class="event-day">${event.date.split('/')[0]}</div>
                <div class="event-month">${event.date.split('/')[1]}</div>
            </div>
            <div class="event-content">
                <div class="event-title">${event.title}</div>
                <div class="event-details">
                    <span class="event-time"><i class="fas fa-clock"></i> ${event.time}</span>
                    <span class="event-type ${event.type}">${event.type}</span>
                    <span class="event-importance ${event.importance}"><i class="fas fa-signal"></i> ${event.importance}</span>
                </div>
            </div>
        `;
        
        fragment.appendChild(eventCard);
    });
    
    // Ajout de tous les événements au DOM en une seule opération
    eventsContainer.appendChild(fragment);
}

/**
 * Affiche des données de secours quand aucune source n'est disponible
 */
function displayFallbackData() {
    // Message d'avertissement
    console.warn('Utilisation des données de secours pour les actualités');
    
    // Afficher des messages d'erreur ou de secours dans les conteneurs d'actualités
    const containers = ['breaking-news', 'important-news', 'featured-news', 'recent-news'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-message bg-gray-800 bg-opacity-70 rounded-lg p-4 text-center">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-2xl mb-2"></i>
                <h3 class="text-white font-medium mb-2">Impossible de charger les actualités</h3>
                <p class="text-gray-400 mb-3">Nous rencontrons un problème de connexion avec notre service de données.</p>
                <button class="retry-button bg-green-400 bg-opacity-20 text-green-400 border border-green-400 border-opacity-30 rounded px-3 py-1 text-sm" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt mr-1"></i> Réessayer
                </button>
            </div>
        `;
    });
}

/**
 * Configure les filtres de catégorie, tri et impact
 */
function setupFilters() {
    // Si le gestionnaire de catégories est disponible, l'utiliser
    if (window.AssetCategories) {
        // La configuration des filtres de catégorie est gérée par AssetCategories
        console.log('Filtres de catégorie gérés par AssetCategories');
    } else {
        // Configuration standard des filtres de catégorie
        const categoryFilters = document.querySelectorAll('#category-filters button');
        categoryFilters.forEach(filter => {
            filter.addEventListener('click', function() {
                // Retirer la classe active de tous les filtres
                categoryFilters.forEach(f => f.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30'));
                categoryFilters.forEach(f => f.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700'));
                
                // Ajouter la classe active au filtre cliqué
                this.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
                this.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                
                // Appliquer le filtre
                const category = this.getAttribute('data-category');
                filterNews('category', category);
            });
        });
    }
    
    // ---- AMÉLIORATION: Ajouter un filtre par niveau d'importance ----
    // Créer le sélecteur d'importance s'il n'existe pas
    const filtersContainer = document.querySelector('.flex.flex-wrap.gap-2');
    if (filtersContainer && !document.getElementById('importance-select')) {
        const importanceSelect = document.createElement('select');
        importanceSelect.id = 'importance-select';
        importanceSelect.className = 'text-xs md:text-sm px-3 py-1.5 bg-gray-800 text-gray-300 border border-gray-700 rounded-full';
        importanceSelect.innerHTML = `
            <option value="all">Toutes importances</option>
            <option value="breaking">Breaking News</option>
            <option value="important">Importantes</option>
            <option value="normal">Standards</option>
        `;
        
        filtersContainer.appendChild(importanceSelect);
        
        // Ajouter l'événement
        importanceSelect.addEventListener('change', function() {
            filterNews('importance', this.value);
        });
    }
    
    // Filtre de tri
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        // Ajouter une option de tri par score/importance
        if (!sortSelect.querySelector('option[value="importance"]')) {
            const importanceOption = document.createElement('option');
            importanceOption.value = 'importance';
            importanceOption.textContent = 'Importance';
            sortSelect.appendChild(importanceOption);
        }
        
        sortSelect.addEventListener('change', function() {
            sortNews(this.value);
        });
    }
    
    // Filtre d'impact
    const impactSelect = document.getElementById('impact-select');
    if (impactSelect) {
        impactSelect.addEventListener('change', function() {
            filterNews('impact', this.value);
        });
    }
    
    // Filtre de pays
    const countrySelect = document.getElementById('country-select');
    if (countrySelect) {
        countrySelect.addEventListener('change', function() {
            filterNews('country', this.value);
        });
    }
    
    // Exposer la fonction filterNews pour permettre l'accès depuis AssetCategories
    window.filterNews = filterNews;
}

/**
 * Configure les boutons de filtre des événements
 */
function setupEventButtons() {
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const essentialBtn = document.getElementById('essential-btn');
    
    if (todayBtn && weekBtn) {
        todayBtn.addEventListener('click', function() {
            todayBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            weekBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.filterMode = 'today';
                window.eventsManager.renderEvents();
            } else {
                filterEvents('today');
            }
        });
        
        weekBtn.addEventListener('click', function() {
            weekBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            weekBtn.classList.remove('text-gray-400', 'border-gray-700');
            
            todayBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
            todayBtn.classList.add('text-gray-400', 'border-gray-700');
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.filterMode = 'week';
                window.eventsManager.renderEvents();
            } else {
                filterEvents('week');
            }
        });
    }
    
    // Bouton pour filtrer les événements essentiels
    if (essentialBtn) {
        essentialBtn.addEventListener('click', function() {
            const isActive = this.classList.contains('filter-active');
            
            if (isActive) {
                // Désactiver le filtre
                essentialBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
                essentialBtn.classList.add('text-gray-400', 'border-gray-700');
            } else {
                // Activer le filtre
                essentialBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
                essentialBtn.classList.remove('text-gray-400', 'border-gray-700');
            }
            
            // Si un gestionnaire d'événements personnalisé existe, l'utiliser
            if (window.eventsManager) {
                window.eventsManager.essentialOnly = !isActive;
                window.eventsManager.renderEvents();
            } else {
                filterEvents(isActive ? 'all' : 'critical');
            }
        });
    }
}

/**
 * Configure le bouton "Voir plus"
 */
function setupLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            loadMoreNews();
        });
    }
}

/**
 * Filtre les actualités en fonction du type et de la valeur du filtre
 * @param {string} filterType - Type de filtre (category, impact, country, importance)
 * @param {string} filterValue - Valeur du filtre
 */
function filterNews(filterType, filterValue) {
    const newsItems = document.querySelectorAll('.news-item');
    
    // Obtenir les autres filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    const activeImportance = document.getElementById('importance-select')?.value || 'all';
    
    // Mettre à jour les filtres actifs en fonction du type actuel
    let currentCategory = activeCategory;
    let currentImpact = activeImpact;
    let currentCountry = activeCountry;
    let currentImportance = activeImportance;
    
    if (filterType === 'category') currentCategory = filterValue;
    if (filterType === 'impact') currentImpact = filterValue;
    if (filterType === 'country') currentCountry = filterValue;
    if (filterType === 'importance') currentImportance = filterValue;
    
    // Utilisation de documentFragment pour optimiser les performances
    const fragment = document.createDocumentFragment();
    
    // Appliquer les filtres à chaque élément d'actualité
    newsItems.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const itemImpact = item.getAttribute('data-impact');
        const itemCountry = item.getAttribute('data-country');
        const itemImportance = item.getAttribute('data-importance') || 'normal';
        
        // Vérifier si l'élément correspond à tous les filtres actifs
        const matchesCategory = currentCategory === 'all' || itemCategory === currentCategory;
        const matchesImpact = currentImpact === 'all' || itemImpact === currentImpact;
        const matchesCountry = currentCountry === 'all' || itemCountry === currentCountry;
        const matchesImportance = currentImportance === 'all' || itemImportance === currentImportance;
        
        // Afficher ou masquer l'élément en fonction des filtres
        if (matchesCategory && matchesImpact && matchesCountry && matchesImportance) {
            item.classList.remove('hidden-item');
            item.classList.add('fade-in');
        } else {
            item.classList.add('hidden-item');
            item.classList.remove('fade-in');
        }
    });
    
    // Vérifier s'il y a des éléments visibles après le filtrage
    checkVisibleItems();
}

/**
 * Trie les actualités en fonction du critère spécifié
 * @param {string} sortCriteria - Critère de tri (recent, older, impact-high, impact-low, importance)
 */
function sortNews(sortCriteria) {
    // Sélectionner tous les conteneurs d'actualités
    const newsContainers = [
        document.getElementById('breaking-news')?.querySelector('.grid'), 
        document.getElementById('important-news')?.querySelector('.grid'),
        document.getElementById('featured-news')?.querySelector('.grid'),
        document.getElementById('recent-news')?.querySelector('.grid')
    ].filter(Boolean);
    
    newsContainers.forEach(container => {
        const newsItems = Array.from(container.querySelectorAll('.news-item'));
        
        // Trier les éléments en fonction du critère
        newsItems.sort((a, b) => {
            if (sortCriteria === 'recent' || sortCriteria === 'older') {
                const dateA = new Date(a.getAttribute('data-date') || 0);
                const dateB = new Date(b.getAttribute('data-date') || 0);
                
                return sortCriteria === 'recent' ? dateB - dateA : dateA - dateB;
            } else if (sortCriteria === 'impact-high' || sortCriteria === 'impact-low') {
                const impactMap = { 'positive': 3, 'neutral': 2, 'negative': 1 };
                
                const impactA = impactMap[a.getAttribute('data-impact')] || 0;
                const impactB = impactMap[b.getAttribute('data-impact')] || 0;
                
                return sortCriteria === 'impact-high' ? impactB - impactA : impactA - impactB;
            } else if (sortCriteria === 'importance') {
                // Nouvelle option de tri par importance
                const importanceMap = { 'breaking': 3, 'important': 2, 'normal': 1 };
                
                const importanceA = importanceMap[a.getAttribute('data-importance') || 'normal'];
                const importanceB = importanceMap[b.getAttribute('data-importance') || 'normal'];
                
                return importanceB - importanceA;
            }
            
            return 0;
        });
        
        // Utilisation de documentFragment pour optimiser les performances
        const fragment = document.createDocumentFragment();
        newsItems.forEach(item => fragment.appendChild(item));
        
        // Réorganiser les éléments dans le DOM
        container.appendChild(fragment);
    });
}

/**
 * Filtre les événements en fonction de la période
 * @param {string} period - Période (today, week) ou niveau d'importance (critical)
 */
function filterEvents(period) {
    const eventItems = document.querySelectorAll('.event-card');
    
    // Récupérer la date d'aujourd'hui pour le filtrage
    const today = new Date();
    const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    
    eventItems.forEach(item => {
        const itemDate = item.getAttribute('data-date');
        const itemImportance = item.getAttribute('data-importance');
        
        // Filtrer par période ou importance
        if (period === 'all') {
            item.classList.remove('hidden-item');
            item.classList.add('fade-in');
        } else if (period === 'today') {
            if (itemDate === todayStr) {
                item.classList.remove('hidden-item');
                item.classList.add('fade-in');
            } else {
                item.classList.add('hidden-item');
                item.classList.remove('fade-in');
            }
        } else if (period === 'critical') {
            if (itemImportance === 'high') {
                item.classList.remove('hidden-item');
                item.classList.add('fade-in');
            } else {
                item.classList.add('hidden-item');
                item.classList.remove('fade-in');
            }
        } else if (period === 'week') {
            // Tous les événements sont visibles en mode semaine
            item.classList.remove('hidden-item');
            item.classList.add('fade-in');
        }
    });
    
    // Vérifier s'il y a des événements visibles après le filtrage
    checkVisibleEvents();
}

/**
 * Vérifie s'il y a des éléments d'actualité visibles après le filtrage
 */
function checkVisibleItems() {
    // Vérifier pour chaque conteneur d'actualités
    const containers = [
        {id: 'breaking-news', selector: '.grid'},
        {id: 'important-news', selector: '.grid'},
        {id: 'recent-news', selector: '.grid'}
    ];
    
    containers.forEach(({id, selector}) => {
        const container = document.getElementById(id)?.querySelector(selector);
        if (!container) return;
        
        const visibleItems = container.querySelectorAll('.news-item:not(.hidden-item)');
        
        // Si aucun élément n'est visible, afficher un message
        if (visibleItems.length === 0) {
            if (!container.querySelector('.no-data-message')) {
                const noItemsMessage = document.createElement('div');
                noItemsMessage.className = 'no-data-message flex flex-col items-center justify-center py-10 col-span-3';
                noItemsMessage.innerHTML = `
                    <i class="fas fa-filter text-gray-700 text-4xl mb-4"></i>
                    <h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3>
                    <p class="text-gray-400">Veuillez modifier vos filtres pour voir plus d'actualités.</p>
                `;
                
                container.appendChild(noItemsMessage);
            }
        } else {
            // Supprimer le message s'il existe
            const noItemsMessage = container.querySelector('.no-data-message');
            if (noItemsMessage) {
                noItemsMessage.remove();
            }
        }
    });
}

/**
 * Vérifie s'il y a des événements visibles après le filtrage
 */
function checkVisibleEvents() {
    const eventsContainer = document.getElementById('events-container');
    if (!eventsContainer) return;
    
    const visibleEvents = eventsContainer.querySelectorAll('.event-card:not(.hidden-item)');
    
    // Si aucun événement n'est visible, afficher un message
    if (visibleEvents.length === 0) {
        if (!document.getElementById('no-events-message')) {
            const noEventsMessage = document.createElement('div');
            noEventsMessage.id = 'no-events-message';
            noEventsMessage.className = 'no-data-message flex flex-col items-center justify-center p-6 text-center col-span-3';
            noEventsMessage.innerHTML = `
                <i class="fas fa-calendar-times text-gray-700 text-4xl mb-4"></i>
                <h3 class="text-white font-medium mb-2">Aucun événement disponible</h3>
                <p class="text-gray-400">Aucun événement ne correspond à la période sélectionnée.</p>
            `;
            
            eventsContainer.appendChild(noEventsMessage);
        }
    } else {
        // Supprimer le message s'il existe
        const noEventsMessage = document.getElementById('no-events-message');
        if (noEventsMessage) {
            noEventsMessage.remove();
        }
    }
}

/**
 * Charge plus d'actualités
 */
function loadMoreNews() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (!loadMoreBtn) return;
    
    // Afficher l'animation de chargement
    loadMoreBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Chargement...';
    loadMoreBtn.disabled = true;
    
    // Simuler un chargement (sera remplacé par un vrai appel API)
    setTimeout(() => {
        // Restaurer le bouton
        loadMoreBtn.innerHTML = 'Voir plus d\'actualités';
        loadMoreBtn.disabled = false;
        
        // Afficher un message si aucune nouvelle actualité n'est disponible
        const recentNewsContainer = document.getElementById('recent-news');
        if (!recentNewsContainer) return;
        
        const noMoreMessage = document.createElement('div');
        noMoreMessage.className = 'no-data-message flex flex-col items-center justify-center py-8 my-4';
        noMoreMessage.innerHTML = `
            <i class="fas fa-check-circle text-green-400 text-3xl mb-3"></i>
            <h3 class="text-white font-medium mb-2">Toutes les actualités sont affichées</h3>
            <p class="text-gray-400">Vous êtes à jour ! Revenez plus tard pour voir de nouvelles actualités.</p>
        `;
        
        recentNewsContainer.appendChild(noMoreMessage);
        
        // Désactiver le bouton
        loadMoreBtn.disabled = true;
        loadMoreBtn.style.opacity = '0.5';
        loadMoreBtn.style.cursor = 'not-allowed';
    }, 1000);
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date au format ISO ou autre
 * @returns {string} - Date formatée
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Date inconnue';
    
    try {
        const date = new Date(dateStr);
        
        // Si la date est invalide, essayer de parser un format DD/MM/YYYY
        if (isNaN(date.getTime())) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                // Format DD/MM/YYYY
                return dateStr;
            }
            return dateStr;
        }
        
        // Formater la date: aujourd'hui, hier ou date complète
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        // Même jour
        if (date.toDateString() === today.toDateString()) {
            return `Aujourd'hui ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Hier
        if (date.toDateString() === yesterday.toDateString()) {
            return `Hier ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Date complète
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (error) {
        return dateStr;
    }
}
