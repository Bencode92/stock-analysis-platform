/**
 * TradePulse - Enhanced News Hierarchy System (Investor-Grade)
 * This module organizes news and events by importance level with enhanced investor focus
 */

// Enhanced keywords for evaluating news importance with investor-grade criteria
const NEWS_KEYWORDS = {
    "high_impact": [
        // Market & macro shocks - Enhanced for investor relevance
        "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", "banque centrale", 
        "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "hausse des taux", 
        "bond yield", "yield curve", "sell-off", "bear market", "effondrement", "chute", "krach",
        "dégringolade", "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion",
        "panique", "défaillance", "correction", "faillite", "taux directeur",
        // Enhanced macro indicators
        "cpi", "pce", "core inflation", "stagflation", "volatility spike", "credit spread",
        // Corporate fundamentals red flags
        "profit warning", "guidance cut", "eps miss", "dividend cut", "insolvency"
    ],
    "medium_impact": [
        "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
        "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
        "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat",
        "bénéfices", "émission obligataire", "émission d'obligations", "perspectives", "avertissement",
        "rachat", "introduction en bourse", "nouveau PDG", "restructuration",
        // Enhanced fundamentals
        "earnings beat", "revenue beat", "free cash flow", "margin expansion", "buyback",
        "payrolls", "unemployment rate", "pmi", "ism", "consumer confidence"
    ],
    "low_impact": [
        "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
        "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision",
        "nomination", "produit", "service", "stratégie", "marché", "plan", "mise à jour", "tendance",
        "product launch", "pilot", "collaboration", "award", "marketing", "prototype"
    ]
};

// Enhanced reference sources with premium tier focus
const IMPORTANT_SOURCES = [
    // Premium tier
    "Bloomberg", "Reuters", "WSJ", "FT", "Financial Times", "Wall Street Journal",
    // Investment focus
    "Barron's", "MarketWatch", "Seeking Alpha", "Investor's Business Daily", "Morningstar",
    // French premium
    "Les Échos", "La Tribune", "Le Figaro", "Le Monde", "Le Revenu", "BFM Business", 
    "L'AGEFI", "Investir", "Capital",
    // International premium
    "CNBC", "The Economist", "BBC"
];

// Enhanced premium sources for extra scoring
const PREMIUM_SOURCES = [
    "bloomberg", "financial times", "wall street journal", "reuters", "the economist"
];

/**
 * Enhanced importance scoring with investor-grade criteria
 * @param {Object} article - The news article to evaluate
 * @returns {number} - Importance score (0-100)
 */
function calculateNewsScore(article) {
    const content = `${article.title || ""} ${article.content || ""}`.toLowerCase();
    
    let score = 0;
    
    // Enhanced keyword scoring with investor focus
    for (const word of NEWS_KEYWORDS.high_impact) {
        if (content.includes(word)) {
            score += 12; // Increased weight for high impact
        }
    }
    
    for (const word of NEWS_KEYWORDS.medium_impact) {
        if (content.includes(word)) {
            score += 6; // Balanced medium impact
        }
    }
    
    for (const word of NEWS_KEYWORDS.low_impact) {
        if (content.includes(word)) {
            score += 2; // Reduced low impact noise
        }
    }
    
    // Enhanced source scoring with premium boost
    const source = (article.source || "").toLowerCase();
    if (IMPORTANT_SOURCES.some(src => source.includes(src.toLowerCase()))) {
        score += 8; // Increased source weight
    }
    
    // Premium source super-boost
    if (PREMIUM_SOURCES.some(premium => source.includes(premium))) {
        score += 12; // Premium source bonus
    }
    
    // Enhanced impact weighting
    if (article.impact === "negative") {
        score += 5; // Negative news often more market-moving
    } else if (article.impact === "positive") {
        score += 3; // Positive news moderate boost
    }
    
    // Enhanced category scoring for investor relevance
    if (article.category === "economie" || article.category === "economy") {
        score += 4; // Macro news critical for investors
    } else if (article.category === "marches" || article.category === "markets") {
        score += 3; // Market news important
    } else if (article.category === "companies") {
        score += 2; // Company-specific news
    }
    
    // Fundamentals bonus - New enhancement
    const fundamentalsKeywords = ["eps", "revenue", "guidance", "margin", "buyback", "dividend", "leverage"];
    if (fundamentalsKeywords.some(keyword => content.includes(keyword))) {
        score += 4; // Fundamentals analysis bonus
    }
    
    // Macro indicators bonus - New enhancement  
    const macroKeywords = ["cpi", "pce", "payrolls", "gdp", "pmi", "ism"];
    if (macroKeywords.some(keyword => content.includes(keyword))) {
        score += 6; // Key macro indicators bonus
    }
    
    return Math.min(100, score); // Cap at 100
}

