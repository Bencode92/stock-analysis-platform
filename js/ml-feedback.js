/**
 * ml-feedback.js - Système de feedback ML avec communication directe vers GitHub
 * Ce système utilise un token GitHub passé via URL pour une utilisation privée
 */

class MLFeedbackSystem {
    constructor() {
        // Configuration GitHub
        this.GITHUB_REPO = 'Bencode92/stock-analysis-platform';
        this.GITHUB_API = 'https://api.github.com';
        
        // Initialisation
        this.init();
    }
    
    init() {
        console.log('🤖 Initialisation du système de feedback ML...');
        
        // Vérifier si un token est disponible dans l'URL ou le localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('ghtoken');
        
        // Si token trouvé dans l'URL, le stocker dans le localStorage
        if (token) {
            localStorage.setItem('tradepulse_gh_token', token);
            console.log('✅ Token GitHub trouvé dans l\'URL et sauvegardé');
            
            // Retirer le token de l'URL pour plus de sécurité
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, newUrl);
        }
        
        // Vérifier si un token est disponible
        const savedToken = localStorage.getItem('tradepulse_gh_token');
        if (savedToken) {
            console.log('✅ Token GitHub disponible, système de feedback activé');
            this.hasToken = true;
        } else {
            console.log('⚠️ Aucun token GitHub trouvé, système de feedback en mode limité');
            this.hasToken = false;
        }
        
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
                event.preventDefault();
                event.stopPropagation(); // Empêche la propagation à la carte d'actualité parent
                
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
                
                // Si aucun token n'est disponible, on ajoute quand même le bouton mais avec une info-bulle
                if (!this.hasToken) {
                    btn.title = 'Mode démo - Les modifications ne seront pas sauvegardées en ligne';
                } else {
                    btn.title = 'Contribuer à la reclassification de cette actualité';
                }
                
                btn.innerHTML = '<i class="fas fa-robot"></i> Reclasser';
                
                const computedStyle = window.getComputedStyle(card);
                if (computedStyle.position === 'static') {
                    card.style.position = 'relative';
                }
                
