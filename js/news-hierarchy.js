/**
 * news-hierarchy.js
 * Système central de hiérarchisation des actualités financières
 */

// Namespace global pour les actualités
window.NewsSystem = {
    data: null,
    isLoading: false,
    // Stockage des catégories d'actualités
    categorizedNews: {
        critical: [],
        important: [],
        regular: []
    },
    // Événement personnalisé pour notifier quand les données sont prêtes
    dataReadyEvent: new CustomEvent('newsDataReady')
};

// Initialisation: ajouter cette fonction au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page des actualités
    const newsContainers = document.getElementById('critical-news-container') || 
                           document.getElementById('important-news-container') || 
                           document.getElementById('recent-news');
    
    if (newsContainers) {
        console.log('Initialisation du système de hiérarchie des actualités');
        initializeNewsData();
    }
});

/**
 * Charge et initialise les données d'actualités
 */
async function initializeNewsData() {
    if (window.NewsSystem.isLoading) return;
    
    window.NewsSystem.isLoading = true;
    
    try {
        // Afficher les états de chargement dans les conteneurs
        showLoadingState('critical-news-container');
        showLoadingState('important-news-container');
        showLoadingState('recent-news');
        
        // Charger les données depuis l'API ou le fichier local
        const response = await fetch('data/news.json');
        
        if (!response.ok) {
            throw new Error('Impossible de charger les données');
        }
        
        const data = await response.json();
        window.NewsSystem.data = data;
        
        // Distribuer les actualités selon leur importance
        distributeNewsByImportance(data);
        
        // Déclencher l'événement qui indique que les données sont prêtes
        document.dispatchEvent(window.NewsSystem.dataReadyEvent);
    } catch (error) {
        console.error('Erreur lors du chargement des actualités:', error);
        displayFallbackData();
    } finally {
        window.NewsSystem.isLoading = false;
    }
}

/**
 * Distribue les actualités par niveau d'importance
 * @param {Object} newsData - Données d'actualités
 */
function distributeNewsByImportance(newsData) {
    // Vérification des données
    if (!newsData || (!newsData.us && !newsData.france)) {
        console.error("Données d'actualités non disponibles");
        return;
    }

    // Fusionner les actualités US et France
    const allNews = [...(newsData.us || []), ...(newsData.france || [])];

    // S'assurer que les scores sont présents, sinon calculer
    allNews.forEach(news => {
        if (typeof news.score === 'undefined') {
            news.score = calculateNewsScore(news);
        }
    });

    // Filtrer les actualités par score
    const criticalNews = allNews.filter(news => news.score >= 15);
    const importantNews = allNews.filter(news => news.score >= 8 && news.score < 15);
    const regularNews = allNews.filter(news => news.score < 8);

    // Stocker les actualités catégorisées
    window.NewsSystem.categorizedNews = {
        critical: criticalNews,
        important: importantNews,
        regular: regularNews
    };

    // Afficher dans les sections correspondantes
    displayCriticalNews(criticalNews);
    displayImportantNews(importantNews);
    displayRecentNews(regularNews);

    console.log(`Actualités distribuées: ${criticalNews.length} critiques, ${importantNews.length} importantes, ${regularNews.length} régulières`);
}

/**
 * Calcule un score pour classer l'importance d'une actualité
 * @param {Object} item - Élément d'actualité
 * @returns {number} - Score d'importance
 */
function calculateNewsScore(item) {
    const content = `${item.title} ${item.content || ''}`.toLowerCase();

    const keywords = {
        "high_impact": [
            "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", "banque centrale", 
            "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "hausse des taux", 
            "bond yield", "yield curve", "sell-off", "bear market", "effondrement", "chute", "krach",
            "dégringolade", "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion"
        ],
        "medium_impact": [
            "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
            "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
            "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat"
        ],
        "low_impact": [
            "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
            "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision"
        ]
    };

    let score = 0;

    // Ajouter des points selon les occurrences de mots-clés
    for (const word of keywords.high_impact) {
        if (content.includes(word)) score += 10;
    }
    
    for (const word of keywords.medium_impact) {
        if (content.includes(word)) score += 5;
    }
    
    for (const word of keywords.low_impact) {
        if (content.includes(word)) score += 2;
    }

    // Ajustement basé sur la source
    const importantSources = ["Bloomberg", "Reuters", "WSJ", "FT", "CNBC", "Financial Times", "Wall Street Journal"];
    if (importantSources.some(source => (item.source || '').includes(source))) {
        score += 5;
    }

    // Bonus pour les actualités négatives
    if (item.impact === 'negative') {
        score += 3;
    }

    // Bonus pour certaines catégories
    if (item.category === 'economie') {
        score += 3;
    } else if (item.category === 'marches') {
        score += 2;
    }

    return score;
}

