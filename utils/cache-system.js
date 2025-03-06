/**
 * Système de cache simple pour TradePulse
 * 
 * Ce module fournit un cache pour les données fréquemment utilisées,
 * permettant de réduire les appels API et d'améliorer les performances.
 */

// Cache store - stocke les données avec une TTL (Time-To-Live)
const cacheStore = new Map();

/**
 * Configuration du cache
 */
const cacheConfig = {
    // Durée par défaut du cache en millisecondes (5 minutes)
    defaultTTL: 5 * 60 * 1000,
    
    // Durées spécifiques pour différents types de données
    ttlByType: {
        news: 3 * 60 * 1000,        // 3 minutes pour les actualités (plus fréquentes)
        sectors: 10 * 60 * 1000,    // 10 minutes pour les analyses sectorielles
        portfolio: 15 * 60 * 1000,  // 15 minutes pour les recommandations de portefeuille
        instruments: 30 * 60 * 1000 // 30 minutes pour les instruments financiers
    }
};

/**
 * Récupère une valeur du cache
 * @param {string} key - La clé du cache
 * @returns {*|null} - La valeur en cache ou null si non trouvée/expirée
 */
export function getCachedValue(key) {
    if (!cacheStore.has(key)) {
        return null;
    }
    
    const cachedItem = cacheStore.get(key);
    
    // Vérifier si l'élément a expiré
    if (Date.now() > cachedItem.expiresAt) {
        cacheStore.delete(key);
        return null;
    }
    
    console.log(`Cache hit for: ${key}`);
    return cachedItem.value;
}

/**
 * Enregistre une valeur dans le cache
 * @param {string} key - La clé du cache
 * @param {*} value - La valeur à mettre en cache
 * @param {string} type - Le type de données (news, sectors, portfolio, instruments)
 */
export function setCachedValue(key, value, type = 'default') {
    // Obtenir la durée de vie appropriée pour ce type de données
    const ttl = cacheConfig.ttlByType[type] || cacheConfig.defaultTTL;
    
    cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttl
    });
    
    console.log(`Cache set for: ${key} (expires in ${ttl/1000}s)`);
}

/**
 * Supprime une entrée spécifique du cache
 * @param {string} key - La clé du cache à supprimer
 */
export function invalidateCache(key) {
    if (cacheStore.has(key)) {
        cacheStore.delete(key);
        console.log(`Cache invalidated for: ${key}`);
    }
}

/**
 * Vide entièrement le cache
 */
export function clearCache() {
    cacheStore.clear();
    console.log('Complete cache cleared');
}

/**
 * Génère une clé de cache basée sur les paramètres
 * @param {string} prefix - Préfixe pour la clé (généralement le nom de la fonction)
 * @param {...*} params - Paramètres qui définissent l'unicité de la requête
 * @returns {string} - Clé de cache
 */
export function createCacheKey(prefix, ...params) {
    // Créer une représentation JSON string des paramètres
    const paramString = params
        .map(param => JSON.stringify(param))
        .join('_');
    
    // Utiliser un hash simple pour réduire la longueur des clés
    let hash = 0;
    for (let i = 0; i < paramString.length; i++) {
        hash = ((hash << 5) - hash) + paramString.charCodeAt(i);
        hash |= 0;
    }
    
    return `${prefix}_${hash}`;
}

/**
 * Décore une fonction avec le comportement de cache
 * @param {Function} fn - La fonction à décorer
 * @param {string} keyPrefix - Préfixe pour la clé de cache
 * @param {string} type - Type de donnée pour la TTL
 * @returns {Function} - Fonction décorée
 */
export function withCache(fn, keyPrefix, type = 'default') {
    return async function(...args) {
        // Créer une clé de cache basée sur la fonction et ses arguments
        const cacheKey = createCacheKey(keyPrefix, ...args);
        
        // Vérifier si nous avons une valeur en cache
        const cachedResult = getCachedValue(cacheKey);
        if (cachedResult !== null) {
            return cachedResult;
        }
        
        // Sinon, appeler la fonction et mettre en cache le résultat
        const result = await fn.apply(this, args);
        setCachedValue(cacheKey, result, type);
        
        return result;
    };
}
