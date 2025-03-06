/**
 * Service pour les interactions avec l'API OpenAI
 * 
 * Ce module encapsule toutes les interactions avec l'API OpenAI,
 * en particulier pour générer le portefeuille optimisé.
 */

import { createOptimizedApiCall, simulateNetworkDelay } from '../utils/api-utils.js';
import { createOpenAIError } from '../utils/error-handler.js';
import { fallbackPortfolio, financialInstruments } from '../data/financial-data.js';

/**
 * Extrait un objet JSON d'une réponse textuelle
 * @param {string} text - Texte à analyser
 * @returns {Object|null} - Objet JSON extrait ou null
 */
function extractJSONFromText(text) {
    try {
        // Vérifier si le texte est déjà un objet JSON
        if (typeof text === 'object') {
            return text;
        }
        
        // Rechercher un tableau JSON dans le texte
        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        console.error("Aucun JSON trouvé dans:", text);
        return null;
    } catch (error) {
        console.error("Erreur lors de l'extraction du JSON:", error);
        return null;
    }
}

/**
 * Ajoute un horodatage aux raisons du portefeuille
 * @param {Array} portfolio - Portefeuille
 * @returns {Array} - Portefeuille avec timestamps
 */
function addTimestampToReasons(portfolio) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    return portfolio.map(asset => ({
        ...asset,
        reason: `${asset.reason} (Analyse à ${timeStr})`
    }));
}

/**
 * Génère le prompt pour OpenAI en fonction des données disponibles
 * @param {Array} newsData - Actualités
 * @param {Object} sectorData - Analyse sectorielle
 * @param {Object} instruments - Instruments financiers disponibles
 * @returns {string} - Prompt formaté
 */
function prepareOpenAIPromptWithInstruments(newsData, sectorData, instruments) {
    // Extraire les informations pertinentes des actualités
    const newsContext = newsData.map(news => 
        `- ${news.title} (${news.source}): ${news.summary.substring(0, 150)}... [Impact: ${news.sentiment === 'positive' ? 'Positif' : 'Négatif'}]`
    ).join('\n').substring(0, 1500); // Limiter la taille pour éviter des prompts trop longs
    
    // Extraire les informations des secteurs
    const bullishSectors = sectorData.bullish.map(sector => 
        `- ${sector.name}: ${sector.reason.substring(0, 100)}...`
    ).join('\n');
    
    const bearishSectors = sectorData.bearish.map(sector => 
        `- ${sector.name}: ${sector.reason.substring(0, 100)}...`
    ).join('\n');
    
    // Préparer les instruments financiers (sélection aléatoire pour limiter la taille)
    const getRandomItems = (items, count) => {
        return [...items]
            .sort(() => 0.5 - Math.random())
            .slice(0, count);
    };
    
    // Préparer une sélection d'instruments par type
    let stocksList = [];
    let etfsList = [];
    let cryptosList = [];
    
    // Pour chaque thème, prendre quelques instruments
    Object.keys(instruments.stocks).forEach(theme => {
        if (instruments.stocks[theme].length) {
            stocksList.push(...getRandomItems(instruments.stocks[theme], 2));
        }
    });
    
    Object.keys(instruments.etfs).forEach(theme => {
        if (instruments.etfs[theme].length) {
            etfsList.push(...getRandomItems(instruments.etfs[theme], 1));
        }
    });
    
    // Toujours inclure BTC et ETH
    cryptosList = [...instruments.cryptos.primary];
    
    // Ajouter quelques cryptos spécialisées
    Object.keys(instruments.cryptos).forEach(theme => {
        if (theme !== 'primary' && instruments.cryptos[theme].length) {
            cryptosList.push(...getRandomItems(instruments.cryptos[theme], 1));
        }
    });
    
    // Limiter le nombre d'instruments
    stocksList = getRandomItems(stocksList, 12);
    etfsList = getRandomItems(etfsList, 8);
    cryptosList = getRandomItems(cryptosList, 6);
    
    // Formatter les listes d'instruments
    const stocksInfo = stocksList.map(stock => 
        `- ${stock.name} (${stock.symbol}): ${stock.info}`
    ).join('\n');
    
    const etfsInfo = etfsList.map(etf => 
        `- ${etf.name} (${etf.symbol}): ${etf.info}`
    ).join('\n');
    
    const cryptosInfo = cryptosList.map(crypto => 
        `- ${crypto.name} (${crypto.symbol}): ${crypto.info}`
    ).join('\n');
    
    // Obtenir la date actuelle
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR');
    
    // Construire le prompt complet
    return `Tu es un gestionnaire de portefeuille expert. À partir des actualités, analyses sectorielles et instruments financiers disponibles ci-dessous, crée un portefeuille d'investissement optimisé pour ${dateStr} à ${timeStr}.

ACTUALITÉS FINANCIÈRES RÉCENTES:
${newsContext}

SECTEURS HAUSSIERS:
${bullishSectors}

SECTEURS BAISSIERS:
${bearishSectors}

INSTRUMENTS FINANCIERS DISPONIBLES:
ACTIONS:
${stocksInfo}

ETF:
${etfsInfo}

CRYPTOMONNAIES:
${cryptosInfo}

Consignes:
1. Crée un portefeuille à RISQUE MODÉRÉ avec un total EXACTEMENT 100%.
2. Choisis uniquement parmi les instruments listés ci-dessus.
3. Inclus 3-4 actions (~45%), 2-3 ETF (~30%) et 1-2 crypto (~25%).
4. Justifie brièvement chaque choix en lien avec les actualités.

Réponds uniquement au format JSON:
[
  {
    "name": "Nom de l'instrument",
    "symbol": "SYMBOLE",
    "type": "stock/etf/crypto",
    "allocation": XX,
    "reason": "Justification concise"
  },
  ...
]`;
}

