// services/cacheService.js
// Service de cache pour réduire les appels API

/**
 * Classe CacheService pour gérer le cache des données
 * Supporte le stockage dans localStorage avec expiration
 */
export class CacheService {
  constructor() {
    this.storagePrefix = 'tradepulse_cache_';
    this.isAvailable = this._checkStorageAvailability();
    
    // Nettoyer les entrées expirées au démarrage
    if (this.isAvailable) {
      this.cleanExpiredEntries();
    }
  }
  
  /**
   * Récupère une valeur du cache
   * @param {string} key - Clé de l'élément à récupérer
   * @returns {Promise<any>} - La valeur mise en cache ou null si absente/expirée
   */
  async get(key) {
    if (!this.isAvailable) return null;
    
    try {
      const cacheKey = this.storagePrefix + key;
      const cachedString = localStorage.getItem(cacheKey);
      
      if (!cachedString) return null;
      
      const cached = JSON.parse(cachedString);
      
      // Vérifier si l'entrée a expiré
      if (cached.expires && cached.expires < Date.now()) {
        // Supprimer l'entrée expirée
        localStorage.removeItem(cacheKey);
        return null;
      }
      
      console.log(`Cache hit for: ${key}`);
      return cached.value;
    } catch (error) {
      console.error('Error retrieving from cache:', error);
      return null;
    }
  }
  
  /**
   * Stocke une valeur dans le cache
   * @param {string} key - Clé pour stocker la valeur
   * @param {any} value - Valeur à stocker
   * @param {number} ttlSeconds - Durée de vie en secondes (défaut: 1 heure)
   * @returns {Promise<boolean>} - true si stocké avec succès
   */
  async set(key, value, ttlSeconds = 3600) {
    if (!this.isAvailable) return false;
    
    try {
      const cacheKey = this.storagePrefix + key;
      const expires = Date.now() + (ttlSeconds * 1000);
      
      const cacheObject = {
        value: value,
        expires: expires,
        created: Date.now()
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
      console.log(`Cached value for: ${key} (expires in ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      console.error('Error setting cache:', error);
      
      // Si l'erreur est due à un espace de stockage insuffisant, nettoyer le cache
      if (error instanceof DOMException && 
          (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn('Storage quota exceeded, clearing oldest entries');
        this.clearOldestEntries();
        
        // Réessayer après nettoyage
        try {
          const cacheKey = this.storagePrefix + key;
          const expires = Date.now() + (ttlSeconds * 1000);
          
          const cacheObject = {
            value: value,
            expires: expires,
            created: Date.now()
          };
          
          localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
          return true;
        } catch (retryError) {
          console.error('Error on retry after clearing cache:', retryError);
        }
      }
      
      return false;
    }
  }
  
  /**
   * Supprime une entrée du cache
   * @param {string} key - Clé à supprimer
   * @returns {Promise<boolean>} - true si supprimé avec succès
   */
  async remove(key) {
    if (!this.isAvailable) return false;
    
    try {
      const cacheKey = this.storagePrefix + key;
      localStorage.removeItem(cacheKey);
      return true;
    } catch (error) {
      console.error('Error removing from cache:', error);
      return false;
    }
  }
  
  /**
   * Vide le cache entier
   * @returns {Promise<boolean>} - true si vidé avec succès
   */
  async clear() {
    if (!this.isAvailable) return false;
    
    try {
      // Supprimer uniquement les entrées avec notre préfixe
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.storagePrefix)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`Cleared ${keysToRemove.length} cache entries`);
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }
  
  /**
   * Nettoie les entrées expirées du cache
   * @returns {Promise<number>} - Nombre d'entrées nettoyées
   */
  async cleanExpiredEntries() {
    if (!this.isAvailable) return 0;
    
    try {
      const now = Date.now();
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        if (key.startsWith(this.storagePrefix)) {
          try {
            const cachedString = localStorage.getItem(key);
            if (cachedString) {
              const cached = JSON.parse(cachedString);
              if (cached.expires && cached.expires < now) {
                keysToRemove.push(key);
              }
            }
          } catch (e) {
            // Ignorer les erreurs de parsing et ajouter quand même à la liste
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        console.log(`Cleaned ${keysToRemove.length} expired cache entries`);
      }
      return keysToRemove.length;
    } catch (error) {
      console.error('Error cleaning expired cache entries:', error);
      return 0;
    }
  }
  
  /**
   * Supprime les entrées les plus anciennes pour libérer de l'espace
   * @param {number} percentToRemove - Pourcentage à supprimer (défaut: 25%)
   * @returns {Promise<number>} - Nombre d'entrées supprimées
   */
  async clearOldestEntries(percentToRemove = 25) {
    if (!this.isAvailable) return 0;
    
    try {
      const cacheEntries = [];
      
      // Collecter toutes les entrées de cache
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        if (key.startsWith(this.storagePrefix)) {
          try {
            const cachedString = localStorage.getItem(key);
            if (cachedString) {
              const cached = JSON.parse(cachedString);
              cacheEntries.push({
                key: key,
                created: cached.created || 0
              });
            }
          } catch (e) {
            // Ignorer les erreurs de parsing et ajouter avec une priorité élevée de suppression
            cacheEntries.push({
              key: key,
              created: 0
            });
          }
        }
      }
      
      // Trier par date de création (les plus anciennes d'abord)
      cacheEntries.sort((a, b) => a.created - b.created);
      
      // Calculer combien d'entrées à supprimer
      const removeCount = Math.ceil(cacheEntries.length * (percentToRemove / 100));
      
      // Supprimer les entrées les plus anciennes
      const entriestoRemove = cacheEntries.slice(0, removeCount);
      entriestoRemove.forEach(entry => localStorage.removeItem(entry.key));
      
      console.log(`Cleared ${entriestoRemove.length} oldest cache entries to free up space`);
      return entriestoRemove.length;
    } catch (error) {
      console.error('Error clearing oldest cache entries:', error);
      return 0;
    }
  }
  
  /**
   * Vérifie si localStorage est disponible
   * @private
   * @returns {boolean} - true si localStorage est disponible
   */
  _checkStorageAvailability() {
    try {
      const storage = window.localStorage;
      const testKey = '__storage_test__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage is not available:', e);
      return false;
    }
  }
}
