/**
 * news-updates.js
 * Système de mises à jour en temps réel des classifications d'actualités
 */

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que le namespace global NewsSystem existe
    if (!window.NewsSystem) {
        window.NewsSystem = {};
    }
    
    // Ajouter les fonctions de mise à jour au namespace global
    window.NewsSystem.updateNewsClassificationUI = updateNewsClassificationUI;
    window.NewsSystem.applyCurrentFilters = applyCurrentFilters;
    
    console.log('Système de mises à jour des actualités initialisé');
});

/**
 * Met à jour visuellement une actualité après modification de sa classification
 * @param {string} newsId - ID de l'actualité modifiée
 * @param {Object} newClassification - Nouvelles valeurs de classification
 */
function updateNewsClassificationUI(newsId, newClassification) {
    // Trouver toutes les cartes avec cet ID (peut y en avoir plusieurs en cas de duplication)
    const cards = document.querySelectorAll(`[data-news-id="${newsId}"]`);
    
    if (cards.length === 0) {
        console.warn(`Actualité ${newsId} non trouvée dans le DOM`);
        return false;
    }
    
    console.log(`Mise à jour de la classification pour ${newsId}:`, newClassification);
    
    // Mettre à jour chaque carte
    cards.forEach(card => {
        // Mettre à jour les attributs de données
        if (newClassification.category) {
            card.setAttribute('data-category', newClassification.category);
        }
        
        if (newClassification.impact) {
            card.setAttribute('data-impact', newClassification.impact);
        }
        
        if (newClassification.sentiment) {
            card.setAttribute('data-sentiment', newClassification.sentiment);
        }
        
        // Mettre à jour visuellement les éléments
        
        // 1. Mise à jour de la catégorie
        if (newClassification.category) {
            const categoryEl = card.querySelector('.impact-indicator:nth-child(2)');
            if (categoryEl) {
                categoryEl.textContent = newClassification.category.toUpperCase();
            }
        }
        
        // 2. Mise à jour de l'impact
        if (newClassification.impact) {
            const impactEl = card.querySelector('.impact-indicator:first-child');
            if (impactEl) {
                // Mettre à jour le texte
                const impactText = getImpactText(newClassification.impact);
                impactEl.textContent = impactText;
                
                // Mettre à jour les classes CSS
                impactEl.className = `impact-indicator impact-${newClassification.impact}`;
            }
        }
        
        // 3. Mise à jour du sentiment
        if (newClassification.sentiment) {
            const sentimentEl = card.querySelector('.sentiment-indicator');
            if (sentimentEl) {
                // Conserver les éléments existants
                const confidenceBadge = sentimentEl.querySelector('.confidence-badge');
                const mlIndicator = sentimentEl.querySelector('.ml-indicator');
                
                // Mettre à jour le texte et la classe
                const sentimentText = getSentimentText(newClassification.sentiment);
                sentimentEl.textContent = sentimentText + ' ';
                sentimentEl.className = `sentiment-indicator sentiment-${newClassification.sentiment}`;
                
                // Réinsérer les éléments
                if (confidenceBadge) sentimentEl.appendChild(confidenceBadge);
                if (mlIndicator) sentimentEl.appendChild(mlIndicator);
            }
        }
        
        // 4. Ajouter une animation pour indiquer le changement
        card.classList.add('classification-updated');
        setTimeout(() => {
            card.classList.remove('classification-updated');
        }, 1500);
    });
    
    // Appliquer les filtres actuels pour masquer/afficher les cartes selon les nouveaux critères
    applyCurrentFilters();
    
    // Afficher une notification temporaire
    showUpdateNotification('Classification mise à jour avec succès');
    
    return true;
}

/**
 * Applique les filtres actuels aux actualités
 */
function applyCurrentFilters() {
    // Récupérer les filtres actifs
    const activeCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
    const activeImpact = document.getElementById('impact-select')?.value || 'all';
    const activeSentiment = document.getElementById('sentiment-select')?.value || 'all';
    const activeCountry = document.getElementById('country-select')?.value || 'all';
    
    console.log('Application des filtres actuels:', {
        category: activeCategory,
        impact: activeImpact,
        sentiment: activeSentiment,
        country: activeCountry
    });
    
    // Utiliser la fonction de filtrage existante si disponible
    if (typeof window.NewsSystem.filterNews === 'function') {
        // Appliquer les filtres avec la catégorie active
        window.NewsSystem.filterNews('category', activeCategory);
    } else {
        // Filtrage manuel si la fonction n'est pas disponible
        filterNewsItems(activeCategory, activeImpact, activeSentiment, activeCountry);
    }
}

/**
 * Filtre manuel des actualités (fallback)
 */
function filterNewsItems(category, impact, sentiment, country) {
    const newsItems = document.querySelectorAll('.news-card');
    
    newsItems.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const itemImpact = item.getAttribute('data-impact');
        const itemSentiment = item.getAttribute('data-sentiment');
        const itemCountry = item.getAttribute('data-country');
        
        const matchesCategory = category === 'all' || itemCategory === category;
        const matchesImpact = impact === 'all' || itemImpact === impact;
        const matchesSentiment = sentiment === 'all' || itemSentiment === sentiment;
        const matchesCountry = country === 'all' || itemCountry === country;
        
        if (matchesCategory && matchesImpact && matchesSentiment && matchesCountry) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Affiche une notification temporaire
 * @param {string} message - Message à afficher
 */
function showUpdateNotification(message) {
    // Vérifier si une notification existe déjà
    let notification = document.getElementById('update-notification');
    
    if (!notification) {
        // Créer un nouvel élément de notification
        notification = document.createElement('div');
        notification.id = 'update-notification';
        notification.className = 'update-notification';
        document.body.appendChild(notification);
    }
    
    // Mettre à jour le contenu
    notification.textContent = message;
    
    // Afficher la notification
    notification.classList.add('visible');
    
    // Masquer après un délai
    setTimeout(() => {
        notification.classList.remove('visible');
    }, 3000);
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
