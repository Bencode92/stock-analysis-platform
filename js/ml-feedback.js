/**
 * Système de feedback pour les classifications de nouvelles par machine learning
 * Ce module permet aux utilisateurs de signaler des classifications incorrectes
 * et stocke ces retours pour une amélioration future du modèle.
 */

class MLFeedbackSystem {
    constructor() {
        this.feedbackStorageKey = 'ml_feedback_data';
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
    }

    /**
     * Initialise le système de feedback
     */
    init() {
        console.log('Initialisation du système de feedback ML - DOM chargé');
        // Configurer le modal de feedback (une seule fois)
        this.setupFeedbackModal();
        
        // Ne pas ajouter les boutons ici, c'est maintenant fait par ml-news-integrator.js
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
        
        // Créer le modal
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
                                <label>Classification correcte selon vous:</label>
                                <div class="radio-group">
                                    <label>
                                        <input type="radio" name="correct-classification" value="positive">
                                        <span>Positive</span>
                                    </label>
                                    <label>
                                        <input type="radio" name="correct-classification" value="negative">
                                        <span>Négative</span>
                                    </label>
                                    <label>
                                        <input type="radio" name="correct-classification" value="neutral">
                                        <span>Neutre</span>
                                    </label>
                                </div>
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
            document.querySelectorAll('input[name="correct-classification"]').forEach(radio => {
                radio.checked = false;
            });
            
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
    }

    /**
     * Soumet le feedback
     */
    submitFeedback() {
        // Récupérer la classification correcte sélectionnée
        const selectedClassification = document.querySelector('input[name="correct-classification"]:checked');
        if (!selectedClassification) {
            alert('Veuillez sélectionner une classification correcte.');
            return;
        }
        
        // Récupérer les données du formulaire
        const feedback = {
            newsId: this.currentNewsId,
            title: document.getElementById('feedback-news-title').textContent,
            currentClassification: document.getElementById('current-classification').textContent,
            correctClassification: selectedClassification.value,
            comment: document.getElementById('feedback-comment').value,
            timestamp: new Date().toISOString(),
            userId: localStorage.getItem('user_id') || 'anonymous'
        };
        
        console.log('Feedback soumis:', feedback);
        
        // Ajouter le feedback à la liste des feedbacks en attente
        this.pendingFeedback.push(feedback);
        this.savePendingFeedback();
        
        // Envoyer le feedback au serveur si disponible
        this.sendFeedbackToServer(feedback);
        
        // Fermer le modal
        this.closeFeedbackModal();
        
        // Afficher un message de confirmation
        this.showConfirmationMessage();
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
                }
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du feedback:', error);
            // Le feedback reste dans la liste des feedbacks en attente
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
        
        // Copier la liste des feedbacks en attente
        const pendingFeedbackCopy = [...this.pendingFeedback];
        
        // Essayer d'envoyer chaque feedback
        for (const feedback of pendingFeedbackCopy) {
            await this.sendFeedbackToServer(feedback);
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
