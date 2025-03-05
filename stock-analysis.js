// Module d'analyse boursière 
// Ce fichier permet de simuler une intégration avec OpenAI pour l'analyse des actions

// Exemples d'analyses pré-générées (dans un site réel, ces données viendraient d'OpenAI)
const stockAnalyses = {
    "AAPL": {
        ticker: "AAPL",
        companyName: "Apple Inc.",
        lastUpdated: "2025-03-05",
        currentPrice: 189.45,
        priceChange: 2.35,
        recommendation: "ACHETER",
        summary: "Apple continue de montrer une forte résilience face aux défis macroéconomiques. Avec une solide génération de trésorerie, des marges de profit élevées et une expansion stratégique vers les services, l'entreprise conserve une position dominante sur ses marchés clés.",
        factors: [
            {
                type: "positive",
                category: "Fondamentaux",
                title: "Services en croissance", 
                description: "Le segment des services d'Apple affiche une croissance constante de plus de 15% par an, améliorant les marges et stabilisant les revenus."
            },
            {
                type: "positive",
                category: "Technologie",
                title: "Innovation continue", 
                description: "Le pipeline de produits innovants incluant la réalité augmentée/virtuelle et les avancées en IA positionne Apple favorablement pour l'avenir."
            },
            {
                type: "neutral",
                category: "Économie",
                title: "Pressions inflationnistes", 
                description: "Les pressions inflationnistes pourraient limiter le pouvoir d'achat des consommateurs, mais Apple cible principalement des segments à revenu élevé."
            },
            {
                type: "negative",
                category: "Politique",
                title: "Réglementations antitrust", 
                description: "Surveillance accrue des régulateurs concernant l'App Store et les pratiques commerciales associées."
            }
        ],
        economicEnvironment: "Favorable malgré l'inflation, grâce au positionnement premium",
        politicalEnvironment: "Quelques défis réglementaires mais gérables",
        sectorOutlook: "Technologie reste un secteur porteur avec une demande soutenue"
    },
    "MSFT": {
        ticker: "MSFT",
        companyName: "Microsoft Corporation",
        lastUpdated: "2025-03-05",
        currentPrice: 428.73,
        priceChange: -1.27,
        recommendation: "ACHETER",
        summary: "Microsoft continue de bénéficier d'une croissance exceptionnelle dans le cloud computing avec Azure, soutenue par l'intégration de l'IA dans ses produits. L'entreprise maintient une position solide dans tous ses segments principaux.",
        factors: [
            {
                type: "positive",
                category: "Cloud",
                title: "Croissance d'Azure", 
                description: "Azure continue de gagner des parts de marché avec une croissance supérieure à 30% par an."
            },
            {
                type: "positive",
                category: "IA",
                title: "Leadership en IA", 
                description: "Les investissements stratégiques dans l'IA et l'intégration avec Copilot renforcent l'avantage concurrentiel."
            },
            {
                type: "positive",
                category: "Diversification",
                title: "Sources de revenus diversifiées", 
                description: "Gaming, Office 365, LinkedIn et Azure offrent plusieurs leviers de croissance."
            },
            {
                type: "neutral",
                category: "Concurrence",
                title: "Pression concurrentielle", 
                description: "Concurrence accrue dans le cloud de la part d'AWS et Google Cloud."
            }
        ],
        economicEnvironment: "Excellente position même en cas de ralentissement économique",
        politicalEnvironment: "Risques réglementaires limités comparé à d'autres géants tech",
        sectorOutlook: "Technologie d'entreprise et cloud en forte expansion"
    },
    "GOOGL": {
        ticker: "GOOGL",
        companyName: "Alphabet Inc.",
        lastUpdated: "2025-03-05",
        currentPrice: 149.82,
        priceChange: 1.53,
        recommendation: "CONSERVER",
        summary: "Alphabet maintient sa dominance dans la publicité en ligne tout en développant de nouveaux leviers de croissance dans l'IA et le cloud. Des défis réglementaires et concurrentiels subsistent, mais l'entreprise reste bien positionnée.",
        factors: [
            {
                type: "positive",
                category: "Publicité",
                title: "Dominance publicitaire", 
                description: "Google Search et YouTube continuent de générer d'importants revenus publicitaires."
            },
            {
                type: "positive",
                category: "IA",
                title: "Avancées en IA", 
                description: "Google DeepMind et les produits IA ont le potentiel de créer de nouvelles sources de revenus."
            },
            {
                type: "negative",
                category: "Réglementation",
                title: "Pressions antitrust", 
                description: "Procès et enquêtes antitrust aux États-Unis et en Europe."
            },
            {
                type: "neutral",
                category: "Cloud",
                title: "Google Cloud", 
                description: "Google Cloud progresse mais reste derrière AWS et Azure."
            }
        ],
        economicEnvironment: "Publicité sensible aux cycles économiques mais bonnes perspectives",
        politicalEnvironment: "Risques réglementaires significatifs à surveiller",
        sectorOutlook: "Publicité numérique et intelligence artificielle en croissance"
    },
    "SPY": {
        ticker: "SPY",
        companyName: "SPDR S&P 500 ETF Trust",
        lastUpdated: "2025-03-05",
        currentPrice: 516.97,
        priceChange: 0.87,
        recommendation: "ACHETER",
        summary: "L'ETF SPY offre une exposition diversifiée aux 500 plus grandes entreprises américaines. Dans le contexte actuel, il représente une option d'investissement solide pour capturer la croissance économique américaine tout en limitant les risques spécifiques à chaque entreprise.",
        factors: [
            {
                type: "positive",
                category: "Diversification",
                title: "Exposition large", 
                description: "Diversification sur 500 entreprises leaders américaines limitant le risque spécifique."
            },
            {
                type: "positive",
                category: "Économie US",
                title: "Résilience économique", 
                description: "L'économie américaine continue de montrer des signes de résilience malgré les défis."
            },
            {
                type: "neutral",
                category: "Taux d'intérêt",
                title: "Politique monétaire", 
                description: "Les politiques de taux d'intérêt pourraient affecter à court terme les évaluations."
            },
            {
                type: "neutral",
                category: "Valorisations",
                title: "Ratios P/E élevés", 
                description: "Certaines composantes ont des valorisations relativement élevées."
            }
        ],
        economicEnvironment: "Croissance modérée attendue pour l'économie américaine",
        politicalEnvironment: "La stabilité politique relative soutient les marchés",
        sectorOutlook: "Diversification sectorielle offrant une exposition équilibrée"
    }
};

