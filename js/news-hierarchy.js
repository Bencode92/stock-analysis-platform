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

// NOUVEAU: Limite de récence des actualités (en jours)
const MAX_NEWS_DAYS = 4; // Affiche seulement les actualités des 4 derniers jours

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

    // Attributs de filtrage - AJOUT de data-score AVANT la boucle
    card.setAttribute('data-score', item.importance_score || item.imp || 0);
    
    // CORRECTION: Retirer 'score' de la boucle pour ne pas écraser
    ['category', 'impact', 'sentiment', 'country'].forEach(key => {
        card.setAttribute(`data-${key}`, item[key] || 'unknown');
    });
    
    // Attribut pour identifier la carte
    card.setAttribute('data-news-id', `news-${tier}-${index}`);

    // Gestion du clic pour ouvrir l'URL
    if (item.url) {
        card.setAttribute('data-url', item.url);
        card.classList.add('clickable-news');
        card.addEventListener('click', () => window.open(item.url, '_blank', 'noopener'));
    }

    // 🚀 NOUVEAU : Nettoyer le HTML et créer du texte brut - SUPPORT SNIPPET
    let raw = item.content || item.snippet || '';
    
    // Utiliser DOMParser pour supprimer toutes les balises HTML
    const tmp = new DOMParser().parseFromString(raw, 'text/html');
    let content = (tmp.body.textContent || '').replace(/\s+/g, ' ').trim();
    
    /* Limites adaptées :
       - regular  : 120 car + clamp 3 lignes
       - important: 180 car + clamp 4 lignes
       - critical : 220 car + clamp 4 lignes  */
    const CHAR_LIMIT = { regular: 120, important: 180, critical: 220 }[tier] ?? 160;

    if (content.length > CHAR_LIMIT) {
        content = content.slice(0, CHAR_LIMIT - 1) + '…';
    }

    // Classe line-clamp adaptée selon le tier
    const descClamp = tier === 'regular' ? 'line-clamp-3' : 'line-clamp-4';

    // MODIFICATION : Badge urgent supprimé - plus de badge "URGENT"
    // const urgentBadge = tier === 'critical' ? '<span class="absolute top-2 right-2 badge urgent bg-red-500 text-white text-xs px-2 py-1 rounded animate-pulse">URGENT</span>' : '';

    card.innerHTML = `
        <header class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="badge badge-${item.impact} uppercase text-xs px-2 py-1 rounded font-semibold ${getImpactBadgeClass(item.impact)}">${impactText}</span>
            <span class="chip text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">${item.category?.toUpperCase() || 'GENERAL'}</span>
        </header>

        <h3 class="title text-lg font-bold line-clamp-2 text-white mb-3">${item.title}</h3>

        <p class="desc text-sm text-zinc-300 ${descClamp} flex-grow mb-4"></p>

        <footer class="footer mt-auto flex justify-between items-center text-xs">
            <span class="text-emerald-400 font-medium">${item.source || '—'}</span>
            <div class="flex items-center gap-2">
                <span class="sentiment-icon">${sentimentIcon}</span>
                <span class="date-time text-xs text-zinc-500">${item.date || ''} ${item.time || ''}</span>
                ${item.url ? '<span class="text-zinc-500"><i class="fas fa-external-link-alt"></i></span>' : ''}
            </div>
        </footer>
    `;
    
    // 🎯 CLEF DU FIX : Injecter le texte nettoyé via innerText (pas innerHTML)
    card.querySelector('.desc').innerText = content;
    
    return card;
}

/**
 * Retourne les classes CSS pour les badges d'impact - VERSION AMÉLIORÉE
 */
function getImpactBadgeClass(impact) {
    switch(impact) {
        case 'negative':
            return 'bg-red-800 text-red-200 border border-red-600';
        case 'slightly_negative':
            return 'bg-red-900 text-red-300 border border-red-700';
        case 'positive':
            return 'bg-emerald-800 text-emerald-200 border border-emerald-600';
        case 'slightly_positive':
            return 'bg-emerald-900 text-emerald-300 border border-emerald-700';
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
        case 'slightly_negative':
            return 'red-600';
        case 'positive':
        case 'slightly_positive':
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
        case 'slightly_positive':
            return '⬆️';
        case 'negative':
        case 'slightly_negative':
            return '⬇️';
        default:
            return '➖';
    }
}