/**
 * Enhanced event impact determination with investor focus
 * @param {Object} event - The economic event to evaluate
 * @returns {string} - Impact level (high, medium, low)
 */
function determineEventImpact(event) {
    // Enhanced high-impact events for investors
    const highImpactEvents = [
        "Interest Rate Decision", "Fed Interest Rate", "ECB Interest Rate", "BOJ Interest Rate",
        "Inflation Rate", "CPI", "PCE", "Core CPI", "Core PCE",
        "GDP Growth", "GDP Release", "GDP Preliminary", "GDP Final",
        "Employment Change", "Unemployment Rate", "Non-Farm Payrolls", "ADP Employment",
        "FOMC", "FED", "BCE", "ECB", "Fed Chair", "Treasury", "Central Bank",
        "Federal Reserve", "Banque Centrale", "Retail Sales", "Consumer Spending",
        // Enhanced fundamentals events
        "Earnings Season", "Earnings Report", "Quarterly Results", "Annual Results",
        "Dividend Declaration", "Stock Split", "Share Buyback Announcement"
    ];
    
    // Enhanced medium-impact events
    const mediumImpactEvents = [
        "PMI", "ISM", "Consumer Confidence", "Business Confidence", "Trade Balance", 
        "Industrial Production", "Manufacturing Production", "Housing Starts", "Building Permits",
        "Durable Goods Orders", "Factory Orders", "Initial Claims", "Continuing Claims",
        "Producer Price Index", "PPI", "Import Price Index", "Export Price Index",
        "Consumer Credit", "Business Inventories", "Wholesale Inventories",
        // Corporate events
        "Merger Announcement", "Acquisition", "IPO", "Corporate Restructuring"
    ];
    
    const eventName = (event.title || "").toLowerCase();
    
    // Check for high impact patterns
    if (highImpactEvents.some(keyword => eventName.includes(keyword.toLowerCase()))) {
        return "high";
    }
    
    // Check for medium impact patterns
    if (mediumImpactEvents.some(keyword => eventName.includes(keyword.toLowerCase()))) {
        return "medium";
    }
    
    // Enhanced pattern matching for investor relevance
    if (eventName.includes("earnings") || eventName.includes("résultats")) {
        return "medium"; // Earnings always medium+ importance
    }
    
    if (eventName.includes("fed") || eventName.includes("ecb") || eventName.includes("central bank")) {
        return "high"; // Central bank communications always high
    }
    
    // Existing classification fallback
    if (event.importance === "high") {
        return "high";
    } else if (event.importance === "medium") {
        return "medium";
    }
    
    return "low";
}

/**
 * Enhanced news organization with investor-grade thresholds
 * @param {Object} newsData - News data
 * @returns {Object} - Organized news by importance
 */
function organizeNewsByImportance(newsData) {
    if (!newsData || (!newsData.us && !newsData.france && !newsData.europe_other)) {
        console.warn("Invalid news data for organization");
        return {
            breakingNews: [],
            importantNews: [],
            standardNews: []
        };
    }
    
    // Combine all news from enhanced geographic regions
    const allNews = [
        ...(newsData.us || []), 
        ...(newsData.france || []),
        ...(newsData.europe_other || []),
        ...(newsData.asia || []),
        ...(newsData.emerging_markets || []),
        ...(newsData.global || [])
    ];
    
    // Calculate scores with enhanced criteria
    const scoredNews = allNews.map(news => {
        if (typeof news.score === 'undefined') {
            return {
                ...news,
                score: calculateNewsScore(news)
            };
        }
        return news;
    });
    
    // Enhanced thresholds for investor-grade filtering
    const breakingNews = scoredNews.filter(item => item.score >= 20); // Raised threshold
    const importantNews = scoredNews.filter(item => item.score >= 12 && item.score < 20); // Optimized range
    const standardNews = scoredNews.filter(item => item.score < 12);
    
    return {
        breakingNews,
        importantNews,
        standardNews
    };
}

/**
 * Enhanced event organization with investor focus
 * @param {Array} events - List of events
 * @returns {Object} - Events organized by impact level
 */
