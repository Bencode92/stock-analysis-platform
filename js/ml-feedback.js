/**
 * ml-feedback.js - Système de feedback ML avec commit direct vers GitHub
 * Ce système envoie directement les feedbacks vers GitHub via l'API
 * pour déclencher automatiquement le réentraînement du modèle
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
        // Configuration GitHub
        this.GITHUB_REPO = 'Bencode92/stock-analysis-platform';
        this.GITHUB_API = 'https://stock-analysis-platform-q9tc.onrender.com/api/ml/github-feedback';
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
        
        // Modifier visuellement le bouton pour montrer que l'envoi est en cours
        const saveButton = document.getElementById('ml-feedback-save');
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
        saveButton.disabled = true;
        
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
        
        // ENVOI DIRECT À GITHUB via le service proxy
        try {
            // Générer un nom de fichier unique pour GitHub
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `ml_feedback_${timestamp}.json`;
            
            // Envoi via l'API du service proxy qui commit directement sur GitHub
            const response = await fetch(this.GITHUB_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repo: this.GITHUB_REPO,
                    path: `data/${filename}`,
                    content: JSON.stringify([feedback], null, 2),
                    message: `Feedback utilisateur sur classification d'actualité: ${title.substring(0, 50)}`
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            // Mise à jour visuelle
            newsCard.dataset.importance = newImportance;
            newsCard.dataset.impact = newImpact;
            newsCard.classList.add('classification-updated');
            setTimeout(() => {
                newsCard.classList.remove('classification-updated');
            }, 2000);
            
            // Afficher confirmation de succès
            this.showFeedbackSuccess(true);
            
            console.log(`✅ Feedback envoyé directement à GitHub: ${filename}`);
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi du feedback:', error);
            
            // Stockage en local comme fallback
            this.storeLocalFeedback(feedback);
            
            // Afficher message d'erreur
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
            console.log('⚠️ Feedback stocké localement (API GitHub échouée)');
            
            // Si nous avons au moins 3 feedbacks locaux, afficher notification
            if (feedbacks.length >= 3) {
                this.showLocalBackupNotification(feedbacks.length);
            }
        } catch (error) {
            console.error('❌ Erreur lors du stockage local:', error);
        }
    }
    
    // Affiche une notification pour les feedbacks locaux
    showLocalBackupNotification(count) {
        const notification = document.createElement('div');
        notification.className = 'ml-backup-notification';
        notification.innerHTML = `
            <div class="ml-backup-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${count} feedbacks enregistrés localement</span>
                <button class="ml-backup-button">Exporter</button>
            </div>
        `;
        
        // Style de la notification
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.left = '20px';
        notification.style.zIndex = '1000';
        notification.style.backgroundColor = 'rgba(0, 22, 39, 0.9)';
        notification.style.border = '1px solid rgba(255, 193, 7, 0.5)';
        notification.style.borderRadius = '8px';
        notification.style.padding = '12px 16px';
        notification.style.boxShadow = '0 0 20px rgba(255, 193, 7, 0.2)';
        
        // Ajouter l'événement au bouton d'export
        const exportButton = notification.querySelector('.ml-backup-button');
        exportButton.addEventListener('click', () => {
            this.exportLocalFeedbacks();
            notification.remove();
        });
        
        // Ajouter au DOM
        document.body.appendChild(notification);
    }
    
    // Exporte les feedbacks stockés localement
    exportLocalFeedbacks() {
        const feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
        if (feedbacks.length === 0) return;
        
        // Créer le blob JSON
        const blob = new Blob([JSON.stringify(feedbacks, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        
        // Télécharger le fichier
        const a = document.createElement('a');
        a.href = url;
        a.download = `ml_feedback_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Demander si l'utilisateur veut effacer les feedbacks locaux
        if (confirm('Feedbacks exportés avec succès! Souhaitez-vous les effacer de votre navigateur?')) {
            localStorage.removeItem('tradepulse_ml_feedbacks');
        }
    }
    
    showFeedbackSuccess(success) {
        const notification = document.createElement('div');
        notification.className = 'ml-suggestion-badge';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.animation = 'none';
        
        if (success) {
            notification.innerHTML = `
                <i class="fas fa-check-circle"></i> 
                Feedback enregistré directement sur GitHub!
            `;
            notification.style.backgroundColor = 'rgba(0, 255, 135, 0.15)';
            notification.style.borderColor = 'rgba(0, 255, 135, 0.3)';
        } else {
            notification.innerHTML = `
                <i class="fas fa-info-circle"></i> 
                Feedback stocké localement (échec connexion GitHub)
            `;
            notification.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
            notification.style.borderColor = 'rgba(255, 193, 7, 0.3)';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mlFeedbackSystem = new MLFeedbackSystem();
});