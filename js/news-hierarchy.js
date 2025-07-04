/**
 * news-hierarchy.js
 * Système central de hiérarchisation des actualités financières
 * Version optimisée avec cartes harmonisées "investisseur"
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

// Constantes pour limiter le nombre d'actualités par catégorie
const MAX_CRITICAL_NEWS = 5;
const MAX_IMPORTANT_NEWS = 8;
const MAX_REGULAR_NEWS = 12;

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
 * Helper centralisé pour construire les cartes d'actualités harmonisées
 * @param {Object} item - Données de l'actualité
 * @param {string} impactText - Texte d'impact affiché
 * @param {string} impactColor - Couleur de bordure (red-600, emerald-600, etc.)
 * @param {string} sentimentIcon - Icône de sentiment
 * @param {number} index - Index pour l'animation
 * @param {string} tier - Niveau (critical, important, regular)
 */
function buildNewsCard(item, impactText, impactColor, sentimentIcon, index, tier) {
    const card = document.createElement('div');
    card.className = `news-card relative flex flex-col rounded-xl p-6 border border-${impactColor} bg-zinc-900 transition hover:shadow-lg min-h-[240px] cursor-pointer`;
    card.style.animationDelay = `${index * 0.1}s`;

    // Attributs de filtrage
    ['category', 'impact', 'sentiment', 'country', 'score'].forEach(key => {
        card.setAttribute(`data-${key}`, item[key] || 'unknown');
    });
    
    // Attribut pour identifier la carte
    card.setAttribute('data-news-id', `news-${tier}-${index}`);

    // Gestion du clic pour ouvrir l'URL
    if (item.url) {
        card.setAttribute('data-url', item.url);
        card.classList.add('clickable-news');
        card.addEventListener('click', () => window.open(item.url, '_blank'));
    }

    // Tronquer le contenu si trop long (optionnel avec line-clamp CSS)
    let content = item.content || '';
    if (content.length > 280) {
        content = content.slice(0, 277) + '…';
    }

    // Badge urgent pour les actualités critiques
    const urgentBadge = tier === 'critical' ? '<span class="absolute top-2 right-2 badge urgent bg-red-500 text-white text-xs px-2 py-1 rounded animate-pulse">URGENT</span>' : '';

    card.innerHTML = `
        ${urgentBadge}
        
        <header class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="badge badge-${item.impact} uppercase text-xs px-2 py-1 rounded font-semibold ${getImpactBadgeClass(item.impact)}">${impactText}</span>
            <span class="chip text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">${item.category?.toUpperCase() || 'GENERAL'}</span>
            <span class="time text-xs text-zinc-500 ml-auto">${item.date || ''} ${item.time || ''}</span>
        </header>

        <h3 class="title text-lg font-bold line-clamp-2 text-white mb-3">${item.title}</h3>

        <p class="desc text-sm text-zinc-300 line-clamp-4 flex-grow mb-4">
            ${content}
        </p>

        <footer class="footer mt-auto flex justify-between items-center text-xs">
            <span class="text-emerald-400 font-medium">${item.source || '—'}</span>
            <div class="flex items-center gap-2">
                <span class="sentiment-icon">${sentimentIcon}</span>
                ${item.url ? '<span class="text-zinc-500"><i class="fas fa-external-link-alt"></i></span>' : ''}
            </div>
        </footer>
    `;
    
    return card;
}

/**
 * Retourne les classes CSS pour les badges d'impact
 */
function getImpactBadgeClass(impact) {
    switch(impact) {
        case 'negative':
            return 'bg-red-800 text-red-200 border border-red-600';
        case 'positive':
            return 'bg-emerald-800 text-emerald-200 border border-emerald-600';
        default:
            return 'bg-yellow-800 text-yellow-200 border border-yellow-600';
    }
}

/**
 * Retourne la couleur de bordure selon l'impact
 */
function getImpactBorderColor(impact) {
    switch(impact) {
        case 'negative':
            return 'red-600';
        case 'positive':
            return 'emerald-600';
        default:
            return 'yellow-600';
    }
}

/**
 * Retourne l'icône de sentiment
 */