function organizeEventsByImpact(events) {
    if (!events || !Array.isArray(events)) {
        console.warn("Invalid events data for organization");
        return {
            highImpactEvents: [],
            mediumImpactEvents: [],
            lowImpactEvents: []
        };
    }
    
    // Enhanced event processing with investor criteria
    const processedEvents = events.map(event => {
        if (!event.impact) {
            return {
                ...event,
                impact: determineEventImpact(event)
            };
        }
        return event;
    });
    
    // Filter and sort by impact with enhanced criteria
    const highImpactEvents = processedEvents
        .filter(event => event.impact === "high")
        .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));
        
    const mediumImpactEvents = processedEvents
        .filter(event => event.impact === "medium")
        .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));
        
    const lowImpactEvents = processedEvents
        .filter(event => event.impact === "low")
        .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));
    
    return {
        highImpactEvents,
        mediumImpactEvents,
        lowImpactEvents
    };
}

/**
 * Enhanced display for breaking news with investor focus
 * @param {Array} breakingNews - List of breaking news
 */
function displayBreakingNews(breakingNews) {
    const container = document.getElementById('critical-news-container');
    if (!container) return;
    
    // Hide section if no critical news
    if (breakingNews.length === 0) {
        container.innerHTML = `
        <div class="no-news-message glassmorphism p-6 rounded-lg text-center">
            <i class="fas fa-check-circle text-green-400 text-2xl mb-2"></i>
            <p class="text-gray-400">Aucune actualité critique détectée actuellement</p>
            <p class="text-sm text-gray-500 mt-1">Les marchés semblent calmes</p>
        </div>`;
        return;
    }
    
    let htmlContent = '';
    
    // Enhanced critical news display
    breakingNews.forEach((item, index) => {
        const urgencyClass = item.score >= 30 ? 'critical-urgent' : 'critical-high';
        const scoreDisplay = Math.round(item.score || 0);
        
        htmlContent += `
        <div class="news-card ${urgencyClass} glassmorphism relative mb-4" 
             data-category="${item.category || ''}" 
             data-impact="${item.impact || ''}" 
             data-country="${item.country || ''}"
             data-score="${scoreDisplay}">
            
            <div class="news-importance-indicators">
                <span class="news-importance-tag importance-breaking">
                    🚨 CRITIQUE
                </span>
                <span class="news-score-badge">
                    Score: ${scoreDisplay}
                </span>
            </div>
            
            <div class="news-content">
                <div class="news-meta enhanced">
                    <span class="news-source premium">${item.source || ''}</span>
                    <div class="news-date-time">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="news-date">${item.date || ''}</span>
                        <span class="news-time">${item.time || ''}</span>
                    </div>
                    <div class="news-category-tag ${item.category || ''}">
                        ${item.category || 'Général'}
                    </div>
                </div>
                
                <h3 class="text-lg font-bold text-red-400 leading-tight mb-3">
                    ${item.title || ''}
                </h3>
                
                <p class="text-gray-300 leading-relaxed mb-3">
                    ${(item.content || '').substring(0, 200)}${(item.content || '').length > 200 ? '...' : ''}
                </p>
                
                <div class="news-footer enhanced">
                    <div class="news-themes">
                        ${Object.entries(item.themes || {}).map(([axis, themes]) => 
                            themes.map(theme => `<span class="theme-tag ${axis}">${theme}</span>`).join('')
                        ).join('')}
                    </div>
                    
                    <div class="news-actions">
                        ${item.url ? `<a href="${item.url}" target="_blank" class="news-link">
                            <i class="fas fa-external-link-alt"></i> Lire l'article
                        </a>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = htmlContent;
}

/**
 * Enhanced display for important news
 * @param {Array} importantNews - List of important news
 */
function displayImportantNews(importantNews) {
    const container = document.getElementById('important-news-container');
    if (!container) return;
    
    if (importantNews.length === 0) {
        container.innerHTML = `
        <div class="no-news-message glassmorphism p-4 rounded-lg text-center">
            <i class="fas fa-info-circle text-blue-400 text-xl mb-2"></i>
            <p class="text-gray-400">Aucune actualité importante en ce moment</p>
        </div>`;
        return;
    }
    
    let htmlContent = '';
    
    // Enhanced important news display with improved layout
    importantNews.forEach((item, index) => {
        const scoreDisplay = Math.round(item.score || 0);
        
        htmlContent += `
        <div class="news-card important-news glassmorphism relative" 
             data-category="${item.category || ''}" 
             data-impact="${item.impact || ''}" 
             data-country="${item.country || ''}"
             data-score="${scoreDisplay}">
            
            <div class="news-importance-indicators">
                <span class="news-importance-tag importance-high">
                    🔥 IMPORTANT
                </span>
                <span class="news-score-badge secondary">
                    ${scoreDisplay}
                </span>
            </div>
            
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-source">${item.source || ''}</span>
                    <div class="news-date-time">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="news-date">${item.date || ''}</span>
                        <span class="news-time">${item.time || ''}</span>
                    </div>
                </div>
                
                <h3 class="text-base font-semibold text-yellow-400 leading-tight mb-2">
                    ${item.title || ''}
                </h3>
                
                <p class="text-sm text-gray-400 leading-relaxed mb-3">
                    ${(item.content || '').substring(0, 150)}${(item.content || '').length > 150 ? '...' : ''}
                </p>
                
                <div class="news-footer">
                    <div class="news-themes compact">
                        ${Object.entries(item.themes || {}).map(([axis, themes]) => 
                            themes.slice(0, 2).map(theme => `<span class="theme-tag ${axis} small">${theme}</span>`).join('')
                        ).join('')}
                    </div>
                    
                    ${item.url ? `<a href="${item.url}" target="_blank" class="news-link compact">
                        <i class="fas fa-external-link-alt"></i>
                    </a>` : ''}
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = htmlContent;
}

/**
 * Enhanced event display with investor-grade styling
 * @param {Object} organizedEvents - Events organized by impact
 */
function displayOrganizedEvents(organizedEvents) {
    const { highImpactEvents, mediumImpactEvents, lowImpactEvents } = organizedEvents;
    const container = document.getElementById('events-container');
    if (!container) return;
    
    let htmlContent = '';
    
    // Enhanced high-impact events with premium styling
    highImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-high-impact p-4 rounded-lg shadow-lg relative border-l-4 border-red-500" data-impact="high">
            <div class="event-importance-badge high">🚨 CRITIQUE</div>
            <div class="event-date enhanced">
                <div class="event-day font-bold text-xl">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month text-sm">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-bold text-lg text-red-400">${event.title || ''}</div>
                <div class="event-details mt-3 text-sm">
                    <span class="event-time bg-red-600 text-white px-2 py-1 rounded text-xs">
                        <i class="fas fa-clock"></i> ${event.time || ''}
                    </span>
                    <span class="event-type ${event.type || ''} ml-2">${event.type || ''}</span>
                </div>
            </div>
        </div>`;
    });
    
    // Enhanced medium-impact events
    mediumImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-medium-impact p-3 rounded-lg shadow-md relative border-l-4 border-yellow-500" data-impact="medium">
            <div class="event-importance-badge medium">🔔 IMPORTANT</div>
            <div class="event-date">
                <div class="event-day font-bold text-lg">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month text-sm">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-semibold text-yellow-400">${event.title || ''}</div>
                <div class="event-details mt-2 text-sm">
                    <span class="event-time bg-yellow-600 text-white px-2 py-1 rounded text-xs">
                        <i class="fas fa-clock"></i> ${event.time || ''}
                    </span>
                    <span class="event-type ${event.type || ''} ml-2">${event.type || ''}</span>
                </div>
            </div>
        </div>`;
    });
    
    // Enhanced low-impact events (simplified display)
    lowImpactEvents.forEach(event => {
        htmlContent += `
        <div class="event-card event-low-impact p-3 rounded-lg shadow-sm relative border-l-2 border-gray-600" data-impact="low">
            <div class="event-importance-badge low">📋 STANDARD</div>
            <div class="event-date compact">
                <div class="event-day font-medium">${event.date ? event.date.split('/')[0] : ''}</div>
                <div class="event-month text-xs">${event.date ? event.date.split('/')[1] : ''}</div>
            </div>
            <div class="event-content">
                <div class="event-title font-medium text-gray-300 text-sm">${event.title || ''}</div>
                <div class="event-details mt-1 text-xs">
                    <span class="event-time text-gray-400">
                        <i class="fas fa-clock"></i> ${event.time || ''}
                    </span>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = htmlContent;
}

/**
 * Enhanced filter setup with investor-grade controls
 */
function setupEventFilters() {
    // Enhanced filter buttons with better UX
    const highImpactBtn = document.getElementById('high-impact-btn');
    const mediumImpactBtn = document.getElementById('medium-impact-btn');
    const allImpactBtn = document.getElementById('all-impact-btn');
    
    if (highImpactBtn && mediumImpactBtn && allImpactBtn) {
        // Critical events filter
        highImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('high');
        });
        
        // Important events filter
        mediumImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('medium');
        });
        
        // All events filter
        allImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('all');
        });
    }
    
    // Enhanced score-based filtering
    const scoreFilter = document.getElementById('score-filter');
    if (scoreFilter) {
        scoreFilter.addEventListener('change', function() {
            const minScore = parseInt(this.value);
            filterByScore(minScore);
        });
    }
}

