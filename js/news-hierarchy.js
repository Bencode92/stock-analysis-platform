/**
 * news-hierarchy.js
 * Système central de hiérarchisation des actualités financières
 * Version Tailwind native optimisée
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
const MAX_CRITICAL_NEWS = 6;
const MAX_IMPORTANT_NEWS = 9;
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
 * Helper centralisé pour construire les cartes d'actualités harmonisées (approche Tailwind pure)
 * @param {Object} item - Données de l'actualité
 * @param {string} impactText - Texte d'impact affiché
 * @param {string} borderColor - Couleur de bordure (red-600, emerald-600, etc.)
 * @param {string} sentimentIcon - Icône de sentiment
 * @param {number} index - Index pour l'animation
 * @param {string} tier - Niveau (critical, important, regular)
 */
function buildNewsCard(item, impactText, borderColor, sentimentIcon, index, tier) {
    const card = document.createElement('div');
    
    // Classes Tailwind pures - plus besoin de styles custom
    const baseClasses = `news-card border-${borderColor} animate-fadeIn`;
    card.className = baseClasses;
    card.style.animationDelay = `${index * 0.1}s`;

    // Attributs de filtrage pour les filtres
    const attributes = {
        'data-category': item.category || 'general',
        'data-impact': item.impact || 'neutral',
        'data-sentiment': item.sentiment || item.impact || 'neutral',
        'data-country': item.country || 'other',
        'data-score': item.importance_score || item.score || '0',
        'data-news-id': `news-${tier}-${index}`
    };
    
    Object.entries(attributes).forEach(([key, value]) => {
        card.setAttribute(key, value);
    });

    // Gestion du clic pour ouvrir l'URL
    if (item.url) {
        card.setAttribute('data-url', item.url);
        card.classList.add('clickable-news');
        card.addEventListener('click', () => window.open(item.url, '_blank'));
        card.setAttribute('tabindex', '0'); // Accessibilité
        
        // Support clavier
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.open(item.url, '_blank');
            }
        });
    }

    // Tronquer le contenu de manière intelligente
    let content = item.content || '';
    if (content.length > 280) {
        // Couper au dernier espace avant 277 caractères
        const truncated = content.slice(0, 277);
        const lastSpace = truncated.lastIndexOf(' ');
        content = truncated.slice(0, lastSpace > 200 ? lastSpace : 277) + '…';
    }

    // Badge urgent pour les actualités critiques uniquement
    const urgentBadge = tier === 'critical' ? 
        `<span class="badge urgent">URGENT</span>` : '';

    // Construire le markup avec classes Tailwind
    card.innerHTML = `
        ${urgentBadge}
        
        <header class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="badge badge-${item.impact || 'neutral'}">${impactText}</span>
            <span class="chip">${(item.category || 'GENERAL').toUpperCase()}</span>
            <span class="time">${formatDateTime(item.date, item.time)}</span>
        </header>

        <h3 class="title">${escapeHtml(item.title)}</h3>

        <p class="desc">${escapeHtml(content)}</p>

        <footer class="footer">
            <span class="text-emerald-400 font-medium">${escapeHtml(item.source || '—')}</span>
            <div class="flex items-center gap-2">
                <span class="sentiment-icon">${sentimentIcon}</span>
                ${item.url ? '<i class="fas fa-external-link-alt text-zinc-500 text-xs"></i>' : ''}
            </div>
        </footer>
    `;
    
    return card;
}

/**
 * Escape HTML pour éviter l'injection XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Formate la date et l'heure de manière cohérente
 */
function formatDateTime(date, time) {
    if (!date) return '';
    const timeStr = time ? ` ${time}` : '';
    return `${date}${timeStr}`;
}

/**
 * Retourne la couleur de bordure selon l'impact (approche Tailwind)
 */
function getImpactBorderColor(impact) {
    const colorMap = {
        'negative': 'red-600',
        'positive': 'emerald-600',
        'neutral': 'yellow-600'
    };
    return colorMap[impact] || 'yellow-600';
}

/**
 * Retourne l'icône de sentiment moderne
 */
