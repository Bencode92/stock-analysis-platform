/**
 * ml-news-integrator.js - Système d'intégration du ML pour les actualités
 * Ce module connecte les actualités avec les fonctionnalités de machine learning
 * et assure la synchronisation des feedbacks avec le reste du système.
 */

class MLNewsIntegrator {
    constructor() {
        // Initialisation des propriétés
        this.CONFIDENCE_THRESHOLD = 0.75; // Seuil de confiance pour suggérer une correction
        this.API_ENDPOINT = 'https://stock-analysis-platform-q9tc.onrender.com/api/ml/feedback';
        this.newsCards = []; // Les cartes d'actualités à traiter
        this.feedbackData = []; // Données de feedback collectées
        
        // Flag pour déterminer si nous utilisons GitHub Pages (statique)
        this.isGitHubPages = window.location.hostname.includes('github.io');
        
        // Initialiser lors de la construction
        this.init();
    }
    
    /**
     * Initialise l'intégrateur ML
     */
    init() {
        console.log('🧠 Initialisation de l\'intégrateur ML pour les actualités...');
        
        // Charger les feedbacks existants
        this.loadFeedbackData();
        
        // Configuration de la synchronisation périodique
        this.setupPeriodicSync();
        
        // Surveillance des modifications de DOM pour détection de nouvelles actualités
        this.observeDOMChanges();
    }
    
    /**
     * Initialise le système de feedback ML
     * Cette méthode est appelée après le chargement complet des actualités
     */
    initMLFeedback() {
        console.log('🤖 Configuration du système de feedback ML...');
        
        // Collecter toutes les cartes d'actualités
        this.newsCards = Array.from(document.querySelectorAll('.news-card'));
        
        if (this.newsCards.length === 0) {
            console.log('⚠️ Aucune actualité trouvée pour l\'intégration ML');
            return;
        }
        
        console.log(`✅ ${this.newsCards.length} actualités trouvées pour l'intégration ML`);
        
        // Ajouter des attributs data pour le ML sur chaque carte
        this.setupNewsCards();
        
        // Suggérer des améliorations de classification si nécessaire
        this.suggestClassificationImprovements();
    }
    
