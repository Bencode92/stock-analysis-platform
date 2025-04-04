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
        
        let data;
        
        // Utiliser directement news.json
        console.log('📊 Chargement des données depuis news.json');
        const response = await fetch('data/news.json');
        
        if (!response.ok) {
            throw new Error('Impossible de charger les données');
        }
        
        data = await response.json();
        console.log('✅ Données chargées avec succès');
        
        window.NewsSystem.data = data;
        
        // Distribuer les actualités selon leur importance/hiérarchie
        distributeNewsByImportance(data);
        
        console.log('Données d\'actualités chargées et distribuées');
        
        // Déclencher l'événement qui indique que les données sont prêtes
        document.dispatchEvent(window.NewsSystem.dataReadyEvent);
        console.log('Événement newsDataReady déclenché après chargement des données');
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
    if (!newsData) {
        console.error("Données d'actualités non disponibles");
        return;
    }

    // Fusionner toutes les actualités disponibles dans les différentes régions
    let allNews = [];
    
    // Parcourir toutes les clés qui pourraient contenir des articles (us, france, uk, etc.)
    Object.keys(newsData).forEach(key => {
        if (Array.isArray(newsData[key])) {
            allNews = allNews.concat(newsData[key]);
        }
    });

    // Liste des mots-clés et catégories à exclure
    const excludedKeywords = ['ipo', 'acquisition', 'merger', 'event', 'earnings', 'dividend', 'buyback', 'm&a'];

    // Filtre des actualités non désirées
    allNews = allNews.filter(news => {
        const title = (news.title || '').toLowerCase();
        const category = (news.category || '').toLowerCase();
        const type = (news.type || '').toLowerCase();
        
        return !excludedKeywords.some(keyword => 
            title.includes(keyword) || category.includes(keyword) || type.includes(keyword)
        );
    });

    console.log(`Après filtrage des événements, IPO, M&A, etc.: ${allNews.length} actualités restantes`);

    // Vérifier que tous les champs nécessaires sont présents
    allNews.forEach(news => {
        // Valeurs par défaut si elles sont manquantes
        news.impact = news.impact || 'neutral';
        news.sentiment = news.sentiment || news.impact;
        news.category = news.category || 'general';
        news.country = news.country || 'other';
        
        // Simple hiérarchisation basée sur les données existantes
        // Vérifier si hierarchy existe déjà, sinon l'attribuer en fonction de l'importance
        if (!news.hierarchy) {
            if (news.importance === 'high' || news.impact === 'negative') {
                news.hierarchy = 'critical';
            } else if (news.importance === 'medium' || news.impact === 'positive') {
                news.hierarchy = 'important';
            } else {
                news.hierarchy = 'normal';
            }
        }
    });

    // Filtrer les actualités par hiérarchie
    const criticalNews = allNews.filter(news => 
        news.hierarchy === 'critical'
    );
    
    const importantNews = allNews.filter(news => 
        news.hierarchy === 'important'
    );
    
    const regularNews = allNews.filter(news => 
        news.hierarchy === 'normal'
    );
    
    // Tri par date (les plus récentes en premier)
    const sortByDate = (a, b) => {
        const dateA = a.rawDate || a.date;
        const dateB = b.rawDate || b.date;
        return dateB > dateA ? 1 : -1;
    };
    
    criticalNews.sort(sortByDate);
    importantNews.sort(sortByDate);
    regularNews.sort(sortByDate);

    // Stocker les actualités catégorisées
    window.NewsSystem.categorizedNews = {
        critical: criticalNews,
        important: importantNews,
        regular: regularNews
    };

    // Logs de débogage
    console.log(`Actualités critiques: ${criticalNews.length}`);
    console.log(`Actualités importantes: ${importantNews.length}`);
    console.log(`Actualités générales: ${regularNews.length}`);

    // Afficher dans les sections correspondantes
    displayCriticalNews(criticalNews);
    displayImportantNews(importantNews);
    displayRecentNews(regularNews);

    console.log(`Actualités distribuées: ${criticalNews.length} critiques, ${importantNews.length} importantes, ${regularNews.length} régulières`);
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
        const impactText = item.impact === 'negative' ? 'IMPACT NÉGATIF' : 
                           item.impact === 'positive' ? 'IMPACT POSITIF' : 'IMPACT NEUTRE';
                           
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;
        
        // Icône pour le sentiment
        const sentimentClass = `sentiment-${item.sentiment || 'neutral'}`;
        const sentimentIcon = item.sentiment === 'positive' ? '<i class="fas fa-arrow-up"></i>' : 
                             item.sentiment === 'negative' ? '<i class="fas fa-arrow-down"></i>' : 
                             '<i class="fas fa-minus"></i>';

        const newsCard = document.createElement('div');
        newsCard.className = `news-card glassmorphism ${impactClass}`;
        newsCard.style.animationDelay = `${index * 0.1}s`;
        
        // Ajouter les attributs pour le filtrage
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-sentiment', item.sentiment || item.impact || 'neutral');
        newsCard.setAttribute('data-news-id', `news-critical-${index}`);
        newsCard.setAttribute('data-country', item.country || 'other');
        
        // Ajouter l'URL de l'article comme attribut
        if (item.url) {
            newsCard.setAttribute('data-url', item.url);
            newsCard.style.cursor = 'pointer';
            
            // Ajouter un événement click pour ouvrir l'URL
            newsCard.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                if (url) {
                    window.open(url, '_blank');
                }
            });
            
            // Ajouter une indication visuelle pour montrer que c'est cliquable
            newsCard.classList.add('clickable-news');
        }

        newsCard.innerHTML = `
            <span class="badge urgent">URGENT</span>
            <div class="p-4">
                <div class="mb-2">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${(item.category || 'GENERAL').toUpperCase()}</span>
                    <span class="sentiment-indicator ${sentimentClass}">
                        ${sentimentIcon}
                    </span>
                </div>
                <h3 class="text-lg font-bold">${item.title}</h3>
                <p class="text-sm mt-2">${item.content || ''}</p>
                <div class="news-meta">
                    <span class="source">${item.source || 'Financial Data'}</span>
                    <div class="date-time">
                        <i class="fas fa-clock mr-1"></i>
                        ${item.date || ''} ${item.time || ''}
                    </div>
                    ${item.url ? '<div class="read-more"><i class="fas fa-external-link-alt mr-1"></i> Lire l\'article</div>' : ''}
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
        const impactText = item.impact === 'negative' ? 'IMPACT NÉGATIF' : 
                           item.impact === 'positive' ? 'IMPACT POSITIF' : 'IMPACT NEUTRE';
                           
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;
        
        // Icône pour le sentiment
        const sentimentClass = `sentiment-${item.sentiment || 'neutral'}`;
        const sentimentIcon = item.sentiment === 'positive' ? '<i class="fas fa-arrow-up"></i>' : 
                             item.sentiment === 'negative' ? '<i class="fas fa-arrow-down"></i>' : 
                             '<i class="fas fa-minus"></i>';

        const newsCard = document.createElement('div');
        newsCard.className = `news-card glassmorphism ${impactClass}`;
        newsCard.style.animationDelay = `${index * 0.1}s`;
        
        // Ajouter les attributs pour le filtrage
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-sentiment', item.sentiment || item.impact || 'neutral');
        newsCard.setAttribute('data-news-id', `news-important-${index}`);
        newsCard.setAttribute('data-country', item.country || 'other');
        
        // Ajouter l'URL de l'article comme attribut
        if (item.url) {
            newsCard.setAttribute('data-url', item.url);
            newsCard.style.cursor = 'pointer';
            
            // Ajouter un événement click pour ouvrir l'URL
            newsCard.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                if (url) {
                    window.open(url, '_blank');
                }
            });
            
            // Ajouter une indication visuelle pour montrer que c'est cliquable
            newsCard.classList.add('clickable-news');
        }

        newsCard.innerHTML = `
            <div class="p-4">
                <div class="mb-2">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${(item.category || 'GENERAL').toUpperCase()}</span>
                    <span class="sentiment-indicator ${sentimentClass}">
                        ${sentimentIcon}
                    </span>
                </div>
                <h3 class="text-md font-semibold">${item.title}</h3>
                <p class="text-sm mt-2">${item.content || ''}</p>
                <div class="news-meta">
                    <span class="source">${item.source || 'Financial Data'}</span>
                    <div class="date-time">
                        <i class="fas fa-clock mr-1"></i>
                        ${item.date || ''} ${item.time || ''}
                    </div>
                    ${item.url ? '<div class="read-more"><i class="fas fa-external-link-alt mr-1"></i> Lire l\'article</div>' : ''}
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

    // Vérifier si le conteneur est déjà une news-grid ou s'il faut en créer une
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
        // Détermine la classe CSS basée sur l'impact
        const impactClass = item.impact === 'negative' ? 'bg-red-700 bg-opacity-10 border-red-600' : 
                            item.impact === 'positive' ? 'bg-green-700 bg-opacity-10 border-green-600' : 
                            'bg-yellow-700 bg-opacity-10 border-yellow-600';
                            
        // Texte descriptif de l'impact
        const impactText = item.impact === 'negative' ? 'IMPACT NÉGATIF' : 
                           item.impact === 'positive' ? 'IMPACT POSITIF' : 'IMPACT NEUTRE';
                           
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;
        
        // Icône pour le sentiment
        const sentimentClass = `sentiment-${item.sentiment || 'neutral'}`;
        const sentimentIcon = item.sentiment === 'positive' ? '<i class="fas fa-arrow-up"></i>' : 
                             item.sentiment === 'negative' ? '<i class="fas fa-arrow-down"></i>' : 
                             '<i class="fas fa-minus"></i>';

        const newsCard = document.createElement('div');
        newsCard.className = `news-card glassmorphism ${impactClass}`;
        
        // Ajouter les attributs pour le filtrage
        newsCard.setAttribute('data-category', item.category || 'general');
        newsCard.setAttribute('data-impact', item.impact || 'neutral');
        newsCard.setAttribute('data-sentiment', item.sentiment || item.impact || 'neutral');
        newsCard.setAttribute('data-news-id', `news-regular-${index}`);
        newsCard.setAttribute('data-country', item.country || 'other');
        
        // Ajouter l'URL de l'article comme attribut
        if (item.url) {
            newsCard.setAttribute('data-url', item.url);
            newsCard.style.cursor = 'pointer';
            
            // Ajouter un événement click pour ouvrir l'URL
            newsCard.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                if (url) {
                    window.open(url, '_blank');
                }
            });
            
            // Ajouter une indication visuelle pour montrer que c'est cliquable
            newsCard.classList.add('clickable-news');
        }

        newsCard.innerHTML = `
            <div class="p-4">
                <div class="mb-2">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${(item.category || 'GENERAL').toUpperCase()}</span>
                    <span class="sentiment-indicator ${sentimentClass}">
                        ${sentimentIcon}
                    </span>
                </div>
                <h3 class="text-md font-semibold">${item.title}</h3>
                <p class="text-sm mt-2">${item.content || ''}</p>
                <div class="news-meta">
                    <span class="source">${item.source || 'Financial Data'}</span>
                    <div class="date-time">
                        <i class="fas fa-clock mr-1"></i>
                        ${item.date || ''} ${item.time || ''}
                    </div>
                    ${item.url ? '<div class="read-more"><i class="fas fa-external-link-alt mr-1"></i> Lire l\'article</div>' : ''}
                </div>
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

/**
 * Fonctions utilitaires pour les textes
 */
function getImpactText(impact) {
    return impact === 'negative' ? 'IMPACT NÉGATIF' : 
          impact === 'slightly_negative' ? 'IMPACT LÉGÈREMENT NÉGATIF' :
          impact === 'positive' ? 'IMPACT POSITIF' : 
          impact === 'slightly_positive' ? 'IMPACT LÉGÈREMENT POSITIF' :
          'IMPACT NEUTRE';
}

function getSentimentText(sentiment) {
    return sentiment === 'positive' ? 'SENTIMENT POSITIF' : 
           sentiment === 'negative' ? 'SENTIMENT NÉGATIF' : 
           'SENTIMENT NEUTRE';
}

// Exposer les fonctions nécessaires pour l'interopérabilité avec actualites.js
window.NewsSystem.initializeNewsData = initializeNewsData;
window.NewsSystem.filterNews = filterNews;
window.NewsSystem.applyCurrentFilters = function() {
    // Récupérer les filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeSentiment = document.getElementById('sentiment-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    
    // Appliquer les filtres
    window.NewsSystem.filterNews('category', activeCategory);
};

/**
 * Filtre les actualités en fonction du type et de la valeur du filtre
 * @param {string} filterType - Type de filtre (category, impact, country)
 * @param {string} filterValue - Valeur du filtre
 */
function filterNews(filterType, filterValue) {
    console.log(`Filtrage des actualités par ${filterType}=${filterValue}`);
    
    const newsItems = document.querySelectorAll('.news-card');
    
    // Obtenir les autres filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeSentiment = document.getElementById('sentiment-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    
    // Mettre à jour les filtres actifs en fonction du type actuel
    let currentCategory = activeCategory;
    let currentImpact = activeImpact;
    let currentSentiment = activeSentiment;
    let currentCountry = activeCountry;
    
    if (filterType === 'category') currentCategory = filterValue;
    if (filterType === 'impact') currentImpact = filterValue;
    if (filterType === 'sentiment') currentSentiment = filterValue;
    if (filterType === 'country') currentCountry = filterValue;
    
    // Appliquer les filtres à chaque élément d'actualité
    newsItems.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const itemImpact = item.getAttribute('data-impact');
        const itemSentiment = item.getAttribute('data-sentiment');
        const itemCountry = item.getAttribute('data-country');
        
        // Vérifier si l'élément correspond à tous les filtres actifs
        const matchesCategory = currentCategory === 'all' || itemCategory === currentCategory;
        const matchesImpact = currentImpact === 'all' || itemImpact === currentImpact;
        const matchesSentiment = currentSentiment === 'all' || itemSentiment === currentSentiment;
        const matchesCountry = currentCountry === 'all' || itemCountry === currentCountry;
        
        // Afficher ou masquer l'élément en fonction des filtres
        if (matchesCategory && matchesImpact && matchesSentiment && matchesCountry) {
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