/**
 * Génère un portefeuille optimisé en utilisant OpenAI
 * @param {Array} newsData - Actualités
 * @param {Object} sectorData - Analyse sectorielle
 * @returns {Promise<Array>} - Portefeuille optimisé
 */
export async function generatePortfolioWithOpenAI(newsData, sectorData) {
    try {
        // Préparer le prompt
        const prompt = prepareOpenAIPromptWithInstruments(
            newsData, 
            sectorData, 
            financialInstruments
        );
        
        console.log("Envoi de la requête à OpenAI");
        
        // Dans un environnement réel, utiliser l'API OpenAI réelle
        // Pour cette version, nous simulons l'appel
        const isSimulation = true;
        
        let response;
        if (isSimulation) {
            // Simuler un délai réseau
            await simulateNetworkDelay(1500);
            
            // Simuler une réponse OpenAI
            response = simulateOpenAIResponse(newsData, sectorData);
        } else {
            // Appel réel à OpenAI
            response = await window.chat_with_openai({
                content: prompt
            });
        }
        
        // Analyser la réponse
        let portfolio;
        if (typeof response === 'object' && Array.isArray(response)) {
            portfolio = response;
        } else {
            portfolio = extractJSONFromText(response);
            if (!portfolio) {
                throw new Error("Format de réponse non reconnu");
            }
        }
        
        // Ajouter les timestamps aux raisons
        return addTimestampToReasons(portfolio);
    } catch (error) {
        throw createOpenAIError(
            "Erreur lors de la génération du portefeuille avec OpenAI",
            { source: "portfolio_generation" },
            error
        );
    }
}

/**
 * Simule une réponse OpenAI (pour développement)
 * @param {Array} newsData - Actualités
 * @param {Object} sectorData - Analyse sectorielle
 * @returns {Array} - Portefeuille simulé
 */
