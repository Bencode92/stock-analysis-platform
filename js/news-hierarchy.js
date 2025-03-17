/**
 * news-hierarchy.js
 * Système de hiérarchisation des actualités financières
 */

// Fonction principale pour distribuer les actualités par importance
function distributeNewsByImportance(newsData) {
    // Vérification des données
    if (!newsData || (!newsData.us && !newsData.france)) {
        console.error("Données d'actualités non disponibles");
        return;
    }

    // Fusionner les actualités US et France
    const allNews = [...(newsData.us || []), ...(newsData.france || [])];

    // S'assurer que les scores sont présents, sinon calculer
    allNews.forEach(news => {
        if (typeof news.score === 'undefined') {
            news.score = calculateNewsScore(news);
        }
    });

    // Filtrer les actualités par score
    const criticalNews = allNews.filter(news => news.score >= 15);
    const importantNews = allNews.filter(news => news.score >= 8 && news.score < 15);
    const regularNews = allNews.filter(news => news.score < 8);

    // Afficher dans les sections correspondantes
    displayCriticalNews(criticalNews);
    displayImportantNews(importantNews);
    
    // Votre fonction existante pour afficher les actualités régulières peut être appelée ici
    // displayRecentNews(regularNews);

    console.log(`Actualités distribuées: ${criticalNews.length} critiques, ${importantNews.length} importantes, ${regularNews.length} régulières`);
}

// Calcule un score pour classer l'importance d'une actualité
function calculateNewsScore(item) {
    const content = `${item.title} ${item.content || ''}`.toLowerCase();

    const keywords = {
        "high_impact": [
            "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", "banque centrale", 
            "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "hausse des taux", 
            "bond yield", "yield curve", "sell-off", "bear market", "effondrement", "chute", "krach",
            "dégringolade", "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion"
        ],
        "medium_impact": [
            "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
            "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
            "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat"
        ],
        "low_impact": [
            "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
            "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision"
        ]
    };

    let score = 0;

    // Ajouter des points selon les occurrences de mots-clés
    for (const word of keywords.high_impact) {
        if (content.includes(word)) score += 10;
    }
    
    for (const word of keywords.medium_impact) {
        if (content.includes(word)) score += 5;
    }
    
    for (const word of keywords.low_impact) {
        if (content.includes(word)) score += 2;
    }

    // Ajustement basé sur la source
    const importantSources = ["Bloomberg", "Reuters", "WSJ", "FT", "CNBC", "Financial Times", "Wall Street Journal"];
    if (importantSources.some(source => (item.source || '').includes(source))) {
        score += 5;
    }

    // Bonus pour les actualités négatives (souvent plus impactantes)
    if (item.impact === 'negative') {
        score += 3;
    }

    // Bonus pour certaines catégories généralement plus importantes
    if (item.category === 'economie') {
        score += 3;
    } else if (item.category === 'marches') {
        score += 2;
    }

    return score;
}

// Fonction pour afficher les actualités critiques
function displayCriticalNews(news) {
    const container = document.getElementById('critical-news-container');
    if (!container) {
        console.error("Conteneur d'actualités critiques introuvable");
        return;
    }

    // Arrêter l'animation de chargement
    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucune actualité critique pour le moment</p>';
        return;
    }

    // Créer les cartes d'actualités critiques
    news.forEach((item, index) => {
        // Détermine la classe CSS basée sur l'impact
        const impactClass = item.impact === 'negative' ? 'bg-red-800 bg-opacity-20 border-red-700' : 
                           item.impact === 'positive' ? 'bg-green-800 bg-opacity-20 border-green-700' : 
                           'bg-yellow-800 bg-opacity-20 border-yellow-700';
                           
        // Texte descriptif de l'impact
        const impactText = item.impact === 'negative' ? 'Impact négatif' : 
                          item.impact === 'positive' ? 'Impact positif' : 'Impact neutre';
                          
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;

        container.innerHTML += `
            <div class="news-card glassmorphism ${impactClass}" style="animation-delay: ${index * 0.1}s">
                <span class="badge urgent">URGENT</span>
                <div class="p-4">
                    <div class="mb-2">
                        <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                        <span class="impact-indicator">${item.category || 'Finance'}</span>
                    </div>
                    <h3 class="text-lg font-bold">${item.title}</h3>
                    <p class="text-sm mt-2">${item.content}</p>
                    <div class="news-meta">
                        <span class="source">${item.source}</span>
                        <div class="date-time">
                            <i class="fas fa-clock mr-1"></i>
                            ${item.date} ${item.time}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

// Fonction pour afficher les actualités importantes
function displayImportantNews(news) {
    const container = document.getElementById('important-news-container');
    if (!container) {
        console.error("Conteneur d'actualités importantes introuvable");
        return;
    }

    // Arrêter l'animation de chargement
    container.innerHTML = '';

    if (news.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucune actualité importante pour le moment</p>';
        return;
    }

    // Créer les cartes d'actualités importantes
    news.forEach((item, index) => {
        // Détermine la classe CSS basée sur l'impact
        const impactClass = item.impact === 'negative' ? 'bg-red-700 bg-opacity-10 border-red-600' : 
                           item.impact === 'positive' ? 'bg-green-700 bg-opacity-10 border-green-600' : 
                           'bg-yellow-700 bg-opacity-10 border-yellow-600';
                           
        // Texte descriptif de l'impact
        const impactText = item.impact === 'negative' ? 'Impact négatif' : 
                          item.impact === 'positive' ? 'Impact positif' : 'Impact neutre';
                          
        // Classe de l'indicateur d'impact
        const impactIndicatorClass = `impact-${item.impact}`;

        container.innerHTML += `
            <div class="news-card glassmorphism ${impactClass}" style="animation-delay: ${index * 0.1}s">
                <div class="p-4">
                    <div class="mb-2">
                        <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                        <span class="impact-indicator">${item.category || 'Finance'}</span>
                    </div>
                    <h3 class="text-md font-semibold">${item.title}</h3>
                    <p class="text-sm mt-2">${item.content}</p>
                    <div class="news-meta">
                        <span class="source">${item.source}</span>
                        <div class="date-time">
                            <i class="fas fa-clock mr-1"></i>
                            ${item.date} ${item.time}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

// Initialisation: ajouter cette fonction au chargement des actualités
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page des actualités
    const criticalNewsContainer = document.getElementById('critical-news-container');
    const importantNewsContainer = document.getElementById('important-news-container');
    
    if (criticalNewsContainer || importantNewsContainer) {
        console.log('Initialisation du système de hiérarchie des actualités');
        
        // Charger les données d'actualités
        fetch('data/news.json')
            .then(response => response.json())
            .then(data => {
                // Distribuer les actualités selon leur importance
                distributeNewsByImportance(data);
            })
            .catch(error => {
                console.error('Erreur lors du chargement des actualités:', error);
                // Gérer l'erreur de chargement
            });
    }
});