/**
 * Distribue les actualités par niveau d'importance - VERSION ML-FIRST v3.0
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

    //------------------------------------------------------------------
    // FILTRE DE RÉCENCE (≤ MAX_NEWS_DAYS)
    //------------------------------------------------------------------
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    function parseNewsDate(str) {
        // vos dates sont au format "DD/MM/YYYY"
        // (on accepte aussi "YYYY-MM-DD" au cas où)
        if (!str) return null;

        if (str.includes('/')) {           // ex. "18/07/2025"
            const [d, m, y] = str.split('/');
            return new Date(`${y}-${m}-${d}T00:00:00`);
        }
        // fallback ISO / autre
        return new Date(str);
    }

    const today = new Date();

    allNews = allNews.filter(n => {
        const d = parseNewsDate(n.date);
        if (!d || isNaN(d)) return false;          // pas de date lisible ⇒ on jette
        const age = (today - d) / MS_PER_DAY;      // écart en jours
        return age <= MAX_NEWS_DAYS;
    });

    console.log(`🕒 ${allNews.length} actus conservées ≤ ${MAX_NEWS_DAYS} jours`);
    //------------------------------------------------------------------

    // 🤖 HIÉRARCHISATION 100% ML - VERSION SIMPLIFIÉE
    allNews.forEach(news => {
        // NOUVEAU MAPPER v5.0 - Adaptation des champs JSON
        if (!news.importance_level) {
            const score = parseFloat(news.imp || news.quality_score || 0);
            news.importance_level = score >= 80 ? 'critical' : 
                                   score >= 60 ? 'important' : 
                                   'general';
        }
        news.importance_score = news.imp || news.quality_score || 0;
        news.content = news.snippet || news.content || '';
        
        // Traduire les catégories EN->FR
        const catMap = {
            'economy': 'economie',
            'markets': 'marches', 
            'companies': 'entreprises',
            'tech': 'tech',
            'crypto': 'crypto',
            'forex': 'forex'
        };
        news.category = catMap[news.category] || news.category || 'general';
        
        // Valeurs par défaut pour les champs nécessaires
        news.impact = news.impact || 'neutral';
        news.sentiment = news.sentiment || news.impact;
        news.country = news.country || 'other';
        
        // 🎯 CONFIANCE TOTALE AU PIPELINE ML
        news.hierarchy = (news.importance_level || '').toLowerCase();   // critical | important | general
        
        // Alias general → normal pour compatibilité interne
        if (news.hierarchy === 'general') {
            news.hierarchy = 'normal';
        }
        
        // Si le label ML manque, fallback sur 'normal'
        if (!['critical', 'important', 'normal'].includes(news.hierarchy)) {
            news.hierarchy = 'normal';
            console.warn('🤖 Article sans label ML, classé en normal:', news.title.substring(0, 60) + '...');
        }
        
        // Log de contrôle pour vérifier la qualité ML
        if (news.importance_level) {
            console.log(`🤖 ML Classification: "${news.title.substring(0, 50)}..." → ${news.hierarchy.toUpperCase()}`);
        }
    });

    // Filtrer les actualités par hiérarchie (déterminée 100% par ML)
    const criticalNews = allNews.filter(news => news.hierarchy === 'critical');
    const importantNews = allNews.filter(news => news.hierarchy === 'important');
    const regularNews = allNews.filter(news => news.hierarchy === 'normal');
    
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

    // 🤖 Logs de qualité ML
    console.log(`🤖 Distribution ML-First finale:`);
    console.log(`  🔴 Critiques (ML): ${criticalNews.length}`);
    console.log(`  🟡 Importantes (ML): ${importantNews.length}`);
    console.log(`  ⚪ Générales (ML): ${regularNews.length}`);
    
    // Statistiques de couverture ML
    const totalWithML = allNews.filter(n => n.importance_level).length;
    const mlCoverage = ((totalWithML / allNews.length) * 100).toFixed(1);
    console.log(`📊 Couverture ML: ${totalWithML}/${allNews.length} articles (${mlCoverage}%)`);
    
    // Debug échantillons par catégorie
    if (criticalNews.length > 0) {
        console.log(`📋 Exemples critiques (ML):`);
        criticalNews.slice(0, 2).forEach((news, i) => {
            console.log(`  ${i+1}. "${news.title.substring(0, 60)}..."`);
        });
    }
    
    if (importantNews.length > 0) {
        console.log(`📋 Exemples importantes (ML):`);
        importantNews.slice(0, 2).forEach((news, i) => {
            console.log(`  ${i+1}. "${news.title.substring(0, 60)}..."`);
        });
    }

    // Afficher dans les sections correspondantes
    displayCriticalNews(criticalNews);
    displayImportantNews(importantNews);
    displayRecentNews(regularNews);

    console.log(`✅ Distribution ML-First terminée: ${criticalNews.length} critiques, ${importantNews.length} importantes, ${regularNews.length} générales`);
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
 * Fonction pour afficher les actualités régulières - VERSION CORRIGÉE GRILLE
 * @param {Array} news - Actualités régulières
 */
function displayRecentNews(news) {
    const container = document.getElementById('recent-news');
    if (!container) {
        console.error("Conteneur d'actualités récentes introuvable");
        return;
    }

    // 🔧 CORRECTIF FINAL: Utiliser les mêmes classes Tailwind que les autres sections
    container.innerHTML = '';
    container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4'; // ← HARMONISATION COMPLETE

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 col-span-full">Aucune actualité récente pour le moment</p>';
        return;
    }

    // Créer les cartes d'actualités générales avec le helper uniforme
    news.slice(0, MAX_REGULAR_NEWS).forEach((item, index) => {
        const impactText = getImpactText(item.impact);
        const impactColor = getImpactBorderColor(item.impact);
        const sentimentIcon = getSentimentIcon(item.sentiment || item.impact);
        
        // Utiliser le même helper que les autres sections
        const newsCard = buildNewsCard(item, impactText, impactColor, sentimentIcon, index, 'regular');
        container.appendChild(newsCard);
    });

    console.log(`✅ ${news.length} actualités générales affichées avec grille harmonisée (grid grid-cols-1 md:grid-cols-2 gap-4)`);
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
 * Fonctions utilitaires pour les textes - VERSION AMÉLIORÉE
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
           sentiment === 'slightly_positive' ? 'SENTIMENT LÉGÈREMENT POSITIF' :
           sentiment === 'negative' ? 'SENTIMENT NÉGATIF' :
           sentiment === 'slightly_negative' ? 'SENTIMENT LÉGÈREMENT NÉGATIF' :
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
        const gridContainer = containerId === 'recent-news' && !container.classList.contains('grid')
            ? container.querySelector('.grid') 
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