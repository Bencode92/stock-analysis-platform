/**
 * ml-feedback.js - Système de feedback pour le Machine Learning
 * Permet aux utilisateurs de reclassifier les actualités selon leur niveau d'importance
 * pour réentraîner le modèle ML de TradePulse
 */

class MLFeedbackSystem {
    constructor() {
        this.init();
    }
    
    /**
     * Initialise le système de feedback
     */
    init() {
        console.log('🤖 Initialisation du système de feedback ML...');
        
        // Ajouter les boutons de feedback aux actualités
        setTimeout(() => this.addFeedbackButtons(), 1500);
        
        // Écouter les clics sur les boutons et actions
        document.addEventListener('click', (event) => {
            // Bouton de feedback
            if (event.target.closest('.ml-feedback-btn')) {
                const newsCard = event.target.closest('.news-card');
                if (newsCard) {
                    this.openFeedbackModal(newsCard);
                }
            }
            
            // Boutons de la modal
            if (event.target.id === 'ml-feedback-cancel') {
                this.closeFeedbackModal();
            }
            
            if (event.target.id === 'ml-feedback-save') {
                this.saveFeedback();
            }
            
            // Bouton d'export
            if (event.target.id === 'ml-feedback-export') {
                this.exportFeedbackData();
            }
        });
        
        // Vérifier les feedbacks existants
        this.checkExistingFeedbacks();
    }
    
    /**
     * Ajoute des boutons de feedback à toutes les cartes d'actualités
     */
    addFeedbackButtons() {
        // Cibler toutes les cartes d'actualités
        const newsCards = document.querySelectorAll('.news-card');
        console.log(`🔍 Recherche de cartes d'actualités: ${newsCards.length} trouvées`);
        
        newsCards.forEach((card, index) => {
            // Éviter d'ajouter des boutons en double
            if (!card.querySelector('.ml-feedback-btn')) {
                // Créer un ID unique pour la carte
                card.dataset.newsId = `news-${Date.now()}-${index}`;
                
                // Déterminer la classification actuelle (critique, important ou général)
                let currentImportance = 'general';
                if (card.closest('#critical-news-container')) {
                    currentImportance = 'critical';
                } else if (card.closest('#important-news-container')) {
                    currentImportance = 'important';
                }
                
                // Détecter l'impact actuel (positif, négatif, neutre)
                let currentImpact = 'neutral';
                if (card.querySelector('.impact-indicator.positive') || 
                    card.textContent.includes('POSITIF')) {
                    currentImpact = 'positive';
                } else if (card.querySelector('.impact-indicator.negative') || 
                           card.textContent.includes('NÉGATIF')) {
                    currentImpact = 'negative';
                }
                
                // Stocker les classifications comme attributs data
                card.dataset.importance = currentImportance;
                card.dataset.impact = currentImpact;
                
                // Créer le bouton de feedback
                const btn = document.createElement('button');
                btn.className = 'ml-feedback-btn';
                btn.innerHTML = '<i class="fas fa-robot"></i> Reclasser';
                btn.title = 'Contribuer à la reclassification de cette actualité';
                
                // S'assurer que la carte a une position relative
                const computedStyle = window.getComputedStyle(card);
                if (computedStyle.position === 'static') {
                    card.style.position = 'relative';
                }
                
                // Ajouter le bouton à la carte
                card.appendChild(btn);
                console.log(`✅ Bouton de feedback ajouté à la carte #${index}`);
            }
        });
    }
    
    /**
     * Vérifie les feedbacks existants et propose l'export si nécessaire
     */
    checkExistingFeedbacks() {
        const feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
        if (feedbacks.length >= 3) {
            this.showExportButton(feedbacks.length);
        }
    }
    
    /**
     * Ouvre la modal de feedback pour une carte d'actualité
     */
    openFeedbackModal(newsCard) {
        // Extraire les informations de la carte
        const newsId = newsCard.dataset.newsId;
        const title = newsCard.querySelector('h3')?.textContent || 'Article sans titre';
        const currentImportance = newsCard.dataset.importance || 'general';
        const currentImpact = newsCard.dataset.impact || 'neutral';
        
        // Créer la modal
        const modal = document.createElement('div');
        modal.className = 'classification-editor-modal';
        modal.id = 'ml-feedback-modal';
        modal.dataset.newsId = newsId;
        modal.dataset.originalImportance = currentImportance;
        modal.dataset.originalImpact = currentImpact;
        
        // Contenu de la modal
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
        
        // Ajouter la modal au DOM
        document.body.appendChild(modal);
    }
    
