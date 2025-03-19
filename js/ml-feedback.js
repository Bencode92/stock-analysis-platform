/**
 * Système de feedback pour les classifications de nouvelles par machine learning
 * Ce module permet aux utilisateurs de signaler des classifications incorrectes
 * et stocke ces retours pour une amélioration future du modèle.
 */

class MLFeedbackSystem {
    constructor() {
        this.feedbackStorageKey = 'ml_feedback_data';
        this.pendingSyncKey = 'ml_feedback_pending_sync';
        this.pendingFeedback = this.loadPendingFeedback();
        
        console.log('Initialisation du système de feedback ML');
        
        // Initialisation immédiate si le DOM est déjà chargé
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.init();
        } else {
            // Sinon, attendre le chargement du DOM
            document.addEventListener('DOMContentLoaded', () => this.init());
        }
        
        // Écouter également l'événement newsDataReady pour s'assurer que les actualités sont chargées
        document.addEventListener('newsDataReady', () => {
            console.log('Événement newsDataReady reçu, réinitialisation du feedback ML');
            // Attendre un peu que le DOM soit mis à jour
            setTimeout(() => this.init(), 500);
        });
        
        // Configurer la synchronisation périodique des feedbacks
        this.setupPeriodicSync();
        
        // Synchroniser avant fermeture de la page
        window.addEventListener('beforeunload', () => {
            if (localStorage.getItem(this.pendingSyncKey) === 'true') {
                this.syncPendingFeedback();
            }
        });
    }

    /**
     * Initialise le système de feedback
     */
    init() {
        console.log('Initialisation du système de feedback ML - DOM chargé');
        // Configurer le modal de feedback (une seule fois)
        this.setupFeedbackModal();
        
        // Ne pas ajouter les boutons ici, c'est maintenant fait par ml-news-integrator.js
        
        // Vérifier s'il y a des feedbacks en attente et tenter de les synchroniser
        if (localStorage.getItem(this.pendingSyncKey) === 'true') {
            this.syncPendingFeedback();
        }
    }

    /**
     * Configure la synchronisation périodique des feedbacks
     */
    setupPeriodicSync() {
        // Synchroniser toutes les 5 minutes si nécessaire
        setInterval(() => {
            if (localStorage.getItem(this.pendingSyncKey) === 'true') {
                this.syncPendingFeedback();
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Charge les retours en attente depuis le stockage local
     */
    loadPendingFeedback() {
        const storedFeedback = localStorage.getItem(this.feedbackStorageKey);
        return storedFeedback ? JSON.parse(storedFeedback) : [];
    }

    /**
     * Sauvegarde les retours en attente
     */
    savePendingFeedback() {
        localStorage.setItem(this.feedbackStorageKey, JSON.stringify(this.pendingFeedback));
        
        // Si des feedbacks sont en attente, marquer pour synchronisation
        if (this.pendingFeedback.length > 0) {
            localStorage.setItem(this.pendingSyncKey, 'true');
        } else {
            localStorage.removeItem(this.pendingSyncKey);
        }
    }

    /**
     * Configure le modal de feedback
     */
    setupFeedbackModal() {
        // Vérifier si le modal existe déjà
        if (document.getElementById('feedback-modal')) {
            console.log('Modal de feedback déjà configuré');
            return;
        }
        
        console.log('Configuration du modal de feedback');
        
        // Créer le modal avec l'interface améliorée
        const modalHTML = `
            <div id="feedback-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Signaler une classification incorrecte</h3>
                        <button id="close-feedback-modal" class="close-btn ripple"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <p id="feedback-news-title" class="feedback-news-title"></p>
                        
                        <div class="feedback-form">
                            <p>Classification actuelle: <span id="current-classification"></span></p>
                            
                            <div class="form-group">
                                <label>Catégorie de l'actualité:</label>
                                <select id="feedback-category" class="form-select">
                                    <option value="">Sélectionnez une catégorie...</option>
                                    <option value="critical">Critique</option>
                                    <option value="important">Importante</option>
                                    <option value="general">Générale</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Impact de l'actualité:</label>
                                <select id="feedback-impact" class="form-select">
                                    <option value="">Sélectionnez un impact...</option>
                                    <option value="positive">Positif</option>
                                    <option value="neutral">Neutre</option>
                                    <option value="negative">Négatif</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="feedback-comment">Commentaire (optionnel):</label>
                                <textarea id="feedback-comment" placeholder="Pourquoi pensez-vous que cette classification est incorrecte?"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="submit-feedback" class="primary-btn ripple button-press">Envoyer</button>
                        <button id="cancel-feedback" class="secondary-btn ripple button-press">Annuler</button>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter le modal au body
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);
        
        // Configurer les événements du modal
        document.getElementById('close-feedback-modal').addEventListener('click', this.closeFeedbackModal.bind(this));
        document.getElementById('cancel-feedback').addEventListener('click', this.closeFeedbackModal.bind(this));
        document.getElementById('submit-feedback').addEventListener('click', this.submitFeedback.bind(this));
        
        console.log('Modal de feedback configuré avec succès');
    }

    /**
     * Ouvre le modal de feedback
     */
    openFeedbackModal(newsId, newsTitle, newsItem) {
        console.log(`Ouverture du modal pour l'actualité ${newsId}: ${newsTitle}`);
        
        // Vérifier si le modal existe
        if (!document.getElementById('feedback-modal')) {
            console.error('Erreur: Modal de feedback non trouvé!');
            this.setupFeedbackModal(); // Tenter de recréer le modal
        }
        
        // Stocker l'ID de l'actualité courante
        this.currentNewsId = newsId;
        this.currentNewsItem = newsItem;
        
        // Récupérer la classification actuelle
        const currentClassification = newsItem.getAttribute('data-sentiment') || 
                                     newsItem.querySelector('.impact') ? newsItem.querySelector('.impact').textContent : 
                                     (newsItem.getAttribute('data-impact') || 'inconnu');
        
        console.log(`Classification actuelle: ${currentClassification}`);
        
        // Mettre à jour le contenu du modal
        const titleElement = document.getElementById('feedback-news-title');
        const classificationElement = document.getElementById('current-classification');
        
        if (titleElement && classificationElement) {
            titleElement.textContent = newsTitle;
            classificationElement.textContent = currentClassification;
            
            // Réinitialiser le formulaire
            document.getElementById('feedback-category').value = '';
            document.getElementById('feedback-impact').value = '';
            
            const commentElement = document.getElementById('feedback-comment');
            if (commentElement) {
                commentElement.value = '';
            }
            
            // Afficher le modal
            const modal = document.getElementById('feedback-modal');
            if (modal) {
                modal.classList.add('active');
            }
        } else {
            console.error('Erreur: Éléments du modal non trouvés!');
        }
    }

    /**
     * Ferme le modal de feedback
     */
    closeFeedbackModal() {
        const modal = document.getElementById('feedback-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentNewsId = null;
        this.currentNewsItem = null;
    }

    /**
     * Soumet le feedback
     */
    submitFeedback() {
        // Récupérer les valeurs des dropdowns
        const categorySelect = document.getElementById('feedback-category');
        const impactSelect = document.getElementById('feedback-impact');
        
        if (!categorySelect.value) {
            alert('Veuillez sélectionner une catégorie.');
            return;
        }
        
        if (!impactSelect.value) {
            alert('Veuillez sélectionner un impact.');
            return;
        }
        
        // Récupérer les données du formulaire
        const feedback = {
            newsId: this.currentNewsId,
            title: document.getElementById('feedback-news-title').textContent,
            currentClassification: document.getElementById('current-classification').textContent,
            correctClassification: impactSelect.value,
            correctHierarchy: categorySelect.value,
            comment: document.getElementById('feedback-comment').value,
            timestamp: new Date().toISOString(),
            userId: localStorage.getItem('user_id') || 'anonymous',
            newsContent: this.currentNewsItem ? this.getNewsContent(this.currentNewsItem) : '',
        };
        
        console.log('Feedback soumis:', feedback);
        
        // Ajouter le feedback à la liste des feedbacks en attente
        this.pendingFeedback.push(feedback);
        this.savePendingFeedback();
        
        // Mettre à jour l'UI si possible
        this.updateNewsDisplay(feedback);
        
        // Envoyer le feedback au serveur si disponible
        this.sendFeedbackToServer(feedback);
        
        // Fermer le modal
        this.closeFeedbackModal();
        
        // Afficher un message de confirmation
        this.showConfirmationMessage();
    }
    
    /**
     * Récupère le contenu de l'actualité
     */
    getNewsContent(newsItem) {
        // Essayer de récupérer le contenu de différentes manières
        const contentElement = newsItem.querySelector('p');
        if (contentElement) {
            return contentElement.textContent;
        }
        
        // Si pas trouvé, renvoyer une chaîne vide
        return '';
    }
    
    /**
     * Met à jour l'affichage de l'actualité après feedback
     */
    updateNewsDisplay(feedback) {
        // Si NewsSystem est disponible, utiliser sa fonction de mise à jour
        if (window.NewsSystem && window.NewsSystem.updateNewsClassificationUI) {
            // Créer un objet avec les nouvelles valeurs
            const newClassification = {
                sentiment: feedback.correctClassification,
                hierarchy: feedback.correctHierarchy
            };
            
            // Appeler la fonction de mise à jour
            window.NewsSystem.updateNewsClassificationUI(feedback.newsId, newClassification);
        }
    }

    /**
     * Envoie le feedback au serveur
     */
    async sendFeedback(newsId, feedbackType, feedbackData) {
        // Stocker dans localStorage pour la persistance
        const feedbackStorage = localStorage.getItem('ml_feedback') || '{}';
        let allFeedback = JSON.parse(feedbackStorage);
        
        if (!allFeedback[newsId]) {
            allFeedback[newsId] = {};
        }
        
        allFeedback[newsId][feedbackType] = feedbackData;
        allFeedback[newsId].timestamp = Date.now();
        
        localStorage.setItem('ml_feedback', JSON.stringify(allFeedback));
        
        // Mettre un flag pour indiquer que des feedbacks sont en attente de synchronisation
        localStorage.setItem(this.pendingSyncKey, 'true');
        
        // Si l'API est disponible, synchroniser immédiatement
        this.syncFeedbackWithServer();
        
        console.log(`Feedback ML enregistré pour ${newsId}: ${feedbackType}`, feedbackData);
        
        return true;
    }

    /**
     * Synchronise les feedbacks stockés localement avec le serveur
     * Tente d'envoyer les feedbacks en attente
     */
    syncFeedbackWithServer() {
        // Vérifier s'il y a des feedbacks en attente
        if (localStorage.getItem(this.pendingSyncKey) !== 'true') {
            return;
        }
        
        // Récupérer tous les feedbacks
        const feedbackStorage = localStorage.getItem('ml_feedback') || '{}';
        const allFeedback = JSON.parse(feedbackStorage);
        
        // Préparer les données pour l'envoi
        const feedbackItems = [];
        
        for (const newsId in allFeedback) {
            const item = allFeedback[newsId];
            
            // Créer un objet de feedback
            const feedbackItem = {
                id: newsId,
                timestamp: item.timestamp || Date.now(),
                ...item
            };
            
            feedbackItems.push(feedbackItem);
        }
        
        // Si aucun feedback, rien à faire
        if (feedbackItems.length === 0) {
            localStorage.removeItem(this.pendingSyncKey);
            return;
        }
        
        // Tenter d'envoyer au serveur
        fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(feedbackItems)
        })
        .then(response => {
            if (response.ok) {
                // Feedback envoyé avec succès, effacer le flag
                localStorage.removeItem(this.pendingSyncKey);
                console.log('✅ Feedback ML synchronisé avec le serveur');
                return response.json();
            } else {
                throw new Error('Erreur lors de l\'envoi du feedback');
            }
        })
        .catch(error => {
            console.error('❌ Erreur de synchronisation du feedback ML:', error);
            // Ne pas effacer le flag pour réessayer plus tard
        });
    }

    /**
     * Envoie le feedback au serveur
     */
    async sendFeedbackToServer(feedback) {
        try {
            // Si l'API est disponible
            if (typeof API_URL !== 'undefined') {
                const response = await fetch(`${API_URL}/feedback`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(feedback)
                });
                
                if (response.ok) {
                    // Retirer le feedback de la liste des feedbacks en attente
                    this.pendingFeedback = this.pendingFeedback.filter(item => 
                        item.newsId !== feedback.newsId || 
                        item.timestamp !== feedback.timestamp
                    );
                    this.savePendingFeedback();
                    console.log('✅ Feedback envoyé avec succès au serveur');
                }
            } else {
                // API non disponible, marquer comme en attente de synchronisation
                localStorage.setItem(this.pendingSyncKey, 'true');
                console.log('API non disponible, feedback en attente de synchronisation');
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du feedback:', error);
            // Le feedback reste dans la liste des feedbacks en attente
            localStorage.setItem(this.pendingSyncKey, 'true');
        }
    }

    /**
     * Affiche un message de confirmation
     */
    showConfirmationMessage() {
        // Créer le toast
        const toast = document.createElement('div');
        toast.className = 'toast success';
        toast.textContent = 'Merci pour votre feedback! Vos commentaires nous aident à améliorer notre système.';
        
        // Ajouter le toast au body
        document.body.appendChild(toast);
        
        // Afficher le toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // Supprimer le toast après 5 secondes
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 5000);
    }

    /**
     * Synchronise les feedbacks en attente
     * Cette méthode peut être appelée périodiquement pour réessayer d'envoyer les feedbacks en attente
     */
    async syncPendingFeedback() {
        if (this.pendingFeedback.length === 0) return;
        
        console.log(`Tentative de synchronisation de ${this.pendingFeedback.length} feedbacks en attente`);
        
        // Préparer les données pour l'API
        const batchedFeedback = {
            feedbacks: this.pendingFeedback,
            timestamp: new Date().toISOString(),
            source: 'web_client'
        };
        
        try {
            // Si l'API est disponible
            if (typeof API_URL !== 'undefined') {
                const response = await fetch(`${API_URL}/feedback/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batchedFeedback)
                });
                
                if (response.ok) {
                    // Tout le lot a été envoyé avec succès
                    this.pendingFeedback = [];
                    this.savePendingFeedback();
                    localStorage.removeItem(this.pendingSyncKey);
                    console.log('✅ Tous les feedbacks en attente ont été synchronisés avec succès');
                    return true;
                } else {
                    throw new Error(`Erreur serveur: ${response.status}`);
                }
            } else {
                console.log('API non disponible, les feedbacks restent en attente de synchronisation');
                return false;
            }
        } catch (error) {
            console.error('Erreur lors de la synchronisation des feedbacks:', error);
            return false;
        }
    }
}

// Initialiser le système de feedback et l'exposer globalement
const mlFeedback = new MLFeedbackSystem();
window.mlFeedback = mlFeedback;

// Exporter pour utilisation dans d'autres modules
if (typeof module !== 'undefined') {
    module.exports = { MLFeedbackSystem };
}
