/**
 * ml-news-integrator.js
 * Ce script intègre les fonctionnalités de Machine Learning avec l'affichage des actualités
 * Il fait le lien entre notre système de feedback ML et les actualités affichées
 */

document.addEventListener('DOMContentLoaded', function() {
    // Attendre que les actualités soient chargées
    document.addEventListener('newsDataReady', function() {
        console.log('News data ready, integrating ML feedback system');
        initMLFeedback();
    });
    
    // S'il n'y a pas d'événement, essayer d'initialiser après un délai
    setTimeout(function() {
        if (document.querySelectorAll('.news-card').length > 0) {
            console.log('News found after timeout, integrating ML feedback system');
            initMLFeedback();
        }
    }, 2000);
});

/**
 * Initialise le système de feedback ML pour les actualités
 */
function initMLFeedback() {
    // Sélectionner toutes les cartes d'actualités
    const newsCards = document.querySelectorAll('.news-card');
    if (newsCards.length === 0) {
        console.warn('No news cards found for ML feedback integration');
        return;
    }
    
    console.log(`Found ${newsCards.length} news cards to integrate with ML feedback`);
    
    // Ajouter le bouton de feedback à chaque carte d'actualité
    newsCards.forEach((card, index) => {
        // Générer un ID unique pour l'actualité si elle n'en a pas
        const newsId = card.getAttribute('data-news-id') || `news-${index}-${Date.now()}`;
        card.setAttribute('data-news-id', newsId);
        
        // Ajouter l'attribut de sentiment pour le système de feedback
        const impact = card.getAttribute('data-impact') || 'neutral';
        card.setAttribute('data-sentiment', impact);
        
        // Récupérer le titre et le contenu
        const title = card.querySelector('h3')?.textContent || '';
        
        // Créer le bouton de feedback
        const feedbackButton = document.createElement('button');
        feedbackButton.className = 'feedback-button ripple button-press';
        feedbackButton.innerHTML = '<i class="fas fa-flag"></i>';
        feedbackButton.setAttribute('title', 'Signaler une classification incorrecte');
        feedbackButton.setAttribute('aria-label', 'Signaler une classification incorrecte');
        
        // Trouver le bon emplacement pour le bouton selon la structure de la carte
        const newsContent = card.querySelector('.news-content') || card.querySelector('.p-4');
        if (newsContent) {
            // Ajouter à la première div d'en-tête si possible
            const header = newsContent.querySelector('div');
            if (header) {
                header.appendChild(feedbackButton);
            } else {
                // Sinon, ajouter directement dans le contenu
                newsContent.insertBefore(feedbackButton, newsContent.firstChild);
            }
        } else {
            // Dernier recours, ajouter directement à la carte
            card.appendChild(feedbackButton);
        }
    });
    
    console.log('ML feedback buttons added to all news cards');
}

// Exporter la fonction pour une utilisation externe
window.MLNewsIntegrator = {
    initMLFeedback: initMLFeedback
};
