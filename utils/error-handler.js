/**
 * Système de gestion d'erreurs pour TradePulse
 * 
 * Ce module fournit des fonctionnalités avancées pour gérer, journaliser
 * et réagir aux erreurs de manière cohérente dans l'application.
 */

// Types d'erreurs spécifiques à TradePulse
export const ErrorTypes = {
    NETWORK: 'NETWORK_ERROR',
    API: 'API_ERROR',
    DATA: 'DATA_ERROR',
    AUTH: 'AUTH_ERROR',
    OPENAI: 'OPENAI_ERROR',
    PERPLEXITY: 'PERPLEXITY_ERROR',
    VALIDATION: 'VALIDATION_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Représente une erreur spécifique à TradePulse avec contexte supplémentaire
 */
export class TradePulseError extends Error {
    /**
     * Crée une nouvelle erreur TradePulse
     * @param {string} message - Message d'erreur
     * @param {string} type - Type d'erreur (utiliser ErrorTypes)
     * @param {Object} context - Données contextuelles supplémentaires
     * @param {Error} originalError - Erreur originale (si applicable)
     */
    constructor(message, type = ErrorTypes.UNKNOWN, context = {}, originalError = null) {
        super(message);
        this.name = 'TradePulseError';
        this.type = type;
        this.context = context;
        this.originalError = originalError;
        this.timestamp = new Date();
        
        // Capturer la stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TradePulseError);
        }
    }
    
    /**
     * Obtient une représentation complète de l'erreur pour le logging
     */
    getFullDetails() {
        return {
            message: this.message,
            type: this.type,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
            originalError: this.originalError ? {
                message: this.originalError.message,
                stack: this.originalError.stack
            } : null
        };
    }
}

/**
 * Journaliser une erreur
 * @param {Error} error - L'erreur à journaliser
 * @param {string} source - Source/composant d'où provient l'erreur
 */
export function logError(error, source = 'app') {
    // Déterminer si c'est une erreur TradePulse ou standard
    const isTradePulseError = error instanceof TradePulseError;
    
    // Préparer les détails de log
    const errorDetails = isTradePulseError 
        ? error.getFullDetails()
        : {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };
    
    // Ajouter la source
    errorDetails.source = source;
    
    // Log dans la console (dans une implémentation réelle, cela pourrait être envoyé à un service de logging)
    console.error(`[ERROR][${source}] ${error.message}`, errorDetails);
    
    // Dans un environnement de production, on pourrait envoyer l'erreur à un service comme Sentry
    // sendToErrorTrackingService(errorDetails);
}

/**
 * Crée une erreur réseau
 * @param {string} message - Message d'erreur
 * @param {Object} context - Contexte supplémentaire
 * @param {Error} originalError - Erreur originale
 * @returns {TradePulseError} - Erreur formattée
 */
export function createNetworkError(message, context = {}, originalError = null) {
    return new TradePulseError(
        message || 'Une erreur réseau est survenue',
        ErrorTypes.NETWORK,
        context,
        originalError
    );
}

/**
 * Crée une erreur de données
 * @param {string} message - Message d'erreur
 * @param {Object} context - Contexte supplémentaire
 * @param {Error} originalError - Erreur originale
 * @returns {TradePulseError} - Erreur formattée
 */
export function createDataError(message, context = {}, originalError = null) {
    return new TradePulseError(
        message || 'Erreur lors du traitement des données',
        ErrorTypes.DATA,
        context,
        originalError
    );
}

/**
 * Crée une erreur API spécifique à Perplexity
 * @param {string} message - Message d'erreur
 * @param {Object} context - Contexte supplémentaire
 * @param {Error} originalError - Erreur originale
 * @returns {TradePulseError} - Erreur formattée
 */
export function createPerplexityError(message, context = {}, originalError = null) {
    return new TradePulseError(
        message || 'Erreur lors de la communication avec Perplexity',
        ErrorTypes.PERPLEXITY,
        context,
        originalError
    );
}

/**
 * Crée une erreur API spécifique à OpenAI
 * @param {string} message - Message d'erreur
 * @param {Object} context - Contexte supplémentaire
 * @param {Error} originalError - Erreur originale
 * @returns {TradePulseError} - Erreur formattée
 */
export function createOpenAIError(message, context = {}, originalError = null) {
    return new TradePulseError(
        message || 'Erreur lors de la communication avec OpenAI',
        ErrorTypes.OPENAI,
        context,
        originalError
    );
}

/**
 * Gère une erreur en fonction de son type
 * @param {Error} error - L'erreur à gérer
 * @param {string} source - Source/composant d'où provient l'erreur
 * @param {Function} fallbackFn - Fonction de fallback à appeler si disponible
 * @returns {*} - Résultat de la fonction de fallback si fournie
 */
export async function handleError(error, source = 'app', fallbackFn = null) {
    // Journaliser l'erreur
    logError(error, source);
    
    // Si c'est une TradePulseError, on peut ajouter des comportements spécifiques selon le type
    if (error instanceof TradePulseError) {
        switch (error.type) {
            case ErrorTypes.NETWORK:
                // Comportement spécifique pour les erreurs réseau
                console.log("Tentative de reconnexion...");
                break;
                
            case ErrorTypes.OPENAI:
            case ErrorTypes.PERPLEXITY:
                // Pour les erreurs API, on peut essayer une alternative
                console.log(`Passage au mode hors-ligne pour ${error.type}...`);
                break;
        }
    }
    
    // Exécuter la fonction de fallback si fournie
    if (typeof fallbackFn === 'function') {
        return await fallbackFn();
    }
    
    // Propager l'erreur
    throw error;
}

/**
 * Décore une fonction avec gestion d'erreur
 * @param {Function} fn - Fonction à décorer
 * @param {string} source - Source pour le logging
 * @param {Function} fallbackFn - Fonction de fallback
 * @returns {Function} - Fonction décorée
 */
export function withErrorHandling(fn, source, fallbackFn = null) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            return handleError(error, source, fallbackFn ? () => fallbackFn(...args) : null);
        }
    };
}