    /**
     * Ferme la modal de feedback
     */
    closeFeedbackModal() {
        const modal = document.getElementById('ml-feedback-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    /**
     * Enregistre le feedback de l'utilisateur
     */
    saveFeedback() {
        const modal = document.getElementById('ml-feedback-modal');
        if (!modal) return;
        
        // Récupérer les informations
        const newsId = modal.dataset.newsId;
        const originalImportance = modal.dataset.originalImportance;
        const originalImpact = modal.dataset.originalImpact;
        
        const newImportance = document.getElementById('ml-importance-select').value;
        const newImpact = document.getElementById('ml-impact-select').value;
        
        // Ne rien faire si aucun changement
        if (originalImportance === newImportance && originalImpact === newImpact) {
            this.closeFeedbackModal();
            return;
        }
        
        // Trouver la carte d'actualité correspondante
        const newsCard = document.querySelector(`[data-news-id="${newsId}"]`);
        if (!newsCard) {
            this.closeFeedbackModal();
            return;
        }
        
        // Extraire les informations pour le feedback
        const title = newsCard.querySelector('h3')?.textContent || '';
        const content = newsCard.querySelector('p')?.textContent || '';
        const source = newsCard.querySelector('.news-source')?.textContent || '';
        
        // Créer l'objet de feedback
        const feedback = {
            id: `feedback-${Date.now()}`,
            title: title,
            content: content.substring(0, 200), // Limiter la taille
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
        
        // Stocker le feedback
        this.storeFeedback(feedback);
        
        // Mise à jour visuelle
        newsCard.dataset.importance = newImportance;
        newsCard.dataset.impact = newImpact;
        
        // Ajouter effet de mise à jour
        newsCard.classList.add('classification-updated');
        setTimeout(() => {
            newsCard.classList.remove('classification-updated');
        }, 2000);
        
        // Afficher confirmation
        this.showFeedbackSuccess();
        
        // Fermer la modal
        this.closeFeedbackModal();
    }
    
    /**
     * Stocke le feedback dans localStorage
     */
    storeFeedback(feedback) {
        try {
            // Récupérer les feedbacks existants
            let feedbacks = JSON.parse(localStorage.getItem('tradepulse_ml_feedbacks') || '[]');
            
            // Ajouter le nouveau feedback
            feedbacks.push(feedback);
            
            // Enregistrer
            localStorage.setItem('tradepulse_ml_feedbacks', JSON.stringify(feedbacks));
            console.log(`✅ Feedback enregistré (${feedbacks.length} au total)`);
            
            // Afficher le bouton d'export si nécessaire
            if (feedbacks.length >= 3) {
                this.showExportButton(feedbacks.length);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Erreur lors du stockage du feedback:', error);
            return false;
        }
    }
    
    /**
     * Affiche le bouton d'export des feedbacks
     */
    showExportButton(count) {
        // Supprimer le bouton existant s'il y en a un
        const existingButton = document.getElementById('ml-feedback-export');
        if (existingButton) {
            existingButton.remove();
        }
        
        // Créer le bouton d'export
        const exportBtn = document.createElement('button');
        exportBtn.id = 'ml-feedback-export';
        exportBtn.className = 'ml-suggestion-badge';
        exportBtn.innerHTML = `<i class="fas fa-download"></i> Exporter les reclassifications (${count})`;
        exportBtn.title = 'Télécharger les feedbacks pour réentraîner notre modèle ML';
        
        // Positionner le bouton
        exportBtn.style.position = 'fixed';
        exportBtn.style.bottom = '20px';
        exportBtn.style.left = '20px';
        exportBtn.style.zIndex = '999';
        
        // Ajouter au DOM
        document.body.appendChild(exportBtn);
    }
    
    /**
     * Exporte les données de feedback en fichier JSON
     */
    exportFeedbackData() {
        const feedbacksStr = localStorage.getItem('tradepulse_ml_feedbacks');
        if (!feedbacksStr || feedbacksStr === '[]') {
            alert('Aucune reclassification à exporter.');
            return;
        }
        
        // Créer un blob pour le téléchargement
        const blob = new Blob([feedbacksStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        
        // Déclencher le téléchargement
        const a = document.createElement('a');
        a.href = url;
        a.download = `tradepulse_reclassifications_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Demander si l'utilisateur veut effacer les données après export
        if (confirm('Données exportées avec succès! Souhaitez-vous effacer les reclassifications de votre navigateur?')) {
            localStorage.removeItem('tradepulse_ml_feedbacks');
            document.getElementById('ml-feedback-export')?.remove();
        }
    }
    
    /**
     * Affiche une notification de succès après l'enregistrement du feedback
     */
    showFeedbackSuccess() {
        // Créer la notification
        const notification = document.createElement('div');
        notification.className = 'ml-suggestion-badge';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.animation = 'none';
        notification.innerHTML = '<i class="fas fa-check-circle"></i> Merci pour votre contribution!';
        
        // Ajouter au DOM
        document.body.appendChild(notification);
        
        // Supprimer après quelques secondes
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 3000);
    }
}

// Initialiser le système de feedback lorsque la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'instance globale du système
    window.mlFeedbackSystem = new MLFeedbackSystem();
});
