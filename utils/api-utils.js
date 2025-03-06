/**
 * Utilitaires pour les appels API
 * 
 * Ce module fournit des fonctions pour faciliter les appels API,
 * gérer le throttling, les délais et les erreurs
 */

import { withCache } from './cache-system.js';
import { createNetworkError, withErrorHandling } from './error-handler.js';

// Délai entre les requêtes (throttling)
const API_THROTTLE_MS = 1000; // 1 seconde entre les requêtes
let lastRequestTimestamp = 0;

/**
 * Applique un délai pour respecter le throttling
 * @returns {Promise<void>}
 */
async function applyThrottling() {
    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    
    if (elapsed < API_THROTTLE_MS) {
        const delay = API_THROTTLE_MS - elapsed;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    lastRequestTimestamp = Date.now();
}

/**
 * Fetch avec timeout et gestion d'erreur améliorée
 * @param {string} url - URL à appeler
 * @param {Object} options - Options fetch
 * @param {number} timeout - Timeout en ms (par défaut 10s)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    // Appliquer le throttling pour éviter de surcharger les API
    await applyThrottling();
    
    // Créer un contrôleur d'abandon pour le timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        
        // Vérifier si la réponse est OK
        if (!response.ok) {
            throw createNetworkError(
                `Erreur HTTP ${response.status}: ${response.statusText}`,
                { url, status: response.status, statusText: response.statusText }
            );
        }
        
        return response;
    } catch (error) {
        // Si c'est une erreur d'abandon, c'est un timeout
        if (error.name === 'AbortError') {
            throw createNetworkError(
                `La requête a expiré après ${timeout}ms`,
                { url, timeout }
            );
        }
        
        // Autres erreurs réseau
        throw createNetworkError(
            `Erreur réseau: ${error.message}`,
            { url },
            error
        );
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Effectue un appel API JSON avec gestion des erreurs
 * @param {string} url - URL à appeler
 * @param {Object} options - Options fetch
 * @param {number} timeout - Timeout en ms
 * @returns {Promise<any>} - Données JSON
 */
export async function fetchJson(url, options = {}, timeout = 10000) {
    const response = await fetchWithTimeout(url, options, timeout);
    return await response.json();
}

/**
 * Effectue un appel API avec retry en cas d'échec
 * @param {Function} fetchFn - Fonction d'appel API
 * @param {Array} args - Arguments de la fonction
 * @param {Object} options - Options de retry
 * @returns {Promise<any>} - Résultat de l'appel
 */
export async function withRetry(fetchFn, args = [], options = {}) {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        backoffFactor = 2,
        retryableStatusCodes = [408, 429, 500, 502, 503, 504]
    } = options;
    
    let lastError;
    let delay = initialDelayMs;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchFn(...args);
        } catch (error) {
            lastError = error;
            
            // Déterminer si on peut réessayer cette erreur
            const isRetryable = 
                (error.context && 
                 error.context.status && 
                 retryableStatusCodes.includes(error.context.status)) ||
                error.message.includes('expiré') ||
                error.message.includes('network') ||
                error.message.includes('réseau');
            
            // Si ce n'est pas une erreur retryable ou dernier essai, propager l'erreur
            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }
            
            console.warn(`Tentative ${attempt + 1}/${maxRetries} échouée, nouvel essai dans ${delay}ms`);
            
            // Attendre avant de réessayer
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Augmenter le délai pour le prochain essai (backoff exponentiel)
            delay *= backoffFactor;
        }
    }
    
    // Ne devrait jamais arriver, mais au cas où
    throw lastError;
}

/**
 * Fonction pour simuler un délai réseau (utile en développement)
 * @param {number} ms - Millisecondes à attendre
 * @returns {Promise<void>}
 */
export function simulateNetworkDelay(ms = 800) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Crée un appel API optimisé avec cache, retry et gestion d'erreur
 * @param {Function} fetchFn - Fonction d'appel API de base
 * @param {string} cacheKeyPrefix - Préfixe pour la clé de cache
 * @param {string} cacheType - Type de données pour le TTL
 * @param {Object} retryOptions - Options pour le retry
 * @returns {Function} - Fonction optimisée
 */
export function createOptimizedApiCall(fetchFn, cacheKeyPrefix, cacheType, retryOptions = {}) {
    // Ajouter la gestion d'erreur
    const withErrorHandled = withErrorHandling(fetchFn, `api-${cacheKeyPrefix}`);
    
    // Ajouter le retry
    const withRetryFn = (...args) => withRetry(withErrorHandled, args, retryOptions);
    
    // Ajouter le cache et retourner la fonction finale
    return withCache(withRetryFn, cacheKeyPrefix, cacheType);
}
