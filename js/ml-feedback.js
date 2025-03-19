/**
 * ml-feedback.js - Système de feedback pour le Machine Learning
 * Ce module gère la collecte, le stockage et la synchronisation des retours
 * utilisateurs sur les classifications d'actualités.
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
        // Tenter de synchroniser les feedbacks au chargement
        this.syncFeedbackData();
    }

    /**
     * Initialise le système de feedback
     */
    init() {
        console.log('🤖 Initialisation du système de feedback ML...');
        
        // Ajouter des boutons de feedback à chaque carte d'actualité
        this.addFeedbackButtonsToNews();
        
        // Attacher les gestionnaires d'événements aux boutons de feedback
        document.addEventListener('click', (event) => {
            // Bouton pour ouvrir le modal de feedback
            if (event.target.closest('.ml-feedback-btn')) {
                const newsCard = event.target.closest('.news-card');
                if (newsCard) {
                    this.openFeedbackModal(newsCard);
                }
            }
            
            // Bouton pour annuler le feedback
            if (event.target.closest('#ml-feedback-cancel')) {
                this.closeFeedbackModal();
            }
            
            // Bouton pour enregistrer le feedback
            if (event.target.closest('#ml-feedback-save')) {
                this.saveFeedback();
            }
        });
    }

    /**
     * Ajoute des boutons de feedback à chaque carte d'actualité
     */
    addFeedbackButtonsToNews() {
        const newsCards = document.querySelectorAll('.news-card');
        if (newsCards.length === 0) {
            console.log('⚠️ Aucune carte d\'actualité trouvée sur cette page');
            return;
        }
        
        console.log(`🔍 ${newsCards.length} cartes d'actualités trouvées`);
        
        newsCards.forEach((card, index) => {
            // Assigner un ID unique si nécessaire
            if (!card.dataset.newsId) {
                card.dataset.newsId = `news-${Date.now()}-${index}`;
            }
            
            // Extraire les classifications actuelles
            const category = card.dataset.category || 'general';
            const sentiment = card.dataset.sentiment || 'neutral';
            const impact = card.dataset.impact || 'low';
            
            // Stocker les classifications originales pour référence
            card.dataset.originalCategory = category;
            card.dataset.originalSentiment = sentiment;
            card.dataset.originalImpact = impact;
            
            // Ajouter le bouton de feedback s'il n'existe pas déjà
            if (!card.querySelector('.ml-feedback-btn')) {
                const metaContainer = card.querySelector('.news-meta') || card.querySelector('.news-content');
                
                if (metaContainer) {
                    const feedbackBtn = document.createElement('button');
                    feedbackBtn.className = 'ml-feedback-btn';
                    feedbackBtn.innerHTML = '<i class="fas fa-robot"></i> Améliorer IA';
                    feedbackBtn.title = 'Aider à améliorer la classification de cette actualité';
                    
                    metaContainer.appendChild(feedbackBtn);
                }
            }
        });
        
        console.log('✅ Boutons de feedback ajoutés aux actualités');
    }

    /**
     * Ouvre la modal de feedback pour une carte d'actualité
     */
    openFeedbackModal(newsCard) {
        const newsId = newsCard.dataset.newsId;
        const title = newsCard.querySelector('h3')?.textContent || 'Article sans titre';
        const originalCategory = newsCard.dataset.originalCategory || 'general';
        const originalSentiment = newsCard.dataset.originalSentiment || 'neutral';
        
        // Vérifier si une modal existe déjà, sinon la créer
        let modal = document.getElementById('ml-feedback-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ml-feedback-modal';
            modal.className = 'ml-feedback-modal';
            document.body.appendChild(modal);
        }
        
        // Mettre à jour le contenu de la modal
        modal.innerHTML = `
            <div class="ml-feedback-content">
                <h2>Modifier la classification</h2>
                <p class="ml-feedback-article-title">Article: "${title}"</p>
                
                <div class="ml-feedback-form">
                    <div class="ml-feedback-field">
                        <label for="ml-category-select">Catégorie:</label>
                        <select id="ml-category-select" class="ml-select">
                            <option value="general" ${originalCategory === 'general' ? 'selected' : ''}>Générale</option>
                            <option value="economy" ${originalCategory === 'economy' ? 'selected' : ''}>Économie</option>
                            <option value="markets" ${originalCategory === 'markets' ? 'selected' : ''}>Marchés</option>
                            <option value="companies" ${originalCategory === 'companies' ? 'selected' : ''}>Entreprises</option>
                            <option value="technology" ${originalCategory === 'technology' ? 'selected' : ''}>Technologie</option>
                            <option value="finance" ${originalCategory === 'finance' ? 'selected' : ''}>Finance</option>
                        </select>
                    </div>
                    
                    <div class="ml-feedback-field">
                        <label for="ml-sentiment-select">Sentiment:</label>
                        <select id="ml-sentiment-select" class="ml-select">
                            <option value="positive" ${originalSentiment === 'positive' ? 'selected' : ''}>Positif</option>
                            <option value="neutral" ${originalSentiment === 'neutral' ? 'selected' : ''}>Neutre</option>
                            <option value="negative" ${originalSentiment === 'negative' ? 'selected' : ''}>Négatif</option>
                        </select>
                    </div>
                </div>
                
                <div class="ml-feedback-actions">
                    <button id="ml-feedback-cancel" class="ml-button ml-button-cancel">Annuler</button>
                    <button id="ml-feedback-save" class="ml-button ml-button-save">Enregistrer</button>
                </div>
            </div>
        `;
        
        // Stocker les référence pour utilisation ultérieure
        modal.dataset.newsId = newsId;
        modal.dataset.originalCategory = originalCategory;
        modal.dataset.originalSentiment = originalSentiment;
        
        // Afficher la modal
        modal.style.display = 'flex';
    }

    /**
     * Ferme la modal de feedback
     */
    closeFeedbackModal() {
        const modal = document.getElementById('ml-feedback-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Enregistre le feedback de l'utilisateur
     */
    saveFeedback() {
        const modal = document.getElementById('ml-feedback-modal');
        if (!modal) return;
        
        const newsId = modal.dataset.newsId;
        const originalCategory = modal.dataset.originalCategory;
        const originalSentiment = modal.dataset.originalSentiment;
        
        const newCategory = document.getElementById('ml-category-select').value;
        const newSentiment = document.getElementById('ml-sentiment-select').value;
        
        // Ne pas enregistrer si rien n'a changé
        if (originalCategory === newCategory && originalSentiment === newSentiment) {
            console.log('⚠️ Aucune modification détectée, feedback ignoré');
            this.closeFeedbackModal();
            return;
        }
        
        // Créer l'objet de feedback
        const feedback = {
            id: `feedback-${Date.now()}`,
            newsId: newsId,
            original: {
                category: originalCategory,
                sentiment: originalSentiment
            },
            corrected: {
                category: newCategory,
                sentiment: newSentiment
            },
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
        
        console.log('📝 Nouveau feedback:', feedback);
        
        // Stocker le feedback localement
        this.storeFeedbackLocally(feedback);
        
        // Essayer de synchroniser immédiatement
        this.syncFeedbackData();
        
        // Mettre à jour visuellement la classification sur la carte
        this.updateNewsCardClassification(newsId, newCategory, newSentiment);
        
        // Afficher une confirmation
        this.showFeedbackSuccess();
        
        // Fermer la modal
        this.closeFeedbackModal();
    }

    /**
     * Stocke le feedback dans le stockage local
     */
    storeFeedbackLocally(feedback) {
        try {
            // Récupérer les feedbacks existants
            let feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedback') || '[]');
            
            // Ajouter le nouveau feedback
            feedbacks.push(feedback);
            
            // Enregistrer le tableau mis à jour
            localStorage.setItem('tradepulse_ml_feedback', JSON.stringify(feedbacks));
            
            console.log(`✅ Feedback stocké localement (${feedbacks.length} total)`);
            return true;
        } catch (error) {
            console.error('❌ Erreur lors du stockage local du feedback:', error);
            return false;
        }
    }

    /**
     * Synchronise les feedbacks avec le serveur ou génère un fichier à télécharger
     */
    async syncFeedbackData() {
        try {
            // Récupérer les feedbacks stockés localement
            const feedbacksStr = localStorage.getItem('tradepulse_ml_feedback');
            if (!feedbacksStr || feedbacksStr === '[]') {
                console.log('ℹ️ Aucun feedback à synchroniser');
                return;
            }
            
            const feedbacks = JSON.parse(feedbacksStr);
            console.log(`🔄 Tentative de synchronisation de ${feedbacks.length} feedbacks...`);
            
            // VERSION GITHUB PAGES - EXPORT DE FICHIER
            // Pour un site statique sans backend, on propose le téléchargement
            if (window.location.hostname.includes('github.io') || true) {
                // Si plus de 3 feedbacks sont disponibles, proposer le téléchargement
                if (feedbacks.length >= 3) {
                    this.offerFeedbackDownload(feedbacks);
                }
                return;
            }
            
            // SI VOUS AJOUTEZ UNE API PLUS TARD, UTILISEZ CE CODE:
            // const response = await fetch('/api/ml/feedback', {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json'
            //     },
            //     body: feedbacksStr
            // });
            //
            // if (response.ok) {
            //     console.log('✅ Feedbacks synchronisés avec succès!');
            //     localStorage.removeItem('tradepulse_ml_feedback');
            // } else {
            //     console.error('❌ Erreur lors de la synchronisation:', response.status);
            // }
        } catch (error) {
            console.error('❌ Erreur lors de la synchronisation des feedbacks:', error);
        }
    }

    /**
     * Propose le téléchargement des feedbacks
     */
    offerFeedbackDownload(feedbacks) {
        // Créer un bouton flottant pour télécharger les feedbacks
        let downloadBtn = document.getElementById('ml-feedback-download-btn');
        
        if (!downloadBtn) {
            downloadBtn = document.createElement('button');
            downloadBtn.id = 'ml-feedback-download-btn';
            downloadBtn.className = 'ml-feedback-download-btn';
            downloadBtn.innerHTML = `<i class="fas fa-download"></i> Exporter les feedbacks (${feedbacks.length})`;
            downloadBtn.title = 'Télécharger les feedbacks pour améliorer notre modèle';
            
            downloadBtn.addEventListener('click', () => {
                this.downloadFeedbackData();
            });
            
            document.body.appendChild(downloadBtn);
        } else {
            downloadBtn.innerHTML = `<i class="fas fa-download"></i> Exporter les feedbacks (${feedbacks.length})`;
        }
    }

    /**
     * Télécharge les données de feedback sous forme de fichier JSON
     */
    downloadFeedbackData() {
        const feedbacksStr = localStorage.getItem('tradepulse_ml_feedback');
        if (!feedbacksStr || feedbacksStr === '[]') {
            alert('Aucun feedback à télécharger.');
            return;
        }
        
        // Créer un blob avec les données
        const blob = new Blob([feedbacksStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        
        // Créer un lien de téléchargement invisible
        const a = document.createElement('a');
        a.href = url;
        a.download = `tradepulse_ml_feedback_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        
        // Déclencher le téléchargement
        a.click();
        
        // Nettoyer
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Demander si l'utilisateur veut effacer les feedbacks locaux après téléchargement
        if (confirm('Feedbacks téléchargés avec succès! Souhaitez-vous effacer les feedbacks de votre navigateur?')) {
            localStorage.removeItem('tradepulse_ml_feedback');
            const downloadBtn = document.getElementById('ml-feedback-download-btn');
            if (downloadBtn) {
                downloadBtn.remove();
            }
        }
    }

    /**
     * Met à jour visuellement la classification sur la carte d'actualité
     */
    updateNewsCardClassification(newsId, category, sentiment) {
        const newsCard = document.querySelector(`.news-card[data-news-id="${newsId}"]`);
        if (!newsCard) return;
        
        // Mettre à jour les attributs de données
        newsCard.dataset.category = category;
        newsCard.dataset.sentiment = sentiment;
        
        // Mettre à jour visuellement si nécessaire (classes CSS, étiquettes, etc.)
        // Par exemple, ajouter/supprimer des classes basées sur le sentiment
        newsCard.classList.remove('positive-sentiment', 'neutral-sentiment', 'negative-sentiment');
        newsCard.classList.add(`${sentiment}-sentiment`);
        
        // Ajouter une indication visuelle que la carte a été mise à jour
        newsCard.classList.add('ml-updated');
        
        console.log(`✅ Classification mise à jour visuellement pour ${newsId}`);
    }

    /**
     * Affiche une notification de succès après l'enregistrement du feedback
     */
    showFeedbackSuccess() {
        // Créer l'élément de notification s'il n'existe pas
        let notification = document.getElementById('ml-feedback-notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'ml-feedback-notification';
            notification.className = 'ml-feedback-notification';
            document.body.appendChild(notification);
        }
        
        // Mettre à jour le contenu
        notification.innerHTML = `
            <div class="ml-feedback-notification-content">
                <i class="fas fa-check-circle"></i>
                <span>Merci pour votre feedback! Il aidera à améliorer notre IA.</span>
            </div>
        `;
        
        // Afficher la notification
        notification.classList.add('visible');
        
        // Masquer après quelques secondes
        setTimeout(() => {
            notification.classList.remove('visible');
        }, 3000);
    }
}

// Initialiser le système de feedback lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Créer une instance globale du système de feedback
    window.mlFeedbackSystem = new MLFeedbackSystem();
});
