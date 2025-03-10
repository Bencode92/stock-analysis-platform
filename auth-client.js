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
  
  /**
   * Initialise tous les écouteurs d'événements pour les formulaires et onglets
   */
  initEventListeners() {
    // Gestion des onglets
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab));
    });
    
    // Gestion des formulaires
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }
    
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => this.handleSignupSubmit(e));
    }
    
    // Bouton continuer après connexion
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.continueToApp());
    }
    
    // Mot de passe oublié
    const forgotPassword = document.getElementById('forgot-password');
    if (forgotPassword) {
      forgotPassword.addEventListener('click', (e) => this.handleForgotPassword(e));
    }
    
    // Connexion sociale
    const socialButtons = document.querySelectorAll('.social-btn');
    socialButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleSocialLogin(e, btn.getAttribute('title')));
    });
    
    // Validation en temps réel des champs
    this.initInputValidation();
  }
  
  /**
   * Initialise la validation en temps réel des champs
   */
  initInputValidation() {
    // Validation de l'email (login)
    const loginEmail = document.getElementById('login-email');
    if (loginEmail) {
      loginEmail.addEventListener('blur', () => {
        if (loginEmail.value && !this.validateEmail(loginEmail.value)) {
          document.getElementById('login-email-error').style.display = 'block';
          loginEmail.classList.add('shake');
          setTimeout(() => loginEmail.classList.remove('shake'), 600);
        } else {
          document.getElementById('login-email-error').style.display = 'none';
        }
      });
    }
    
    // Validation du mot de passe (login)
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) {
      loginPassword.addEventListener('blur', () => {
        if (!loginPassword.value) {
          document.getElementById('login-password-error').style.display = 'block';
        } else {
          document.getElementById('login-password-error').style.display = 'none';
        }
      });
    }
    
    // Validation du nom (signup)
    const signupName = document.getElementById('signup-name');
    if (signupName) {
      signupName.addEventListener('blur', () => {
        if (!signupName.value || signupName.value.length < 3) {
          document.getElementById('signup-name-error').style.display = 'block';
        } else {
          document.getElementById('signup-name-error').style.display = 'none';
        }
      });
    }
    
    // Validation de l'email (signup)
    const signupEmail = document.getElementById('signup-email');
    if (signupEmail) {
      signupEmail.addEventListener('blur', () => {
        if (signupEmail.value && !this.validateEmail(signupEmail.value)) {
          document.getElementById('signup-email-error').style.display = 'block';
          signupEmail.classList.add('shake');
          setTimeout(() => signupEmail.classList.remove('shake'), 600);
        } else {
          document.getElementById('signup-email-error').style.display = 'none';
        }
      });
    }
    
    // Validation du mot de passe (signup)
    const signupPassword = document.getElementById('signup-password');
    if (signupPassword) {
      signupPassword.addEventListener('blur', () => {
        if (!signupPassword.value || signupPassword.value.length < 8) {
          document.getElementById('signup-password-error').style.display = 'block';
        } else {
          document.getElementById('signup-password-error').style.display = 'none';
        }
      });
    }
    
    // Validation de la confirmation du mot de passe
    const signupConfirm = document.getElementById('signup-confirm');
    if (signupConfirm && signupPassword) {
      signupConfirm.addEventListener('blur', () => {
        if (signupPassword.value !== signupConfirm.value) {
          document.getElementById('signup-confirm-error').style.display = 'block';
          signupConfirm.classList.add('shake');
          setTimeout(() => signupConfirm.classList.remove('shake'), 600);
        } else {
          document.getElementById('signup-confirm-error').style.display = 'none';
        }
      });
      
      // Vérification en temps réel
      signupConfirm.addEventListener('input', () => {
        if (signupPassword.value === signupConfirm.value && signupConfirm.value) {
          document.getElementById('signup-confirm-error').style.display = 'none';
          signupConfirm.style.borderColor = 'var(--success-color)';
        } else if (signupConfirm.value) {
          document.getElementById('signup-confirm-error').style.display = 'block';
          signupConfirm.style.borderColor = 'var(--error-color)';
        }
      });
    }
    
    // Vérification de la force du mot de passe
    if (signupPassword) {
      signupPassword.addEventListener('input', () => {
        if (signupPassword.value.length > 0) {
          const strength = this.checkPasswordStrength(signupPassword.value);
          
          if (strength === 'strong') {
            signupPassword.style.borderColor = 'var(--success-color)';
          } else if (strength === 'medium') {
            signupPassword.style.borderColor = 'orange';
          } else {
            signupPassword.style.borderColor = 'var(--error-color)';
          }
        }
      });
    }
  }
  
  /**
   * Change d'onglet (login/signup)
   * @param {HTMLElement} tab - L'onglet cliqué
   */
  switchTab(tab) {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const targetId = tab.getAttribute('data-target');
    
    // Mise à jour de l'état
    this.state.currentTab = targetId === 'login-form' ? 'login' : 'signup';
    
    // Mise à jour des onglets actifs
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Animation de transition du formulaire
    const isMovingLeft = targetId === 'login-form';
    
    forms.forEach(form => {
      form.classList.remove('active', 'prev', 'slide-left', 'slide-right');
      
      if (form.id === targetId) {
        form.classList.add('active');
        form.classList.add(isMovingLeft ? 'slide-right' : 'slide-left');
      } else {
        form.classList.add('prev');
      }
    });
  }
  
  /**
   * Gère la soumission du formulaire de connexion
   * @param {Event} e - L'événement de soumission
   */
  async handleLoginSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    // Validation basique
    if (!this.validateLoginForm(email, password)) {
      return;
    }
    
    // Activer l'état de chargement
    this.setLoading(true, 'login');
    
    try {
      // Appel à l'API d'authentification
      const response = await fetch(`${this.apiBaseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la connexion');
      }
      
      // Stocker le token et les informations utilisateur
      this.loginSuccess({
        name: data.user.name,
        email: data.user.email,
        token: data.token
      });
      
    } catch (error) {
      console.error('Erreur de connexion:', error);
      
      // Afficher le message d'erreur
      const errorContainer = document.getElementById('login-general-error');
      if (errorContainer) {
        errorContainer.textContent = error.message;
        errorContainer.style.display = 'block';
      }
      
      // Désactiver l'état de chargement
      this.setLoading(false, 'login');
    }
  }
  
  /**
   * Gère la soumission du formulaire d'inscription
   * @param {Event} e - L'événement de soumission
   */
  async handleSignupSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    
    // Validation basique
    if (!this.validateSignupForm(name, email, password, confirm)) {
      return;
    }
    
    // Activer l'état de chargement
    this.setLoading(true, 'signup');
    
    try {
      // Appel à l'API d'authentification
      const response = await fetch(`${this.apiBaseUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'inscription');
      }
      
      // Stocker le token et les informations utilisateur
      this.signupSuccess({
        name: data.user.name,
        email: data.user.email,
        token: data.token
      });
      
    } catch (error) {
      console.error('Erreur d\'inscription:', error);
      
      // Afficher le message d'erreur
      const errorContainer = document.getElementById('signup-general-error');
      if (errorContainer) {
        errorContainer.textContent = error.message;
        errorContainer.style.display = 'block';
      }
      
      // Désactiver l'état de chargement
      this.setLoading(false, 'signup');
    }
  }
  
  /**
   * Valide le formulaire de connexion
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe
   * @returns {boolean} - Formulaire valide ou non
   */
  validateLoginForm(email, password) {
    let isValid = true;
    
    // Validation de l'email
    if (!this.validateEmail(email)) {
      document.getElementById('login-email-error').style.display = 'block';
      document.getElementById('login-email').classList.add('shake');
      setTimeout(() => document.getElementById('login-email').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('login-email-error').style.display = 'none';
    }
    
    // Validation du mot de passe
    if (!password) {
      document.getElementById('login-password-error').style.display = 'block';
      document.getElementById('login-password').classList.add('shake');
      setTimeout(() => document.getElementById('login-password').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('login-password-error').style.display = 'none';
    }
    
    return isValid;
  }
  
  /**
   * Valide le formulaire d'inscription
   * @param {string} name - Nom de l'utilisateur
   * @param {string} email - Email
   * @param {string} password - Mot de passe
   * @param {string} confirm - Confirmation du mot de passe
   * @returns {boolean} - Formulaire valide ou non
   */
  validateSignupForm(name, email, password, confirm) {
    let isValid = true;
    
    // Validation du nom
    if (!name || name.length < 3) {
      document.getElementById('signup-name-error').style.display = 'block';
      document.getElementById('signup-name').classList.add('shake');
      setTimeout(() => document.getElementById('signup-name').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('signup-name-error').style.display = 'none';
    }
    
    // Validation de l'email
    if (!this.validateEmail(email)) {
      document.getElementById('signup-email-error').style.display = 'block';
      document.getElementById('signup-email').classList.add('shake');
      setTimeout(() => document.getElementById('signup-email').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('signup-email-error').style.display = 'none';
    }
    
    // Validation du mot de passe
    if (!password || password.length < 8) {
      document.getElementById('signup-password-error').style.display = 'block';
      document.getElementById('signup-password').classList.add('shake');
      setTimeout(() => document.getElementById('signup-password').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('signup-password-error').style.display = 'none';
    }
    
    // Validation de la confirmation du mot de passe
    if (password !== confirm) {
      document.getElementById('signup-confirm-error').style.display = 'block';
      document.getElementById('signup-confirm').classList.add('shake');
      setTimeout(() => document.getElementById('signup-confirm').classList.remove('shake'), 600);
      isValid = false;
    } else {
      document.getElementById('signup-confirm-error').style.display = 'none';
    }
    
    return isValid;
  }
  
  /**
   * Définit l'état de chargement des formulaires
   * @param {boolean} isLoading - État de chargement
   * @param {string} form - Formulaire concerné ('login' ou 'signup')
   */
  setLoading(isLoading, form) {
    this.state.isLoading = isLoading;
    
    const buttonId = form === 'login' ? 'login-btn' : 'signup-btn';
    const button = document.getElementById(buttonId);
    
    if (isLoading) {
      button.classList.add('loading');
      button.innerHTML = form === 'login' ? 
        'CONNEXION EN COURS... <div class="loading-spinner"></div>' : 
        'CRÉATION EN COURS... <div class="loading-spinner"></div>';
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.innerHTML = form === 'login' ? 'SE CONNECTER' : 'CRÉER UN COMPTE';
      button.disabled = false;
    }
  }
  
  /**
   * Gère le succès de la connexion
   * @param {Object} userData - Données de l'utilisateur
   */
  loginSuccess(userData) {
    // Stocker les informations d'utilisateur
    localStorage.setItem('tradepulse_user', JSON.stringify({
      email: userData.email,
      name: userData.name,
      token: userData.token,
      isLoggedIn: true,
      loginTime: Date.now()
    }));
    
    // Mettre à jour l'état
    this.state.isLoggedIn = true;
    this.state.user = {
      name: userData.name,
      email: userData.email
    };
    
    // Afficher le message de succès
    document.getElementById('success-message').classList.add('active');
    
    // Mettre fin au chargement
    this.setLoading(false, 'login');
  }
  
  /**
   * Gère le succès de l'inscription
   * @param {Object} userData - Données de l'utilisateur
   */
  signupSuccess(userData) {
    // Stocker les informations d'utilisateur
    localStorage.setItem('tradepulse_user', JSON.stringify({
      email: userData.email,
      name: userData.name,
      token: userData.token,
      isLoggedIn: true,
      loginTime: Date.now()
    }));
    
    // Mettre à jour l'état
    this.state.isLoggedIn = true;
    this.state.user = {
      name: userData.name,
      email: userData.email
    };
    
    // Afficher le message de succès
    document.getElementById('success-message').classList.add('active');
    
    // Mettre fin au chargement
    this.setLoading(false, 'signup');
  }
  
  /**
   * Vérifie si l'utilisateur est connecté
   * @returns {boolean} - État de connexion
   */
  checkLoginStatus() {
    const userData = localStorage.getItem('tradepulse_user');
    
    if (userData) {
      try {
        const user = JSON.parse(userData);
        
        if (user.token) {
          return true;
        }
      } catch (error) {
        console.error('Erreur lors de la vérification du statut de connexion:', error);
      }
    }
    
    return false;
  }
  
  /**
   * Récupère les informations de l'utilisateur actuel
   */
  async fetchCurrentUser() {
    try {
      const userData = JSON.parse(localStorage.getItem('tradepulse_user'));
      
      if (!userData || !userData.token) {
        throw new Error('Utilisateur non connecté');
      }
      
      // Vérifier la validité du token avec l'API
      const response = await fetch(`${this.apiBaseUrl}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userData.token}`,
        },
      });
      
      if (!response.ok) {
        // Token invalide, déconnecter l'utilisateur
        this.logout();
        throw new Error('Session expirée, veuillez vous reconnecter');
      }
      
      const data = await response.json();
      
      // Mettre à jour les informations utilisateur
      this.state.user = data.user;
    } catch (error) {
      console.error('Erreur lors de la récupération des informations utilisateur:', error);
      this.logout();
    }
  }
  
  /**
   * Déconnecte l'utilisateur
   */
  async logout() {
    try {
      const userData = JSON.parse(localStorage.getItem('tradepulse_user'));
      
      if (userData && userData.token) {
        // Appel à l'API pour invalider le token
        await fetch(`${this.apiBaseUrl}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userData.token}`,
          },
        });
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
    
    // Supprimer les données utilisateur du localStorage
    localStorage.removeItem('tradepulse_user');
    
    // Mettre à jour l'état
    this.state.isLoggedIn = false;
    this.state.user = null;
    
    // Rediriger vers la page de connexion
    window.location.href = 'auth.html';
  }
  
  /**
   * Continue vers l'application après la connexion
   */
  continueToApp() {
    // Redirection vers la page de mise à jour
    window.location.href = 'update.html';
  }
  
  /**
   * Gère la demande de mot de passe oublié
   * @param {Event} e - L'événement de clic
   */
  handleForgotPassword(e) {
    e.preventDefault();
    
    // Afficher une alerte stylisée (à remplacer par votre logique)
    alert('Un email de réinitialisation a été envoyé à votre adresse email si elle est associée à un compte.');
    
    // Simuler l'envoi d'un email (à implémenter réellement)
    console.log('Envoi d\'un email de réinitialisation à:', document.getElementById('login-email').value);
  }
  
  /**
   * Gère la connexion via réseau social
   * @param {Event} e - L'événement de clic
   * @param {string} provider - Le fournisseur d'authentification
   */
  handleSocialLogin(e, provider) {
    e.preventDefault();
    
    // Afficher une alerte stylisée (à remplacer par votre logique)
    alert(`Connexion via ${provider} en cours de développement. Veuillez utiliser le formulaire de connexion standard.`);
  }
  
  /**
   * Valide un email
   * @param {string} email - Email à valider
   * @returns {boolean} - Email valide ou non
   */
  validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}])|(([a-zA-Z-0-9]+.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
  }
  
  /**
   * Vérifie la force d'un mot de passe
   * @param {string} password - Mot de passe à vérifier
   * @returns {string} - Force du mot de passe ('weak', 'medium', 'strong')
   */
  checkPasswordStrength(password) {
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (password.length >= 8 && hasLowerCase && hasUpperCase && (hasNumber || hasSpecialChar)) {
      if (password.length >= 12 && hasLowerCase && hasUpperCase && hasNumber && hasSpecialChar) {
        return 'strong';
      }
      return 'medium';
    }
    
    return 'weak';
  }
}

// Initialiser l'authentification lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
  // Utiliser l'API déployée avec le sous-domaine correct
  // Note: Remplacez 'bencode92' par votre sous-domaine Cloudflare si nécessaire
  const authClient = new AuthClient('https://auth-api.bencode92.workers.dev/api/auth');
});

// Exporter la classe pour l'utiliser dans d'autres scripts
window.AuthClient = AuthClient;