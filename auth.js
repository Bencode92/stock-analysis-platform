/**
 * auth.js - Gestion de l'authentification pour TradePulse
 * 
 * Ce fichier gère:
 * - La connexion des utilisateurs
 * - L'inscription des nouveaux utilisateurs
 * - La gestion des sessions
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.authContainer = document.getElementById('auth-container');
        this.loginTab = document.getElementById('login-tab');
        this.signupTab = document.getElementById('signup-tab');
        this.loginForm = document.getElementById('login-form');
        this.signupForm = document.getElementById('signup-form');
        this.authError = document.getElementById('auth-error');
        this.authSuccess = document.getElementById('auth-success');
        
        this.initializeEvents();
        this.checkExistingSession();
    }
    
    /**
     * Initialise les événements des formulaires et des onglets
     */
    initializeEvents() {
        // Si les éléments d'authentification existent
        if (this.loginTab && this.signupTab) {
            // Gestion des onglets
            this.loginTab.addEventListener('click', () => this.switchTab('login'));
            this.signupTab.addEventListener('click', () => this.switchTab('signup'));
            
            // Gestion des formulaires
            if (this.loginForm) {
                this.loginForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.loginUser();
                });
            }
            
            if (this.signupForm) {
                this.signupForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.registerUser();
                });
            }
            
            // Effets visuels pour les champs de formulaire
            const formControls = document.querySelectorAll('.auth-input');
            formControls.forEach(control => {
                control.addEventListener('focus', () => {
                    control.parentElement.classList.add('focused');
                });
                
                control.addEventListener('blur', () => {
                    if (!control.value) {
                        control.parentElement.classList.remove('focused');
                    }
                });
                
                // Vérifie si le champ a déjà une valeur (pour les autofills)
                if (control.value) {
                    control.parentElement.classList.add('focused');
                }
            });
        }
    }
    
    /**
     * Vérifie si une session existe déjà
     */
    checkExistingSession() {
        const savedUser = localStorage.getItem('tradepulse_user');
        
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                
                // Mettre à jour le nom d'utilisateur dans l'interface
                const usernameDisplay = document.getElementById('username-display');
                if (usernameDisplay) {
                    usernameDisplay.textContent = this.currentUser.name || this.currentUser.email;
                }
                
                // Masquer la modal d'authentification si elle est présente
                if (this.authContainer) {
                    this.authContainer.style.display = 'none';
                }
                
                console.log('Utilisateur connecté:', this.currentUser);
                return true;
            } catch (error) {
                console.error('Erreur lors de la récupération de la session:', error);
                localStorage.removeItem('tradepulse_user');
            }
        }
        
        return false;
    }
    
    /**
     * Change l'onglet actif (login/signup)
     */
    switchTab(tab) {
        // Mise à jour des onglets
        if (tab === 'login') {
            this.loginTab.classList.add('active');
            this.signupTab.classList.remove('active');
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('signup-form').style.display = 'none';
        } else {
            this.loginTab.classList.remove('active');
            this.signupTab.classList.add('active');
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
        }
        
        // Réinitialiser les messages d'erreur et de succès
        this.authError.style.display = 'none';
        this.authSuccess.style.display = 'none';
    }
    
    /**
     * Tente de connecter l'utilisateur
     */
    loginUser() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showError('Veuillez remplir tous les champs');
            return;
        }
        
        // Vérifier les informations dans localStorage
        const users = JSON.parse(localStorage.getItem('tradepulse_users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        
        if (user) {
            // Connexion réussie
            this.currentUser = user;
            localStorage.setItem('tradepulse_user', JSON.stringify(user));
            
            this.showSuccess('Connexion réussie!');
            
            // Masquer la modal d'authentification après un court délai
            setTimeout(() => {
                this.authContainer.style.display = 'none';
                
                // Si nous avons une fonction de mise à jour à déclencher
                if (window.showUpdateModal) {
                    window.showUpdateModal();
                }
            }, 1500);
        } else {
            this.showError('Email ou mot de passe incorrect');
        }
    }
    
    /**
     * Enregistre un nouvel utilisateur
     */
    registerUser() {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        
        if (!name || !email || !password || !confirmPassword) {
            this.showError('Veuillez remplir tous les champs');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showError('Les mots de passe ne correspondent pas');
            return;
        }
        
        // Vérifier si l'email existe déjà
        const users = JSON.parse(localStorage.getItem('tradepulse_users') || '[]');
        if (users.some(u => u.email === email)) {
            this.showError('Cet email est déjà utilisé');
            return;
        }
        
        // Ajouter le nouvel utilisateur
        const newUser = { id: Date.now(), name, email, password, createdAt: new Date().toISOString() };
        users.push(newUser);
        localStorage.setItem('tradepulse_users', JSON.stringify(users));
        
        // Connecter automatiquement l'utilisateur
        this.currentUser = newUser;
        localStorage.setItem('tradepulse_user', JSON.stringify(newUser));
        
        this.showSuccess('Compte créé avec succès!');
        
        // Masquer la modal d'authentification après un court délai
        setTimeout(() => {
            this.authContainer.style.display = 'none';
            
            // Si nous avons une fonction de mise à jour à déclencher
            if (window.showUpdateModal) {
                window.showUpdateModal();
            }
        }, 1500);
    }
    
    /**
     * Déconnecte l'utilisateur actuel
     */
    logoutUser() {
        localStorage.removeItem('tradepulse_user');
        this.currentUser = null;
        
        // Si nous sommes sur une page qui nécessite une authentification, rediriger vers l'accueil
        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
            window.location.href = 'index.html';
        } else {
            // Sinon, afficher la modal d'authentification
            this.authContainer.style.display = 'flex';
        }
    }
    
    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        this.authError.textContent = message;
        this.authError.style.display = 'block';
        this.authSuccess.style.display = 'none';
        
        // Effet de secousse sur le formulaire
        const form = document.querySelector('.auth-form:not([style*="display: none"])');
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 500);
    }
    
    /**
     * Affiche un message de succès
     */
    showSuccess(message) {
        this.authSuccess.textContent = message;
        this.authSuccess.style.display = 'block';
        this.authError.style.display = 'none';
    }
    
    /**
     * Vérifie si l'utilisateur est connecté
     */
    isLoggedIn() {
        return this.currentUser !== null;
    }
    
    /**
     * Expose la modal d'authentification
     */
    showAuthModal() {
        if (this.authContainer) {
            this.authContainer.style.display = 'flex';
            
            // Animation d'apparition
            const authModal = document.querySelector('.auth-modal');
            if (authModal) {
                authModal.style.opacity = '0';
                authModal.style.transform = 'scale(0.8)';
                
                setTimeout(() => {
                    authModal.style.opacity = '1';
                    authModal.style.transform = 'scale(1)';
                }, 10);
            }
        }
    }
}

// Initialiser le gestionnaire d'authentification lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});