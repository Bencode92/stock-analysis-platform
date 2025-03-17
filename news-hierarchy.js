/**
 * TradePulse - Système de hiérarchisation des actualités
 * Ce module organise les actualités et événements par niveau d'importance
 */

// Mots-clés pour évaluer l'importance des actualités
const NEWS_KEYWORDS = {
    "high_impact": [
        "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", "banque centrale", 
        "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "hausse des taux", 
        "bond yield", "yield curve", "sell-off", "bear market", "effondrement", "chute", "krach",
        "dégringolade", "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion",
        "panique", "défaillance", "correction", "faillite", "taux directeur"
    ],
    "medium_impact": [
        "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
        "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
        "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat",
        "bénéfices", "émission obligataire", "émission d'obligations", "perspectives", "avertissement",
        "rachat", "introduction en bourse", "nouveau PDG", "restructuration"
    ],
    "low_impact": [
        "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
        "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision",
        "nomination", "produit", "service", "stratégie", "marché", "plan", "mise à jour", "tendance"
    ]
};

// Sources de référence dans le domaine financier
const IMPORTANT_SOURCES = [
    "Bloomberg", "Reuters", "WSJ", "FT", "CNBC", "Financial Times", "Wall Street Journal", 
    "Les Échos", "La Tribune", "Le Figaro", "Le Monde", "Le Revenu", "BFM Business", 
    "L'AGEFI", "Investir", "Capital"
];

/**
 * Calcule un score d'importance pour une actualité basé sur son contenu et sa source
 * @param {Object} article - L'article d'actualité à évaluer
 * @returns {number} - Score d'importance
 */
function calculateNewsScore(article) {
    // Créer un texte combiné pour l'analyse
    const content = `${article.title || ""} ${article.content || ""}`.toLowerCase();
    
    let score = 0;
    
    // Ajouter des points selon les occurrences de mots-clés
    for (const word of NEWS_KEYWORDS.high_impact) {
        if (content.includes(word)) {
            score += 10;
        }
    }
    
    for (const word of NEWS_KEYWORDS.medium_impact) {
        if (content.includes(word)) {
            score += 5;
        }
    }
    
    for (const word of NEWS_KEYWORDS.low_impact) {
        if (content.includes(word)) {
            score += 2;
        }
    }
    
    // Ajustement basé sur la source
    if (article.source && IMPORTANT_SOURCES.some(source => article.source.includes(source))) {
        score += 5;
    }
    
    // Bonus pour les actualités négatives (souvent plus impactantes)
    if (article.impact === "negative") {
        score += 3;
    }
    
    // Bonus pour certaines catégories généralement plus importantes
    if (article.category === "economie") {
        score += 3;
    } else if (article.category === "marches") {
        score += 2;
    }
    
    return score;
}

/**
 * Détermine le niveau d'importance d'un événement économique
 * @param {Object} event - L'événement économique à évaluer
 * @returns {string} - Niveau d'importance (high, medium, low)
 */
function determineEventImpact(event) {
    // Événements à fort impact
    const highImpactEvents = [
        "Interest Rate Decision", "Fed Interest Rate", "ECB Interest Rate", 
        "Inflation Rate", "GDP Growth", "GDP Release", "Employment Change",
        "Unemployment Rate", "Non-Farm Payrolls", "CPI", "Retail Sales",
        "FOMC", "FED", "BCE", "ECB", "Fed Chair", "Treasury", "Central Bank",
        "Federal Reserve", "Banque Centrale"
    ];
    
    // Événements à impact moyen
    const mediumImpactEvents = [
        "PMI", "Consumer Confidence", "Trade Balance", "Industrial Production",
        "Manufacturing Production", "Housing Starts", "Building Permits",
        "Durable Goods Orders", "Factory Orders", "Earnings Report", "Balance Sheet",
        "Quarterly Results", "Résultats Trimestriels"
    ];
    
    // Vérifier le nom de l'événement
    const eventName = event.title.toLowerCase();
    
    if (highImpactEvents.some(keyword => eventName.includes(keyword.toLowerCase()))) {
        return "high";
    }
    
    if (mediumImpactEvents.some(keyword => eventName.includes(keyword.toLowerCase()))) {
        return "medium";
    }
    
    // Si l'événement est déjà classé
    if (event.importance === "high") {
        return "high";
    } else if (event.importance === "medium") {
        return "medium";
    }
    
    // Par défaut, impact faible
    return "low";
}

/**
 * Organise les actualités par niveau d'importance
 * @param {Object} newsData - Données d'actualités
 * @returns {Object} - Actualités organisées par niveau d'importance
 */