                card.appendChild(btn);
            }
        });
    }
    
    openFeedbackModal(newsCard) {
        // MODIFICATION: Désactivation de la vérification de token pour permettre l'ouverture du modal
        // pour tous les utilisateurs, même sans token GitHub
        /*if (!this.hasToken) {
            this.showTokenRequiredMessage();
            return;
        }*/
        
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
    
    showTokenRequiredMessage() {
        const notification = document.createElement('div');
        notification.className = 'ml-feedback-notification';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.padding = '12px 16px';
        notification.style.borderRadius = '4px';
        notification.style.backgroundColor = 'rgba(255, 87, 87, 0.15)';
        notification.style.border = '1px solid rgba(255, 87, 87, 0.3)';
        notification.style.animation = 'fadeIn 0.3s ease forwards';
        
        notification.innerHTML = `
            <i class="fas fa-lock"></i> 
            Token GitHub requis pour cette fonctionnalité.
            <br>
            <small>Utilisez l'URL avec ?ghtoken=VOTRE_TOKEN pour activer.</small>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 5000);
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
        
        // MODIFICATION: Permettre de sauvegarder localement même sans token
        /*if (!this.hasToken) {
            this.showTokenRequiredMessage();
            this.closeFeedbackModal();
            return;
        }*/
        
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
        
        // MODIFICATION: Vérifier si nous avons un token pour l'envoi GitHub
        if (this.hasToken) {
            // ENVOI DIRECT À GITHUB via l'API GitHub
            try {
                // Récupérer le token depuis localStorage
                const token = localStorage.getItem('tradepulse_gh_token');
                if (!token) {
                    throw new Error('Token GitHub non disponible');
                }
                
                // 1. Récupérer le fichier ml_feedback.json actuel
                const fileUrl = `${this.GITHUB_API}/repos/${this.GITHUB_REPO}/contents/data/ml_feedback.json`;
                
                // Récupérer le fichier et son SHA
                const fileResponse = await fetch(fileUrl, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (!fileResponse.ok) {
                    throw new Error(`Erreur GitHub: ${fileResponse.status} ${fileResponse.statusText}`);
                }
                
                const fileData = await fileResponse.json();
                const sha = fileData.sha;
                
                // Décoder le contenu du fichier
                const content = atob(fileData.content);
                const feedbackData = JSON.parse(content);
                
                // 2. Ajouter le nouveau feedback
                feedbackData[0].feedbacks.push(feedback);
                
                // Mettre à jour les métadonnées
                feedbackData[0].meta.feedbackCount = feedbackData[0].feedbacks.length;
                feedbackData[0].meta.lastUpdated = new Date().toISOString();
                
                // 3. Mettre à jour le fichier sur GitHub
                const updateResponse = await fetch(fileUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        message: `Ajout d'un feedback utilisateur: ${title.substring(0, 50)}`,
                        content: btoa(JSON.stringify(feedbackData, null, 2)),
                        sha: sha
                    })
                });
                
                if (!updateResponse.ok) {
                    throw new Error(`Erreur de mise à jour GitHub: ${updateResponse.status}`);
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
                
                console.log(`✅ Feedback envoyé directement à GitHub`);
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi du feedback:', error);
                
                // Stockage en file d'attente comme fallback
                this.storeLocalFeedback(feedback);
            }
        } else {
            // MODIFICATION: Mode démo - Stockage local uniquement
            console.log('Mode démo: stockage local uniquement');
            
            // Mise à jour visuelle
            newsCard.dataset.importance = newImportance;
            newsCard.dataset.impact = newImpact;
            newsCard.classList.add('classification-updated');
            setTimeout(() => {
                newsCard.classList.remove('classification-updated');
            }, 2000);
            
            // Stockage local du feedback
            this.storeLocalFeedback(feedback);
            
            // Afficher confirmation de succès
            this.showFeedbackSuccess(true);
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

    // Fonction : tente d'envoyer les feedbacks en attente
    async retryPendingFeedbacks() {
        // Si pas de token, on ne peut pas synchroniser
        if (!this.hasToken) {
            return;
        }
        
        const pendingFeedbacks = JSON.parse(localStorage.getItem('tradepulse_pending_feedbacks') || '[]');
        if (pendingFeedbacks.length === 0) return;
        
        console.log(`🔄 Tentative d'envoi de ${pendingFeedbacks.length} feedbacks en attente`);
        
        try {
            // Récupérer le token
            const token = localStorage.getItem('tradepulse_gh_token');
            if (!token) {
                throw new Error('Token GitHub non disponible');
            }
            
            // 1. Récupérer d'abord le fichier ml_feedback.json actuel
            const fileUrl = `${this.GITHUB_API}/repos/${this.GITHUB_REPO}/contents/data/ml_feedback.json`;
            
            // Récupérer le fichier et son SHA
            const fileResponse = await fetch(fileUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!fileResponse.ok) {
                throw new Error(`Erreur GitHub: ${fileResponse.status}`);
            }
            
            const fileData = await fileResponse.json();
            let sha = fileData.sha;
            
            // Décoder le contenu du fichier
            let content = atob(fileData.content);
            let feedbackData = JSON.parse(content);
            
            // 2. Ajouter chaque feedback en attente
            for (const feedback of pendingFeedbacks) {
                feedbackData[0].feedbacks.push(feedback);
            }
            
            // Mettre à jour les métadonnées
            feedbackData[0].meta.feedbackCount = feedbackData[0].feedbacks.length;
            feedbackData[0].meta.lastUpdated = new Date().toISOString();
            
            // 3. Mettre à jour le fichier sur GitHub
            const updateResponse = await fetch(fileUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `Ajout de ${pendingFeedbacks.length} feedbacks utilisateurs en attente`,
                    content: btoa(JSON.stringify(feedbackData, null, 2)),
                    sha: sha
                })
            });
            
            if (updateResponse.ok) {
                // Succès, vider la file d'attente locale
                localStorage.removeItem('tradepulse_pending_feedbacks');
                console.log('✅ Tous les feedbacks en attente ont été synchronisés avec succès');
                
                // Montrer une notification de confirmation
                this.showFeedbackSuccess(true, false, pendingFeedbacks.length);
                return true;
            } else {
                throw new Error(`Erreur de mise à jour GitHub: ${updateResponse.status}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la synchronisation des feedbacks en attente:', error);
            
            // Programmer une nouvelle tentative si échec
            setTimeout(() => this.retryPendingFeedbacks(), 5 * 60 * 1000); // Réessayer dans 5 minutes
            return false;
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