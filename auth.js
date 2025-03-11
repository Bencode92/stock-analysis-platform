/**
 * auth.js - Module de gestion de l'authentification
 * Ce script contient la logique d'authentification temporaire pendant
 * que le système d'authentification complet est en cours de mise à jour.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configurer le bouton de la page auth.html pour rediriger vers
    // la page de mise à jour avant d'accéder aux actualités
    const accessButton = document.querySelector('.back-btn');
    
    if (accessButton) {
        accessButton.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Simuler une connexion en créant un utilisateur factice
            const dummyUser = {
                name: "Utilisateur Temporaire",
                email: "utilisateur@tradepulse.com",
                isLoggedIn: true,
                loginTime: Date.now()
            };
            
            // Sauvegarder dans localStorage
            localStorage.setItem('tradepulse_user', JSON.stringify(dummyUser));
            
            // Enregistrer l'information sur les mises à jour nécessaires dans localStorage
            const lastUpdate = localStorage.getItem('tradepulse_last_update');
            const now = Date.now();
            const showUpdateModal = !lastUpdate || (now - parseInt(lastUpdate)) / (1000 * 60 * 60) > 4;
            
            if (showUpdateModal) {
                // Rediriger vers la page de mise à jour
                window.location.href = 'update.html';
            } else {
                // Rediriger directement vers la page des actualités si pas besoin de mise à jour
                window.location.href = 'actualites.html';
            }
        });
    }
    
    // Gestion de la mise à jour sur la page update.html
    const updateNowBtn = document.getElementById('updateNowBtn');
    const skipUpdateBtn = document.getElementById('skipUpdateBtn');
    const updateLoader = document.getElementById('updateLoader');
    const updateComplete = document.getElementById('updateComplete');
    const progressBar = document.querySelector('.progress-bar-inner');
    const updatePercentage = document.querySelector('.update-percentage');
    const updateStatus = document.querySelector('.update-status');
    
    if (updateNowBtn && skipUpdateBtn) {
        // Fonctionnalité du bouton "Mettre à jour maintenant"
        updateNowBtn.addEventListener('click', function() {
            // Cacher les boutons et afficher le loader
            document.querySelector('.modal-buttons').style.display = 'none';
            updateLoader.style.display = 'block';
            
            // Simuler la progression de la mise à jour
            let progress = 0;
            const updateInterval = setInterval(function() {
                progress += Math.random() * 10;
                if (progress > 100) progress = 100;
                
                // Mettre à jour la barre de progression
                progressBar.style.width = progress + '%';
                updatePercentage.textContent = Math.round(progress) + '%';
                
                // Mettre à jour le message de statut
                if (progress < 33) {
                    updateStatus.textContent = "Récupération des données...";
                } else if (progress < 66) {
                    updateStatus.textContent = "Mise à jour des actualités et événements...";
                } else if (progress < 99) {
                    updateStatus.textContent = "Mise à jour des recommandations de portefeuille...";
                } else {
                    updateStatus.textContent = "Finalisation de la mise à jour...";
                }
                
                // Quand la mise à jour est terminée
                if (progress >= 100) {
                    clearInterval(updateInterval);
                    
                    // Sauvegarder l'heure de la dernière mise à jour
                    localStorage.setItem('tradepulse_last_update', Date.now().toString());
                    
                    // Afficher l'animation de complétion
                    setTimeout(function() {
                        updateLoader.style.display = 'none';
                        updateComplete.style.display = 'block';
                        
                        // Rediriger vers actualites.html après un court délai
                        setTimeout(function() {
                            window.location.href = 'actualites.html';
                        }, 2000);
                    }, 500);
                }
            }, 200);
        });
        
        // Fonctionnalité du bouton "Plus tard"
        skipUpdateBtn.addEventListener('click', function() {
            // Rediriger directement vers la page d'actualités sans mise à jour
            window.location.href = 'actualites.html';
        });
    }
    
    // Fonction pour vérifier l'état de connexion
    window.checkLoginStatus = function() {
        const userData = localStorage.getItem('tradepulse_user');
        
        if (userData) {
            try {
                const user = JSON.parse(userData);
                
                // Vérifier si le token est encore valide
                const currentTime = Date.now();
                const loginTime = user.loginTime || 0;
                const dayInMs = 24 * 60 * 60 * 1000;
                
                return user.isLoggedIn && (currentTime - loginTime < dayInMs);
            } catch (error) {
                console.error('Erreur lors de la vérification du statut de connexion:', error);
                return false;
            }
        }
        
        return false;
    };
});