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
        
        // Tenter de synchroniser les feedbacks en attente au chargement
        this.retryPendingFeedbacks();
        
        // Synchroniser lorsque la connexion est rétablie
        window.addEventListener('online', () => {
            console.log('🌐 Connexion internet rétablie, synchronisation des feedbacks');
            this.retryPendingFeedbacks();
        });
        
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
            
            // Stockage en file d'attente comme fallback
            this.storeLocalFeedback(feedback);
        }
        
        // Fermer la modal
        this.closeFeedbackModal();
    }
    
    // Nouvelle fonction : stocker les feedbacks en attente et réessayer
    storeLocalFeedback(feedback) {
        try {
            // Récupérer la file d'attente existante ou créer une nouvelle
            let pendingFeedbacks = JSON.parse(localStorage.getItem('tradepulse_pending_feedbacks') || '[]');
            pendingFeedbacks.push(feedback);
            localStorage.setItem('tradepulse_pending_feedbacks', JSON.stringify(pendingFeedbacks));
            console.log(`⏳ Feedback mis en file d'attente (${pendingFeedbacks.length} en attente)`);
            
            // Afficher un message discret à l'utilisateur
            this.showFeedbackSuccess(false, true);
            
            // Programmer une tentative de synchronisation
            setTimeout(() => this.retryPendingFeedbacks(), 30000); // Réessayer dans 30 secondes
        } catch (error) {
            console.error('❌ Erreur lors du stockage en file d\'attente:', error);
        }
    }

    // Nouvelle fonction : tente d'envoyer les feedbacks en attente
    async retryPendingFeedbacks() {
        const pendingFeedbacks = JSON.parse(localStorage.getItem('tradepulse_pending_feedbacks') || '[]');
        if (pendingFeedbacks.length === 0) return;
        
        console.log(`🔄 Tentative d'envoi de ${pendingFeedbacks.length} feedbacks en attente`);
        
        // On essaie d'envoyer chaque feedback
        for (let i = 0; i < pendingFeedbacks.length; i++) {
            try {
                const feedback = pendingFeedbacks[i];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `ml_feedback_${timestamp}.json`;
                
                const response = await fetch(this.GITHUB_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        repo: this.GITHUB_REPO,
                        path: `data/${filename}`,
                        content: JSON.stringify([feedback], null, 2),
                        message: `Feedback utilisateur synchronisé: ${feedback.title.substring(0, 50)}`
                    })
                });
                
                if (response.ok) {
                    // Succès, on retire ce feedback de la file d'attente
                    pendingFeedbacks.splice(i, 1);
                    i--; // Ajuster l'index car on a retiré un élément
                    console.log('✅ Feedback synchronisé avec succès');
                } else {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
            } catch (error) {
                console.warn(`⚠️ Échec de synchronisation du feedback #${i+1}:`, error);
                // On continue avec les autres feedbacks
            }
        }
        
        // Mettre à jour la file d'attente
        localStorage.setItem('tradepulse_pending_feedbacks', JSON.stringify(pendingFeedbacks));
        
        // Si des feedbacks sont toujours en attente, programmer une nouvelle tentative
        if (pendingFeedbacks.length > 0) {
            console.log(`⏳ ${pendingFeedbacks.length} feedbacks toujours en attente, nouvelle tentative dans 5 minutes`);
            setTimeout(() => this.retryPendingFeedbacks(), 5 * 60 * 1000);
        }
    }
    
    showFeedbackSuccess(success, pending = false) {
        const notification = document.createElement('div');
        notification.className = 'ml-feedback-notification';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.padding = '12px 16px';
        notification.style.borderRadius = '4px';
        notification.style.animation = 'fadeIn 0.3s ease forwards';
        
        if (success) {
            notification.innerHTML = `<i class="fas fa-check-circle"></i> Feedback enregistré`;
            notification.style.backgroundColor = 'rgba(0, 255, 135, 0.15)';
            notification.style.border = '1px solid rgba(0, 255, 135, 0.3)';
        } else if (pending) {
            notification.innerHTML = `<i class="fas fa-clock"></i> Feedback enregistré, sera synchronisé automatiquement`;
            notification.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
            notification.style.border = '1px solid rgba(255, 193, 7, 0.3)';
        } else {
            notification.innerHTML = `<i class="fas fa-info-circle"></i> Feedback enregistré`;
            notification.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
            notification.style.border = '1px solid rgba(255, 193, 7, 0.3)';
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