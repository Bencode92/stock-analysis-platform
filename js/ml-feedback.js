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
                const newsCard = event.target.closest('article, .card, [class*="news-card"]');
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
        
        // Cacher l'affichage du sentiment neutre et du score
        this.hideRedundantLabels();
        
        // Observer les changements DOM pour appliquer les modifications aux nouveaux éléments
        this.observeDOMChanges();
    }

    /**
     * Cache les labels de sentiment et score redundants
     */
    hideRedundantLabels() {
        // Sélectionner tous les éléments contenant "SENTIMENT NEUTRE" et les scores
        document.querySelectorAll('*').forEach(el => {
            if (el.textContent && el.textContent.includes('SENTIMENT NEUTRE') && el.textContent.includes('%')) {
                console.log('⚠️ Masquer l\'élément de sentiment redundant:', el);
                el.style.display = 'none';
            }
        });
    }

    /**
     * Observer les changements du DOM pour appliquer les modifications aux nouveaux éléments
     */
    observeDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            let needsUpdate = false;
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    needsUpdate = true;
                }
            });
            
            if (needsUpdate) {
                // Attendre un peu que le DOM se stabilise
                setTimeout(() => {
                    this.addFeedbackButtonsToNews();
                    this.hideRedundantLabels();
                }, 300);
            }
        });
        
        // Observer tout le body pour les changements
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * Ajoute des boutons de feedback à chaque carte d'actualité
     */
    addFeedbackButtonsToNews() {
        // Cibler précisément les cartes d'actualités en fonction de votre structure
        const newsCards = document.querySelectorAll('article, article > a > div, .card:not(.event-card)');
        
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
            
            // Extraire le titre pour l'identifiant unique
            const title = card.querySelector('h1, h2, h3')?.textContent;
            if (title) {
                // Créer un identifiant basé sur le titre pour le suivi
                const titleId = this.createTitleId(title);
                card.dataset.titleId = titleId;
            }
            
            // Ajouter le bouton de feedback s'il n'existe pas déjà
            if (!card.querySelector('.ml-feedback-btn')) {
                // Créer le bouton
                const feedbackBtn = document.createElement('button');
                feedbackBtn.className = 'ml-feedback-btn';
                feedbackBtn.innerHTML = '<i class="fas fa-robot"></i> Améliorer IA';
                feedbackBtn.title = 'Aider à améliorer la classification de cette actualité';
                
                // Assurer que la carte a une position relative pour le positionnement absolu du bouton
                card.style.position = 'relative';
                
                // Ajouter le bouton à la carte
                card.appendChild(feedbackBtn);
                
                console.log(`✅ Bouton de feedback ajouté à la carte: ${title || 'sans titre'}`);
            }
        });
    }

    /**
     * Crée un identifiant basé sur le titre (pour la persistance)
     */
    createTitleId(title) {
        // Nettoyer et hacher le titre pour en faire un ID unique
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .substring(0, 50);
    }

    /**
     * Ouvre la modal de feedback pour une carte d'actualité
     */
    openFeedbackModal(newsCard) {
        const newsId = newsCard.dataset.newsId;
        const title = newsCard.querySelector('h1, h2, h3')?.textContent || 'Article sans titre';
        
        // Déterminer les valeurs actuelles de la catégorie et du sentiment
        const categoryEl = newsCard.querySelector('[class*="GENERAL"], [class*="TECH"]');
        const sentimentEl = newsCard.querySelector('[class*="IMPACT"]');
        
        const originalCategory = categoryEl ? this.getCategoryFromText(categoryEl.textContent) : 'general';
        const originalSentiment = sentimentEl ? this.getSentimentFromText(sentimentEl.textContent) : 'neutral';
        
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
                            <option value="crypto" ${originalCategory === 'crypto' ? 'selected' : ''}>Crypto</option>
                        </select>
                    </div>
                    
                    <div class="ml-feedback-field">
                        <label for="ml-sentiment-select">Impact:</label>
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
     * Extrait la catégorie à partir du texte
     */
    getCategoryFromText(text) {
        text = text.toLowerCase();
        if (text.includes('tech')) return 'technology';
        if (text.includes('econ')) return 'economy';
        if (text.includes('marche')) return 'markets';
        if (text.includes('entreprise')) return 'companies';
        if (text.includes('crypto')) return 'crypto';
        if (text.includes('finance')) return 'finance';
        return 'general';
    }
    
    /**
     * Extrait le sentiment à partir du texte
     */
    getSentimentFromText(text) {
        text = text.toLowerCase();
        if (text.includes('positif') || text.includes('positive')) return 'positive';
        if (text.includes('négatif') || text.includes('negative')) return 'negative';
        return 'neutral';
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
        
        // Trouver la carte d'actualité correspondante
        const newsCard = document.querySelector(`[data-news-id="${newsId}"]`);
        if (!newsCard) {
            console.error('❌ Carte d\'actualité non trouvée:', newsId);
            this.closeFeedbackModal();
            return;
        }
        
        // Extraire les informations de la carte
        const title = newsCard.querySelector('h1, h2, h3')?.textContent || '';
        const content = newsCard.querySelector('p')?.textContent || '';
        
        // Créer l'objet de feedback
        const feedback = {
            id: `feedback-${Date.now()}`,
            newsId: newsId,
            title: title,
            content: content.substring(0, 200), // Limiter la taille du contenu
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
        this.updateNewsCardClassification(newsCard, newCategory, newSentiment);
        
        // Afficher une confirmation
        this.showFeedbackSuccess();
        
        // Fermer la modal
        this.closeFeedbackModal();
    }

    /**
     * Met à jour visuellement la classification sur la carte d'actualité
     */
    updateNewsCardClassification(card, category, sentiment) {
        // Ajouter une classe pour effet visuel de mise à jour
        card.classList.add('ml-updated');
        
        // Supprimer la classe après l'animation
        setTimeout(() => {
            card.classList.remove('ml-updated');
        }, 2000);
        
        console.log(`✅ Classification mise à jour pour la carte: ${card.querySelector('h1, h2, h3')?.textContent || 'sans titre'}`);
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
     * Synchronise les données de feedback avec le serveur
     */
    async syncFeedbackData() {
        // Si nous n'avons pas de données à synchroniser, sortir
        const feedbacksStr = localStorage.getItem('tradepulse_ml_feedback');
        if (!feedbacksStr || feedbacksStr === '[]') {
            return;
        }
        
        const feedbacks = JSON.parse(feedbacksStr);
        console.log(`🔄 Gestion de ${feedbacks.length} feedbacks...`);
        
        // Si plus de 3 feedbacks sont disponibles, proposer le téléchargement
        if (feedbacks.length >= 3) {
            this.offerFeedbackDownload(feedbacks);
        }
    }

    /**
     * Propose le téléchargement des feedbacks
     */
    offerFeedbackDownload(feedbacks) {
        // Afficher un bouton flottant pour télécharger les feedbacks
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
