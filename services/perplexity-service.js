/**
 * Service pour les interactions avec Perplexity AI
 * 
 * Ce module encapsule toutes les interactions avec l'API Perplexity
 * pour obtenir des données financières, actualités et analyses.
 */

import { createOptimizedApiCall, simulateNetworkDelay } from '../utils/api-utils.js';
import { createPerplexityError } from '../utils/error-handler.js';
import { newsData, sectorData } from '../data/financial-data.js';

/**
 * Obtient les actualités financières récentes depuis Perplexity
 * @returns {Promise<Object>} - Données d'actualités
 */
export async function getNewsFromPerplexity() {
    try {
        // En production, remplacer par un vrai appel API Perplexity
        // Dans cette version, nous simulons la réponse
        await simulateNetworkDelay(800);
        
        const now = new Date();
        
        // Générer des horodatages relatifs à maintenant
        const getRandomTime = (maxHoursAgo) => {
            const hoursAgo = Math.random() * maxHoursAgo;
            return new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
        };
        
        // Mélanger les actualités et en sélectionner aléatoirement
        const shuffledNews = [...newsData].sort(() => 0.5 - Math.random());
        const selectedNews = shuffledNews.slice(0, 8 + Math.floor(Math.random() * 3));
        
        // Ajouter timestamps et scores d'impact aléatoires
        const newsWithDetails = selectedNews.map(news => ({
            ...news,
            timestamp: getRandomTime(10),
            impact: Math.floor(25 + Math.random() * 25) // Impact entre 25-50
        }));
        
        return { news: newsWithDetails };
    } catch (error) {
        // Transformer l'erreur en PerplexityError
        throw createPerplexityError(
            'Erreur lors de la récupération des actualités financières',
            { endpoint: 'news' },
            error
        );
    }
}

/**
 * Obtient l'analyse sectorielle basée sur les actualités
 * @returns {Promise<Object>} - Données d'analyse sectorielle
 */
export async function getSectorsAnalysisFromPerplexity() {
    try {
        // Simulation d'un appel API Perplexity
        await simulateNetworkDelay(1000);
        
        // Mélanger et sélectionner aléatoirement quelques secteurs
        const shuffleBullish = [...sectorData.bullish].sort(() => 0.5 - Math.random());
        const shuffleBearish = [...sectorData.bearish].sort(() => 0.5 - Math.random());
        
        const selectedBullish = shuffleBullish.slice(0, 2 + Math.floor(Math.random() * 3));
        const selectedBearish = shuffleBearish.slice(0, 2 + Math.floor(Math.random() * 3));
        
        return {
            bullish: selectedBullish,
            bearish: selectedBearish
        };
    } catch (error) {
        throw createPerplexityError(
            'Erreur lors de l\'analyse sectorielle',
            { endpoint: 'sectors' },
            error
        );
    }
}

/**
 * Optimisations des appels API avec cache
 */
export const optimizedGetNews = createOptimizedApiCall(
    getNewsFromPerplexity, 
    'perplexity_news', 
    'news',
    { maxRetries: 2 }
);

export const optimizedGetSectors = createOptimizedApiCall(
    getSectorsAnalysisFromPerplexity,
    'perplexity_sectors',
    'sectors',
    { maxRetries: 2 }
);
