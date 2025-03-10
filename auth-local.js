/**
 * auth-local.js - Système d'authentification local pour TradePulse
 * Solution temporaire en cas d'indisponibilité du Worker Cloudflare
 */

class AuthLocal {
  constructor() {
    this.storageKey = 'tradepulse_users';
    this.currentUserKey = 'tradepulse_user';
    
    // Initialisez la base d'utilisateurs si nécessaire
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify([]));
    }
    
    console.log('Système d\'authentification local initialisé');
  }
  
  /**
   * Enregistre un nouvel utilisateur
   * @param {Object} userData - Données de l'utilisateur
   * @returns {Promise} Promise avec les données de l'utilisateur
   */
  async register(userData) {
    const { name, email, password } = userData;
    
    // Validation basique
    if (!name || !email || !password) {
      return Promise.reject(new Error('Tous les champs sont requis'));
    }
    
    if (password.length < 8) {
      return Promise.reject(new Error('Le mot de passe doit contenir au moins 8 caractères'));
    }
    
    // Vérification si l'utilisateur existe déjà
    const users = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    if (users.find(u => u.email === email)) {
      return Promise.reject(new Error('Cet email est déjà utilisé'));
    }
    
    // Création d'un nouvel utilisateur
    const newUser = {
      id: this.generateUUID(),
      name,
      email,
      password: this.hashPassword(password), // Simple hachage pour la démo
      createdAt: new Date().toISOString()
    };
    
    // Ajout à la base d'utilisateurs
    users.push(newUser);
    localStorage.setItem(this.storageKey, JSON.stringify(users));
    
    // Générer un token simple
    const token = this.generateToken(newUser);
    
    // Connecter automatiquement l'utilisateur
    const { password: _, ...userWithoutPassword } = newUser;
    const session = {
      ...userWithoutPassword,
      token,
      isLoggedIn: true,
      loginTime: Date.now()
    };
    
    localStorage.setItem(this.currentUserKey, JSON.stringify(session));
    
    // Simule un délai réseau
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          user: userWithoutPassword,
          token
        });
      }, 300);
    });
  }
  
  /**
   * Connecte un utilisateur
   * @param {Object} credentials - Identifiants de connexion
   * @returns {Promise} Promise avec les données de l'utilisateur
   */
  async login(credentials) {
    const { email, password } = credentials;
    
    // Validation basique
    if (!email || !password) {
      return Promise.reject(new Error('Email et mot de passe sont requis'));
    }
    
    // Recherche de l'utilisateur
    const users = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    const user = users.find(u => u.email === email);
    
    if (!user || user.password !== this.hashPassword(password)) {
      return Promise.reject(new Error('Email ou mot de passe incorrect'));
    }
    
    // Générer un token simple
    const token = this.generateToken(user);
    
    // Créer la session
    const { password: _, ...userWithoutPassword } = user;
    const session = {
      ...userWithoutPassword,
      token,
      isLoggedIn: true,
      loginTime: Date.now()
    };
    
    localStorage.setItem(this.currentUserKey, JSON.stringify(session));
    
    // Simule un délai réseau
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          user: userWithoutPassword,
          token
        });
      }, 300);
    });
  }
  
  /**
   * Vérifie la validité d'un token
   * @param {string} token - Token à vérifier
   * @returns {Promise} Promise avec les données de l'utilisateur
   */
  async verify(token) {
    // Vérifier si l'utilisateur est connecté
    const session = JSON.parse(localStorage.getItem(this.currentUserKey) || '{}');
    
    if (!session.token || session.token !== token) {
      return Promise.reject(new Error('Token invalide ou expiré'));
    }
    
    // Vérifier si la session n'est pas expirée (24h)
    const currentTime = Date.now();
    const loginTime = session.loginTime || 0;
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (currentTime - loginTime > dayInMs) {
      this.logout();
      return Promise.reject(new Error('Session expirée'));
    }
    
    // Simule un délai réseau
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          user: session
        });
      }, 300);
    });
  }
  
  /**
   * Déconnecte l'utilisateur
   * @returns {Promise} Promise de confirmation
   */
  async logout() {
    localStorage.removeItem(this.currentUserKey);
    
    // Simule un délai réseau
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true });
      }, 300);
    });
  }
  
  /**
   * Génère un UUID simple
   * @returns {string} UUID
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  /**
   * Génère un token simple
   * @param {Object} user - Utilisateur
   * @returns {string} Token
   */
  generateToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      timestamp: Date.now()
    };
    
    // Token simple pour la démo
    return btoa(JSON.stringify(payload)) + '.demo';
  }
  
  /**
   * Hachage simple du mot de passe
   * @param {string} password - Mot de passe
   * @returns {string} Hachage
   */
  hashPassword(password) {
    // Ceci est un hachage simple pour la démonstration
    // En production, utilisez bcrypt ou similaire
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// Créer une instance globale
window.authLocal = new AuthLocal();