/**
 * Fonction pour afficher les actualités critiques
 * @param {Array} news - Actualités critiques
 */
function displayCriticalNews(news) {
    const container = document.getElementById('critical-news-container');
    if (!container) {
        console.error("Conteneur d'actualités critiques introuvable");
        return;
    }

    // Vider le conteneur
    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucune actualité critique pour le moment</p>';
        return;
    }

    // Créer les cartes d'actualités critiques
    news.forEach((item, index) => {
        // Détermine la classe CSS basée sur l'impact
        const impactClass = item.impact === 'negative' ? 'bg-red-800 bg-opacity-20 border-red-700' : 
                            item.impact === 'positive' ? 'bg-green-800 bg-opacity-20 border-green-700' : 
                            'bg-yellow-800 bg-opacity-20 border-yellow-700';
                            
        // Texte descriptif de l'impact
        const impactText = item.impact === 'negative' ? 'Impact négatif' : 
                           item.impact === 'positive' ? 'Impact positif' : 'Impact neutre';
                           
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;

        const newsCard = document.createElement('div');
        newsCard.className = `news-card glassmorphism ${impactClass}`;
        newsCard.style.animationDelay = `${index * 0.1}s`;
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-country', item.country || 'other');

        newsCard.innerHTML = `
            <span class="badge urgent">URGENT</span>
            <div class="p-4">
                <div class="mb-2">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${item.category || 'Finance'}</span>
                </div>
                <h3 class="text-lg font-bold">${item.title}</h3>
                <p class="text-sm mt-2">${item.content}</p>
                <div class="news-meta">
                    <span class="source">${item.source}</span>
                    <div class="date-time">
                        <i class="fas fa-clock mr-1"></i>
                        ${item.date} ${item.time}
                    </div>
                </div>
            </div>
        `;

        container.appendChild(newsCard);
    });
}

/**
 * Fonction pour afficher les actualités importantes
 * @param {Array} news - Actualités importantes
 */
function displayImportantNews(news) {
    const container = document.getElementById('important-news-container');
    if (!container) {
        console.error("Conteneur d'actualités importantes introuvable");
        return;
    }

    // Vider le conteneur
    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucune actualité importante pour le moment</p>';
        return;
    }

    // Créer les cartes d'actualités importantes
    news.forEach((item, index) => {
        // Détermine la classe CSS basée sur l'impact
        const impactClass = item.impact === 'negative' ? 'bg-red-700 bg-opacity-10 border-red-600' : 
                            item.impact === 'positive' ? 'bg-green-700 bg-opacity-10 border-green-600' : 
                            'bg-yellow-700 bg-opacity-10 border-yellow-600';
                            
        // Texte descriptif de l'impact
        const impactText = item.impact === 'negative' ? 'Impact négatif' : 
                           item.impact === 'positive' ? 'Impact positif' : 'Impact neutre';
                           
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;

        const newsCard = document.createElement('div');
        newsCard.className = `news-card glassmorphism ${impactClass}`;
        newsCard.style.animationDelay = `${index * 0.1}s`;
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-country', item.country || 'other');

        newsCard.innerHTML = `
            <div class="p-4">
                <div class="mb-2">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${item.category || 'Finance'}</span>
                </div>
                <h3 class="text-md font-semibold">${item.title}</h3>
                <p class="text-sm mt-2">${item.content}</p>
                <div class="news-meta">
                    <span class="source">${item.source}</span>
                    <div class="date-time">
                        <i class="fas fa-clock mr-1"></i>
                        ${item.date} ${item.time}
                    </div>
                </div>
            </div>
        `;

        container.appendChild(newsCard);
    });
}

/**
 * Fonction pour afficher les actualités régulières
 * @param {Array} news - Actualités régulières
 */
