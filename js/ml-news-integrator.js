/**
 * ml-news-integrator.js
 * Ce script intègre les fonctionnalités de Machine Learning avec l'affichage des actualités
 * Il fait le lien entre notre système de feedback ML et les actualités affichées
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('ML News Integrator: Initialisation...');
    
    // Méthode 1: Attendre l'événement newsDataReady
    document.addEventListener('newsDataReady', function() {
        console.log('Événement newsDataReady détecté, initialisation du système de feedback ML');
        initMLFeedback();
    });
    
    // Méthode 2: Vérifier périodiquement si les actualités sont chargées
    const checkInterval = setInterval(function() {
        // Chercher tous les types possibles de cartes d'actualités
        const newsCards = document.querySelectorAll('.news-card, .glassmorphism, [data-impact]');
        
        if (newsCards.length > 0) {
            console.log(`Actualités détectées (${newsCards.length}) par intervalle, initialisation du feedback ML`);
            initMLFeedback();
            clearInterval(checkInterval);
        }
    }, 1000);
    
    // Méthode 3: Dernier recours après un délai plus long
    setTimeout(function() {
        console.log('Délai d\'attente maximal atteint, tentative d\'initialisation du feedback ML');
        initMLFeedback();
        clearInterval(checkInterval);
    }, 5000);
});

/**
 * Initialise le système de feedback ML pour les actualités
 */
function initMLFeedback() {
    console.log('Initialisation du système de feedback ML...');
    
    // Sélectionner tous les types possibles de cartes d'actualités
    const newsCards = document.querySelectorAll('.news-card, .glassmorphism, [data-impact]');
    
    if (newsCards.length === 0) {
        console.warn('⚠️ Aucune carte d\'actualité trouvée pour l\'intégration du feedback ML');
        return;
    }
    
    console.log(`✅ ${newsCards.length} cartes d'actualités trouvées pour l'intégration du feedback ML`);
    
    // Supprimer les boutons existants pour éviter les doublons en cas de réinitialisation
    document.querySelectorAll('.feedback-button').forEach(btn => btn.remove());
    
    // Ajouter le bouton de feedback à chaque carte d'actualité
    newsCards.forEach((card, index) => {
        // Générer un ID unique pour l'actualité si elle n'en a pas
        const newsId = card.getAttribute('data-news-id') || `news-${index}-${Date.now()}`;
        card.setAttribute('data-news-id', newsId);
        
        // Ajouter l'attribut de sentiment pour le système de feedback
        // Utiliser impact comme fallback si sentiment n'est pas disponible
        const sentiment = card.getAttribute('data-sentiment') || card.getAttribute('data-impact') || 'neutral';
        card.setAttribute('data-sentiment', sentiment);
        
        // Récupérer le titre et le contenu pour le formulaire de feedback
        const title = card.querySelector('h3')?.textContent || '';
        const content = card.querySelector('p')?.textContent || '';
        
        // Créer le bouton de feedback
        const feedbackButton = document.createElement('button');
        feedbackButton.className = 'feedback-button ripple button-press';
        feedbackButton.innerHTML = '<i class="fas fa-flag"></i>';
        feedbackButton.setAttribute('title', 'Signaler une classification incorrecte');
        feedbackButton.setAttribute('aria-label', 'Signaler une classification incorrecte');
        
        // Ajouter les données pour le feedback
        feedbackButton.setAttribute('data-title', title);
        feedbackButton.setAttribute('data-content', content);
        
        // Trouver le bon emplacement pour le bouton - stratégie plus robuste
        let inserted = false;
        
        // Stratégie 1: Chercher un header ou une div avec des indicateurs d'impact
        const header = card.querySelector('.mb-2, div:first-child, .impact-indicator').parentNode;
        if (header) {
            header.appendChild(feedbackButton);
            inserted = true;
            console.log(`Bouton de feedback ajouté au header pour l'actualité: ${title.substring(0, 30)}...`);
        }
        
        // Stratégie 2: Chercher news-content ou une div avec padding
        if (!inserted) {
            const newsContent = card.querySelector('.news-content, .p-4');
            if (newsContent) {
                newsContent.insertBefore(feedbackButton, newsContent.firstChild);
                inserted = true;
                console.log(`Bouton de feedback ajouté au contenu pour l'actualité: ${title.substring(0, 30)}...`);
            }
        }
        
        // Stratégie 3: Dernier recours, ajouter au début de la carte
        if (!inserted) {
            card.insertBefore(feedbackButton, card.firstChild);
            console.log(`Bouton de feedback ajouté directement à la carte pour l'actualité: ${title.substring(0, 30)}...`);
        }
        
        // Ajouter un gestionnaire d'événements pour ouvrir le modal de feedback
        feedbackButton.addEventListener('click', function(event) {
            event.stopPropagation();
            
            // Vérifier si le modal existe
            if (window.mlFeedback) {
                window.mlFeedback.openFeedbackModal(newsId, title, card);
            } else {
                console.error('Le système de feedback ML n\'est pas initialisé');
                alert('Désolé, le système de feedback n\'est pas disponible pour le moment.');
            }
        });
    });
    
    console.log('✅ Boutons de feedback ML ajoutés à toutes les cartes d\'actualités');
}

// Exporter la fonction pour une utilisation externe
window.MLNewsIntegrator = {
    initMLFeedback: initMLFeedback
};
