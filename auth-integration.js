/**
 * auth-integration.js - Intégration du système d'authentification hybride
 * Ce script combine le stockage local et l'authentification cloud
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si l'authentification cloud est disponible
    let useCloud = true;
    
    // Fonction pour tester la disponibilité du cloud
    async function testCloudAvailability() {
        try {
            // Essayer de vérifier la connexion au service cloud
            if (window.authCloud) {
                // Si l'initialisation n'est pas encore terminée, attendre
                if (!window.authCloud.isInitialized) {
                    await new Promise(resolve => {
                        const checkInit = () => {
                            if (window.authCloud.isInitialized) {
                                resolve();
                            } else {
                                setTimeout(checkInit, 100);
                            }
                        };
                        checkInit();
                    });
                }
                
                // Vérifier si on peut contacter le serveur
                await window.authCloud.verifyToken();
                useCloud = true;
                
                // Masquer la bannière "mode local"
                document.querySelector('.local-mode-banner').style.display = 'none';
                console.log('✅ Mode authentification cloud activé');
            } else {
                throw new Error('Module authCloud non disponible');
            }
        } catch (error) {
            useCloud = false;
            
            // Afficher la bannière "mode local"
            document.querySelector('.local-mode-banner').style.display = 'flex';
            console.log('⚠️ Mode authentification local activé:', error);
        }
    }
    
    // Tester la disponibilité du cloud
    testCloudAvailability();
    
    // Gestion des onglets
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Retirer la classe active de tous les onglets
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Afficher le formulaire correspondant
            const targetId = tab.getAttribute('data-target');
            document.querySelectorAll('.auth-form').forEach(form => {
                form.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // ===== SYSTÈME D'AUTHENTIFICATION HYBRIDE =====
    
    // Gérer la soumission du formulaire d'inscription
    const signupForm = document.getElementById('signup-form');
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Cacher les messages d'erreur précédents
        document.getElementById('signup-general-error').style.display = 'none';
        
        // Récupérer les valeurs
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        
        // Validation simple
        if (!name || !email || !password || !confirm) {
            document.getElementById('signup-general-error').textContent = 'Veuillez remplir tous les champs';
            document.getElementById('signup-general-error').style.display = 'block';
            return;
        }
        
        if (password !== confirm) {
            document.getElementById('signup-general-error').textContent = 'Les mots de passe ne correspondent pas';
            document.getElementById('signup-general-error').style.display = 'block';
            return;
        }
        
        if (password.length < 8) {
            document.getElementById('signup-general-error').textContent = 'Le mot de passe doit contenir au moins 8 caractères';
            document.getElementById('signup-general-error').style.display = 'block';
            return;
        }
        
        // Mettre à jour l'interface pour montrer le chargement
        const signupBtn = document.getElementById('signup-btn');
        signupBtn.classList.add('loading');
        signupBtn.innerHTML = 'CRÉATION EN COURS... <div class="loading-spinner"></div>';
        
        try {
            let result;
            
            // Utiliser l'authentification cloud si disponible
            if (useCloud && window.authCloud) {
                result = await window.authCloud.register({ name, email, password });
            } else {
                // Sinon utiliser le système local existant
                result = await window.authLocal.register({ name, email, password });
            }
            
            if (result.success) {
                // Afficher le message de succès
                document.getElementById('success-message').classList.add('active');
            } else {
                throw new Error(result.message || 'Erreur lors de l\'inscription');
            }
            
        } catch (error) {
            // Afficher l'erreur
            document.getElementById('signup-general-error').textContent = error.message;
            document.getElementById('signup-general-error').style.display = 'block';
            
            // Réinitialiser le bouton
            signupBtn.classList.remove('loading');
            signupBtn.innerHTML = 'CRÉER UN COMPTE';
        }
    });
    
    // Gérer la soumission du formulaire de connexion
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Cacher les messages d'erreur précédents
        document.getElementById('login-general-error').style.display = 'none';
        
        // Récupérer les valeurs
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        // Validation simple
        if (!email || !password) {
            document.getElementById('login-general-error').textContent = 'Veuillez remplir tous les champs';
            document.getElementById('login-general-error').style.display = 'block';
            return;
        }
        
        // Mettre à jour l'interface pour montrer le chargement
        const loginBtn = document.getElementById('login-btn');
        loginBtn.classList.add('loading');
        loginBtn.innerHTML = 'CONNEXION EN COURS... <div class="loading-spinner"></div>';
        
        try {
            let result;
            
            // Utiliser l'authentification cloud si disponible
            if (useCloud && window.authCloud) {
                result = await window.authCloud.login({ email, password });
            } else {
                // Sinon utiliser le système local existant
                result = await window.authLocal.login({ email, password });
            }
            
            if (result.success) {
                // Afficher le message de succès
                document.getElementById('success-message').classList.add('active');
            } else {
                throw new Error(result.message || 'Identifiants incorrects');
            }
            
        } catch (error) {
            // Afficher l'erreur
            document.getElementById('login-general-error').textContent = error.message;
            document.getElementById('login-general-error').style.display = 'block';
            
            // Réinitialiser le bouton
            loginBtn.classList.remove('loading');
            loginBtn.innerHTML = 'SE CONNECTER';
        }
    });
    
    // Gestion du bouton continuer après connexion réussie
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', function() {
            window.location.href = 'dashboard.html';
        });
    }
    
    // Gestion du mot de passe oublié
    document.getElementById('forgot-password').addEventListener('click', function(e) {
        e.preventDefault();
        alert('Fonctionnalité de récupération de mot de passe en cours de développement. Veuillez utiliser le mode local temporairement.');
    });
    
    // Gestion des boutons de connexion sociale
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            alert('La connexion via ' + this.title + ' est en cours de développement. Veuillez utiliser la méthode de connexion standard.');
        });
    });
});