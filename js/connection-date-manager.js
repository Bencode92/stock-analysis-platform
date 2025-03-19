/**
 * connection-date-manager.js
 * Gère la date de connexion pour les événements et ajoute un bouton de réinitialisation
 */

document.addEventListener('DOMContentLoaded', function() {
    // Attendre que la page soit chargée
    setTimeout(() => {
        // Initialiser la date de connexion si elle n'existe pas
        initConnectionDate();
        
        // Ajouter le bouton de réinitialisation si nous sommes sur la page d'actualités
        if (window.location.href.includes('actualites.html')) {
            addResetDateButton();
        }
    }, 1500);
});

/**
 * Initialise la date de connexion si elle n'existe pas déjà
 */
function initConnectionDate() {
    if (!localStorage.getItem('userConnectionDate')) {
        const connectionDate = new Date();
        localStorage.setItem('userConnectionDate', connectionDate.toISOString());
        console.log("Date de connexion initialisée: " + connectionDate.toLocaleString());
    } else {
        const savedDate = new Date(localStorage.getItem('userConnectionDate'));
        console.log("Date de connexion existante: " + savedDate.toLocaleString());
    }
}

/**
 * Ajoute un bouton pour réinitialiser la date de connexion
 */
function addResetDateButton() {
    // Trouver le conteneur des filtres d'événements
    const filterContainer = document.querySelector('#events-section .flex.justify-between.items-center .flex.gap-2');
    
    if (!filterContainer) {
        console.error("Conteneur de filtres non trouvé pour ajouter le bouton de réinitialisation");
        return;
    }
    
    // Ajouter le bouton de réinitialisation
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-connection-date';
    resetButton.className = 'ml-2 text-xs';
    resetButton.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>Réinitialiser date';
    
    filterContainer.appendChild(resetButton);
    
    // Ajouter l'écouteur d'événement
    resetButton.addEventListener('click', function() {
        resetConnectionDate();
        showConfirmationToast("Date de référence mise à jour");
    });
}

/**
 * Réinitialise la date de connexion
 */
function resetConnectionDate() {
    const newDate = new Date();
    localStorage.setItem('userConnectionDate', newDate.toISOString());
    console.log("Date de connexion réinitialisée: " + newDate.toLocaleString());
    
    // Appliquer à nouveau le filtre actif via la fonction exportée
    if (window.resetConnectionDate && typeof window.resetConnectionDate === 'function') {
        window.resetConnectionDate();
    } else {
        // Rafraîchir la page si la fonction n'est pas disponible
        window.location.reload();
    }
}

/**
 * Affiche un message toast de confirmation
 */
function showConfirmationToast(message) {
    // Supprimer tout toast existant
    const existingToast = document.querySelector('.confirmation-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Créer le nouveau toast
    const toast = document.createElement('div');
    toast.className = 'confirmation-toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
    document.body.appendChild(toast);
    
    // Animer l'apparition
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Disparition automatique
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}