function simulateOpenAIResponse(newsData, sectorData) {
    // Chercher des thèmes dominants dans les actualités
    const themes = new Set();
    
    // Mots-clés pour identifier les thèmes
    const keywordToTheme = {
        'ia': 'intelligence_artificielle',
        'nvidia': 'intelligence_artificielle',
        'semi-conducteur': 'semi_conducteurs',
        'puces': 'semi_conducteurs',
        'énerg': 'energie',
        'électrique': 'energie',
        'crypto': 'crypto',
        'bitcoin': 'crypto',
        'taux': 'economie',
        'bce': 'economie',
        'fed': 'economie',
        'amazon': 'commerce',
        'tesla': 'automobile',
        'chine': 'chine'
    };
    
    // Extraire les thèmes des actualités
    newsData.forEach(news => {
        const text = (news.title + ' ' + news.summary).toLowerCase();
        
        Object.entries(keywordToTheme).forEach(([keyword, theme]) => {
            if (text.includes(keyword)) {
                themes.add(theme);
            }
        });
    });
    
    // Ajouter les thèmes des secteurs
    sectorData.bullish.forEach(sector => {
        const sectorName = sector.name.toLowerCase();
        
        if (sectorName.includes('ia') || sectorName.includes('tech')) themes.add('intelligence_artificielle');
        if (sectorName.includes('énerg') || sectorName.includes('renouvelable')) themes.add('energie');
        if (sectorName.includes('auto')) themes.add('automobile');
    });
    
    // Convertir en tableau
    const themesList = Array.from(themes);
    
    // Si pas assez de thèmes, ajouter quelques-uns par défaut
    if (themesList.length < 2) {
        themesList.push('intelligence_artificielle', 'economie');
    }
    
    // Créer un portefeuille fictif basé sur ces thèmes
    const portfolio = [];
    
    // Ajouter des actions (3-4)
    const stocks = [];
    themesList.forEach(theme => {
        if (financialInstruments.stocks[theme]) {
            const randomStock = financialInstruments.stocks[theme][Math.floor(Math.random() * financialInstruments.stocks[theme].length)];
            stocks.push({
                ...randomStock,
                type: 'stock',
                allocation: 0, // Sera ajusté plus tard
                reason: `${randomStock.info} en lien avec les actualités récentes.`
            });
        }
    });
    
    // S'assurer d'avoir au moins 3 actions
    while (stocks.length < 3) {
        const defaultThemes = ['intelligence_artificielle', 'economie', 'commerce'];
        const theme = defaultThemes[Math.floor(Math.random() * defaultThemes.length)];
        
        if (financialInstruments.stocks[theme]) {
            const randomStock = financialInstruments.stocks[theme][Math.floor(Math.random() * financialInstruments.stocks[theme].length)];
            // Vérifier qu'il n'est pas déjà inclus
            if (!stocks.some(s => s.symbol === randomStock.symbol)) {
                stocks.push({
                    ...randomStock,
                    type: 'stock',
                    allocation: 0,
                    reason: `${randomStock.info} comme diversification.`
                });
            }
        }
    }
    
    // Limiter à 4 actions maximum
    const selectedStocks = stocks.slice(0, 4);
    portfolio.push(...selectedStocks);
    
    // Ajouter des ETF (2-3)
    const etfs = [];
    themesList.forEach(theme => {
        if (financialInstruments.etfs[theme]) {
            const randomETF = financialInstruments.etfs[theme][Math.floor(Math.random() * financialInstruments.etfs[theme].length)];
            etfs.push({
                ...randomETF,
                type: 'etf',
                allocation: 0,
                reason: `${randomETF.info} pour une exposition diversifiée.`
            });
        }
    });
    
    // S'assurer d'avoir au moins 2 ETF
    while (etfs.length < 2) {
        const defaultThemes = ['economie', 'intelligence_artificielle'];
        const theme = defaultThemes[Math.floor(Math.random() * defaultThemes.length)];
        
        if (financialInstruments.etfs[theme]) {
            const randomETF = financialInstruments.etfs[theme][Math.floor(Math.random() * financialInstruments.etfs[theme].length)];
            // Vérifier qu'il n'est pas déjà inclus
            if (!etfs.some(e => e.symbol === randomETF.symbol)) {
                etfs.push({
                    ...randomETF,
                    type: 'etf',
                    allocation: 0,
                    reason: `${randomETF.info} pour une exposition large au marché.`
                });
            }
        }
    }
    
    // Limiter à 3 ETF maximum
    const selectedETFs = etfs.slice(0, 3);
    portfolio.push(...selectedETFs);
    
    // Ajouter des cryptos (1-2)
    const cryptos = [];
    
    // Toujours inclure Bitcoin
    cryptos.push({
        ...financialInstruments.cryptos.primary[0],
        type: 'crypto',
        allocation: 0,
        reason: "La principale cryptomonnaie offre une diversification et une protection contre l'inflation."
    });
    
    // Ajouter Ethereum ou une autre crypto si le thème crypto est présent
    if (themes.has('crypto')) {
        cryptos.push({
            ...financialInstruments.cryptos.primary[1],
            type: 'crypto',
            allocation: 0,
            reason: "Plateforme de contrats intelligents avec de nombreux cas d'utilisation."
        });
    }
    
    // Limiter à 2 cryptos maximum
    const selectedCryptos = cryptos.slice(0, 2);
    portfolio.push(...selectedCryptos);
    
    // Attribuer les allocations
    const totalStocks = 45;  // 45% en actions
    const totalETFs = 30;    // 30% en ETF
    const totalCryptos = 25; // 25% en cryptos
    
    // Répartir les allocations pour chaque type d'actif
    function distributeAllocation(assets, totalAllocation) {
        const count = assets.length;
        let remaining = totalAllocation;
        
        assets.forEach((asset, index) => {
            if (index === assets.length - 1) {
                // Dernier actif: allouer le reste
                asset.allocation = remaining;
            } else {
                // Base + variable pour éviter des valeurs identiques
                const base = Math.floor(totalAllocation / count);
                const variable = Math.floor(Math.random() * 3) - 1; // -1, 0 ou 1
                asset.allocation = Math.min(base + variable, remaining - (count - index - 1));
                remaining -= asset.allocation;
            }
        });
    }
    
    distributeAllocation(selectedStocks, totalStocks);
    distributeAllocation(selectedETFs, totalETFs);
    distributeAllocation(selectedCryptos, totalCryptos);
    
    return portfolio;
}

/**
 * Optimisations des appels API avec cache
 */
export const optimizedGeneratePortfolio = createOptimizedApiCall(
    generatePortfolioWithOpenAI,
    'openai_portfolio',
    'portfolio',
    { maxRetries: 1 }
);

/**
 * Fonction de fallback qui retourne un portefeuille par défaut
 * @returns {Promise<Array>} - Portefeuille par défaut
 */
export async function getFallbackPortfolio() {
    await simulateNetworkDelay(500); // Petit délai pour effet réaliste
    return addTimestampToReasons([...fallbackPortfolio]);
}