// Fonction pour obtenir l'analyse d'un titre spécifique
function getStockAnalysis(ticker) {
    // Normaliser le ticker en majuscules
    const normalizedTicker = ticker.toUpperCase();
    
    // Vérifier si nous avons une analyse pré-générée pour ce ticker
    if (stockAnalyses[normalizedTicker]) {
        return stockAnalyses[normalizedTicker];
    }
    
    // Si nous n'avons pas d'analyse pour ce ticker, renvoyer une analyse générique
    return {
        ticker: normalizedTicker,
        companyName: normalizedTicker,
        lastUpdated: new Date().toISOString().split('T')[0],
        currentPrice: "N/A",
        priceChange: "N/A",
        recommendation: "RECHERCHE NÉCESSAIRE",
        summary: "Nous n'avons pas d'analyse disponible pour ce titre. Dans une version complète de l'application, nous générerions une analyse en temps réel en utilisant l'API OpenAI.",
        factors: [
            {
                type: "neutral",
                category: "Information",
                title: "Analyse non disponible", 
                description: "Veuillez rechercher un titre populaire comme AAPL, MSFT, GOOGL ou SPY pour voir un exemple d'analyse."
            }
        ],
        economicEnvironment: "Analyse non disponible",
        politicalEnvironment: "Analyse non disponible",
        sectorOutlook: "Analyse non disponible"
    };
}

// Données de prix historiques simulées pour les graphiques
function generateHistoricalPriceData(ticker, days, startPrice, volatility = 0.02) {
    const prices = [];
    let currentPrice = startPrice;
    
    const today = new Date();
    
    for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        
        // Simuler un mouvement de prix
        const change = (Math.random() - 0.5) * 2 * volatility;
        currentPrice = Math.max(0.1, currentPrice * (1 + change));
        
        prices.push({
            date: date.toISOString().split('T')[0],
            price: parseFloat(currentPrice.toFixed(2))
        });
    }
    
    return prices;
}

// Prix historiques pré-générés pour quelques actions populaires
const historicalPrices = {
    "AAPL": generateHistoricalPriceData("AAPL", 180, 150, 0.015),
    "MSFT": generateHistoricalPriceData("MSFT", 180, 380, 0.012),
    "GOOGL": generateHistoricalPriceData("GOOGL", 180, 130, 0.018),
    "SPY": generateHistoricalPriceData("SPY", 180, 480, 0.008)
};

// Fonction pour obtenir les données historiques d'un titre
function getHistoricalPrices(ticker, timeRange) {
    const normalizedTicker = ticker.toUpperCase();
    
    // Vérifier si nous avons des données historiques pour ce ticker
    if (historicalPrices[normalizedTicker]) {
        // Filtrer les données selon la plage de temps demandée
        const data = [...historicalPrices[normalizedTicker]];
        
        switch(timeRange) {
            case "1M":
                return data.slice(-30);
            case "3M":
                return data.slice(-90);
            case "6M":
                return data.slice(-180);
            case "1Y":
                return data;
            default:
                return data.slice(-30); // Par défaut 1 mois
        }
    }
    
    // Si nous n'avons pas de données pour ce ticker, générer des données aléatoires
    return generateHistoricalPriceData(normalizedTicker, 180, 100, 0.02);
}

// Exporter les fonctions pour utilisation dans app.js
window.stockAnalysisModule = {
    getStockAnalysis,
    getHistoricalPrices
};
