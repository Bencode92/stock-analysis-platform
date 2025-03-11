/**
 * auth.js - Module de gestion de l'authentification
 * Ce script contient la logique d'authentification temporaire pendant
 * que le système d'authentification complet est en cours de mise à jour.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configurer le bouton de la page auth.html pour rediriger automatiquement
    // vers actualites.html en contournant l'authentification
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
            
            // Vérifier si une mise à jour est nécessaire
            const lastUpdate = localStorage.getItem('tradepulse_last_update');
            const now = Date.now();
            const showUpdateModal = !lastUpdate || (now - parseInt(lastUpdate)) / (1000 * 60 * 60) > 4;
            
            // Rediriger vers la page des actualités
            if (showUpdateModal) {
                // Si une mise à jour est nécessaire, afficher le modal de mise à jour
                // en passant par index.html où le modal sera automatiquement affiché
                window.location.href = 'index.html?update=true';
            } else {
                // Sinon, rediriger directement vers les actualités
                window.location.href = 'actualites.html';
            }
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
