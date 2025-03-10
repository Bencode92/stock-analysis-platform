/**
 * auth-cloud.js - Client d'authentification pour TradePulse
 * Ce module gère la communication avec le Worker Cloudflare d'authentification
 */

// URL de base du Worker (à remplacer par votre URL une fois déployée)
const API_BASE_URL = 'https://tradepulse-auth.your-subdomain.workers.dev';

// Clé pour stocker le token dans le localStorage
const TOKEN_KEY = 'tradepulse_auth_token';
const USER_KEY = 'tradepulse_user';

/**
 * Classe pour gérer l'authentification cloud
 */
class AuthCloud {
  constructor() {
    // Vérification si un token est déjà stocké
    this.token = localStorage.getItem(TOKEN_KEY);
    this.user = localStorage.getItem(USER_KEY) ? JSON.parse(localStorage.getItem(USER_KEY)) : null;
    
    // Définition d'un état d'initialisation
    this.isInitialized = false;
    
    // Initialisation automatique
    this.init();
  }
  
  /**
   * Initialise le service d'authentification
   */
  async init() {
    console.log('🔐 Initialisation du service d\'authentification cloud...');
    
    try {
      // Si un token existe, on vérifie sa validité
      if (this.token) {
        const isValid = await this.verifyToken();
        
        if (!isValid) {
          this.logout(false);
        }
      }
      
      this.isInitialized = true;
      console.log('✅ Service d\'authentification initialisé avec succès');
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du service d\'authentification:', error);
      this.isInitialized = true;
      
      // En cas d'erreur, on switch vers le mode local
      console.log('⚠️ Basculement vers le mode d\'authentification local');
    }
  }
  
  /**
   * Effectue l'inscription d'un utilisateur
   * @param {Object} userData - Données utilisateur (name, email, password)
   * @returns {Promise} Résultat de l'inscription
   */
  async register(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de l\'inscription');
      }
      
      // Stocker le token et les infos utilisateur
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      
      this.token = data.token;
      this.user = data.user;
      
      return {
        success: true,
        user: data.user
      };
      
    } catch (error) {
      console.error('❌ Erreur d\'inscription:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Effectue la connexion d'un utilisateur
   * @param {Object} credentials - Identifiants (email, password)
   * @returns {Promise} Résultat de la connexion
   */
  async login(credentials) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de la connexion');
      }
      
      // Stocker le token et les infos utilisateur
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      
      this.token = data.token;
      this.user = data.user;
      
      return {
        success: true,
        user: data.user
      };
      
    } catch (error) {
      console.error('❌ Erreur de connexion:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Déconnecte l'utilisateur
   * @param {boolean} redirectToLogin - Si true, redirige vers la page de connexion
   */
  logout(redirectToLogin = true) {
    // Supprimer les données d'authentification
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    this.token = null;
    this.user = null;
    
    // Redirection optionnelle
    if (redirectToLogin) {
      window.location.href = 'auth.html';
    }
  }
  
  /**
   * Vérifie si le token actuel est valide
   * @returns {Promise<boolean>} True si le token est valide
   */
  async verifyToken() {
    try {
      if (!this.token) {
        return false;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.success;
      
    } catch (error) {
      console.error('❌ Erreur lors de la vérification du token:', error);
      return false;
    }
  }
  
  /**
   * Vérifie si l'utilisateur est connecté
   * @returns {boolean} True si l'utilisateur est connecté
   */
  isLoggedIn() {
    return !!this.token && !!this.user;
  }
  
  /**
   * Récupère les informations de l'utilisateur actuel
   * @returns {Object|null} Informations utilisateur ou null si non connecté
   */
  getCurrentUser() {
    return this.user;
  }
  
  /**
   * Récupère le token d'authentification actuel
   * @returns {string|null} Token ou null si non connecté
   */
  getToken() {
    return this.token;
  }
  
  /**
   * Ajoute le token d'authentification aux en-têtes d'une requête
   * @param {Object} headers - En-têtes existants
   * @returns {Object} En-têtes avec authentification
   */
  addAuthHeaders(headers = {}) {
    if (this.token) {
      return {
        ...headers,
        'Authorization': `Bearer ${this.token}`
      };
    }
    return headers;
  }
}

// Création d'une instance unique pour l'application
window.authCloud = new AuthCloud();

// Export pour l'utilisation en mode module
export default AuthCloud;