function organizeNewsByImportance(newsData) {
    if (!newsData || (!newsData.us && !newsData.france)) {
        console.warn("Données d'actualités non valides pour l'organisation");
        return {
            breakingNews: [],
            importantNews: [],
            standardNews: []
        };
    }
    
    // Combiner toutes les actualités
    const allNews = [...(newsData.us || []), ...(newsData.france || [])];
    
    // Calculer les scores si ce n'est pas déjà fait
    const scoredNews = allNews.map(news => {
        if (typeof news.score === 'undefined') {
            return {
                ...news,
                score: calculateNewsScore(news)
            };
        }
        return news;
    });
    
    // Organiser par niveau d'importance basé sur le score
    const breakingNews = scoredNews.filter(item => item.score >= 15);
    const importantNews = scoredNews.filter(item => item.score >= 8 && item.score < 15);
    const standardNews = scoredNews.filter(item => item.score < 8);
    
    return {
        breakingNews,
        importantNews,
        standardNews
    };
}

/**
 * Organise les événements par niveau d'impact
 * @param {Array} events - Liste d'événements
 * @returns {Object} - Événements organisés par niveau d'impact
 */
function organizeEventsByImpact(events) {
    if (!events || !Array.isArray(events)) {
        console.warn("Données d'événements non valides pour l'organisation");
        return {
            highImpactEvents: [],
            mediumImpactEvents: [],
            lowImpactEvents: []
        };
    }
    
    // Évaluer l'impact de chaque événement s'il n'est pas déjà défini
    const processedEvents = events.map(event => {
        if (!event.impact) {
            return {
                ...event,
                impact: determineEventImpact(event)
            };
        }
        return event;
    });
    
    // Organiser par niveau d'impact
    const highImpactEvents = processedEvents.filter(event => event.impact === "high");
    const mediumImpactEvents = processedEvents.filter(event => event.impact === "medium");
    const lowImpactEvents = processedEvents.filter(event => event.impact === "low");
    
    return {
        highImpactEvents,
        mediumImpactEvents,
        lowImpactEvents
    };
}

/**
 * Affiche les actualités "Breaking News" (haute importance)
 * @param {Array} breakingNews - Liste des actualités de haute importance
 */
function displayBreakingNews(breakingNews) {
    const container = document.getElementById('breaking-news-container');
    if (!container) return;
    
    // Si aucune actualité critique, ne pas afficher la section
    if (breakingNews.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    // Titre de section
    let htmlContent = `
    <div class="section-header">
        <i class="fas fa-exclamation-triangle section-icon"></i>
        <h2 class="text-xl font-bold text-red-600">À LA UNE</h2>
    </div>
    <div class="grid grid-cols-1 gap-4">
    `;
    
    // Contenu spécial pour les actualités critiques
    breakingNews.forEach(item => {
        htmlContent += `
        <div class="news-card major-news glassmorphism relative" data-category="${item.category || ''}" data-impact="${item.impact || ''}" data-country="${item.country || ''}">
            <span class="news-importance-tag importance-breaking">URGENT</span>
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-source">${item.source || ''}</span>
                    <div class="news-date-time">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="news-date">${item.date || ''}</span>
                        <span class="news-time">${item.time || ''}</span>
                    </div>
                </div>
                <h3 class="text-lg font-bold">${item.title || ''}</h3>
                <p class="mt-2">${item.content || ''}</p>
            </div>
        </div>`;
    });
    
    htmlContent += `</div>`;
    container.innerHTML = htmlContent;
}

/**
 * Affiche les actualités importantes (importance moyenne)
 * @param {Array} importantNews - Liste des actualités importantes
 */
function displayImportantNews(importantNews) {
    const container = document.getElementById('important-news-container');
    if (!container) return;
    
    // Si aucune actualité importante, ne pas afficher la section
    if (importantNews.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    // Titre de section
    let htmlContent = `
    <div class="section-header">
        <i class="fas fa-fire section-icon text-yellow-500"></i>
        <h2 class="text-lg font-bold text-yellow-500">ACTUALITÉS IMPORTANTES</h2>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    `;
    
    // Contenu pour les actualités importantes
    importantNews.forEach(item => {
        htmlContent += `
        <div class="news-card important-news glassmorphism relative" data-category="${item.category || ''}" data-impact="${item.impact || ''}" data-country="${item.country || ''}">
            <span class="news-importance-tag importance-high">Important</span>
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-source">${item.source || ''}</span>
                    <div class="news-date-time">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="news-date">${item.date || ''}</span>
                        <span class="news-time">${item.time || ''}</span>
                    </div>
                </div>
                <h3 class="text-base font-semibold">${item.title || ''}</h3>
                <p class="mt-2 text-sm">${item.content || ''}</p>
            </div>
        </div>`;
    });
    
    htmlContent += `</div>`;
    container.innerHTML = htmlContent;
}

/**
 * Affiche les événements avec un style basé sur leur importance
 * @param {Object} organizedEvents - Événements organisés par niveau d'impact
 */
function displayOrganizedEvents(organizedEvents) {
    const { highImpactEvents, mediumImpactEvents, lowImpactEvents } = organizedEvents;
    const container = document.getElementById('events-container');
    if (!container) return;
    
    let htmlContent = '';
    
    // Événements à fort impact
    highImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-high-impact p-3 rounded-lg shadow-sm relative" data-impact="high">
            <div class="event-date">
                <div class="event-day font-bold">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-semibold">${event.title || ''}</div>
                <div class="event-details mt-2 text-sm">
                    <span class="event-time"><i class="fas fa-clock"></i> ${event.time || ''}</span>
                    <span class="event-type ${event.type || ''}">${event.type || ''}</span>
                    <span class="impact-badge high-badge">critique</span>
                </div>
            </div>
        </div>`;
    });
    
    // Événements à impact moyen
    mediumImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-medium-impact p-3 rounded-lg shadow-sm relative" data-impact="medium">
            <div class="event-date">
                <div class="event-day font-bold">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-semibold">${event.title || ''}</div>
                <div class="event-details mt-2 text-sm">
                    <span class="event-time"><i class="fas fa-clock"></i> ${event.time || ''}</span>
                    <span class="event-type ${event.type || ''}">${event.type || ''}</span>
                    <span class="impact-badge medium-badge">important</span>
                </div>
            </div>
        </div>`;
    });
    
    // Événements à faible impact
    lowImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-low-impact p-3 rounded-lg shadow-sm relative" data-impact="low">
            <div class="event-date">
                <div class="event-day font-bold">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-semibold">${event.title || ''}</div>
                <div class="event-details mt-2 text-sm">
                    <span class="event-time"><i class="fas fa-clock"></i> ${event.time || ''}</span>
                    <span class="event-type ${event.type || ''}">${event.type || ''}</span>
                    <span class="impact-badge low-badge">standard</span>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = htmlContent;
}

