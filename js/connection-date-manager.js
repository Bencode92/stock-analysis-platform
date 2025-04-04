/**
 * Gestionnaire de date de connexion
 * Permet de stocker et récupérer la date de connexion de l'utilisateur
 * Utile pour filtrer les nouvelles actualités par rapport à la dernière visite
 */
const ConnectionDateManager = {
    // Clé de stockage LocalStorage
    STORAGE_KEY: 'userConnectionDate',
    
    // Initialisation - à appeler au chargement de la page
    init: function() {
        // Stocker la date actuelle comme date de connexion si elle n'existe pas
        if (!this.getConnectionDate()) {
            this.setConnectionDate(new Date());
        }
        
        // Afficher la date formatée dans l'élément approprié
        this.displayFormattedDate();
    },
    
    // Définir la date de connexion
    setConnectionDate: function(date) {
        localStorage.setItem(this.STORAGE_KEY, date.toISOString());
        console.log("Date de connexion enregistrée: " + date.toLocaleString());
    },
    
    // Récupérer la date de connexion
    getConnectionDate: function() {
        const storedDate = localStorage.getItem(this.STORAGE_KEY);
        return storedDate ? new Date(storedDate) : null;
    },
    
    // Obtenir la date formatée pour l'affichage
    getFormattedDate: function() {
        const date = this.getConnectionDate();
        if (!date) return '';
        
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },
    
    // Afficher la date formatée dans l'élément DOM
    displayFormattedDate: function() {
        const formattedDateEl = document.getElementById('formatted-date');
        if (formattedDateEl) {
            const formattedDate = this.getFormattedDate();
            formattedDateEl.textContent = formattedDate.replace(/\//g, '.');
        }
        
        const currentDateEl = document.getElementById('currentDate');
        if (currentDateEl) {
            const now = new Date();
            const options = { day: 'numeric', month: 'long', year: 'numeric' };
            currentDateEl.textContent = now.toLocaleDateString('fr-FR', options).toUpperCase();
        }
    },
    
    // Vérifier si une date est plus récente que la date de connexion
    isNewerThanConnectionDate: function(dateStr) {
        const connectionDate = this.getConnectionDate();
        if (!connectionDate) return false;
        
        try {
            // Convertir la chaîne de date en objet Date
            // Format attendu: DD/MM/YYYY ou YYYY-MM-DD
            let checkDate;
            
            if (dateStr.includes('/')) {
                // Format DD/MM/YYYY
                const parts = dateStr.split('/');
                checkDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else if (dateStr.includes('-')) {
                // Format YYYY-MM-DD
                checkDate = new Date(dateStr);
            } else {
                return false;
            }
            
            // Comparer les dates (sans l'heure)
            return checkDate > connectionDate;
        } catch (e) {
            console.error('Erreur lors de la comparaison des dates:', e);
            return false;
        }
    }
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    ConnectionDateManager.init();
});