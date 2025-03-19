/**
 * ml-feedback.js - Système de feedback ML sécurisé
 * Ce système envoie les feedbacks à une API qui les stocke dans GitHub
 * sans exposer de tokens sensibles dans le code côté client
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
        // Configuration de l'API
        this.API_ENDPOINT = 'https://stock-analysis-platform-q9tc.onrender.com/api/ml-feedback';
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
        
        // Envoi à l'API de feedback
        try {
            // 1. Essayer d'envoyer le feedback à l'API
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feedback)
            });
            
            if (!response.ok) {
                throw new Error(`Erreur API: ${response.status}`);
            }
            
            // 2. Mise à jour visuelle
            newsCard.dataset.importance = newImportance;
            newsCard.dataset.impact = newImpact;
            newsCard.classList.add('classification-updated');
            setTimeout(() => {
                newsCard.classList.remove('classification-updated');
            }, 2000);
            
            // 3. Afficher confirmation de succès
            this.showFeedbackSuccess(true);
            
            console.log(`✅ Feedback envoyé avec succès à l'API`);
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi du feedback:', error);
            
            // Stockage en file d'attente comme fallback
            this.storeLocalFeedback(feedback);
        }
        
        // Fermer la modal
        this.closeFeedbackModal();
    }
    
    // Fonction: stocke temporairement les feedbacks si l'API est indisponible
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

    // Fonction: tente d'envoyer les feedbacks en attente
    async retryPendingFeedbacks() {
        const pendingFeedbacks = JSON.parse(localStorage.getItem('tradepulse_pending_feedbacks') || '[]');
        if (pendingFeedbacks.length === 0) return;
        
        console.log(`🔄 Tentative d'envoi de ${pendingFeedbacks.length} feedbacks en attente`);
        
        // Copie des feedbacks pour traitement
        const feedbacksToProcess = [...pendingFeedbacks];
        let successCount = 0;
        
        // On essaie d'envoyer chaque feedback
        for (let i = 0; i < feedbacksToProcess.length; i++) {
            try {
                const feedback = feedbacksToProcess[i];
                
                const response = await fetch(this.API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(feedback)
                });
                
                if (response.ok) {
                    // Succès, on retire ce feedback de la file d'attente
                    pendingFeedbacks.splice(pendingFeedbacks.findIndex(f => f.id === feedback.id), 1);
                    successCount++;
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
        
        // Si des feedbacks ont été synchronisés avec succès
        if (successCount > 0) {
            this.showFeedbackSuccess(true, false, successCount);
        }
        
        // Si des feedbacks sont toujours en attente, programmer une nouvelle tentative
        if (pendingFeedbacks.length > 0) {
            console.log(`⏳ ${pendingFeedbacks.length} feedbacks toujours en attente, nouvelle tentative dans 5 minutes`);
            setTimeout(() => this.retryPendingFeedbacks(), 5 * 60 * 1000);
        }
    }
    
    showFeedbackSuccess(success, pending = false, count = 1) {
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
            notification.innerHTML = count > 1 
                ? `<i class="fas fa-check-circle"></i> ${count} feedbacks enregistrés` 
                : `<i class="fas fa-check-circle"></i> Feedback enregistré`;
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