/**
 * Enhanced event filtering by impact level
 * @param {string} impactLevel - Impact level to filter
 */
function filterEventsByImpact(impactLevel) {
    const eventElements = document.querySelectorAll('#events-container .event-card');
    
    eventElements.forEach(element => {
        if (impactLevel === 'all') {
            element.style.display = 'flex';
            element.style.opacity = '1';
        } else {
            const impact = element.dataset.impact;
            if (impact === impactLevel) {
                element.style.display = 'flex';
                element.style.opacity = '1';
            } else {
                element.style.display = 'none';
                element.style.opacity = '0.5';
            }
        }
    });
}

/**
 * New: Filter by importance score
 * @param {number} minScore - Minimum score threshold
 */
function filterByScore(minScore) {
    const newsElements = document.querySelectorAll('.news-card[data-score]');
    
    newsElements.forEach(element => {
        const score = parseInt(element.dataset.score || 0);
        if (score >= minScore) {
            element.style.display = 'block';
            element.style.opacity = '1';
        } else {
            element.style.display = 'none';
            element.style.opacity = '0.5';
        }
    });
}

/**
 * Enhanced filter activation with visual feedback
 * @param {HTMLElement} button - Filter button to activate
 */
function toggleActiveFilter(button) {
    // Remove active class from all filters
    document.querySelectorAll('.filter-active').forEach(el => {
        el.classList.remove('filter-active');
    });
    
    // Add active class to clicked button
    button.classList.add('filter-active');
    
    // Enhanced visual feedback
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = 'scale(1)';
    }, 150);
}

