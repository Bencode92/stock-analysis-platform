/**
 * data-preload.js - Script de préchargement des données statiques
 * Ce script doit être inclus avant aiintegration.js pour charger les données directement en mémoire
 */

// Fonction pour obtenir le chemin de base
function getBasePath() {
    // Si sur GitHub Pages, construire le chemin avec le nom du repo
    if (window.location.hostname.includes('github.io')) {
        // Extraire le nom du dépôt de l'URL
        const pathParts = window.location.pathname.split('/');
        if (pathParts.length > 1) {
            // Retourner le chemin avec le nom du repo
            return '/' + pathParts[1] + '/';
        }
    }
    // Sinon, utiliser la racine
    return '/';
}

// Configuration des chemins
const DATA_PATHS = {
    news: getBasePath() + 'data/news.json',
    portfolios: getBasePath() + 'data/portfolios.json'
};

// Données de secours en cas d'échec de chargement
const FALLBACK_DATA = {
    news: {
        us: [
            {
                title: "Marchés américains : perspectives positives pour le secteur technologique",
                content: "Les marchés américains montrent des signaux positifs, portés par le secteur technologique et les résultats des entreprises du S&P 500.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "marches",
                impact: "positive",
                country: "us"
            },
            {
                title: "La Fed maintient sa politique monétaire",
                content: "La Réserve fédérale américaine a décidé de maintenir sa politique actuelle, en ligne avec les attentes des analystes.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "economie",
                impact: "neutral",
                country: "us"
            }
        ],
        france: [
            {
                title: "Le CAC 40 en hausse, porté par le secteur du luxe",
                content: "L'indice parisien enregistre une progression, soutenu notamment par les valeurs du luxe et les perspectives économiques européennes.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "marches",
                impact: "positive",
                country: "fr"
            }
        ],
        events: [
            {
                title: "Publication des résultats trimestriels des grandes entreprises tech",
                date: "28/03/2025",
                time: "16:30",
                type: "earnings",
                importance: "high"
            },
            {
                title: "Réunion de la BCE sur les taux d'intérêt",
                date: "22/03/2025",
                time: "13:45",
                type: "policy",
                importance: "high"
            }
        ],
        lastUpdated: new Date().toISOString()
    },
    portfolios: {
        agressif: [
            {
                name: "NVIDIA Corporation",
                symbol: "NVDA",
                type: "Action",
                allocation: 25,
                reason: "Leader dans les processeurs graphiques et l'IA",
                change: 3.5
            },
            {
                name: "Tesla, Inc.",
                symbol: "TSLA",
                type: "Action",
                allocation: 20,
                reason: "Innovation dans les véhicules électriques",
                change: 2.1
            },
            {
                name: "ARK Innovation ETF",
                symbol: "ARKK",
                type: "ETF",
                allocation: 15,
                reason: "Exposition aux technologies disruptives",
                change: 1.8
            },
            {
                name: "Bitcoin",
                symbol: "BTC",
                type: "Crypto",
                allocation: 15,
                reason: "Diversification avec la cryptomonnaie principale",
                change: 4.5
            },
            {
                name: "Amazon.com, Inc.",
                symbol: "AMZN",
                type: "Action",
                allocation: 15,
                reason: "Leader e-commerce et cloud computing",
                change: 1.2
            },
            {
                name: "Advanced Micro Devices",
                symbol: "AMD",
                type: "Action",
                allocation: 10,
                reason: "Croissance dans le secteur des semi-conducteurs",
                change: 2.7
            }
        ],
        modere: [
            {
                name: "Microsoft Corporation",
                symbol: "MSFT",
                type: "Action",
                allocation: 20,
                reason: "Leader stable en technologie et cloud",
                change: 1.1
            },
            {
                name: "Vanguard S&P 500 ETF",
                symbol: "VOO",
                type: "ETF",
                allocation: 20,
                reason: "Exposition large au marché américain",
                change: 0.9
            },
            {
                name: "Apple Inc.",
                symbol: "AAPL",
                type: "Action",
                allocation: 15,
                reason: "Entreprise technologique stable avec dividendes",
                change: 0.7
            },
            {
                name: "Alphabet Inc.",
                symbol: "GOOGL",
                type: "Action",
                allocation: 15,
                reason: "Leader dans la recherche en ligne et l'IA",
                change: 1.3
            },
            {
                name: "iShares Core U.S. Aggregate Bond ETF",
                symbol: "AGG",
                type: "ETF",
                allocation: 20,
                reason: "Stabilité avec des obligations américaines",
                change: 0.2
            },
            {
                name: "Coca-Cola Company",
                symbol: "KO",
                type: "Action",
                allocation: 10,
                reason: "Valeur défensive avec dividendes stables",
                change: 0.4
            }
        ],
        stable: [
            {
                name: "Vanguard Total Bond Market ETF",
                symbol: "BND",
                type: "ETF",
                allocation: 25,
                reason: "Base d'obligations diversifiées",
                change: 0.1
            },
            {
                name: "iShares TIPS Bond ETF",
                symbol: "TIP",
                type: "ETF",
                allocation: 20,
                reason: "Protection contre l'inflation",
                change: 0.2
            },
            {
                name: "Johnson & Johnson",
                symbol: "JNJ",
                type: "Action",
                allocation: 15,
                reason: "Valeur défensive dans le secteur de la santé",
                change: 0.3
            },
            {
                name: "Berkshire Hathaway Inc.",
                symbol: "BRK.B",
                type: "Action",
                allocation: 15,
                reason: "Portefeuille diversifié à gestion conservatrice",
                change: 0.5
            },
            {
                name: "Procter & Gamble Co.",
                symbol: "PG",
                type: "Action",
                allocation: 15,
                reason: "Biens de consommation avec dividendes stables",
                change: 0.2
            },
            {
                name: "SPDR Gold Shares",
                symbol: "GLD",
                type: "ETF",
                allocation: 10,
                reason: "Diversification avec l'or comme valeur refuge",
                change: 0.6
            }
        ],
        marketContext: {
            mainTrend: "bullish",
            volatilityLevel: "moderate",
            keyEvents: [
                "Décision de maintien des taux par les banques centrales",
                "Résultats trimestriels positifs du secteur technologique",
                "Reprise économique globale"
            ]
        },
        lastUpdated: new Date().toISOString()
    }
};

