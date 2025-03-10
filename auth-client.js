/**
 * auth-client.js - Script client d'authentification pour TradePulse
 * Gère les interactions avec l'API d'authentification et les formulaires
 */

class AuthClient {
  constructor(apiBaseUrl) {
    // URL de base de l'API d'authentification
    this.apiBaseUrl = apiBaseUrl || 'https://auth-api.bencode92.workers.dev/api/auth';
    this.isUsingLocalStorage = false; // Utilisation de l'API par défaut
    
    // État de l'application
    this.state = {
      currentTab: 'login',
      isLoading: false,
      isLoggedIn: this.checkLoginStatus(),
      user: null
    };
    
    // Initialiser les écouteurs d'événements
    this.initEventListeners();
    
    // Si l'utilisateur est déjà connecté, récupérer ses informations
    if (this.state.isLoggedIn) {
      this.fetchCurrentUser();
    }
    
    console.log('AuthClient initialisé avec l\'API', this.apiBaseUrl);
  }
  
  /* ... le reste du code reste identique ... */
}

// Initialiser l'authentification lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
  // Utiliser l'API déployée avec le sous-domaine correct
  // Note: Si vous déployez votre propre version, mettez à jour cette URL
  const authClient = new AuthClient('https://auth-api.bencode92.workers.dev/api/auth');
});

// Exporter la classe pour l'utiliser dans d'autres scripts
window.AuthClient = AuthClient;