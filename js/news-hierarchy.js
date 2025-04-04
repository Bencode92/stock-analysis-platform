/**
 * news-hierarchy.js
 * Système central de hiérarchisation des actualités financières
 */

// Namespace global pour les actualités
window.NewsSystem = {
    data: null,
    isLoading: false,
    // Stockage des catégories d'actualités
    categorizedNews: {
        critical: [],
        important: [],
        regular: []
    },
    // Événement personnalisé pour notifier quand les données sont prêtes
    dataReadyEvent: new CustomEvent('newsDataReady')
};

// Initialisation: ajouter cette fonction au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page des actualités
    const newsContainers = document.getElementById('critical-news-container') || 
                           document.getElementById('important-news-container') || 
                           document.getElementById('recent-news');
    
    if (newsContainers) {
        console.log('Initialisation du système de hiérarchie des actualités');
        initializeNewsData();
    }
});

/**
 * Charge et initialise les données d'actualités
 */
async function initializeNewsData() {
    if (window.NewsSystem.isLoading) return;
    
    window.NewsSystem.isLoading = true;
    
    try {
        // Afficher les états de chargement dans les conteneurs
        showLoadingState('critical-news-container');
        showLoadingState('important-news-container');
        showLoadingState('recent-news');
        
        let data;
        
        // CORRECTION: Revenir à classified_news.json pour les données hiérarchisées
        console.log('📊 Chargement des données classifiées depuis classified_news.json');
        const response = await fetch('data/classified_news.json');
        
        if (!response.ok) {
            throw new Error('Impossible de charger les données');
        }
        
        data = await response.json();
        console.log('✅ Données classifiées chargées avec succès');
        
        window.NewsSystem.data = data;
        
        // Distribuer les actualités selon leur importance/hiérarchie
        distributeNewsByImportance(data);
        
        console.log('Données d\'actualités chargées et distribuées');
        
        // Déclencher l'événement qui indique que les données sont prêtes
        document.dispatchEvent(window.NewsSystem.dataReadyEvent);
        console.log('Événement newsDataReady déclenché après chargement des données');
    } catch (error) {
        console.error('Erreur lors du chargement des actualités:', error);
        displayFallbackData();
    } finally {
        window.NewsSystem.isLoading = false;
    }
}

/**
 * Distribue les actualités par niveau d'importance
 * @param {Object} newsData - Données d'actualités
 */
function distributeNewsByImportance(newsData) {
    // Vérification des données
    if (!newsData || (!newsData.usa && !newsData.france)) {
        console.error("Données d'actualités non disponibles");
        return;
    }

    // Fusionner les actualités US et France
    const allNews = [...(newsData.usa || []), ...(newsData.france || [])];

    // S'assurer que tous les champs ML sont présents
    allNews.forEach(news => {
        // Utiliser les attributs existants ou les calculer si non présents
        if (!news.sentiment) {
            news.sentiment = news.impact || 'neutral';
        }
        
        if (typeof news.confidence === 'undefined') {
            news.confidence = news.feedback_confidence || 0.8;
        }
        
        if (typeof news.score === 'undefined') {
            news.score = calculateNewsScore(news);
        }
        
        // CORRECTION: S'assurer que impact est toujours défini correctement
        if (!news.impact || news.impact === 'general') {
            // Si pas d'impact ou si 'general', utiliser le sentiment comme base
            if (news.sentiment === 'positive') {
                news.impact = 'positive';
            } else if (news.sentiment === 'negative') {
                news.impact = 'negative';
            } else {
                news.impact = 'neutral';
            }
        }
        
        // Utiliser hierarchy si présent, sinon dériver du score
        if (!news.hierarchy) {
            if (news.score >= 15) {
                news.hierarchy = 'critical';
            } else if (news.score >= 8) {
                news.hierarchy = 'important';
            } else {
                news.hierarchy = 'normal';
            }
        }
        
        // NOUVEAU: Conversion des catégories en français vers l'anglais
        if (news.category === 'economie') {
            news.category = 'economy';
        } else if (news.category === 'marches') {
            news.category = 'markets';
        } else if (news.category === 'entreprises') {
            news.category = 'companies';
        }
    });

    // Filtrer les actualités par hiérarchie (préférer hierarchy sur score si disponible)
    const criticalNews = allNews.filter(news => 
        news.hierarchy === 'critical' || (!news.hierarchy && news.score >= 15)
    );
    
    const importantNews = allNews.filter(news => 
        news.hierarchy === 'important' || (!news.hierarchy && news.score >= 8 && news.score < 15)
    );
    
    const regularNews = allNews.filter(news => 
        news.hierarchy === 'normal' || (!news.hierarchy && news.score < 8)
    );
    
    // AMÉLIORATION: Tri par score ML décroissant à l'intérieur de chaque catégorie
    criticalNews.sort((a, b) => {
        // Priorité au score ML, puis à la confiance en cas d'égalité
        if (b.score !== a.score) return b.score - a.score;
        return b.confidence - a.confidence;
    });
    
    importantNews.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.confidence - a.confidence;
    });
    
    regularNews.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.confidence - a.confidence;
    });

    // Stocker les actualités catégorisées
    window.NewsSystem.categorizedNews = {
        critical: criticalNews,
        important: importantNews,
        regular: regularNews
    };

    // NOUVEAU: Logs de débogage pour vérifier les nombres d'actualités par catégorie
    console.log(`Actualités critiques: ${criticalNews.length}`);
    console.log(`Actualités importantes: ${importantNews.length}`);
    console.log(`Actualités générales: ${regularNews.length}`);

    // NOUVEAU: Logs de débogage pour vérifier la répartition des sentiments
    const positiveCount = allNews.filter(n => n.sentiment === 'positive').length;
    const negativeCount = allNews.filter(n => n.sentiment === 'negative').length;
    const neutralCount = allNews.filter(n => n.sentiment === 'neutral' || !n.sentiment).length;
    console.log(`Sentiments: ${positiveCount} positifs, ${negativeCount} négatifs, ${neutralCount} neutres`);

    // Afficher dans les sections correspondantes
    displayCriticalNews(criticalNews);
    displayImportantNews(importantNews);
    displayRecentNews(regularNews);

    console.log(`Actualités distribuées: ${criticalNews.length} critiques, ${importantNews.length} importantes, ${regularNews.length} régulières`);
}

/**
 * Calcule un score pour classer l'importance d'une actualité
 * @param {Object} item - Élément d'actualité
 * @returns {number} - Score d'importance
 */
function calculateNewsScore(item) {
    const content = `${item.title} ${item.content || ''}`.toLowerCase();

    const keywords = {
        "high_impact": [
            "crash", "collapse", "recession", "fail", "bankruptcy", 
            "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", 
            "bond yield", "yield curve", "sell-off", "bear market", "contagion"
        ],
        "medium_impact": [
            "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
            "ipo", "merger", "partnership", "profit warning", "bond issuance", "employment", 
            "report", "fe