// Fonction d'initialisation pour précharger les données
async function preloadStaticData() {
    console.log('Préchargement des données statiques...');
    
    // Objet global pour stocker les données
    window.TRADEPULSE_STATIC_DATA = {};
    
    try {
        // Charger les fichiers JSON directement
        const timestamp = new Date().getTime();
        
        // Charger les actualités
        try {
            console.log('Chargement des actualités depuis:', DATA_PATHS.news);
            const newsResponse = await fetch(`${DATA_PATHS.news}?t=${timestamp}`);
            
            if (newsResponse.ok) {
                window.TRADEPULSE_STATIC_DATA.news = await newsResponse.json();
                console.log('✅ Données d\'actualités préchargées avec succès');
            } else {
                throw new Error(`Erreur HTTP: ${newsResponse.status}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du préchargement des actualités:', error);
            window.TRADEPULSE_STATIC_DATA.news = FALLBACK_DATA.news;
            console.log('⚠️ Utilisation des données d\'actualités de secours');
        }
        
        // Charger les portefeuilles
        try {
            console.log('Chargement des portefeuilles depuis:', DATA_PATHS.portfolios);
            const portfoliosResponse = await fetch(`${DATA_PATHS.portfolios}?t=${timestamp}`);
            
            if (portfoliosResponse.ok) {
                window.TRADEPULSE_STATIC_DATA.portfolios = await portfoliosResponse.json();
                console.log('✅ Données de portefeuilles préchargées avec succès');
            } else {
                throw new Error(`Erreur HTTP: ${portfoliosResponse.status}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du préchargement des portefeuilles:', error);
            window.TRADEPULSE_STATIC_DATA.portfolios = FALLBACK_DATA.portfolios;
            console.log('⚠️ Utilisation des données de portefeuilles de secours');
        }
        
        console.log('Préchargement terminé:', window.TRADEPULSE_STATIC_DATA);
    } catch (error) {
        console.error('❌ Erreur critique lors du préchargement:', error);
        window.TRADEPULSE_STATIC_DATA.news = FALLBACK_DATA.news;
        window.TRADEPULSE_STATIC_DATA.portfolios = FALLBACK_DATA.portfolios;
        console.log('⚠️ Utilisation des données de secours complètes');
    }
}

// Exécuter le préchargement immédiatement
preloadStaticData();