function getSentimentIcon(sentiment) {
    const iconMap = {
        'positive': '📈',
        'negative': '📉',
        'neutral': '➖'
    };
    return iconMap[sentiment] || '➖';
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

    // Liste des types à exclure (selon le guide)
    const excludedTypes = ['economic', 'ipo', 'm&a'];

    // Filtre des actualités par type exact
    allNews = allNews.filter(news => {
        const type = (news.type || '').toLowerCase();
        return !excludedTypes.includes(type);
    });

    console.log(`Après filtrage des types exclus: ${allNews.length} actualités restantes`);

    // Normalisation et enrichissement des données
    allNews.forEach(news => {
        // Valeurs par défaut si elles sont manquantes
        news.impact = news.impact || 'neutral';
        news.sentiment = news.sentiment || news.impact;
        news.category = news.category || 'general';
        news.country = news.country || 'other';
        
        // Hiérarchisation basée sur le score (approche optimisée)
        const score = parseFloat(news.importance_score || news.score || 0);
        
        if (!news.hierarchy) {
            if (score >= 45) {
                news.hierarchy = 'critical';
            } else if (score >= 38) {
                news.hierarchy = 'important';
            } else if (news.importance === 'high' || news.impact === 'negative') {
                news.hierarchy = 'critical';
            } else if (news.importance === 'medium' || news.impact === 'positive') {
                news.hierarchy = 'important';
            } else {
                news.hierarchy = 'normal';
            }
        }
    });

    // Filtrer les actualités par hiérarchie
    const newsCategories = {
        critical: allNews.filter(news => news.hierarchy === 'critical'),
        important: allNews.filter(news => news.hierarchy === 'important'),
        regular: allNews.filter(news => news.hierarchy === 'normal')
    };
    
    // Tri optimisé : score d'importance puis date
    const sortByImportance = (a, b) => {
        const scoreA = parseFloat(a.importance_score || a.score || 0);
        const scoreB = parseFloat(b.importance_score || b.score || 0);
        
        if (scoreA !== scoreB) return scoreB - scoreA;
        
        // Fallback sur la date si scores égaux
        const dateA = new Date(a.rawDate || a.date || 0);
        const dateB = new Date(b.rawDate || b.date || 0);
        return dateB - dateA;
    };
    
    Object.values(newsCategories).forEach(category => category.sort(sortByImportance));

    // Stocker les actualités catégorisées
    window.NewsSystem.categorizedNews = newsCategories;

    // Logs de débogage
    console.log(`📊 Distribution des actualités:`, {
        critiques: newsCategories.critical.length,
        importantes: newsCategories.important.length,
        générales: newsCategories.regular.length
    });

    // Afficher dans les sections correspondantes
    displayCriticalNews(newsCategories.critical);
    displayImportantNews(newsCategories.important);
    displayRecentNews(newsCategories.regular);
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

    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-zinc-400 py-8">Aucune actualité critique pour le moment</p>';
        return;
    }

    // Créer les cartes avec le helper optimisé
    news.slice(0, MAX_CRITICAL_NEWS).forEach((item, index) => {
        const card = buildNewsCard(
            item,
            getImpactText(item.impact),
            getImpactBorderColor(item.impact),
            getSentimentIcon(item.sentiment || item.impact),
            index,
            'critical'
        );
        container.appendChild(card);
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

    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-zinc-400 py-8">Aucune actualité importante pour le moment</p>';
        return;
    }

    // Créer les cartes avec le helper optimisé
    news.slice(0, MAX_IMPORTANT_NEWS).forEach((item, index) => {
        const card = buildNewsCard(
            item,
            getImpactText(item.impact),
            getImpactBorderColor(item.impact),
            getSentimentIcon(item.sentiment || item.impact),
            index,
            'important'
        );
        container.appendChild(card);
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

    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-zinc-400 py-8">Aucune actualité récente pour le moment</p>';
        return;
    }

    // Créer une grille avec les classes Tailwind optimisées
    const newsGrid = document.createElement('div');
    newsGrid.className = 'news-grid';
    container.appendChild(newsGrid);

    // Créer les cartes avec le helper optimisé
    news.slice(0, MAX_REGULAR_NEWS).forEach((item, index) => {
        const card = buildNewsCard(
            item,
            getImpactText(item.impact),
            getImpactBorderColor(item.impact),
            getSentimentIcon(item.sentiment || item.impact),
            index,
            'regular'
        );
        newsGrid.appendChild(card);
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
            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-400 mr-3"></div>
            <p>Chargement des actualités...</p>
        </div>
    `;
}

/**
 * Affiche des données de secours en cas d'erreur
 */
function displayFallbackData() {
    console.warn('Utilisation des données de secours pour les actualités');
    
    const containers = ['critical-news-container', 'important-news-container', 'recent-news'];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-3xl mb-3"></i>
                <h3 class="text-white font-medium mb-2">Impossible de charger les actualités</h3>
                <p class="text-zinc-400 mb-4">Nous rencontrons un problème de connexion avec notre service de données.</p>
                <button class="retry-button" onclick="initializeNewsData()">
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
    const textMap = {
        'negative': 'IMPACT NÉGATIF',
        'slightly_negative': 'IMPACT LÉGÈREMENT NÉGATIF',
        'positive': 'IMPACT POSITIF',
        'slightly_positive': 'IMPACT LÉGÈREMENT POSITIF',
        'neutral': 'IMPACT NEUTRE'
    };
    return textMap[impact] || 'IMPACT NEUTRE';
}

function getSentimentText(sentiment) {
    const textMap = {
        'positive': 'SENTIMENT POSITIF',
        'negative': 'SENTIMENT NÉGATIF',
        'neutral': 'SENTIMENT NEUTRE'
    };
    return textMap[sentiment] || 'SENTIMENT NEUTRE';
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
 * Filtre les actualités optimisé pour Tailwind
 * @param {string} filterType - Type de filtre (category, impact, country, sentiment)
 * @param {string} filterValue - Valeur du filtre
 */
function filterNews(filterType, filterValue) {
    console.log(`🔍 Filtrage des actualités par ${filterType}=${filterValue}`);
    
    const newsItems = document.querySelectorAll('.news-card');
    
    // Récupérer tous les filtres actifs
    const filters = {
        category: document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all',
        impact: document.getElementById('impact-select')?.value || 'all',
        sentiment: document.getElementById('sentiment-select')?.value || 'all',
        country: document.getElementById('country-select')?.value || 'all'
    };
    
    // Mettre à jour le filtre spécifique
    if (filters.hasOwnProperty(filterType)) {
        filters[filterType] = filterValue;
    }
    
    let visibleCount = 0;
    
    // Appliquer les filtres avec classes Tailwind
    newsItems.forEach(item => {
        const itemData = {
            category: item.getAttribute('data-category'),
            impact: item.getAttribute('data-impact'),
            sentiment: item.getAttribute('data-sentiment'),
            country: item.getAttribute('data-country')
        };
        
        // Vérifier si l'élément correspond à tous les filtres actifs
        const matches = Object.entries(filters).every(([key, value]) => {
            return value === 'all' || itemData[key] === value;
        });
        
        // Afficher ou masquer avec classes Tailwind
        if (matches) {
            item.classList.remove('hidden');
            item.classList.add('block');
            visibleCount++;
        } else {
            item.classList.add('hidden');
            item.classList.remove('block');
        }
    });
    
    console.log(`📊 ${visibleCount} actualités visibles après filtrage`);
    
    // Vérifier s'il y a des éléments visibles après le filtrage
    checkVisibleItems();
}

/**
 * Vérifie s'il y a des éléments d'actualité visibles après le filtrage
 */
function checkVisibleItems() {
    const containers = [
        { id: 'recent-news', selector: '.news-grid' },
        { id: 'important-news-container', selector: '' },
        { id: 'critical-news-container', selector: '' }
    ];
    
    containers.forEach(({ id, selector }) => {
        const container = document.getElementById(id);
        if (!container) return;
        
        const gridContainer = selector ? container.querySelector(selector) || container : container;
        const visibleItems = gridContainer.querySelectorAll('.news-card:not(.hidden)');
        
        // Supprimer l'ancien message s'il existe
        const existingMessage = gridContainer.querySelector('.no-data-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Si aucun élément n'est visible, afficher un message
        if (visibleItems.length === 0) {
            const noItemsMessage = document.createElement('div');
            noItemsMessage.className = 'no-data-message';
            noItemsMessage.innerHTML = `
                <i class="fas fa-filter text-zinc-600 text-4xl mb-4"></i>
                <h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3>
                <p class="text-zinc-400">Veuillez modifier vos filtres pour voir plus d'actualités.</p>
            `;
            
            gridContainer.appendChild(noItemsMessage);
        }
    });
}