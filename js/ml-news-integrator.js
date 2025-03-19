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
    document.querySelectorAll('.feedback-button, .edit-classification-button').forEach(btn => btn.remove());
    
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
        
        // Créer le bouton de modification (NOUVELLE FONCTIONNALITÉ)
        const editButton = document.createElement('button');
        editButton.className = 'edit-classification-button ripple button-press';
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.setAttribute('title', 'Modifier la classification');
        editButton.setAttribute('aria-label', 'Modifier la classification');
        
        // Ajouter les données pour le feedback
        feedbackButton.setAttribute('data-title', title);
        feedbackButton.setAttribute('data-content', content);
        
        // Trouver le bon emplacement pour les boutons - stratégie plus robuste
        let inserted = false;
        
        // Stratégie 1: Chercher un header ou une div avec des indicateurs d'impact
        const header = card.querySelector('.mb-2, div:first-child, .impact-indicator')?.parentNode;
        if (header) {
            header.appendChild(feedbackButton);
            header.appendChild(editButton); // Ajouter le bouton d'édition
            inserted = true;
            console.log(`Boutons ML ajoutés au header pour l'actualité: ${title.substring(0, 30)}...`);
        }
        
        // Stratégie 2: Chercher news-content ou une div avec padding
        if (!inserted) {
            const newsContent = card.querySelector('.news-content, .p-4');
            if (newsContent) {
                newsContent.insertBefore(editButton, newsContent.firstChild); // Ajouter le bouton d'édition
                newsContent.insertBefore(feedbackButton, newsContent.firstChild);
                inserted = true;
                console.log(`Boutons ML ajoutés au contenu pour l'actualité: ${title.substring(0, 30)}...`);
            }
        }
        
        // Stratégie 3: Dernier recours, ajouter au début de la carte
        if (!inserted) {
            card.insertBefore(editButton, card.firstChild); // Ajouter le bouton d'édition
            card.insertBefore(feedbackButton, card.firstChild);
            console.log(`Boutons ML ajoutés directement à la carte pour l'actualité: ${title.substring(0, 30)}...`);
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
        
        // Ajouter un gestionnaire d'événements pour ouvrir l'éditeur de classification
        editButton.addEventListener('click', function(event) {
            event.stopPropagation();
            openClassificationEditor(newsId, card);
        });
    });
    
    console.log('✅ Boutons de feedback ML ajoutés à toutes les cartes d\'actualités');
}

/**
 * Ouvre l'interface de modification de classification pour une actualité
 * @param {string} newsId - ID de l'actualité
 * @param {HTMLElement} card - Élément DOM de la carte d'actualité
 */
function openClassificationEditor(newsId, card) {
    // Récupérer les valeurs actuelles
    const currentCategory = card.getAttribute('data-category') || 'general';
    const currentSentiment = card.getAttribute('data-sentiment') || card.getAttribute('data-impact') || 'neutral';
    
    // Créer le modal de modification
    const modal = document.createElement('div');
    modal.className = 'classification-editor-modal';
    modal.innerHTML = `
        <div class="classification-editor-content">
            <h3>Modifier la classification</h3>
            <p>Article: "${card.querySelector('h3').textContent.substring(0, 40)}..."</p>
            
            <div class="editor-form">
                <div class="form-group">
                    <label>Catégorie:</label>
                    <select id="edit-category" class="editor-select">
                        <option value="critical" ${currentCategory === 'critical' ? 'selected' : ''}>Critique</option>
                        <option value="important" ${currentCategory === 'important' ? 'selected' : ''}>Importante</option>
                        <option value="general" ${currentCategory === 'general' ? 'selected' : ''}>Générale</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Sentiment:</label>
                    <select id="edit-sentiment" class="editor-select">
                        <option value="positive" ${currentSentiment === 'positive' ? 'selected' : ''}>Positif</option>
                        <option value="neutral" ${currentSentiment === 'neutral' ? 'selected' : ''}>Neutre</option>
                        <option value="negative" ${currentSentiment === 'negative' ? 'selected' : ''}>Négatif</option>
                    </select>
                </div>
                
                <div class="button-group">
                    <button id="cancel-edit" class="editor-btn cancel">Annuler</button>
                    <button id="save-edit" class="editor-btn save">Enregistrer</button>
                </div>
            </div>
        </div>
    `;
    
    // Ajouter le modal à la page
    document.body.appendChild(modal);
    
    // Gestionnaires d'événements
    document.getElementById('cancel-edit').addEventListener('click', () => {
        modal.remove();
    });
    
    document.getElementById('save-edit').addEventListener('click', () => {
        // Récupérer les nouvelles valeurs
        const newCategory = document.getElementById('edit-category').value;
        const newSentiment = document.getElementById('edit-sentiment').value;
        
        // Mettre à jour les attributs de la carte
        card.setAttribute('data-category', newCategory);
        card.setAttribute('data-sentiment', newSentiment);
        card.setAttribute('data-impact', newSentiment); // Pour compatibilité avec le code existant
        
        // Mettre à jour l'affichage
        if (window.NewsSystem && window.NewsSystem.updateNewsClassificationUI) {
            window.NewsSystem.updateNewsClassificationUI(newsId, {
                category: newCategory,
                sentiment: newSentiment,
                impact: newSentiment // Pour compatibilité
            });
        } else {
            // Fallback si la fonction de mise à jour n'est pas disponible
            updateCardClassification(card, newCategory, newSentiment);
        }
        
        // Sauvegarder le feedback
        saveClassificationFeedback(newsId, {
            category: newCategory,
            sentiment: newSentiment
        });
        
        // Fermer le modal
        modal.remove();
    });
}