function getSentimentIcon(sentiment) {
    switch(sentiment) {
        case 'positive':
            return '⬆️';
        case 'negative':
            return '⬇️';
        default:
            return '➖';
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

    // Liste des types à exclure
    const excludedTypes = ['economic', 'ipo', 'm&a'];

    // Filtre des actualités par type exact
    allNews = allNews.filter(news => {
        const type = (news.type || '').toLowerCase();
        return !excludedTypes.includes(type);
    });

    console.log(`Après filtrage des types exclus: ${allNews.length} actualités restantes`);

    // Vérifier que tous les champs nécessaires sont présents
    allNews.forEach(news => {
        // Valeurs par défaut si elles sont manquantes
        news.impact = news.impact || 'neutral';
        news.sentiment = news.sentiment || news.impact;
        news.category = news.category || 'general';
        news.country = news.country || 'other';
        
        // Hiérarchisation basée sur le score si disponible, sinon utiliser l'ancienne méthode
        if (!news.hierarchy && news.importance_score !== undefined) {
            const score = parseFloat(news.importance_score);
            
            if (score >= 45) {
                news.hierarchy = 'critical';
            } else if (score >= 38) {
                news.hierarchy = 'important';
            } else {
                news.hierarchy = 'normal';
            }
        } else if (!news.hierarchy && news.score !== undefined) {
            const score = parseFloat(news.score);
            
            if (score >= 45) {
                news.hierarchy = 'critical';
            } else if (score >= 38) {
                news.hierarchy = 'important';
            } else {
                news.hierarchy = 'normal';
            }
        } else if (!news.hierarchy) {
            // Ancienne méthode si pas de score
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
    
    // Tri par score d'importance puis par date
    const sortByImportance = (a, b) => {
        const scoreA = parseFloat(a.importance_score || a.score || 0);
        const scoreB = parseFloat(b.importance_score || b.score || 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        
        const dateA = a.rawDate || a.date;
        const dateB = b.rawDate || b.date;
        return dateB > dateA ? 1 : -1;
    };
    
    criticalNews.sort(sortByImportance);
    importantNews.sort(sortByImportance);
    regularNews.sort(sortByImportance);

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

    // Créer les cartes d'actualités critiques avec le nouveau helper
    news.slice(0, MAX_CRITICAL_NEWS).forEach((item, index) => {
        const impactText = getImpactText(item.impact);
        const impactColor = getImpactBorderColor(item.impact);
        const sentimentIcon = getSentimentIcon(item.sentiment || item.impact);
        
        const newsCard = buildNewsCard(item, impactText, impactColor, sentimentIcon, index, 'critical');
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

    // Créer les cartes d'actualités importantes avec le nouveau helper
    news.slice(0, MAX_IMPORTANT_NEWS).forEach((item, index) => {
        const impactText = getImpactText(item.impact);
        const impactColor = getImpactBorderColor(item.impact);
        const sentimentIcon = getSentimentIcon(item.sentiment || item.impact);
        
        const newsCard = buildNewsCard(item, impactText, impactColor, sentimentIcon, index, 'important');
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
        newsGrid.className = 'news-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
        container.appendChild(newsGrid);
    }

    // Créer les cartes d'actualités régulières avec le nouveau helper
    news.slice(0, MAX_REGULAR_NEWS).forEach((item, index) => {
        const impactText = getImpactText(item.impact);
        const impactColor = getImpactBorderColor(item.impact);
        const sentimentIcon = getSentimentIcon(item.sentiment || item.impact);
        
        const newsCard = buildNewsCard(item, impactText, impactColor, sentimentIcon, index, 'regular');
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
        <div class="loading-state flex items-center justify-center p-8">
            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-400 mr-3"></div>
            <p class="text-zinc-400">Chargement des actualités...</p>
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
            <div class="error-message bg-zinc-800 bg-opacity-70 rounded-lg p-6 text-center">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-3xl mb-3"></i>
                <h3 class="text-white font-medium mb-2">Impossible de charger les actualités</h3>
                <p class="text-zinc-400 mb-4">Nous rencontrons un problème de connexion avec notre service de données.</p>
                <button class="retry-button bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded transition" onclick="initializeNewsData()">
                    <i class="fas fa-sync-alt mr-2"></i> Réessayer
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
            item.classList.remove('hidden');
            item.style.display = 'flex';
            item.classList.add('animate-fadeIn');
        } else {
            item.classList.add('hidden');
            item.style.display = 'none';
            item.classList.remove('animate-fadeIn');
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
        
        const visibleItems = gridContainer.querySelectorAll('.news-card:not(.hidden)');
        
        // Si aucun élément n'est visible, afficher un message
        if (visibleItems.length === 0) {
            if (!gridContainer.querySelector('.no-data-message')) {
                const noItemsMessage = document.createElement('div');
                noItemsMessage.className = 'no-data-message flex flex-col items-center justify-center py-12 col-span-full';
                noItemsMessage.innerHTML = `
                    <i class="fas fa-filter text-zinc-600 text-4xl mb-4"></i>
                    <h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3>
                    <p class="text-zinc-400">Veuillez modifier vos filtres pour voir plus d'actualités.</p>
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
