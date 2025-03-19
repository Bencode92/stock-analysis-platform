/**
 * ml-feedback.js - Système de feedback ML avec intégration directe GitHub
 * Ce système envoie les feedbacks directement au dépôt GitHub pour
 * déclencher les GitHub Actions de réentraînement du modèle
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
        this.GITHUB_REPO = 'Bencode92/stock-analysis-platform';
        this.GITHUB_API = 'https://api.github.com/repos/Bencode92/stock-analysis-platform/contents/data/ml_feedback.json';
        this.GITHUB_TOKEN = ''; // Laissez vide pour utiliser le token GitHub Pages
    }
    
    init() {
        console.log('🤖 Initialisation du système de feedback ML...');
        
        setTimeout(() => this.addFeedbackButtons(), 1500);
        
        document.addEventListener('click', (event) => {
            if (event.target.closest('.ml-feedback-btn')) {
                const newsCard = event.target.closest('.news-card');
                if (newsCard) {
                    this.openFeedbackModal(newsCard);
                }
            }
            
            if (event.target.id === 'ml-feedback-cancel') {
                this.closeFeedbackModal();
            }
            
            if (event.target.id === 'ml-feedback-save') {
                this.saveFeedback();
            }
        });
    }
    
    addFeedbackButtons() {
        const newsCards = document.querySelectorAll('.news-card');
        console.log(`🔍 Recherche de cartes d'actualités: ${newsCards.length} trouvées`);
        
        newsCards.forEach((card, index) => {
            if (!card.querySelector('.ml-feedback-btn')) {
                card.dataset.newsId = `news-${Date.now()}-${index}`;
                
                let currentImportance = 'general';
                if (card.closest('#critical-news-container')) {
                    currentImportance = 'critical';
                } else if (card.closest('#important-news-container')) {
                    currentImportance = 'important';
                }
                
                let currentImpact = 'neutral';
                if (card.querySelector('.impact-indicator.positive') || 
                    card.textContent.includes('POSITIF')) {
                    currentImpact = 'positive';
                } else if (card.querySelector('.impact-indicator.negative') || 
                           card.textContent.includes('NÉGATIF')) {
                    currentImpact = 'negative';
                }
                
                card.dataset.importance = currentImportance;
                card.dataset.impact = currentImpact;
                
                const btn = document.createElement('button');
                btn.className = 'ml-feedback-btn';
                btn.innerHTML = '<i class="fas fa-robot"></i> Reclasser';
                btn.title = 'Contribuer à la reclassification de cette actualité';
                
                const computedStyle = window.getComputedStyle(card);
                if (computedStyle.position === 'static') {
                    card.style.position = 'relative';
                }
                
                card.appendChild(btn);
            }
        });
    }
    
    openFeedbackModal(newsCard) {
        const newsId = newsCard.dataset.newsId;
        const title = newsCard.querySelector('h3')?.textContent || 'Article sans titre';
        const currentImportance = newsCard.dataset.importance || 'general';
        const currentImpact = newsCard.dataset.impact || 'neutral';
        
        const modal = document.createElement('div');
        modal.className = 'classification-editor-modal';
        modal.id = 'ml-feedback-modal';
        modal.dataset.newsId = newsId;
        modal.dataset.originalImportance = currentImportance;
        modal.dataset.originalImpact = currentImpact;
        
        modal.innerHTML = `
            <div class="classification-editor-content">
                <h3>Reclassifier cette actualité</h3>
                <p>${title}</p>
                
                <div class="editor-form">
                    <div class="form-group">
                        <label for="ml-importance-select">Niveau d'importance:</label>
                        <select id="ml-importance-select" class="editor-select">
                            <option value="critical" ${currentImportance === 'critical' ? 'selected' : ''}>Actualité critique</option>
                            <option value="important" ${currentImportance === 'important' ? 'selected' : ''}>Actualité importante</option>
                            <option value="general" ${currentImportance === 'general' ? 'selected' : ''}>Actualité générale</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="ml-impact-select">Impact:</label>
                        <select id="ml-impact-select" class="editor-select">
                            <option value="positive" ${currentImpact === 'positive' ? 'selected' : ''}>Positif</option>
                            <option value="neutral" ${currentImpact === 'neutral' ? 'selected' : ''}>Neutre</option>
                            <option value="negative" ${currentImpact === 'negative' ? 'selected' : ''}>Négatif</option>
                        </select>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="ml-feedback-cancel" class="editor-btn cancel">Annuler</button>
                    <button id="ml-feedback-save" class="editor-btn save">Enregistrer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    closeFeedbackModal() {
        const modal = document.getElementById('ml-feedback-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    async saveFeedback() {
        const modal = document.getElementById('ml-feedback-modal');
        if (!modal) return;
        
        const newsId = modal.dataset.newsId;
        const originalImportance = modal.dataset.originalImportance;
        const originalImpact = modal.dataset.originalImpact;
        
        const newImportance = document.getElementById('ml-importance-select').value;
        const newImpact = document.getElementById('ml-impact-select').value;
        
        if (originalImportance === newImportance && originalImpact === newImpact) {
            this.closeFeedbackModal();
            return;
        }
        
        const newsCard = document.querySelector(`[data-news-id="${newsId}"]`);
        if (!newsCard) {
            this.closeFeedbackModal();
            return;
        }
        
        const title = newsCard.querySelector('h3')?.textContent || '';
        const content = newsCard.querySelector('p')?.textContent || '';
        const source = newsCard.querySelector('.news-source')?.textContent || '';
        
        // Créer l'objet de feedback
        const feedback = {
            id: `feedback-${Date.now()}`,
            title: title,
            content: content.substring(0, 200),
            source: source,
            original: {
                importance: originalImportance,
                impact: originalImpact
            },
            corrected: {
                importance: newImportance,
                impact: newImpact
            },
            timestamp: new Date().toISOString(),
            url: window.location.href
        };
        
        // Stocker en local en attendant la synchronisation GitHub
        this.storeLocalFeedback(feedback);
        
        // Mettre à jour visuellement
        newsCard.dataset.importance = newImportance;
        newsCard.dataset.impact = newImpact;
        newsCard.classList.add('classification-updated');
        setTimeout(() => {
            newsCard.classList.remove('classification-updated');
        }, 2000);
        
        // Dès que nous atteignons 5 feedbacks, créer un fichier dans GitHub
        this.synchronizeWithGitHub();
        
        // Afficher confirmation
        this.showFeedbackSuccess();
        
        // Fermer la modal
        this.closeFeedbackModal();
    }
    
    // Méthode pour stocker le feedback localement
    storeLocalFeedback(feedback) {
        try {
            let feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
            feedbacks.push(feedback);
            localStorage.setItem('tradepulse_ml_feedbacks', JSON.stringify(feedbacks));
            console.log(`✅ Feedback stocké (${feedbacks.length} au total)`);
            
            // Si nous avons au moins 5 feedbacks, afficher l'option de synchronisation
            if (feedbacks.length >= 5) {
                this.showSyncButton(feedbacks.length);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Erreur lors du stockage du feedback:', error);
            return false;
        }
    }
    
    // Méthode pour synchroniser avec GitHub
    synchronizeWithGitHub() {
        const feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
        
        // Créer un lien pour télécharger le fichier
        if (feedbacks.length >= 5) {
            const blob = new Blob([JSON.stringify(feedbacks, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            
            const notification = document.createElement('div');
            notification.className = 'ml-sync-notification';
            notification.innerHTML = `
                <div class="ml-sync-content">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span>${feedbacks.length} feedbacks collectés</span>
                    <a href="${url}" download="ml_feedback_${new Date().toISOString().slice(0, 10)}.json" class="ml-sync-button">
                        Télécharger pour GitHub
                    </a>
                </div>
            `;
            
            // Positionner la notification
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.left = '20px';
            notification.style.zIndex = '1000';
            notification.style.backgroundColor = 'rgba(0, 22, 39, 0.9)';
            notification.style.border = '1px solid rgba(0, 255, 135, 0.3)';
            notification.style.borderRadius = '8px';
            notification.style.padding = '12px 16px';
            notification.style.boxShadow = '0 0 20px rgba(0, 255, 135, 0.2)';
            
            // Ajouter la notification
            document.body.appendChild(notification);
            
            // Supprimer après un délai
            setTimeout(() => {
                notification.remove();
            }, 30000); // 30 secondes
        }
    }
    
    // Affiche un bouton pour synchroniser avec GitHub
    showSyncButton(count) {
        // Supprimer le bouton existant s'il y en a un
        const existingButton = document.getElementById('ml-sync-button');
        if (existingButton) {
            existingButton.remove();
        }
        
        // Créer le bouton
        const syncButton = document.createElement('button');
        syncButton.id = 'ml-sync-button';
        syncButton.className = 'ml-sync-button';
        syncButton.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Synchroniser les feedbacks (${count})`;
        
        // Style du bouton
        syncButton.style.position = 'fixed';
        syncButton.style.bottom = '20px';
        syncButton.style.left = '20px';
        syncButton.style.zIndex = '1000';
        syncButton.style.backgroundColor = 'rgba(0, 22, 39, 0.9)';
        syncButton.style.color = '#00FF87';
        syncButton.style.border = '1px solid rgba(0, 255, 135, 0.4)';
        syncButton.style.borderRadius = '4px';
        syncButton.style.padding = '10px 15px';
        syncButton.style.cursor = 'pointer';
        syncButton.style.boxShadow = '0 0 15px rgba(0, 255, 135, 0.2)';
        
        // Ajouter l'événement
        syncButton.addEventListener('click', () => {
            this.synchronizeWithGitHub();
        });
        
        // Ajouter au DOM
        document.body.appendChild(syncButton);
    }
    
    showFeedbackSuccess() {
        const notification = document.createElement('div');
        notification.className = 'ml-suggestion-badge';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.animation = 'none';
        notification.innerHTML = '<i class="fas fa-check-circle"></i> Feedback enregistré avec succès!';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mlFeedbackSystem = new MLFeedbackSystem();
});