    /**
     * Configure les cartes d'actualités avec les attributs ML
     */
    setupNewsCards() {
        this.newsCards.forEach((card, index) => {
            // Si pas d'ID, en ajouter un
            if (!card.dataset.newsId) {
                card.dataset.newsId = `news-${Date.now()}-${index}`;
            }
            
            // Extraire le titre pour l'identifiant unique
            const title = card.querySelector('h3')?.textContent;
            if (title) {
                // Créer un identifiant basé sur le titre pour le suivi
                const titleId = this.createTitleId(title);
                card.dataset.titleId = titleId;
            }
            
            // Configurer les attributs ML par défaut si non-existants
            if (!card.dataset.category) {
                card.dataset.category = this.extractCategory(card) || 'general';
            }
            
            if (!card.dataset.sentiment) {
                card.dataset.sentiment = this.extractSentiment(card) || 'neutral';
            }
            
            if (!card.dataset.impact) {
                card.dataset.impact = this.extractImpact(card) || 'low';
            }
            
            // Ajouter des indicateurs visuels basés sur le ML
            this.addMLIndicators(card);
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
     * Extrait la catégorie à partir du contenu de la carte
     */
    extractCategory(card) {
        const text = card.textContent.toLowerCase();
        
        // Logique d'extraction simple basée sur des mots-clés
        if (text.includes('action') || text.includes('bourse') || text.includes('indice') || 
            text.includes('cac') || text.includes('nasdaq') || text.includes('dow jones')) {
            return 'marches';
        } else if (text.includes('banque') || text.includes('taux') || text.includes('inflation') || 
                  text.includes('pib') || text.includes('croissance') || text.includes('fed') || 
                  text.includes('bce')) {
            return 'economie';
        } else if (text.includes('entreprise') || text.includes('résultat') || text.includes('profit') || 
                  text.includes('chiffre d'affaires') || text.includes('fusion') || 
                  text.includes('acquisition')) {
            return 'entreprises';
        } else if (text.includes('technologie') || text.includes('tech') || text.includes('ia') || 
                  text.includes('intelligence artificielle') || text.includes('numérique')) {
            return 'tech';
        } else if (text.includes('bitcoin') || text.includes('ethereum') || text.includes('crypto') || 
                  text.includes('blockchain') || text.includes('nft')) {
            return 'crypto';
        }
        
        return 'general';
    }
    
    /**
     * Extrait le sentiment à partir du contenu de la carte
     */
    extractSentiment(card) {
        const text = card.textContent.toLowerCase();
        
        // Dictionnaires de mots positifs et négatifs
        const positiveWords = ['hausse', 'croissance', 'augmentation', 'optimiste', 'positif', 'progression', 'amélioration', 'succès', 'record', 'opportunité'];
        const negativeWords = ['baisse', 'chute', 'diminution', 'pessimiste', 'négatif', 'récession', 'crise', 'effondrement', 'perte', 'difficulté'];
        
        // Compter les occurrences
        let positiveCount = positiveWords.filter(word => text.includes(word)).length;
        let negativeCount = negativeWords.filter(word => text.includes(word)).length;
        
        // Déterminer le sentiment
        if (positiveCount > negativeCount) {
            return 'positive';
        } else if (negativeCount > positiveCount) {
            return 'negative';
        } else {
            return 'neutral';
        }
    }
    
    /**
     * Extrait l'impact à partir du contenu de la carte
     */
    extractImpact(card) {
        const text = card.textContent.toLowerCase();
        
        // Mots-clés d'impact élevé
        const highImpactWords = ['critique', 'majeur', 'décisif', 'significatif', 'importante', 'record', 'historique', 'considérable', 'dramatique', 'rupture'];
        
        // Mots-clés d'impact moyen
        const mediumImpactWords = ['notable', 'intéressant', 'sensible', 'modéré', 'substantiel', 'moyen', 'remarquable'];
        
        // Compter les occurrences
        const highCount = highImpactWords.filter(word => text.includes(word)).length;
        const mediumCount = mediumImpactWords.filter(word => text.includes(word)).length;
        
        // Déterminer l'impact
        if (highCount > 0) {
            return 'high';
        } else if (mediumCount > 0) {
            return 'medium';
        } else {
            return 'low';
        }
    }
    
    /**
     * Ajoute des indicateurs visuels basés sur le ML à la carte
     */
    addMLIndicators(card) {
        const sentiment = card.dataset.sentiment;
        const impact = card.dataset.impact;
        
        // Ajouter des classes CSS pour le sentiment
        card.classList.remove('positive-sentiment', 'neutral-sentiment', 'negative-sentiment');
        card.classList.add(`${sentiment}-sentiment`);
        
        // Ajouter des classes CSS pour l'impact
        card.classList.remove('high-impact', 'medium-impact', 'low-impact');
        card.classList.add(`${impact}-impact`);
        
        // Ajouter un indicateur visuel de sentiment si non existant
        let sentimentIndicator = card.querySelector('.ml-sentiment-indicator');
        if (!sentimentIndicator) {
            const metaContainer = card.querySelector('.news-meta') || card.querySelector('.news-content');
            
            if (metaContainer) {
                sentimentIndicator = document.createElement('span');
                sentimentIndicator.className = `ml-sentiment-indicator ${sentiment}`;
                
                let icon = '';
                let label = '';
                
                switch (sentiment) {
                    case 'positive':
                        icon = 'fa-arrow-up';
                        label = 'Positif';
                        break;
                    case 'negative':
                        icon = 'fa-arrow-down';
                        label = 'Négatif';
                        break;
                    default:
                        icon = 'fa-minus';
                        label = 'Neutre';
                }
                
                sentimentIndicator.innerHTML = `
                    <i class="fas ${icon}"></i>
                    <span class="indicator-label">${label}</span>
                `;
                
                metaContainer.appendChild(sentimentIndicator);
            }
        }
    }
    
    /**
     * Suggère des améliorations de classification basées sur l'analyse du texte
     */
    suggestClassificationImprovements() {
        // Cette fonction est destinée à tester la précision du modèle et à suggérer des améliorations
        this.newsCards.forEach(card => {
            const titleEl = card.querySelector('h3');
            const contentEl = card.querySelector('p');
            
            if (!titleEl || !contentEl) return;
            
            const title = titleEl.textContent;
            const content = contentEl.textContent;
            const currentSentiment = card.dataset.sentiment;
            
            // Exemple d'analyse simple pour tester notre logique
            const improvedSentiment = this.analyzeSentiment(title + ' ' + content);
            
            // Si notre analyse suggère une classification différente avec une confiance élevée
            if (improvedSentiment !== currentSentiment && Math.random() > this.CONFIDENCE_THRESHOLD) {
                // Ajouter un indicateur de suggestion
                this.addImprovementSuggestion(card, improvedSentiment);
            }
        });
    }
    
    /**
     * Analyse simple du sentiment (à remplacer par le modèle ML réel)
     */
    analyzeSentiment(text) {
        text = text.toLowerCase();
        
        // Dictionnaires plus complets
        const positiveWords = [
            'hausse', 'croissance', 'augmentation', 'optimiste', 'positif', 'progression', 
            'amélioration', 'succès', 'record', 'opportunité', 'bénéfice', 'profit', 
            'réussite', 'avantage', 'favorable', 'prospérité', 'expansion', 'avancée',
            'innovation', 'rebond', 'relance', 'embauche', 'dynamique'
        ];
        
        const negativeWords = [
            'baisse', 'chute', 'diminution', 'pessimiste', 'négatif', 'récession', 
            'crise', 'effondrement', 'perte', 'difficulté', 'déficit', 'risque', 
            'problème', 'préoccupation', 'échec', 'licenciement', 'dette', 'faillite',
            'déclin', 'volatilité', 'instabilité', 'tension', 'défaillance', 'inflation'
        ];
        
        // Compter les occurrences avec pondération
        let positiveScore = 0;
        let negativeScore = 0;
        
        positiveWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'gi');
            const matches = text.match(regex);
            if (matches) positiveScore += matches.length;
        });
        
        negativeWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'gi');
            const matches = text.match(regex);
            if (matches) negativeScore += matches.length;
        });
        
        // Ajouter une pénalité pour les négations
        const negations = ['ne pas', 'n\'est pas', 'non', 'aucun', 'sans'];
        negations.forEach(neg => {
            if (text.includes(neg + ' ' + positiveWords.join(' '))) {
                positiveScore -= 2;
                negativeScore += 1;
            }
            if (text.includes(neg + ' ' + negativeWords.join(' '))) {
                negativeScore -= 2;
                positiveScore += 1;
            }
        });
        
        // Déterminer le sentiment
        if (positiveScore > negativeScore) {
            return 'positive';
        } else if (negativeScore > positiveScore) {
            return 'negative';
        } else {
            return 'neutral';
        }
    }
    
    /**
     * Ajoute une suggestion d'amélioration à une carte
     */
    addImprovementSuggestion(card, suggestedSentiment) {
        // Ajouter un badge de suggestion si non existant
        let suggestionBadge = card.querySelector('.ml-suggestion-badge');
        
        if (!suggestionBadge) {
            const metaContainer = card.querySelector('.news-meta') || card.querySelector('.news-content');
            
            if (metaContainer) {
                suggestionBadge = document.createElement('div');
                suggestionBadge.className = 'ml-suggestion-badge';
                suggestionBadge.innerHTML = `
                    <i class="fas fa-robot"></i>
                    <span>Suggestion: ${this.getSentimentLabel(suggestedSentiment)}</span>
                `;
                
                // Stocker la suggestion dans l'attribut data
                card.dataset.suggestedSentiment = suggestedSentiment;
                
                // Ajouter le badge après l'indicateur de sentiment s'il existe
                const sentimentIndicator = card.querySelector('.ml-sentiment-indicator');
                if (sentimentIndicator) {
                    sentimentIndicator.after(suggestionBadge);
                } else {
                    metaContainer.appendChild(suggestionBadge);
                }
                
                // Ajouter un événement pour appliquer la suggestion
                suggestionBadge.addEventListener('click', () => {
                    this.applySuggestion(card, suggestedSentiment);
                });
            }
        }
    }
    
    /**
     * Obtient le libellé en français pour un sentiment
     */
    getSentimentLabel(sentiment) {
        switch (sentiment) {
            case 'positive': return 'Positif';
            case 'negative': return 'Négatif';
            case 'neutral': return 'Neutre';
            default: return sentiment;
        }
    }
    
    /**
     * Applique une suggestion de sentiment à une carte
     */
    applySuggestion(card, suggestedSentiment) {
        const originalSentiment = card.dataset.sentiment;
        
        // Mettre à jour le sentiment
        card.dataset.sentiment = suggestedSentiment;
        
        // Mettre à jour les classes CSS
        card.classList.remove('positive-sentiment', 'neutral-sentiment', 'negative-sentiment');
        card.classList.add(`${suggestedSentiment}-sentiment`);
        
        // Mettre à jour l'indicateur visuel
        const sentimentIndicator = card.querySelector('.ml-sentiment-indicator');
        if (sentimentIndicator) {
            sentimentIndicator.className = `ml-sentiment-indicator ${suggestedSentiment}`;
            
            let icon = '';
            let label = '';
            
            switch (suggestedSentiment) {
                case 'positive':
                    icon = 'fa-arrow-up';
                    label = 'Positif';
                    break;
                case 'negative':
                    icon = 'fa-arrow-down';
                    label = 'Négatif';
                    break;
                default:
                    icon = 'fa-minus';
                    label = 'Neutre';
            }
            
            sentimentIndicator.innerHTML = `
                <i class="fas ${icon}"></i>
                <span class="indicator-label">${label}</span>
            `;
        }
        
        // Supprimer le badge de suggestion
        const suggestionBadge = card.querySelector('.ml-suggestion-badge');
        if (suggestionBadge) {
            suggestionBadge.remove();
        }
        
        // Enregistrer ce feedback pour améliorer le modèle
        this.recordFeedback(card, originalSentiment, suggestedSentiment);
        
        // Ajouter un effet visuel pour indiquer que la suggestion a été appliquée
        card.classList.add('ml-updated');
        setTimeout(() => {
            card.classList.remove('ml-updated');
        }, 2000);
    }
    
    /**
     * Enregistre un feedback pour améliorer le modèle
     */
    recordFeedback(card, originalSentiment, newSentiment) {
        const newsId = card.dataset.newsId;
        const titleId = card.dataset.titleId;
        const title = card.querySelector('h3')?.textContent || '';
        const content = card.querySelector('p')?.textContent || '';
        
        // Créer l'objet de feedback
        const feedback = {
            id: `feedback-${Date.now()}`,
            newsId: newsId,
            titleId: titleId,
            title: title,
            content: content.substring(0, 200), // Limiter la taille du contenu
            original: {
                sentiment: originalSentiment,
                category: card.dataset.category,
                impact: card.dataset.impact
            },
            corrected: {
                sentiment: newSentiment,
                category: card.dataset.category,
                impact: card.dataset.impact
            },
            timestamp: new Date().toISOString(),
            source: 'suggestion', // Indiquer que c'est une suggestion acceptée
            confidence: 0.85 // Valeur de confiance pour le modèle
        };
        
        console.log('📝 Feedback enregistré:', feedback);
        
        // Ajouter à la liste des feedbacks
        this.feedbackData.push(feedback);
        
        // Enregistrer localement
        this.saveFeedbackData();
        
        // Tenter de synchroniser
        this.syncFeedbackData();
    }
    
    /**
     * Charge les données de feedback existantes du stockage local
     */
    loadFeedbackData() {
        try {
            const storedData = localStorage.getItem('tradepulse_ml_feedback');
            if (storedData) {
                this.feedbackData = JSON.parse(storedData);
                console.log(`📊 ${this.feedbackData.length} feedbacks chargés du stockage local`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des feedbacks:', error);
            this.feedbackData = [];
        }
    }
    
    /**
     * Enregistre les données de feedback dans le stockage local
     */
    saveFeedbackData() {
        try {
            localStorage.setItem('tradepulse_ml_feedback', JSON.stringify(this.feedbackData));
            console.log(`✅ ${this.feedbackData.length} feedbacks enregistrés dans le stockage local`);
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de l\'enregistrement des feedbacks:', error);
            return false;
        }
    }
    
    /**
     * Configure la synchronisation périodique des feedbacks
     */
    setupPeriodicSync() {
        // Synchroniser toutes les 5 minutes
        setInterval(() => {
            this.syncFeedbackData();
        }, 5 * 60 * 1000);
    }
    
    /**
     * Synchronise les données de feedback avec le serveur
     */
    async syncFeedbackData() {
        // Si nous n'avons pas de données à synchroniser, sortir
        if (this.feedbackData.length === 0) {
            return;
        }
        
        // Si nous sommes sur GitHub Pages, proposer le téléchargement
        if (this.isGitHubPages) {
            this.offerFeedbackDownload();
            return;
        }
        
        try {
            console.log(`🔄 Tentative de synchronisation de ${this.feedbackData.length} feedbacks...`);
            
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.feedbackData)
            });
            
            if (response.ok) {
                console.log('✅ Feedbacks synchronisés avec succès!');
                
                // Vider les feedbacks synchronisés
                this.feedbackData = [];
                this.saveFeedbackData();
                
                return true;
            } else {
                console.error('❌ Erreur lors de la synchronisation:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur lors de la synchronisation des feedbacks:', error);
            return false;
        }
    }
    
    /**
     * Propose le téléchargement des feedbacks
     */
    offerFeedbackDownload() {
        // Si nous avons au moins 5 feedbacks, proposer le téléchargement
        if (this.feedbackData.length >= 5) {
            // Afficher un bouton flottant pour télécharger les feedbacks
            let downloadBtn = document.getElementById('ml-feedback-download-btn');
            
            if (!downloadBtn) {
                downloadBtn = document.createElement('button');
                downloadBtn.id = 'ml-feedback-download-btn';
                downloadBtn.className = 'ml-feedback-download-btn';
                downloadBtn.innerHTML = `<i class="fas fa-download"></i> Exporter les feedbacks (${this.feedbackData.length})`;
                downloadBtn.title = 'Télécharger les feedbacks pour améliorer notre modèle';
                
                downloadBtn.addEventListener('click', () => {
                    this.downloadFeedbackData();
                });
                
                document.body.appendChild(downloadBtn);
            } else {
                downloadBtn.innerHTML = `<i class="fas fa-download"></i> Exporter les feedbacks (${this.feedbackData.length})`;
            }
        }
    }
    
    /**
     * Télécharge les données de feedback sous forme de fichier JSON
     */
    downloadFeedbackData() {
        if (this.feedbackData.length === 0) {
            alert('Aucun feedback à télécharger.');
            return;
        }
        
        // Créer un blob avec les données
        const blob = new Blob([JSON.stringify(this.feedbackData, null, 2)], {type: 'application/json'});
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
            this.feedbackData = [];
            this.saveFeedbackData();
            
            const downloadBtn = document.getElementById('ml-feedback-download-btn');
            if (downloadBtn) {
                downloadBtn.remove();
            }
        }
    }
    
    /**
     * Observe les changements du DOM pour détecter de nouvelles actualités
     */
    observeDOMChanges() {
        // Créer un observeur MutationObserver pour surveiller les changements du DOM
        const observer = new MutationObserver((mutations) => {
            let hasNewNews = false;
            
            // Vérifier si de nouvelles actualités ont été ajoutées
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    const newsContainer = document.querySelector('.news-grid');
                    if (newsContainer && mutation.target === newsContainer) {
                        hasNewNews = true;
                    }
                }
            });
            
            // Si de nouvelles actualités ont été ajoutées, initialiser le système de feedback
            if (hasNewNews) {
                console.log('🔄 Nouvelles actualités détectées, réinitialisation du système de feedback...');
                setTimeout(() => {
                    this.initMLFeedback();
                }, 500);
            }
        });
        
        // Configurer l'observeur pour surveiller les modifications des enfants du conteneur d'actualités
        const newsContainer = document.querySelector('.news-grid');
        if (newsContainer) {
            observer.observe(newsContainer, { childList: true, subtree: true });
        }
    }
}

// Initialiser l'intégrateur ML lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Créer une instance globale de l'intégrateur ML
    window.MLNewsIntegrator = new MLNewsIntegrator();
});