/**
 * Enhanced news hierarchy initialization with investor-grade features
 * @param {Object} newsData - News data (if available)
 */
function initNewsHierarchy(newsData) {
    console.log("🚀 Initializing enhanced investor-grade news hierarchy...");
    
    // If data is available, organize immediately with enhanced criteria
    if (newsData) {
        const { breakingNews, importantNews, standardNews } = organizeNewsByImportance(newsData);
        
        console.log(`📊 News organized: ${breakingNews.length} critical, ${importantNews.length} important, ${standardNews.length} standard`);
        
        displayBreakingNews(breakingNews);
        displayImportantNews(importantNews);
        
        // Organize events if present
        if (newsData.events) {
            const organizedEvents = organizeEventsByImpact(newsData.events);
            displayOrganizedEvents(organizedEvents);
            console.log(`📅 Events organized: ${organizedEvents.highImpactEvents.length} critical, ${organizedEvents.mediumImpactEvents.length} important`);
        }
    }
    
    // Setup enhanced filters
    setupEventFilters();
    
    console.log("✅ Enhanced investor-grade news hierarchy system initialized");
}

// Enhanced initialization with better error handling
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (window.newsData) {
        initNewsHierarchy(window.newsData);
    }
} else {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.newsData) {
            initNewsHierarchy(window.newsData);
        }
    });
}

// Enhanced API export with new features
window.newsHierarchy = {
    calculateNewsScore,
    determineEventImpact,
    organizeNewsByImportance,
    organizeEventsByImpact,
    displayBreakingNews,
    displayImportantNews,
    displayOrganizedEvents,
    filterByScore, // New function
    initNewsHierarchy,
    // Enhanced utilities
    getScoreDistribution: function(articles) {
        const scores = articles.map(a => a.score || 0);
        return {
            min: Math.min(...scores),
            max: Math.max(...scores),
            avg: scores.reduce((a, b) => a + b, 0) / scores.length,
            critical: scores.filter(s => s >= 20).length,
            important: scores.filter(s => s >= 12 && s < 20).length
        };
    }
};
