/**
 * ml-feedback.js - Système de feedback ML avec intégration immédiate
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
        this.API_ENDPOINT = 'https://stock-analysis-platform-q9tc.onrender.com/api/ml/feedback';
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
        
        // MODIFICATION PRINCIPALE: Envoi immédiat au serveur
        try {
            // Affichage d'un indicateur de chargement
            const saveButton = document.getElementById('ml-feedback-save');
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
            saveButton.disabled = true;
            
            // Envoi direct au serveur
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([feedback]) // Format attendu par l'API
            });
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            console.log('✅ Feedback envoyé et intégré immédiatement');
            
            // Mise à jour visuelle
            newsCard.dataset.importance = newImportance;
            newsCard.dataset.impact = newImpact;
            newsCard.classList.add('classification-updated');
            setTimeout(() => {
                newsCard.classList.remove('classification-updated');
            }, 2000);
            
            // Afficher confirmation
            this.showFeedbackSuccess(true);
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi du feedback:', error);
            
            // Stockage en local comme fallback
            this.storeLocalFeedback(feedback);
            this.showFeedbackSuccess(false);
        }
        
        // Fermer la modal
        this.closeFeedbackModal();
    }
    
    // Méthode de fallback pour stocker localement si l'API échoue
    storeLocalFeedback(feedback) {
        try {
            let feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
            feedbacks.push(feedback);
            localStorage.setItem('tradepulse_ml_feedbacks', JSON.stringify(feedbacks));
            console.log('⚠️ Feedback stocké localement (l\'API a échoué)');
        } catch (error) {
            console.error('❌ Erreur lors du stockage local:', error);
        }
    }
    
    showFeedbackSuccess(immediate) {
        const notification = document.createElement('div');
        notification.className = 'ml-suggestion-badge';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.animation = 'none';
        
        if (immediate) {
            notification.innerHTML = '<i class="fas fa-check-circle"></i> Feedback intégré immédiatement!';
        } else {
            notification.innerHTML = '<i class="fas fa-info-circle"></i> Feedback stocké localement';
        }
        
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