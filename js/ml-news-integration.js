/**
 * ml-news-integration.js
 * Module d'intégration des fonctionnalités ML pour les actualités financières
 */

// Étendre le namespace global NewsSystem
window.NewsSystem = window.NewsSystem || {};

// Initialiser le module ML après le chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initialisation du système ML pour les actualités');
    initializeMLIntegration();
    
    // Écouter l'événement qui indique que les données sont prêtes
    document.addEventListener('newsDataReady', handleNewsWithML);
});

/**
 * Initialise l'intégration ML pour les actualités
 */
function initializeMLIntegration() {
    // Ajouter l'écouteur d'événement pour le filtre de sentiment
    const sentimentSelect = document.getElementById('sentiment-select');
    if (sentimentSelect) {
        sentimentSelect.addEventListener('change', function() {
            window.NewsSystem.filterNews('sentiment', this.value);
        });
    }
    
    // Étendre la fonction filterNews originale pour inclure le filtre par sentiment
    const originalFilterNews = window.NewsSystem.filterNews;
    window.NewsSystem.filterNews = function(filterType, filterValue) {
        const newsItems = document.querySelectorAll('.news-card');
        
        // Obtenir les autres filtres actifs
        const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
        const activeImpact = document.getElementById('impact-select')?.value || 'all';
        const activeCountry = document.getElementById('country-select')?.value || 'all';
        const activeSentiment = document.getElementById('sentiment-select')?.value || 'all';
        
        // Mettre à jour les filtres actifs en fonction du type actuel
        let currentCategory = activeCategory;
        let currentImpact = activeImpact;
        let currentCountry = activeCountry;
        let currentSentiment = activeSentiment;
        
        if (filterType === 'category') currentCategory = filterValue;
        if (filterType === 'impact') currentImpact = filterValue;
        if (filterType === 'country') currentCountry = filterValue;
        if (filterType === 'sentiment') currentSentiment = filterValue;
        
        // Appliquer les filtres à chaque élément d'actualité
        newsItems.forEach(item => {
            const itemCategory = item.getAttribute('data-category');
            const itemImpact = item.getAttribute('data-impact');
            const itemCountry = item.getAttribute('data-country');
            const itemSentiment = item.getAttribute('data-sentiment') || item.getAttribute('data-impact'); // Fallback sur impact si sentiment non disponible
            
            // Vérifier si l'élément correspond à tous les filtres actifs
            const matchesCategory = currentCategory === 'all' || itemCategory === currentCategory;
            const matchesImpact = currentImpact === 'all' || itemImpact === currentImpact;
            const matchesCountry = currentCountry === 'all' || itemCountry === currentCountry;
            const matchesSentiment = currentSentiment === 'all' || itemSentiment === currentSentiment;
            
            // Afficher ou masquer l'élément en fonction des filtres
            if (matchesCategory && matchesImpact && matchesCountry && matchesSentiment) {
                item.classList.remove('hidden-item');
                item.classList.add('fade-in');
            } else {
                item.classList.add('hidden-item');
                item.classList.remove('fade-in');
            }
        });
        
        // Vérifier s'il y a des éléments visibles après le filtrage
        window.NewsSystem.checkVisibleItems();
    };
    
    // Exposer la fonction pour vérifier les éléments visibles
    window.NewsSystem.checkVisibleItems = checkVisibleItems;
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

/**
 * Traite les actualités avec les informations ML
 */
function handleNewsWithML() {
    if (!window.NewsSystem || !window.NewsSystem.data) {
        console.error("Les données d'actualités ne sont pas disponibles");
        return;
    }
    
    // Remplacer les fonctions de création de cartes d'actualités
    extendDisplayFunctions();
}

/**
 * Étend les fonctions d'affichage pour inclure les éléments ML
 */
function extendDisplayFunctions() {
    // Sauvegarder les fonctions originales
    const originalDisplayCritical = window.NewsSystem.displayCriticalNews || window.displayCriticalNews;
    const originalDisplayImportant = window.NewsSystem.displayImportantNews || window.displayImportantNews;
    const originalDisplayRecent = window.NewsSystem.displayRecentNews || window.displayRecentNews;
    
    // Remplacer la fonction pour les actualités critiques
    window.displayCriticalNews = function(news) {
        if (typeof originalDisplayCritical === 'function') {
            originalDisplayCritical(news);
            
            // Ajouter les badges de sentiment ML
            addMLBadgesToNews('critical-news-container');
        }
    };
    
    // Remplacer la fonction pour les actualités importantes
    window.displayImportantNews = function(news) {
        if (typeof originalDisplayImportant === 'function') {
            originalDisplayImportant(news);
            
            // Ajouter les badges de sentiment ML
            addMLBadgesToNews('important-news-container');
        }
    };
    
    // Remplacer la fonction pour les actualités récentes
    window.displayRecentNews = function(news) {
        if (typeof originalDisplayRecent === 'function') {
            originalDisplayRecent(news);
            
            // Ajouter les badges de sentiment ML
            addMLBadgesToNews('recent-news');
        }
    };
    
    // Exposer les fonctions dans le namespace global
    window.NewsSystem.displayCriticalNews = window.displayCriticalNews;
    window.NewsSystem.displayImportantNews = window.displayImportantNews;
    window.NewsSystem.displayRecentNews = window.displayRecentNews;
}

/**
 * Ajoute les badges de sentiment ML aux actualités
 * @param {string} containerId - ID du conteneur d'actualités
 */
function addMLBadgesToNews(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const newsCards = container.querySelectorAll('.news-card');
    
    newsCards.forEach(card => {
        const impactIndicators = card.querySelector('.impact-indicator');
        if (!impactIndicators) return;
        
        // Récupérer les informations depuis les données de l'actualité
        const newsItem = findNewsItemByTitle(card.querySelector('h3').textContent);
        if (!newsItem) return;
        
        // Créer un badge de sentiment ML
        addMLBadgeToCard(card, newsItem);
        
        // Ajouter l'attribut data-sentiment pour le filtrage
        const sentiment = newsItem.sentiment || newsItem.impact;
        card.setAttribute('data-sentiment', sentiment);
        
        // Ajouter un indicateur de confiance si disponible
        if (newsItem.confidence) {
            addConfidenceMeterToCard(card, newsItem);
        }
    });
}

/**
 * Trouve un élément d'actualité par son titre
 * @param {string} title - Titre de l'actualité
 * @returns {Object|null} - Élément d'actualité ou null si non trouvé
 */
function findNewsItemByTitle(title) {
    if (!window.NewsSystem || !window.NewsSystem.data) return null;
    
    const data = window.NewsSystem.data;
    const allNews = [...(data.us || []), ...(data.france || [])];
    
    return allNews.find(item => item.title === title);
}

/**
 * Ajoute un badge de sentiment ML à une carte d'actualité
 * @param {HTMLElement} card - Élément de carte d'actualité
 * @param {Object} newsItem - Données de l'actualité
 */
function addMLBadgeToCard(card, newsItem) {
    // Utiliser le sentiment ML ou l'impact comme fallback
    const sentiment = newsItem.sentiment || newsItem.impact || 'neutral';
    const confidence = newsItem.confidence || 0.5;
    
    // Icône en fonction du sentiment
    let icon = sentiment === 'positive' ? 'fas fa-arrow-trend-up' : 
               sentiment === 'negative' ? 'fas fa-arrow-trend-down' : 
               'fas fa-minus';
    
    // Créer le badge
    const badge = document.createElement('div');
    badge.className = `sentiment-badge ${sentiment}`;
    
    // Ajouter la classe high-confidence si la confiance est élevée
    if (confidence > 0.85) {
        badge.classList.add('high-confidence');
    }
    
    badge.innerHTML = `
        <i class="${icon}"></i>
        <span>${Math.round(confidence * 100)}%</span>
    `;
    
    // Trouver le meilleur endroit pour insérer le badge
    const impactIndicator = card.querySelector('.impact-indicator');
    if (impactIndicator && impactIndicator.parentNode) {
        impactIndicator.parentNode.appendChild(badge);
    } else {
        // Fallback si l'élément parent n'est pas trouvé
        const contentDiv = card.querySelector('.news-content') || card.querySelector('p');
        if (contentDiv) {
            contentDiv.appendChild(badge);
        }
    }
}

/**
 * Ajoute un indicateur de confiance à une carte d'actualité
 * @param {HTMLElement} card - Élément de carte d'actualité
 * @param {Object} newsItem - Données de l'actualité
 */
function addConfidenceMeterToCard(card, newsItem) {
    const confidence = newsItem.confidence || 0.5;
    const sentiment = newsItem.sentiment || newsItem.impact || 'neutral';
    
    // Déterminer la couleur en fonction du sentiment
    const confidenceColor = sentiment === 'positive' ? '#34D399' : 
                            sentiment === 'negative' ? '#F87171' : 
                            '#9CA3AF';
    
    // Créer l'indicateur de confiance
    const meter = document.createElement('div');
    meter.className = 'confidence-meter';
    meter.style.setProperty('--confidence', `${confidence * 100}%`);
    meter.style.setProperty('--confidence-color', confidenceColor);
    
    // Trouver le meilleur endroit pour insérer l'indicateur
    const contentDiv = card.querySelector('.news-content') || card.querySelector('p');
    if (contentDiv) {
        contentDiv.appendChild(meter);
    }
}

// Exposer les fonctions nécessaires pour l'interopérabilité
window.NewsSystem.handleNewsWithML = handleNewsWithML;
window.NewsSystem.addMLBadgesToNews = addMLBadgesToNews;