/**
 * Met à jour l'affichage d'une carte après modification de sa classification
 * (Fallback si window.NewsSystem.updateNewsClassificationUI n'est pas disponible)
 */
function updateCardClassification(card, category, sentiment) {
    // Mettre à jour l'indicateur de catégorie
    const categoryEl = card.querySelector('.impact-indicator:nth-child(2)');
    if (categoryEl) {
        categoryEl.textContent = category.toUpperCase();
    }
    
    // Mettre à jour l'indicateur de sentiment
    const impactEl = card.querySelector('.impact-indicator:first-child');
    if (impactEl) {
        const sentimentText = getSentimentText(sentiment);
        impactEl.textContent = sentimentText;
        
        // Mettre à jour la classe d'impact
        impactEl.className = `impact-indicator impact-${sentiment}`;
    }
    
    // Mettre à jour l'indicateur de sentiment ML
    const sentimentEl = card.querySelector('.sentiment-indicator');
    if (sentimentEl) {
        const sentimentText = getSentimentText(sentiment);
        
        // Extraire les éléments enfants pour préserver le badge de confiance
        const confidenceBadge = sentimentEl.querySelector('.confidence-badge');
        const scoreDisplay = sentimentEl.querySelector('.ml-score-badge');
        const mlIndicator = sentimentEl.querySelector('.ml-indicator');
        
        // Mettre à jour le contenu et la classe
        sentimentEl.textContent = sentimentText + ' ';
        sentimentEl.className = `sentiment-indicator sentiment-${sentiment}`;
        
        // Réinsérer les éléments enfants
        if (confidenceBadge) sentimentEl.appendChild(confidenceBadge);
        if (scoreDisplay) sentimentEl.appendChild(scoreDisplay);
        if (mlIndicator) sentimentEl.appendChild(mlIndicator);
    }
    
    // Ajouter une animation pour indiquer le changement
    card.classList.add('classification-updated');
    setTimeout(() => {
        card.classList.remove('classification-updated');
    }, 1000);
}

/**
 * Envoie le feedback de classification au serveur
 */
function saveClassificationFeedback(newsId, classification) {
    // Sauvegarder en local storage pour la persistance
    const feedbackData = JSON.parse(localStorage.getItem('ml_classification_feedback') || '{}');
    feedbackData[newsId] = {
        ...classification,
        timestamp: Date.now()
    };
    localStorage.setItem('ml_classification_feedback', JSON.stringify(feedbackData));
    
    // Mettre un flag pour indiquer que des feedbacks sont en attente de synchronisation
    localStorage.setItem('ml_feedback_pending_sync', 'true');
    
    // Si une API est disponible, envoyer également au serveur
    if (window.mlFeedback && window.mlFeedback.sendFeedback) {
        window.mlFeedback.sendFeedback(newsId, 'classification', classification);
    }
    
    console.log('Feedback de classification sauvegardé:', newsId, classification);
}

/**
 * Fonctions utilitaires pour les textes
 */
function getSentimentText(sentiment) {
    return sentiment === 'positive' ? 'SENTIMENT POSITIF' : 
           sentiment === 'negative' ? 'SENTIMENT NÉGATIF' : 
           'SENTIMENT NEUTRE';
}

// Exporter la fonction pour une utilisation externe
window.MLNewsIntegrator = {
    initMLFeedback: initMLFeedback,
    openClassificationEditor: openClassificationEditor
};