/**
 * Configure les filtres pour les événements
 */
function setupEventFilters() {
    // Boutons de filtrage des événements par impact
    const highImpactBtn = document.getElementById('high-impact-btn');
    const mediumImpactBtn = document.getElementById('medium-impact-btn');
    const allImpactBtn = document.getElementById('all-impact-btn');
    
    if (highImpactBtn && mediumImpactBtn && allImpactBtn) {
        // Filtre pour n'afficher que les événements à fort impact
        highImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('high');
        });
        
        // Filtre pour les événements à impact moyen
        mediumImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('medium');
        });
        
        // Filtre pour afficher tous les événements
        allImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('all');
        });
    }
}

/**
 * Filtre les événements par niveau d'impact
 * @param {string} impactLevel - Niveau d'impact à filtrer
 */
function filterEventsByImpact(impactLevel) {
    const eventElements = document.querySelectorAll('#events-container .event-card');
    
    eventElements.forEach(element => {
        if (impactLevel === 'all') {
            element.style.display = 'flex';
        } else {
            const impact = element.dataset.impact;
            element.style.display = (impact === impactLevel) ? 'flex' : 'none';
        }
    });
}

/**
 * Gère l'activation des filtres
 * @param {HTMLElement} button - Bouton de filtre à activer
 */
function toggleActiveFilter(button) {
    document.querySelectorAll('.filter-active').forEach(el => {
        el.classList.remove('filter-active');
    });
    button.classList.add('filter-active');
}

/**
 * Initialise le système de hiérarchie des actualités
 * @param {Object} newsData - Données d'actualités (si disponibles)
 */
function initNewsHierarchy(newsData) {
    // Si les données sont disponibles, organiser immédiatement
    if (newsData) {
        const { breakingNews, importantNews, standardNews } = organizeNewsByImportance(newsData);
        displayBreakingNews(breakingNews);
        displayImportantNews(importantNews);
        
        // Organiser les événements si présents
        if (newsData.events) {
            const organizedEvents = organizeEventsByImpact(newsData.events);
            displayOrganizedEvents(organizedEvents);
        }
    }
    
    // Configurer les filtres pour les événements
    setupEventFilters();
    
    console.log("✅ Système de hiérarchie des actualités initialisé");
}

// Si le document est déjà chargé
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // Vérifier si les données d'actualités sont déjà disponibles dans window
    if (window.newsData) {
        initNewsHierarchy(window.newsData);
    }
} else {
    // Sinon attendre le chargement du document
    document.addEventListener('DOMContentLoaded', function() {
        // Vérifier si les données d'actualités sont disponibles dans window
        if (window.newsData) {
            initNewsHierarchy(window.newsData);
        }
    });
}

// Exporter les fonctions pour l'utilisation externe
window.newsHierarchy = {
    calculateNewsScore,
    determineEventImpact,
    organizeNewsByImportance,
    organizeEventsByImpact,
    displayBreakingNews,
    displayImportantNews,
    displayOrganizedEvents,
    initNewsHierarchy
};