function displayRecentNews(news) {
    const container = document.getElementById('recent-news');
    if (!container) {
        console.error("Conteneur d'actualités récentes introuvable");
        return;
    }

    // Vider le conteneur
    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucune actualité récente pour le moment</p>';
        return;
    }

    // CORRECTION: Vérifier si le conteneur est déjà une news-grid ou s'il faut en créer une
    let newsGrid;
    if (container.classList.contains('news-grid')) {
        // Si le conteneur est déjà une news-grid, l'utiliser directement
        newsGrid = container;
    } else {
        // Sinon, créer une grille pour les actualités
        newsGrid = document.createElement('div');
        newsGrid.className = 'news-grid';
        container.appendChild(newsGrid);
    }

    // Créer les cartes d'actualités régulières
    news.forEach((item, index) => {
        const newsCard = document.createElement('div');
        newsCard.className = 'news-card';
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-country', item.country || 'other');

        newsCard.innerHTML = `
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-source">${item.source || 'Financial Data'}</span>
                    <div class="news-date-time">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="news-date">${item.date || ''}</span>
                        <span class="news-time">${item.time || ''}</span>
                    </div>
                </div>
                <h3>${item.title}</h3>
                <p>${item.content || ''}</p>
            </div>
        `;

        newsGrid.appendChild(newsCard);
    });
}

/**
 * Affiche l'état de chargement dans un conteneur
 * @param {string} containerId - ID du conteneur
 */
function showLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Chargement des actualités...</p>
        </div>
    `;
}

/**
 * Affiche des données de secours en cas d'erreur
 */
function displayFallbackData() {
    // Message d'avertissement
    console.warn('Utilisation des données de secours pour les actualités');
    
    // Afficher des messages d'erreur dans les conteneurs
    const containers = ['critical-news-container', 'important-news-container', 'recent-news'];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-message bg-gray-800 bg-opacity-70 rounded-lg p-4 text-center">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-2xl mb-2"></i>
                <h3 class="text-white font-medium mb-2">Impossible de charger les actualités</h3>
                <p class="text-gray-400 mb-3">Nous rencontrons un problème de connexion avec notre service de données.</p>
                <button class="retry-button" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt mr-1"></i> Réessayer
                </button>
            </div>
        `;
    });
}

// Exposer les fonctions nécessaires pour l'interopérabilité avec actualites.js
window.NewsSystem.initializeNewsData = initializeNewsData;
window.NewsSystem.filterNews = filterNews;

/**
 * Filtre les actualités en fonction du type et de la valeur du filtre
 * @param {string} filterType - Type de filtre (category, impact, country)
 * @param {string} filterValue - Valeur du filtre
 */
function filterNews(filterType, filterValue) {
    const newsItems = document.querySelectorAll('.news-card');
    
    // Obtenir les autres filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    
    // Mettre à jour les filtres actifs en fonction du type actuel
    let currentCategory = activeCategory;
    let currentImpact = activeImpact;
    let currentCountry = activeCountry;
    
    if (filterType === 'category') currentCategory = filterValue;
    if (filterType === 'impact') currentImpact = filterValue;
    if (filterType === 'country') currentCountry = filterValue;
    
    // Appliquer les filtres à chaque élément d'actualité
    newsItems.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const itemImpact = item.getAttribute('data-impact');
        const itemCountry = item.getAttribute('data-country');
        
        // Vérifier si l'élément correspond à tous les filtres actifs
        const matchesCategory = currentCategory === 'all' || itemCategory === currentCategory;
        const matchesImpact = currentImpact === 'all' || itemImpact === currentImpact;
        const matchesCountry = currentCountry === 'all' || itemCountry === currentCountry;
        
        // Afficher ou masquer l'élément en fonction des filtres
        if (matchesCategory && matchesImpact && matchesCountry) {
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
 * Vérifie s'il y a des éléments d'actualité visibles après le filtrage
 */
function checkVisibleItems() {
    const containers = ['recent-news', 'important-news-container', 'critical-news-container'];
    
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Pour recent-news, chercher dans la grille
        const gridContainer = containerId === 'recent-news' && !container.classList.contains('news-grid')
            ? container.querySelector('.news-grid') 
            : container;
            
        if (!gridContainer) return;
        
        const visibleItems = gridContainer.querySelectorAll('.news-card:not(.hidden-item)');
        
        // Si aucun élément n'est visible, afficher un message
        if (visibleItems.length === 0) {
            if (!gridContainer.querySelector('.no-data-message')) {
                const noItemsMessage = document.createElement('div');
                noItemsMessage.className = 'no-data-message flex flex-col items-center justify-center py-10 col-span-3';
                noItemsMessage.innerHTML = `
                    <i class="fas fa-filter text-gray-700 text-4xl mb-4"></i>
                    <h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3>
                    <p class="text-gray-400">Veuillez modifier vos filtres pour voir plus d'actualités.</p>
                `;
                
                gridContainer.appendChild(noItemsMessage);
            }
        } else {
            // Supprimer le message s'il existe
            const noItemsMessage = gridContainer.querySelector('.no-data-message');
            if (noItemsMessage) {
                noItemsMessage.remove();
            }
        }
    });
}